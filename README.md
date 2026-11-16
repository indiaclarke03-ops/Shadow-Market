# The Shadow Market

What supply chain regulation catches, compared with what full supply chain transparency would reveal. Case 1: **UFLPA × US solar PV**.

**View the site:** https://indiaclarke03-ops.github.io/Shadow-Market/site/

See `concept_2.md` (the idea) and `specification.md` (the MVP spec). Judgement calls made during the build are in `DECISIONS.md`.

## Run it
```
python3 pipeline/extract_sayari.py  # data/raw → data/derived/exporters.csv
python3 pipeline/build_tiers.py     # data/raw → data/derived/tiers.json (upstream columns)
python3 pipeline/build.py          # rebuilds data/derived/metrics.json and site/data.js
open site/index.html               # works straight from disk; no server needed
```
(Until the Xcode licence is accepted on this machine, use `/Library/Developer/CommandLineTools/usr/bin/python3`.)

## Layout
```
rules/uflpa.json            Layer 1 trigger logic, dials, Sayari risk-factor → exposure-level map, cliff rule
data/raw/                   timestamped Sayari pulls (immutable)
data/cbp_uflpa_stats.csv    Layer 2: CBP enforcement statistics
data/cases.csv              Layer 2: public solar enforcement events
data/evidence/              source register, claims, timeline, Entity List history
data/derived/metrics.json   everything the site shows (generated)
pipeline/build.py           classification, all dial combinations, curves, cliffs, Layer 2 merge, validation
pipeline/extract_sayari.py  raw Sayari JSON → data/derived/exporters.csv
pipeline/build_tiers.py     hub-inbound polysilicon/wafer rollups → data/derived/tiers.json
pipeline/sim_inputs.json    Monte Carlo input distributions, with status and source
pipeline/notes/             research logs and the Sayari pull plan
site/                       index.html, styles.css, charts.js, sim.js, app.js
```

## Rules
- Exposure language only ("linked to", "exposure"), never "uses forced labour".
- A company is named only with its exposure level, confidence and source.
- Never hand-edit `data/derived/` or `site/data.js`; rebuild them.
- Layer 3 shows as **pending** until real Sayari data exists. Nothing is estimated in its place.
