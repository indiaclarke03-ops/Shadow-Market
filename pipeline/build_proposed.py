"""Case 2 (proposed rule: optical transceivers × FCC Covered List): validate and package for the page.

Reads:   rules/proposed/transceivers.json
         data/proposed/transceivers/supply.json
         data/proposed/transceivers/part_map.json   (optional: student analysis; template alongside)
         data/evidence/sources_proposed.csv, data/evidence/claims_proposed.csv
Writes:  site/data_proposed.js   (window.SM_PROPOSED; generated, never hand-edit)

Run:     python3 pipeline/build_proposed.py
"""
from __future__ import annotations

import csv
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RULES = ROOT / "rules" / "proposed" / "transceivers.json"
DIR = ROOT / "data" / "proposed" / "transceivers"
EVID = ROOT / "data" / "evidence"


class SchemaError(Exception):
    pass


def read_csv(p: Path) -> list[dict]:
    with p.open(newline="", encoding="utf-8") as f:
        return [{k: (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]


def need(obj: dict, key: str, where: str, kind=None):
    if not isinstance(obj, dict) or key not in obj:
        raise SchemaError(f"part_map.json: missing field '{where}.{key}'")
    v = obj[key]
    if kind is not None and not isinstance(v, kind):
        raise SchemaError(f"part_map.json: field '{where}.{key}' should be {kind.__name__ if isinstance(kind, type) else kind}")
    return v


def merge_part_map(supply: dict, pm: dict) -> dict:
    for k in ("analyst", "date", "sayari_snapshot"):
        need(pm, k, "root", str)
    segs = need(pm, "segments", "root", list)
    srcs = need(pm, "sources", "root", list)
    for i, s in enumerate(srcs):
        need(s, "source_id", f"sources[{i}]", str)
    by_id = {s["id"]: s for s in supply["segments"]}
    for i, s in enumerate(segs):
        w = f"segments[{i}]"
        sid = need(s, "id", w, str)
        if sid not in by_id:
            raise SchemaError(f"part_map.json: '{w}.id' = '{sid}' is not a segment id ({', '.join(by_id)})")
        seg = by_id[sid]
        need(s, "entities", w, list)
        for key in ("share_pct", "us_bom_pct"):
            blk = need(s, key, w, dict)
            for f in ("centre", "spread"):
                v = need(blk, f, f"{w}.{key}", (int, float))
                if v < 0 or v > 100:
                    raise SchemaError(f"part_map.json: '{w}.{key}.{f}' must be 0–100")
            seg[key] = {"centre": blk["centre"], "spread": blk["spread"]}
            seg.setdefault("student_basis", {})[key] = blk.get("basis", "")
        gm = need(s, "gen_mix", w, dict)
        for g in ("800G", "1.6T", "3.2T"):
            need(gm, g, f"{w}.gen_mix", (int, float))
        tot = sum(gm.values())
        if tot > 0:
            seg["gen_mix"] = {g: v / tot for g, v in gm.items()}
        seg["status"] = "from_student_analysis"
        seg["source_ids"] = sorted({x for b in ("share_pct", "us_bom_pct") for x in s[b].get("source_ids", [])} |
                                   {x for e in s["entities"] for x in e.get("source_ids", [])})
        seg["entities"] = s["entities"]
        seg["notes"] = s.get("notes", "")
    # China/Thailand splits follow the student's segment shares
    for sp in supply["splits"]:
        cn = next((s for s in supply["segments"] if s["maker"] == sp["maker"] and s["site"] == "CN"), None)
        th = next((s for s in supply["segments"] if s["maker"] == sp["maker"] and s["site"] == "TH"), None)
        if cn and th and "from_student_analysis" in (cn["status"], th["status"]):
            t = cn["share_pct"]["centre"] + th["share_pct"]["centre"]
            if t > 0:
                sp["th_share"] = {"centre": round(th["share_pct"]["centre"] / t, 3), "spread": 0.1}
                sp["status"] = "from_student_analysis"
    supply["status"] = "student_analysis"
    supply["student"] = {"analyst": pm["analyst"], "date": pm["date"], "sayari_snapshot": pm["sayari_snapshot"], "sources": srcs}
    return supply


def main() -> int:
    rules = json.loads(RULES.read_text())
    supply = json.loads((DIR / "supply.json").read_text())
    pm_path = DIR / "part_map.json"
    if pm_path.exists():
        try:
            supply = merge_part_map(supply, json.loads(pm_path.read_text()))
        except (SchemaError, json.JSONDecodeError) as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 2
        print(f"merged student analysis from {pm_path.name} ({supply['student']['analyst']}, {supply['student']['date']})")
    sources = read_csv(EVID / "sources_proposed.csv")
    claims = read_csv(EVID / "claims_proposed.csv")
    ids = {s["source_id"] for s in sources} | {s["source_id"] for s in (supply.get("student") or {}).get("sources", [])}

    # reference check
    refs = []
    for c in rules["cards"]:
        refs += [(f"card {c['id']}", x) for x in c["source_ids"]]
    for l in rules["levers"]:
        refs += [(f"lever {l['id']}", x) for x in l.get("source_ids", [])]
    for t in rules["timeline"]:
        refs += [(f"timeline {t['date']}", x) for x in t["source_ids"]]
    for k in rules["considerations"]:
        refs += [(f"consideration {k['id']}", x) for x in k["source_ids"]]
    for s in supply["segments"]:
        refs += [(f"segment {s['id']}", x) for x in s.get("source_ids", []) + s.get("named_in", [])]
    for i in supply["inputs"]:
        refs += [(f"input {i['id']}", x) for x in i.get("source_ids", [])]
    for c in claims:
        refs += [(f"claim {c['claim_id']}", x.strip()) for x in c["sources"].split(";") if x.strip()]
    missing = sorted({(w, x) for w, x in refs if x not in ids})
    for w, x in missing:
        print(f"WARNING: {w} cites {x}, which is not in sources_proposed.csv", file=sys.stderr)

    # shares must sum to 100 ± 0.5 at centre values
    tot = sum(s["share_pct"]["centre"] for s in supply["segments"])
    if abs(tot - 100) > 0.5:
        print(f"ERROR: segment shares sum to {tot}, not 100 ± 0.5", file=sys.stderr)
        return 1
    lever_ids = {l["id"] for l in rules["levers"]}
    for c in rules["cards"] + rules["presets"]:
        bad = set((c.get("sets") or c.get("set") or {})) - lever_ids
        if bad:
            print(f"ERROR: {c['id']} sets unknown lever(s) {bad}", file=sys.stderr)
            return 1

    payload = {"built": date.today().isoformat(), "rules": rules, "supply": supply,
               "evidence": {"sources": sources, "claims": claims}}
    out = ROOT / "site" / "data_proposed.js"
    out.write_text("window.SM_PROPOSED=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"ok: segments={len(supply['segments'])} cards={len(rules['cards'])} sources={len(sources)} claims={len(claims)} "
          f"status={supply['status']} missing_refs={len(missing)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
