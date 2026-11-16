# Case 2: suggested Sayari steps for students (plan; not run)

Goal: replace the illustrative segments in `data/proposed/transceivers/supply.json` with your own evidence, written to `data/proposed/transceivers/part_map.json` (copy `part_map.template.json`). Then run `python3 pipeline/build_proposed.py`.

**Rule (same as Case 1): save every Sayari response to `data/raw/{YYYY-MM-DD}_{tool}_{slug}.json` before you analyse it.** Wrap it as `{"tool", "args", "captured", "response"}`, and copy large responses by script, never by retyping.

1. **Find the companies and their factories.**
   - Run `search_entities` for "Zhongji Innolight" and for "Eoptolink".
   - Run `find_downstream_entities` on each parent to list subsidiaries. Look for Thai (and any other non-China) manufacturing entities.
   - Run `get_entity_profile` and `check_watchlist` on parents and key subsidiaries for list status (1260H etc.).
   - Put the results in each segment's `entities[]`, with `parent_sayari_id`.
2. **Confirm the HS lines before running trade queries.**
   - Use `lookup_hs_codes`. Candidates to check are 8517.62 and 8517.79. Confirm them; don't assume.
   - Optical transceivers can also appear under other headings, so record what you find.
3. **Estimate China vs Thailand shares.**
   - Use `search_trade_facets` (scope: suppliers) and then `search_suppliers` on the confirmed HS codes, `arrival_country` USA, over a two-year window.
   - Split the results by exporter country and by the entities from step 1.
   - These are **shipments, not value** (same caveat as Case 1, DECISIONS #15). Set `share_pct.basis` to "shipments".
   - Check that the date filter held (Case 1 found it sometimes doesn't; DECISIONS #28).
4. **Gather evidence for US BOM share.**
   - Run `get_upstream_supply_chain` on a Thai manufacturing entity to see inbound DSP and laser suppliers (Broadcom, Marvell, Lumentum, Coherent, Mitsubishi Electric).
   - This is evidence about `us_bom_pct`, not a measurement of it. Set `basis` to "estimate" unless you have a teardown or a supplier disclosure.
5. **Cite everything.**
   - List every Sayari record you relied on in `sources[]` (ids `SA-001` …), and reference them from each segment.
   - The build fails, naming the field, if anything required is missing.

Neutrality still applies. Name a company only as *named in a source* (a bill, a list, a market-share report), never as a risk.
