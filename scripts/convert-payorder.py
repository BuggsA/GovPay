#!/usr/bin/env python3
"""
Convert the annual pay Executive Order ("Adjustments of Certain Rates of Pay")
into JSON. The order is the official legal source for:
  Schedule 1  General Schedule base pay
  Schedule 4  Senior Executive Service range
  Schedule 5  Executive Schedule
  Schedule 8  Uniformed services monthly basic pay
  Schedule 9  GS locality pay percentages (all areas)

Source: the Federal Register PDF published by GovInfo (GPO), e.g.
  https://www.govinfo.gov/content/pkg/FR-2025-12-23/pdf/2025-23844.pdf   (2026 pay, EO 14368)
  https://www.govinfo.gov/content/pkg/FR-2024-12-30/pdf/2024-31466.pdf   (2025 pay, EO 14132)

The PDF's text layer comes from scanning, so the script cleans common misreads
(B->8, O->0, l->1, stray spaces) and then VALIDATES every table against the
pay rules. It exits non-zero if any check fails, so bad data never lands.

Usage: python3 scripts/convert-payorder.py <order.pdf> <pay-year> <eo-number> <source-url>
Needs: pdftotext (poppler-utils)
"""
import json, re, subprocess, sys
from pathlib import Path

MIL_COLS_A = [0, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18]          # "2 or less" .. "Over 18"
MIL_COLS_B = [20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40]     # "Over 20" .. "Over 40"
NOISE = re.compile(r"Frm 0|Fmt 47|Sfmt|PO 0000|Jkt 2|VerDate|PRESDOC|\.SGM|<GPH>|^\s*\d\d:\d\d ")


def pages(pdf):
    out = subprocess.run(["pdftotext", "-layout", pdf, "-"], check=True, capture_output=True, text=True).stdout
    return [[ln for ln in p.splitlines() if ln.strip() and not NOISE.search(ln)] for p in out.split("\f")]


def money(tok):
    """'$13, BBB. 50' -> 13888.5 ; '-' -> None"""
    t = tok.strip()
    if t in ("-", "—"):
        return None
    t = t.replace("B", "8").replace("O", "0").replace("o", "0").replace("l", "1").replace("I", "1")
    t = re.sub(r"[\s$,]", "", t)
    return float(t)


# Number shapes, tolerant of OCR: digits may read as B/O/l, and stray spaces may
# follow a comma or decimal point ("$13, BBB. 50", "52, 727").
D = r"[\dBOl]"
MONEY_CENTS = rf"\$?\s?\d{D}{{0,2}}(?:,\s?{D}{{3}})*\s?\.\s?{D}\s?{D}"   # 13,888.50
MONEY_INT = rf"\$?\s?\d{D}{{0,2}}(?:,\s?{D}{{3}})+"                     # 52,727
TOKEN = re.compile(rf"{MONEY_CENTS}|{MONEY_INT}|(?<![\w.])-(?![\w.])")


def split_values(rest):
    """Return the row's cells in order: numbers as floats, '-' placeholders as None."""
    return [None if t.strip() == "-" else money(t) for t in TOKEN.findall(rest)]


def find_page(pp, title):
    for i, p in enumerate(pp):
        if any(re.search(title, ln, re.I) for ln in p):
            return i
    raise SystemExit(f"schedule not found: {title}")


def parse_gs(pp):
    p = pp[find_page(pp, r"Schedu[l1]e [1!lI]\W+General Schedule")]
    gs = {}
    for ln in p:
        m = re.match(r"\s*GS-(\d+)\s+(.*)$", ln)
        if m:
            vals = [int(round(v)) for v in split_values(m.group(2))]
            gs[int(m.group(1))] = vals
    return gs


def parse_ses_ex(pp):
    p = pp[find_page(pp, r"Schedu[l1]e [4]\W+Senior Executive")]
    text = "\n".join(p)
    cut = re.search(r"Schedu[l1]e 5", text)
    nums = [money(x) for x in re.findall(r"\$\s?[\d, ]+\d", text[: cut.start()] if cut else text)]
    ses = {"min": int(nums[0]), "maxCertified": int(nums[1]), "maxUncertified": int(nums[3])}
    ex = {}
    for ln in p:
        m = re.match(r"Level\s+(I|II|III|IV|V)\.?\s+\$?([\d, ]+)$", ln.strip())
        if m:
            ex[m.group(1)] = int(money(m.group(2)))
    return ses, ex


def parse_locality(pp):
    p = pp[find_page(pp, r"Schedu[l1]e 9\W+Locality")]
    areas = []
    for ln in p:
        m = re.match(r"\s*(.+?)[\s.]{3,}(\d[\d .]*)%\s*$", ln)   # handles dotted leaders
        if m and not m.group(1).strip().lower().startswith("locality pay area"):
            name = m.group(1).strip()
            name = re.sub(r",\s*co$", ", CO", name)
            name = name.rstrip("*").strip()
            if name.lower().replace(" ", "").rstrip(".") in ("restofu.s", "restofus"):
                name = "Rest of U.S."
            areas.append({"name": name, "pct": float(m.group(2).replace(" ", ""))})
    return areas


YEAR = [None]
CORRECTIONS = [
    # (pay year, grade, from YOS column, monthly value, why)
    (2026, "O-3E", 20, 9609.60, "EO 14368 page 60530: text layer empty for this row; value read from the page image"),
]

GRADE = re.compile(r"^\s*([0O]-?[1l0-9]+E?|W-\d|E-\d)\s*(\*+)?\s+(.*)$")


def norm_grade(g):
    g = g.replace("0-", "O-").replace("l", "1")
    if g.startswith("O") and not g.startswith("O-"):
        g = "O-" + g[1:]
    return g


def parse_mil(pp):
    first = find_page(pp, r"Schedu[l1]e 8\W+Pay of the Uniformed")
    rows = {}
    for p in pp[first: first + 6]:
        text = "\n".join(p)
        if "Part II" in text and "Part I-" not in text:
            break
        cols = MIL_COLS_B if re.search(r"Pay Grade\s+Over 20", text, re.I) else MIL_COLS_A
        seen_e1 = False
        for ln in p:
            m = GRADE.match(ln)
            if not m:
                continue
            g = norm_grade(m.group(1))
            stars = m.group(2) or ""
            if g == "E-1":
                if seen_e1:
                    continue                  # second E-1 row = under 4 months of service; not modeled
                seen_e1 = True
            vals = split_values(m.group(3))
            if len(vals) < len(cols):         # leading '-' printed on the line above (O-1E..O-3E)
                vals = [None] * (len(cols) - len(vals)) + vals
            if len(vals) != len(cols):
                raise SystemExit(f"military row {g} has {len(vals)} cells, expected {len(cols)}: {ln.strip()}")
            rows.setdefault(g, {}).update(dict(zip(cols, vals)))
    # Documented corrections for cells the scan left blank. Each is read from the page
    # image, applied only if the scanned cells are empty, and validated like any other.
    for (yr, g, col_from, value, note) in CORRECTIONS:
        if yr == YEAR[0] and g in rows:
            for c in MIL_COLS_A + MIL_COLS_B:
                if c >= col_from and rows[g].get(c) is None:
                    rows[g][c] = value
            print(f"  correction applied: {yr} {g} over {col_from}+ = {value} ({note})")
    order = ["O-10", "O-9", "O-8", "O-7", "O-6", "O-5", "O-4", "O-3", "O-2", "O-1", "O-3E", "O-2E", "O-1E",
             "W-5", "W-4", "W-3", "W-2", "W-1", "E-9", "E-8", "E-7", "E-6", "E-5", "E-4", "E-3", "E-2", "E-1"]
    cols = MIL_COLS_A + MIL_COLS_B
    missing = [g for g in order if g not in rows]
    if missing:
        raise SystemExit(f"military grades missing: {missing}")
    return {"columns": cols, "rows": {g: [rows[g].get(c) for c in cols] for g in order}}


# ---------------------------------------------------------------- validation
def validate(d):
    errs = []
    gs = d["gs"]
    if sorted(gs) != list(range(1, 16)) or any(len(v) != 10 for v in gs.values()):
        errs.append("GS table shape is not 15 x 10")
    for g, row in gs.items():
        if row != sorted(row):
            errs.append(f"GS-{g} steps are not increasing: {row}")
        if g >= 3:                                   # GS-3..15 have equal step increments
            inc = {row[i + 1] - row[i] for i in range(9)}
            if max(inc) - min(inc) > 1:
                errs.append(f"GS-{g} step increments differ: {sorted(inc)}")
    for g in range(1, 15):
        if gs[g + 1][0] <= gs[g][0]:
            errs.append(f"GS-{g + 1} step 1 not above GS-{g}")
    if abs(d["ses"]["min"] - round(gs[15][0] * 1.2)) > 1:
        errs.append(f"SES minimum {d['ses']['min']} != 120% of GS-15 step 1 ({round(gs[15][0] * 1.2)})")
    ex = d["executiveSchedule"]
    if [ex.get(k) for k in ("I", "II", "III", "IV", "V")] != sorted([ex.get(k) or 0 for k in ("I", "II", "III", "IV", "V")], reverse=True):
        errs.append(f"Executive Schedule not in descending order: {ex}")
    if d["ses"]["maxCertified"] != ex["II"] or d["ses"]["maxUncertified"] != ex["III"]:
        errs.append("SES maximums don't equal EX-II / EX-III")
    loc = d["locality"]
    if not 50 <= len(loc) <= 70 or not any(a["name"] == "Rest of U.S." for a in loc):
        errs.append(f"locality list looks wrong ({len(loc)} areas)")
    for a in loc:
        if not 10 <= a["pct"] <= 60:
            errs.append(f"locality % out of range: {a}")
    mil = d["militaryBasicPay"]
    cap_hi, cap_lo = ex["II"] / 12, ex["V"] / 12
    for g, row in mil["rows"].items():
        vals = [v for v in row if v is not None]
        if not vals:
            errs.append(f"{g} has no values")
            continue
        # Pay never drops with more years, once it starts.
        started = False
        prev = 0
        for v in row:
            if v is None:
                if started:
                    errs.append(f"{g} has a gap after pay starts")
                continue
            started = True
            if v + 0.001 < prev:
                errs.append(f"{g} decreases with years: {prev} -> {v}")
            prev = v
            if abs(v * 10 - round(v * 10)) > 1e-6:
                errs.append(f"{g} value not in dimes: {v}")
        cap = cap_hi if g in ("O-7", "O-8", "O-9", "O-10") else cap_lo
        if max(vals) > cap + 0.1:
            errs.append(f"{g} exceeds its cap ({max(vals)} > {cap:.2f})")
    return errs


NOTES = {
    2025: ["Military rates are those effective January 1, 2025. On April 1, 2025 a further raise for junior "
           "enlisted members (E-1 to E-4, and E-5 in their first years) took effect; it is not in this order."],
}


def bundle(folder):
    """Write shared/data/payorder.js with every year on disk, for the browser."""
    years = {}
    for f in sorted(folder.glob("*.json")):
        d = json.loads(f.read_text())
        years[d["payYear"]] = d
    js = folder.parents[1] / "shared" / "data" / "payorder.js"
    js.parent.mkdir(parents=True, exist_ok=True)
    js.write_text("/* Generated by scripts/convert-payorder.py from the annual pay Executive Orders. Do not edit by hand. */\n"
                  "(function (g) { (g.GOVPAY_DATA = g.GOVPAY_DATA || {}).payOrder = "
                  + json.dumps(years, separators=(",", ":")) + "; })(typeof window !== 'undefined' ? window : globalThis);\n")


def main():
    pdf, year, eo, url = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
    YEAR[0] = year
    pp = pages(pdf)
    ses, ex = parse_ses_ex(pp)
    data = {
        "payYear": year,
        "source": f"Executive Order {eo}, Adjustments of Certain Rates of Pay (Federal Register, via GovInfo)",
        "sourceUrl": url,
        "gs": parse_gs(pp),
        "ses": ses,
        "executiveSchedule": ex,
        "locality": parse_locality(pp),
        "militaryBasicPay": parse_mil(pp),
    }
    errs = validate(data)
    if errs:
        print("VALIDATION FAILED:\n  " + "\n  ".join(errs))
        sys.exit(1)
    out = Path(__file__).resolve().parent.parent / "data" / "payorder" / f"{year}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    data["gs"] = {str(k): v for k, v in data["gs"].items()}
    data["notes"] = NOTES.get(year, [])
    out.write_text(json.dumps(data, indent=1) + "\n")
    bundle(out.parent)
    print(f"{year}: ok -> {out.relative_to(out.parents[2])}  (GS 15x10, {len(data['locality'])} locality areas, "
          f"{len(data['militaryBasicPay']['rows'])} military grades)")


if __name__ == "__main__":
    main()
