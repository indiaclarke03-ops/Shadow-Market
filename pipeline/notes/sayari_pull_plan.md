# Sayari pull plan (M1, M2, M5)

Status 2026-11-16: **run.** M1/M2/M5 done with the deviations in DECISIONS #15–21; results in `layer3_validation.md`. (Earlier status 2026-11-15: not run.) The Sayari claude.ai connector was unavailable in the build session (claude.ai login lapsed). Re-authenticate with `/login` (or `claude auth login`) in an interactive session, then check that `/mcp` lists Sayari.

Save every response to `data/raw/{YYYY-MM-DD}_{tool}_{query-slug}.json` **before** analysing it. Never edit raw files.

## M1: market universe
1. `lookup_hs_codes`: confirm 8541.42 (cells), 8541.43 (modules), 2804.61 (polysilicon) and 3818.00 (wafers). Record any mismatch in DECISIONS.md.
2. `search_trade_facets`: HS 8541.42 and 8541.43, destination US, last 730 days. Use it to size the pull: shipment counts and value by exporter country.
3. `search_buyers` / `search_shipments`: US importers and their exporters, with values. Put names in `query`, because shipper/receiver filters get ignored (lesson from Paper Trail).
4. Split by quarter (spec §12) for the before/after comparison around the Aug 2026 Entity List expansion.

## M2: exporter enrichment
5. For each exporter: `get_entity_profile` + `check_watchlist`, collecting risk factors.
6. `lookup_risk_factors`: confirm the exact keys in `rules/uflpa.json → risk_factor_map`. `build.py` reports any unmapped keys in `layer3.unmapped_factors`.
7. Read each flag's definition before mapping it (lesson from the battery passport project: `psa_` means "Possibly the Same As", and some factors are procurement-list based).

## M5: upstream tracing
8. `get_upstream_supply_chain` for the top exporters that together make up ~80% of import value. Write `data/derived/tiers.json` as `{status:"ok", columns:{S1:{segments:[{cat,value}]}, S2:{...}}}`. Anything not traced → `untraced`.

## M7 spot checks
9. Run `get_record` on 10 randomly sampled flagged exporters. Thin records lower the confidence by one level (`corroboration = -1`). Public detention cases or company disclosures raise it (`+1`).

Then run `python3 pipeline/extract_sayari.py && python3 pipeline/build.py`. Finish the parser in `extract_sayari.py` against the real response shapes first.
