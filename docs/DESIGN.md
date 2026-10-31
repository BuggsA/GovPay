# GovPay design directions

There are three deliberately different prototypes. All of them use the same data engine (`shared/govpay.js`), so they can be compared on design alone.

**Main audience:** people already paid by the government (GS, LEO, FWS, SES employees and service members) who want to check, compare or plan their pay. **Secondary audience:** people thinking about joining, so every term needs a plain-language explanation.

**Features shared by all three**
- A year switcher for **2025**, **2026** (current) and **2027** (projected)
- A location picker. UT, MD, DC, PA and VA have researched data; every other state is simulated.
- GS, LEO (special base rates and LEAP), FWS (WG/WL/WS), SES and Executive Schedule, and military basic pay, BAH and BAS for enlisted, warrant, officer and O-1E to O-3E
- Per diem with seasonal lodging rates and a trip estimate that uses the 75% M&IE rule for first and last days
- A data-status tag on every number: verified, approximate, simulated or projected

## A · Ledger (`sites/ledger`)
**Calculator-first, official but friendly.** It feels like a modern government service in the spirit of USWDS: navy and teal, IBM Plex.

- The hero area is a profile builder (pay system → grade → step or years of service) next to one big number.
- A Year / Month / Paycheck / Hour toggle, and a stacked bar that splits base, locality, LEAP, BAH and BAS.
- Tabs: full pay tables with your cell highlighted, BAH and BAS for each grade, a per diem month strip with a trip estimator, side-by-side comparison of any two jobs, and a "New to federal pay?" primer.
- The state is saved in the URL hash, so results can be shared.

**Best for:** current employees who want their number quickly and need to trust it. **Risk:** it's the least memorable of the three.

## B · Levels (`sites/levels`)
**Playful career paths, dark mode first.** Space Grotesk, with a color for each path.

- Seven path cards: Civilian, Law Enforcement, Skilled Trades, Executive, Enlisted, Warrant and Officer. Each shows its pay range.
- A deck of level cards, one per grade, with a pay meter. Tapping a card opens a stat sheet with a bar for each pay component.
- A career-path chart covering about 30 years, with promotion milestones and a scrubber ("+79% since day one").
- Pin any two cards from any paths to compare them in a "VS" view.
- Extras: a boarding-pass-style per diem ticket, and BAH bars by grade.

**Best for:** people thinking about joining, social sharing, and younger service members. **Risk:** detailed table lookups are less direct.

## C · Atlas (`sites/atlas`)
**Editorial and place-first.** Newspaper typography (Fraunces and Inter) on a cream background.

- A US tile map colored by GS locality %, GS-12 pay, BAH or per diem. Simulated states are hatched.
- A profile for each place with four sections: Civilian (GS and LEO), Military (BAH and BAS, plus a calculator), Trades and Executives (FWS and SES), and Travel (per diem heat strip).
- "Same job, every place": a dot plot ranking all focus locations for a chosen job.
- "How federal pay works, in five minutes": a column-layout explainer whose examples update for the selected location.

**Best for:** relocation and PCS decisions, and explaining pay to newcomers. **Risk:** the map needs data for every state before it feels complete.

## Recommendation
Combine them. **A's calculator and tables** form the core, **C's location profiles and ranking** become the pages for each place (good for SEO, such as "GS pay in Norfolk"), and **B's career chart and VS view** become the shareable, fun features. Choose one visual identity after reviewing all three.

## Accessibility and technical notes
- No build step: plain HTML, CSS and JS. Each site is about 30 KB plus fonts.
- Designed for phones first (checked at 390 px). All three follow the system light/dark setting.
- Colors come from CSS custom properties, and status tags pair color with text labels.
