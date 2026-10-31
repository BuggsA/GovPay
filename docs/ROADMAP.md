# Roadmap: work in focused chunks

Each chunk is one focused piece of work, sized to finish and review on its own. Each one has:
- **Goal:** what it achieves
- **Includes:** what's in it
- **Done when:** a check you can actually run
- **Needs:** anything required first (from you, or from another chunk)

Work roughly top to bottom. Chunks in the same phase can sometimes run side by side.

**Size:** S = about one session · M = 2–3 sessions · L = split it further before starting

**Status:** ☐ not started · ◐ in progress · ☑ done

Based on [CONCEPT.md](CONCEPT.md), [CONCEPT-REVIEW.md](CONCEPT-REVIEW.md), [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) and [DATA.md](DATA.md).

---

## Phase 0: Decisions (you)
### 0.1 Close the open decisions · S · ☐
- **Goal:** stop rework later.
- **Includes:** permanent name and domain (Paybook? loopi.sh?), ads or no ads, disclaimer wording, and a first draft of the page URLs (they can be renamed until launch).
- **Done when:** the answers are written into CONCEPT.md section 13.
- **Needs:** you.

---

## Phase 1: Real data
Nothing ships with simulated numbers (concept §10). Per diem is already done (☑ GSA, FY2025–27, monthly refresh).

### 1.1 GS family from OPM · M · ☐
- **Goal:** real civilian pay nationwide.
- **Includes:** GS base tables plus **all ~58 locality areas** for 2025 and 2026; the Executive Schedule and SES range; LEO special base rates; a converter `scripts/convert-opm.mjs` that writes `data/opm/<year>/*.json`.
- **Done when:**
  - Every cell matches the source file. An automated check compares them.
  - A test reproduces 10 published cells exactly.
  - The approximate GS numbers are gone from the engine.
- **Needs:** you upload the OPM files to `data/raw/opm/<year>/`. OPM blocks automated downloads.

### 1.2 Military pay from DFAS · S · ☐
- **Goal:** real basic pay and BAS.
- **Includes:** 2025 and 2026 basic pay tables (all grades and YOS columns, plus O-1E to O-3E) and BAS. A converter writes `data/dfas/<year>.json`.
- **Done when:** a test checks 10 published cells, and the anchor-point estimates are deleted.
- **Needs:** you upload the DFAS PDFs to `data/raw/dfas/`.

### 1.3 BAH from DTMO · M · ☐
- **Goal:** real housing allowance everywhere.
- **Includes:**
  - BAH rates by housing area, grade and dependents, for 2025 and 2026
  - The **ZIP → housing area** file
  - Data stored compactly (split by state) so pages stay light
- **Done when:** 10 spot checks match the DTMO calculator, and any ZIP code returns a rate.
- **Needs:** you upload the DTMO BAH ZIP files to `data/raw/dtmo/`.

### 1.4 Places: one place → three keys · M · ☐
- **Goal:** the picker knows every place, and each place knows its GS area, BAH area and per diem area.
- **Includes:**
  - County → GS locality, from OPM's locality definitions
  - ZIP → county, from the Census relationship file
  - A list of military installations, with names, aliases and ZIP codes
  - Per diem areas matched by county
- **Done when:** for 20 sample places (bases, cities and ZIPs), all three keys are correct, and the UI notes when they differ (for example, Quantico).
- **Needs:** 1.1 and 1.3, plus checking that census.gov is reachable.

### 1.5 State tax data · S · ☐
- **Goal:** inputs for take-home pay.
- **Includes:** 2026 brackets, standard deductions and military-pay exemptions for every state, starting from Tax Foundation's table and checked against state sources for the focus states.
- **Done when:** `data/tax/2026.json` exists, with a source link for each state.
- **Needs:** nothing (taxfoundation.org is reachable).

---

## Phase 2: Foundation
### 2.1 Astro skeleton + engine as a module · M · ☐
- **Goal:** the single-site base that can grow to thousands of pages.
- **Includes:**
  - A new `site/` Astro project
  - `govpay.js` converted to an ES module that reads the JSON files and runs both at build time and in the browser, keeping its public API (`compute`, `gs`, `military`, `bah`, `perDiem`, `progression`)
  - Engine unit tests
  - A Cloudflare Pages project pointed at it
- **Done when:** paybook.hhouse.dev serves the Astro build, the tests pass in CI, and the old `sites/` folders are archived (Payup and Paymap become reference only).
- **Needs:** 0.1 (name). It can start on placeholder data before Phase 1 finishes.

### 2.2 Design system in code · S · ☐
- **Goal:** the "paper, ink and highlighter" look as reusable parts.
- **Includes:** design tokens, light and dark mode, the stub, ladder, ruled table, stamps, buttons, numbered labels, and the right-rail slot. Built from `style.html`.
- **Done when:**
  - A /style page made from the real components matches the style tile.
  - It passes a WCAG AA contrast check.
  - It has no sideways scroll at 390 px.
- **Needs:** 2.1.

---

## Phase 3: Core experience
### 3.1 My pay (home) · M · ☐
- **Goal:** the main answer in seconds.
- **Includes:**
  - One box for "grade, rank or job posting", with a parser
  - The click-through setup as a fallback
  - The pay stub result, with Year / Month / Paycheck / Hour
  - Military shown monthly first, with RMC
  - A year switcher where next year is labeled "proposed"
  - localStorage memory and a URL that holds the scenario
- **Done when:** "GS-12 step 5 DC", "E-5 Norfolk" and "LEO GS-11 Quantico" each go from typing to a result in one step, and a reload restores it.
- **Needs:** 2.2, plus real data from 1.1 and 1.2.

### 3.2 Next level + preview · S · ☐
- **Goal:** "What's my next raise?"
- **Includes:** a ladder of the next step, the promotion (two-step rule), the top of grade, the longevity raise and the next rank. Tapping a rung previews it, and "Back to my pay" returns.
- **Done when:** a test checks 5 GS promotion results against the OPM rule.
- **Needs:** 3.1.

### 3.3 Location picker + tile map · M · ☐
- **Goal:** pick a place without long lists.
- **Includes:** a search box (city, ZIP or base; always searches every state), recent places, a filter by state on the tile map with a removable chip, the filtered list, a full-screen sheet on mobile, and the "three keys differ" note.
- **Done when:**
  - It works with the keyboard only and with a screen reader.
  - Any of 10 test places can be reached in 3 taps or fewer.
- **Needs:** 1.4, 2.2.

### 3.4 Pay tables · S · ☐
- **Goal:** full tables, with your row in view.
- **Includes:** GS by locality, military basic pay, BAH by area, a pinned Grade column, opening on your row on mobile, and tap-a-cell to preview.
- **Done when:** tables render from real data with source links and "as of" dates.
- **Needs:** 3.1.

### 3.5 Take-home v1 · M · ☐
- **Goal:** an honest estimate of take-home pay.
- **Includes:**
  - Federal tax, Social Security/Medicare, FERS (0.8% / 3.1% / 4.4%), TSP % and state tax
  - Filing status: single, or married with one income
  - Military state of legal residence and its exemptions
  - Your own effective-rate override
  - A rounded result, with its assumptions in one line
- **Done when:** 6 test profiles land within $50 a month of a hand calculation.
- **Needs:** 1.5, 3.1.

---

## Phase 4: Reach (search and sharing)
### 4.1 Page templates + sitemap · M · ☐
- **Goal:** pages that search engines can list.
- **Includes:**
  - Pages for each GS grade × locality area, each GS table, each military rank (with and without a base), BAH by area, per diem by area, the military pay chart, and a GS grade across all areas
  - Canonical tags, the sitemap and structured data
- **Done when:** the build produces every page under a size budget (≤ 50 KB HTML + JS per page), and Lighthouse SEO scores ≥ 95.
- **Needs:** Phase 1, plus 3.1–3.4.

### 4.2 Share card + link previews · S · ☐
- **Goal:** results people actually share.
- **Includes:**
  - The stub as a screenshot-ready card
  - "Copy link" with the whole scenario
  - A link preview image for each page, generated at build time and showing the number
- **Done when:** a pasted link shows the right number in its preview in Slack, iMessage and X.
- **Needs:** 4.1.

### 4.3 Job-posting decoder · S · ☐
- **Goal:** turn "GS-0343-09/11/12" into a career ladder with pay at each grade.
- **Includes:** the OPM occupational series list, paste-in parsing, the ladder with pay for the chosen location, and `/jobs/<series>` pages.
- **Done when:** 10 real USAJobs strings decode correctly.
- **Needs:** 3.1 (it shares the parser).

### 4.4 Learn articles (first 5) · M · ☐
- **Goal:** trusted explanations, in Paymap's editorial voice.
- **Includes:** How GS pay works · Locality pay · BAH and BAS · Military vs. civilian pay · Leaving the military: what changes. Each article includes live calculator examples.
- **Done when:** the 5 articles are published, with sources and "as of" dates.
- **Needs:** 2.2.

### 4.5 About the data page · S · ☐
- **Goal:** trust.
- **Includes:** each source, its "as of" date, the methods, the known limits, and "Not affiliated with the U.S. government".
- **Done when:** every number on the site links back to this page.
- **Needs:** Phase 1.

---

## Phase 5: Compare (v1.1)
### 5.1 Compare scenarios · L (split it) · ☐
- **Goal:** "Should I take it?"
- **Includes:**
  - Starts from "You now"
  - Starting points: promoted / moving / leaving the military / job offer
  - The headline is the take-home difference per month
  - A waterfall chart of each change
  - Military → civilian rules: tax-free BAH and BAS ending, TRICARE vs. FEHB, retired pay, military service buy-back
- **Done when:** 5 sample scenarios match a worked spreadsheet.
- **Needs:** 3.5.

---

## Phase 6: Launch
### 6.1 Quality pass · S · ☐
- **Goal:** solid before the public sees it.
- **Includes:** accessibility (axe, keyboard, screen reader), performance budget, a dark-mode review, every number checked at 390 px, and privacy-friendly analytics (Cloudflare Web Analytics).
- **Done when:** no axe violations, and Lighthouse ≥ 95 in every category on 5 key pages.

### 6.2 Go live · S · ☐
- **Goal:** the public site.
- **Includes:** the production domain, redirects from hhouse.dev, Search Console with the sitemap submitted, and the disclaimer on every page.
- **Done when:** the site is live and the first pages are indexed.
- **Needs:** 0.1.

---

## Later (not version 1)
- FWS trades pay (needs a wage-area data source)
- Full LEO special-rate tables and SES detail
- Overseas pay: Alaska, Hawaii and the territories first, then OHA and OCONUS COLA (see [OCONUS.md](OCONUS.md))
- Inflation view: "your pay vs. inflation since 2010"
- Retirement and high-3 projection
- Yearly data runbook: a December checklist covering the uploads, converters and checks
