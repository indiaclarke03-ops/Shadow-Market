"""The Shadow Market: build derived metrics from immutable inputs.

Reads:   rules/uflpa.json
         data/derived/exporters.csv   (written by pipeline/extract_sayari.py from data/raw/)
         data/derived/tiers.json      (optional; upstream tracing for the flow diagram)
         data/cbp_uflpa_stats.csv, data/cases.csv
         data/evidence/*.csv
Writes:  data/derived/metrics.json
         site/data.js                 (same payload as window.SM_DATA, so the page works from file://)

Run:     python3 pipeline/build.py
"""
from __future__ import annotations

import csv
import itertools
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DERIVED = DATA / "derived"
EVID = DATA / "evidence"

CONF_RANK = {"low": 0, "low-medium": 1, "medium": 2, "medium-high": 3, "high": 4}
CONF_NAMES = ["low", "low-medium", "medium", "medium-high", "high"]
TIER_ORDER = ["E0", "E1", "E2", "E3"]
SCOPE_ORDER = ["entity_list", "xinjiang", "research"]


def read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return [{k.strip(): (v or "").strip() for k, v in row.items() if k} for row in csv.DictReader(f)]


def num(v, default=None):
    try:
        return float(str(v).replace(",", "").replace("$", ""))
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------- Layer 3
def classify(exporters: list[dict], rules: dict) -> list[dict]:
    rf_map = rules["risk_factor_map"]
    levels = {l["id"]: l for l in rules["exposure_levels"]}
    out = []
    for e in exporters:
        factors = [f.strip() for f in e.get("risk_factors", "").split(";") if f.strip()]
        flags = []
        unknown = []
        for f in factors:
            m = rf_map.get(f)
            if m:
                flags.append({"factor": f, **m})
            else:
                unknown.append(f)
        corr = int(num(e.get("corroboration"), 0) or 0)
        base_conf = max((CONF_RANK[levels[fl["level"]]["confidence"]] for fl in flags), default=None)
        conf = None
        if base_conf is not None:
            conf = CONF_NAMES[max(0, min(4, base_conf + corr * 2))]  # one named level = 2 rank steps
        out.append({
            "id": e.get("exporter_id") or e.get("name"),
            "name": e.get("name", ""),
            "country": e.get("country", "") or "Unknown",
            "stage": e.get("stage", ""),
            "value": num(e.get("us_import_value_usd")),
            "value_usd": num(e.get("us_import_value_usd")),
            "shipments": int(num(e.get("shipments"), 0) or 0),
            "flags": flags,
            "unmapped_factors": unknown,
            "levels": sorted({fl["level"] for fl in flags}),
            "confidence": conf,
            "traced": (e.get("traced", "y") or "y").lower().startswith("y"),
            "trade_coverage": e.get("trade_coverage", ""),
            "sayari_entity_id": e.get("sayari_entity_id", ""),
            "source_records": [s for s in e.get("source_records", "").split(";") if s],
            "corroboration_note": e.get("corroboration_note", ""),
        })
    return out


def flagged_under(ex: dict, tier: str, scope: str, ownership: str) -> bool:
    t_max = TIER_ORDER.index(tier)
    s_max = SCOPE_ORDER.index(scope)
    for fl in ex["flags"]:
        if SCOPE_ORDER.index(fl["scope"]) > s_max:
            continue
        if fl["level"] == "A1":
            if ownership == "one_hop":
                return True
            continue
        if TIER_ORDER.index(fl["level"]) <= t_max:
            return True
    return False


def hhi(values: dict[str, float]) -> float | None:
    tot = sum(values.values())
    if tot <= 0:
        return None
    return round(sum((v / tot * 100) ** 2 for v in values.values()), 1)


def metrics_for(exs: list[dict], tier, scope, own, total_value, detained_value):
    exposed = [e for e in exs if e["traced"] and flagged_under(e, tier, scope, own)]
    clean = [e for e in exs if e not in exposed]
    exp_val = sum(e["value"] for e in exposed)
    by_exp = {e["id"]: e["value"] for e in clean}
    by_cty: dict[str, float] = {}
    for e in clean:
        by_cty[e["country"]] = by_cty.get(e["country"], 0) + e["value"]
    tol = None if detained_value is None else max(0.0, exp_val - detained_value)
    return {
        "exposed_value": round(exp_val),
        "exposed_share": round(exp_val / total_value * 100, 2) if total_value else None,
        "exposed_count": len(exposed),
        "exposed_count_share": round(len(exposed) / len(exs) * 100, 2) if exs else None,
        "tolerated_exposure": None if tol is None else round(tol),
        "remaining_suppliers": sum(1 for e in clean if e["traced"]),
        "hhi_exporter_after": hhi(by_exp),
        "hhi_country_after": hhi(by_cty),
        "exposed_ids": [e["id"] for e in exposed],
    }


def curves(combos: dict, rules: dict) -> dict:
    """Step chart per dial with others at default, plus cliff detection (spec §4, §12)."""
    d = {k: v["default"] for k, v in rules["dials"].items()}
    cr = rules["cliff_rule"]
    out = {}
    for dial in ("tier_depth", "trigger_scope", "ownership_reach"):
        steps = []
        for pos in rules["dials"][dial]["positions"]:
            key_parts = dict(d)
            key_parts[dial] = pos["id"]
            k = f'{key_parts["tier_depth"]}|{key_parts["trigger_scope"]}|{key_parts["ownership_reach"]}'
            m = combos[k]
            steps.append({"position": pos["id"], "label": pos["label"],
                          "exposed_value": m["exposed_value"], "exposed_share": m["exposed_share"],
                          "exposed_count": m["exposed_count"], "cliff": False})
        for i in range(1, len(steps)):
            a, b = steps[i - 1], steps[i]
            if a["exposed_share"] is None:
                continue
            ratio = (b["exposed_value"] / a["exposed_value"]) if a["exposed_value"] else (float("inf") if b["exposed_value"] else 1)
            add_pp = b["exposed_share"] - a["exposed_share"]
            b["ratio_vs_prev"] = None if ratio == float("inf") else round(ratio, 2)
            b["added_pp"] = round(add_pp, 2)
            b["cliff"] = ratio >= cr["min_ratio"] and add_pp >= cr["min_share_pp"]
        out[dial] = steps
    return out


# ---------------------------------------------------------------- Layer 2
def layer2_summary(stats: list[dict]) -> dict:
    """Pick headline cumulative figures. Rows are kept verbatim for the UI; nothing is estimated here."""
    def pick(industry, result, period_type="cumulative", hts4=""):
        rows = [r for r in stats if r.get("industry", "").lower() == industry.lower()
                and r.get("exam_result", "").lower() == result and r.get("period_type") == period_type
                and (not hts4 or r.get("hts4") == hts4)
                and r.get("country_of_origin", "").lower() in ("", "all")]
        rows.sort(key=lambda r: r.get("capture_date", ""), reverse=True)
        return rows[0] if rows else None

    out = {}
    for ind in ("All", "Electronics"):
        for res in ("stopped", "released", "denied", "pending"):
            r = pick(ind, res)
            if r:
                out.setdefault(ind.lower(), {})[res] = {
                    "shipments": num(r.get("shipments")), "value_usd": num(r.get("value_usd")),
                    "period": r.get("period"), "source_id": r.get("source_id"), "notes": r.get("notes", "")}
    # HTS 8541 (solar proxy), if captured
    for res in ("stopped", "released", "denied", "pending"):
        rows = [r for r in stats if r.get("hts4") == "8541" and r.get("exam_result") == res and r.get("period_type") == "cumulative" and r.get("country_of_origin", "").lower() in ("", "all")]
        if rows:
            r = sorted(rows, key=lambda r: r.get("capture_date", ""), reverse=True)[0]
            out.setdefault("hts8541", {})[res] = {"shipments": num(r.get("shipments")), "value_usd": num(r.get("value_usd")),
                                                  "period": r.get("period"), "source_id": r.get("source_id"), "notes": r.get("notes", "")}
    # Release rate = released / (released + denied), by VALUE (DECISIONS #13: line counts changed
    # definition across dashboard revisions; values are comparable). Narrowest scope first.
    for scope in ("hts8541", "electronics", "all"):
        s = out.get(scope, {})
        if "released" in s and "denied" in s and s["released"]["value_usd"] and s["denied"]["value_usd"] is not None:
            rel, den = s["released"]["value_usd"], s["denied"]["value_usd"]
            rc, dc = s["released"]["shipments"], s["denied"]["shipments"]
            out["release_rate"] = {"value": round(rel / (rel + den), 3), "basis": scope, "by": "value_usd",
                                   "by_count": round(rc / (rc + dc), 3) if rc and dc is not None else None,
                                   "source_ids": sorted({s["released"]["source_id"], s["denied"]["source_id"]})}
            break
    return out


# ---------------------------------------------------------------- build
def main() -> int:
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--exporters", help="test fixture instead of data/derived/exporters.csv")
    ap.add_argument("--out-js", help="write the site payload here instead of site/data.js")
    args = ap.parse_args()
    rules = json.loads((ROOT / "rules" / "uflpa.json").read_text())
    exporters_raw = read_csv(Path(args.exporters) if args.exporters else DERIVED / "exporters.csv")
    exs = classify(exporters_raw, rules)
    # Size measure (DECISIONS #15): USD import value when every exporter has one, else shipment counts.
    measure = "value_usd" if exs and all(e["value_usd"] is not None for e in exs) else "shipments"
    for e in exs:
        e["value"] = e["value_usd"] if measure == "value_usd" else float(e["shipments"])
    stats = read_csv(DATA / "cbp_uflpa_stats.csv")
    l2 = layer2_summary(stats)

    # Detained value used for tolerated exposure: HTS 8541 if available, else Electronics (upper bound, spec §3)
    detained_value, detained_basis = None, None
    for scope in ("hts8541", "electronics"):
        st = l2.get(scope, {}).get("stopped")
        if st and st.get("value_usd"):
            detained_value, detained_basis = st["value_usd"], scope
            break

    layer3 = {"status": "pending", "reason": "No Sayari snapshot yet: data/derived/exporters.csv is missing."}
    if exs:
        total_value = sum(e["value"] for e in exs)
        combos = {}
        for t, s, o in itertools.product(TIER_ORDER, SCOPE_ORDER, ("off", "one_hop")):
            # Tolerated exposure subtracts CBP detained USD, so it needs a USD measure.
            combos[f"{t}|{s}|{o}"] = metrics_for(exs, t, s, o, total_value, detained_value if measure == "value_usd" else None)
        by_cty: dict[str, float] = {}
        for e in exs:
            by_cty[e["country"]] = by_cty.get(e["country"], 0) + e["value"]
        traced_val = sum(e["value"] for e in exs if e["traced"])
        layer3 = {
            "status": "ok",
            "measure": measure,
            "total_value": round(total_value),
            "traced_share": round(traced_val / total_value * 100, 1) if total_value else None,
            "exporter_count": len(exs),
            "hhi_exporter_before": hhi({e["id"]: e["value"] for e in exs}),
            "hhi_country_before": hhi(by_cty),
            "combos": combos,
            "curves": curves(combos, rules),
            "detained_basis": detained_basis,
            "exporters": sorted(exs, key=lambda e: -e["value"]),
            "unmapped_factors": sorted({f for e in exs for f in e["unmapped_factors"]}),
        }

    tiers_path = DERIVED / "tiers.json"
    tiers = json.loads(tiers_path.read_text()) if tiers_path.exists() else {"status": "pending"}

    sources = read_csv(EVID / "sources.csv") + read_csv(EVID / "sources_layer2.csv")
    payload = {
        "built": date.today().isoformat(),
        "snapshot": (exporters_raw[0].get("snapshot_date") if exporters_raw else None),
        "rules": rules,
        "layer2": {"summary": l2, "stats": stats, "cases": read_csv(DATA / "cases.csv"),
                   "entity_list_history": read_csv(EVID / "entity_list_history.csv")},
        "layer3": layer3,
        "tiers": tiers,
        "evidence": {"sources": sources, "claims": read_csv(EVID / "claims.csv"),
                     "timeline": sorted(read_csv(EVID / "timeline.csv"), key=lambda r: r.get("date", ""))},
        "simulation": json.loads((ROOT / "pipeline" / "sim_inputs.json").read_text()),
    }

    # Intent rule (spec §5a): "consistent with a deliberate choice" claims are shown only when
    # (a) Layer 3 shows a cliff on that dial and (b) at least one medium-or-higher source/claim backs it.
    src_type = {s["source_id"]: s.get("source_type", "") for s in sources}
    for c in payload["evidence"]["claims"]:
        if "deliberate choice" not in c.get("claim_text", "").lower():
            continue
        dial = c.get("dial", "")
        cliff = layer3.get("status") == "ok" and any(st.get("cliff") for st in layer3["curves"].get(dial, []))
        strong = c.get("confidence", "").lower() in ("medium", "high") or any(
            src_type.get(x.strip()) in ("primary_official", "formal_submission") for x in c.get("sources", "").split(";"))
        if not (cliff and strong):
            c["held"] = "Held under the intent rule: " + ", ".join(
                r for r, ok in (("no Layer 3 cliff on this dial yet", cliff), ("no medium-or-higher supporting source", strong)) if not ok)

    # Validation: every source id referenced must exist
    ids = {s["source_id"] for s in sources}
    missing = set()
    for c in payload["evidence"]["claims"]:
        missing |= {x.strip() for x in c.get("sources", "").split(";") if x.strip() and x.strip() not in ids}
    for t in payload["evidence"]["timeline"]:
        missing |= {x.strip() for x in t.get("source_ids", "").split(";") if x.strip() and x.strip() not in ids}
    for r in stats + payload["layer2"]["cases"]:
        for x in (r.get("source_id", "") + ";" + r.get("source_ids", "")).split(";"):
            if x.strip() and x.strip() not in ids:
                missing.add(x.strip())
    if missing:
        print("WARNING: referenced source ids not in register:", ", ".join(sorted(missing)), file=sys.stderr)

    DERIVED.mkdir(parents=True, exist_ok=True)
    js = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if args.exporters:
        payload["fixture"] = True
        js = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    else:
        (DERIVED / "metrics.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    Path(args.out_js or ROOT / "site" / "data.js").write_text("window.SM_DATA=" + js + ";\n")
    print(f"layer3={layer3['status']} exporters={len(exs)} stats_rows={len(stats)} "
          f"claims={len(payload['evidence']['claims'])} timeline={len(payload['evidence']['timeline'])} sources={len(sources)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
