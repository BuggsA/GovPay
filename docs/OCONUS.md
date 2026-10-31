# OCONUS (overseas and non-foreign) pay: notes for a later phase

This is **not modeled yet**. The notes below record what overseas coverage will need, so the data model can make room for it now.

## Military
| Allowance | What it is | Varies by | Source |
|---|---|---|---|
| **OHA** (Overseas Housing Allowance) | Replaces BAH overseas. Pays actual rent up to a ceiling, plus a utility/recurring maintenance allowance and a one-time move-in housing allowance | Location, grade, dependents, exchange rate | DTMO (updated biweekly with currency changes) |
| **OCONUS COLA** | Covers a higher cost of goods and services | Location, grade, YOS, dependents | DTMO (updated biweekly) |
| **TLA** | Temporary lodging on arrival or departure | Location | DTMO / JTR |
| **Hardship duty pay (location)** | Extra pay for hard locations | Location | DoD |
| **IDP / HFP** | Imminent danger / hostile fire pay ($225 a month) | Designated areas | DFAS |
| **CZTE** | Combat zone tax exclusion | Designated areas | IRS / DFAS |
| **FSA** | Family separation allowance | Unaccompanied tours | DFAS |
| AK/HI | No OHA there. BAH is paid, plus CONUS-style COLA rules for those locations | — | DTMO |

## Civilian
| Allowance | What it is | Source |
|---|---|---|
| **Non-foreign area COLA → locality transition** | AK, HI, Guam, Puerto Rico and USVI are moving from COLA to locality pay (5 U.S.C. 5941; NFAAA 2009) | OPM |
| **LQA** (Living Quarters Allowance) | Housing for civilians overseas | State Dept DSSR |
| **Post allowance** | Overseas COLA | State Dept DSSR |
| **Post (hardship) differential** | 0–35% for difficult posts | State Dept DSSR |
| **Danger pay** | 0–35% | State Dept DSSR |
| **Separate maintenance allowance** | When family must live apart | DSSR |
| Foreign Service | Separate FS pay schedule plus the allowances above | State / OPM |

## Travel
- OCONUS per diem comes from DTMO for non-foreign areas and from State Dept for foreign areas. It has lodging and M&IE like CONUS but changes **monthly**. Many locations have seasonal rates.

## Data-model hooks already in place
- Each location already has separate keys for `gsLocality`, `fwsArea`, `bahMha` and `perDiem`. OCONUS adds `ohaArea`, `colaArea`, `dssrPost`, and `currency`.
- `compute()` returns a list of `rows` (each with `taxFree`), so OHA, COLA, LQA, post allowance and danger pay can be added as more rows without changing the UI.
- Exchange-rate-dependent figures need a date as well as a year. Add `asOf` to the location query when this is built.

## Suggested approach
1. Non-foreign areas first (AK, HI, Guam, PR), since they are the simplest and in demand.
2. The top 10 overseas military locations (Germany: Kaiserslautern and Stuttgart; Japan: Okinawa and Yokosuka; Korea: Humphreys; Italy: Vicenza and Naples; Spain: Rota; Guam; Bahrain).
3. Civilian DSSR posts last.
