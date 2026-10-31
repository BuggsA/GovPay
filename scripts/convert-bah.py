#!/usr/bin/env python3
"""
Convert DTMO's BAH rate files into the engine's housing allowance data.

Input:  data/raw/dtmo/BAH-ASCII-<year>.zip   (DTMO "BAH ASCII" downloads, committed as received)
        Census 2020 ZCTA-to-county relationship file and ACS 2020-2024 ZCTA population (downloaded)
Output: data/bah/<year>.json   full rates and the ZIP -> housing area list
        shared/data/bah.js     GOVPAY_DATA.bah: rates by housing area (MHA), MHA names, each county's
                               MHA (in data/places/counties.json order) and each researched base's MHA

The ZIPs hold several versions of the same file (DTMO reissued some mid-year and kept "old" copies);
the newest by its date inside the ZIP wins, and the script prints which one it used.

A county gets the MHA that covers most of its people: each ZIP area's population is split across
counties by land area, then summed by MHA. ZIPs DTMO marks "XX" (unknown, territories) are skipped.

Usage: python3 scripts/convert-bah.py [census-cache-dir]
"""
import json, re, sys, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
YEARS = [2025, 2026]
# DTMO column order (ASCII-FILE-FORMAT.pdf lists E1..O7; files carry O8-O10 too, always equal to O7)
GRADES = ["E-1", "E-2", "E-3", "E-4", "E-5", "E-6", "E-7", "E-8", "E-9", "W-1", "W-2", "W-3", "W-4", "W-5",
          "O-1E", "O-2E", "O-3E", "O-1", "O-2", "O-3", "O-4", "O-5", "O-6", "O-7", "O-8", "O-9", "O-10"]
# A ZIP inside each researched place in the app (shared/govpay.js FOCUS list)
FOCUS_ZIP = {
    "dc": "20301", "fort-belvoir": "22060", "quantico": "22134", "dahlgren": "22448", "norfolk": "23511",
    "langley-eustis": "23665", "richmond": "23219", "fort-gregg-adams": "23801", "fort-meade": "20755",
    "annapolis": "21402", "andrews": "20762", "aberdeen": "21005", "baltimore": "21202", "pax-river": "20670",
    "fort-detrick": "21702", "philadelphia": "19107", "pittsburgh": "15222", "carlisle": "17013",
    "mechanicsburg": "17055", "harrisburg": "17101", "hill-afb": "84056", "salt-lake-city": "84101",
    "dugway": "84022", "park-city": "84060",
}
CENSUS = {
    "rel": "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt",
    "pop": "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b01003.dat",
}


def fetch(url, cache):
    p = cache / Path(url).name
    if not p.exists():
        print("downloading", url)
        urllib.request.urlretrieve(url, p)
    return p


def newest(z, pattern):
    """The most recently dated entry in the ZIP whose name matches."""
    cands = [i for i in z.infolist() if re.search(pattern, i.filename, re.I)]
    if not cands:
        raise SystemExit(f"no file matching {pattern} in {z.filename}")
    pick = max(cands, key=lambda i: i.date_time)
    tied = [i for i in cands if i.date_time == pick.date_time]
    if len({z.read(i) for i in tied}) > 1:          # same date, different contents: a person has to decide
        raise SystemExit(f"{z.filename}: {[i.filename for i in tied]} share the newest date but differ")
    return pick, z.read(pick).decode("latin-1").replace("\r", "")


def read_year(year):
    yy = str(year)[2:]
    z = zipfile.ZipFile(ROOT / f"data/raw/dtmo/BAH-ASCII-{year}.zip")
    used = {}
    rates = {}
    for kind, pat in (("with", rf"^bahw_?{yy}"), ("without", rf"^bahwo_?{yy}")):
        info, text = newest(z, pat)
        used[kind] = f"{info.filename} ({'-'.join(f'{n:02d}' for n in info.date_time[:3])})"
        for line in text.splitlines():
            if not line.strip():
                continue
            f = line.split(",")
            vals = [float(x) for x in f[1:]]
            if len(vals) != len(GRADES):
                raise SystemExit(f"{year} {kind} {f[0]}: {len(vals)} rates, expected {len(GRADES)}")
            if len(set(vals[-4:])) != 1:
                raise SystemExit(f"{year} {kind} {f[0]}: O-8 to O-10 differ from O-7")
            rates.setdefault(f[0], {})[kind] = [round(v) for v in vals]
    _, names_txt = newest(z, rf"^mhanames{yy}")
    names = dict(l.split(";", 1) for l in names_txt.splitlines() if ";" in l)
    _, zips_txt = newest(z, rf"^sorted_zipmha{yy}")
    zips = dict(l.split() for l in zips_txt.splitlines() if l.strip())
    for m, r in rates.items():
        assert "with" in r and "without" in r, m
        assert all(w >= wo for w, wo in zip(r["with"], r["without"])), f"{year} {m}: without-dependents above with"
        assert all(v > 500 for v in r["with"] + r["without"]), f"{year} {m}: implausible rate"
    return {"used": used, "rates": rates, "names": {k.strip(): v.strip() for k, v in names.items()}, "zips": zips}


def pretty(code, name):
    if code.startswith("ZZ"):
        return f"Rural area (county cost group {code[2:]})"
    small = {"AFB", "NAS", "NSA", "JB", "MCB", "MCAS", "USCG", "NB", "DC", "II"}
    def word(w):
        core = w.strip(",/()")
        if len(core) == 2 and core.isalpha() and w.endswith((",", "")) and core.upper() == core and w is words[-1]:
            return w                       # trailing state code
        if core.upper() in small:
            return w
        return "/".join(p.capitalize() if not p.upper() in small else p for p in w.split("/"))
    words = name.split()
    return " ".join(word(w) for w in words)


def main():
    cache = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/census")
    cache.mkdir(parents=True, exist_ok=True)
    data = {y: read_year(y) for y in YEARS}
    latest = data[YEARS[-1]]
    for y in YEARS:
        print(f"{y}: {len(data[y]['rates'])} housing areas, {len(data[y]['zips']):,} ZIPs; using {data[y]['used']['with']} and {data[y]['used']['without']}")

    # ---- each county's MHA, population-weighted over its ZIP areas (latest year's ZIP list)
    pop = {}
    for line in fetch(CENSUS["pop"], cache).read_text().splitlines():
        if line.startswith("860Z200US"):
            g, e, _ = line.split("|")
            pop[g[9:]] = int(e)
    weight, zip_best = {}, {}
    for line in fetch(CENSUS["rel"], cache).read_text(encoding="utf-8-sig").splitlines()[1:]:
        f = line.split("|")
        zcta, county, land_z, land_part = f[1], f[9], f[3], f[16]   # AREALAND_ZCTA5_20, AREALAND_PART
        if not zcta or not county:
            continue
        mha = latest["zips"].get(zcta)
        if not mha or mha.startswith("XX") or mha not in latest["rates"]:
            continue
        share = (int(land_part) / int(land_z)) if land_z and int(land_z) else 0
        w = pop.get(zcta, 0) * share + share * 1e-3          # area breaks ties where nobody lives
        weight.setdefault(county, {}).setdefault(mha, 0)
        weight[county][mha] += w
        if w > zip_best.get(zcta, (0, ""))[0]:
            zip_best[zcta] = (w, county)                     # the ZIP's main county: where most of its people live
    counties = json.loads((ROOT / "data/places/counties.json").read_text())["counties"]
    county_mha, missing = [], []
    for c in counties:
        w = weight.get(c[0])
        if not w:
            county_mha.append("")
            missing.append(f"{c[1]}, {c[2]}")
            continue
        county_mha.append(max(w, key=w.get))

    focus = {}
    for pid, z in FOCUS_ZIP.items():
        m = latest["zips"].get(z)
        assert m and m in latest["rates"], (pid, z, m)
        focus[pid] = m

    # ---- checks against facts we know
    nm = lambda m: latest["names"].get(m, "")
    cm = {c[0]: county_mha[i] for i, c in enumerate(counties)}
    assert "QUANTICO" in nm(focus["quantico"]), nm(focus["quantico"])
    assert "NORFOLK" in nm(focus["norfolk"]), nm(focus["norfolk"])
    assert focus["dc"] == "DC053" and cm["51059"] == "DC053" and cm["24031"] == "DC053"      # Fairfax, Montgomery
    assert "SAN DIEGO" in nm(cm["06073"]) and "HOUSTON" in nm(cm["48201"]), (nm(cm["06073"]), nm(cm["48201"]))
    assert "COLORADO SPRINGS" in nm(cm["08041"]), nm(cm["08041"])
    assert len(missing) < 15, missing

    # ---- outputs
    (ROOT / "data/bah").mkdir(exist_ok=True)
    # ZIP -> [housing area, main county FIPS] for the ZIP lookup (county "" for ZIPs with no Census ZIP area,
    # such as PO-box-only ZIPs; the app then uses a county in the same housing area)
    cidx = {c[0] for c in counties}
    zip_out = {z: [m, zip_best[z][1] if z in zip_best and zip_best[z][1] in cidx else ""] for z, m in sorted(latest["zips"].items()) if m in latest["rates"]}
    assert zip_out["92136"][0] == "CA038" and zip_out["92136"][1] == "06073", zip_out["92136"]     # Naval Base San Diego
    (ROOT / f"data/bah/zips-{YEARS[-1]}.json").write_text(json.dumps({"year": YEARS[-1], "note": "ZIP: [DTMO housing area, main county FIPS]", "zips": zip_out}, separators=(",", ":")) + "\n")
    print(f"ZIP lookup: {len(zip_out):,} ZIPs, {sum(1 for v in zip_out.values() if v[1]):,} with a county")
    for y in YEARS:
        d = data[y]
        (ROOT / f"data/bah/{y}.json").write_text(json.dumps({
            "year": y, "source": "DTMO BAH rate files (ASCII)", "files": d["used"], "grades": GRADES,
            "rates": d["rates"], "names": d["names"], "zips": d["zips"]}, separators=(",", ":")) + "\n")
    # browser: 24 rates per row (O-8 to O-10 repeat O-7), with then without dependents
    doc = {
        "source": "DTMO BAH rate files (ASCII), 2025 and 2026; county mapping from Census 2020 ZCTA-county relationship and ACS 2020-2024 ZCTA population",
        "grades": GRADES[:24],
        "years": {str(y): {"files": data[y]["used"], "rates": {m: r["with"][:24] + r["without"][:24] for m, r in sorted(data[y]["rates"].items())}} for y in YEARS},
        "names": {m: pretty(m, n) for m, n in sorted(latest["names"].items()) if m in latest["rates"]},
        "county": ",".join(county_mha),
        "focus": focus,
    }
    js = ("/* Generated by scripts/convert-bah.py from DTMO's BAH rate files. Do not edit by hand. */\n"
          "(function (g) { (g.GOVPAY_DATA = g.GOVPAY_DATA || {}).bah = " + json.dumps(doc, separators=(",", ":")) +
          "; })(typeof window !== \"undefined\" ? window : globalThis);\n")
    (ROOT / "shared/data/bah.js").write_text(js)
    print(f"counties mapped: {len(counties) - len(missing)}/{len(counties)}; without a ZIP area: {', '.join(missing) or 'none'}")
    print("bases:", ", ".join(f"{k} {v}" for k, v in focus.items()))


if __name__ == "__main__":
    main()
