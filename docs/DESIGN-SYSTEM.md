# Design system: "Paper, ink & highlighter"

**Goal:** easy to read at a glance, with its own character. It shouldn't look like a generic AI-built dashboard or a .gov site. The system is a set of habits that sibling sites can share, so someone who knows one site recognizes the others.

**Live specimen:** `sites/ledger/style.html` (paybook.hhouse.dev/style.html)

## The idea
Pay comes on paper: the LES, the SF-50, printed pay tables. People find their own row and **highlight it**. The design borrows from that: warm paper, blue-black ink, thin ruled lines, numbered boxes like a form, and one highlighter color that always means **"this is you."**

## Six signature habits (shared across sibling sites)
1. **Highlighter means "you."** Your number, your table cell, your state and your rung on the ladder all get the same yellow marker. Nothing else uses yellow.
2. **Numbered boxes.** Sections get small monospace labels, like `01 · YOUR PAY` and `02 · NEXT LEVEL`, the way a form numbers its boxes.
3. **Rules, not shadows.** 1 px lines and hairline borders, with corner radius ≤ 4 px. No drop shadows, no glass effects and no gradients.
4. **The stub.** Results are drawn as a pay stub with a perforated edge. This is also the share and screenshot card, with the URL in its footer.
5. **Dotted leaders.** Breakdown rows read like a ledger: `Base pay ........ $86,660`.
6. **Stamps for status.** Words like PROPOSED and ESTIMATE are outlined monospace stamps. They appear only on exceptions, not on every number.

**Each site gets one accent color.** Paybook uses **ledger green**. A sibling site keeps the paper, ink, highlighter, type and the six habits, and changes only its accent.

## Tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F6F3EC` | `#14171A` | page background |
| `--paper-2` | `#EDE8DD` | `#1C2024` | wells, table headers |
| `--card` | `#FFFDF8` | `#191D21` | stub and panels |
| `--ink` | `#17202A` | `#ECE6DA` | text, primary buttons |
| `--ink-2` | `#4D5661` | `#A9A397` | secondary text |
| `--rule` | `#D9D1C1` | `#2E353C` | lines, borders |
| `--hi` | `#FFE066` | `#E9C84C` | highlighter ("you") |
| `--accent` | `#0B6E5B` | `#4FC2A6` | links, positive deltas, site accent |
| `--pen` | `#B3412E` | `#F08C74` | decreases and warnings (red pen) |

Text on `--hi` is always `#17202A`, in both modes. Every color is paired with a text label: deltas carry + or −, and stamps carry a word.

## Type: the IBM Plex family
- **Plex Sans** for the interface and all numbers (`font-variant-numeric: tabular-nums`)
- **Plex Serif** for editorial headlines on /learn and section titles on long pages (the voice taken from Paymap)
- **Plex Mono** for box numbers, stamps and small labels only. Never for body text.

| Style | Size / line height |
|---|---|
| The number | 56–72 px, weight 700 |
| H1 | 32–44 px |
| Body | 17 px / 1.55 |
| Small | 13 px |

## Voice
- Numbers come first, then the words.
- Address the reader as "you" and use plain verbs.
- No exclamation marks, and no "unlock", "seamless" or "supercharge".
- State assumptions in one short sentence: "Single, standard deduction, Maryland. Edit."

## Don'ts (the "AI-built" tells)
- Purple or blue gradients, glowing blobs, glassmorphism
- Emoji as icons, sparkle icons
- Big rounded cards with soft drop shadows everywhere
- A centered hero followed by three identical feature cards
- Every number wearing a colored badge
- Seals, eagles, flags, or the .gov navy and red (decision 7)

## Layout
- Mobile-first, checked at 390 px. The content column is 720 px, with an optional 300 px right rail on desktop.
- The right rail **holds space for optional ads later**. Until then it holds the location picker or related links, so adding ads won't shift the layout.
- Tables keep the Grade column pinned. On mobile they open on your row and the rows next to it.
