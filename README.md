# GovPay

Federal pay, made easy to read: GS, LEO, FWS and SES civilian pay, military basic pay, BAH and BAS, and travel per diem, for current employees and service members and for anyone considering federal service.

This repo currently holds **three design prototypes**, which share one data engine.

| Folder | Direction |
|---|---|
| `sites/ledger/` | **A · Paybook:** "my pay" first: set up once, see your number and your next level |
| `sites/levels/` | **B · Payup:** playful career paths, cards and VS mode |
| `sites/atlas/` | **C · Paymap:** editorial, place-first, map and rankings |
| `shared/govpay.js` | Data plus calculation engine (the source copy) |
| `shared/locpicker.js` | Searchable location picker shared by the sites |
| `docs/` | Design rationale, data sources and plan, OCONUS notes |

## The real site (`site/`, Astro)
`site/` builds the production site: the calculator plus a pre-built page for every GS grade in every locality area, every area's pay table and the military pay chart (931 pages), and a sitemap. It uses the same engine, data and design files as the calculator; `npm run build` copies them in first.

```bash
cd site && npm install && npm test && npm run build
```

To switch a Cloudflare Pages project to it: **Root directory** `site`, **Build command** `npm run build`, **Build output directory** `dist`, environment variable `NODE_VERSION=22`.

## Run locally
There is no build step. Open `index.html` directly, or serve the repo:
```bash
python3 -m http.server 8000
```
Then visit http://localhost:8000.

## Shared engine
Edit the files in **`shared/`** only, then copy them into each site:
```bash
./scripts/sync-shared.sh
```
Each site keeps its own copy in `sites/<name>/shared/` so every folder can deploy independently.

## Deploying (Cloudflare Pages)
Create one Pages project per site, connected to this GitHub repo:

| Project | Dev | Prod (planned) | Build output directory |
|---|---|---|---|
| `paybook` | https://paybook.hhouse.dev | paybook.loopi.sh | `sites/ledger` |
| `payup` | https://payup.hhouse.dev | payup.loopi.sh | `sites/levels` |
| `paymap` | https://paymap.hhouse.dev | paymap.loopi.sh | `sites/atlas` |

- **Production branch:** `main`
- **Build command:** none

## Data status
**Prototype data, not for official use.** UT, MD, DC, PA and VA use approximate or verified 2025–2026 figures. Other states and FWS are simulated, and 2027 is projected. Every figure in the UI is tagged. See [docs/DATA.md](docs/DATA.md).
