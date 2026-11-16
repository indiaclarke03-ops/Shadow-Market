"""Turn raw Sayari MCP pulls (data/raw/*.json) into data/derived/exporters.csv.

Raw naming (spec §6): data/raw/{YYYY-MM-DD}_{tool}_{query-slug}.json, never edited. Each file is
{"tool", "args", "captured", "response"} where "response" is the MCP result verbatim.

Inputs used (shapes confirmed against the 2026-11-16 pulls):
  search_suppliers  *_854143_usa_compact_*  /  *_854142_usa_compact_*   (response_mode=compact)
      items[]: entity_id, label, countries[], identifiers[{type,value}], risk_flags.risk_levels[],
               trade_count{sent,received}, metadata{shipments, latest_shipment_date, hs_codes[]}
  get_record        *_get_record_*            spot checks → corroboration (see M7 in sayari_pull_plan)
  corroboration.csv data/derived/corroboration.csv (optional, hand-curated from get_record + cases; columns
                    sayari_entity_id, corroboration, note)

MEASURE (DECISIONS #15): US bill-of-lading records in Sayari carry weight but no declared value, so
`us_import_value_usd` is left blank and `shipments` (count of US-bound shipment records in the 730-day
window, per HS code, summed over cells + modules) is the size measure. build.py falls back to it.

Output columns (data/derived/exporters.csv):
  exporter_id, name, country, stage (S3|S4|S3;S4), us_import_value_usd, shipments,
  risk_factors (semicolon-separated Sayari factor keys), traced (y|n), trade_coverage,
  sayari_entity_id, source_records (semicolon), corroboration (-1|0|1), corroboration_note,
  snapshot_date
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "derived" / "exporters.csv"
CORR = ROOT / "data" / "derived" / "corroboration.csv"
COLS = ["exporter_id", "name", "country", "stage", "us_import_value_usd", "shipments", "risk_factors",
        "traced", "trade_coverage", "sayari_entity_id", "source_records", "corroboration",
        "corroboration_note", "snapshot_date"]
STAGE = {"854142": "S3", "854143": "S4"}
# Keep forced-labour factors that describe THIS entity. `psa_` = "Possibly the Same As": inherited
# from a different record that may be the same entity, so excluded (DECISIONS #16).
KEEP = re.compile(r"^(forced_labor_|aspi_uyghur)")
NOT_COUNTRY = {"usa", "xxx", "unk", "lei"}
PREFIX_COUNTRY = {"krx": "KOR"}  # exchange/registry prefixes that are not ISO codes
# Shipper of record is a logistics firm: the manufacturer is not identified, so the entity's risk
# factors describe the forwarder's network, not the goods (DECISIONS #17). Treated as not traced.
FORWARDER = re.compile(r"LOGISTIC|EXPRESS|CONTAINER\s+LINE|SHIPPING|FREIGHT|TRANSPORT|SUPPLY\s+CHAIN|KUEHNE|DAMCO|DANZAS|"
                       r"OCEAN\s+LINE|\bDHL\b|GIAO\s+NH[ẬậA]N|\b4PL\b|FORWARD|AGENT\s+OF|เคอรี่|ALISPED|LOGTEC", re.I)


# Legal-form suffixes are the most reliable signal of the exporting entity's registry country.
NAME_RULES = [(re.compile(p, re.I), c) for p, c in [
    (r"\bSDN\.?\s*BHD\b", "MYS"), (r"^PT[\.\s]", "IDN"), (r"\bTBK\b", "IDN"),
    (r"^C[ôo]NG\s+TY\b|VI[ỆệE]T\s+NAM", "VNM"), (r"\bPTE\.?\s+LTD\b", "SGP"),
    (r"\bPRIVATE\s+LIMITED\b|\bPVT\.?\s+LTD\b|\bLLP\b", "IND"), (r"\bS\.?A\.?\s+DE\s+C\.?V\.?\b", "MEX"),
    (r"\(THAILAND\)", "THA"), (r"\(CAMBODIA\)", "KHM"), (r"\bCO\.?,?\s*LTD\.?\s*\(?LAO", "LAO")]]
OVERRIDES = ROOT / "pipeline" / "country_overrides.csv"


def country_of(item: dict, overrides: dict) -> str:
    """Override file → legal-form suffix in the name → identifier prefix (e.g. vnm_enterprise_code) → first non-US country."""
    if item["entity_id"] in overrides:
        return overrides[item["entity_id"]]
    for rx, c in NAME_RULES:
        if rx.search(item.get("label", "")):
            return c
    for idf in item.get("identifiers") or []:
        pre = (idf.get("type") or "").split("_", 1)[0]
        if pre in PREFIX_COUNTRY:
            return PREFIX_COUNTRY[pre]
        if len(pre) == 3 and pre.isalpha() and pre not in NOT_COUNTRY:
            return pre.upper()
    cs = item.get("countries") or []
    non_us = [c for c in cs if c != "USA"]
    return (non_us or cs or ["Unknown"])[0]


def main() -> int:
    files = sorted(RAW.glob("*_search_suppliers_85414[23]_usa_compact*.json"))
    if not files:
        print("No raw Sayari supplier pulls in data/raw/. Layer 3 stays 'pending'.")
        return 0
    overrides = {r["sayari_entity_id"]: r["country"] for r in csv.DictReader(OVERRIDES.open())} if OVERRIDES.exists() else {}
    corr = {}
    if CORR.exists():
        corr = {r["sayari_entity_id"]: r for r in csv.DictReader(CORR.open())}
    rows: dict[str, dict] = {}
    seen_pages = set()
    for p in files:
        doc = json.loads(p.read_text())
        if not isinstance(doc.get("response"), dict):
            continue  # placeholder for a call whose rows are stored in another file
        hs = doc["args"]["hs_code"]
        key = (hs, doc["args"].get("offset", 0))
        if key in seen_pages:
            continue
        seen_pages.add(key)
        snap = doc["captured"][:10]
        for it in doc["response"]["items"]:
            eid = it["entity_id"]
            md = it.get("metadata") or {}
            n = int(md.get("shipments") or 0)
            r = rows.get(eid)
            if r is None:
                rf = sorted({f for f in (it.get("risk_flags") or {}).get("risk_levels") or [] if KEEP.match(f)})
                tc = it.get("trade_count") or {}
                received = int(tc.get("received") or 0)
                c = corr.get(eid, {})
                r = rows[eid] = {
                    "exporter_id": eid, "name": it.get("label", ""), "country": country_of(it, overrides), "stage": set(),
                    "us_import_value_usd": "", "shipments": 0, "risk_factors": ";".join(rf),
                    # traced = Sayari holds inbound trade for the entity, so its supplier network is visible
                    "traced": "y" if received > 0 and not FORWARDER.search(it.get("label", "")) else "n",
                    "trade_coverage": ("forwarder;" if FORWARDER.search(it.get("label", "")) else "") + f"sent={tc.get('sent', 0)};received={received};latest={md.get('latest_shipment_date', '')}",
                    "sayari_entity_id": eid, "source_records": p.name,
                    "corroboration": c.get("corroboration", "0"), "corroboration_note": c.get("note", ""),
                    "snapshot_date": snap}
            elif p.name not in r["source_records"]:
                r["source_records"] += ";" + p.name
            r["stage"].add(STAGE[hs])
            r["shipments"] += n
    for r in rows.values():
        r["stage"] = ";".join(sorted(r["stage"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        w.writerows(sorted(rows.values(), key=lambda r: -r["shipments"]))
    print(f"exporters={len(rows)} shipments={sum(r['shipments'] for r in rows.values())} pages={len(seen_pages)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
