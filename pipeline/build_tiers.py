"""Build data/derived/tiers.json (S1 polysilicon, S2 ingots/wafers) for the flow diagram.

Method (DECISIONS #19): get_upstream_supply_chain could not isolate HS 2804.61 (its product filter
matched HS 2804 industrial gases), so the upstream columns are built from supplier rollups of
polysilicon (2804.61) and wafer (3818.00) shipments INTO the cell/module hubs:
  data/raw/*_search_suppliers_{280461|381800}_{hub}_compact_off*.json
Each hub's inbound shipments are split by the exporting entity's own Sayari forced-labour flags,
classified at the page's default dial setting (tier E1, Xinjiang scope, ownership off):
  E0 = on the UFLPA Entity List; flagged at default → its level; flagged only at deeper settings →
  shadow; no flag → clean; freight forwarder as shipper → untraced.
Hub shares are then weighted by each hub's share of US cell/module shipments (exporters.csv) and
scaled to the market total, so the columns read as "share of the US market's upstream". Hubs not
pulled, and the hub tail beyond the first 100 suppliers, count as untraced.
"""
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_sayari import FORWARDER, KEEP, country_of  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
DERIVED = ROOT / "data" / "derived"
RULES = json.loads((ROOT / "rules" / "uflpa.json").read_text())
RF = RULES["risk_factor_map"]
TIERS = ["E0", "E1", "E2", "E3"]
SCOPES = ["entity_list", "xinjiang", "research"]
DEFAULT = {"tier": RULES["dials"]["tier_depth"]["default"], "scope": RULES["dials"]["trigger_scope"]["default"]}


def category(factors: list[str]) -> str:
    m = [RF[f] for f in factors if f in RF]
    if not m:
        return "clean"
    if any(x["level"] == "E0" and x["scope"] != "research" for x in m):
        return "E0"
    best = None
    for x in m:
        if x["level"] == "A1" or SCOPES.index(x["scope"]) > SCOPES.index(DEFAULT["scope"]):
            continue
        if TIERS.index(x["level"]) <= TIERS.index(DEFAULT["tier"]):
            best = x["level"] if best is None or TIERS.index(x["level"]) < TIERS.index(best) else best
    return best or "shadow"


def main() -> int:
    ex = list(csv.DictReader((DERIVED / "exporters.csv").open()))
    if not ex:
        print("no exporters.csv; run extract_sayari.py first")
        return 1
    tot = sum(int(r["shipments"]) for r in ex)
    hub_share = {}
    for r in ex:
        hub_share[r["country"]] = hub_share.get(r["country"], 0) + int(r["shipments"]) / tot
    cols, meta = {}, {}
    for sid, hs in (("S1", "280461"), ("S2", "381800")):
        seg, hubs_used = {}, {}
        for f in sorted(RAW.glob(f"*_search_suppliers_{hs}_*_compact_off*.json")):
            hub = re.search(rf"_{hs}_([a-z]{{3}})_", f.name).group(1).upper()
            if hub == "USA":
                continue
            doc = json.loads(f.read_text())["response"]
            by = {}
            for it in doc["items"]:
                n = int((it.get("metadata") or {}).get("shipments") or 0)
                fac = [x for x in (it.get("risk_flags") or {}).get("risk_levels") or [] if KEEP.match(x)]
                c = "untraced" if FORWARDER.search(it.get("label", "")) else category(fac)
                by[c] = by.get(c, 0) + n
            pulled = sum(by.values())
            if not pulled:
                continue
            w = hub_share.get(hub, 0)
            hubs_used[hub] = {"weight": round(w, 4), "suppliers_pulled": len(doc["items"]),
                              "suppliers_total": doc.get("total_available"), "shipments_pulled": pulled,
                              "split": {k: round(v / pulled, 4) for k, v in by.items()}, "file": f.name}
            for c, v in by.items():
                seg[c] = seg.get(c, 0) + w * v / pulled * tot
        covered = sum(h["weight"] for h in hubs_used.values())
        seg["untraced"] = seg.get("untraced", 0) + (1 - covered) * tot
        cols[sid] = {"segments": [{"cat": c, "value": round(v)} for c, v in sorted(seg.items()) if v > 0.5]}
        meta[sid] = {"hs": hs, "hubs": hubs_used, "hub_weight_covered": round(covered, 4)}
    out = {"status": "ok", "measure": "shipments", "method": __doc__.strip().split("\n\n")[1],
           "dial_setting": DEFAULT, "columns": cols, "meta": meta}
    (DERIVED / "tiers.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    for sid in cols:
        print(sid, {s["cat"]: round(s["value"] / tot * 100, 1) for s in cols[sid]["segments"]}, "hub weight", meta[sid]["hub_weight_covered"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
