#!/usr/bin/env python3
"""Convert Tax Foundation's state income tax workbook into the take-home engine's data.

Input:  data/raw/taxfoundation/2026-State-Individual-Income-Tax-Rates-Brackets.xlsx
        (https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/, sheet "2026")
Output: data/tax/2026.json and shared/data/statetax.js (GOVPAY_DATA.stateTax)

Each state gets single and married-joint brackets as [upTo, rate] (the last upTo is null =
no limit), a standard deduction, a personal exemption (an amount, or a credit when the table
says "$x credit"), and its Tax Foundation footnote letters. Income below a state's first
bracket (Delaware's first $2,000, for example) is taxed at 0%.

Run: python3 scripts/convert-statetax.py   (needs openpyxl)
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
YEAR = 2026
SRC = ROOT / f"data/raw/taxfoundation/{YEAR}-State-Individual-Income-Tax-Rates-Brackets.xlsx"
URL = "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/"

ABBR = {
    "Ala.": "AL", "Alaska": "AK", "Ariz.": "AZ", "Ark.": "AR", "Calif.": "CA", "Colo.": "CO", "Conn.": "CT", "Del.": "DE",
    "Fla.": "FL", "Ga.": "GA", "Hawaii": "HI", "Idaho": "ID", "Ill.": "IL", "Ind.": "IN", "Iowa": "IA", "Kans.": "KS",
    "Ky.": "KY", "La.": "LA", "Maine": "ME", "Md.": "MD", "Mass.": "MA", "Mich.": "MI", "Minn.": "MN", "Miss.": "MS",
    "Mo.": "MO", "Mont.": "MT", "Nebr.": "NE", "Nev.": "NV", "N.H.": "NH", "N.J.": "NJ", "N.M.": "NM", "N.Y.": "NY",
    "N.C.": "NC", "N.D.": "ND", "Ohio": "OH", "Okla.": "OK", "Ore.": "OR", "Pa.": "PA", "R.I.": "RI", "S.C.": "SC",
    "S.D.": "SD", "Tenn.": "TN", "Tex.": "TX", "Utah": "UT", "Vt.": "VT", "Va.": "VA", "Wash.": "WA", "W.Va.": "WV",
    "Wis.": "WI", "Wyo.": "WY", "D.C.": "DC",
}
# Washington taxes capital gains only, so wages are untaxed.
WAGES_UNTAXED = {"WA"}


def blank(v):
    return v is None or (isinstance(v, str) and not v.strip())


def money(v):
    """Number, '$153 credit' -> ('credit', 153), 'n.a.' / blank -> None."""
    if blank(v):
        return None
    if isinstance(v, (int, float)):
        return ("amount", float(v))
    s = v.strip().lower()
    m = re.match(r"^\$([\d,]+)\s*credit$", s)
    if m:
        return ("credit", float(m.group(1).replace(",", "")))
    if s.startswith("n.a") or s == "none":
        return None
    raise ValueError(f"unexpected cell {v!r}")


def to_brackets(rows):
    """[(rate, over)] -> [[upTo, rate]] with a 0% band below the first threshold."""
    rows = sorted(rows, key=lambda r: r[1])
    out = []
    if rows and rows[0][1] > 0:
        out.append([rows[0][1], 0.0])
    for i, (rate, over) in enumerate(rows):
        nxt = rows[i + 1][1] if i + 1 < len(rows) else None
        out.append([nxt, round(rate, 6)])
    return out


def main():
    ws = openpyxl.load_workbook(SRC, data_only=True, read_only=True)[str(YEAR)]
    states, cur = {}, None
    for r in ws.iter_rows(values_only=True, max_col=12):
        first = r[0]
        if isinstance(first, str) and first.strip().startswith("("):
            if re.match(r"^\([a-z, ]+\)\s*$", first.strip()) and cur:      # footnote letters on the 2nd line
                cur["notes"] += re.findall(r"[a-z]+", first)
            else:
                break                                                        # the footnote text starts
        elif isinstance(first, str) and first.strip():
            m = re.match(r"^([A-Za-z. ]+?)\s*(\(([a-z, ]+)\))?\s*$", first.strip())
            name = m.group(1).strip()
            if name not in ABBR:
                if cur is None:          # header rows above the first state
                    continue
                raise SystemExit(f"unknown state label {first!r}")
            cur = {"st": ABBR[name], "label": name, "notes": re.findall(r"[a-z]+", m.group(3) or ""),
                   "single": [], "mfj": [], "std": None, "exemption": None, "none": False}
            states[cur["st"]] = cur
            if isinstance(r[1], str) and r[1].strip().lower() in ("none", "capital gains income only"):
                cur["none"] = True
            cur["std"] = (money(r[7]), money(r[8]))
            cur["exemption"] = (money(r[9]), money(r[10]))
        if cur is None:
            continue
        if isinstance(r[1], (int, float)) and r[2] == ">":
            cur["single"].append((float(r[1]), float(r[3])))
        if isinstance(r[4], (int, float)) and r[5] == ">":
            cur["mfj"].append((float(r[4]), float(r[6])))
        if cur["st"] == "WA" and isinstance(r[7], (int, float)) and cur["std"] == (None, None):
            cur["std"] = (money(r[7]), money(r[8]))

    out = {}
    for st, s in sorted(states.items()):
        none = s["none"] or st in WAGES_UNTAXED
        rec = {"none": True} if none else {
            "single": to_brackets(s["single"]),
            "mfj": to_brackets(s["mfj"] or s["single"]),
        }
        if not none:
            for key, (a, b) in (("std", s["std"]), ("exemption", s["exemption"])):
                if a is None and b is None:
                    continue
                kind = (a or b)[0]
                vals = {"single": a[1] if a else 0, "mfj": b[1] if b else (a[1] if a else 0)}
                rec[key + ("Credit" if kind == "credit" else "")] = vals
        rec["notes"] = s["notes"]
        out[st] = rec

    if len(out) != 51:
        raise SystemExit(f"expected 50 states + DC, got {len(out)}")
    # Sanity checks against cells read by hand from the table.
    assert out["CA"]["single"][-1] == [None, 0.133] and out["CA"]["single"][1] == [26264, 0.02], out["CA"]["single"][:3]
    assert out["CA"]["exemptionCredit"] == {"single": 153, "mfj": 306}
    assert out["DE"]["single"][0] == [2000, 0.0]
    assert out["NJ"]["mfj"][2] == [70000, 0.0245]
    assert out["VA"]["std"] == {"single": 8750, "mfj": 17500} and out["VA"]["exemption"] == {"single": 930, "mfj": 1860}
    assert out["TX"] == {"none": True, "notes": []} and out["WA"]["none"]
    for st, rec in out.items():
        for f in ("single", "mfj"):
            for i, (up, rate) in enumerate(rec.get(f, [])):
                assert 0 <= rate < 0.15, (st, f, rate)
                assert up is None or i + 1 < len(rec[f]), (st, f)

    doc = {"year": YEAR, "source": "Tax Foundation, State Individual Income Tax Rates and Brackets, 2026", "url": URL,
           "fetchedAt": "2026-10-31",
           "note": "Brackets are [upTo, rate]; upTo null = no limit. exemptionCredit/stdCredit are subtracted from tax.",
           "states": out}
    (ROOT / f"data/tax/{YEAR}.json").write_text(json.dumps(doc, indent=1) + "\n")
    js = ("/* Generated by scripts/convert-statetax.py from Tax Foundation's 2026 table. Do not edit by hand. */\n"
          "(function (g) { (g.GOVPAY_DATA = g.GOVPAY_DATA || {}).stateTax = " + json.dumps(doc, separators=(",", ":")) +
          "; })(typeof window !== \"undefined\" ? window : globalThis);\n")
    (ROOT / "shared/data/statetax.js").write_text(js)
    taxed = [s for s, r in out.items() if not r.get("none")]
    print(f"{len(out)} jurisdictions: {len(taxed)} tax wages, {len(out) - len(taxed)} don't")


if __name__ == "__main__":
    sys.exit(main())
