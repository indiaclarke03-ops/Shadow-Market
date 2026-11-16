# Handoff: The Shadow Market (2026-11-16)

## Read first
- `concept_2.md`, `specification.md`: the brief. The spec §12 decisions are binding.
- `DECISIONS.md`: build-time judgement calls. Add new ones here; don't ask the user mid-build.
- `README.md`: layout and how to run.
- `pipeline/notes/sayari_pull_plan.md`: the exact Sayari calls to make.
- The six `Screenshot …png` files: design reference. The look (indigo striped hero, ice-blue panels, Inter Tight + Source Sans 3) is already built. Keep it, and don't add mono or condensed fonts.

## State (updated 2026-11-16, session 2)
| Milestone | Status |
|---|---|
| M1/M2 Sayari universe + risk factors | **Done.** 792 exporters / 159,533 shipments (measure = shipments, DECISIONS #15) |
| M3 Layer 2 | **Done.** CBP stats verified against the guide PDF; `layer2_research.md` written; release rate by value 79.5% (HTS 8541) |
| M4 metrics | **Done** via `build.py` |
| M5 upstream → `tiers.json` | **Done** from hub-inbound rollups (DECISIONS #19), not per-exporter tracing |
| M6/M6a site + sim | Rebuilt with real data; visually checked at 1440/390 |
| M7 validation | **Done, with one fail** (see `pipeline/notes/layer3_validation.md`) |

Pipeline: `python3 pipeline/extract_sayari.py && python3 pipeline/build_tiers.py && python3 pipeline/build.py`.

Still open: sim inputs other than release rate are placeholders (p_enf can't be calibrated while T1 exposure = 0); quarterly before/after split (spec §12) not pulled; USD conversion for tolerated exposure; C-013 wording review (DECISIONS #22).

## Original next steps (session 1), in order
1. **Check that Sayari works:** ToolSearch "sayari" should return the tools. If it doesn't, stop and tell the user.
2. **Finish M3 with Tavily** (local `mcp__tavily__*`). Write `data/cbp_uflpa_stats.csv` with columns `capture_date,source_id,period,period_type,industry,hts4,country_of_origin,exam_result,shipments,value_usd,notes`:
   - Use `industry` = `All` / `Electronics`, `period_type` = `cumulative` for the headline rows, `hts4=8541` if found, and `industry=solar_reported` for press figures.
   - Known figures to verify and source:
     - CBP dashboard guide (cbp.gov/sites/default/files/2026-01/forced-labor-dashboard-guide.pdf): 24,215 denied ($960.5m) / 39,829 released / 1,663 pending, all industries; Electronics value $3.27bn.
     - $1.78bn stopped in 2024 vs $187.7m in 2025.
   - The 2026 dashboard counts import transactions, so note that counts aren't comparable across sources.
   - Add the source rows to `sources_layer2.csv` (ids `L2-xxx`). Write `pipeline/notes/layer2_research.md`, including the release rate and the solar share of Electronics.
3. **Reconcile:** when Xinjiang Daqo was added to the Entity List, and whether Xinte Energy is named in the 3 Aug 2026 notice. Fix `entity_list_history.csv` / claims C-018 if needed.
4. **Sayari M1 → M2 → M5** per `sayari_pull_plan.md`:
   - Save every response to `data/raw/{YYYY-MM-DD}_{tool}_{slug}.json` before analysing it.
   - Confirm the risk-factor keys against `rules/uflpa.json → risk_factor_map`; `build.py` reports unmapped keys.
   - Finish the parser in `pipeline/extract_sayari.py` (output schema fixed in its docstring).
   - Write `tiers.json` for the flow diagram.
5. Rebuild: `/Library/Developer/CommandLineTools/usr/bin/python3 pipeline/build.py`. Check for "WARNING: referenced source ids" output.
6. Calibrate the sim: once Layer 3 exists, the flagged-share increments come from data automatically. Then source `p_enf`, rerouting, capacity, ramp and buffer where possible, and update `pipeline/sim_inputs.json` status/source fields.
7. Run the M7 validation (spec §8):
   - Layer 3 at listed/direct is on the same order as CBP detentions.
   - Known detained companies appear as E0/E1.
   - 10 `get_record` spot checks.
8. **Visual check** at 1440 and 390. The playwright helpers are in the old scratchpad, so recreate them: `createRequire("/Users/indiaclarke/DressCode/package.json")` → `require("playwright")`. Check that there are no console errors and no horizontal scroll at 390.
9. Commit, then push to origin main (the user provided the repo for this). Summarise for the user what's real, what's still a placeholder, and the new DECISIONS.md entries.

## Rules that must hold
- Use exposure language only ("linked to", "exposure"). Never "uses forced labour" or "violates".
- Name a company only with its exposure level, confidence and source.
- No invented data. Anything unsourced stays pending or a labelled placeholder.
- Intent claims ("consistent with a deliberate choice") are held automatically by `build.py` until a Layer 3 cliff exists on that dial. C-013 is currently held.
- Never hand-edit `data/derived/` or `site/data.js`. Never commit fixture output; `build.py --exporters` is for layout tests only.
