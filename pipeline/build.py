"""The Shadow Market: build derived metrics from immutable inputs.

Reads:   rules/uflpa.json
         data/derived/exporters.csv   (written by pipeline/extract_sayari.py from data/raw/)
         data/derived/tiers.json      (optional; upstream tracing for the flow diagram)
         data/cbp_uflpa_stats.csv, data/cases.csv
         data/evidence/*.csv (sources, sources_layer2, sources_sim, sources_method, claims, timeline)
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
def _rx_table(path: Path) -> list[dict]:
    import re
    rows = read_csv(path)
    for r in rows:
        r["_rx"] = re.compile(r["name_regex"], re.I)
    return rows


def classify(exporters: list[dict], rules: dict) -> list[dict]:
    """Product check (DECISIONS #26): exporters whose product doesn't follow the polysilicon route
    (pipeline/product_relevance.csv) keep their Sayari flags in `flags_all`, but `flags` is emptied, so
    every headline figure is computed with the check on. Figures with the check off are kept alongside.
    Enforcement on record (DECISIONS #27): `detained_group` names the corporate group if it has a
    public solar detention or denial (pipeline/enforced_groups.csv, case ids from data/cases.csv)."""
    prod = _rx_table(ROOT / "pipeline" / "product_relevance.csv")
    groups = _rx_table(ROOT / "pipeline" / "enforced_groups.csv")
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
        name = e.get("name", "")
        pr = next((r for r in prod if r["_rx"].search(name)), None)
        grp = next((g for g in groups if g["_rx"].search(name)), None)
        relevant = not (pr and pr["polysilicon_route"] == "n")
        out.append({
            "id": e.get("exporter_id") or e.get("name"),
            "flags_all": flags,
            "product_relevant": relevant,
            "technology": pr["technology"] if pr else "",
            "product_note": pr["reason"] if pr else "",
            "product_sources": [x.strip() for x in (pr.get("source_ids", "") if pr else "").split(";") if x.strip()],
            "detained_group": grp["group"] if grp else "",
            "detained_cases": grp["case_ids"].split(";") if grp else [],
            "name": e.get("name", ""),
            "country": e.get("country", "") or "Unknown",
            "stage": e.get("stage", ""),
            "value": num(e.get("us_import_value_usd")),
            "value_usd": num(e.get("us_import_value_usd")),
            "shipments": int(num(e.get("shipments"), 0) or 0),
            "flags": flags if relevant else [],
            "unmapped_factors": unknown,
            "levels": sorted({fl["level"] for fl in flags}),
            "weight_t": None,
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


def _wshare(exs, exposed):
    tot = sum(e["weight_t"] or 0 for e in exs)
    return round(sum(e["weight_t"] or 0 for e in exposed) / tot * 100, 2) if tot else None


def hhi(values: dict[str, float]) -> float | None:
    tot = sum(values.values())
    if tot <= 0:
        return None
    return round(sum((v / tot * 100) ** 2 for v in values.values()), 1)


def metrics_for(exs: list[dict], tier, scope, own, total_value, detained_value):
    exposed = [e for e in exs if e["traced"] and flagged_under(e, tier, scope, own)]
    return _metrics(exs, exposed, total_value, detained_value)


def _metrics(exs, exposed, total_value, detained_value):
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
        "not_detained_share": round(sum(e["value"] for e in exposed if not e["detained_group"]) / total_value * 100, 2) if total_value else None,
        "exposed_weight_share": _wshare(exs, exposed),
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


def apply_weights(exs):
    """Estimated weight (DECISIONS #28): shipments × median kg per shipment, from Sayari shipment
    samples for the largest exporters (data/derived/shipment_samples.csv); others use the pooled median."""
    rows = [r for r in read_csv(DERIVED / "shipment_samples.csv") if num(r.get("median_weight_kg"))]
    by_id: dict[str, list[float]] = {}
    for r in rows:
        by_id.setdefault(r["sayari_entity_id"], []).append(num(r["median_weight_kg"]))
    meds = sorted(v for vs in by_id.values() for v in vs)
    pooled = meds[len(meds) // 2] if meds else None
    for e in exs:
        kg = sorted(by_id.get(e["sayari_entity_id"], []))
        per = kg[len(kg) // 2] if kg else pooled
        e["weight_t"] = round(e["shipments"] * per / 1000, 1) if per else None
        e["weight_sampled"] = bool(kg)
    return pooled


def weight_meta(exs):
    tot = sum(e["weight_t"] or 0 for e in exs)
    if not tot:
        return {"status": "pending"}
    sampled = sum(e["weight_t"] or 0 for e in exs if e.get("weight_sampled"))
    return {"status": "ok", "total_t": round(tot), "sampled_share": round(sampled / tot * 100, 1),
            "sampled_exporters": sum(1 for e in exs if e.get("weight_sampled"))}


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
def write_named_sheet(l3: dict) -> None:
    """Review sheet for every exporter the page names (top 30 with a link): for independent review and right of reply."""
    rows = [e for e in l3["exporters"] if e["flags_all"]][:30]
    cols = ["rank", "name", "country", "sayari_entity_id", "us_shipments", "share_pct", "link_levels", "link_factors",
            "product_check", "detained_group", "case_ids", "confidence", "reviewer", "review_date", "right_of_reply_sent", "response"]
    tot = l3["total_value"]
    with (DERIVED / "named_companies.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for i, e in enumerate(rows, 1):
            w.writerow({"rank": i, "name": e["name"], "country": e["country"], "sayari_entity_id": e["sayari_entity_id"],
                        "us_shipments": e["shipments"], "share_pct": round(e["value"] / tot * 100, 2),
                        "link_levels": ";".join(sorted({x["level"] for x in e["flags_all"]})),
                        "link_factors": ";".join(x["factor"] for x in e["flags_all"]),
                        "product_check": e["technology"] or "polysilicon route", "detained_group": e["detained_group"],
                        "case_ids": ";".join(e["detained_cases"]), "confidence": e["confidence"] or "",
                        "reviewer": "", "review_date": "", "right_of_reply_sent": "", "response": ""})


def slim_for_site(payload: dict) -> dict:
    """The page needs level + scope per flag, not factor names; full detail stays in metrics.json."""
    l3 = payload["layer3"]
    if l3.get("status") != "ok":
        return payload
    def fl(flags):
        return [dict(t) for t in sorted({(("level", f["level"]), ("scope", f["scope"])) for f in flags})]
    notes, psrc = {}, {}
    exs = []
    for i, e in enumerate(l3["exporters"]):
        x = {k: e[k] for k in ("id", "name", "country", "value", "shipments", "weight_t", "levels", "confidence", "traced",
                               "product_relevant", "detained_group", "detained_cases", "technology", "sayari_entity_id")}
        x["flags"] = fl(e["flags"])
        if not e["product_relevant"]:
            x["flags_all"] = fl(e["flags_all"])
        if e["product_note"]:
            notes[e["technology"]] = e["product_note"]
            psrc[e["technology"]] = e["product_sources"]
        x["source_records"] = e["source_records"] if i < 60 else []
        exs.append(x)
    return {**payload, "layer3": {**l3, "exporters": exs, "product_notes": notes, "product_sources": psrc}}


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
        apply_weights(exs)
        dv = detained_value if measure == "value_usd" else None  # tolerated exposure needs USD
        combos = {}
        for t, s, o in itertools.product(TIER_ORDER, SCOPE_ORDER, ("off", "one_hop")):
            combos[f"{t}|{s}|{o}"] = metrics_for(exs, t, s, o, total_value, dv)
        # Enforcement on record: every exporter in a group with a public solar detention or denial
        combos["observed"] = _metrics(exs, [e for e in exs if e["detained_group"]], total_value, dv)
        # Product check off: Sayari flags as given, thin-film makers included
        raw = [{**e, "flags": e["flags_all"]} for e in exs]
        combos_unadj = {f"{t}|{s}|{o}": {k: v for k, v in metrics_for(raw, t, s, o, total_value, dv).items() if k != "exposed_ids"}
                        for t, s, o in itertools.product(TIER_ORDER, SCOPE_ORDER, ("off", "one_hop"))}
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
            "combos_unadjusted": combos_unadj,
            "product_check": {"excluded_share": round(sum(e["value"] for e in exs if not e["product_relevant"]) / total_value * 100, 2),
                              "excluded_exporters": sum(1 for e in exs if not e["product_relevant"])},
            "detained_groups": sorted({e["detained_group"] for e in exs if e["detained_group"]}),
            "weight": weight_meta(exs),
            "curves": curves(combos, rules),
            "detained_basis": detained_basis,
            "exporters": sorted(exs, key=lambda e: -e["value"]),
            "unmapped_factors": sorted({f for e in exs for f in e["unmapped_factors"]}),
        }

    tiers_path = DERIVED / "tiers.json"
    tiers = json.loads(tiers_path.read_text()) if tiers_path.exists() else {"status": "pending"}

    sources = read_csv(EVID / "sources.csv") + read_csv(EVID / "sources_layer2.csv") + read_csv(EVID / "sources_sim.csv") + read_csv(EVID / "sources_method.csv")
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
    if layer3.get("status") == "ok" and not args.exporters:
        write_named_sheet(layer3)
    site_payload = slim_for_site(payload)
    js = json.dumps(site_payload, ensure_ascii=False, separators=(",", ":"))
    if args.exporters:
        site_payload["fixture"] = True
        js = json.dumps(site_payload, ensure_ascii=False, separators=(",", ":"))
    else:
        (DERIVED / "metrics.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    Path(args.out_js or ROOT / "site" / "data.js").write_text("window.SM_DATA=" + js + ";\n")
    print(f"layer3={layer3['status']} exporters={len(exs)} stats_rows={len(stats)} "
          f"claims={len(payload['evidence']['claims'])} timeline={len(payload['evidence']['timeline'])} sources={len(sources)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
