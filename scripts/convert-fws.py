#!/usr/bin/env python3
"""
Convert DCPAS Federal Wage System (trades) data into the engine's wage schedules.

Input:  data/raw/dcpas/wagedata/*wfa.dat   appropriated-fund rate files (scripts/fetch-fws.py)
        data/raw/dcpas/fws-counties.json   each county's wage area and schedule code (DCPAS form)
        data/places/counties.json          the app's county list (same order as shared/data/places.js)
Output: shared/data/fws.js       GOVPAY_DATA.fws: the schedule in effect for 2025 and 2026 in each code,
                                 wage area names, and each county's schedule code

Rate file records (00readme.txt): area|type data|survey|type schedule|level|grade|step1||step2||...|step5||effective|
Kept: type data R, type schedule 1 (regular) or 2 (regular/Monroney); levels 1 = WG, 2 = WL, 3 = WS.
A year's schedule is that fiscal year's survey schedule (survey 26x = FY2026), the newest if there are several.

Usage: python3 scripts/convert-fws.py
"""
import datetime as dt, html, json, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw/dcpas"
LEVEL = {"1": "WG", "2": "WL", "3": "WS"}
MON = {m: i + 1 for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}
# Alaska is defined by road distance (80 km / 50 miles) from Anchorage, Fairbanks and Juneau, not by county.
AK_NEAR = {"02020", "02170", "02090", "02110"}   # Anchorage, Matanuska-Susitna, Fairbanks North Star, Juneau
# DCPAS county list quirks: an old name, counties listed under a neighboring state's wage area, and one
# county the form leaves out (5 CFR 532 App. C puts Allen County, IN in the Fort Wayne-Marion survey area, 049).
ALIAS = {("SD", "oglalalakotacounty"): ("SD", "shannoncounty"),
         ("WI", "florencecounty"): ("MI", "florencecounty"), ("WI", "marinettecounty"): ("MI", "marinettecounty")}
OVERRIDE = {("IN", "allencounty"): "049"}


def ckey(name):
    """'Doña Ana County' = 'Dona Ana County'; 'De Kalb' = 'DeKalb'; 'Mc Kean' = 'McKean'."""
    n = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z]", "", n)


def day(s):
    s = s.strip()
    m = re.fullmatch(r"(\d{1,2})-?([A-Za-z]{3})-?(\d{4})", s)
    return dt.date(int(m.group(3)), MON[m.group(2).title()], int(m.group(1)))


def file_day(name):
    m = re.match(r"(\d{4})([A-Za-z]{3})(\d{2})", name)
    return dt.date(int(m.group(1)), MON[m.group(2)], int(m.group(3)))


def main():
    # ---- every regular schedule, later issue files overriding earlier ones for the same code + date
    sched = {}
    for f in sorted((RAW / "wagedata").glob("*wfa.dat"), key=lambda p: file_day(p.name)):
        for line in f.read_text(encoding="latin-1").splitlines():
            p = [x.strip() for x in line.split("|")]
            if len(p) < 17 or p[1] != "R" or p[3] not in ("1", "2") or p[4] not in LEVEL:
                continue
            code, eff = p[0].zfill(3), day(p[16]).isoformat()
            key = (code, eff)
            s = sched.setdefault(key, {"type": p[3], "survey": p[2], "file": f.name, "WG": {}, "WL": {}, "WS": {}})
            if s["type"] == "1" and p[3] == "2":
                continue                              # both kinds on one date (rare): keep the regular one
            if p[3] == "1" and s["type"] == "2":
                s.update({"type": "1", "WG": {}, "WL": {}, "WS": {}})
            s["file"] = f.name
            s[LEVEL[p[4]]][int(p[5])] = [round(float(p[i]) * 100) for i in (6, 8, 10, 12, 14)]
    for (code, eff), s in sched.items():
        assert len(s["WG"]) == 15 and len(s["WL"]) == 15 and len(s["WS"]) == 19, (code, eff, len(s["WG"]), len(s["WL"]), len(s["WS"]))
        for lvl in ("WG", "WL", "WS"):
            for g, r in s[lvl].items():
                assert all(a <= b for a, b in zip(r, r[1:])), (code, eff, lvl, g, r)

    counties_doc = json.loads((RAW / "fws-counties.json").read_text())
    # A year means that fiscal year's survey schedule: survey "261"/"262" = FY2026 (first two digits), the newest
    # effective one if a wage area has several (DC: 19 Oct 2025 and 1 Jul 2026). Wage areas run on their own
    # calendars (Alaska's FY2026 schedule took effect 20 Sep 2026), so a calendar cut-off would mix years.
    codes = sorted({c for c, _ in sched})
    years = {}
    for y in (2025, 2026):
        ys = {}
        for code in codes:
            effs = sorted(e for (c, e), s in sched.items() if c == code and s["survey"].zfill(3)[:2] == str(y)[2:])
            if effs:
                ys[code] = effs[-1]
        years[y] = ys
    # ---- wage area names and each county's schedule code
    names, by_county = {}, {}
    for st, d in counties_doc["states"].items():
        for v, label in d["SelectedWageArea"]:
            names[v] = html.unescape(label.split(" - ", 1)[1])
        for v, label in d["SelectedCounty"]:
            area, code, gs, county = html.unescape(v).split(",", 3)
            label = html.unescape(label)
            partial = bool(re.search(r"(?i)\bonly includes\b", label))
            by_county.setdefault((st, ckey(county)), []).append((partial, code, area, label))
    places = json.loads((ROOT / "data/places/counties.json").read_text())["counties"]
    county_code, notes, missing = [], {}, []
    for fips, name, st, _ai, _pd in places:
        if st == "AK":
            county_code.append("007" if fips in AK_NEAR else "207")
            continue
        k = (st, ckey(name))
        if k in OVERRIDE:
            county_code.append(OVERRIDE[k])
            continue
        opts = by_county.get(ALIAS.get(k, k))
        if not opts:
            county_code.append("")
            missing.append(f"{name}, {st}")
            continue
        whole = [o for o in opts if not o[0]] or opts
        county_code.append(whole[0][1])
        if len(opts) > 1:
            notes[fips] = "; ".join(o[3] for o in opts)
    used = {c for c in county_code if c}
    no_rates = sorted(c for c in used if c not in years[2026])
    assert not missing, missing
    assert not no_rates, f"schedule codes with no rates: {no_rates}"

    # ---- spot checks against the raw sample in DCPAS's readme layout
    wa = years[2026]["027"]
    print("DC area (027) WG-10 step 2 2026:", sched[("027", wa)]["WG"][10][1] / 100, "effective", wa)

    out = {"source": "DCPAS Wage and Salary Division, appropriated fund FWS schedules", "fetchedAt": counties_doc["fetchedAt"],
           "schedules": {f"{c}|{e}": s for (c, e), s in sorted(sched.items())}}
    # (data/fws/schedules.json is not written: the raw files are committed and fws.js holds what the app uses)

    # browser: per year, code -> [effective, WG rows, WL rows, WS rows]; a row is "step1,+d2,+d3,+d4,+d5" in cents
    def rows(m, n):
        return ";".join(",".join([str(r[0])] + [str(b - a) for a, b in zip(r, r[1:])]) for r in (m[g] for g in range(1, n + 1)))
    area_of = {}
    for st, d in counties_doc["states"].items():
        for v, _ in d["SelectedCounty"]:
            a, c = html.unescape(v).split(",")[:2]
            area_of.setdefault(c, a)
    doc = {
        "source": out["source"], "fetchedAt": out["fetchedAt"],
        "areas": {c: names.get(area_of.get(c, c), "") for c in sorted(used | set(years[2025]) | set(years[2026])) if area_of.get(c) or c in names},
        "areaOf": area_of,
        "years": {str(y): {c: [e, rows(sched[(c, e)]["WG"], 15), rows(sched[(c, e)]["WL"], 15), rows(sched[(c, e)]["WS"], 19)]
                           for c, e in ys.items() if c in used} for y, ys in years.items()},
        "county": ",".join(county_code),
    }
    js = ("/* Generated by scripts/convert-fws.py from DCPAS wage data. Do not edit by hand. */\n"
          "(function (g) { (g.GOVPAY_DATA = g.GOVPAY_DATA || {}).fws = " + json.dumps(doc, separators=(",", ":")) +
          "; })(typeof window !== \"undefined\" ? window : globalThis);\n")
    (ROOT / "shared/data/fws.js").write_text(js)
    print(f"{len(sched)} schedules ({len(codes)} codes); in use: {len(used)} codes; 2025: {len(doc['years']['2025'])}, 2026: {len(doc['years']['2026'])}")
    print(f"counties: {len(places) - len(missing)} mapped, missing: {missing}; {len(notes)} split across schedules")


if __name__ == "__main__":
    main()
