#!/usr/bin/env python3
"""
Build the county list that tells the app, for every U.S. county (and county
equivalent), which GS locality area and which per diem area it belongs to.

Sources (official):
  GS locality areas   5 CFR 531.603(b), eCFR API (each area = a metro CSA/MSA plus listed counties)
  Metro areas         OMB/Census delineation file, March 2020 (list1_2020.xls)
  County list         Census national_county2020.txt (FIPS codes and names)
  Per diem areas      data/perdiem/FY*.json (GSA Per Diem API)

Output: data/places/counties.json and shared/data/places.js (window.GOVPAY_DATA.places)

Usage: python3 scripts/build-places.py <ecfr531.xml> <list1_2020.xls> <national_county2020.txt>
Needs: xlrd (pip install xlrd)
"""
import html, json, re, sys
from pathlib import Path

import xlrd

ROOT = Path(__file__).resolve().parent.parent
# Spelling differences in GSA's county text, corrected to the Census county name.
GSA_TYPOS = {("MD", "Queen Anne"): "Queen Anne's", ("NH", "Caroll"): "Carroll"}
STATE_NAMES = {}


def norm(s):
    """Compare titles across sources: dashes, case, punctuation."""
    s = s.replace("—", "-").replace("–", "-").replace("--", "-")
    return re.sub(r"[^a-z0-9]", "", s.lower())


def load_counties(path):
    rows = []
    for line in Path(path).read_text().splitlines()[1:]:
        st, sfp, cfp, _ns, name, _cls, stat = line.split("|")
        if stat not in ("A", "B", "C", "F", "N", "S", "I") or sfp in ("60", "66", "69", "72", "74", "78"):
            continue  # keep the 50 states + DC; territories are OCONUS (later)
        rows.append({"fips": sfp + cfp, "state": st, "name": name})
    return rows


def load_delineation(path):
    s = xlrd.open_workbook(path).sheet_by_index(0)
    head = s.row_values(2)
    ix = {h: i for i, h in enumerate(head)}
    csa, cbsa = {}, {}
    for r in range(3, s.nrows):
        v = s.row_values(r)
        if not v[ix["FIPS State Code"]]:
            continue
        fips = str(v[ix["FIPS State Code"]]).zfill(2) + str(v[ix["FIPS County Code"]]).zfill(3)
        if v[ix["CSA Title"]]:
            csa.setdefault(norm(v[ix["CSA Title"]]), set()).add(fips)
        cbsa.setdefault(norm(v[ix["CBSA Title"]]), set()).add(fips)
    return csa, cbsa


def parse_cfr(path):
    t = html.unescape(re.sub(r"<[^>]+>", " ", Path(path).read_text(encoding="utf-8")))
    t = re.sub(r"\s+", " ", t)
    body = t[t.find("(b) The following"):]
    items = re.findall(r"\((\d+)\) (.+?)—consisting of (.+?)(?=; (?:and )?\(\d+\) |\. \[|$)", body)
    out = []
    for num, name, defn in items:
        core = re.findall(r"the (.+?) (CSA|MSA)\b", defn.split("also including")[0])
        state_only = re.match(r"the State of (\w+)", defn)
        extras = []
        if "also including" in defn:
            tail = defn.split("also including", 1)[1]
            extras = re.findall(r"([A-Z][A-Za-z.' \-]+? (?:County|Parish|city|City|Borough|Census Area|Municipality|City and Borough)), ([A-Z]{2})", tail)   # "City": Carson City, NV
        out.append({"num": int(num), "name": name.strip(), "core": core, "state": state_only.group(1) if state_only else None,
                    "extras": [(n.strip(), st) for n, st in extras], "rest": "Rest of U.S" in name})
    return out


def main():
    ecfr, xls, cty = sys.argv[1:4]
    counties = load_counties(cty)
    by_state = {}
    for c in counties:
        by_state.setdefault(c["state"], {})[c["name"].lower()] = c["fips"]
    csa, cbsa = load_delineation(xls)
    cfr = parse_cfr(ecfr)
    order = json.loads((ROOT / "data/payorder/2026.json").read_text())
    pay_names = {norm(a["name"]): a["name"] for a in order["locality"]}

    problems, area_of = [], {}
    for a in cfr:
        name = pay_names.get(norm(a["name"]))
        if not name:
            problems.append(f"area name not in pay order: {a['name']}")
            continue
        a["pay_name"] = name
        if a["rest"]:
            continue
        members, explicit = set(), set()
        if a["state"]:
            st = {"Alaska": "AK", "Hawaii": "HI"}[a["state"]]
            members |= {c["fips"] for c in counties if c["state"] == st}
        for title, kind in a["core"]:
            key = norm(title)
            hit = (csa if kind == "CSA" else cbsa).get(key) or cbsa.get(key) or csa.get(key)
            if not hit:
                problems.append(f"{kind} not found in 2020 delineation: {title}")
            else:
                members |= hit
        for cname, st in a["extras"]:
            f = by_state.get(st, {}).get(cname.lower())
            if not f:
                problems.append(f"extra county not found: {cname}, {st} ({name})")
            else:
                explicit.add(f)
        a["members"], a["explicit"] = members, explicit
    # Metro membership first, then explicitly listed counties, which win (OPM names
    # them to move a county out of the metro area's default locality area).
    for a in cfr:
        for f in a.get("members", ()):
            if f in area_of and area_of[f] != a["pay_name"]:
                problems.append(f"county {f} in two metro-based areas: {area_of[f]} / {a['pay_name']}")
            area_of[f] = a["pay_name"]
    moved = []
    for a in cfr:
        for f in a.get("explicit", ()):
            if f in area_of and area_of[f] != a["pay_name"]:
                moved.append(f"{f}: {area_of[f]} -> {a['pay_name']}")
            area_of[f] = a["pay_name"]
    rest = next(a["pay_name"] for a in cfr if a["rest"] and "pay_name" in a)

    # ---- per diem: county text -> FIPS, newest fiscal year wins
    pd_of, pd_unmatched = {}, []
    fy_files = sorted((ROOT / "data/perdiem").glob("FY*.json"))
    for fy in fy_files:
        d = json.loads(fy.read_text())
        for ar in d["areas"]:
            st, text = ar["state"], (ar["county"] or "")
            hits = set()
            if ar["city"] == "District of Columbia":
                hits |= {"11001", by_state["VA"]["alexandria city"], by_state["VA"]["falls church city"], by_state["VA"]["fairfax city"],
                         by_state["VA"]["arlington county"], by_state["VA"]["fairfax county"], by_state["MD"]["montgomery county"], by_state["MD"]["prince george's county"]}
            else:
                text = re.sub(r"\b(excluding|less the city of|less)\b.*?(?=/|,|;|$)", "", text, flags=re.I)
                parts = []
                for part in re.split(r"\s*/\s*|\s*,\s*|;", text):
                    part = part.strip()
                    whole = re.sub(r"\s+(counties|county|parishes|parish|borough)$", "", part, flags=re.I).strip().lower()
                    parts += [part] if (whole + " county") in by_state.get(st, {}) else re.split(r"\s+and\s+", part)
                for tok in parts:
                    tok = GSA_TYPOS.get((st, tok.strip()), tok.strip())
                    if not tok:
                        continue
                    city = re.match(r"^(?:city(?: limits)? of )(.+)$", tok, re.I) or re.match(r"^(.+?) city$", tok, re.I)
                    base = re.sub(r"\s+(counties|county|parishes|parish|borough)$", "", tok, flags=re.I).strip()
                    names = by_state.get(st, {})
                    cand = []
                    if city:
                        cand = [city.group(1).lower() + " city"]
                    cand += [base.lower() + " county", base.lower() + " parish", base.lower() + " borough", base.lower() + " city and borough", base.lower() + " municipality", base.lower(),
                             base.lower().replace("st.", "st").replace("saint", "st.") + " county", base.lower().replace("st ", "st. ") + " county"]
                    f = next((names[c] for c in cand if c in names), None)
                    if f:
                        hits.add(f)
                    elif not city:   # a town inside a county can't be matched at county level; the county keeps its own rate
                        pd_unmatched.append(f"{st}: '{tok}' ({ar['city']})")
            pid = "DC:District of Columbia" if ar["city"] == "District of Columbia" else ar["id"]
            for f in hits:
                pd_of[f] = pid           # later FY files overwrite earlier ones

    rows = []
    areas = sorted({a["pay_name"] for a in cfr if "pay_name" in a})
    aidx = {n: i for i, n in enumerate(areas)}
    for c in counties:
        rows.append([c["fips"], c["name"], c["state"], aidx[area_of.get(c["fips"], rest)], pd_of.get(c["fips"])])
    out = {
        "source": "5 CFR 531.603(b) (eCFR, Oct 29 2026) · OMB/Census delineation March 2020 · Census county list 2020 · GSA per diem FY2025-FY2027",
        "note": "Locality areas are defined by metro areas plus listed counties. Edge counties should be checked against OPM's published definitions.",
        "areas": areas, "counties": rows,
    }
    (ROOT / "data/places").mkdir(parents=True, exist_ok=True)
    (ROOT / "data/places/counties.json").write_text(json.dumps(out, indent=0) + "\n")
    (ROOT / "shared/data/places.js").write_text("/* Generated by scripts/build-places.py. Do not edit by hand. */\n(function (g) { (g.GOVPAY_DATA = g.GOVPAY_DATA || {}).places = "
                                                + json.dumps(out, separators=(",", ":")) + "; })(typeof window !== 'undefined' ? window : globalThis);\n")
    in_area = sum(1 for r in rows if areas[r[3]] != rest)
    print(f"{len(rows)} counties · {in_area} in a named locality area · {sum(1 for r in rows if r[4])} with a special per diem rate")
    print(f"{len(problems)} locality problems:"); [print("  ", p) for p in problems[:40]]
    print(f"{len(moved)} counties moved by an explicit listing:"); [print("  ", m) for m in moved]
    print(f"{len(pd_unmatched)} per diem tokens not matched (first 25):"); [print("  ", p) for p in sorted(set(pd_unmatched))[:25]]


if __name__ == "__main__":
    main()
