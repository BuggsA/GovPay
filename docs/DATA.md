# Data: sources, status and refresh plan

## Source access (as of Oct 31, 2026)
| Source | From this cloud session | Notes |
|---|---|---|
| Federal Register pay Executive Orders, via GovInfo (GPO) | Works | **The official legal source** for GS, locality, SES, EX and military basic pay. `scripts/convert-payorder.py` parses the PDF, cleans scanning errors and validates every table (step increments, caps, monotonic pay, a 1% GS raise and a 3.8% military raise across years). |
| GSA Per Diem API | Works | Real data in use. A free api.data.gov key goes in the `GSA_API_KEY` repository secret for the monthly Action. |
| Census (www2.census.gov files) | Works | County, place and population files. The Census API needs a key, so the scripts use the downloadable files instead. |
| Tax Foundation | Works | State income tax tables, in use: `scripts/convert-statetax.py` converts the 2026 workbook (kept in `data/raw/taxfoundation/`). |
| OPM (GS, locality, LEO, SES) | Blocked by OPM's own servers ("Access Denied") | Automated downloads are refused. Don't try to get around this. |
| DFAS (military pay, BAS) | Blocked by DFAS's own servers (403) | Same. |
| DCPAS wage schedules (FWS) | Works (plain download, Oct 31 2026) | `wageandsalary.dcpas.osd.mil`, incl. the bulk "Download Wage Data" page. FY2027 schedules are delayed by DoD until the FY2027 pay limits are released. |
| DTMO (BAH) | Blocked by DTMO's own servers (403) | Same. **2025 and 2026 BAH files received by hand (Oct 31, 2026).** |
| USAJOBS code lists (occupational series) | Blocked (Access Denied, Oct 31 2026) | **Received by hand Oct 31, 2026**: `data/raw/usajobs/occupational-series.txt` (822 series). Refresh by downloading `https://data.usajobs.gov/api/codelist/occupationalseries` in a browser. |

GitHub Actions runners are blocked too (checked Oct 31, 2026: OPM, DFAS and DTMO all return 403, while GSA returns 200). So for these three sources, a person downloads the official files in a browser and commits them under `data/raw/<source>/<year>/`. Scripts then convert them to JSON. That's a few files once a year.

## What's in the prototype
| Dataset | Years | Coverage | Status |
|---|---|---|---|
| **GS base table** | **2025, 2026 from the pay Executive Orders** (EO 14132, EO 14368); 2027 projected (+1% assumed) | All grades and steps | **verified (official)** / projected |
| **GS locality %** | **2025, 2026 from the pay orders (Schedule 9)** | **All 58 locality areas** (the app maps 7 of them to places so far) | **verified (official)** |
| GS cap | EX-IV: 2025 $195,200 · 2026 $197,200 | — | verified |
| **LEO** | **2026 from OPM's ALLLEO file** (`data/raw/opm/2026/`, `scripts/convert-leo.py`): the LEO base table, verified against all 58 locality tables cell by cell; 2025 derived from it and the 2025 GS table; LEAP 25% capped at EX-IV (5 U.S.C. 5547) | GS-1 to GS-15 (special rates at GS-3 to GS-10) | **verified (official)** 2026 / approx 2025 |
| **FWS (WG/WL/WS)** | **FY2025 and FY2026 from DCPAS wage data** (`data/raw/dcpas/`, `scripts/fetch-fws.py` → `scripts/convert-fws.py`); a year = that fiscal year's survey schedule (26x = FY2026); FY2027 delayed by DoD, so projected | **All 175 regular schedules in use; every county mapped** (DCPAS county list; Allen County, IN from 5 CFR 532 App. C; Alaska by road distance, approximated by borough) | **verified (official)** |
| **SES / EX** | **2025, 2026 from the pay orders** (Schedules 4 and 5); 2027 projected | Min/max with and without certified appraisal; EX I–V | **verified (official)** / projected |
| **Military basic pay** | **2025, 2026 from the pay orders (Schedule 8)**; 2027 projected (+4.2% assumed, statutory caps kept) | All grades incl. O-1E–O-3E, YOS under 2 through over 40 | **verified (official)** / projected. 2025 = January rates (junior enlisted rose again April 1, 2025) |
| **BAS** | **2025 and 2026 from DoD FMR Vol. 7A, Ch. 25**: officers $320.78 / $328.48, enlisted $465.77 / $476.95; 2027 projected | — | **verified (official)** |
| **BAH** | **2025 and 2026 DTMO rate files** (`data/raw/dtmo/BAH-ASCII-<year>.zip`, `scripts/convert-bah.py`); 2026 = May 13, 2026 reissue; 2027 projected | **All 338 housing areas** (299 named + 39 rural county cost groups), every grade, with/without dependents. Every county mapped to the area covering most of its people (Census 2020 ZCTA-county + ACS population) | **verified (official)**; ZIP-level edges can differ from the county's area |
| **Per diem** | **FY2025, FY2026, FY2027, from the GSA Per Diem API** (`scripts/fetch-perdiem.mjs`) | **All CONUS areas (~300) plus the standard rate** ($110/$68 in FY2025–26, $113/$68 in FY2027) | **verified (real)** |
| **Take-home taxes** | **Tax year 2026**: IRS Rev. Proc. 2025-32 (brackets, standard deduction), SSA wage base $184,500; **every state and DC from the Tax Foundation 2026 table** (`data/tax/2026.json`), with DC, MD, PA, UT, VA hand-checked against it; Maryland county rates and exemption phase-out (Maryland Comptroller, DLS), Utah taxpayer credit (Utah Tax Commission) | All 50 states + DC. Military pay exemptions by state of legal residence from MyAirForceBenefits (tax year 2025) and VA Code 58.1-322.02. Not included: local income taxes (named in the app), combat-zone/overseas/Guard-only military exclusions, NY/CT recapture, MO/OR federal-tax deductions. Some states' 2026 inflation amounts weren't out when Tax Foundation published, so it used 2025 amounts (its notes j, n, ll) | **verified (official)**; the result is an estimate by design |
| **Places (every county)** | **5 CFR 531.603(b)** (eCFR, Oct 29 2026) locality definitions + OMB/Census metro delineation (March 2020) + Census 2020 county list; GSA per diem county text (`scripts/build-places.py`) | **All 3,142 counties and county equivalents**: 954 in a named locality area, 365 with a special per diem rate. Explicitly listed counties win over metro membership (3 moved: Adams and York PA → DC area, Douglas NV → Sacramento). Alaska and Hawaii per diem not covered (OCONUS). | **verified (official)**; edge counties worth checking against OPM's published definitions |
| **Cities and towns** | Census 2020 place-by-county list; ACS 2020-2024 5-year population (B01003); Census Vintage 2024 city estimates for the main county (`scripts/build-cities.py`) | **6,752 places with 5,000+ people**, incl. census-designated places (Arlington VA, Bethesda MD). Each uses its main county; 248 span counties in different areas and say so | **verified (official)** |

## Production sources
| Data | Source | Format | Cadence |
|---|---|---|---|
| GS, LEO, special rates, SES, EX | OPM Salary Tables (opm.gov/policy-data-oversight/pay-leave/salaries-wages) | HTML / PDF / XLSX | January (published in December) |
| FWS | DoD DCPAS wage schedules (cpms.osd.mil) | HTML / PDF per wage area | Rolling, through the year by area |
| Military basic pay, BAS | DFAS pay tables | PDF | January |
| BAH | DTMO BAH rate files (ASCII/ZIP by MHA, plus ZIP → MHA mapping) | ZIP | January |
| CONUS per diem | GSA Per Diem API (api.gsa.gov, free key) | JSON | October (fiscal year) |
| OCONUS per diem / OHA / COLA | DTMO | Text files | Monthly or biweekly |

## Planned pipeline
1. `scripts/fetch/*.mjs`, one per source, downloads the raw files into `data/raw/<year>/`. Raw files are not committed.
2. `scripts/build-data.mjs` converts them into `data/<year>/{gs,leo,fws,ses,mil,bah,perdiem,locations}.json`.
3. A **GitHub Action** runs on a schedule (Dec, Jan, Oct, and monthly for OCONUS) and **opens a PR** with the JSON diff. A person reviews and merges it, and then Cloudflare Pages redeploys.
4. `shared/govpay.js` stops using its hand-entered blocks and loads the JSON instead. Its public API (`compute`, `gs`, `military`, `bah`, `perDiem`, `trip`…) stays the same, so no site changes are needed.
5. The full BAH dataset (about 40k ZIPs) can be served from a Cloudflare Worker + KV, so visitors don't download the whole file.

## Year rules
- **This year** = `CURRENT_YEAR` in the engine (2026).
- **Last year** = published data.
- **Next year** appears as *projected* until official tables are released (usually in mid-December), then switches to approximate or verified.
