# Handoff: The Shadow Market (2026-11-16)

## Read first
- `concept_2.md`, `specification.md`: the brief. The spec §12 decisions are binding.
- `DECISIONS.md`: build-time judgement calls. Add new ones here; don't ask the user mid-build.
- `README.md`: layout and how to run.
- `pipeline/notes/sayari_pull_plan.md`: the exact Sayari calls to make.
- The six `Screenshot …png` files: design reference. The look (indigo striped hero, ice-blue panels, Inter Tight + Source Sans 3) is already built. Keep it, and don't add mono or condensed fonts.

## State
| Milestone | Status |
|---|---|
| M1/M2 Sayari market universe + exporter risk factors | **NOT DONE.** It was blocked because the Sayari connector wasn't loaded in the previous session |
| M3 Layer 2 (CBP stats + cases) | **Partial.** `data/cases.csv`, `data/evidence/entity_list_history.csv` and `data/evidence/sources_layer2.csv` exist (written by a subagent that may have been cut off, so check that they're complete and the CSVs parse). **Missing:** `data/cbp_uflpa_stats.csv` and `pipeline/notes/layer2_research.md` |
| M4 metrics for all dial combinations | Pipeline ready (`pipeline/build.py`); needs exporters.csv |
| M5 upstream tracing → `data/derived/tiers.json` | NOT DONE (Sayari) |
| M5a evidence layer | Done: 43 sources, 42 claims, 37 timeline events (`pipeline/notes/evidence_research.md`) |
| M6 site, M6a simulation | Built. Layer 3 shows "awaiting Sayari snapshot"; sim exposure inputs are labelled placeholders |
| M7 validation | Not started |

Git: the project has its own repo (the home dir is a separate repo, so always run git from inside `~/TheShadowMarket`). There's one local commit. The remote `origin` = github.com/indiaclarke03-ops/Shadow-Market, which is empty, and nothing has been pushed yet.

## Next steps, in order
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
