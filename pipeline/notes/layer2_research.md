# Layer 2 research notes: CBP UFLPA statistics and enforcement cases

Captured 2026-11-15/16. Data files: `data/cbp_uflpa_stats.csv` (173 rows), `data/cases.csv` (24), `data/evidence/entity_list_history.csv` (14), `data/evidence/sources_layer2.csv` (L2-001…L2-040).

## Headline figures (cumulative, 2022-06-21 → 2026-10-06, L2-001 dashboard)

| Scope | Stopped (lines) | Stopped value | Released value | Denied value | Pending value |
|---|---|---|---|---|---|
| All industries | 44,651 | $4.14bn | $2.98bn | $1.01bn | $0.15bn |
| Electronics | 7,238 | $3.40bn | $2.61bn | $0.69bn | $0.10bn |
| HTS 8541 (solar proxy) | 6,172 | $3.36bn | $2.60bn | $0.67bn | $0.09bn |

Verified against the primary source on 2026-11-16: the CBP Dashboard Guide (L2-002, data through 2025-11-24) states 24,215 denied, 39,829 released and 1,663 pending, with Electronics at $3,273,206,043. That cut gives 65,707 lines and $3.91bn in total.

## Release rate
- **By value** (the basis we use): HTS 8541 is **79.5%**, Electronics 79.2%, all industries 74.7% (L2-001). The L2-002 all-industries figure is 75.1%. The value basis is stable across both cuts and all scopes.
- **By count:** HTS 8541 is 65.4% and Electronics 61.7%. For all industries, L2-001 gives 36.5% but L2-002 gives 62.2%.
- **Unresolved conflict:** the L2-001 all-industries line counts (44,651 stopped, 15,547 released) are lower than the 65,707 stopped and 39,829 released in L2-002 from 10 months earlier. Released counts cannot shrink, so the line definition or the de-duplication must have changed between dashboard revisions. The L2-001 values ($2.98bn released vs $2.90bn) and its HTS 8541 fiscal-year breakdown (which sums exactly to the cumulative row) are internally consistent. Decision: we use value-based rates and show counts as secondary (DECISIONS #13).

## Solar share
- HTS 8541 makes up **98.9% of Electronics value** stopped (85.3% of lines) and 81.1% of all UFLPA-stopped value. HTS 8541 also covers LEDs, diodes and other semiconductors, so this is an upper bound on solar.
- Malaysia ($1.59bn), Vietnam ($0.92bn) and Thailand ($0.54bn) account for 91% of HTS 8541 value stopped. China itself accounts for $0.2m, which is consistent with Chinese-owned SE Asian production being the enforcement target.

## Trajectory (HTS 8541, by fiscal year, L2-001)
FY22 $457m → FY23 $1,103m → FY24 $1,535m → FY25 $117m → FY26 $148m (of which $82m pending).
Press figures agree: Reuters (L2-003) says $1.78bn was stopped in 2024 (this matches FY2024 for all industries, $1.778bn in L2-002) and $187.7m in 2025. WSJ via Volkov (L2-012) gives $183m for CY2025. The DeLauro letter (L2-011) reports a more than fourfold fall in monthly stops after April 2025.

## Comparability caveats
- The 2026 dashboard counts import-transaction **lines**. Pre-2026 sources (DHS releases, law-firm summaries and Reuters FOIA) count **entries**. Counts are not comparable across these sources; values are.
- Press "solar" figures (`industry=solar_reported`) use different proxies (CBP FOIA solar equipment, or Bernreuter's Electronics-as-solar). They are kept for the timeline only.

## Entity List reconciliation (step 3)
- **Xinjiang Daqo New Energy** was on the original list (2022-06-21, sub-list (i)). The Nov 2024 notice added it to sub-list (v) as well; this is not a new listing.
- **Xinte Energy** is not named in the DHS entity-specific notice (L2-032) or on the Entity List page (L2-022). Its parent TBEA was added on 2026-08-03. C-018 has been updated to match.
- Xinjiang GCL New Energy Material Technology was renamed Xinjiang Goens Energy Technology in the Aug 2026 notice (a technical correction).
