"""Turn raw Sayari MCP pulls (data/raw/*.json) into data/derived/exporters.csv.

Status: SKELETON. Sayari was not connected in the build session (2026-11-15), so the
raw response shapes haven't been seen yet. The output schema below is fixed: build.py
depends on it. The parsing functions get finished against the first real pulls.

Raw naming (spec §6): data/raw/{YYYY-MM-DD}_{tool}_{query-slug}.json, never edited.
Expected pulls, in order (M1 → M2 → M5):
  search_trade_facets   HS 8541.42 / 8541.43, destination US   → sizing
  search_buyers / search_shipments                              → US importers + exporters + values
  get_entity_profile / check_watchlist (per exporter)           → risk factors
  get_upstream_supply_chain (top exporters to ~80% of value)    → tiers.json
  get_record (spot checks)                                      → corroboration / thin-record downgrades

Output columns (data/derived/exporters.csv):
  exporter_id, name, country, stage (S3|S4|S3;S4), us_import_value_usd, shipments,
  risk_factors (semicolon-separated Sayari factor keys), traced (y|n), trade_coverage,
  sayari_entity_id, source_records (semicolon), corroboration (-1|0|1), corroboration_note,
  snapshot_date
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "derived" / "exporters.csv"
COLS = ["exporter_id", "name", "country", "stage", "us_import_value_usd", "shipments", "risk_factors",
        "traced", "trade_coverage", "sayari_entity_id", "source_records", "corroboration",
        "corroboration_note", "snapshot_date"]


def main() -> int:
    raws = sorted(RAW.glob("*.json"))
    if not raws:
        print("No raw Sayari pulls in data/raw/. Layer 3 stays 'pending'.")
        return 0
    rows: dict[str, dict] = {}
    for p in raws:
        payload = json.loads(p.read_text())
        tool = p.stem.split("_", 1)[1].rsplit("_", 1)[0] if "_" in p.stem else ""
        # TODO(M1/M2): parse once real response shapes are known.
        _ = (payload, tool)
    if not rows:
        print("Raw files found but no parser for them yet. Finish extract_sayari.py.", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        w.writerows(rows.values())
    return 0


if __name__ == "__main__":
    sys.exit(main())
