# The Shadow Market — Specification (MVP: UFLPA × Solar)

Draft v0.5 · November 2026 · Companion to `concept.md`

> **For the build:** start with milestone M1 (§10). Pull data with the Sayari MCP connector and save every response to `data/raw/` before analysing it. Use exposure language everywhere ("linked to", "exposure"), never "uses forced labour". Decisions are in §12; don't change them without noting it there.

---

## 1. Scope

### In scope (MVP)
- One regulation: **Uyghur Forced Labor Prevention Act (UFLPA)**
- One product chain: **solar PV**: polysilicon → wafers → cells → modules
- One destination market: **United States imports**
- Three layers (rule / enforcement / full transparency), regulatory dials, exposure curve, market impact readout
- A single self-contained web page plus the data pipeline that feeds it

### Out of scope (MVP)
- Other regulations (EU Battery Regulation, EU Forced Labour Regulation) → Phase 2
- Price or shortage forecasting
- Real-time data. The MVP uses dated snapshots.
- Product-level (per-shipment) content verification

## 2. Product chain definition

| Stage | Description | HS code(s) (to confirm with `lookup_hs_codes`) |
|---|---|---|
| S1 | Metallurgical / polysilicon | 2804.61 (silicon, ≥99.99% Si) |
| S2 | Ingots & wafers | 3818.00 (doped chemical elements for electronics) |
| S3 | PV cells (not assembled) | 8541.42 |
| S4 | PV modules / panels | 8541.43 |

US imports at S3 and S4 form the headline "market" denominator. S1–S2 are upstream tiers used for tracing, and S1–S2 imports are reported as a separate secondary metric (see §12).

## 3. Layer definitions

### Layer 1: Rule as written
Encoded as a structured config (`rules/uflpa.json`) describing the statute's trigger logic:

- **Target set:** UFLPA Entity List (snapshot dated; 187 entities after 3 Aug 2026 update) + goods made wholly or in part in Xinjiang
- **Presumption:** rebuttable; burden on the importer
- **Reach:** "wholly or in part", so in principle unlimited tier depth
- **De minimis:** none in statute (note: whether CBP applies one in practice is an open research item)

Layer 1 doesn't produce a number. It defines what Layer 3 should test for at its theoretical maximum.

### Layer 2: Enforcement baseline
What has actually been caught.

- **Source A:** CBP UFLPA enforcement statistics (by industry, country of origin, quarter; detained / released / denied / pending, count and value). Captured manually into `data/cbp_uflpa_stats.csv` with a capture date.
- **Source B:** Known public detention cases in solar (company, date, outcome), with source links, in `data/cases.csv`.
- **Limitation:** CBP reports "Electronics", not solar specifically. Treat Electronics as an upper bound for solar and say so in the UI.

### Layer 3: Full-transparency exposure
Computed from Sayari. Each US importer of S3/S4 goods is classified by the deepest exposure Sayari detects.

Sayari risk factors map directly onto tier depth (verified via `lookup_risk_factors`):

| Exposure level | Sayari risk factor(s) | Meaning | Confidence |
|---|---|---|---|
| E0: Listed | `forced_labor_xinjiang_uflpa` | Entity is on the UFLPA Entity List | High |
| E1: Direct | `forced_labor_uflpa_origin_direct`, `forced_labor_xinjiang_origin_direct` | Tier-1 trade with a listed / Xinjiang-based entity | Medium–High |
| E2: Sub-tier | `forced_labor_uflpa_origin_subtier`, `forced_labor_xinjiang_origin_subtier` | Listed / Xinjiang entity at tier 2–3 | Medium |
| E3: Product-relevant sub-tier | `*_origin_subtier_product_blueprint` variants | Product-relevant link at tiers 2–4 (Sayari Product Blueprint) | Medium |
| A1: Ownership-adjacent | `forced_labor_xinjiang_uflpa_adjacent` | One hop from a listed entity (any relationship) | Low |
| R1: Research-named | `aspi_uyghur_forced_labor_report_entity`, `forced_labor_aspi_origin_*`, `forced_labor_sheffield_hallam_university_reports_origin_*` | Named in independent research but not necessarily on the Entity List | Low–Medium |

A flag's confidence can be raised one level when it's independently corroborated (e.g. a public detention case, a company disclosure, or investigative reporting naming the same link) and lowered when Sayari's source records are thin (checked via `get_record`).

Note: Sayari's trade-based risk factors cover the last 730 days of trade activity. The lookback dial is bounded by this.

## 4. Regulatory dials

Each dial is a filter over the Layer 3 classification. Default positions approximate current practice.

| Dial | Positions | Default |
|---|---|---|
| **Tier depth** | Listed only (E0) → Direct (E1) → Tiers 2–3 (E2) → Tiers 2–4 product-relevant (E3) | E1 |
| **Trigger scope** | Entity List only → + Xinjiang-based entities → + research-named entities (R1) | Entity List + Xinjiang |
| **Ownership reach** | Off → include one-hop adjacent (A1) | Off |
| **Value basis** | Count of importers / share of import value | Import value |

**Exposure curve:** for each dial, compute exposure at every position with the others held at default. Plot as a step chart. A "cliff" is flagged when one step at least doubles exposed import value **and** adds at least 5 percentage points of market share (both tunable; see §12).

## 5. Market impact metrics

Computed for any dial configuration:

| Metric | Definition |
|---|---|
| **Exposed share** | Exposed US import value ÷ total US import value (S3+S4, snapshot window) |
| **Tolerated exposure** | Layer 3 exposed value − Layer 2 detained value (same window, Electronics upper bound) |
| **Remaining suppliers** | Count of exporters supplying US S3/S4 with no flag under current configuration |
| **Concentration after removal** | HHI of remaining supply, by exporter and by country of export |
| **Replacement time (assumption)** | Sector assumption with source, e.g. months to qualify a new module supplier. Displayed as an input, not a result |

## 5a. Evidence layer (question 3)

The evidence layer explains *why* the regulation's boundaries sit where they do. It's a headline feature, built from as many independent sources as possible.

### Source register (`data/evidence/sources.csv`)
One row per source: `source_id, title, publisher, date, url, source_type, partisan (y/n), notes`.

| Source type | Examples for UFLPA × solar | Default reliability |
|---|---|---|
| Primary official | Statute; Federal Register Entity List notices; FLETF strategy and annual updates; CBP enforcement statistics and operational guidance; congressional hearing transcripts | High |
| Formal submissions | Public comments on the FLETF strategy; Senate/House lobbying disclosures (LDA filings) mentioning UFLPA; written testimony; importers' securities filings (risk factor sections) | High for *what was said*, not for whether it's true |
| Independent analysis | Think tank reports (e.g. CSIS); academic research (e.g. Sheffield Hallam); law firm / trade compliance analysis; investigative journalism | Medium |
| Advocacy / industry | Solar industry associations; human rights NGOs | Low (positions, not facts) |

### Claim register (`data/evidence/claims.csv`)
One row per claim: `claim_id, claim_text, claim_type, dial, sources[], confidence, counter_evidence, notes`.

- **claim_type:** `fact` (something happened), `position` (someone argued X), `interpretation` (our reading)
- **dial:** links the claim to the regulatory design choice it explains (tier depth, trigger scope, etc.)
- **counter_evidence:** alternative explanations must be recorded where they exist (enforcement capacity, legal constraints, data limits)

### Confidence rules
| Level | Rule |
|---|---|
| High | Stated directly in a primary official document, or matter of public record |
| Medium | Two or more independent non-primary sources agree, or a reasonable reading of primary documents |
| Low | One secondary source, or our own inference |

An **intent claim** (question 2) can be reported only as "evidence consistent with a deliberate choice", and only when there's both a data cliff at that dial and at least one medium-or-higher source showing the boundary was contested or chosen.

### Research questions to work through for UFLPA × solar
1. How has enforcement of solar changed over time (detention spikes, release rates), and what did officials say at each point?
2. What did the solar industry and other stakeholders argue during the strategy consultations and in lobbying?
3. Has CBP guidance on supply chain tracing documentation narrowed or widened what importers must prove?
4. What explains changes in enforcement intensity (e.g. reported slowdowns in 2025, then the large Entity List expansion in 2026)?
5. Where does the record point to capacity or legal limits rather than choices?

## 5b. Simulation (Monte Carlo)

### Question
For each regulatory threshold (dial configuration), what is the distribution of supply disruption outcomes for the US solar module/cell market?

### Uncertain inputs
Each input is a probability distribution with a documented source. Defaults below are structural; actual ranges come from the data and evidence layers.

| Input | What it represents | Distribution basis |
|---|---|---|
| **True-exposure rate** per exposure level (E0–E3, A1, R1) | Share of flagged supply that genuinely contains the targeted input | Narrow for High confidence, wide for Low (e.g. Beta distributions whose width follows the confidence level) |
| **Hidden exposure** | Exposure in supply where trade data is missing | Range informed by coverage gaps; wide by default |
| **Enforcement probability** | Chance a genuinely exposed shipment is stopped at a given threshold | Calibrated against CBP detention rates at current settings |
| **Release rate** | Share of detained goods later released | Empirical, from CBP detained/released/denied figures |
| **Replacement capacity** | Volume clean suppliers can add, and how fast | Sourced industry capacity estimates; ramp-up time range |
| **Inventory buffer** | Months of supply already in the US pipeline | Range from industry/trade sources |
| **Rerouting / evasion** | Share of blocked supply that re-enters via other routes (transshipment) | Wide range, sourced from enforcement cases and research |

Correlations: inputs that move together (e.g. hidden exposure and rerouting) are sampled jointly, or the correlation is stated as an assumption.

### Outputs (per threshold, from ~10,000 runs)
- **Supply gap:** distribution of % of US market supply removed (median + 5th–95th percentile)
- **Probability of significant disruption:** P(gap > X%). Default X = **20%** of US market supply; adjustable on the page
- **Duration:** distribution of months until clean supply refills the gap
- **Concentration after removal:** HHI distribution
- **Threshold curve:** P(significant disruption) plotted against dial position, the probabilistic version of the "cliff"
- **Sensitivity (tornado chart):** which input moves the result most, i.e. where better data matters

### Rules
- Every distribution shows its source and confidence; users can edit ranges on the page.
- Results are labelled as scenarios, not forecasts.
- Price effects are out of scope for v1 (see §13).
- Runs in the browser (JavaScript), seeded so results are reproducible for the class demo.

## 6. Data pipeline

```
1. Market universe      search_buyers / search_trade_facets (HS 8541.42/.43, destination US)
                        → list of US importers + their exporters + values
2. Exporter enrichment  get_entity_profile / check_watchlist per exporter
                        → risk factors attached to each exporter
3. Upstream tracing     get_upstream_supply_chain for top-N exporters by value
                        → tier map S1–S4 for the flow diagram
4. Classification       assign each exporter its exposure levels (E0–E3, A1, R1)
5. Aggregation          compute metrics for every dial combination → precomputed JSON
6. Layer 2 merge        join CBP stats + cases by window
```

- **Snapshot discipline:** every pull is saved with timestamp to `data/raw/` and never edited. Derived files are regenerated from raw.
- **Top-N limit:** upstream tracing is expensive. Trace the exporters that together make up ~80% of import value; report the remainder as "not traced".
- **Coverage flags:** each exporter carries a `trade_coverage` note (e.g. "origin-country export data unavailable") so the UI can grey out uncertain areas.

### How data is pulled
- Claude Code in VS Code calls the Sayari MCP tools and saves each response as JSON in `data/raw/` named `{YYYY-MM-DD}_{tool}_{query-slug}.json`.
- Python scripts in `pipeline/` read only from `data/raw/` and write to `data/derived/`, so the analysis can be rerun without new Sayari calls.
- Facet tools (`search_trade_facets`, `search_entity_facets`) are called first to size each query before pulling rows.
- If the project continues past the class demo, the pulls can be moved to scripts against the Sayari API.

## 7. Interface

Single self-contained HTML page.

1. **Header:** regulation, product, data snapshot date, coverage warning.
2. **Flow diagram (Sankey):** tiers S1 → S4 → US market. Flagged volume shaded by exposure level. Untraced/unknown volume shown in grey, not omitted.
3. **Dials panel:** the four dials from §4.
4. **Impact readout:** exposed share, tolerated exposure, remaining suppliers, HHI before/after, replacement time assumption.
5. **Exposure curve:** step chart per dial, with cliffs marked.
6. **"Why the line is here" panel (question 3), given equal prominence with the flow diagram:**
   - A timeline of regulatory events (Entity List updates, guidance, detention spikes, consultations, lobbying activity) with source links.
   - When a dial is selected, the panel shows the claims linked to that dial: what the record says about why the boundary sits there, alternative explanations, and the confidence level of each claim.
   - Each claim is badged by type (*fact / position / interpretation*) and confidence (*high / medium / low*).
7. **Company view:** named exporters/importers with their exposure level, confidence, and the underlying Sayari source records. Shown where relevant (e.g. top exposed suppliers, known detention cases).
8. **Simulation page** (separate tab): threshold selector, editable input ranges, outcome histograms with percentile bands, the threshold curve, and the sensitivity chart (§5b).
9. **Method & limits:** always visible link; plain-language caveats from concept §8.

### Display rules
- Language is always "exposure" / "link", never "uses forced labour" or "violates".
- Companies are named with their exposure level, confidence and source; never named without all three.
- Every number and claim has a hover showing its source(s), snapshot date and confidence.

## 8. Validation

- **Sanity check vs Layer 2:** Layer 3 at the "Listed only / Direct" setting should be on the same order as CBP detentions. If it's wildly larger or smaller, investigate before trusting deeper settings.
- **Known-case check:** publicly reported detained exporters should appear flagged at E0/E1. Missed cases → entity resolution problem.
- **Before/after Entity List expansion:** rerun classification with the pre-August 2026 list (144 entities) vs current (187) as a natural experiment.
- **Manual spot checks:** 10 randomly sampled flagged exporters reviewed by hand via `get_record` source documents.

## 9. Repository layout

```
shadow-market/
├── concept.md
├── specification.md
├── rules/uflpa.json
├── data/
│   ├── raw/                 # timestamped Sayari pulls (immutable)
│   ├── cbp_uflpa_stats.csv
│   ├── cases.csv
│   ├── evidence/
│   │   ├── sources.csv
│   │   ├── claims.csv
│   │   └── timeline.csv
│   └── derived/metrics.json
├── pipeline/                # classification + aggregation scripts
└── site/index.html
```

## 10. Milestones

| # | Milestone | Output |
|---|---|---|
| M1 | Confirm HS codes; pull market universe for S3/S4 US imports | Importer/exporter table with values |
| M2 | Enrich exporters with risk factors; classify E0–E3/A1/R1 | Classified exporter table |
| M3 | Capture CBP stats + solar cases (Layer 2) | `cbp_uflpa_stats.csv`, `cases.csv` |
| M4 | Compute metrics for all dial combinations; draft exposure curves | `metrics.json` + first findings |
| M5 | Upstream tracing for top exporters; build Sankey data | Tier flow data |
| M5a | Evidence layer: build source register, work through §5a research questions, grade claims | `sources.csv`, `claims.csv`, `timeline.csv` |
| M6 | Build interface | `site/index.html` |
| M6a | Simulation: set input distributions from M2–M5a findings; build simulation page | Simulation tab |
| M7 | Validation pass (§8) + independent review of high-stakes claims (named companies, intent claims) | Validated v1 for class |

M5a runs in parallel with M1–M5: the evidence research doesn't depend on the Sayari data, and early findings may suggest which dials matter most.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Trade coverage gaps make exposure look smaller than it is | Show coverage explicitly; report "unknown" as its own category |
| Over-flagging via loose entity matching | Spot checks; prefer product-blueprint factors for headline numbers |
| Sayari query volume / rate limits | Top-N tracing; cache everything |
| Naming companies creates reputational/legal issues | Name only with exposure level + confidence + source; exposure language only; spot-check every named company against source records |
| Overclaiming intent | Claim types, confidence levels, required counter-evidence, and the "consistent with" rule (§5a) |
| Evidence layer skews toward partisan sources | Source-type tagging; advocacy/industry sources capped at Low confidence for facts |

## 12. Decisions

| Topic | Decision | Reason |
|---|---|---|
| Data pull | Sayari MCP connector, run from Claude Code in VS Code; every pull saved as JSON to `data/raw/` | No API keys needed; snapshots make it repeatable |
| Time window (Layer 3) | **Full 730-day window**, split into quarters | Matches the window Sayari's trade risk factors are computed on, so flags and trade values line up. Covers the 2025 enforcement slowdown and the August 2026 Entity List expansion, so quarters allow before/after comparison |
| Time window (Layer 2 + evidence) | **June 2022 to present** | Full enforcement history gives context for the timeline and calibrates the simulation, even though Sayari exposure only covers the last two years |
| Market denominator | **Headline = US imports of PV cells + modules (S3+S4).** Polysilicon and wafer imports (S1–S2) reported as a separate secondary metric | Cells and modules are what the US market actually buys; S1–S2 imports are small and would distort the headline share, but matter for the domestic manufacturing story |
| Cliff threshold | A step is a cliff if exposed value **at least doubles** *and* the step adds **at least 5 percentage points** of market share | The 2× rule alone would flag tiny bases doubling; the absolute floor stops that. Both values are tunable and shown in the method notes |
| Case order | 1 solar (UFLPA), 2 cotton/apparel (UFLPA), 3 cocoa (EU Deforestation Regulation) | |
| Significant disruption | Supply gap above 20% of US market supply (adjustable) | |
| Price effects | Deferred to a later version (§13) | |

All decisions can be revisited; record changes here with a date.

## 13. Later versions

### Price effects (deferred from v1)
**Why not v1:** we can't yet estimate price effects accurately enough to meet the tool's own confidence standards.
- **Attribution problem:** US solar prices over 2022–2026 were moved by several overlapping policies at once (UFLPA, Section 201 and 301 tariffs, anti-dumping/countervailing duties on Southeast Asian imports, domestic manufacturing incentives) plus global oversupply. Separating UFLPA's share isn't credible without a proper econometric design.
- **Data access:** the best module price series (e.g. InfoLink, BNEF, PVinsights) are mostly paywalled; public series (e.g. national lab benchmarks, industry quarterly reports) are coarser.
- **Elasticities:** published estimates of US module demand and supply elasticity are sparse and vary widely, so a price model would mostly reflect our assumptions.

**What v2 would need:**
1. A consistent US module price series (public or licensed)
2. A dated policy-event timeline (already partly built in the evidence layer) to separate overlapping shocks
3. Sourced elasticity ranges, entered as distributions in the simulation
4. A validation test: does the model reproduce the 2022 detention-period price movement?

**Possible v1.5 compromise:** show historical US module prices alongside the enforcement timeline as *context only*, clearly labelled as not attributable to UFLPA alone.
