# Concept: one federal & military pay site (working name: Paybook)

> Decisions are recorded with reasons so later work builds on them instead of reopening them. Open questions are in section 14. Reviewer answers are in [CONCEPT-REVIEW.md](CONCEPT-REVIEW.md), and the visual system is in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## 1. One-line pitch
The fastest, most trustworthy answer to "What does this federal or military job pay, here, after taxes, and what's my next step?"

## 2. Audiences
- Primary: people already paid by the government: GS civilians, law enforcement (LEO), executives (SES), trades (FWS), and service members (enlisted, warrant, officer).
- Secondary: people considering federal service or military-to-civilian transition. They usually arrive with a USAJobs listing ("GS-0343-09/11/12") or a rank and want it decoded.

## 3. Decisions already made (with reasons)
1. ONE site, not three. Three prototypes were built (Paybook = "my pay first," Payup = gamified career paths, Paymap = editorial place-first map). Paybook won. Payup and Paymap are being mined for parts, not developed.
2. Core = "my pay." The user sets up once (pay system, grade/step or rank/years, location) and immediately sees their number and their next raise or promotion.
3. Comparison is an important FEATURE, not the backbone. It covers promotion, moving, leaving the military, and job offers.
4. Take-home pay is in scope as an ESTIMATE with visible assumptions (see section 7).
5. A state-level tile map is a FILTER inside the location picker, not a mode or a forced step (see section 6).
6. Rebuild the foundation now (only about 20 minutes invested so far). Keep the shared engine's API design and Paybook's look.
7. Never look official: no seals, no .gov styling, and "Not affiliated with the U.S. government" on every page.

## 4. Information architecture and URLs
Real, indexable pages, because search is where scale comes from ("GS-12 pay San Diego 2026"). Every page opens with the calculator prefilled.
- `/` : "My pay" (setup → result), remembered in the browser (localStorage)
- `/civilian/gs/12/san-diego-ca` : grade × locality area page
- `/civilian/gs/table/washington-dc` : full pay table for a locality area
- `/military/e-5/norfolk-va` : basic pay + BAH + BAS for a rank at a base or area
- `/military/bah/norfolk-va` : BAH by rank for one area
- `/travel/per-diem/norfolk-va` : per diem with seasonal months and a trip estimator
- `/compare` : comparison tool (state kept in the URL query, so it can be shared)
- `/learn/...` : explainers ("How GS pay works," "BAH explained," "Leaving the military: what changes")

The URL scheme is decided before launch and never changed afterward (changing it would cost search ranking).

## 5. Core features (version 1)
### 5.1 My pay
- One big number, with Year / Month / Paycheck / Hour toggles.
- A breakdown: base, locality, LEAP (law enforcement availability pay), BAH, BAS, tax-free items marked.
- Military shows MONTHLY first (matches how they read their LES, the Leave and Earnings Statement). The yearly total is labeled Regular Military Compensation (RMC).
- Year switcher: last year / this year / next year. Next year shows "proposed" until final tables publish. (2027 as of Oct 2026: GS freeze proposed, LEO +3.8%, military 5–7% tiered. NOT final.)

### 5.2 Your next level
- Cards: next step increase (with timing), promotion (GS promotion rule), top of grade (years away), military longevity raise and next rank.
- Tapping a card previews that scenario in the main number.

### 5.3 Pay tables
- Full tables with the user's cell highlighted. Tap any cell to preview it.
- Mobile: pinned Grade column, defaulting to the user's row and its neighbors.

### 5.4 Estimated take-home
See section 7.

## 6. Location picker (with state tile map)
- Order of controls: search box (city, ZIP, base name; ALWAYS searches all states) → recent places → state tile map → filtered list.
- The tile map uses equal-size squares (so DC, DE and RI are tappable). Tiles are neutral, with only the selected state highlighted.
- Tapping a state adds a removable chip ("Virginia ✕") and narrows the list to that state's locality areas and bases. Tapping another state switches the filter; ✕ clears it.
- If the state alone decides the answer (e.g., all of Utah is "Rest of U.S." for GS), tapping it just sets the location for GS users. Military users still see the bases list, since BAH differs by base.
- Places that span states (e.g., the DC locality area) appear under every state they touch.
- Mobile: a full-screen sheet. Desktop: the picker can stay open beside the results, so tapping states updates numbers live.
- The map is optional and is never the only way to pick: search and the list must always work. Tiles are plain buttons, so keyboard and screen-reader support comes for free.
- Behind the scenes, one place resolves to THREE separate keys: GS locality area (county-based), BAH area (ZIP-based), and per diem area (county-based). The UI says so when they differ (e.g., Quantico has DC's GS locality but its own BAH rate).

## 7. Take-home estimate (deliberately limited)
- Included: federal income tax, Social Security/Medicare, state income tax, FERS contribution (0.8% / 3.1% / 4.4% by hire date), TSP %, optional health premium.
- Filing status: single, or married with one income. Standard deduction only. No credits, no itemizing, no spouse income.
- Local tax ONLY where it's unavoidable and flat: Maryland county taxes, Pennsylvania local earned-income tax, Philadelphia, NYC. It's attached to the location, so there are no extra questions.
- Military: a "state of legal residence" field (separate from duty station) and per-state military pay exemptions.
- Escape hatch: "Taxes estimated at ~22% (single, standard deduction) · Edit." Users with complicated situations type their own effective rate. This deliberately keeps it from becoming a tax-prep app.
- Data: one state-tax JSON file updated every January (Tax Foundation annual table as a starting reference; verify against state sources).

## 8. Comparison (version 1.1)
- Starts from "You now" (prefilled). The user changes only what's different.
- Starting buttons: I'm getting promoted / I'm moving / I'm leaving the military / I have a job offer. Changes can be combined.
- Headline: one number, take-home per month difference.
- Below it: a waterfall chart showing each change (+base, +locality, −BAH, −taxes, −health premium, +retired pay).
- Promotions shown as a timeline (reuse Payup's career chart).
- Military → civilian must account for: tax-free BAH/BAS ending, TRICARE vs. FEHB cost, military retired pay continuing (20+ years), state tax changing, military service buy-back toward FERS, and starting grade suggestions from a GS ↔ military equivalents table, plus a note that agencies can set a higher starting step for superior qualifications.
- Moving, civilian: locality + state tax + a cost-of-living hint (BAH used as a free rent index). Moving, military: only BAH changes, and the site says so plainly.

## 9. Later (not version 1)
- FWS trades pay (wage area data is hard to collect), full LEO special rate tables, SES detail.
- Overseas: OHA, OCONUS COLA, LQA, post allowance, and Alaska/Hawaii/territories first.
- Inflation view: "your pay vs. inflation since 2010" (timely given the proposed 2027 freeze).
- Retirement / high-3 projection.

## 10. Data
- Sources: OPM (GS, locality, LEO, SES, Executive Schedule), DFAS (military basic pay, BAS), DTMO (BAH by ZIP and area), GSA Per Diem API, state tax tables.
- Pipeline: scheduled GitHub Action → fetch raw files → build per-year JSON → open a PR with the diff → human review → deploy.
- Every number carries a source link and an "as of" date. Status badges (approximate / projected) only on exceptions, not on everything.
- Breadth over depth for launch: real nationwide GS + military + BAH + per diem beats five states with every pay system. No simulated data in production.

## 11. Tech (chosen for millions of visits at near-zero cost)
- Static site generator (Astro suggested): thousands of pre-built pages, with JavaScript only for the calculator.
- Cloudflare Pages / CDN. The calculator runs in the browser, so no server is needed.
- The engine is a plain JS module used both at build time and in the browser. Keep the existing public API (`compute`, `gs`, `military`, `bah`, `perDiem`, `progression`); swap hand-entered data for the pipeline's JSON.
- The tile map is plain HTML buttons with no map library. No Google Maps or Mapbox (per-load pricing at scale).
- No accounts. Settings live in localStorage, and shareable state goes in the URL.

## 12. Design direction
- Paybook's calm, trustworthy look (IBM Plex, navy/teal), without emoji icons.
- Paymap's editorial voice for the /learn articles.
- Mobile-first (checked at 390 px), light/dark, every color paired with a text label.
- Leave layout room for possible future ads so the design doesn't break if they're added.
- Not an "AI-built" look: clear to read, with its own character, and a style that sibling sites could share. See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## 13. Decide before launch
- Permanent name and domain (changing either later costs search ranking).
- Final URL scheme (section 4).
- Ads or no ads.
- Legal disclaimer wording.

## 14. Open questions for the reviewer
1. Is "My pay" the right homepage, or should the homepage be search ("Enter a grade, rank or job posting")?
2. Should version 1 include the job-posting decoder (paste "GS-0343-09/11/12" → ladder and pay)?
3. Is the take-home scope in section 7 the right line, or still too much for version 1?
4. Best way to show civilian vs. military side by side without misleading on tax-free pay?
5. Is the URL scheme sound for SEO, and are there page types missing?
6. Which features are most likely to get shared (screenshots, links), and does the design support that?
