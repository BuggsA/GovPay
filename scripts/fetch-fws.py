#!/usr/bin/env python3
"""
Download the Federal Wage System (trades) data from DoD's Wage and Salary Division (DCPAS).

1. Rate files: https://wageandsalary.dcpas.osd.mil/WageData/wagedata/ is a public directory of every
   appropriated-fund (AF) schedule DCPAS has issued, one file per issue date (format: 00readme.txt there).
   Files issued since July 2024 go to data/raw/dcpas/wagedata/.
2. County list: the public "AF Wage Schedules" form lists, for each state, every county with its wage
   area, the schedule code its rates are filed under, and its GS locality. This walks that form the way a
   browser does (state -> "Regular Area"), one state a second, into data/raw/dcpas/fws-counties.json.

Usage: python3 scripts/fetch-fws.py
"""
import http.cookiejar, json, re, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://wageandsalary.dcpas.osd.mil"
OUT = ROOT / "data/raw/dcpas"
STATES = "AL,AK,AZ,AR,CA,CO,CT,DE,DC,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY".split(",")


def rate_files():
    d = OUT / "wagedata"
    d.mkdir(parents=True, exist_ok=True)
    listing = urllib.request.urlopen(BASE + "/WageData/wagedata/").read().decode("utf-8", "ignore")
    names = re.findall(r'HREF="/WageData/wagedata/((?:2024(?:Jul|Aug|Sep|Oct|Nov|Dec)|20[2-9]\d)\w*wfa\.dat)"', listing)
    names = [n for n in names if not n.startswith("2024") or n[4:7] in ("Jul", "Aug", "Sep", "Oct", "Nov", "Dec")]
    new = 0
    for n in names:
        p = d / n
        if not p.exists():
            p.write_bytes(urllib.request.urlopen(f"{BASE}/WageData/wagedata/{n}").read())
            new += 1
            time.sleep(0.3)
    print(f"rate files: {len(names)} listed since Jul 2024, {new} new")


def county_list():
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    page = op.open(BASE + "/BWN/AFWageSchedules/").read().decode("utf-8", "ignore")
    tok = re.search(r'name="__RequestVerificationToken" type="hidden" value="([^"]+)"', page).group(1)

    def post(path, fields):
        data = urllib.parse.urlencode(dict({"__RequestVerificationToken": tok}, **fields)).encode()
        req = urllib.request.Request(BASE + path, data=data, headers={"X-Requested-With": "XMLHttpRequest"})
        return op.open(req).read().decode("utf-8", "ignore")

    out = {}
    for st in STATES:
        post("/BWN/AFWageScheduleStateSelected", {"SelectedState": st})
        s = post("/BWN/AFWageScheduleTypeSelected", {"SelectedState": st, "SelectedType": "R"})
        sel = {}
        for name in ("SelectedWageArea", "SelectedCounty"):
            block = re.findall(r'(?s)<select[^>]*name="%s"[^>]*>(.*?)</select>' % name, s)
            sel[name] = [o for o in re.findall(r'<option value="([^"]*)"[^>]*>([^<]*)<', block[0] if block else "") if o[0]]
        out[st] = sel
        time.sleep(1.0)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "fws-counties.json").write_text(json.dumps({"fetchedAt": time.strftime("%Y-%m-%d"), "source": BASE + "/BWN/AFWageSchedules/", "states": out}, indent=1) + "\n")
    print(f"county list: {len(out)} states, {sum(len(v['SelectedCounty']) for v in out.values())} county rows")


if __name__ == "__main__":
    rate_files()
    county_list()
