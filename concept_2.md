# The Shadow Market — Concept

*A tool for comparing what supply chain regulation catches with what full supply chain transparency would reveal.*

Author: India Clarke · Draft v0.5 · November 2026

---

## 1. The idea in one paragraph

Regulations that target supply chain harms (forced labour, sanctions, conflict minerals, deforestation) are written with a defined reach: specific lists, specific geographies, a limited number of supplier tiers, specific standards of proof. Enforcement then catches some subset of that. **The Shadow Market** is the part of the market that sits inside a regulation's intent but outside its enforcement. The tool uses Sayari's corporate and trade graph to model a third picture: what the same rule would catch if it were applied with full visibility through the supply chain. The gap between "what enforcement catches" and "what full transparency would catch" is the **tolerated exposure**. The tool estimates what removing that exposure would do to the market: how much supply disappears, how many clean suppliers remain, and how concentrated the market becomes. That lets us ask why the regulation's lines are drawn where they are.

## 2. Why this matters

Recalls, detentions and market withdrawals are usually discussed one case at a time. Very little work asks the systemic question: **if the rules were enforced with perfect information, what would the market look like?**

That question matters because:

- **Enforcement is selective, and the reason is rarely stated.** Regulators, customs agencies and companies all make decisions about how deep to look. Those decisions shape what's on the shelf.
- **Shortage risk may be shaping the regulation itself.** If tightening a rule by one step would remove a large share of supply, there's strong pressure to keep the rule where it is. That pressure may come from industry, from other policy goals (e.g. clean energy deployment), or from regulators themselves.
- **Transparency tools are getting better.** As data like Sayari's makes deep-tier tracing possible, "we couldn't have known" becomes a weaker defence. The gap between what's knowable and what's enforced becomes a policy choice.

## 3. Research questions

1. **What is missing?** For a given regulation and product, what share of supply has exposure to the regulation's target that current enforcement doesn't catch?
2. **Is it missing on purpose?** Do the regulation's boundaries (tier depth, list scope, thresholds) sit just before a point where exposure, and therefore market disruption, rises sharply?
3. **Why is the regulation written the way it is?** What does the legislative and administrative record (consultations, lobbying, guidance, phase-ins) say about where the lines were drawn, and does it line up with the "cliffs" in the data?

Question 1 can be answered with data. Question 2 can be *suggested* by data but not proven. Question 3 needs documentary evidence alongside the data. The tool keeps these three kinds of claims clearly separate, and every claim carries a confidence level.

**Question 3 is a headline feature, not a footnote.** The data shows *where* the lines sit; the evidence layer explains *why*. Pairing the two is what makes the tool more than an exposure calculator.

## 3a. The evidence layer (question 3)

For each regulation, we build a sourced record of how its boundaries were set and how they've moved. We use as many independent sources as we can and grade each claim.

**Source types, roughly in order of reliability:**
1. **Primary official documents.** Statute text, Federal Register notices, implementing strategy and guidance, enforcement statistics, official hearing transcripts.
2. **Formal submissions.** Public comment dockets, lobbying disclosures, written testimony, company securities filings (risk factor disclosures).
3. **Independent analysis.** Think tank and academic research, law firm and trade compliance analysis, investigative journalism.
4. **Advocacy and industry statements.** Trade associations and NGOs. Useful for showing positions, but treated as partisan by definition.

**Confidence levels for every claim:**

| Level | Standard |
|---|---|
| **High** | Stated directly in a primary official document, or a matter of public record |
| **Medium** | Corroborated by at least two independent non-primary sources, or a reasonable reading of primary documents |
| **Low** | Single secondary source, or an inference drawn by us |

**Claims about intent** (question 2) get their own rule: a "cliff" in the data plus documentary evidence that the boundary was contested or chosen is reported as *evidence consistent with* a deliberate choice, never as proof. Where the record suggests another explanation (enforcement capacity, legal constraints, data limits), we report that too.

The same confidence scale applies to the data side: a company on the official list is high confidence; a sub-tier trade link is medium; a one-hop ownership link or a link to an entity named only in research is low.

## 4. The three-layer model

For each regulation × product pairing:

| Layer | Name | What it shows | Source |
|---|---|---|---|
| 1 | **The rule as written** | The trigger logic: who/what is targeted, how far upstream it reaches, what evidence standard applies | Statute, implementing guidance, official lists |
| 2 | **What enforcement catches** | Actual detentions, recalls, withdrawals | Official enforcement statistics, public cases |
| 3 | **What full transparency would catch** | The same trigger logic applied through every tier Sayari can see | Sayari trade + ownership graph, risk factors |

**Tolerated exposure = Layer 3 − Layer 2.**

**Market impact** of closing that gap is estimated with:
- share of supply (by trade value) removed
- number of remaining "clean" suppliers
- concentration of what's left (HHI by supplier and by country)
- rough time to replace removed supply (sector assumption, clearly labelled)

## 5. Regulatory "dials"

The core interaction. Each regulation is broken down into adjustable design choices. Turning a dial shows how exposure and market impact change.

Examples for UFLPA:
- **Tier depth:** direct suppliers only → tiers 2–3 → tiers 2–4 (product-relevant)
- **Trigger scope:** UFLPA Entity List only → + any Xinjiang-based entity → + entities named in independent forced labour research (ASPI, Sheffield Hallam)
- **Ownership reach:** listed entity only → + entities one ownership/control hop away
- **Lookback window:** how far back trade history counts

The analytical payoff is the **exposure curve**: as a dial tightens, does exposure rise smoothly, or is there a cliff? A rule boundary that sits right before a cliff is a finding worth explaining.

## 6. First case: UFLPA × solar (polysilicon → cells → modules)

Why start here:
- **Best ground truth for Layer 2.** CBP publishes UFLPA enforcement statistics by industry and country (detained, released, denied, pending), and solar products have been the largest category by value.
- **Clear trigger logic.** UFLPA creates a rebuttable presumption against goods made wholly or in part in Xinjiang or by entities on the UFLPA Entity List. The Entity List was expanded to 187 entities in August 2026 (from 144), which also gives a natural before/after comparison.
- **Well-mapped supply chain.** Quartz → metallurgical silicon → polysilicon → ingot/wafer → cell → module, with known chokepoints and well-known transshipment routes through Southeast Asia.
- **Real trade-offs on record.** Solar deployment goals versus forced labour enforcement is a documented policy tension, so there's a public record to test question 3 against.

Second case: **cotton / apparel under UFLPA**. Same law as case 1, very different sector, so it isolates whether the pattern is about the regulation or about solar specifically.

Third case: **cocoa under the EU Deforestation Regulation**. Different harm, different jurisdiction, and a regulation whose start has been repeatedly delayed.

Candidates considered:

| Candidate | Why it's interesting | Regulation |
|---|---|---|
| **Cotton / apparel** | Same law as case 1, so it's a clean comparison across sectors. Very long, opaque supply chains (fibre → yarn → fabric → garment) and many detentions by count but low value | UFLPA |
| **Cocoa** | Different harm (deforestation) and a different jurisdiction; Sayari has EU deforestation risk flags built in. A regulation whose start date has been repeatedly delayed, which makes question 3 interesting | EU Deforestation Regulation |
| **Seafood** | Forced labour at sea and in processing, very hard to trace; tests the limits of the data | UFLPA / US forced labour import ban (Section 307) |
| **Tomatoes / processed food** | Food-sector names were among the August 2026 Entity List additions; inputs disappear into processed products | UFLPA |

## 6a. Simulation: what happens if thresholds are crossed?

The rest of the tool tells us what's exposed and how confident we are. The simulation page turns that uncertainty into a **range of possible outcomes** using Monte Carlo methods: run the scenario thousands of times, each time drawing the uncertain inputs from realistic ranges, and look at the spread of results.

The question it answers: *"If the regulation tightened to position X, what's the probability of a significant supply gap, how big would it be, and how long would it last?"*

Key ideas:
- **Confidence levels become uncertainty.** A high-confidence exposure is close to fixed in the simulation; a low-confidence one gets a wide range. The evidence work feeds straight into the model.
- **Thresholds are the dial positions.** The output is a probability curve: as the rule tightens, how quickly does the chance of a serious shortage rise? That's a probabilistic version of the "cliff".
- **It shows what matters most.** A sensitivity view shows which uncertain input drives the result. That points to where better data would change the conclusion.
- **It's a scenario tool, not a forecast.** Every input range is sourced and visible, and users can change them.

## 7. What the tool is not

- **Not an accusation engine.** Exposure means a supply chain *connection*, not proof that a specific product contains a specific input or that a company broke the law. Companies are named where relevant, always with the exposure level, its confidence and its source, and in the language of exposure and risk.
- **Not a market forecast.** Impact figures are scenario estimates with stated assumptions, not predictions of prices or shortages.
- **Not proof of intent.** The data can show where lines sit relative to cliffs. Claims about *why* need documentary evidence and are labelled as interpretation.

## 8. Known limits (to be honest about up front)

- **Trade data coverage is uneven.** US import records are strong; many producer-country records are partial or absent. "No exposure found" can mean "no data." The tool must show coverage alongside results.
- **Company-level links ≠ product-level content.** A firm that buys Xinjiang polysilicon and sells wafers doesn't prove a particular shipment contained it.
- **Entity resolution is imperfect.** Name matching across languages and registries introduces false positives and negatives.
- **Recent activity bias.** Some Sayari trade risk factors only cover the last two years of trade activity.

## 9. Audience and outputs

- **Primary:** personal research project; demonstrated in class (Beyond the Brand).
- **Output 1:** an interactive web page: a supply-chain flow diagram showing flagged volume at each tier, with regulatory dials and a live readout of market impact.
- **Output 1b:** a simulation page showing the probability of supply disruption at each regulatory threshold.
- **Output 2:** a short written finding per case: what's missing, where the cliffs are, and what the record says about why, with confidence levels throughout.

## 10. Decisions so far

- Name: **The Shadow Market**
- Question 3 is a headline feature, built from multiple sources with confidence levels
- Individual companies are named where relevant
- Case 2 is cotton/apparel (UFLPA); case 3 is cocoa (EU Deforestation Regulation)
- The tool includes a Monte Carlo simulation page (§6a)
- "Significant disruption" = a supply gap above 20% of the market (adjustable)
- v1 models physical supply only (volume, suppliers, time). Price effects are deferred until we have data that can support them; see specification §13

## 11. Future versions

- **Price effects:** add once there's a reliable price series, a way to separate UFLPA from overlapping tariffs and duties, and sourced elasticity estimates.
