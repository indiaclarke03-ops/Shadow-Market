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
    const get = (id, u) => (id in fx ? fx[id] : tri(st.vals[id], INP[id].spread, u ?? rng(), INP[id].min, INP[id].max));
    for (let r = 0; r < N; r++) {
      const Lx = { ...base };
      for (const k of Object.keys(cf)) { const p = R.confidence_resample[cf[k]] || 0; if (p && rng() < p) Lx[k] = altOf(k, Lx[k], rng); }
      // shares: draw each segment (split makers by total and Thailand share), then normalise to 100
      const sh = {};
      SEGS.forEach((s) => (sh[s.id] = Math.max(0, tri(s.share_pct.centre, s.share_pct.spread, rng(), 0, 100))));
      SUP.splits.forEach((sp) => {
        const cn = SEGS.find((s) => s.maker === sp.maker && s.site === "CN"), th = SEGS.find((s) => s.maker === sp.maker && s.site === "TH");
        if (!cn || !th) return;
        const tot = sh[cn.id] + sh[th.id], f = fx["th_" + sp.maker] ?? tri(sp.th_share.centre, sp.th_share.spread, rng(), 0, 1);
        sh[cn.id] = tot * (1 - f); sh[th.id] = tot * f;
      });
      const tot = Object.values(sh).reduce((a, b) => a + b, 0) || 1;
      for (const k in sh) sh[k] = (sh[k] / tot) * 100;
      // US BOM share (common factor across segments) coupled to shifting (Gaussian copula)
      const z1 = SM.normal(rng), z2 = rho * z1 + Math.sqrt(1 - rho * rho) * SM.normal(rng);
      const uB = fx.bom_u ?? SM.phi(z1);
      const shift = "shift" in fx ? fx.shift : tri(st.vals.shift, INP.shift.spread, SM.phi(z2), INP.shift.min, INP.shift.max);
      const fed = get("fed_share"), pf = get("pull_forward"), head = get("headroom"), cap = get("capacity_add"), el = get("elasticity"), ramp = get("ramp");
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
    return { blocked, short, peakNet, peakShort, peakBlocked, delay, price };
  }
  const med = (a) => SM.summarise(a, 0).p50;

  /* ------------------------------------------------------------ rendering: presets, timeline, cards */
  function renderPresets() {
    $("pr-presets").innerHTML = R.presets.map((p, i) => `<button type="button" class="preset" data-p="${p.id}" aria-pressed="${st.preset === p.id}"><span class="k">Scenario ${i + 1}</span><b>${esc(p.label)}</b><span>${esc(p.blurb)}</span></button>`).join("");
    $("pr-presets").querySelectorAll(".preset").forEach((b) => b.addEventListener("click", () => { applyPreset(b.dataset.p); refresh(true); }));
  }
  const tierBadge = (t) => `<span class="tier ${TIER_CLASS[t] || "low"}">${esc(t)}</span>`;
  function renderTimeline() {
    $("pr-timeline").innerHTML = R.timeline.map((t) => `<li><span class="d">${esc(t.date)}</span><span class="pip" style="background:${t.tier === "primary" ? COL.navy : COL.accent}"></span><div><div class="ev">${esc(t.event)}</div><div class="meta">${tierBadge(t.tier)}<span>${srcLinks(t.source_ids)}</span>${t.tier !== "primary" ? "<span>no official text</span>" : ""}</div></div></li>`).join("");
  }
  const leverValueLabel = (k, v) => { const l = LV[k]; if (!l) return String(v); if (l.type === "options") return (l.options.find((o) => o.id === v) || {}).label || v; if (l.type === "toggle") return v ? "on" : "off"; return k === "threshold" ? v + "%" : String(v); };
  function renderCards() {
    $("pr-cards").innerHTML = allCards().map((c) => {
      const sets = Object.entries(c.sets || {});
      return `<article class="pr-card ${st.applied.has(c.id) ? "applied" : ""}">
        <div class="top"><b>${esc(c.id)}</b><span>${esc(c.date || "")}</span>${tierBadge(c.tier)}<span class="conf ${c.confidence === "high" ? "high" : c.confidence === "low" ? "low" : "medium"}">${esc(c.confidence)} confidence</span>${c.custom ? '<span class="pr-custom">added by you, not in the source register</span>' : ""}</div>
        <h5>${esc(c.headline)}</h5>
        ${c.note ? `<p>${esc(c.note)}</p>` : ""}
        ${c.tier !== "primary" ? `<p class="small" style="margin:0 0 6px">${esc(R.no_official_text)}</p>` : ""}
        <div class="sets">${sets.length ? "Sets: " + sets.map(([k, v]) => `${esc(LV[k] ? LV[k].label : k)} → <b>${esc(leverValueLabel(k, v))}</b>`).join("; ") : "Context only: sets no lever."}</div>
        <div class="row"><span class="srcs">${c.custom ? (c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">source</a>` : "no source given") : "Sources: " + srcLinks(c.source_ids)}</span>
        ${sets.length ? `<label class="pr-toggle"><input type="checkbox" data-card="${esc(c.id)}" ${st.applied.has(c.id) ? "checked" : ""}> Apply to scenario</label>` : ""}
        ${c.custom ? `<button type="button" class="btn" data-del="${esc(c.id)}" style="padding:4px 10px;color:var(--brick)">Remove</button>` : ""}</div>
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

  /* ------------------------------------------------------------ rendering: levers + gap */
  const setByLabel = (k) => (setBy[k] ? `<span class="setby">set by ${esc(setBy[k])}${conf[k] && conf[k] !== "high" ? ` · ${esc(conf[k])} confidence, varies in the simulation` : ""}</span>` : "");
  function renderLevers() {
    const w = $("pr-levers");
    w.innerHTML = R.levers.map((l) => {
      if (l.id === "threshold" && !L.exemption) return "";
      let ctl;
      if (l.type === "options") ctl = `<div class="seg" role="group" aria-label="${esc(l.label)}">${l.options.map((o) => `<button type="button" data-l="${l.id}" data-v="${esc(o.id)}" aria-pressed="${L[l.id] === o.id}" title="${esc(o.note || "")}">${esc(o.label)}</button>`).join("")}</div>`;
      else if (l.type === "toggle") ctl = `<div class="seg" role="group" aria-label="${esc(l.label)}"><button type="button" data-l="${l.id}" data-v="true" aria-pressed="${L[l.id] === true}">On</button><button type="button" data-l="${l.id}" data-v="false" aria-pressed="${L[l.id] === false}">Off</button></div>`;
      else ctl = `<div class="lever-range"><input type="range" data-l="${l.id}" min="${l.min}" max="${l.max}" step="${l.step}" value="${L[l.id]}" aria-label="${esc(l.label)}"><span class="val">${esc(leverValueLabel(l.id, L[l.id]))}</span></div>`;
      return `<div class="dial"><div class="dial-head"><span class="dial-name">${esc(l.label)}</span></div>${setByLabel(l.id)}<div style="margin-top:8px">${ctl}</div></div>`;
    }).join("") + `<label class="pr-toggle" style="color:var(--on-dark);margin-top:10px"><input type="checkbox" id="pr-fed" ${st.federal ? "checked" : ""}> Serves federal customers</label>`;
    const set = (k, v) => { st.manual[k] = v; st.manualSrc[k] = "you"; st.preset = null; recompute(); refresh(true); };
    w.querySelectorAll("button[data-l]").forEach((b) => b.addEventListener("click", () => { const l = LV[b.dataset.l]; set(l.id, l.type === "toggle" ? b.dataset.v === "true" : b.dataset.v); }));
    w.querySelectorAll('input[type=range][data-l]').forEach((i) => {
      i.addEventListener("input", () => (i.nextElementSibling.textContent = leverValueLabel(i.dataset.l, +i.value)));
      i.addEventListener("change", () => set(i.dataset.l, +i.value));
    });
    $("pr-fed").addEventListener("change", (e) => { st.federal = e.target.checked; renderChecklist(); });
  }
  const SEG_COL = { inno_cn: COL.E0, inno_th: COL.E1, eo_cn: COL.E2, eo_th: COL.E3, oth_cn: "#d3dff2", non_asia: COL.untraced, non_us: "#ffffff" };
  function renderGap() {
    const g = gapRows();
    const ro = (lbl, val, sub, cls = "") => `<div class="metric ${cls}"><div class="lbl">${lbl}</div><div class="num">${val}</div><div class="sub">${sub}</div></div>`;
    $("pr-gap-readout").innerHTML = [
      ro("Covered by the rule, in its first year", f1(g.covered) + "%", L.trigger === "none" ? "no transceiver rule: the component rule reaches none of these makers today" : `of US AI data-centre transceiver supply, ${g.y}`, "key"),
      ro("Linked to named or Chinese-headquartered makers, outside this rule’s scope", f1(g.outside) + "%", `of supply (Chinese-HQ makers supply ${f1(g.cnhq)}% in this illustration)`),
      ro("Already installed", "Unaffected", L.trigger === "none" ? "no new rule" : "equipment already in data centres stays in place until normal refresh (PR-013)"),
    ].join("");
    // stacked rows, segments held in place
    const cont = $("pr-bars"); cont.innerHTML = "";
    const w = Math.max(300, cont.clientWidth || 600), narrow = w < 560;
    const rows = [["All supply", "share"], ["In the rule’s sights", "r1"], ["Covered when it starts", "r2"], ["Left after exemptions", "r3"]];
    const lw = narrow ? 0 : 180, rh = narrow ? 52 : 40, h = rows.length * rh + 6;
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": rows.map(([lab, k]) => `${lab}: ${f1(g.rows.reduce((a, r) => a + r[k], 0))}%`).join("; ") }, cont);
    const defs = SM.svg("defs", {}, s), pat = SM.svg("pattern", { id: "pr-hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    SM.svg("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "rgba(255,255,255,0.55)", "stroke-width": 2 }, pat);
    const iw = w - lw - 50, X = (v) => lw + (v / 100) * iw;
    rows.forEach(([lab, k], ri) => {
      const y = ri * rh + (narrow ? 20 : 6), bh = narrow ? 24 : rh - 12;
      SM.svg("text", { x: narrow ? 0 : lw - 12, y: narrow ? ri * rh + 14 : y + bh / 2 + 4, "text-anchor": narrow ? "start" : "end", class: "lbl-strong" }, s).textContent = lab;
      let x0 = 0;
      g.rows.forEach((r) => {
        const slot = r.share, v = r[k];
        SM.svg("rect", { x: X(x0), y, width: Math.max(0, X(x0 + slot) - X(x0) - 1), height: bh, fill: "rgba(15,27,51,0.05)" }, s);
        if (v > 0.01) {
          const rect = SM.svg("rect", { x: X(x0), y, width: Math.max(1, X(x0 + v) - X(x0) - 1), height: bh, fill: SEG_COL[r.s.id] || COL.E3, stroke: r.s.id === "non_us" || r.s.id === "oth_cn" ? "#9aa6bb" : "none" }, s);
          SM.bindTip(rect, () => `<b>${esc(r.s.label)}</b><br>${esc(lab)}: ${v.toFixed(1)}% of supply (segment ${slot.toFixed(1)}%)<div class="t-src">Illustrative placeholder · ${esc(r.s.status)}</div>`);
          if (r.s.site === "TH") SM.svg("rect", { x: X(x0), y, width: Math.max(1, X(x0 + v) - X(x0) - 1), height: bh, fill: "url(#pr-hatch)", "pointer-events": "none" }, s);
        }
        x0 += slot;
      });
      SM.svg("text", { x: X(100) + 8, y: y + bh / 2 + 4, class: "lbl-strong" }, s).textContent = f1(g.rows.reduce((a, r) => a + r[k], 0)) + "%";
    });
    $("pr-seg-legend").innerHTML = SEGS.map((x) => `<span><i class="${["non_us", "oth_cn"].includes(x.id) ? "outline" : ""}" style="background:${SEG_COL[x.id]}"></i>${esc(x.label)}</span>`).join("");
    // Why? expanders
    const cn = g.rows.filter((r) => r.s.hq === "CN");
    const notInSights = cn.filter((r) => !r.r1 && r.share > 0);
    const genLoss = g.rows.reduce((a, r) => a + r.r1 - r.r2, 0), exLo = g.rows.reduce((a, r) => a + r.exLo, 0), exHi = g.rows.reduce((a, r) => a + r.exHi, 0);
    const why = [];
    if (L.trigger === "none") why.push("No transceiver rule in this scenario. The component rule (FCC 26-50) reaches only producer-based Covered List entities such as Huawei and ZTE, so it covers none of these segments (I-1).");
    if (notInSights.length && L.trigger !== "none") why.push(`Outside the trigger (“${esc(leverValueLabel("trigger", L.trigger))}”): ${notInSights.map((r) => `${esc(r.s.label)} (${f1(r.share)}%)`).join(", ")}. ${L.trigger === "origin" ? "Thailand-made modules are outside an origin-based rule." : L.trigger === "named" ? "Only companies named in S.5548 are in scope." : ""}`);
    if (genLoss > 0.05) why.push(`Products and timing remove ${f1(genLoss)} points: in ${g.y} the rule covers ${esc(leverValueLabel("generation", L.generation))}, which is ${f1(coveredShare(YEARS.indexOf(clamp(g.y, YEARS[0], YEARS[YEARS.length - 1])), L, null, NM_C) * 100)}% of new purchases that year${L.installed === "new_models_only" ? " once models authorised before the start (which keep selling) are excluded" : ""}${L.transition_years > 0 ? `, phased in over ${L.transition_years} years` : ""}${L.scope === "federal_nss" ? `, and only federal buyers (≈${INP.fed_share.centre}% of demand, placeholder)` : ""}.`);
    if (L.exemption && exHi > 0.05) why.push(`The ${L.threshold}% US-content exemption removes an estimated ${f1(exLo)}–${f1(exHi)} points, depending on how much of each module’s value comes from US companies (unknown; no public BOM data).`);
    $("pr-why").innerHTML = `<div class="pr-why">${why.map((t, i) => `<details ${i === 0 ? "open" : ""}><summary>Why? ${i + 1} of ${why.length}</summary><ul><li>${t}</li></ul></details>`).join("") || ""}</div>`;
  }

  /* ------------------------------------------------------------ rendering: simulation */
  const fmtIn = (i, v) => (i.unit === "share" ? Math.round(v * 100) + "%" : i.unit === "pct" ? v.toFixed(1).replace(".0", "") + "%" : i.unit === "months" ? v + " mo" : v.toFixed(1));
  function renderSimControls() {
    $("pr-sim-controls").innerHTML = `<div class="ctl-group"><p class="kicker">Uncertain inputs (all placeholders)</p>${SUP.inputs.map((i) => {
      const step = i.unit === "share" ? 0.05 : i.unit === "index" ? 0.25 : i.unit === "pct" ? 0.5 : 1;
      return `<div class="ctl"><label for="pin-${i.id}">${esc(i.label)}</label><div class="q">${esc(i.source)}</div>
        <div class="row"><input type="range" id="pin-${i.id}" min="${i.min}" max="${i.max}" step="${step}" value="${st.vals[i.id]}"><span class="val" id="pval-${i.id}">${fmtIn(i, st.vals[i.id])}</span></div>
        <div class="meta"><span>varies ± ${fmtIn(i, i.spread)}</span><span class="badge pend">${esc(i.status)}</span></div></div>`;
    }).join("")}</div>
    <div class="ctl-group"><p class="kicker">The line</p><div class="ctl"><label for="pin-X">What counts as a serious shortfall?</label><div class="q">Peak-year shortfall above this share of demand.</div>
    <div class="row"><input type="range" id="pin-X" min="2" max="40" step="1" value="${st.X}"><span class="val" id="pval-X">${st.X}%</span></div></div></div>`;
    let t;
    SUP.inputs.forEach((i) => { const el = $("pin-" + i.id); el.addEventListener("input", () => { st.vals[i.id] = +el.value; $("pval-" + i.id).textContent = fmtIn(i, +el.value); clearTimeout(t); t = setTimeout(() => compute(), 60); }); });
    $("pin-X").addEventListener("input", (e) => { st.X = +e.target.value; $("pval-X").textContent = st.X + "%"; clearTimeout(t); t = setTimeout(() => compute(), 60); });
  }
  function compute() {
    const res = simulate(), X = st.X, N = res.peakShort.length;
    const S = { res, X, blockedP: SM.summarise(res.peakBlocked, 0), netP: SM.summarise(res.peakNet, 0), shortP: SM.summarise(res.peakShort, X), delay: SM.summarise(res.delay, 0), price: SM.summarise(res.price, 0) };
    S.years = YEARS.map((y, i) => ({ y, b: SM.summarise(res.blocked[i], 0), s: SM.summarise(res.short[i], 0) }));
    let ser = 0, some = 0, blockedOnly = 0;
    for (let r = 0; r < N; r++) { if (res.peakShort[r] > X) ser++; else if (res.peakShort[r] > 0.05) some++; else if (res.peakBlocked[r] > 0.5) blockedOnly++; }
    S.cats = { ser: ser / N * 100, some: some / N * 100, blocked: blockedOnly / N * 100, none: (N - ser - some - blockedOnly) / N * 100 };
    const posDelay = Array.from(res.delay).filter((v) => v > 0).sort((a, b) => a - b);
    S.delayGivenShort = posDelay.length ? posDelay[Math.floor(posDelay.length / 2)] : 0;
    S.pDelay = posDelay.length / N * 100;
    // each trigger, same scenario
    S.trig = ["named", "entity", "origin", "entity_or_origin"].map((t) => ({ t, sum: SM.summarise(simulate({ runs: 2500, lever: { trigger: t } }).peakNet, 0) }));
    // what matters most: peak net blocked, median
    S.sens = L.trigger === "none" ? null : sensitivity();
    S.L = { ...L };
    st.prev = st.cur; st.cur = S;
    renderSim();
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
    band("b", "rgba(34,56,108,0.12)"); band("s", "rgba(168,67,47,0.14)");
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
  function renderSim() {
    const S = st.cur, P0 = st.prev, X = S.X;
    const d = (a, b) => (P0 && Math.abs(a - b) >= 0.1 ? `<span class="delta on">${a > b ? "▲ +" : "▼ −"}${f1(Math.abs(a - b))} pts vs last setting</span>` : "");
    const m = (lbl, val, sub, extra = "", cls = "") => `<div class="metric ${cls}"><div class="lbl">${lbl}</div><div class="num">${val}</div><div class="sub">${sub}</div>${extra}</div>`;
    $("pr-readout").innerHTML = [
      m("Supply blocked in the peak year, typical future", f1(S.blockedP.p50) + "%", `9 in 10 futures: ${f1(S.blockedP.p5)}–${f1(S.blockedP.p95)}%`, P0 ? d(S.blockedP.p50, P0.blockedP.p50) : ""),
      m("Shortfall in the peak year, typical future", f1(S.shortP.p50) + "%", `chance it exceeds ${X}%: ${Math.round(S.shortP.pOver)}%`, P0 ? d(S.shortP.p50, P0.shortP.p50) : "", S.shortP.pOver >= 50 ? "bad" : ""),
      m("Deployment delay, when there is one", S.pDelay > 0.5 ? f1(S.delayGivenShort) + '<span style="font-size:.45em"> months</span>' : "None", `${Math.round(S.pDelay)}% of futures see a delay · price pressure index ${Math.round(S.price.p50)} (direction and rough size only)`),
    ].join("");
    yearsChart(S);
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
    if (S.sens) SM.tornado($("pr-tornado"), S.sens.rows, S.sens.base, { baseLabel: "typical peak blocked share", tip: (r) => `<b>${esc(r.label)}</b><br>${esc(r.tip)}<br>Typical peak blocked share: ${r.lo.toFixed(1)}% → ${r.hi.toFixed(1)}%` });
    else $("pr-tornado").innerHTML = `<div class="pending" style="min-height:120px"><div><strong>Nothing to test</strong>With no transceiver rule, no input changes the result.</div></div>`;
    $("pr-analysis").innerHTML = analyse(S, P0);
    renderChecklist();
    renderDetails();
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
    renderPresets(); renderCards(); renderLevers(); renderGap();
    if (sim) compute();
  }
  SM.renderProposed = function (resizeOnly) {
    if (!inited) {
      inited = true;
      applyPreset("reported");
      renderTimeline(); setupCardTools(); renderSimControls(); renderPositions(); renderStudent();
      refresh(true);
      bindSrc($("pr-known"));
      return;
    }
    if (resizeOnly) { renderGap(); if (st.cur) renderSim(); }
  };
})();
