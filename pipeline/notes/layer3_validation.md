# Layer 3 snapshot and M7 validation (2026-11-16)

## Snapshot
- Universe: 792 exporters, 159,533 US-bound shipment records for HS 8541.42 + 8541.43, 2024-11-16 → 2026-11-16 (Sayari supplier rollups, `data/raw/*_85414[23]_usa_compact_*`).
- By country: VNM 49.7%, IND 28.7%, IDN 7.6%, MYS 2.7%, KOR 2.0%, SGP 1.5%, CHN 1.2%. Exporter HHI 1,025; country HHI 3,367.
- 27 exporters make up 80% of shipments. First Solar Vietnam alone accounts for 27%.
- Traced: 91.3%. Not traced: forwarders 6.7%, no inbound data 1.9%.

## Headline result (default dials: E1 · Xinjiang · ownership off)
| Dial step | Exposed share |
|---|---|
| Listed only / direct (E0, E1) | **0.0%** |
| Tiers 2–3 (E2) | **66.0%** ← cliff |
| Tiers 2–4 product-relevant (E3) | 69.0% |
| + research-named (at E1) | 13.3% ← cliff |
| + one-hop ownership (at E1) | 9.0% ← cliff |
| Everything on (E3 · research · one-hop) | 83.8% |

Sayari sees no US cell/module exporter that is itself listed or trades directly with a listed or Xinjiang entity. Exposure sits entirely at tier 2 and deeper.

## M7 checks (spec §8)
1. **Layer 3 at listed/direct vs CBP detentions (same order?)** At E1, Layer 3 is 0 shipments. CBP stopped 729 HTS 8541 lines in FY2025 + FY2026 to date (L2-001), against roughly 160k shipment records in the window, i.e. about 0.5%. Both are near zero, so they are on the same order. The units differ (lines vs bills of lading) and HTS 8541 includes non-PV goods. **Pass, weakly.**
2. **Known detained companies appear as E0/E1?** No. VSUN/Vietnam Sunergy (C-022) is E2/E3 at the main entity (its cell unit is E1). Hanwha Solutions and Qcells Malaysia (C-021) are E2/E3. JA Solar Vietnam is A1/E2/E3, Jinko Vietnam E2/E3. Trina Vietnam is E1 only via a Sheffield Hallam-named direct link (research scope). Maxeon (C-020) does not appear as a top exporter. **Fails as specified. Interpretation:** CBP detentions reach companies whose Sayari exposure sits at tier 2–3, which is consistent with enforcement acting deeper than the Entity List's own reach. It also means Sayari's direct-tier factors would not have predicted these detentions.
3. **Spot checks (10 × get_record planned).** `get_record` needs record ids, and none are exposed on profiles or summaries. I substituted 6 live entity checks (DECISIONS #21): 5 matched exactly; Waaree did not (E2 missing on the profile, confidence lowered).

## Caveats to show on the page
- Shipments are not dollars. Large exporters that ship many small bills of lading are over-weighted.
- Sayari's entity resolution splits brands into many records (e.g. 7 Hanwha Solutions variants). Each fragment is classified separately.
- `latest_shipment_date` in rollups is entity-wide, not window-filtered, and the shipment date filter appears to act on a different date field (an arrival on 2026-10-30 was returned for a June–Aug window).
