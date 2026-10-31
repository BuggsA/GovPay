# Data: sources, status and refresh plan

## Source access (as of Oct 31, 2026)
| Source | From this cloud session | Notes |
|---|---|---|
| GSA Per Diem API | Works | Real data in use. A free api.data.gov key goes in the `GSA_API_KEY` repository secret for the monthly Action. |
| Tax Foundation | Works | For state income tax tables (take-home, later). |
| OPM (GS, locality, LEO, SES) | Blocked by OPM's own servers ("Access Denied") | Automated downloads are refused. Don't try to get around this. |
| DFAS (military pay, BAS) | Blocked by DFAS's own servers (403) | Same. |
| DTMO (BAH) | Blocked by DTMO's own servers (403) | Same. |

GitHub Actions runners are blocked too (checked Oct 31, 2026: OPM, DFAS and DTMO all return 403, while GSA returns 200). So for these three sources, a person downloads the official files in a browser and commits them under `data/raw/<source>/<year>/`. Scripts then convert them to JSON. That's a few files once a year.

## What's in the prototype
| Dataset | Years | Coverage | Status |
|---|---|---|---|
| GS base table | 2025 table entered by hand; 2026 = 2025 × 1.01; 2027 = +1% (assumed) | All grades and steps | approx / projected |
| GS locality % | 2026 (frozen at 2025 levels) | DC-Baltimore 33.94, Philadelphia 28.99, Pittsburgh 21.03, Harrisburg 19.43, Richmond 22.28, Virginia Beach-Norfolk 18.80, Rest of U.S. 17.06 (all of Utah) | verified |
| GS cap | EX-IV: 2025 $195,200 · 2026 $197,200 | — | verified |
| LEO | Special-rate premium applied to GS-3 to GS-10, plus the 2026 2.8% LEO adjustment; LEAP 25% | GS-3 to GS-15 | approx |
| FWS (WG/WL/WS) | Shape of the curve only | 9 wage areas in the focus states | **simulated** |
| SES / EX | 2025 and 2026 published; 2027 +1% | SES min = 120% of GS-15/1 | verified / projected |
| Military basic pay | 2026 anchor points ≈ 2025 × 1.038; 2025 back-computed (÷1.038); 2027 +4.2% (assumed) | All grades, DFAS YOS columns, capped at EX-II/12 | approx / projected |
| BAS | 2026 $476.95 enlisted / $328.48 officer | — | approx (verify with DFAS) |
| BAH | E-5 with-dependents anchor per MHA × grade ratios | 19 MHAs in UT, MD, DC, PA, VA | approx |
| **Per diem** | **FY2025, FY2026, FY2027, from the GSA Per Diem API** (`scripts/fetch-perdiem.mjs`) | **All CONUS areas (~300) plus the standard rate** ($110/$68 in FY2025–26, $113/$68 in FY2027) | **verified (real)** |
| Everything else | Generated with a seed per state | 45 other states | **simulated** |

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
