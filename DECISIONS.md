# Build decisions (for India's review)

Judgement calls made while building from `specification.md`. Spec §12 decisions are unchanged. Each line below is open to reversal.

## 2026-11-15
1. **Layer 3 is pending, not estimated.** Sayari was not connected in the build session, so every Layer 3 component (readout, flow volumes, exposure curves, exporter table) renders an explicit "awaiting Sayari snapshot" state. No illustrative numbers are shown as data.
2. **Simulation runs on labelled placeholders.** The flagged share at each threshold, and most input ranges, are structural placeholders with a visible "placeholder" badge and a "scenario, not forecast" banner. The release rate is calibrated from CBP once Layer 2 is captured.
3. **Simulation threshold ladder.** The dial space is collapsed into six cumulative steps for the threshold curve: T0 listed → T1 direct (≈ current) → T2 tiers 2–3 → T3 tiers 2–4 product → T4 + one-hop ownership → T5 + research-named. This order is my choice; the spec doesn't fix one.
4. **Hidden exposure scales with depth.** Untraced exposure is surfaced in proportion to rule depth (0, .25, .5, .75, .9, 1 for T0…T5). This is a structural assumption, shown in the Model box.
5. **Shortage duration model.** shortage = max(0, ramp + gap/capacity − buffer×100/gap). It's simple and stated on the page.
6. **The copula couples only hidden exposure and rerouting** (ρ = 0.5, stated assumption), as in the spec's correlation example.
7. **Layer 2 solar proxy.** HTS 8541 is used if CBP figures at that level are found (the 2026 dashboard has HTS-4 filters). Otherwise Electronics. Both are labelled as upper bounds; HTS 8541 also covers LEDs, diodes and other semiconductors.
8. **R1 research-named flags take their tier from the factor name** (e.g. `forced_labor_aspi_origin_subtier` counts at E2 under the research scope), so the tier-depth and trigger-scope dials compose.
9. **Corroboration moves confidence by one named level** (e.g. medium → high), per spec §3.
10. **Flow diagram.** The last column is "left on the US market if flagged supply is removed", drawn at absolute scale so the drop is visible. The lavender band is supply flagged only at deeper settings: the shadow market itself.
11. **Design.** Taken from the reference screenshots: indigo/periwinkle striped hero, ice-blue panels, Inter Tight display (tight tracking) with Source Sans 3 body. No mono or condensed fonts. Exposure colours were checked with the dataviz palette validator (A1/R1 pass with labels as secondary encoding).
12. **Separate git repo.** `git init` was run inside the project folder because the home directory is itself a repo (remote EvacSimulator). Remote: github.com/indiaclarke03-ops/Shadow-Market.
