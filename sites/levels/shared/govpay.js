/*
 * GovPay shared data + calculation engine.
 *
 * ONE file, no build step, no dependencies. Every site loads this and calls
 * window.GovPay.*. The three prototype sites only differ in presentation.
 *
 * DATA STATUS — every number this engine returns carries a status tag:
 *   "verified"  – matches a published 2026 figure we cross-checked (e.g. GS
 *                 locality %, SES range, Executive Schedule, BAS, raise %).
 *   "approx"    – hand-entered close to the published tables but NOT copied
 *                 cell-by-cell from the source (GS tables, military basic pay,
 *                 BAH, per diem, LEO special rates). Replace before launch.
 *   "simulated" – generated placeholder data (states outside UT/MD/DC/PA/VA,
 *                 FWS wage schedules). Shape is realistic, values are not.
 *   "projected" – a future year (2027) built from an assumed raise.
 *
 * Production plan: replace the hand-entered blocks below with JSON produced
 * by a GitHub Action that pulls OPM / DFAS / DTMO / GSA files. The public
 * API of this file should not need to change. See docs/DATA.md.
 */
(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Years
  // ---------------------------------------------------------------------------
  const CURRENT_YEAR = 2026;
  const YEARS = [
    { year: 2025, label: "2025", status: "approx", note: "Last year" },
    { year: 2026, label: "2026", status: "approx", note: "This year" },
    { year: 2027, label: "2027 (projected)", status: "projected", note: "Next year — not yet published; assumed raises" },
  ];

  // Annual across-the-board raises, applied relative to the anchor tables.
  // Civilian GS anchor table = 2025. Military anchor table = 2026.
  const RAISES = {
    gs:  { 2025: 0.020, 2026: 0.010, 2027: 0.010 },  // 2027 is an assumption
    leoExtra: { 2026: 0.028, 2027: 0.0 },            // 2026: +2.8% special LEO adjustment
    mil: { 2025: 0.045, 2026: 0.038, 2027: 0.042 },  // 2027 ECI-based assumption
    bas: { 2025: 0.010, 2026: 0.024, 2027: 0.025 },
    bah: { 2025: 0.054, 2026: 0.042, 2027: 0.040 },
    fws: { 2025: 0.020, 2026: 0.010, 2027: 0.010 },
    perDiem: { 2025: 0.0, 2026: 0.0, 2027: 0.02 },   // FY2026 CONUS rates held flat
  };

  // ---------------------------------------------------------------------------
  // General Schedule — 2025 base table (anchor). Annual dollars, steps 1..10.
  // ---------------------------------------------------------------------------
  const GS_BASE_2025 = {
    1:  [22360, 23110, 23853, 24592, 25334, 25770, 26505, 27245, 27275, 27970],
    2:  [25142, 25740, 26573, 27275, 27583, 28394, 29205, 30016, 30827, 31638],
    3:  [27433, 28347, 29261, 30175, 31089, 32003, 32917, 33831, 34745, 35659],
    4:  [30795, 31822, 32849, 33876, 34903, 35930, 36957, 37984, 39011, 40038],
    5:  [34454, 35603, 36752, 37901, 39050, 40199, 41348, 42497, 43646, 44795],
    6:  [38407, 39687, 40967, 42247, 43527, 44807, 46087, 47367, 48647, 49927],
    7:  [42679, 44102, 45525, 46948, 48371, 49794, 51217, 52640, 54063, 55486],
    8:  [47265, 48841, 50417, 51993, 53569, 55145, 56721, 58297, 59873, 61449],
    9:  [52205, 53945, 55685, 57425, 59165, 60905, 62645, 64385, 66125, 67865],
    10: [57489, 59405, 61321, 63237, 65153, 67069, 68985, 70901, 72817, 74733],
    11: [63163, 65268, 67373, 69478, 71583, 73688, 75793, 77898, 80003, 82108],
    12: [75706, 78230, 80754, 83278, 85802, 88326, 90850, 93374, 95898, 98422],
    13: [90025, 93026, 96027, 99028, 102029, 105030, 108031, 111032, 114033, 117034],
    14: [106382, 109928, 113474, 117020, 120566, 124112, 127658, 131204, 134750, 138296],
    15: [125133, 129304, 133475, 137646, 141817, 145988, 150159, 154330, 158501, 162672],
  };

  // Executive Schedule (verified 2026; 2025 = published 2025; 2027 projected).
  const EX = {
    2025: { I: 250600, II: 225700, III: 207500, IV: 195200, V: 183100 },
    2026: { I: 253100, II: 228000, III: 209600, IV: 197200, V: 184900 },
  };
  EX[2027] = mapObj(EX[2026], (v) => round100(v * 1.01));

  // GS locality pay areas (2026 verified; locality % were frozen at 2025 levels).
  const GS_LOCALITIES = {
    DCB: { name: "Washington-Baltimore-Arlington, DC-MD-VA-WV-PA", pct: 33.94, status: "verified" },
    PHL: { name: "Philadelphia-Reading-Camden, PA-NJ-DE-MD", pct: 28.99, status: "verified" },
    PIT: { name: "Pittsburgh-New Castle-Weirton, PA-OH-WV", pct: 21.03, status: "verified" },
    HBG: { name: "Harrisburg-Lebanon, PA", pct: 19.43, status: "verified" },
    RCH: { name: "Richmond, VA", pct: 22.28, status: "verified" },
    VBN: { name: "Virginia Beach-Norfolk, VA-NC", pct: 18.80, status: "verified" },
    RUS: { name: "Rest of U.S.", pct: 17.06, status: "verified" },
  };

  // LEO special base rates (GS-3..GS-10) expressed as a premium over GS base.
  // Approximation of OPM's LEO special base rate table shape.
  const LEO_PREMIUM = { 3: 0.23, 4: 0.22, 5: 0.19, 6: 0.17, 7: 0.12, 8: 0.09, 9: 0.06, 10: 0.03 };

  // ---------------------------------------------------------------------------
  // Federal Wage System (blue-collar) — SIMULATED.
  // WG step-2 "representative" hourly rate for a national-average wage area, 2026.
  // ---------------------------------------------------------------------------
  const FWS_WG_STEP2_2026 = [0, 19.10, 20.45, 21.80, 23.15, 24.55, 25.90, 27.30, 28.65,
    30.00, 31.40, 32.75, 34.10, 35.50, 36.85, 38.20];
  const FWS_STEP_PCT = [0.96, 1.00, 1.04, 1.08, 1.12];
  const FWS_SCHEDULES = {
    WG: { name: "Wage Grade (non-supervisory)", grades: 15, factor: 1.00 },
    WL: { name: "Wage Leader", grades: 15, factor: 1.10 },
    WS: { name: "Wage Supervisor", grades: 19, factor: 1.32 },
  };
  const FWS_AREAS = {
    DCWA: { name: "Washington, DC wage area", factor: 1.14 },
    BALT: { name: "Baltimore, MD wage area", factor: 1.07 },
    STMD: { name: "St. Mary's, MD wage area", factor: 1.04 },
    PHIL: { name: "Philadelphia, PA wage area", factor: 1.09 },
    PITT: { name: "Pittsburgh, PA wage area", factor: 0.99 },
    HARR: { name: "Harrisburg, PA wage area", factor: 0.98 },
    NORF: { name: "Norfolk-Portsmouth-Newport News-Virginia Beach, VA wage area", factor: 0.97 },
    RICH: { name: "Richmond, VA wage area", factor: 0.96 },
    UTAH: { name: "Utah wage area", factor: 0.98 },
  };
  const FWS_HOURS_PER_YEAR = 2087;

  // ---------------------------------------------------------------------------
  // Military basic pay — 2026 monthly, anchor points [YOS, $] interpolated
  // into the DFAS column layout. APPROXIMATE (≈2025 × 1.038).
  // ---------------------------------------------------------------------------
  const MIL_YOS = [0, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 30, 34, 38, 40];
  const MIL_ANCHORS = {
    "E-1": { min: 0, pts: [[0, 2499]] },
    "E-2": { min: 0, pts: [[0, 2800]] },
    "E-3": { min: 0, pts: [[0, 2945], [2, 3130], [4, 3320]] },
    "E-4": { min: 0, pts: [[0, 3262], [2, 3429], [3, 3615], [4, 3798], [6, 3960]] },
    "E-5": { min: 0, pts: [[0, 3470], [2, 3735], [3, 3918], [4, 4096], [6, 4385], [8, 4686], [10, 4933], [12, 4963]] },
    "E-6": { min: 0, pts: [[0, 3788], [2, 4168], [4, 4561], [6, 4747], [8, 4942], [10, 5382], [12, 5554], [14, 5885], [16, 5987], [18, 6062]] },
    "E-7": { min: 0, pts: [[0, 4380], [2, 4780], [4, 5250], [6, 5470], [8, 5672], [10, 5737], [12, 6083], [14, 6347], [16, 6603], [18, 6878], [20, 7032], [22, 7290], [24, 7590], [26, 7652], [30, 7652]] },
    "E-8": { min: 8, pts: [[8, 6300], [10, 6580], [12, 6752], [14, 6958], [16, 7183], [18, 7586], [20, 7792], [22, 8139], [24, 8333], [26, 8810], [30, 8810]] },
    "E-9": { min: 10, pts: [[10, 7695], [12, 7870], [14, 8090], [16, 8350], [18, 8613], [20, 9030], [22, 9384], [24, 9756], [26, 10325], [30, 10842], [34, 11384], [38, 11954], [40, 11954]] },
    "W-1": { min: 0, pts: [[0, 4256], [2, 4714], [3, 4837], [4, 5097], [6, 5404], [8, 5858], [10, 6070], [12, 6366], [14, 6657], [16, 6886], [18, 7097], [20, 7354], [30, 7650]] },
    "W-2": { min: 0, pts: [[0, 4849], [2, 5307], [3, 5449], [4, 5545], [6, 5859], [8, 6348], [10, 6590], [12, 6829], [14, 7120], [16, 7349], [18, 7556], [20, 7802], [22, 7964], [24, 8095], [30, 8442]] },
    "W-3": { min: 0, pts: [[0, 5480], [2, 5708], [3, 5943], [4, 6020], [6, 6265], [8, 6748], [10, 7251], [12, 7488], [14, 7762], [16, 8044], [18, 8552], [20, 8895], [22, 9100], [24, 9318], [30, 9597]] },
    "W-4": { min: 0, pts: [[0, 6001], [2, 6455], [3, 6640], [4, 6822], [6, 7136], [8, 7447], [10, 7762], [12, 8235], [14, 8650], [16, 9045], [18, 9368], [20, 9683], [22, 10146], [24, 10527], [30, 10577], [40, 11100]] },
    "W-5": { min: 20, pts: [[20, 10733], [22, 11278], [24, 11683], [26, 12098], [30, 12704], [34, 13339], [38, 13494], [40, 13494]] },
    "O-1E": { min: 4, pts: [[4, 6195], [6, 6417], [8, 6650], [10, 6880], [12, 7114], [14, 7400], [22, 7703]] },
    "O-2E": { min: 4, pts: [[4, 7036], [6, 7181], [8, 7409], [10, 7795], [12, 8094], [14, 8316], [22, 8932]] },
    "O-3E": { min: 4, pts: [[4, 8002], [6, 8386], [8, 8807], [10, 9079], [12, 9528], [14, 9905], [16, 10122], [22, 10465]] },
    "O-1": { min: 0, pts: [[0, 3972], [2, 4135], [3, 4998]] },
    "O-2": { min: 0, pts: [[0, 4576], [2, 5212], [3, 6003], [4, 6205], [6, 6332]] },
    "O-3": { min: 0, pts: [[0, 5296], [2, 6003], [3, 6479], [4, 7084], [6, 7424], [8, 7797], [10, 8037], [12, 8433], [14, 8611], [16, 8611]] },
    "O-4": { min: 0, pts: [[0, 6024], [2, 6973], [3, 7438], [4, 7542], [6, 7973], [8, 8436], [10, 9013], [12, 9463], [14, 9774], [16, 9953], [18, 10066]] },
    "O-5": { min: 0, pts: [[0, 6982], [2, 7865], [3, 8409], [4, 8512], [6, 8851], [8, 9054], [10, 9502], [12, 9830], [14, 10254], [16, 10903], [18, 11211], [20, 11516], [22, 12093]] },
    "O-6": { min: 0, pts: [[0, 8375], [2, 9201], [3, 9805], [4, 9805], [6, 9842], [8, 10264], [10, 10320], [12, 10320], [14, 10906], [16, 11942], [18, 12551], [20, 13159], [22, 13505], [24, 13856], [26, 14535], [30, 15300]] },
    "O-7": { min: 0, pts: [[0, 11045], [2, 11558], [3, 11796], [4, 11985], [6, 12326], [8, 12664], [10, 13054], [12, 13442], [14, 13833], [16, 14470], [18, 15059], [30, 15746]] },
    "O-8": { min: 0, pts: [[0, 13292], [2, 13728], [3, 14017], [4, 14097], [6, 14458], [8, 15060], [10, 15200], [12, 15772], [14, 15936], [16, 16429], [18, 17143], [20, 17800], [24, 17989]] },
    "O-9": { min: 20, pts: [[20, 18787], [22, 19000]] },
    "O-10": { min: 20, pts: [[20, 19000]] },
  };
  // Monthly cap = Executive Schedule level II / 12.
  const MIL_GRADES = {
    enlisted: ["E-1", "E-2", "E-3", "E-4", "E-5", "E-6", "E-7", "E-8", "E-9"],
    warrant: ["W-1", "W-2", "W-3", "W-4", "W-5"],
    officer: ["O-1", "O-2", "O-3", "O-4", "O-5", "O-6", "O-7", "O-8", "O-9", "O-10"],
    priorEnlisted: ["O-1E", "O-2E", "O-3E"],
  };

  const BAS_2026 = { enlisted: 476.95, officer: 328.48 }; // monthly

  // BAH ratio by grade relative to E-5 with dependents (approximates DoD's
  // housing-profile structure). Without-dependents ratio applied on top.
  const BAH_RATIO = {
    "E-1": 0.89, "E-2": 0.89, "E-3": 0.89, "E-4": 0.89, "E-5": 1.00, "E-6": 1.10, "E-7": 1.16,
    "E-8": 1.23, "E-9": 1.31, "W-1": 1.12, "W-2": 1.21, "W-3": 1.28, "W-4": 1.34, "W-5": 1.39,
    "O-1E": 1.21, "O-2E": 1.28, "O-3E": 1.36, "O-1": 1.08, "O-2": 1.17, "O-3": 1.33, "O-4": 1.48,
    "O-5": 1.57, "O-6": 1.59, "O-7": 1.61, "O-8": 1.61, "O-9": 1.61, "O-10": 1.61,
  };
  const BAH_NODEP = { junior: 0.80, other: 0.85 };

  // BAH military housing areas. e5: 2026 E-5 with-dependents monthly (approx).
  const BAH_MHAS = {
    DC053: { name: "Washington, DC metro", e5: 3560 },
    MD072: { name: "Fort Meade, MD", e5: 3050 },
    MD077: { name: "Annapolis, MD", e5: 3220 },
    MD069: { name: "Aberdeen Proving Ground, MD", e5: 2380 },
    MD068: { name: "Patuxent River NAS, MD", e5: 2470 },
    MD070: { name: "Fort Detrick / Frederick, MD", e5: 2720 },
    MD071: { name: "Baltimore, MD", e5: 2560 },
    VA298: { name: "Quantico / Woodbridge, VA", e5: 2960 },
    VA297: { name: "Norfolk / Portsmouth, VA", e5: 2260 },
    VA296: { name: "Hampton / Newport News, VA", e5: 2160 },
    VA300: { name: "Fort Gregg-Adams / Petersburg, VA", e5: 1840 },
    VA302: { name: "Richmond, VA", e5: 2070 },
    VA299: { name: "Dahlgren, VA", e5: 2410 },
    PA095: { name: "Philadelphia, PA", e5: 2580 },
    PA097: { name: "Pittsburgh, PA", e5: 1860 },
    PA093: { name: "Carlisle / Harrisburg, PA", e5: 1910 },
    UT112: { name: "Hill AFB / Ogden, UT", e5: 2060 },
    UT113: { name: "Salt Lake City, UT", e5: 2270 },
    UT111: { name: "Dugway / Tooele, UT", e5: 1950 },
  };

  // Per diem (GSA, FY-based). lodging = Jan..Dec nightly max; mie = daily M&IE.
  const PD_STD = { name: "Standard CONUS rate", lodging: Array(12).fill(110), mie: 68 };
  const PER_DIEM = {
    DC:   { name: "District of Columbia / Arlington / Fairfax / Montgomery / Prince George's", lodging: [196, 196, 276, 276, 276, 276, 207, 207, 276, 276, 196, 196], mie: 92 },
    BALT: { name: "Baltimore City, MD", lodging: Array(12).fill(179), mie: 86 },
    ANNA: { name: "Annapolis / Anne Arundel, MD", lodging: [149, 149, 169, 189, 209, 209, 209, 189, 169, 169, 149, 149], mie: 86 },
    FRED: { name: "Frederick, MD", lodging: Array(12).fill(136), mie: 74 },
    HARF: { name: "Harford County, MD", lodging: Array(12).fill(121), mie: 74 },
    STMA: { name: "St. Mary's County, MD", lodging: Array(12).fill(136), mie: 74 },
    PHLA: { name: "Philadelphia, PA", lodging: [189, 189, 199, 219, 229, 219, 199, 199, 219, 229, 199, 189], mie: 92 },
    PITT: { name: "Pittsburgh, PA", lodging: Array(12).fill(159), mie: 80 },
    HERS: { name: "Hershey / Harrisburg, PA", lodging: [129, 129, 129, 129, 149, 179, 179, 179, 139, 129, 129, 129], mie: 74 },
    CUMB: { name: "Cumberland County, PA", lodging: Array(12).fill(124), mie: 74 },
    NORF: { name: "Norfolk / Virginia Beach, VA", lodging: [117, 117, 117, 117, 136, 199, 199, 199, 136, 117, 117, 117], mie: 80 },
    HAMP: { name: "Hampton / Newport News, VA", lodging: Array(12).fill(118), mie: 74 },
    RICH: { name: "Richmond, VA", lodging: Array(12).fill(135), mie: 74 },
    PWIL: { name: "Prince William / Manassas, VA", lodging: Array(12).fill(126), mie: 74 },
    SLC:  { name: "Salt Lake City, UT", lodging: Array(12).fill(154), mie: 80 },
    PARK: { name: "Park City, UT", lodging: [289, 289, 289, 149, 129, 139, 149, 149, 139, 129, 159, 289], mie: 86 },
    OGDN: { name: "Ogden / Davis County, UT", lodging: Array(12).fill(125), mie: 74 },
    STD:  PD_STD,
  };
  const MIE_FIRST_LAST_DAY = 0.75;

  // ---------------------------------------------------------------------------
  // Locations — the five focus states are hand-entered; the rest are simulated.
  // ---------------------------------------------------------------------------
  const FOCUS = [
    // id, name, state, kind, gsLoc, fwsArea, bahMha, perDiem, x, y (for maps 0..100)
    ["dc", "Washington, DC (Pentagon area)", "DC", "city", "DCB", "DCWA", "DC053", "DC", 62, 44],
    ["fort-belvoir", "Fort Belvoir", "VA", "base", "DCB", "DCWA", "DC053", "DC", 60, 48],
    ["quantico", "MCB Quantico", "VA", "base", "DCB", "DCWA", "VA298", "PWIL", 58, 52],
    ["dahlgren", "NSWC Dahlgren", "VA", "base", "DCB", "DCWA", "VA299", "STD", 61, 57],
    ["norfolk", "Naval Station Norfolk", "VA", "base", "VBN", "NORF", "VA297", "NORF", 70, 72],
    ["langley-eustis", "JB Langley-Eustis", "VA", "base", "VBN", "NORF", "VA296", "HAMP", 67, 70],
    ["richmond", "Richmond", "VA", "city", "RCH", "RICH", "VA302", "RICH", 58, 64],
    ["fort-gregg-adams", "Fort Gregg-Adams", "VA", "base", "RCH", "RICH", "VA300", "STD", 59, 67],
    ["fort-meade", "Fort George G. Meade", "MD", "base", "DCB", "BALT", "MD072", "ANNA", 66, 38],
    ["annapolis", "Annapolis (USNA)", "MD", "city", "DCB", "BALT", "MD077", "ANNA", 69, 41],
    ["andrews", "JB Andrews", "MD", "base", "DCB", "DCWA", "DC053", "DC", 64, 46],
    ["aberdeen", "Aberdeen Proving Ground", "MD", "base", "DCB", "BALT", "MD069", "HARF", 70, 32],
    ["baltimore", "Baltimore", "MD", "city", "DCB", "BALT", "MD071", "BALT", 67, 35],
    ["pax-river", "NAS Patuxent River", "MD", "base", "DCB", "STMD", "MD068", "STMA", 68, 54],
    ["fort-detrick", "Fort Detrick", "MD", "base", "DCB", "BALT", "MD070", "FRED", 58, 36],
    ["philadelphia", "Philadelphia", "PA", "city", "PHL", "PHIL", "PA095", "PHLA", 78, 22],
    ["pittsburgh", "Pittsburgh", "PA", "city", "PIT", "PITT", "PA097", "PITT", 36, 22],
    ["carlisle", "Carlisle Barracks", "PA", "base", "HBG", "HARR", "PA093", "CUMB", 58, 26],
    ["mechanicsburg", "NSA Mechanicsburg", "PA", "base", "HBG", "HARR", "PA093", "CUMB", 60, 25],
    ["harrisburg", "Harrisburg", "PA", "city", "HBG", "HARR", "PA093", "HERS", 62, 23],
    ["hill-afb", "Hill AFB", "UT", "base", "RUS", "UTAH", "UT112", "OGDN", 12, 30],
    ["salt-lake-city", "Salt Lake City", "UT", "city", "RUS", "UTAH", "UT113", "SLC", 11, 35],
    ["dugway", "Dugway Proving Ground", "UT", "base", "RUS", "UTAH", "UT111", "STD", 7, 39],
    ["park-city", "Park City", "UT", "city", "RUS", "UTAH", "UT113", "PARK", 14, 36],
  ];
  const FOCUS_STATES = { DC: "District of Columbia", MD: "Maryland", PA: "Pennsylvania", VA: "Virginia", UT: "Utah" };
  const OTHER_STATES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
    CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
    IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
    ME: "Maine", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
    NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
    OH: "Ohio", OK: "Oklahoma", OR: "Oregon", RI: "Rhode Island", SC: "South Carolina",
    SD: "South Dakota", TN: "Tennessee", TX: "Texas", VT: "Vermont", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  };

  const LOCATIONS = [];
  FOCUS.forEach((r) => LOCATIONS.push({
    id: r[0], name: r[1], state: r[2], stateName: FOCUS_STATES[r[2]], kind: r[3],
    gsLocality: r[4], fwsArea: r[5], bahMha: r[6], perDiem: r[7], x: r[8], y: r[9],
    status: "approx", simulated: false,
  }));
  Object.keys(OTHER_STATES).forEach((st) => {
    const rnd = seeded(st);
    const id = "sim-" + st.toLowerCase();
    // Simulated locality: 17%..36%; simulated BAH E-5: $1,550..$3,600; per diem 110..230
    const locPct = round2(17.06 + rnd() * 19);
    const locId = "SIM_" + st;
    GS_LOCALITIES[locId] = { name: OTHER_STATES[st] + " (simulated locality)", pct: locPct, status: "simulated" };
    const mha = "SIM" + st;
    BAH_MHAS[mha] = { name: OTHER_STATES[st] + " (simulated MHA)", e5: Math.round(1550 + rnd() * 2050), simulated: true };
    const fwsId = "SIMF_" + st;
    FWS_AREAS[fwsId] = { name: OTHER_STATES[st] + " (simulated wage area)", factor: round2(0.9 + rnd() * 0.25), simulated: true };
    const pdId = "SIMPD_" + st;
    const lodge = Math.round((110 + rnd() * 120) / 5) * 5;
    const mieTiers = [68, 74, 80, 86, 92];
    PER_DIEM[pdId] = { name: OTHER_STATES[st] + " major city (simulated)", lodging: Array(12).fill(lodge), mie: mieTiers[Math.floor(rnd() * 5)], simulated: true };
    LOCATIONS.push({
      id, name: OTHER_STATES[st] + " (simulated)", state: st, stateName: OTHER_STATES[st], kind: "state",
      gsLocality: locId, fwsArea: fwsId, bahMha: mha, perDiem: pdId, status: "simulated", simulated: true,
    });
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h += 0x6D2B79F5; let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function round100(n) { return Math.round(n / 100) * 100; }
  function mapObj(o, f) { const r = {}; Object.keys(o).forEach((k) => (r[k] = f(o[k]))); return r; }
  function yearStatus(year) { return year > CURRENT_YEAR ? "projected" : "approx"; }
  function factor(series, year, anchor) {
    // cumulative raise multiplier from anchor-year table to `year`
    let f = 1;
    if (year > anchor) for (let y = anchor + 1; y <= year; y++) f *= 1 + (series[y] || 0);
    if (year < anchor) for (let y = anchor; y > year; y--) f /= 1 + (series[y] || 0);
    return f;
  }
  function location(id) { return LOCATIONS.find((l) => l.id === id) || LOCATIONS[0]; }
  function exFor(year) { return EX[year] || EX[CURRENT_YEAR]; }

  // ---------------------------------------------------------------------------
  // GS
  // ---------------------------------------------------------------------------
  function gsBase(year, grade, step) {
    const row = GS_BASE_2025[grade];
    if (!row) return null;
    const v = row[step - 1] * factor(RAISES.gs, year, 2025);
    return Math.round(v);
  }
  function gsTable(year) {
    const t = {};
    for (let g = 1; g <= 15; g++) t[g] = GS_BASE_2025[g].map((_, i) => gsBase(year, g, i + 1));
    return t;
  }
  function gs(year, grade, step, locId) {
    const loc = location(locId);
    const L = GS_LOCALITIES[loc.gsLocality];
    const base = gsBase(year, grade, step);
    const cap = exFor(year).IV;
    const raw = Math.round(base * (1 + L.pct / 100));
    const annual = Math.min(raw, cap);
    return {
      system: "GS", grade, step, base, localityPct: L.pct, localityName: L.name,
      locality: annual - base, annual, capped: raw > cap, cap,
      hourly: round2(annual / 2087), biweekly: round2(annual / 26),
      status: L.status === "simulated" ? "simulated" : yearStatus(year),
    };
  }

  // ---------------------------------------------------------------------------
  // LEO (GS-1811 / 1801 etc.)
  // ---------------------------------------------------------------------------
  function leoBase(year, grade, step) {
    const gsB = gsBase(year, grade, step);
    const prem = LEO_PREMIUM[grade] || 0;
    const extra = factor(RAISES.leoExtra, year, 2025);
    return Math.round(gsB * (1 + prem) * extra);
  }
  function leo(year, grade, step, locId, opts) {
    opts = opts || {};
    const loc = location(locId);
    const L = GS_LOCALITIES[loc.gsLocality];
    const base = leoBase(year, grade, step);
    const cap = exFor(year).IV;
    const adjusted = Math.min(Math.round(base * (1 + L.pct / 100)), cap);
    const leap = opts.leap ? Math.round(adjusted * 0.25) : 0;
    // LEAP + basic pay is subject to the premium-pay cap; simplified here.
    return {
      system: "LEO", grade, step, base, localityPct: L.pct, localityName: L.name,
      special: LEO_PREMIUM[grade] ? true : false, adjusted, leap, annual: adjusted + leap,
      status: L.status === "simulated" ? "simulated" : yearStatus(year),
    };
  }

  // ---------------------------------------------------------------------------
  // FWS (WG / WL / WS)
  // ---------------------------------------------------------------------------
  function fws(year, schedule, grade, step, locId) {
    const loc = location(locId);
    const area = FWS_AREAS[loc.fwsArea];
    const sch = FWS_SCHEDULES[schedule] || FWS_SCHEDULES.WG;
    const g = Math.min(grade, sch.grades);
    // WS grades 16..19 extend the curve
    const step2 = g <= 15 ? FWS_WG_STEP2_2026[g] : FWS_WG_STEP2_2026[15] + (g - 15) * 1.6;
    const hourly = round2(step2 * sch.factor * area.factor * FWS_STEP_PCT[step - 1] * factor(RAISES.fws, year, 2026));
    return {
      system: "FWS", schedule, grade: g, step, hourly, annual: Math.round(hourly * FWS_HOURS_PER_YEAR),
      areaName: area.name, status: "simulated",
    };
  }

  // ---------------------------------------------------------------------------
  // SES / Executive Schedule
  // ---------------------------------------------------------------------------
  function ses(year) {
    const ex = exFor(year);
    const min = Math.round(gsBase(year, 15, 1) * 1.2);
    return {
      system: "SES", min, maxCertified: ex.II, maxUncertified: ex.III,
      note: "SES members do not receive locality pay. Pay is set by agency within the range.",
      status: year > CURRENT_YEAR ? "projected" : "verified",
    };
  }
  function executiveSchedule(year) { return Object.assign({ status: year > CURRENT_YEAR ? "projected" : "verified" }, exFor(year)); }

  // ---------------------------------------------------------------------------
  // Military
  // ---------------------------------------------------------------------------
  function milGradeType(grade) {
    if (grade[0] === "E") return "enlisted";
    if (grade[0] === "W") return "warrant";
    if (grade.endsWith("E")) return "priorEnlisted";
    return "officer";
  }
  function interp(pts, yos) {
    if (yos <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (yos <= pts[i][0]) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return y0 + ((y1 - y0) * (yos - x0)) / (x1 - x0);
      }
    }
    return pts[pts.length - 1][1];
  }
  function yosColumn(yos) {
    let col = 0;
    MIL_YOS.forEach((c) => { if (yos >= c) col = c; });
    return col;
  }
  function milBasic(year, grade, yos) {
    const a = MIL_ANCHORS[grade];
    if (!a) return null;
    const col = yosColumn(yos);
    if (col < a.min) return null;
    // The anchor curve gives the value at a column; snap to DFAS column.
    let v = interp(a.pts, col) * factor(RAISES.mil, year, 2026);
    const capMonthly = exFor(year).II / 12;
    v = Math.min(v, capMonthly);
    return round2(Math.round(v * 10) / 10);
  }
  function milTable(year) {
    const t = {};
    Object.keys(MIL_ANCHORS).forEach((g) => (t[g] = MIL_YOS.map((c) => milBasic(year, g, c))));
    return { columns: MIL_YOS.slice(), rows: t };
  }
  function bas(year, grade) {
    const type = milGradeType(grade) === "enlisted" ? "enlisted" : "officer";
    return round2(BAS_2026[type] * factor(RAISES.bas, year, 2026));
  }
  function bah(year, grade, withDependents, locId) {
    const loc = location(locId);
    const m = BAH_MHAS[loc.bahMha];
    const ratio = BAH_RATIO[grade] || 1;
    const junior = ["E-1", "E-2", "E-3", "E-4"].indexOf(grade) >= 0;
    let v = m.e5 * ratio * factor(RAISES.bah, year, 2026);
    if (!withDependents) v *= junior ? BAH_NODEP.junior : BAH_NODEP.other;
    return { monthly: Math.round(v), mhaName: m.name, mha: loc.bahMha, status: m.simulated ? "simulated" : yearStatus(year) };
  }
  // Very rough federal tax advantage of tax-free allowances (BAH + BAS), for
  // illustration only: assumes 12% marginal federal + 4.5% state.
  function taxAdvantage(allowancesAnnual, rate) { return Math.round(allowancesAnnual * (rate || 0.165)); }
  function military(year, grade, yos, locId, withDependents) {
    const basic = milBasic(year, grade, yos);
    if (basic == null) return null;
    const h = bah(year, grade, withDependents, locId);
    const s = bas(year, grade);
    const monthly = round2(basic + h.monthly + s);
    const allowancesAnnual = (h.monthly + s) * 12;
    return {
      system: "MIL", grade, type: milGradeType(grade), yos, basic, bah: h.monthly, bas: s,
      mhaName: h.mhaName, monthly, annual: Math.round(monthly * 12), basicAnnual: Math.round(basic * 12),
      taxAdvantage: taxAdvantage(allowancesAnnual),
      // "Regular Military Compensation"-style figure: cash + tax advantage
      rmc: Math.round(monthly * 12 + taxAdvantage(allowancesAnnual)),
      status: h.status === "simulated" ? "simulated" : yearStatus(year),
    };
  }

  // ---------------------------------------------------------------------------
  // Per diem
  // ---------------------------------------------------------------------------
  function perDiem(year, locId, month /* 1..12 */) {
    const loc = location(locId);
    const pd = PER_DIEM[loc.perDiem] || PD_STD;
    const f = factor(RAISES.perDiem, year, 2026);
    const lodging = Math.round(pd.lodging[(month || 1) - 1] * f);
    const mie = Math.round(pd.mie * f);
    return {
      lodging, mie, total: lodging + mie, firstLastMie: round2(mie * MIE_FIRST_LAST_DAY),
      areaName: pd.name, fiscalYear: "FY" + year,
      status: pd.simulated ? "simulated" : yearStatus(year),
    };
  }
  // Trip: nights of lodging + (nights+1) travel days of M&IE, 75% on first/last day.
  function trip(year, locId, startISO, nights) {
    const start = new Date(startISO + "T12:00:00");
    let lodging = 0, mie = 0;
    const days = [];
    for (let d = 0; d <= nights; d++) {
      const day = new Date(start); day.setDate(start.getDate() + d);
      const pd = perDiem(year, locId, day.getMonth() + 1);
      const isEdge = d === 0 || d === nights;
      const m = isEdge ? pd.firstLastMie : pd.mie;
      const l = d < nights ? pd.lodging : 0;
      lodging += l; mie += m;
      days.push({ date: day.toISOString().slice(0, 10), lodging: l, mie: m, edge: isEdge });
    }
    if (nights === 0) { mie = perDiem(year, locId, start.getMonth() + 1).firstLastMie; days[0].mie = mie; }
    return { lodging, mie: round2(mie), total: round2(lodging + mie), days };
  }

  // ---------------------------------------------------------------------------
  // Equivalence guide (unofficial, for orientation only)
  // ---------------------------------------------------------------------------
  const EQUIVALENTS = [
    { gs: "GS-1 to GS-4", mil: "E-1 to E-4", role: "Entry level / junior enlisted" },
    { gs: "GS-5 to GS-6", mil: "E-5 to E-6", role: "Developing / NCO" },
    { gs: "GS-7 to GS-8", mil: "E-7 to E-9, O-1", role: "Senior NCO / new officer" },
    { gs: "GS-9 to GS-10", mil: "W-1 to W-2, O-2", role: "Journey level" },
    { gs: "GS-11", mil: "W-3, O-3", role: "Experienced professional" },
    { gs: "GS-12 to GS-13", mil: "W-4 to W-5, O-4", role: "Senior specialist / supervisor" },
    { gs: "GS-14", mil: "O-5", role: "Manager / branch chief" },
    { gs: "GS-15", mil: "O-6", role: "Senior manager / division chief" },
    { gs: "SES", mil: "O-7 to O-10", role: "Executive / flag officer" },
  ];

  // ---------------------------------------------------------------------------
  // compute(profile, year, locId) — one normalized breakdown for any pay system.
  // profile = { system: "GS"|"LEO"|"FWS"|"SES"|"MIL", grade, step, schedule,
  //             leap, mgrade, yos, deps }
  // returns { title, annual, rows:[{key,label,annual,taxFree}], notes:[], status, hourly? }
  // ---------------------------------------------------------------------------
  const DEFAULT_PROFILE = { system: "GS", grade: 12, step: 5, schedule: "WG", leap: true, mgrade: "E-5", yos: 6, deps: true, sesPoint: 0.5 };
  function compute(p, year, locId) {
    p = Object.assign({}, DEFAULT_PROFILE, p);
    const loc = location(locId);
    if (p.system === "GS") {
      const r = gs(year, p.grade, p.step, locId);
      const notes = [`Locality area: ${r.localityName} (${r.localityPct}%).`];
      if (r.capped) notes.push(`Capped at Executive Schedule level IV (${fmt.usd(r.cap)}).`);
      return { title: `GS-${p.grade} Step ${p.step}`, annual: r.annual, hourly: r.hourly, status: r.status,
        rows: [{ key: "base", label: "Base pay", annual: r.base }, { key: "locality", label: `Locality pay (${r.localityPct}%)`, annual: r.locality }], notes };
    }
    if (p.system === "LEO") {
      const r = leo(year, p.grade, p.step, locId, { leap: p.leap });
      const notes = [r.special ? "GS-3 to GS-10 LEOs get special base rates above the regular GS table." : "GS-11 and above use the regular GS base table."];
      if (year >= 2026) notes.push("2026 includes the extra 2.8% special adjustment for covered law enforcement officers (3.8% total).");
      if (p.leap) notes.push("LEAP is 25% availability pay for criminal investigators (GS-1811 and similar).");
      const rows = [{ key: "base", label: r.special ? "LEO special base rate" : "Base pay", annual: r.base },
        { key: "locality", label: `Locality pay (${r.localityPct}%)`, annual: r.adjusted - r.base }];
      if (r.leap) rows.push({ key: "leap", label: "LEAP (25%)", annual: r.leap });
      return { title: `LEO GS-${p.grade} Step ${p.step}`, annual: r.annual, hourly: round2(r.adjusted / 2087), status: r.status, rows, notes };
    }
    if (p.system === "FWS") {
      const r = fws(year, p.schedule, p.grade, Math.min(p.step, 5), locId);
      return { title: `${p.schedule}-${r.grade} Step ${Math.min(p.step, 5)}`, annual: r.annual, hourly: r.hourly, status: r.status,
        rows: [{ key: "base", label: `Hourly ${fmt.usd2(r.hourly)} × ${FWS_HOURS_PER_YEAR} hrs`, annual: r.annual }],
        notes: [`Wage area: ${r.areaName}.`, "FWS (blue-collar) pay is set hourly by local wage surveys. It has 5 steps instead of 10. Night shift differentials are not included."] };
    }
    if (p.system === "SES") {
      const r = ses(year);
      const annual = Math.round(r.min + (r.maxCertified - r.min) * (p.sesPoint == null ? 0.5 : p.sesPoint));
      return { title: "Senior Executive Service", annual, status: r.status, range: r,
        rows: [{ key: "base", label: "Base pay (set by agency)", annual }],
        notes: [`2026-style range: ${fmt.usd(r.min)} – ${fmt.usd(r.maxCertified)} (certified appraisal system), or up to ${fmt.usd(r.maxUncertified)} otherwise.`, r.note] };
    }
    // Military
    const m = military(year, p.mgrade, p.yos, locId, p.deps);
    if (!m) return { title: `${p.mgrade}`, annual: null, rows: [], status: "approx", notes: [`${p.mgrade} pay doesn't start until more years of service.`] };
    return { title: `${p.mgrade} · ${p.yos} yrs`, annual: m.annual, status: m.status, mil: m,
      rows: [{ key: "base", label: "Basic pay", annual: m.basicAnnual },
        { key: "bah", label: `BAH (${p.deps ? "with" : "without"} dependents)`, annual: m.bah * 12, taxFree: true },
        { key: "bas", label: "BAS", annual: Math.round(m.bas * 12), taxFree: true }],
      notes: [`Housing area: ${m.mhaName}.`, `BAH and BAS are tax-free. That's worth about ${fmt.usd(m.taxAdvantage)} a year compared with taxable pay (rough estimate).`, "Special and incentive pays (flight, jump, sea, hazardous duty) are not included."] };
  }

  // ---------------------------------------------------------------------------
  // Formatting helpers (shared so all three sites look the same numerically)
  // ---------------------------------------------------------------------------
  const fmt = {
    usd: (n) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US")),
    usd2: (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
    pct: (n) => (n == null ? "—" : n.toFixed(2) + "%"),
  };

  const STATUS_INFO = {
    verified: { label: "Verified", desc: "Matches a published figure we cross-checked." },
    approx: { label: "Approximate", desc: "Close to published tables; not copied cell-for-cell. Verify before relying on it." },
    simulated: { label: "Simulated", desc: "Placeholder data for prototyping. Not real." },
    projected: { label: "Projected", desc: "Future year; based on assumed raises." },
  };

  global.GovPay = {
    CURRENT_YEAR, YEARS, RAISES, STATUS_INFO, EQUIVALENTS, MIL_GRADES, MIL_YOS,
    FWS_SCHEDULES, GS_LOCALITIES, FOCUS_STATES, OTHER_STATES,
    locations: () => LOCATIONS.slice(),
    focusLocations: () => LOCATIONS.filter((l) => !l.simulated),
    location, gs, gsBase, gsTable, leo, leoBase, fws, ses, executiveSchedule,
    milBasic, milTable, bas, bah, military, milGradeType, perDiem, trip, fmt,
    compute, DEFAULT_PROFILE, FWS_HOURS_PER_YEAR,
    sources: {
      gs: "https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/",
      leo: "https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/ (LEO tables)",
      fws: "https://www.cpms.osd.mil/Subpage/WageSchedules/ (DoD FWS schedules)",
      ses: "https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/ (SES/EX)",
      mil: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/",
      bah: "https://www.travel.dod.mil/Allowances/Basic-Allowance-for-Housing/",
      perDiem: "https://www.gsa.gov/travel/plan-book/per-diem-rates",
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
