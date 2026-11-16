# Build brief: "Proposed rule" page (Case 2: optical transceivers × FCC Covered List)

For Claude Code in VS Code, working in the `Shadow-Market` repo. Read this whole file before writing any code.

---

## 0. Read first

1. `.claude/HANDOFF.md`, `DECISIONS.md`, `README.md`. Every rule in "Rules that must hold" still applies.
2. `site/index.html`, `site/app.js` (especially `route()`, `renderPresets`, `renderControls`, `renderSim`), `site/sim.js`, `site/styles.css`, `pipeline/sim_inputs.json`.
3. The six screenshots, for the design. The current look (ink navy on paper, ochre accent, Inter Tight + Source Sans 3) is binding (DECISIONS #25). Don't add new fonts or colours.

Don't ask the user questions mid-build. Log judgement calls as new numbered entries in `DECISIONS.md` (continue from #26), dated with the build day.

---

## 1. What we're adding, and why

A fourth tab, **"Proposed rule"** (`#proposed`), that turns The Shadow Market from a tool about enacted rules into one that can also test **anticipated** rules.

The idea: a new piece of intelligence about a possible regulation comes in (a news report, a bill, a draft order). The user **injects** it into the simulation as a scenario, sets how sure we are of it, and sees:

1. **What the rule would cover vs. what's actually in the supply chain.** This is the same gap lens as the UFLPA case, applied before the rule exists.
2. **What could happen to supply** across thousands of simulated futures.
3. **What it means for data-centre deployment and design**, as a neutral checklist of decisions the scenario puts in play.

The demo case is US restrictions on Chinese optical transceivers for AI data centres. The class will later replace the illustrative supply figures with their own Sayari analysis of real parts and entities (§7).

### Neutrality (binding)

This page is shown in class and must take **no side** on whether the rule is good policy.

- Present the **security rationale** and the **supply/cost concerns** with equal weight, each with sources.
- Don't use evaluative words for the rule or its critics ("loophole", "weak", "caving", "reckless"). Say "not covered", "outside scope", "exempted".
- Stakeholder positions appear as **attributed, sourced statements** (§6.5), never as the tool's voice.
- Results are worded as conditional ("in this scenario, …"), never as forecasts or recommendations.
- Don't name a company as a risk. Name companies only as **named in a source** (a bill, a list, a market-share report), with the source attached. This keeps the existing exposure-language rule.
- Use "US", "Chinese", "non-Chinese" as factual descriptors of incorporation or manufacturing location only.

---

## 2. The scenario as given (intel), with verified status

This is the brief from a colleague, checked against sources on 2026-11-16. The page must show each item with its **source tier**: `primary` (the official document itself), `reported` (named outlet, anonymous or secondary sourcing), or `unverified`.

| # | Signal | Tier | What the sources actually say | Sources |
|---|---|---|---|---|
| I-1 | Component rule in force | primary | FCC 26-50 (Third Report & Order, ET Docket 21-232), adopted 22 Jul 2026, effective **13 Oct 2026**. Denies new authorisation to devices containing a *logic-bearing hardware component* produced by a Covered List entity. It applies to **new authorisations only**, and pending applications are grandfathered unless amended. **Firmware/software components excluded "at this time."** **Only producer-based Covered List entries trigger it** (e.g. Huawei, ZTE), so it does **not** currently reach InnoLight or Eoptolink optics, which aren't on the Covered List. | PR-001, PR-002, PR-003, PR-004 |
| I-2 | Transceiver ban being drafted | **reported** | Reuters (4 Aug 2026, four unnamed sources): FCC drafting a ban on imports of **new models** of Chinese optical transceivers. **No FCC threat determination has been published.** | PR-010, PR-011 |
| I-3 | Phase-in from 3.2T (≈2028–29) | **reported** | From reporting on Morgan Stanley meetings in Washington; 3.2T expected to ramp around 2028–29; current 800G/1.6T outside the initial focus. | PR-012, PR-013 |
| I-4 | ≥65% US BOM-value exemption | **reported** | Economic Daily News citing Morgan Stanley. Precedent cited by analysts: a 65% domestic-content standard for drones. Relevant because Chinese-assembled modules use US DSPs (Broadcom, Marvell) and US/Japanese lasers (Lumentum, Coherent, Mitsubishi Electric). | PR-013, PR-014, PR-015 |
| I-5 | Trigger ambiguity: entity vs origin | reported (analysis) | If the rule follows **point of manufacture**, the Thailand lines InnoLight and Eoptolink built for North American demand may fall outside it. Industry is also unsure whether it covers finished modules only or components too, and subsidiaries. | PR-016, PR-017 |
| I-6 | S.5548, federal national-security systems | primary | *Securing National Security Systems from Chinese Optical Transceivers Act of 2026* (introduced 25 Sep 2026; McCormick, Gallego, Cornyn, Fetterman). Names InnoLight, Eoptolink, subsidiaries/affiliates, plus entities later designated by DoW/Commerce. **Five-year transition**; FAR Council to update rules within three years. Status: introduced, referred to HSGAC. | PR-020, PR-021 |
| I-7 | InnoLight on 1260H list | primary | DoW 1260H list update, **8 Jun 2026** (188 entities). Includes Zhongji Innolight. Section 805 procurement prohibition effective 30 Jun 2026. | PR-022, PR-023 |
| I-8 | Power inverters | primary, **with correction** | Added to Covered List 28 Jul 2026 (DA 26-786) unless DoW/DHS Conditional Approval. **Narrowed 20 Aug 2026** to foreign-produced, *utility-interactive* inverters meeting **UL 1741** with remote-communications capability. Previously authorised models unaffected. Conditional Approval applications due by 1 Jan 2028. Whether data-centre UPS/BESS equipment falls in scope depends on that definition. Present it as a question to check, not a conclusion. | PR-030, PR-031, PR-032 |
| I-9 | Routers | primary, **with correction** | Added 23 Mar 2026 (DOC-420034A1). Scope is **consumer-grade** routers (residential, customer-installed), so it's generally not data-centre networking gear. Conditional Approvals so far run to **1 Oct 2027** (some to 5 Dec 2027). OET firmware-update waiver to 1 Mar 2027. | PR-033, PR-034, PR-035 |

Market context (all `reported`/analyst estimates; show as ranges):
- InnoLight ≈ 27% of global data-centre transceiver revenue (Counterpoint) or ≈ 34% of datacom optical component revenue in 1Q26 (Cignal AI).
- Chinese manufacturers ≈ 60% of revenue and ≈ two-thirds of units (Counterpoint).
- InnoLight + Eoptolink ≈ 60% of NVIDIA 800G volume (Counterpoint).
- Non-Chinese suppliers (Coherent ≈ 17%, Lumentum, Broadcom, AAOI …) are reported to be capacity-constrained.

Sources: PR-012, PR-014, PR-016, PR-018, PR-019.

---

## 3. Source register

Create `data/evidence/sources_proposed.csv` with the **same columns** as `sources.csv` (`source_id,title,publisher,date,url,source_type,partisan,accessed,notes`).

- `source_type`: `primary_official`, `news_reported`, `analyst`, `law_firm_analysis`, `legislator_statement`, `industry_statement`.
- `partisan`: `n` unless a party/advocacy statement.
- Fetch each URL before adding it. If a URL doesn't resolve, keep the row and set `notes` to "URL not verified at build". **Don't invent replacements.**

| id | title | publisher | url |
|---|---|---|---|
| PR-001 | FCC 26-50 Third Report and Order and Third FNPRM, ET Docket 21-232 | FCC | https://docs.fcc.gov/public/attachments/FCC-26-50A1.pdf |
| PR-002 | Federal Register summary of FCC 26-50 (effective 13 Oct 2026) | Federal Register | https://public-inspection.federalregister.gov/2026-18535.pdf |
| PR-003 | Chairman Carr statement on component part loophole | FCC | https://docs.fcc.gov/public/attachments/DOC-422722A1.pdf |
| PR-004 | FCC component rule: producer-based entries only (analysis) | Carra Globe | https://carraglobe.com/?p=11676 |
| PR-010 | Exclusive: Trump administration drafting ban on Chinese data center devices | Reuters (via AJOT) | https://www.ajot.com/news/exclusive-trump-administration-drafting-ban-on-chinese-data-center-devices-sources-say |
| PR-011 | US FCC weighs Chinese transceiver supply chain crackdown | BankInfoSecurity | https://www.bankinfosecurity.com/us-fcc-weighs-chinese-transceiver-supply-chain-crackdown-a-32584 |
| PR-012 | FCC ban on new Chinese optical modules | Cignal AI | https://cignal.ai/2026/08/fcc-ban-on-new-chinese-optical-modules/ |
| PR-013 | FCC optical module rules update | ROC Telecom | https://roctelecom.com/insights/fcc-optical-module-rules-update/ |
| PR-014 | Innolight, Coherent, Lumentum: who wins and loses in the proposed FCC ban | Counterpoint Research | https://counterpointresearch.com/en/insights/fcc-china-ban-ai-component |
| PR-015 | Microsoft reportedly urges US to drop proposed transceiver ban | TrendForce | https://www.trendforce.com/news/?p=66486 |
| PR-016 | Chinese optical transceiver ban: what procurement should know | Fusion Worldwide | https://info.fusionww.com/blog/chinese-optical-transceiver-ban-what-procurement-should-know |
| PR-017 | Proposed US ban threatens AI data center boom | Fierce Network | https://www.fierce-network.com/broadband/proposed-us-ban-chinese-optical-transceivers-threatens-ai-data-center-boom |
| PR-018 | FCC proposes import ban on Chinese optical transceivers | Tom's Hardware | https://www.tomshardware.com/tech-industry/fcc-proposes-import-ban-on-chinese-optical-transceivers-blockade-targets-key-ai-interconnects-as-china-holds-56-percent-global-market-share |
| PR-019 | Microsoft fighting proposed ban on Chinese optical transceivers | SDxCentral | https://www.sdxcentral.com/news/microsoft-fighting-trump-administrations-proposed-ban-on-chinese-optical-transceivers-report/ |
| PR-020 | S.5548, 119th Congress (bill text and status) | Congress.gov | https://www.congress.gov/bill/119th-congress/senate-bill/5548 (verify; fallback summary https://www.quiverquant.com/bills/119/s-5548) |
| PR-021 | Senate bill targets Chinese transceivers in federal networks | MyChesCo | https://www.mychesco.com/a/news/government/senate-bill-targets-chinese-transceivers-in-federal-networks/ |
| PR-022 | Pentagon adds 65 entities to the 1260H list | WilmerHale | https://www.wilmerhale.com/en/insights/client-alerts/20260611-pentagon-adds-65-new-entities-to-the-1260h-list-of-chinese-military-companies |
| PR-023 | Moolenaar statement on 1260H additions (lists Zhongji Innolight) | House Select Committee on the CCP | https://chinaselectcommittee.house.gov/media/press-releases/moolenaar-american-companies-governments-should-cut-ties-with-new-pentagon-listed-chinese-military-companies |
| PR-030 | FCC adds foreign-produced power inverters to the Covered List | Steptoe | https://www.steptoe.com/en/news-publications/global-trade-and-investment-law-blog/fcc-adds-foreign-produced-power-inverters-to-the-covered-list.html |
| PR-031 | Power inverter designation narrowed (20 Aug 2026) | Davis Wright Tremaine | https://www.dwt.com/blogs/broadband-advisor/2026/09/fcc-covered-list-power-inverters-update |
| PR-032 | Conditional Approval process for inverters | Morgan Lewis | https://www.morganlewis.com/pubs/2026/08/fcc-adds-foreign-produced-advanced-robotic-devices-and-power-inverters-to-covered-list-opens-conditional-approval-process |
| PR-033 | FCC adds foreign-made consumer routers to the Covered List | FCC | https://docs.fcc.gov/public/attachments/DOC-420034A1.pdf |
| PR-034 | Conditional approvals for UAS and routers (expiry dates) | FCC (DA 26-548) | https://docs.fcc.gov/public/attachments/DA-26-548A1.pdf |
| PR-035 | Consumer-grade scope of the router entry | Womble Bond Dickinson | https://www.womblebonddickinson.com/us/insights/federal-government/102mojk/fcc-adds-foreign-produced-consumer-routers-to-banned-equipment-list |

The primary sources for I-2, I-3 and I-4 **don't exist yet**. The page must say so plainly: "No official text has been published. These parameters come from press and analyst reporting."

Also create `data/evidence/claims_proposed.csv` (same columns as `claims.csv`; use the `dial` column for the lever id from §5). Write one claim per row of §2, plus the stakeholder statements in §6.5. Each claim gets `confidence` (high = primary, medium = multiple reported sources agree, low = single reported source) and `counter_evidence` where any exists.

---

## 4. File layout (new files only, plus small edits)

```
rules/proposed/transceivers.json        scenario definition: levers, defaults, intel cards (§5)
data/proposed/transceivers/supply.json  supply segments, illustrative, each value with status + source (§6.2)
data/proposed/transceivers/part_map.template.json   student plug-in schema (§7)
data/evidence/sources_proposed.csv      §3
data/evidence/claims_proposed.csv       §3
pipeline/build_proposed.py              validates the above, merges a part_map if present, writes site/data_proposed.js
site/proposed.js                        page rendering + scenario engine (uses SM helpers from sim.js)
```

Edits:
- `site/index.html`: add the tab `<a href="#proposed" data-view="proposed">Proposed rule</a>` (between "What if?" and "Method & limits"), a `<main class="view" id="view-proposed">` block, and `<script src="data_proposed.js"></script><script src="proposed.js"></script>` after `sim.js`.
- `site/app.js`: make `route()` recognise `proposed` and call `window.SM.renderProposed()` on first show and on resize. Don't change other behaviour.
- `site/sim.js`: expose the existing helpers without changing results. Add `SM.rng = mulberry32; SM.triInv = triInv; SM.normal = normal; SM.phi = phi;`. Re-run the existing sim before and after and confirm identical output for the same seed.
- `README.md`: add the new files to Layout and the build command.
- Method & limits page: add a "Proposed rule (Case 2)" card with the limits in §9.

`site/data_proposed.js` is generated. Never hand-edit it, same as `data.js`.

---

## 5. Scenario definition: `rules/proposed/transceivers.json`

### 5.1 Levers (the rule's design choices)

Each lever has `id`, `label` (plain English), `options` or a range, `default`, and `source_ids` showing where the default comes from.

| id | Plain label | Options / range | Default (from intel) |
|---|---|---|---|
| `trigger` | Who the rule catches | `named` = named companies only (InnoLight, Eoptolink + subsidiaries, as in S.5548) · `entity` = any Chinese-headquartered maker, wherever it builds · `origin` = anything **made in** China, whoever owns it · `entity_or_origin` = both | `entity` (I-2; ambiguity flagged, I-5) |
| `generation` | Which products | `3.2T+` · `1.6T+` · `all_new` | `3.2T+` (I-3) |
| `installed` | Existing equipment | `new_models_only` · `also_existing_models` (stops new sales of already-authorised models; not the installed base) | `new_models_only` (I-1, I-2) |
| `scope` | Which buyers | `federal_nss` (S.5548-style) · `all_us` (FCC authorisation-style) | `all_us` |
| `exemption` | Domestic-content exemption | off / on, with threshold slider 40–90% of BOM value from US companies | on, 65% (I-4) |
| `start_year` | When it starts | 2027–2031 | 2028 |
| `transition_years` | Phase-in period | 0–5 | 0 (FCC style); preset for S.5548 = 5 |

### 5.2 Intelligence cards (the "inject" mechanism)

An **intel card** is a structured record of one piece of intelligence and what it implies for the levers:

```json
{
  "id": "I-3",
  "headline": "Ban reported to phase in from the 3.2T generation",
  "date": "2026-10",
  "tier": "reported",            // primary | reported | unverified
  "confidence": "medium",        // high | medium | low
  "source_ids": ["PR-012", "PR-013"],
  "sets": { "generation": "3.2T+" },
  "note": "From analyst notes of meetings in Washington; no official text."
}
```

Ship cards I-1 to I-9 from §2. The page shows them as a stack. Each card has a toggle **"Apply to scenario"**. Applying a card sets its levers. Later cards override earlier ones, and the UI shows which card set each lever (small "set by I-3" label next to the lever).

**"Add new intelligence"** form fields:
- headline
- date
- tier
- confidence
- source URL (free text)
- which levers it changes (choose from the §5.1 list)

A new card is stored in `localStorage` under `sm.proposed.cards`. Wrap every read and write in `try/catch` and fall back to in-memory. There are also "Export cards (JSON)" and "Import cards" buttons, so a student can share a scenario. Custom cards are always badged "added by you, not in the source register".

**Confidence drives uncertainty.** When the levers come from cards, the simulation treats each card-set lever as *uncertain in proportion to the card's confidence*:
- high → the lever is fixed at the card's value.
- medium → in 25% of simulated futures the lever takes the next-most-likely option instead.
- low → 50%.

The "next-most-likely option" for each lever is defined in the JSON (e.g. `generation`: 3.2T+ → 1.6T+; `trigger`: entity → origin; `exemption` threshold ± 10 pp). This is how "how sure are we?" enters the results. Log the rule in DECISIONS.

### 5.3 Presets (buttons, same pattern as the existing `presets`)

- **As reported**: cards I-1 to I-5 applied (entity, 3.2T+, new models, all US, 65% exemption, 2028).
- **Federal systems only (S.5548)**: `trigger=named`, `scope=federal_nss`, `transition_years=5`, start = enactment year + 0 (default 2027), exemption off.
- **Broader: by origin, from 1.6T**: `trigger=origin`, `generation=1.6T+`, no exemption.
- **Broadest**: `entity_or_origin`, `all_new`, no exemption, start 2027.
- **No new rule**: baseline, so users can see the status quo (component rule only, which catches no transceiver segment).

Preset labels must be descriptive, not evaluative. Don't use "tough", "weak" or "strict".

---

## 6. The page: sections, top to bottom

Reuse the existing classes: `hero`, `sec-head`, `panel`, `readout`, `controls`, `chips`, `tbl`, `legend`, `analysis`, `kicker`, `lede`, `display`. Match the "What if?" page structure so the two read as one tool.

### 6.1 Hero

- Kicker: `Proposed rule · Case 2 · Optical transceivers`
- H1: `What if the rule changes?` / soft line: `Testing a regulation before it exists.`
- Lede (≈60 words): a new kind of question, not "what does today's rule miss?" but "if this reported rule arrives, what would it cover, what would it leave out, and what would change for the people building data centres?" Say plainly that the core rule **has not been published**, and that the page runs on reported parameters and illustrative supply figures.
- A visible banner, reusing the "scenario, not forecast" pattern: **"Scenario, not forecast. Parameters marked *reported* have no official text yet."**

### 6.2 "What's known": the intel stack

A two-column layout on desktop, stacked on mobile.

- **Left:** a timeline of the signals so far, from `data/evidence` with tier badges. Include 8 Jun 1260H, 23 Mar routers, 28 Jul / 20 Aug inverters, 22 Jul → 13 Oct component rule, 4 Aug Reuters report, 25 Sep S.5548, and Oct reports on 3.2T / 65%.
- **Right:** the intel cards (§5.2), with apply toggles and the "Add new intelligence" button.

Tier badges use existing confidence styling (`confClass`): primary → high, reported → medium, unverified → low. **Add a text label as well as colour.**

### 6.3 "The rule on paper vs. the supply chain": the gap view (the heart of the page)

This mirrors "One rule, three readings".

**Supply segments.** `data/proposed/transceivers/supply.json` holds segments of US AI data-centre transceiver supply. Each segment has these fields:

```json
{
  "id": "inno_cn",
  "label": "InnoLight, made in China",
  "hq": "CN",
  "site": "CN",
  "named_in": ["PR-020"],
  "share_pct": {"centre": 18, "spread": 6},
  "us_bom_pct": {"centre": 55, "spread": 15},
  "gen_mix": {"800G": 0.5, "1.6T": 0.4, "3.2T": 0.1},
  "status": "placeholder",
  "source_ids": ["PR-012", "PR-014"]
}
```

The segments are:
- InnoLight, made in China
- InnoLight, made in Thailand
- Eoptolink, made in China
- Eoptolink, made in Thailand
- Other Chinese-HQ makers, made in China (HG Genuine, Accelink, Source Photonics, CIG, as named in PR-012/PR-014/PR-016)
- Non-Chinese makers, made in Thailand/Malaysia/elsewhere
- Non-Chinese makers, made in the US

The numbers must satisfy three constraints:
- Shares are illustrative but **anchored to the reported ranges in §2**: Chinese-HQ total ≈ 55–65%, InnoLight ≈ 27–34%, Eoptolink ≈ 10–15%.
- The China/Thailand split within each maker is **unknown**. Give it a wide placeholder range and say so.
- `us_bom_pct` is **unknown**. Default centre 50%, spread 20. Note in `source` that DSP + laser content from US companies "could approach" the 65% threshold (PR-013), with no public BOM data.

Every placeholder value gets the existing grey **placeholder** badge. If `part_map.json` (§7) exists, `build_proposed.py` replaces these values and flips the status to `from_student_analysis`, with the student's source ids.

**Visual.** A horizontal stacked bar (100% = US AI data-centre transceiver supply) with one band per segment. Under it are three rows, using the same bar and the current lever settings:
1. **"In the rule's sights"**: segments the trigger reaches (named / entity / origin logic below).
2. **"Covered when it starts"**: that, × the share of each segment's output in the covered generations in the start year.
3. **"Left after exemptions"**: that, × the probability a segment's modules fall below the BOM threshold (the triangular CDF of `us_bom_pct` at the threshold).

Then a callout with three plain-language numbers:
- **Covered by the rule** (row 3, start year).
- **Linked to a named or Chinese-HQ maker but not covered**: Chinese-HQ share minus row 3. Label it neutrally: *"linked to named or Chinese-headquartered makers, outside this rule's scope"*. This is this case's version of the shadow market.
- **Already installed and unaffected**: a text statement, not a number. Under every preset except none, equipment already in data centres stays in place until normal refresh (PR-013).

Each number is **"Why?"-expandable**, showing which lever produced the difference ("Thailand-made modules are outside an origin-based rule" or "the 65% exemption removes an estimated X–Y%").

**Trigger logic** (put it in the JSON, not hard-coded):
- `named`: segments whose `named_in` includes PR-020.
- `entity`: `hq == "CN"`.
- `origin`: `site == "CN"`.
- `entity_or_origin`: either.
- `scope=federal_nss`: multiply all by the federal NSS share of demand. This is a placeholder (centre 3%, spread 2, "no public figure; federal NSS is a small fraction of hyperscale demand"). Mark it clearly.

### 6.4 Simulation: "What could happen to supply"

New engine in `site/proposed.js`. Use `SM.rng`, `SM.triInv`, `SM.normal`, `SM.phi`, `SM.summarise`. Default seed `20261116` and 10,000 runs, same as the existing page.

Model, yearly steps 2026–2031, per future:

1. **Demand mix.** The share of new transceiver purchases in each generation, by year. This is a placeholder ramp in `supply.json`: 3.2T share ≈ 0% (2027), 10% (2028), 30% (2029), 50% (2030), 65% (2031), each ± spread. Sources: PR-012 (3.2T production from 2028), PR-013.
2. **Blocked share** in year *y* is the sum over segments of share × in-sights × gen-covered(y) × (1 − P(exempt)), multiplied by the transition factor. The transition factor is 0 before `start_year`, linear to 1 over `transition_years`, then 1.
3. **Pull-forward.** Buyers stockpile before the start year. Input `pull_forward_months` is a placeholder, centre 3, spread 3, sourced from PR-018 / CIO "stock up" reporting.
4. **Replacement.** Non-Chinese capacity headroom in year 1 (input `headroom_pct`, placeholder centre 5% of demand, spread 5; PR-018 reports Coherent/Lumentum near capacity) plus capacity added per year (input `capacity_add_pct`, centre 8, spread 5).
5. **Shift to exempt or uncovered sources.** The share of blocked demand that moves to uncovered segments of the same makers (e.g. Thai lines under an origin rule, or redesign to pass the BOM test). Input `shift_pct` with centre 30, spread 20. Couple it to `us_bom_pct` uncertainty with ρ = 0.5 (same Gaussian copula pattern as `sim.js`). Explain in plain words: *"where the rule's line is fuzzier, more supply finds a way to stay on the right side of it"*.
6. **Shortfall(y)** = max(0, blocked × (1 − shift) − headroom − cumulative capacity added − stock drawdown).
7. **Price pressure (index only).** Shortfall × input `price_elasticity` (placeholder, centre 1.5, spread 1). Show it as an **index**, never a dollar figure, and label it "direction and rough size only".
8. **Deployment delay (months).** The same structure as the existing shortage formula (DECISIONS #5). Reuse it, with `ramp` = qualification time for a new optics supplier (placeholder centre 9 months, spread 4; "6–18 months to qualify a new supplier", same assumption family as `sim_inputs.json`).

**Intel confidence (§5.2)** is applied per future by resampling card-set levers.

**Outputs.** Copy the existing page's visual grammar:
- Readout: typical blocked share in the peak year, typical shortfall, chance of a "serious shortfall" (above a line the user sets; default 10% of demand), and typical delay.
- **Timeline chart, 2026–2031:** median blocked share and shortfall, with a 90% band. Mark the start year.
- **100 possible futures:** a square grid, same as the existing page.
- **What matters most:** a tornado chart. Use the existing `SM.sensitivity` pattern adapted to the new inputs, **including the intel levers**, so students can see whether the result hinges on, for example, the 65% threshold or the Thailand split.
- **Same scenario, each trigger:** a small bar chart of the typical shortfall for named / entity / origin / both. Clicking switches.
- Analysis paragraph: generated text in the same style as `analyse()` in `app.js`, conditional and neutral. ("In this scenario, most of the effect comes from … If the exemption threshold were 10 points lower, …")

The inputs table goes in a `<details>` block ("How the model works, and where each number comes from"), with status badges and sources. That's the same component as `#sim-inputs`.

### 6.5 "Why the line might sit here": stakeholder positions

A neutral grid of attributed positions, each a claim row in `claims_proposed.csv` with a source. Keep a balanced set, at minimum:

- **FCC Chair** (PR-003): the component rule closes the "component part loophole". **Quote it as their wording, in quotation marks, attributed.**
- **Bill sponsors** (PR-020/PR-021): national-security rationale for federal systems.
- **Hyperscalers / Microsoft (reported)** (PR-015, PR-019): reportedly lobbying against the ban on supply grounds. Mark it "reported".
- **Networking vendors and analysts** (PR-014, PR-017): capacity, cost and timing concerns; the system is interdependent (US DSPs and lasers inside Chinese modules).
- **Risk assessment caveat**: no confirmed data-access incident involving these makers has been publicly reported. Optics are hardware, not data-collection software. Find a primary or named source for this before including it; otherwise drop it.
- **Chinese companies / government**: include a sourced response if one can be found (e.g. company statements on the 1260H designation). If none is found for the transceiver makers, show "No public response found at build date", not silence.

Then show the **design-choice reading**: which levers in the reported design limit near-term supply effects (new-models-only, 3.2T+, the BOM exemption). State it as an observation about the design, with **alternative explanations** next to it:
- administrative feasibility
- legal-risk reduction (the narrower "logic-bearing" definition was reportedly chosen partly to reduce litigation risk)
- giving allied capacity time to build

Reuse the existing intent rule: never say more than "consistent with a deliberate choice", and only where a source documents the boundary being argued over.

### 6.6 "What it means for building data centres": design considerations

A panel of **decisions the scenario puts in play**, generated from the current lever settings and simulation results. It's a checklist, not advice.

Each item has:
- the condition that triggers it
- a one-line "what to check"
- the related source

Write the items as questions, and add the note: *"Not legal or procurement advice; questions to check with counsel and suppliers."*

| Shows when | Item |
|---|---|
| `trigger` includes `origin` | **Manufacturing-site records.** Can each optics SKU be tied to a factory location? Thai vs Chinese lines may be treated differently. |
| `exemption` on | **BOM provenance.** Is there supplier data on the value share of DSPs, lasers and drivers by company nationality, and could it support a 65%-style test? |
| `generation` = 3.2T+ | **Architecture timing.** 3.2T decisions (pluggable vs linear-drive vs co-packaged optics) land as the rule starts. Co-packaged optics move the optics into the switch, which shifts which equipment authorisation and which components are examined (compare the logic-bearing component rule, I-1). |
| Typical shortfall > 0 | **Second-source qualification.** Qualification time (the simulation's `ramp`) is the main lever on delay. Which non-covered suppliers are qualified per generation? |
| Pull-forward > 0 | **Buy-ahead and inventory.** The scenario implies pre-start stockpiling. What's the inventory and obsolescence trade-off? |
| `scope` = federal_nss, or the user ticks "serves federal customers" | **Separating federal capacity.** S.5548 would apply to national-security systems after five years. Does federal capacity need separate optics sourcing? |
| always | **Installed base.** Existing modules aren't affected under new-models-only. Refresh-cycle timing determines when the rule starts to matter for each site. |
| always (Power) | **Inverters and battery systems.** The Covered List entry now covers utility-interactive UL 1741 inverters with remote comms (I-8). Check whether on-site solar, BESS or grid-interactive UPS equipment fits that definition, and whether models were authorised before 28 Jul 2026. |
| always (Network) | **Routers and switches.** The router entry is consumer-grade (I-9), so it's unlikely to cover data-centre switching. The **component rule** (I-1) still applies to any device with logic-bearing parts from producer-based Covered List entities. |
| always (Firmware) | **Firmware.** FCC 26-50 excludes firmware "at this time" and keeps the record open (I-1). This is a watch item, not a current requirement. |

Each item has a small "Relevant to: optics / power / network / procurement" tag, and the panel can filter by tag (reuse `chips`).

### 6.7 Student slot

A short panel at the bottom: **"Replace the illustrative numbers with your own analysis."** Link to the template file and a three-step how-to (§7). Show the current data status as `Illustrative` or `Student analysis: <name/date>`, read from `data_proposed.js`.

---

## 7. Student plug-in: `part_map.template.json`

The class will investigate real entities and parts in Sayari and drop a filled copy in at `data/proposed/transceivers/part_map.json`. Then they run `python3 pipeline/build_proposed.py`.

Schema (validate it in `build_proposed.py`; fail loudly with the field name on error):

```json
{
  "analyst": "name or team",
  "date": "YYYY-MM-DD",
  "sayari_snapshot": "YYYY-MM-DD",
  "segments": [
    {
      "id": "inno_th",
      "entities": [
        {"name": "…", "sayari_id": "…", "country": "THA", "role": "manufacturer",
         "parent_sayari_id": "…", "named_in": ["PR-020"], "source_ids": ["SA-…"]}
      ],
      "share_pct": {"centre": 0, "spread": 0, "basis": "shipments | value | estimate", "source_ids": []},
      "us_bom_pct": {"centre": 0, "spread": 0, "basis": "teardown | supplier disclosure | estimate", "source_ids": []},
      "gen_mix": {"800G": 0, "1.6T": 0, "3.2T": 0},
      "notes": ""
    }
  ],
  "sources": [ {"source_id": "SA-001", "title": "", "url": "", "type": "sayari_record | other"} ]
}
```

Add `pipeline/notes/proposed_sayari_plan.md` with suggested Sayari steps for students. Write it as a plan; don't run it unless the user asks.

1. `search_entities` for "Zhongji Innolight" and "Eoptolink" → `find_downstream_entities` to list subsidiaries (look for Thailand and other non-China manufacturing entities) → `get_entity_profile` / `check_watchlist` for list status (1260H etc.).
2. `lookup_hs_codes` to confirm transceiver HS lines before trade queries (candidates to check: 8517.62, 8517.79; confirm, don't assume).
3. `search_trade_facets` / `search_suppliers` on those HS codes into the USA, split by exporter country, to estimate CN vs TH shares (shipments, not value; same caveat as DECISIONS #15).
4. `get_upstream_supply_chain` on a Thai manufacturing entity to see inbound DSP/laser suppliers (Broadcom, Marvell, Lumentum, Coherent, Mitsubishi Electric). This is evidence for `us_bom_pct`, not a measurement of it.
5. Save every response to `data/raw/{date}_{tool}_{slug}.json` before analysing it (existing rule).

---

## 8. Build order and checks

1. Expose the helpers in `sim.js`. Confirm the existing simulation output is unchanged (same seed → same medians).
2. Write the source and claims CSVs. Fetch and check each URL.
3. Write `rules/proposed/transceivers.json` and `supply.json` with every value carrying `status` and `source_ids`.
4. Write `build_proposed.py`. It should:
   - validate references (warn on any source id not in `sources_proposed.csv`)
   - check segment shares sum to 100 ± 0.5
   - merge `part_map.json` if present
   - write `site/data_proposed.js`
5. Write `proposed.js` and the HTML block.
6. Visual check at **1440 and 390** (recreate the playwright helper as in HANDOFF step 8). No console errors, no horizontal scroll at 390, all charts have a text alternative, and tier/placeholder badges have text labels.
7. **Neutrality pass.** Grep the new page's copy for: loophole (allowed only inside an attributed quotation), weak, tough, strict, caving, reckless, dangerous, risky supplier, banned company. Remove them or attribute them.
8. **Accuracy pass.** Every number on the page traces to `supply.json`, a source id, or a simulation output. Every `reported` item says "no official text".
9. Update `README.md`, add DECISIONS entries, and add the Method card (§9).
10. Commit on a branch `proposed-rule`. **Don't push or merge to main without the user's go-ahead.** Summarise what's sourced, what's a placeholder, and the new DECISIONS entries.

### Acceptance criteria

- `#proposed` loads directly and from the nav; the other three tabs behave exactly as before.
- Applying and removing each intel card visibly changes the levers, and the "set by" labels update.
- A custom card can be added, survives reload (if storage is available), exports, and re-imports.
- Switching `trigger` from `entity` to `origin` moves Thai-made Chinese-HQ segments from covered to not covered, and the "Why?" text says so.
- The "No new rule" preset shows zero transceiver supply covered, with the statement that the component rule doesn't reach these makers today.
- With a valid `part_map.json` present, the badges flip from placeholder to student analysis after the build, and the values change.
- The simulation is reproducible for a given seed.

---

## 9. Method & limits card (text to adapt)

- **The core rule doesn't exist yet.** Generation threshold, exemption and trigger are taken from press and analyst reporting (Reuters, Morgan Stanley notes via Economic Daily News, Cignal AI, Counterpoint). The FCC hasn't published a threat determination or draft text.
- **Supply shares are illustrative** until replaced with student analysis. Public figures are revenue-based market estimates, which differ by source (InnoLight 27% vs 34%) and aren't US-specific.
- **US BOM share is unknown.** No public teardown data was used. The exemption result is the most assumption-sensitive part of the model; see "What matters most".
- **Manufacturing location ≠ ownership.** The entity/origin distinction drives much of the result, and the reported rule doesn't yet settle it.
- **Price and delay are indices and orders of magnitude**, not forecasts.
- **Design considerations are questions, not advice.**
- **Neutral by design.** Stakeholder positions are attributed. The tool doesn't assess whether the rule is warranted.
