/* The Shadow Market, Case 2: proposed rule (optical transceivers × FCC Covered List).
   Reads window.SM_PROPOSED (built by pipeline/build_proposed.py). Uses the shared helpers in sim.js and charts.js.
   Neutral by design: results are conditional ("in this scenario"), never forecasts or recommendations. */
(function () {
  const SM = window.SM, P = window.SM_PROPOSED;
  if (!SM || !P) return;
  const R = P.rules, SUP = P.supply;
  const $ = (id) => document.getElementById(id);
  const { esc, COL } = SM;
  const LV = Object.fromEntries(R.levers.map((l) => [l.id, l]));
  const INP = Object.fromEntries(SUP.inputs.map((i) => [i.id, i]));
  const SRC = Object.fromEntries(P.evidence.sources.map((s) => [s.source_id, s]));
  const YEARS = SUP.demand_mix.years;
  const SEGS = SUP.segments;
  const TIER_CLASS = { primary: "high", reported: "medium", unverified: "low" };
  const f1 = (v) => (v > 0 && v < 10 ? v.toFixed(1) : v.toFixed(0));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const tri = (c, s, u, min = -Infinity, max = Infinity) => {
    const lo = Math.max(min, c - s), hi = Math.min(max, c + s);
    return hi > lo ? SM.triInv(u, lo, clamp(c, lo, hi), hi) : clamp(c, min, max);
  };
  const triCdf = (x, c, s) => { // P(X <= x), symmetric triangular c ± s
    if (s <= 0) return x >= c ? 1 : 0;
    const lo = c - s, hi = c + s;
    if (x <= lo) return 0; if (x >= hi) return 1;
    return x <= c ? ((x - lo) ** 2) / (2 * s * s) : 1 - ((hi - x) ** 2) / (2 * s * s);
  };
  const srcLinks = (ids) => (ids || []).map((id) => { const s = SRC[id]; return s && s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" data-sid="${esc(id)}">${esc(id)}</a>` : esc(id); }).join(", ");
  const bindSrc = (root) => root.querySelectorAll("a[data-sid]:not([data-bound])").forEach((n) => {
    n.setAttribute("data-bound", "1");
    SM.bindTip(n, () => { const s = SRC[n.dataset.sid] || {}; return `<b>${esc(n.dataset.sid)}</b> · ${esc(s.publisher || "")}${s.date ? ", " + esc(s.date) : ""}<br><i>${esc(s.title || "")}</i>${s.notes ? `<div class="t-src">${esc(s.notes)}</div>` : ""}`; });
  });

  /* ------------------------------------------------------------ cards: built-in + custom (localStorage, with fallback) */
  const STORE = "sm.proposed.cards";
  let memCards = [];
  const loadCustom = () => { try { const v = JSON.parse(localStorage.getItem(STORE) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return memCards; } };
  const saveCustom = (cards) => { memCards = cards; try { localStorage.setItem(STORE, JSON.stringify(cards)); } catch (e) { /* storage unavailable: kept in memory */ } };
  let custom = loadCustom();
  const allCards = () => R.cards.concat(custom);

  /* ------------------------------------------------------------ state */
  const st = { applied: new Set(), manual: {}, manualSrc: {}, preset: "reported", vals: {}, X: SUP.serious_shortfall_pct, tag: "all", federal: false, cur: null, prev: null };
  SUP.inputs.forEach((i) => (st.vals[i.id] = i.centre));
  let L = {}, setBy = {}, conf = {};
  function recompute() {
    L = Object.fromEntries(R.levers.map((l) => [l.id, l.default])); setBy = {}; conf = {};
    allCards().forEach((c) => { if (!st.applied.has(c.id)) return; for (const [k, v] of Object.entries(c.sets || {})) { L[k] = v; setBy[k] = c.id; conf[k] = c.confidence; } });
    for (const [k, v] of Object.entries(st.manual)) { L[k] = v; setBy[k] = st.manualSrc[k]; conf[k] = "high"; }
  }
  function applyPreset(id) {
    const pr = R.presets.find((p) => p.id === id);
    st.preset = id; st.applied = new Set(pr.cards || []); st.manual = {}; st.manualSrc = {};
    for (const [k, v] of Object.entries(pr.set || {})) { st.manual[k] = v; st.manualSrc[k] = "preset: " + pr.label; }
    recompute();
  }

  /* ------------------------------------------------------------ deterministic gap view (centre values) */
  function segShares(thOverride) {
    const out = {};
    SEGS.forEach((s) => (out[s.id] = s.share_pct.centre));
    SUP.splits.forEach((sp) => {
      const cn = SEGS.find((s) => s.maker === sp.maker && s.site === "CN"), th = SEGS.find((s) => s.maker === sp.maker && s.site === "TH");
      if (!cn || !th) return;
      const tot = out[cn.id] + out[th.id], f = thOverride && thOverride[sp.maker] !== undefined ? thOverride[sp.maker] : sp.th_share.centre;
      out[cn.id] = tot * (1 - f); out[th.id] = tot * f;
    });
    return out;
  }
  function inSights(seg, trig) {
    const rule = R.trigger_logic[trig];
    if (!rule || rule.never) return false;
    if (rule.any) return rule.any.some((t) => inSights(seg, t));
    if (rule.includes) return (seg[rule.field] || []).includes(rule.includes);
    return seg[rule.field] === rule.equals;
  }
  function mixAt(yi, d32) {
    const m32 = d32 ?? SUP.demand_mix.share_3_2T[yi].centre, r16 = SUP.demand_mix.share_1_6T_of_rest[yi];
    return { "3.2T": m32, "1.6T": (1 - m32) * r16, "800G": (1 - m32) * (1 - r16) };
  }
  const covers = (gen) => (LV.generation.options.find((o) => o.id === gen) || {}).covers || [];
  function nmFactor(g, y, Lx, nm) {
    if (Lx.installed === "also_existing_models") return 1;
    if (g === "3.2T" && Lx.start_year <= 2028) return 1; // no 3.2T models exist before 2028 (PR-012)
    return nm[Math.min(nm.length - 1, Math.max(0, y - Lx.start_year))];
  }
  function coveredShare(yi, Lx, d32, nm) {
    const y = YEARS[yi], mix = mixAt(yi, d32);
    return covers(Lx.generation).reduce((a, g) => a + mix[g] * nmFactor(g, y, Lx, nm), 0);
  }
  const transition = (y, Lx) => (y < Lx.start_year ? 0 : Lx.transition_years > 0 ? Math.min(1, (y - Lx.start_year + 1) / Lx.transition_years) : 1);
  const pExempt = (seg, Lx, bomShift = 0) => (Lx.exemption ? 1 - triCdf(Lx.threshold, seg.us_bom_pct.centre + bomShift, seg.us_bom_pct.spread) : 0);
  const NM_C = SUP.new_model_share.by_years_since_start.map((x) => x.centre);

  function gapRows(Lx = L) {
    const sh = segShares();
    const yi = clamp(YEARS.indexOf(Lx.start_year), 0, YEARS.length - 1), y = YEARS[yi];
    const fed = Lx.scope === "federal_nss" ? INP.fed_share.centre / 100 : 1;
    const cov = coveredShare(yi, Lx, null, NM_C) * transition(y, Lx) * fed;
    const rows = SEGS.map((s) => {
      const r1 = inSights(s, Lx.trigger) ? sh[s.id] : 0, r2 = r1 * cov, r3 = r2 * (1 - pExempt(s, Lx));
      const lo = r2 * (1 - pExempt(s, Lx, +s.us_bom_pct.spread / 2)), hi = r2 * (1 - pExempt(s, Lx, -s.us_bom_pct.spread / 2));
      return { s, share: sh[s.id], r1, r2, r3, exLo: r2 - hi, exHi: r2 - lo };
    });
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const cnhq = rows.filter((r) => r.s.hq === "CN").reduce((a, r) => a + r.share, 0);
    return { rows, y, cov, fed, sum, cnhq, covered: sum("r3"), outside: Math.max(0, cnhq - rows.filter((r) => r.s.hq === "CN").reduce((a, r) => a + r.r3, 0)) };
  }

  /* ------------------------------------------------------------ Monte Carlo */
  function altOf(k, v, rng) {
    const l = LV[k];
    if (l.type === "options") return l.alt[v] ?? v;
    if (l.type === "toggle") return !v;
    if (l.type === "range") return clamp(v + (rng() < 0.5 ? -1 : 1) * l.alt_delta, l.min, l.max);
    return v;
  }
  function simulate(opt = {}) {
    const rng = SM.rng(opt.seed ?? SUP.seed), N = opt.runs ?? SUP.runs, nY = YEARS.length;
    const base = { ...L, ...(opt.lever || {}) }, cf = { ...conf };
    Object.keys(opt.lever || {}).forEach((k) => delete cf[k]);
    const fx = opt.fixed || {};
    const rho = SUP.copula_rho_bom_shift;
    const blocked = YEARS.map(() => new Float64Array(N)), short = YEARS.map(() => new Float64Array(N));
    const peakNet = new Float64Array(N), peakShort = new Float64Array(N), peakBlocked = new Float64Array(N), delay = new Float64Array(N), price = new Float64Array(N);
    // optional: keep each future's draws for the reverse stress test (no extra random draws)
    const REC_IDS = ["fed_share", "pull_forward", "headroom", "capacity_add", "shift", "ramp", "bom_u", ...SUP.splits.map((sp) => "th_" + sp.maker)];
    const rec = opt.record ? Object.fromEntries(REC_IDS.map((k) => [k, new Float64Array(N)])) : null;
    const swaps = opt.record ? Object.fromEntries(Object.keys(conf).map((k) => [k, new Uint8Array(N)])) : null;
    const get = (id, u) => (id in fx ? fx[id] : tri(st.vals[id], INP[id].spread, u ?? rng(), INP[id].min, INP[id].max));
    for (let r = 0; r < N; r++) {
      const Lx = { ...base };
      for (const k of Object.keys(cf)) { const p = R.confidence_resample[cf[k]] || 0; if (p && rng() < p) { Lx[k] = altOf(k, Lx[k], rng); if (swaps && swaps[k]) swaps[k][r] = 1; } }
      // shares: draw each segment (split makers by total and Thailand share), then normalise to 100
      const sh = {};
      SEGS.forEach((s) => (sh[s.id] = Math.max(0, tri(s.share_pct.centre, s.share_pct.spread, rng(), 0, 100))));
      SUP.splits.forEach((sp) => {
        const cn = SEGS.find((s) => s.maker === sp.maker && s.site === "CN"), th = SEGS.find((s) => s.maker === sp.maker && s.site === "TH");
        if (!cn || !th) return;
        const tot = sh[cn.id] + sh[th.id], f = fx["th_" + sp.maker] ?? tri(sp.th_share.centre, sp.th_share.spread, rng(), 0, 1);
        sh[cn.id] = tot * (1 - f); sh[th.id] = tot * f;
        if (rec) rec["th_" + sp.maker][r] = f;
      });
      const tot = Object.values(sh).reduce((a, b) => a + b, 0) || 1;
      for (const k in sh) sh[k] = (sh[k] / tot) * 100;
      // US BOM share (common factor across segments) coupled to shifting (Gaussian copula)
      const z1 = SM.normal(rng), z2 = rho * z1 + Math.sqrt(1 - rho * rho) * SM.normal(rng);
      const uB = fx.bom_u ?? SM.phi(z1);
      const shift = "shift" in fx ? fx.shift : tri(st.vals.shift, INP.shift.spread, SM.phi(z2), INP.shift.min, INP.shift.max);
      const fed = get("fed_share"), pf = get("pull_forward"), head = get("headroom"), cap = get("capacity_add"), el = get("elasticity"), ramp = get("ramp");
      if (rec) { rec.fed_share[r] = fed; rec.pull_forward[r] = pf; rec.headroom[r] = head; rec.capacity_add[r] = cap; rec.shift[r] = shift; rec.ramp[r] = ramp; rec.bom_u[r] = uB; }
      const nm = SUP.new_model_share.by_years_since_start.map((x) => tri(x.centre, x.spread, rng(), 0, 1));
      const d32 = SUP.demand_mix.share_3_2T.map((x) => tri(x.centre, x.spread, rng(), 0, 1));
      const exF = {};
      SEGS.forEach((s) => { const b = tri(s.us_bom_pct.centre, s.us_bom_pct.spread, uB, 0, 100); exF[s.id] = Lx.exemption ? clamp((b - (Lx.threshold - 10)) / 20, 0, 1) : 0; });
      let stock = 0, pNet = 0, pS = 0, pB = 0;
      for (let yi = 0; yi < nY; yi++) {
        const y = YEARS[yi], cov = coveredShare(yi, Lx, d32[yi], nm), tr = transition(y, Lx);
        let b = 0;
        if (tr > 0 && cov > 0) for (const s of SEGS) if (inSights(s, Lx.trigger)) b += sh[s.id] * cov * (1 - exF[s.id]);
        b *= tr * (Lx.scope === "federal_nss" ? fed / 100 : 1);
        const net = b * (1 - shift);
        if (y === Lx.start_year) stock = (net * pf) / 12; // bought ahead before the start
        const gap = Math.max(0, net - head - cap * Math.max(0, y - 2026));
        const draw = Math.min(stock, gap); stock -= draw;
        const sf = gap - draw;
        blocked[yi][r] = b; short[yi][r] = sf;
        if (net > pNet) pNet = net; if (sf > pS) pS = sf; if (b > pB) pB = b;
      }
      peakNet[r] = pNet; peakShort[r] = pS; peakBlocked[r] = pB; price[r] = 100 + el * pS;
      delay[r] = pS > 0.05 ? Math.max(0, ramp + pS / (Math.max(0.5, cap) / 12) - pf * (pNet / pS)) : 0;
    }
    return { blocked, short, peakNet, peakShort, peakBlocked, delay, price, inputs: rec, swaps };
  }
  const med = (a) => SM.summarise(a, 0).p50;

  /* ------------------------------------------------------------ rendering: presets, the rule as a sentence, signals, cards */
  function renderPresets() {
    $("pr-presets").innerHTML = R.presets.map((p, i) => `<button type="button" class="preset" data-p="${p.id}" aria-pressed="${st.preset === p.id}"><span class="k">${i + 1}</span><b>${esc(p.label)}</b><span>${esc(p.blurb)}</span></button>`).join("");
    $("pr-presets").querySelectorAll(".preset").forEach((b) => b.addEventListener("click", () => { applyPreset(b.dataset.p); refresh(true); }));
  }
  const tierBadge = (t) => `<span class="tier ${TIER_CLASS[t] || "low"}">${esc(t)}</span>`;
  const leverValueLabel = (k, v) => { const l = LV[k]; if (!l) return String(v); if (l.type === "options") return (l.options.find((o) => o.id === v) || {}).label || v; if (l.type === "toggle") return v ? "on" : "off"; return k === "threshold" ? v + "%" : String(v); };

  // wording of each choice inside the rule sentence
  const SENT = {
    trigger: { none: "no transceiver rule", named: "from companies named in S.5548", entity: "from Chinese-headquartered makers", origin: "made in China", entity_or_origin: "from Chinese-headquartered makers or made in China" },
    generation: { "3.2T+": "3.2T and faster", "1.6T+": "1.6T and faster", all_new: "every generation" },
    installed: { new_models_only: "new models only", also_existing_models: "new sales of existing models too" },
    scope: { all_us: "all US buyers", federal_nss: "federal national-security systems only" },
  };
  const rangeVals = (l) => Array.from({ length: Math.round((l.max - l.min) / l.step) + 1 }, (_, i) => +(l.min + i * l.step).toFixed(4));
  const setBy2 = (k) => (setBy[k] ? (String(setBy[k]).startsWith("preset") ? "scenario" : setBy[k] === "you" ? "you" : setBy[k]) : "default");
  const confOf = (k) => (!setBy[k] ? "none" : setBy[k] === "you" || String(setBy[k]).startsWith("preset") ? "fixed" : conf[k] || "high");
  function chip(k, label) {
    const l = LV[k], v = L[k];
    let opts;
    if (l.type === "options") opts = l.options.map((o) => [o.id, (SENT[k] && SENT[k][o.id]) || o.label]);
    else if (l.type === "toggle") opts = [["true", "with a domestic-content exemption"], ["false", "with no domestic-content exemption"]];
    else opts = rangeVals(l).map((x) => [String(x), label ? label(x) : String(x)]);
    const c = confOf(k), by = setBy2(k);
    const tip = by === "default" ? "Default: no card sets this" : by === "you" ? "Set by you" : by === "scenario" ? "Set by the scenario" : `Set by card ${by}${conf[k] ? `, ${conf[k]} confidence` : ""}${conf[k] && conf[k] !== "high" ? " (varies across futures)" : ""}`;
    return `<span class="rchip c-${c}" title="${esc(tip)}"><select data-l="${k}" aria-label="${esc(l.label)}">${opts.map(([id, t]) => `<option value="${esc(id)}" ${String(v) === id ? "selected" : ""}>${esc(t)}</option>`).join("")}</select><small>${esc(by === "default" ? "default" : by === "you" ? "you" : by === "scenario" ? "scenario" : `${by} · ${conf[k] || ""}`)}</small></span>`;
  }
  function renderRule() {
    const none = L.trigger === "none";
    const sentence = none
      ? `<p class="rs">In this scenario there is ${chip("trigger")}. Only the component rule already in force (FCC 26-50) applies, and it reaches none of the transceiver makers in this case.</p>`
      : `<p class="rs">A US rule that blocks new optical transceivers ${chip("trigger")}, covering ${chip("generation")} and ${chip("installed")}, for ${chip("scope")}. It starts in ${chip("start_year")}, ${chip("transition_years", (x) => (x ? `phased in over ${x} year${x > 1 ? "s" : ""}` : "in full from the first year"))}, ${chip("exemption")}${L.exemption ? ` for modules where ${chip("threshold", (x) => x + "%")} or more of the parts’ value comes from US companies` : ""}.</p>`;
    $("pr-rule").innerHTML = `<p class="pr-k">The rule in this scenario</p>${sentence}
      <div class="rs-key"><span class="c-high">card, high confidence</span><span class="c-medium">card, medium: varies in 25% of futures</span><span class="c-low">card, low: varies in 50%</span><span class="c-fixed">scenario or you</span><span class="c-none">default</span></div>`;
    $("pr-rule").querySelectorAll("select[data-l]").forEach((el) => el.addEventListener("change", () => {
      const l = LV[el.dataset.l], v = l.type === "toggle" ? el.value === "true" : l.type === "range" ? +el.value : el.value;
      st.manual[l.id] = v; st.manualSrc[l.id] = "you"; st.preset = null; recompute(); refresh(true);
    }));
  }
  function renderTimeline() {
    const items = R.timeline.slice().sort((a, b) => a.date.localeCompare(b.date));
    $("pr-timeline").innerHTML = `<ol class="htl">${items.map((t) => `<li class="${t.tier === "primary" ? "p" : "r"}"><span class="d">${esc(t.date)}</span><i></i><div class="ev">${esc(t.event)}</div><div class="meta">${tierBadge(t.tier)} <span>${srcLinks(t.source_ids)}</span></div></li>`).join("")}</ol>`;
  }
  function renderCards() {
    $("pr-cards").innerHTML = allCards().map((c) => {
      const sets = Object.entries(c.sets || {});
      const on = st.applied.has(c.id);
      return `<article class="pr-card ${on ? "applied" : ""}">
        <div class="top"><b>${esc(c.id)}</b>${tierBadge(c.tier)}<span class="conf ${c.confidence === "high" ? "high" : c.confidence === "low" ? "low" : "medium"}">${esc(c.confidence)}</span><span class="date">${esc(c.date || "")}</span></div>
        <h5>${esc(c.headline)}</h5>
        <div class="sets">${sets.length ? sets.map(([k, v]) => `<span><em>${esc(LV[k] ? LV[k].label : k)}</em> ${esc(leverValueLabel(k, v))}</span>`).join("") : `<span class="ctx">Context only: sets no part of the rule</span>`}</div>
        <details><summary>Details and sources</summary>${c.note ? `<p>${esc(c.note)}</p>` : ""}${c.tier !== "primary" ? `<p class="small">${esc(R.no_official_text)}</p>` : ""}<p class="srcs">${c.custom ? (c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">source</a> · added by you, not in the source register` : "no source given · added by you") : "Sources: " + srcLinks(c.source_ids)}</p></details>
        <div class="foot">${sets.length ? `<label class="switch"><input type="checkbox" data-card="${esc(c.id)}" ${on ? "checked" : ""}><span>${on ? "Applied" : "Apply"}</span></label>` : ""}${c.custom ? `<button type="button" class="act" data-del="${esc(c.id)}">Remove</button>` : ""}</div>
      </article>`;
    }).join("");
    $("pr-cards").querySelectorAll("input[data-card]").forEach((i) => i.addEventListener("change", () => {
      i.checked ? st.applied.add(i.dataset.card) : st.applied.delete(i.dataset.card);
      st.preset = null; recompute(); refresh(true);
    }));
    $("pr-cards").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      custom = custom.filter((c) => c.id !== b.dataset.del); st.applied.delete(b.dataset.del); saveCustom(custom); recompute(); refresh(true);
    }));
    bindSrc($("pr-cards"));
  }

  function renderForm() {
    const f = $("pr-form");
    const leverRow = (l) => {
      const opts = l.type === "options" ? l.options.map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join("")
        : l.type === "toggle" ? '<option value="true">on</option><option value="false">off</option>'
        : Array.from({ length: Math.round((l.max - l.min) / l.step) + 1 }, (_, i) => l.min + i * l.step).map((v) => `<option value="${v}" ${v === l.default ? "selected" : ""}>${v}</option>`).join("");
      return `<div><input type="checkbox" name="use_${l.id}" id="use_${l.id}"><label for="use_${l.id}" style="display:inline;font-weight:400">${esc(l.label)}</label><select name="val_${l.id}" aria-label="${esc(l.label)} value">${opts}</select></div>`;
    };
    f.innerHTML = `<label>Headline<input name="headline" required maxlength="160"></label>
      <div class="grid2"><label>Date<input name="date" type="date"></label><label>Source URL<input name="url" type="url" placeholder="https://"></label></div>
      <div class="grid2"><label>Tier<select name="tier"><option>primary</option><option selected>reported</option><option>unverified</option></select></label>
      <label>Confidence<select name="confidence"><option>high</option><option selected>medium</option><option>low</option></select></label></div>
      <fieldset><legend class="small">Which design choices it changes</legend>${R.levers.map(leverRow).join("")}</fieldset>
      <div style="display:flex;gap:8px"><button class="btn" type="submit" style="color:var(--navy)">Add card</button><button class="btn" type="button" id="pr-cancel" style="color:var(--ink-3)">Cancel</button></div>`;
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = new FormData(f), sets = {};
      R.levers.forEach((l) => { if (d.get("use_" + l.id)) { const v = d.get("val_" + l.id); sets[l.id] = l.type === "toggle" ? v === "true" : l.type === "range" ? +v : v; } });
      const n = custom.reduce((a, c) => Math.max(a, +(c.id.split("-")[1] || 0)), 0) + 1;
      const card = { id: "U-" + n, headline: String(d.get("headline")).trim(), date: d.get("date") || "", tier: d.get("tier"), confidence: d.get("confidence"), url: String(d.get("url") || "").trim(), sets, custom: true, source_ids: [] };
      if (!card.headline) return;
      custom = custom.concat(card); saveCustom(custom); f.hidden = true; renderCards();
    };
    $("pr-cancel").onclick = () => (f.hidden = true);
  }
  function setupCardTools() {
    $("pr-add").addEventListener("click", () => { const f = $("pr-form"); f.hidden = !f.hidden; if (!f.hidden) { renderForm(); f.querySelector("input").focus(); } });
    $("pr-export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), applied: [...st.applied], cards: custom }, null, 1)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "shadow-market-proposed-cards.json"; document.body.appendChild(a); a.click(); a.remove();
    });
    $("pr-import").addEventListener("change", (e) => {
      const file = e.target.files[0]; if (!file) return;
      file.text().then((t) => {
        let d; try { d = JSON.parse(t); } catch (err) { alert("That file isn't valid JSON."); return; }
        const cards = (Array.isArray(d) ? d : d.cards || []).filter((c) => c && typeof c.headline === "string" && c.sets && typeof c.sets === "object")
          .map((c) => ({ id: String(c.id || ""), headline: c.headline.slice(0, 160), date: String(c.date || ""), tier: ["primary", "reported", "unverified"].includes(c.tier) ? c.tier : "unverified", confidence: ["high", "medium", "low"].includes(c.confidence) ? c.confidence : "low", url: /^https?:\/\//.test(c.url || "") ? c.url : "", sets: Object.fromEntries(Object.entries(c.sets).filter(([k]) => LV[k])), custom: true, source_ids: [] }));
        let n = custom.reduce((a, c) => Math.max(a, +(c.id.split("-")[1] || 0)), 0);
        cards.forEach((c) => (c.id = "U-" + ++n));
        custom = custom.concat(cards); saveCustom(custom); renderCards();
        e.target.value = "";
      });
    });
  }

  /* ------------------------------------------------------------ rendering: who the rule reaches */
  const UST = {
    covered: { label: "Covered in the first year", col: "#8eaad6" },
    exempt: { label: "Exempt under the US-content test", col: "#c9b6e4" },
    later: { label: "In its sights, not covered yet (products, timing or buyers)", col: "rgba(142,170,214,0.32)", ring: true },
    outside: { label: "Chinese-headquartered, outside this rule", col: "#c8841a" },
    other: { label: "Other makers, not targeted", col: "rgba(243,245,249,0.14)" },
  };
  // largest-remainder rounding of a list of values to integers that sum to n
  function lr(vals, n) {
    const tot = vals.reduce((a, b) => a + b, 0) || 1, raw = vals.map((v) => (v / tot) * n), fl = raw.map(Math.floor);
    let left = n - fl.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { fl[i]++; left--; } });
    return fl;
  }
  function renderGap() {
    const g = gapRows();
    const none = L.trigger === "none";
    const m = (lbl, val, sub, cls = "") => `<div class="metric ${cls}"><div class="lbl">${lbl}</div><div class="num">${val}</div><div class="sub">${sub}</div></div>`;
    $("pr-gap-readout").innerHTML = [
      m("Covered by the rule in its first year", f1(g.covered) + "%", none ? "no transceiver rule in this scenario" : `of US AI data-centre transceiver supply, ${g.y}`, "key"),
      m("From Chinese-headquartered makers, outside the rule", f1(g.outside) + "%", `Chinese-headquartered makers supply ${f1(g.cnhq)}% in this illustration`),
      m("Equipment already installed", "Unaffected", none ? "no new rule" : "stays in place until normal refresh (PR-013)"),
    ].join("");
    // unit chart: 100 squares, a row per segment
    const counts = lr(g.rows.map((r) => r.share), 100);
    const rowsHTML = g.rows.map((r, i) => {
      const n = counts[i], cn = r.s.hq === "CN";
      const parts = [r.r3, Math.max(0, r.r2 - r.r3), Math.max(0, r.r1 - r.r2), Math.max(0, r.share - r.r1)];
      const k = lr(parts, n), cls = ["covered", "exempt", "later", cn ? "outside" : "other"];
      let sq = "";
      cls.forEach((c, j) => { for (let q = 0; q < k[j]; q++) sq += `<i class="u ${c}"></i>`; });
      return `<div class="urow${r.s.site === "TH" ? " th" : ""}" data-seg="${esc(r.s.id)}"><div class="ul"><b>${esc(r.s.label)}</b><span>${f1(r.share)}%${r.s.site === "TH" ? " · made in Thailand" : ""}</span></div><div class="us">${sq}</div></div>`;
    }).join("");
    $("pr-units").innerHTML = rowsHTML;
    $("pr-units-year").textContent = none ? "no rule" : `first year: ${g.y}`;
    $("pr-units").querySelectorAll(".urow").forEach((row) => {
      const r = g.rows.find((x) => x.s.id === row.dataset.seg);
      SM.bindTip(row, () => `<b>${esc(r.s.label)}</b>${r.s.examples ? `<br><i>${esc(r.s.examples)}</i>` : ""}<br>Share of supply: ${f1(r.share)}% (illustrative)<br>In the rule’s sights: ${f1(r.r1)}% · covered when it starts: ${f1(r.r2)}% · after exemptions: ${f1(r.r3)}%<div class="t-src">${esc(r.s.status)} · sources ${esc((r.s.source_ids || []).join(", "))}</div>`);
    });
    const used = new Set([...$("pr-units").querySelectorAll(".u")].map((x) => x.classList[1]));
    $("pr-units-legend").innerHTML = Object.entries(UST).filter(([k]) => used.has(k)).map(([k, v]) => `<span><i style="background:${v.col}" class="${v.ring ? "ring" : ""}"></i>${esc(v.label)}</span>`).join("") + `<span class="small">Striped rows are made in Thailand.</span>`;
    // funnel
    const s1 = g.sum("r1"), s2 = g.sum("r2"), s3 = g.covered;
    const step = (n, lbl, v, drop, dropLbl) => `<div class="fs"><span class="fn">${n}</span><b>${f1(v)}%</b><span class="fl">${lbl}</span>${drop > 0.05 ? `<span class="fd">− ${f1(drop)} ${dropLbl}</span>` : ""}</div>`;
    $("pr-funnel").innerHTML = `<p class="pr-k">From all supply to what the rule covers</p>` +
      step(1, "all US AI data-centre transceiver supply", 100, 0, "") +
      step(2, "in the rule’s sights", s1, 100 - s1, "outside who the rule catches") +
      step(3, `covered when it starts (${g.y})`, s2, s1 - s2, "products, timing or buyers not covered yet") +
      step(4, "covered after exemptions", s3, s2 - s3, "exempt under the US-content test");
    // why
    const cnRows = g.rows.filter((r) => r.s.hq === "CN"), notIn = cnRows.filter((r) => !r.r1 && r.share > 0);
    const genLoss = s1 - s2, exLo = g.rows.reduce((a, r) => a + r.exLo, 0), exHi = g.rows.reduce((a, r) => a + r.exHi, 0);
    const why = [];
    if (none) why.push("No transceiver rule in this scenario. The component rule (FCC 26-50) reaches only producer-based Covered List entities such as Huawei and ZTE, so it covers none of these segments (I-1).");
    if (notIn.length && !none) why.push(`<b>Outside who the rule catches</b> (“${esc(leverValueLabel("trigger", L.trigger))}”): ${notIn.map((r) => `${esc(r.s.label)} (${f1(r.share)}%)`).join(", ")}. ${L.trigger === "origin" ? "Thailand-made modules are outside a rule based on where things are made." : L.trigger === "named" ? "Only companies named in S.5548 are in scope." : ""}`);
    if (genLoss > 0.05) why.push(`<b>Products and timing</b> remove ${f1(genLoss)} points: in ${g.y} the rule covers ${esc(leverValueLabel("generation", L.generation))}, which is ${f1(coveredShare(YEARS.indexOf(clamp(g.y, YEARS[0], YEARS[YEARS.length - 1])), L, null, NM_C) * 100)}% of new purchases that year${L.installed === "new_models_only" ? ", once models authorised before the start (which keep selling) are left out" : ""}${L.transition_years > 0 ? `, phased in over ${L.transition_years} years` : ""}${L.scope === "federal_nss" ? `, and only federal buyers (about ${INP.fed_share.centre}% of demand, placeholder)` : ""}.`);
    if (L.exemption && exHi > 0.05) why.push(`<b>The ${L.threshold}% US-content exemption</b> removes an estimated ${f1(exLo)}–${f1(exHi)} points, depending on how much of each module’s value comes from US companies (unknown: no public parts data).`);
    $("pr-why").innerHTML = why.length ? `<p class="pr-k">Why the rule reaches what it does</p><ul>${why.map((t) => `<li>${t}</li>`).join("")}</ul>` : "";
  }

  /* ------------------------------------------------------------ rendering: simulation */
  const fmtIn = (i, v) => (i.unit === "share" ? Math.round(v * 100) + "%" : i.unit === "pct" ? v.toFixed(1).replace(".0", "") + "%" : i.unit === "months" ? v + " mo" : v.toFixed(1));
  function renderSimControls() {
    const pc = (i, v) => ((v - i.min) / (i.max - i.min)) * 100 + "%";
    $("pr-sim-controls").innerHTML = `<div class="ctl-group"><p class="kicker">Uncertain inputs</p><p class="small held" style="margin:0 0 12px">All are placeholders until sourced. Drag to see the results move.</p>${SUP.inputs.map((i) => {
      const step = i.unit === "share" ? 0.05 : i.unit === "index" ? 0.25 : i.unit === "pct" ? 0.5 : 1;
      return `<div class="ctl"><label for="pin-${i.id}">${esc(i.label)}</label><div class="q">${esc(i.source)}</div>
        <div class="row"><input type="range" id="pin-${i.id}" min="${i.min}" max="${i.max}" step="${step}" value="${st.vals[i.id]}" style="--p:${pc(i, st.vals[i.id])}"><span class="val" id="pval-${i.id}">${fmtIn(i, st.vals[i.id])}</span></div>
        <div class="meta"><span>varies ± ${fmtIn(i, i.spread)}</span><span class="badge pend">${esc(i.status)}</span></div></div>`;
    }).join("")}</div>
    <div class="ctl-group"><p class="kicker">The line</p><div class="ctl"><label for="pin-X">What counts as a serious shortfall?</label><div class="q">Peak-year shortfall above this share of demand.</div>
    <div class="row"><input type="range" id="pin-X" min="2" max="40" step="1" value="${st.X}" style="--p:${((st.X - 2) / 38) * 100}%"><span class="val" id="pval-X">${st.X}%</span></div></div></div>`;
    let raf = 0;
    const preview = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; compute(true); }); };
    SUP.inputs.forEach((i) => {
      const el = $("pin-" + i.id);
      el.addEventListener("input", () => { st.vals[i.id] = +el.value; $("pval-" + i.id).textContent = fmtIn(i, +el.value); el.style.setProperty("--p", pc(i, +el.value)); preview(); });
      el.addEventListener("change", () => compute());
    });
    const x = $("pin-X");
    x.addEventListener("input", () => { st.X = +x.value; $("pval-X").textContent = st.X + "%"; x.style.setProperty("--p", ((st.X - 2) / 38) * 100 + "%"); preview(); });
    x.addEventListener("change", () => compute());
  }
  // quick = while dragging: fewer futures, and the slower comparisons keep their last values
  function compute(quick) {
    const res = simulate(quick ? { runs: 2500 } : {}), X = st.X, N = res.peakShort.length;
    const S = { res, X, blockedP: SM.summarise(res.peakBlocked, 0), netP: SM.summarise(res.peakNet, 0), shortP: SM.summarise(res.peakShort, X), delay: SM.summarise(res.delay, 0), price: SM.summarise(res.price, 0) };
    S.years = YEARS.map((y, i) => ({ y, b: SM.summarise(res.blocked[i], 0), s: SM.summarise(res.short[i], 0) }));
    let ser = 0, some = 0, blockedOnly = 0;
    for (let r = 0; r < N; r++) { if (res.peakShort[r] > X) ser++; else if (res.peakShort[r] > 0.05) some++; else if (res.peakBlocked[r] > 0.5) blockedOnly++; }
    S.cats = { ser: ser / N * 100, some: some / N * 100, blocked: blockedOnly / N * 100, none: (N - ser - some - blockedOnly) / N * 100 };
    const posDelay = Array.from(res.delay).filter((v) => v > 0).sort((a, b) => a - b);
    S.delayGivenShort = posDelay.length ? posDelay[Math.floor(posDelay.length / 2)] : 0;
    S.pDelay = posDelay.length / N * 100;
    S.L = { ...L };
    const same = st.cur && JSON.stringify(st.cur.L) === JSON.stringify(S.L);
    S.trig = quick && same ? st.cur.trig : ["named", "entity", "origin", "entity_or_origin"].map((t) => ({ t, sum: SM.summarise(simulate({ runs: 2500, lever: { trigger: t } }).peakNet, 0) }));
    S.sens = quick && same ? st.cur.sens : L.trigger === "none" ? null : sensitivity();
    S.flow = decomp(S.L);
    if (quick) { if (!st.dragBase) st.dragBase = st.cur; st.prev = st.dragBase; }
    else { st.prev = st.dragBase || st.cur; st.dragBase = null; }
    st.cur = S;
    renderSim(quick);
  }

  function sensitivity() {
    const runs = 2000, base = med(simulate({ runs }).peakNet), rows = [];
    SUP.inputs.forEach((i) => {
      const lo = Math.max(i.min, st.vals[i.id] - i.spread * 0.55), hi = Math.min(i.max, st.vals[i.id] + i.spread * 0.55);
      rows.push({ id: i.id, label: i.label, lo: med(simulate({ runs, fixed: { [i.id]: lo } }).peakNet), hi: med(simulate({ runs, fixed: { [i.id]: hi } }).peakNet), tip: `${fmtIn(i, lo)} → ${fmtIn(i, hi)}` });
    });
    rows.push({ id: "bom", label: "US share of BOM value (all makers)", lo: med(simulate({ runs, fixed: { bom_u: 0.1 } }).peakNet), hi: med(simulate({ runs, fixed: { bom_u: 0.9 } }).peakNet), tip: "low end → high end of each segment’s range" });
    SUP.splits.forEach((sp) => rows.push({ id: "th_" + sp.maker, label: sp.label, lo: med(simulate({ runs, fixed: { ["th_" + sp.maker]: clamp(sp.th_share.centre - sp.th_share.spread * 0.55, 0, 1) } }).peakNet), hi: med(simulate({ runs, fixed: { ["th_" + sp.maker]: clamp(sp.th_share.centre + sp.th_share.spread * 0.55, 0, 1) } }).peakNet), tip: "less → more made in Thailand" }));
    ["trigger", "generation", "installed", "scope", "exemption", "threshold", "start_year"].forEach((k) => {
      if (k === "threshold" && !L.exemption) return;
      const l = LV[k], alt = l.type === "range" ? clamp(L[k] - l.alt_delta, l.min, l.max) : altOf(k, L[k], () => 0);
      if (alt === L[k]) return;
      rows.push({ id: k, label: `${l.label}: ${leverValueLabel(k, L[k])} → ${leverValueLabel(k, alt)}`, lo: base, hi: med(simulate({ runs, lever: { [k]: alt } }).peakNet), tip: "design choice switched to its next-most-likely option", lever: true });
    });
    rows.sort((a, b) => Math.abs(b.hi - b.lo) - Math.abs(a.hi - a.lo));
    return { base, rows: rows.slice(0, 10) };
  }
  function yearsChart(S) {
    const cont = $("pr-years"); cont.innerHTML = "";
    const w = Math.max(300, cont.clientWidth || 600), h = 260, m = { t: 18, r: 14, b: 32, l: 40 };
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    const yMax = SM.niceMax(Math.max(5, ...S.years.map((d) => d.b.p95)) * 1.1);
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": "Year by year: " + S.years.map((d) => `${d.y} blocked ${d.b.p50.toFixed(1)}%, shortfall ${d.s.p50.toFixed(1)}%`).join("; ") }, cont);
    const X = (i) => m.l + (i / (YEARS.length - 1)) * iw, Y = (v) => m.t + ih - (v / yMax) * ih;
    const g = SM.svg("g", { class: "grid" }, s);
    for (let i = 0; i <= 4; i++) { const v = (yMax / 4) * i; SM.svg("line", { x1: m.l, x2: w - m.r, y1: Y(v), y2: Y(v) }, g); SM.svg("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end" }, s).textContent = Math.round(v) + "%"; }
    const band = (k, fill) => { let d = ""; S.years.forEach((p, i) => (d += (i ? "L" : "M") + X(i) + "," + Y(p[k].p95))); for (let i = S.years.length - 1; i >= 0; i--) d += "L" + X(i) + "," + Y(S.years[i][k].p5); SM.svg("path", { d: d + "Z", fill }, s); };
    const line = (k, stroke) => { let d = ""; S.years.forEach((p, i) => (d += (i ? "L" : "M") + X(i) + "," + Y(p[k].p50))); SM.svg("path", { d, fill: "none", stroke, "stroke-width": 2.5 }, s); };
    band("b", "rgba(34,56,108,0.12)"); band("s", "rgba(155,47,38,0.14)");
    line("b", COL.E1); line("s", COL.brick);
    const si = YEARS.indexOf(S.L.start_year);
    if (si >= 0 && S.L.trigger !== "none") { SM.svg("line", { x1: X(si), x2: X(si), y1: m.t - 6, y2: m.t + ih, stroke: COL.accent, "stroke-width": 2, "stroke-dasharray": "4 3" }, s); SM.svg("text", { x: X(si) + 5, y: m.t + 4, style: "fill:#8a5810;font-weight:600" }, s).textContent = "rule starts"; }
    S.years.forEach((p, i) => {
      SM.svg("text", { x: X(i), y: h - 10, "text-anchor": "middle" }, s).textContent = p.y;
      const hit = SM.svg("rect", { x: X(i) - iw / 12, y: m.t, width: iw / 6, height: ih, class: "hit" }, s);
      SM.bindTip(hit, () => `<b>${p.y}</b><br>Blocked: ${p.b.p50.toFixed(1)}% (9 in 10: ${p.b.p5.toFixed(1)}–${p.b.p95.toFixed(1)}%)<br>Shortfall: ${p.s.p50.toFixed(1)}% (9 in 10: ${p.s.p5.toFixed(1)}–${p.s.p95.toFixed(1)}%)`);
    });
    $("pr-years-legend").innerHTML = `<span><i style="background:${COL.E1}"></i>Blocked share of demand (typical, band = 9 in 10 futures)</span><span><i style="background:${COL.brick}"></i>Shortfall after shifting, spare capacity and stock</span>`;
  }
  /* ---- where blocked supply goes, year by year: every input at its central value (same formulas as simulate) */
  function decomp(Lx) {
    const sh = segShares(), shift = st.vals.shift, fed = st.vals.fed_share, pf = st.vals.pull_forward, head = st.vals.headroom, cap = st.vals.capacity_add;
    const exF = {};
    SEGS.forEach((s) => (exF[s.id] = Lx.exemption ? clamp((s.us_bom_pct.centre - (Lx.threshold - 10)) / 20, 0, 1) : 0));
    let stock = 0;
    return YEARS.map((y, yi) => {
      const cov = coveredShare(yi, Lx, null, NM_C), tr = transition(y, Lx);
      let b = 0;
      if (tr > 0 && cov > 0) for (const s of SEGS) if (inSights(s, Lx.trigger)) b += sh[s.id] * cov * (1 - exF[s.id]);
      b *= tr * (Lx.scope === "federal_nss" ? fed / 100 : 1);
      const shifted = b * shift, net = b - shifted;
      if (y === Lx.start_year) stock = (net * pf) / 12;
      const capC = Math.min(net, Math.max(0, head + cap * Math.max(0, y - 2026)));
      const rem = net - capC, draw = Math.min(stock, rem);
      stock -= draw;
      return { y, b, shifted, capC, draw, short: Math.max(0, rem - draw), cov: cov * tr };
    });
  }
  const FLOW = [
    { k: "capC", label: "Covered by spare and new capacity", col: "#8eaad6" },
    { k: "shifted", label: "Shifts to uncovered sources", col: "#c9b6e4" },
    { k: "draw", label: "Covered by stock bought ahead", col: "#dfe8f6", ring: true },
    { k: "short", label: "Shortfall: demand that can’t be met", col: "#9b2f26" },
  ];
  let yPick = null, playT = 0, playing = false;
  function flowChart(S) {
    const cont = $("pr-yflow"); cont.innerHTML = "";
    const F = S.flow, w = Math.max(300, cont.clientWidth || 600), nar = w < 560, h = nar ? 230 : 270, m = { t: 24, r: 10, b: 30, l: 40 };
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    const yMax = SM.niceMax(Math.max(4, ...F.map((d) => d.b)) * 1.15);
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", class: "pr-yflow-svg", "aria-label": "Where blocked supply goes, by year: " + F.map((d) => `${d.y} blocked ${d.b.toFixed(1)}%, shortfall ${d.short.toFixed(1)}%`).join("; ") }, cont);
    const g = SM.svg("g", { class: "grid" }, s), Y = (v) => m.t + ih - (v / yMax) * ih;
    for (let i = 0; i <= 4; i++) { const v = (yMax / 4) * i; SM.svg("line", { x1: m.l, x2: w - m.r, y1: Y(v), y2: Y(v) }, g); SM.svg("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end" }, s).textContent = Math.round(v) + "%"; }
    const cw = iw / F.length, bw = Math.min(64, cw * 0.62);
    const show = playing ? playT : F.length;
    F.forEach((d, i) => {
      const x = m.l + i * cw + (cw - bw) / 2, col = SM.svg("g", { class: `ycol${i < show ? " on" : ""}${yPick === i ? " pick" : ""}`, "data-i": i, style: `--d:${playing ? 0 : i * 70}ms` }, s);
      SM.svg("rect", { x: x - 6, y: m.t - 10, width: bw + 12, height: ih + 10, class: "ybg" }, col);
      let y0 = m.t + ih;
      FLOW.forEach((f) => {
        const v = d[f.k]; if (v <= 0.02) return;
        const hh = (v / yMax) * ih;
        SM.svg("rect", { x, y: y0 - hh, width: bw, height: Math.max(1, hh), fill: f.col, class: "yseg", stroke: f.ring ? "#9aa6bb" : "none" }, col);
        y0 -= hh;
      });
      if (d.b > 0.05) SM.svg("text", { x: x + bw / 2, y: y0 - 6, "text-anchor": "middle", class: "lbl-strong ytot" }, col).textContent = f1(d.b) + "%";
      if (d.short > 0.05) SM.svg("text", { x: x + bw / 2, y: m.t + ih - 4, "text-anchor": "middle", style: "fill:#fff;font-size:10.5px;font-weight:700" }, col).textContent = "";
      SM.svg("text", { x: x + bw / 2, y: h - 10, "text-anchor": "middle", class: yPick === i ? "lbl-strong" : "" }, s).textContent = d.y;
      const hit = SM.svg("rect", { x: m.l + i * cw, y: m.t - 10, width: cw, height: ih + 30, class: "hit" }, s);
      hit.addEventListener("click", () => pickYear(i));
      SM.bindTip(hit, () => `<b>${d.y}</b><br>Blocked: ${f1(d.b)}% of demand${FLOW.map((f) => `<br><span style="color:${f.k === "short" ? "#9b2f26" : "inherit"}">${esc(f.label)}: ${d[f.k].toFixed(1)}%</span>`).join("")}`);
    });
    const si = YEARS.indexOf(S.L.start_year);
    if (si >= 0 && S.L.trigger !== "none") {
      const x = m.l + si * cw + 2;
      SM.svg("line", { x1: x, x2: x, y1: m.t - 14, y2: m.t + ih, stroke: COL.accent, "stroke-width": 2, "stroke-dasharray": "4 3" }, s);
      SM.svg("text", { x: x + 5, y: m.t - 4, style: "fill:#8a5810;font-weight:600;font-size:12px" }, s).textContent = "rule starts";
    }
    $("pr-yflow-legend").innerHTML = FLOW.map((f) => `<span><i style="background:${f.col}" class="${f.ring ? "outline" : ""}"></i>${esc(f.label)}</span>`).join("") + `<span class="small">Column height = share of demand the rule blocks that year. Every input at its central value.</span>`;
  }
  function yearNote(S, i) {
    const d = S.flow[i], L0 = S.L;
    if (L0.trigger === "none") return `<b>${d.y}.</b> No transceiver rule, so nothing is blocked.`;
    if (d.y < L0.start_year) return `<b>${d.y}.</b> The rule hasn’t started.${st.vals.pull_forward > 0 && d.y === L0.start_year - 1 ? ` Buyers stock up ahead of it: about ${+st.vals.pull_forward.toFixed(1)} months of what it will block.` : ""}`;
    if (d.b <= 0.05) return `<b>${d.y}.</b> The rule is in force but blocks almost nothing yet: its products make up very little of what’s bought this year.`;
    const parts = [];
    if (d.shifted > 0.05) parts.push(`${f1(d.shifted)}% shifts to uncovered sources`);
    if (d.capC > 0.05) parts.push(`${f1(d.capC)}% is covered by spare and new capacity`);
    if (d.draw > 0.05) parts.push(`${f1(d.draw)}% comes from stock bought ahead`);
    return `<b>${d.y}.</b> The rule blocks <b>${f1(d.b)}%</b> of demand (it covers ${f1(d.cov * 100)}% of purchases that year${L0.scope === "federal_nss" ? ", federal buyers only" : ""}). ${parts.length ? parts.join(", ").replace(/, ([^,]*)$/, " and $1") + ". " : ""}${d.short > 0.05 ? `That leaves a <b class="bad">shortfall of ${f1(d.short)}%</b> of demand.` : "Nothing is short."}`;
  }
  function pickYear(i) {
    yPick = i;
    const S = st.cur;
    $("pr-yearchips").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.i === i)));
    $("pr-yflow").querySelectorAll(".ycol").forEach((c) => c.classList.toggle("pick", +c.dataset.i === i));
    $("pr-ynote").innerHTML = yearNote(S, i);
  }
  let playTimer = 0;
  function playYears() {
    clearTimeout(playTimer);
    const S = st.cur, reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { playing = false; flowChart(S); pickYear(S.flow.length - 1); return; }
    playing = true; playT = 0; $("pr-play").textContent = "Playing…"; flowChart(S);
    const next = () => {
      playT++;
      const col = $("pr-yflow").querySelector(`.ycol[data-i="${playT - 1}"]`);
      if (col) col.classList.add("on");
      pickYear(playT - 1);
      if (playT < S.flow.length) playTimer = setTimeout(next, 1700);
      else { playing = false; $("pr-play").innerHTML = `<span aria-hidden="true">▶</span> Play again`; }
    };
    playTimer = setTimeout(next, 250);
  }
  function renderYearChips(S) {
    $("pr-yearchips").innerHTML = S.flow.map((d, i) => `<button type="button" data-i="${i}" aria-pressed="${yPick === i}">${d.y}</button>`).join("");
    $("pr-yearchips").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { clearTimeout(playTimer); playing = false; $("pr-play").innerHTML = `<span aria-hidden="true">▶</span> Play the years`; flowChart(st.cur); pickYear(+b.dataset.i); }));
  }

  function renderSim(quick) {
    const S = st.cur, P0 = st.prev, X = S.X;
    const d = (a, b) => (P0 && Math.abs(a - b) >= 0.1 ? `<span class="delta on">${a > b ? "▲ +" : "▼ −"}${f1(Math.abs(a - b))} pts vs last setting</span>` : "");
    const gMax = Math.max(X * 2, SM.niceMax(Math.max(S.blockedP.p95, S.shortP.p95) * 1.1));
    const gp = (v) => clamp((v / gMax) * 100, 0, 100) + "%";
    const gauge = (p, line) => `<div class="gauge"><span class="rng" style="left:${gp(p.p5)};width:calc(${gp(p.p95)} - ${gp(p.p5)})"></span><i style="width:${gp(p.p50)}"></i>${line ? `<em style="left:${gp(line)}" data-l="${line}% line"></em>` : ""}</div>`;
    $("pr-readout").innerHTML = [
      `<div class="metric key"><div class="lbl">Supply blocked in the peak year, typical future</div><div class="num">${f1(S.blockedP.p50)}%</div>${gauge(S.blockedP)}<div class="sub">9 in 10 futures: ${f1(S.blockedP.p5)}–${f1(S.blockedP.p95)}%</div>${P0 ? d(S.blockedP.p50, P0.blockedP.p50) : ""}</div>`,
      `<div class="metric ${S.shortP.p50 > X ? "bad" : ""}"><div class="lbl">Shortfall in the peak year, typical future</div><div class="num">${f1(S.shortP.p50)}%</div>${gauge(S.shortP, X)}<div class="sub">chance it’s above ${X}%: ${Math.round(S.shortP.pOver)}%</div>${P0 ? d(S.shortP.p50, P0.shortP.p50) : ""}</div>`,
      `<div class="metric ${S.pDelay >= 50 ? "bad" : ""}"><div class="lbl">Chance of a deployment delay</div><div class="num">${Math.round(S.pDelay)}%</div><div class="gauge"><i style="width:${clamp(S.pDelay, 0, 100)}%"></i></div><div class="sub">${S.pDelay > 0.5 ? `about ${f1(S.delayGivenShort)} months when there is one` : "no delay in almost every future"} · price pressure index ${Math.round(S.price.p50)}</div></div>`,
    ].join("");
    if (yPick == null || yPick >= S.flow.length) { const peak = S.flow.reduce((a, x, i) => (x.b > S.flow[a].b ? i : a), 0); yPick = peak; }
    if (!playing) { flowChart(S); renderYearChips(S); pickYear(yPick); }
    if (!$("pr-yrange-wrap").hidden) yearsChart(S);
    const cats = [
      { id: "serious", label: `Serious shortfall (above ${X}%)`, color: COL.brick, share: S.cats.ser },
      { id: "short", label: "A smaller shortfall", color: COL.accent, share: S.cats.some },
      { id: "absorbed", label: "Supply blocked, but covered by shifting, spare capacity or stock", color: COL.E3, share: S.cats.blocked },
      { id: "ok", label: "Little or no effect", color: "#ffffff", share: S.cats.none },
    ];
    const n = SM.futures($("pr-futures"), cats);
    $("pr-futures-legend").innerHTML = cats.map((c, i) => `<span><i class="${c.id === "ok" ? "outline" : ""}" style="background:${c.color}"></i><b>${n[i]}</b>&nbsp;${esc(c.label)}</span>`).join("");
    const LBL = { named: "Named only", entity: "Chinese-HQ", origin: "Made in China", entity_or_origin: "Either" };
    SM.reachChart($("pr-trigger"), S.trig.map((x) => ({ short: LBL[x.t], ...x.sum, sel: S.L.trigger === x.t, t: x.t })), {
      yMax: Math.min(100, SM.niceMax(Math.max(5, ...S.trig.map((x) => x.sum.p95)) * 1.15)),
      tip: (p) => `<b>${esc(leverValueLabel("trigger", p.t))}</b><br>Typical peak blocked share after shifting: ${p.p50.toFixed(1)}%<br>9 in 10 futures: ${p.p5.toFixed(1)}–${p.p95.toFixed(1)}%`,
      onPick: (i) => { st.manual.trigger = S.trig[i].t; st.manualSrc.trigger = "you"; st.preset = null; recompute(); refresh(true); },
    });
    $("pr-analysis").innerHTML = analyse(S, P0);
    if (quick) return;
    if (S.sens) SM.tornado($("pr-tornado"), S.sens.rows, S.sens.base, { baseLabel: "typical peak blocked share", tip: (r) => `<b>${esc(r.label)}</b><br>${esc(r.tip)}<br>Typical peak blocked share: ${r.lo.toFixed(1)}% → ${r.hi.toFixed(1)}%` });
    else $("pr-tornado").innerHTML = `<div class="pending" style="min-height:120px"><div><strong>Nothing to test</strong>With no transceiver rule, no input changes the result.</div></div>`;
    renderChecklist();
    renderDetails();
  }
  function setupTabs() {
    const sel = (range) => {
      $("pr-tab-flow").setAttribute("aria-selected", String(!range)); $("pr-tab-range").setAttribute("aria-selected", String(range));
      $("pr-yflow-wrap").hidden = range; $("pr-yrange-wrap").hidden = !range;
      if (st.cur) { if (range) yearsChart(st.cur); else flowChart(st.cur), pickYear(yPick); }
    };
    $("pr-tab-flow").addEventListener("click", () => sel(false));
    $("pr-tab-range").addEventListener("click", () => sel(true));
    $("pr-play").addEventListener("click", playYears);
  }

  /* ------------------------------------------------------------ planning roadmap */
  function renderRoadmap() {
    const box = $("pr-roadmap"); if (!box || !st.cur) return;
    const S = st.cur, L0 = S.L, F = S.flow, none = L0.trigger === "none";
    const y0 = YEARS[0], y1 = YEARS[YEARS.length - 1] + 1, pos = (y) => ((y - y0) / (y1 - y0)) * 100;
    const marks = [];
    const built = (P.built || "").slice(0, 7).split("-"), now = built.length === 2 ? +built[0] + (+built[1] - 1) / 12 : null;
    if (now) marks.push({ t: now, label: "Today", cls: "now" });
    const i32 = SUP.demand_mix.share_3_2T.findIndex((x) => x.centre >= 0.1);
    if (i32 >= 0) marks.push({ t: YEARS[i32], label: "3.2T modules enter volume production", cls: "mkt", src: "PR-012" });
    if (!none) {
      marks.push({ t: L0.start_year, label: "Rule starts", cls: "rule" });
      if (L0.transition_years > 0) marks.push({ t: Math.min(y1, L0.start_year + L0.transition_years), label: "Fully phased in", cls: "rule" });
      if (st.vals.pull_forward > 0) marks.push({ t: L0.start_year - st.vals.pull_forward / 12, label: `Buy-ahead window opens (${+st.vals.pull_forward.toFixed(1)} months)`, cls: "buy" });
      const pk = F.reduce((a, x, i) => (x.short > F[a].short ? i : a), 0);
      if (F[pk].short > 0.05) marks.push({ t: F[pk].y + 0.5, label: `Peak shortfall: ${f1(F[pk].short)}% of demand`, cls: "short" });
    }
    marks.sort((a, b) => a.t - b.t);
    // merge markers in the same place, then stack labels into rows so they never overlap
    const merged = [];
    marks.forEach((mk) => { const prev = merged[merged.length - 1]; if (prev && Math.abs(prev.t - mk.t) < 0.01) { prev.label = mk.cls === "rule" ? mk.label + " · " + prev.label : prev.label + " · " + mk.label; prev.src = prev.src || mk.src; if (mk.cls === "rule") prev.cls = "rule"; } else merged.push({ ...mk }); });
    const lastX = [-99, -99, -99], gapPct = box.clientWidth < 560 ? 28 : 15;
    merged.forEach((mk) => { const x = pos(mk.t); let r = lastX.findIndex((lx) => x - lx >= gapPct); if (r < 0) r = lastX.indexOf(Math.min(...lastX)); mk.row = r; lastX[r] = x; });
    marks.length = 0; merged.forEach((mk) => marks.push(mk));
    const bmax = Math.max(1, ...F.map((d) => d.b));
    box.innerHTML = `<div class="rm">
      <div class="rm-years">${YEARS.map((y) => `<span style="left:${pos(y)}%;width:${100 / YEARS.length}%">${y}</span>`).join("")}</div>
      <div class="rm-bars">${F.map((d) => `<div style="left:${pos(d.y)}%;width:${100 / YEARS.length}%" title="${d.y}: blocks ${f1(d.b)}% of demand"><i style="height:${(d.b / bmax) * 100}%"></i>${d.short > 0.05 ? `<em style="height:${(d.short / bmax) * 100}%"></em>` : ""}<span>${d.b > 0.05 ? f1(d.b) + "%" : ""}</span></div>`).join("")}</div>
      <div class="rm-track"></div>
      <div class="rm-ticks">${YEARS.concat([y1]).map((y) => `<span style="left:${pos(y)}%"></span>`).join("")}</div>
      <ul class="rm-marks">${marks.map((mk, i) => `<li class="${mk.cls}" style="left:${clamp(pos(mk.t), 0, 100)}%;--row:${mk.row}"><span>${esc(mk.label)}${mk.src ? ` <a data-sid="${mk.src}" href="${esc((SRC[mk.src] || {}).url || "#")}" target="_blank" rel="noopener">${mk.src}</a>` : ""}</span></li>`).join("")}</ul>
    </div>
    <p class="small rm-note">Bars: share of demand the rule blocks each year${F.some((d) => d.short > 0.05) ? ", with the shortfall in red" : ""} (every input at its central value). ${none ? "No transceiver rule in this scenario." : ""}</p>`;
    bindSrc(box);
  }

  /* ------------------------------------------------------------ section steps: highlight where you are */
  function setupSteps() {
    const links = [...$("pr-steps").querySelectorAll("a")];
    links.forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const t = $(a.dataset.s); if (!t) return;
      scrollTo({ top: t.getBoundingClientRect().top + scrollY - 108, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }));
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.classList.toggle("on", a.dataset.s === en.target.id));
        const a = links.find((x) => x.dataset.s === en.target.id), bar = a && a.parentElement;
        if (bar && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: Math.max(0, a.offsetLeft - 16), behavior: "smooth" });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    links.forEach((a) => { const t = $(a.dataset.s); if (t) io.observe(t); });
  }

  function analyse(S, P0) {
    const g = gapRows(S.L), out = [];
    if (S.L.trigger === "none") {
      out.push(`<p class="takeaway">In this scenario no transceiver supply is covered.</p>`);
      out.push(`<p>The component rule now in force (FCC 26-50) applies to logic-bearing parts made by producer-based Covered List entities such as Huawei and ZTE. Neither InnoLight nor Eoptolink is on the Covered List, so in this illustration it covers none of the ${f1(g.cnhq)}% of supply from Chinese-headquartered makers.</p>`);
    } else {
      const big = S.shortP.p50 >= S.X ? `In this scenario, a typical future sees a serious shortfall: about ${f1(S.shortP.p50)}% of demand in the peak year.`
        : S.shortP.p50 > 0.5 ? `In this scenario, a typical future sees a shortfall of about ${f1(S.shortP.p50)}% of demand in the peak year.`
        : S.blockedP.p50 > 0.5 ? `In this scenario, the rule blocks about ${f1(S.blockedP.p50)}% of supply at its peak, and in a typical future shifting, spare capacity and stock cover it.`
        : "In this scenario, the rule blocks very little supply within 2026–2031.";
      out.push(`<p class="takeaway">${big}</p>`);
      out.push(`<p><b>What the rule reaches.</b> With the trigger set to “${esc(leverValueLabel("trigger", S.L.trigger))}”, the rule has ${f1(g.sum("r1"))}% of supply in its sights. In its first year (${g.y}) it covers ${f1(g.sum("r2"))}% once products and timing are applied${S.L.exemption ? `, and ${f1(g.covered)}% after the ${S.L.threshold}% US-content exemption` : ""}. That leaves ${f1(g.outside)}% of supply from named or Chinese-headquartered makers outside its scope.</p>`);
      const top = S.sens && S.sens.rows[0];
      if (top) out.push(`<p><b>What most of the effect depends on.</b> ${esc(top.label)}: ${top.lever ? "switching it" : "moving it across its range"} changes the typical peak blocked share from ${f1(top.lo)}% to ${f1(top.hi)}%. ${top.id === "bom" || top.id === "threshold" ? "Because no public BOM data exists, the exemption is the most assumption-sensitive part of this scenario." : top.id.startsWith("th_") ? "The China/Thailand split is unknown, so this result hinges on where these makers build." : top.id === "trigger" ? "Whether the rule follows the company or the factory is unsettled in the reporting (I-5)." : ""}</p>`);
      const th = S.trig.find((x) => x.t === "origin"), en = S.trig.find((x) => x.t === "entity");
      if (th && en && Math.abs(th.sum.p50 - en.sum.p50) > 0.5) out.push(`<p><b>Company or factory?</b> With the same settings, a rule that follows the company blocks about ${f1(en.sum.p50)}% at its peak; one that follows the place of manufacture blocks about ${f1(th.sum.p50)}%, because Thailand-made modules fall outside it.</p>`);
      if (S.pDelay > 0.5) out.push(`<p><b>Timing.</b> In ${Math.round(S.pDelay)}% of futures buyers wait for qualified alternatives; when they do, the delay is about ${f1(S.delayGivenShort)} months. The price pressure index (${Math.round(S.price.p50)}, where 100 = no pressure) shows direction and rough size only.</p>`);
    }
    if (P0 && JSON.stringify(P0.L) !== JSON.stringify(S.L)) out.push(`<p><b>Compared with the previous setting:</b> the typical peak blocked share went from ${f1(P0.blockedP.p50)}% to ${f1(S.blockedP.p50)}%, and the typical peak shortfall from ${f1(P0.shortP.p50)}% to ${f1(S.shortP.p50)}%.</p>`);
    out.push(`<p class="caveat">Scenario, not forecast. ${esc(R.no_official_text)} Supply shares are illustrative${SUP.status === "student_analysis" ? " (replaced by student analysis where provided)" : ""}, the US BOM share is unknown, and every simulation input is a placeholder. The tool takes no position on whether the rule is warranted.</p>`);
    return `<h4>What this means</h4>` + out.join("");
  }
  function renderDetails() {
    $("pr-seed").textContent = SUP.seed; $("pr-runs").textContent = SM.int(SUP.runs);
    $("pr-model").innerHTML = [
      "Blocked share (year y) = Σ segments: share × in the rule’s sights × share of purchases in covered generations (new models only, unless existing models are included) × (1 − share exempt under the BOM test), × the phase-in factor, × the federal share if only federal buyers are covered.",
      "Levers set by intel cards are resampled per future: medium confidence → 25% of futures take the next-most-likely option; low → 50%. Levers set by a preset or by you are fixed.",
      "Shift: part of the blocked demand moves to uncovered sources (e.g. Thai lines under an origin rule, or redesign to pass the BOM test). Coupled to BOM uncertainty, ρ = 0.5.",
      "Shortfall (year y) = max(0, blocked × (1 − shift) − spare capacity − capacity added since 2026 − stock bought ahead).",
      "Delay (months) = max(0, qualification time + peak shortfall ÷ monthly capacity added − months of stock), the same structure as the solar case (DECISIONS #5). Price pressure = 100 + elasticity × peak shortfall (index only).",
    ].map((t) => `<li>${esc(t)}</li>`).join("");
    const segRows = SEGS.map((s) => `<tr><td><b>${esc(s.label)}</b>${s.examples ? `<div class="small">${esc(s.examples)}</div>` : ""}</td><td>${s.share_pct.centre}% ± ${s.share_pct.spread}</td><td>${s.us_bom_pct.centre}% ± ${s.us_bom_pct.spread}</td><td><span class="badge ${s.status === "placeholder" ? "pend" : "ok"}">${esc(s.status === "from_student_analysis" ? "student analysis" : s.status)}</span></td><td class="small">${srcLinks(s.source_ids)}</td></tr>`);
    const splitRows = SUP.splits.map((x) => `<tr><td><b>${esc(x.label)}</b></td><td>${Math.round(x.th_share.centre * 100)}% ± ${Math.round(x.th_share.spread * 100)}</td><td>—</td><td><span class="badge ${x.status === "placeholder" ? "pend" : "ok"}">${esc(x.status)}</span></td><td class="small">${esc(x.note || "")}</td></tr>`);
    const inRows = SUP.inputs.map((i) => `<tr><td><b>${esc(i.label)}</b></td><td>${fmtIn(i, st.vals[i.id])} ± ${fmtIn(i, i.spread)}</td><td>—</td><td><span class="badge pend">${esc(i.status)}</span></td><td class="small">${esc(i.source)} ${srcLinks(i.source_ids)}</td></tr>`);
    $("pr-inputs").innerHTML = `<thead><tr><th>Input</th><th>Share / value</th><th>US BOM share</th><th>Status</th><th>Source</th></tr></thead><tbody>${segRows.join("")}${splitRows.join("")}${inRows.join("")}</tbody>`;
    bindSrc($("pr-inputs"));
  }


  /* ------------------------------------------------------------ positions, checklist, student slot */
  function renderPositions() {
    const C = Object.fromEntries(P.evidence.claims.map((c) => [c.claim_id, c]));
    const who = { "CP-012": "FCC Chair", "CP-013": "Bill sponsors (S.5548)", "CP-014": "Hyperscalers (reported)", "CP-015": "Analysts and networking vendors", "CP-016": "Risk assessment caveat", "CP-017": "InnoLight", "CP-018": "Chinese government and Eoptolink" };
    $("pr-positions").innerHTML = Object.keys(who).filter((k) => C[k]).map((k) => { const c = C[k]; return `<article class="pr-pos"><div class="who">${esc(who[k])} · <span class="conf ${c.confidence === "high" ? "high" : c.confidence === "low" ? "low" : "medium"}">${esc(c.confidence)}</span></div><p>${esc(c.claim_text)}</p>${c.counter_evidence ? `<div class="counter">${esc(c.counter_evidence)}</div>` : ""}<div class="srcs">Sources: ${srcLinks(c.sources.split(";").map((x) => x.trim()))}</div></article>`; }).join("");
    const d = C["CP-019"];
    $("pr-design-reading").innerHTML = d ? `<div class="panel-title"><h4>Reading the reported design</h4><span class="small">observation, not a finding of intent</span></div><p style="margin:0 0 10px">${esc(d.claim_text)}</p><div class="counter" style="font-size:15px;color:var(--ink-2);border-left:2px solid var(--accent);padding-left:12px"><b>Alternative explanations:</b> ${esc(d.counter_evidence)}</div><p class="small" style="margin-top:12px">Intent rule (as in Case 1): never more than “consistent with a deliberate choice”, and only where a source documents the boundary being argued over. Sources: ${srcLinks(d.sources.split(";"))}</p>` : "";
    bindSrc($("pr-why-line"));
  }
  function renderChecklist() {
    const S = st.cur;
    const cond = {
      trigger_origin: L.trigger === "origin" || L.trigger === "entity_or_origin",
      exemption_on: !!L.exemption && L.trigger !== "none",
      "gen_3.2T+": L.generation === "3.2T+" && L.trigger !== "none",
      shortfall: !!S && S.shortP.p50 > 0.05,
      pullforward: st.vals.pull_forward > 0 && L.trigger !== "none",
      federal: L.scope === "federal_nss" || st.federal,
      always: true,
    };
    const WHY = { trigger_origin: "shown because the trigger includes place of manufacture", exemption_on: "shown because the exemption is on", "gen_3.2T+": "shown because the rule starts at 3.2T", shortfall: "shown because the typical future has a shortfall", pullforward: "shown because the scenario includes buying ahead", federal: "shown because federal buyers are in scope or ticked", always: "always shown" };
    const tags = ["all", "optics", "power", "network", "procurement"];
    $("pr-tags").innerHTML = tags.map((t) => `<button type="button" class="chip" data-t="${t}" aria-pressed="${st.tag === t}">${t === "all" ? "Everything" : t[0].toUpperCase() + t.slice(1)}</button>`).join("");
    $("pr-tags").querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => { st.tag = b.dataset.t; renderChecklist(); }));
    renderRoadmap();
    const items = R.considerations.filter((c) => cond[c.when] && (st.tag === "all" || c.tags.includes(st.tag)));
    $("pr-checklist").innerHTML = items.map((c) => `<div class="pr-item"><div class="tags">${c.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div><h5>${esc(c.title)}</h5><p>${esc(c.check)}</p><div class="why">${esc(WHY[c.when])}</div><div class="srcs">Related: ${srcLinks(c.source_ids)}</div></div>`).join("") || `<div class="pr-item"><p>No items for this filter.</p></div>`;
    bindSrc($("pr-checklist"));
  }
  function renderStudent() {
    const s = SUP.student;
    $("pr-student").innerHTML = `<div class="panel-title"><h4>Replace the illustrative numbers with your own analysis</h4><span class="badge ${s ? "ok" : "pend"}">${s ? `Student analysis: ${esc(s.analyst)}, ${esc(s.date)}` : "Illustrative"}</span></div>
      <ol style="margin:0;padding-left:20px;color:var(--ink-2)"><li>Copy <a href="../data/proposed/transceivers/part_map.template.json">part_map.template.json</a> to <code>data/proposed/transceivers/part_map.json</code> and fill in each segment from your Sayari research (entities, shares, US BOM share, sources). Suggested steps: <code>pipeline/notes/proposed_sayari_plan.md</code>.</li>
      <li>Run <code>python3 pipeline/build_proposed.py</code>. It checks every field and stops with the field name if something is missing.</li>
      <li>Reload this page: badges change from “placeholder” to “student analysis”, and every chart uses your numbers.</li></ol>`;
  }

  /* ------------------------------------------------------------ lifecycle */
  let inited = false;
  function refresh(sim) {
    renderPresets(); renderRule(); renderCards(); renderGap();
    if (sim) compute();
  }
  SM.proposedApi = {
    ensure: () => { if (!inited) SM.renderProposed(); },
    simulate: (o) => simulate(o), SUP, INP, LV, R,
    st: () => st, L: () => ({ ...L }), conf: () => ({ ...conf }), setBy: () => ({ ...setBy }),
    label: () => { const p = R.presets.find((x) => x.id === st.preset); return p ? p.label : "Your own scenario"; },
    presets: R.presets, preset: (id) => { applyPreset(id); refresh(true); },
    setVals: (v) => { Object.assign(st.vals, v); renderSimControls(); compute(); },
    leverLabel: (k, v) => leverValueLabel(k, v),
  };
  SM.renderProposed = function (resizeOnly) {
    if (!inited) {
      inited = true;
      applyPreset("reported");
      renderTimeline(); setupCardTools(); renderSimControls(); renderPositions(); renderStudent(); setupTabs(); setupSteps();
      $("pr-fed").checked = st.federal;
      $("pr-fed").addEventListener("change", (e) => { st.federal = e.target.checked; renderChecklist(); });
      refresh(true);
      bindSrc($("pr-known"));
      return;
    }
    if (resizeOnly) { renderGap(); if (st.cur) renderSim(); }
  };
})();
