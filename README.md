# GovPay

Federal pay, made easy to read: GS, LEO, FWS and SES civilian pay, military basic pay, BAH and BAS, and travel per diem, for current employees and service members and for anyone considering federal service.

This repo currently holds **three design prototypes**, which share one data engine.

| Folder | Direction |
|---|---|
| `sites/ledger/` | **A · Ledger:** calculator-first, official but friendly |
| `sites/levels/` | **B · Levels:** playful career paths, cards and VS mode |
| `sites/atlas/` | **C · Atlas:** editorial, place-first, map and rankings |
| `shared/govpay.js` | Data plus calculation engine (the source copy) |
| `docs/` | Design rationale, data sources and plan, OCONUS notes |

## Run locally
There is no build step. Open `index.html` directly, or serve the repo:
```bash
python3 -m http.server 8000
```
Then visit http://localhost:8000.

## Shared engine
Edit **`shared/govpay.js`** only, then copy it into each site:
```bash
./scripts/sync-shared.sh
```
Each site keeps its own copy in `sites/<name>/shared/` so every folder can deploy independently.

## Deploying (Cloudflare Pages)
Create one Pages project per site, connected to this GitHub repo:

| Project | URL | Build output directory |
|---|---|---|
| `paybook` | https://paybook.pages.dev | `sites/ledger` |
| `payup` | https://payup.pages.dev | `sites/levels` |
| `paymap` | https://paymap.pages.dev | `sites/atlas` |

- **Production branch:** `main`
- **Build command:** none

## Data status
**Prototype data, not for official use.** UT, MD, DC, PA and VA use approximate or verified 2025–2026 figures. Other states and FWS are simulated, and 2027 is projected. Every figure in the UI is tagged. See [docs/DATA.md](docs/DATA.md).
