# Concept review: answers to the open questions

This builds on [CONCEPT.md](CONCEPT.md). It answers the open questions in section 14 and flags a few problems. It doesn't reopen the decisions in section 3.

## Answers

### 1. Homepage: "My pay" or search?
**Both, in one box.** A first-time visitor sees one input: *"Your grade, rank or a job posting"*, with examples underneath ("GS-12 San Diego", "E-5 Norfolk", "GS-0343-09/11/12"). Whatever they type fills in the setup and shows their number straight away. A returning visitor sees "My pay" with the same box in the header.

The setup steps are still there for people who'd rather click than type. This works because the search parser and the setup steps fill in the same profile.

### 2. Job-posting decoder in v1?
**Yes.** It's the same parser as the homepage box, so it's cheap to build. It's also the best entry point for the secondary audience.

- **Input:** `GS-0343-09/11/12`, `GS-1811-07/09/11/12/13`, `WG-5803-10`, or a pasted paragraph containing one of those.
- **Output:**
  - The series name (0343 = Management and Program Analysis)
  - The career ladder as a row of grades
  - Pay at each grade for the chosen location
  - The full-performance level, marked clearly
- **Needs:** an OPM occupational series list (a public list of about 400 rows).

### 3. Is the take-home scope right?
**The line is right, but ship it in two stages:**

| v1 | v1.1 |
|---|---|
| Federal tax, FICA, FERS, TSP %, state tax (brackets), single or married with one income, effective-rate override | Local taxes (MD counties, PA EIT, Philadelphia, NYC), health premium presets |
| Military: state of legal residence, plus states that exempt military pay | Military: combat-zone exclusion (as a note, not a calculation) |

Show the result as a **rounded estimate** ("about $5,850/mo"), not to the cent. The assumptions appear in one sentence underneath it, and "Edit" opens the override. Exact-looking numbers invite people to compare them with their LES and lose trust when the cents don't match.

### 4. Civilian vs. military without misleading on tax-free pay
**Compare take-home cash per month.** After-tax money already accounts for tax-free BAH and BAS, so it needs no extra explanation.

- **Secondary line:** RMC and the "taxable-equivalent salary" ("to match this in a civilian job, you'd need about $X before tax").
- **Benefits:** shown as a separate list, not added into the number. The list covers TRICARE vs. FEHB premiums, retirement, and the commissary. Turning benefits into dollars is where comparisons get misleading.
- **Never put military gross pay and civilian gross pay side by side** without labeling them.

### 5. Is the URL scheme sound? What's missing?
The scheme is sound. Four changes:

1. **Use locality areas, not cities, as the canonical GS page.** GS pay is set by locality area (about 58 areas), so a page for each city would create thousands of near-identical pages. Make `/civilian/gs/12/san-diego` (the area) the canonical page. City searches can land through the search box, or through alias pages that point their canonical tag at the area page.
2. **Keep the year out of the path.** Pages show the current year and keep their search ranking from year to year. Past years go at `/civilian/gs/table/washington-dc/2025` for "2025 GS pay table" searches.
3. **Add service rank names.** Many people search by the service's own rank name ("Army sergeant pay", "Navy PO2 pay", "Air Force SSgt"), not the pay grade. Add `/military/army/sergeant` and similar pages, with a canonical tag pointing to `/military/e-5` or with their own short intro.
4. **Missing page types:**
   - `/military/pay-chart`: the full basic pay table, which gets a lot of searches
   - `/military/e-5`: rank pages that work without a location
   - `/civilian/gs/12`: a grade across all areas, ranked like Paymap's "same job, every place"
   - `/civilian/gs/localities`: the list of locality areas
   - `/military/bas`
   - `/jobs/0343`: a page for each occupational series, which pairs with the decoder
   - `/about/data`: sources, "as of" dates and methods. This page builds trust and helps search ranking.

**Avoid** a page for every ZIP code. They're thin pages, and search engines penalize thin pages at that scale.

### 6. What gets shared, and does the design support it?
In likely order:
1. **"Your next level" cards** ("Step 6 is +$3,415/yr, in 2 years")
2. **Compare results**, especially leaving the military vs. a civilian offer
3. **"Same job, every place" rankings**
4. **The 2027 freeze vs. inflation chart**

**What the design needs to support this:**
- **A share card for every result:** a fixed-size "pay stub" layout that reads well in a screenshot at 390 px, with the site name and URL in the footer.
- **Build-time Open Graph images** for every page, so links unfurl with the actual number.
- **"Copy link"** that puts the whole scenario in the URL.

The pay-stub motif in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) exists partly for this.

## Things to flag
- **2027 figures (section 5.1).** I haven't verified "GS freeze proposed, LEO +3.8%, military 5–7% tiered". Keep the "proposed" label and link the source on the page. Don't hard-code those numbers until there's a citation.
- **"No simulated data in production" requires source access.** This build environment currently blocks opm.gov, dfas.mil, travel.dod.mil and gsa.gov. Either allow those domains for the session, or the GitHub Action does the fetching (it has normal internet access).
- **Navy and teal can read as ".gov".** Decision 7 says never look official, and the current Paybook navy is close to the U.S. Web Design System's. The design system below moves to warm paper, blue-black ink and a highlighter yellow. That keeps the calm feel but no longer looks like a government site.
- **FWS is in Paybook today, with simulated data.** Per section 9, hide it in production until there's real wage-area data. Don't ship the placeholder numbers.
- **BAH by ZIP.** The engine currently uses housing areas. Users will type ZIP codes, so the pipeline needs DTMO's ZIP-to-housing-area file from day one.
