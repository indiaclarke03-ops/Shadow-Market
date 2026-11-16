/* The Shadow Market: app. Reads window.SM_DATA (built by pipeline/build.py). */
(function () {
  const SM = window.SM;
  const D = window.SM_DATA;
  const R = D.rules;
  const L3 = D.layer3;
  const L2 = D.layer2;
  const EV = D.evidence;
  const $ = (id) => document.getElementById(id);
  const { h, esc, usd, pct, int, COL } = SM;

  const TIERS = ["E0", "E1", "E2", "E3"], SCOPES = ["entity_list", "xinjiang", "research"];
  const state = {
    tier: R.dials.tier_depth.default,
    scope: R.dials.trigger_scope.default,
    own: R.dials.ownership_reach.default,
    basis: R.dials.value_basis.default,
    activeDial: "tier_depth",
    evDial: "all",
    simT: 1,
    simX: D.simulation.significant_gap_pct,
  };
  const comboKey = (t = state.tier, s = state.scope, o = state.own) => `${t}|${s}|${o}`;
  const L3ok = L3.status === "ok";

  /* ---------------------------------------------------------------- sources */
  const SRC = Object.fromEntries(EV.sources.map((s) => [s.source_id, s]));
  function srcList(ids) {
    return String(ids || "").split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  }
  function srcTipHTML(ids, extra = {}) {
    const list = srcList(ids);
    const lines = list.map((id) => {
      const s = SRC[id];
      return s ? `<div>${esc(id)} · ${esc(s.publisher || "")}${s.date ? ", " + esc(s.date) : ""}<br><i>${esc(s.title || "")}</i></div>` : `<div>${esc(id)}</div>`;
    });
    return `${extra.title ? `<b>${esc(extra.title)}</b><br>` : ""}${extra.body || ""}
      <div class="t-src">${lines.join("") || "No source recorded"}${extra.conf ? `<div>Confidence: <b>${esc(extra.conf)}</b></div>` : ""}${extra.date ? `<div>Snapshot: ${esc(extra.date)}</div>` : ""}</div>`;
  }
  function srcLinks(ids) {
    return srcList(ids).map((id) => {
      const s = SRC[id];
      return s && s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" data-sid="${esc(id)}">${esc(id)}</a>` : esc(id);
    }).join(", ");
  }
  // bind tooltips declared in markup
  function bindDeclared(root = document) {
    root.querySelectorAll("[data-src]:not([data-bound])").forEach((n) => {
      n.setAttribute("data-bound", "1");
      if (!n.hasAttribute("tabindex")) n.setAttribute("tabindex", "0");
      SM.bindTip(n, () => srcTipHTML(n.dataset.src, { title: n.dataset.title, body: n.dataset.body ? esc(n.dataset.body) : "", conf: n.dataset.conf, date: n.dataset.date }));
    });
    root.querySelectorAll("a[data-sid]:not([data-bound])").forEach((n) => {
      n.setAttribute("data-bound", "1");
      SM.bindTip(n, () => srcTipHTML(n.dataset.sid));
    });
  }

  /* ---------------------------------------------------------------- classification (client side for the flow) */
  function activeLevel(ex, t, s, o) {
    let best = null;
    for (const f of ex.flags) {
      if (SCOPES.indexOf(f.scope) > SCOPES.indexOf(s)) continue;
      let lvl = null;
      if (f.level === "A1") { if (o === "one_hop") lvl = "A1"; }
      else if (TIERS.indexOf(f.level) <= TIERS.indexOf(t)) lvl = f.scope === "research" ? "R1" : f.level;
      if (!lvl) continue;
      const rank = ["E0", "E1", "E2", "E3", "R1", "A1"].indexOf(lvl);
      if (best === null || rank < best.rank) best = { lvl, rank };
    }
    return best && best.lvl;
  }
  function categoryOf(ex) {
    if (!ex.traced) return "untraced";
    const lvl = activeLevel(ex, state.tier, state.scope, state.own);
    if (lvl) return lvl;
    if (activeLevel(ex, "E3", "research", "one_hop")) return "shadow";
    return "clean";
  }
  const CATS = [
    { id: "E0", label: "Listed", color: COL.E0 },
    { id: "E1", label: "Direct link", color: COL.E1 },
    { id: "E2", label: "Sub-tier 2–3", color: COL.E2 },
    { id: "E3", label: "Product-relevant 2–4", color: COL.E3 },
    { id: "R1", label: "Research-named", color: COL.R1 },
    { id: "A1", label: "Ownership-adjacent", color: COL.A1 },
    { id: "shadow", label: "Flagged only at deeper settings", color: COL.shadow },
    { id: "clean", label: "No flag found", color: COL.clean },
    { id: "untraced", label: "Not traced / no data", color: COL.untraced },
  ];
  const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
  const LEVEL_CONF = Object.fromEntries(R.exposure_levels.map((l) => [l.id, l.confidence]));

  /* ---------------------------------------------------------------- header + hero */
  function renderHero() {
    const elh = L2.entity_list_history || [];
    const latest = elh.length ? elh.slice().sort((a, b) => a.date.localeCompare(b.date)).pop() : null;
    const all = (L2.summary.all || {}).stopped;
    const stats = [];
    stats.push(latest
      ? `<div class="hero-stat"><span class="num" data-src="${esc(latest.source_id)}" data-title="UFLPA Entity List" data-conf="high">${int(latest.total_entities)}</span><span class="lbl">entities on the UFLPA Entity List (${esc(latest.date)})</span></div>`
      : `<div class="hero-stat"><span class="num">187</span><span class="lbl">entities on the UFLPA Entity List after 3 Aug 2026 (rules config)</span></div>`);
    stats.push(all
      ? `<div class="hero-stat"><span class="num" data-src="${esc(all.source_id)}" data-title="Shipments stopped, all industries" data-body="${esc(int(all.shipments) + " shipments · " + (all.period || ""))}" data-conf="high">${usd(all.value_usd)}</span><span class="lbl">of shipments stopped under UFLPA since June 2022, all industries</span></div>`
      : `<div class="hero-stat"><span class="num">—</span><span class="lbl">CBP enforcement figures not yet captured</span></div>`);
    if (L3ok) {
      const m = L3.combos[comboKey()];
      const full = L3.combos["E3|research|one_hop"];
      stats.push(`<div class="hero-stat"><span class="num" data-tip="1" id="hero-gap">${pct(full.exposed_share - m.exposed_share, 0)}</span><span class="lbl">of US cell + module import value flagged at full depth but not at current settings</span></div>`);
    } else {
      stats.push(`<div class="hero-stat"><span class="num">Pending</span><span class="lbl">Layer 3 (Sayari full-transparency exposure) not yet pulled</span></div>`);
    }
    $("hero-stats").innerHTML = stats.join("");
    $("coverage").innerHTML = L3ok
      ? `Coverage: ${pct(L3.traced_share, 0)} of import value traced upstream. “No exposure found” can mean “no data”. Untraced volume is shown in grey, not left out.`
      : `Layer 3 is waiting on the Sayari snapshot. Enforcement data (Layer 2) and the evidence record are live; exposure figures will appear once the trade graph is pulled. Nothing on this page is estimated in its place.`;
    $("snap").textContent = (D.snapshot ? "Sayari snapshot " + D.snapshot : "Sayari snapshot pending") + " · built " + D.built;
    $("foot-built").textContent = "Data built " + D.built;
    if (D.fixture) {
      const b = h("div", { style: "position:fixed;left:0;right:0;bottom:0;z-index:99;background:#a0509a;color:#fff;text-align:center;padding:8px;font-weight:600" }, "TEST FIXTURE: synthetic exporters for layout testing only. Not real data.");
      document.body.appendChild(b);
    }
  }

  /* ---------------------------------------------------------------- three layers */
  function renderLayers() {
    const l1 = R.layer1;
    $("layer1").innerHTML = `
      <div class="tag">Layer 1</div>
      <h3 class="display">The rule as written</h3>
      <div class="body"><p style="margin:0 0 8px">${esc(R.citation)}</p><ul>${l1.target_set.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      <p style="margin:12px 0 0"><b>Presumption:</b> ${esc(l1.presumption)}</p>
      <p style="margin:8px 0 0"><b>Reach:</b> ${esc(l1.reach)}. <b>De minimis:</b> ${esc(l1.de_minimis)}</p></div>
      <div class="foot"><div class="big">No tier limit</div><p class="small" style="margin:6px 0 0">Layer 1 produces no number. It sets the theoretical maximum that Layer 3 tests against.</p></div>`;

    const s = L2.summary, e = s.electronics || {}, hts = s.hts8541 || {};
    const basis = hts.stopped ? hts : e.stopped ? e : null;
    const basisName = hts.stopped ? "HTS 8541 (solar cells and modules, plus other semiconductor devices)" : "Electronics (upper bound for solar)";
    const rr = s.release_rate;
    $("layer2").innerHTML = `
      <div class="tag">Layer 2</div>
      <h3 class="display">What enforcement catches</h3>
      <div class="body">Shipments CBP has stopped, released, denied or left pending under UFLPA since June 2022. CBP does not report “solar” as an industry, so we use ${esc(basisName)} and say so.
      ${rr ? `<p style="margin:12px 0 0">Release rate: <b data-src="${esc(rr.source_ids.join(";"))}" data-title="Release rate" data-body="released ÷ (released + denied), ${esc(rr.basis)}, by ${esc(rr.by)}" data-conf="high">${pct(rr.value * 100, 0)}</b> of decided ${esc(rr.basis)} shipments were later released.</p>` : ""}
      <p style="margin:8px 0 0">${(L2.cases || []).length} public solar enforcement events are logged below.</p></div>
      <div class="foot">${basis ? `<div class="big" data-src="${esc(basis.stopped.source_id)}" data-title="Stopped, ${esc(basisName)}" data-body="${esc(int(basis.stopped.shipments) + " shipments · " + (basis.stopped.period || "") + (basis.stopped.notes ? " · " + basis.stopped.notes : ""))}" data-conf="high">${usd(basis.stopped.value_usd)}</div><p class="small" style="margin:6px 0 0">stopped, ${esc(basisName.split(" (")[0])}, ${esc(basis.stopped.period || "")}</p>` : `<div class="big">Pending</div><p class="small">CBP statistics not yet captured.</p>`}</div>`;

    if (L3ok) {
      const m = L3.combos[comboKey()], full = L3.combos["E3|research|one_hop"];
      $("layer3").innerHTML = `
        <div class="tag">Layer 3</div>
        <h3 class="display">What full transparency would catch</h3>
        <div class="body">The same trigger logic applied through every tier Sayari's trade and ownership graph can see. ${int(L3.exporter_count)} exporters supply ${usd(L3.total_value)} of US cell and module imports in the 730-day window; ${pct(L3.traced_share, 0)} by value is traced.</div>
        <div class="foot"><div class="big">${pct(full.exposed_share, 0)}</div><p class="small" style="margin:6px 0 0">of import value linked at full depth, against ${pct(m.exposed_share, 0)} at current settings</p></div>`;
    } else {
      $("layer3").innerHTML = `
        <div class="tag">Layer 3</div>
        <h3 class="display">What full transparency would catch</h3>
        <div class="body">The same trigger logic applied through every tier Sayari's trade and ownership graph can see: US importers of PV cells (HS 8541.42) and modules (8541.43), their exporters, and each exporter's deepest forced-labour risk factor (E0–E3, A1, R1).</div>
        <div class="foot"><span class="badge pend">Awaiting Sayari snapshot</span><p class="small" style="margin:10px 0 0">Milestones M1–M2. The connector wasn't available in the build session. Run <code>pipeline/extract_sayari.py</code> then <code>build.py</code> once the pulls are in <code>data/raw/</code>.</p></div>`;
    }
  }

  /* ---------------------------------------------------------------- dials */
  const DIAL_STATE = { tier_depth: "tier", trigger_scope: "scope", ownership_reach: "own", value_basis: "basis" };
  function renderDials() {
    const wrap = $("dials");
    wrap.innerHTML = "";
    for (const [id, dial] of Object.entries(R.dials)) {
      const key = DIAL_STATE[id];
      const d = h("div", { class: "dial" + (state.activeDial === id ? " active" : ""), "data-dial": id });
      d.innerHTML = `<div class="dial-head"><span class="dial-name">${esc(dial.label)}</span></div><div class="dial-q">${esc(dial.question)}</div>`;
      const seg = h("div", { class: "seg", role: "group", "aria-label": dial.label });
      dial.positions.forEach((p) => {
        const b = h("button", { type: "button", "aria-pressed": String(state[key] === p.id) }, `${esc(p.label)}${p.id === dial.default ? '<span class="def">default</span>' : ""}`);
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          state[key] = p.id;
          if (id !== "value_basis") { state.activeDial = id; state.evDial = id; }
          refreshExplorer();
        });
        seg.appendChild(b);
      });
      d.appendChild(seg);
      d.addEventListener("click", () => { if (id !== "value_basis") { state.activeDial = id; state.evDial = id; renderDials(); renderEvidence(); } });
      wrap.appendChild(d);
    }
  }

  /* ---------------------------------------------------------------- impact readout */
  function metric(lbl, val, sub, cls = "", attrs = "") {
    return `<div class="metric ${cls}"><div class="lbl">${lbl}</div><div class="num" ${attrs}>${val}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
  }
  function renderReadout() {
    const ra = R.replacement_time_assumption;
    const repl = metric("Replacement time", `${ra.months_low}–${ra.months_high}<span style="font-size:.45em"> mo</span>`, esc(ra.label), "assume", `data-src="" data-title="Assumption" data-body="${esc(ra.source)}"`);
    if (!L3ok) {
      $("readout").innerHTML = [
        metric("Exposed share", "—", "Needs Layer 3"),
        metric("Tolerated exposure", "—", "Layer 3 − Layer 2"),
        metric("Remaining clean suppliers", "—", "Exporters with no flag"),
        metric("Concentration after removal, by exporter (HHI)", "—", ""),
        metric("Concentration after removal, by country (HHI)", "—", ""),
        repl,
      ].join("") + `<div class="pending" style="grid-column:1/-1;min-height:120px"><div><strong>Dials are live; numbers wait on Sayari</strong>Every dial combination (4 × 3 × 2 = 24, by value and by count) is precomputed by the pipeline as soon as exporters are classified.</div></div>`;
      bindDeclared($("readout"));
      return;
    }
    const m = L3.combos[comboKey()];
    const share = state.basis === "count" ? m.exposed_count_share : m.exposed_share;
    const tolTip = `data-src="${esc(((L2.summary[L3.detained_basis] || {}).stopped || {}).source_id || "")}" data-title="Tolerated exposure" data-body="Exposed import value at these settings minus value stopped by CBP (${esc(L3.detained_basis || "n/a")} basis, an upper bound for solar). Windows differ: Sayari 730 days vs CBP since June 2022."`;
    $("readout").innerHTML = [
      metric("Exposed share", pct(share, 1), state.basis === "count" ? `${int(m.exposed_count)} of ${int(L3.exporter_count)} exporters` : `${usd(m.exposed_value)} of ${usd(L3.total_value)}`),
      metric("Tolerated exposure", m.tolerated_exposure === null ? "—" : usd(m.tolerated_exposure), "Layer 3 − Layer 2", "", tolTip),
      metric("Remaining clean suppliers", int(m.remaining_suppliers), `of ${int(L3.exporter_count)} exporters`),
      metric("Concentration after removal, by exporter (HHI)", int(m.hhi_exporter_after), `before ${int(L3.hhi_exporter_before)}`),
      metric("Concentration after removal, by country (HHI)", int(m.hhi_country_after), `before ${int(L3.hhi_country_before)}`),
      repl,
    ].join("");
    bindDeclared($("readout"));
  }

  /* ---------------------------------------------------------------- flow */
  function renderFlow() {
    const cont = $("flow");
    const used = new Set();
    let cols;
    const tiers = D.tiers || {};
    const upstream = (sid, label, sub) => {
      const t = tiers.status === "ok" && tiers.columns && tiers.columns[sid];
      if (t) { t.segments.forEach((s) => used.add(s.cat)); return { id: sid, label, sub, segments: t.segments }; }
      used.add("untraced");
      return { id: sid, label, sub: sub + " · tracing pending", pending: true, segments: [{ cat: "untraced", value: L3ok ? L3.total_value : 1 }] };
    };
    if (L3ok) {
      const agg = {}, aggLeft = {};
      L3.exporters.forEach((e) => {
        const c = categoryOf(e);
        agg[c] = (agg[c] || 0) + e.value;
        if (["shadow", "clean", "untraced"].includes(c)) aggLeft[c] = (aggLeft[c] || 0) + e.value;
        used.add(c);
      });
      cols = [
        upstream("S1", "Polysilicon", "HS 2804.61"),
        upstream("S2", "Ingots & wafers", "HS 3818.00"),
        { id: "S34", label: "Cells & modules", sub: "exporters to the US", segments: Object.entries(agg).map(([cat, value]) => ({ cat, value })) },
        { id: "US", label: "Left on the US market", sub: "if flagged supply is removed", segments: Object.entries(aggLeft).map(([cat, value]) => ({ cat, value })) },
      ];
    } else {
      cols = [upstream("S1", "Polysilicon", "HS 2804.61"), upstream("S2", "Ingots & wafers", "HS 3818.00"),
        { id: "S34", label: "Cells & modules", sub: "HS 8541.42 / .43 · pending", pending: true, segments: [{ cat: "untraced", value: 1 }] },
        { id: "US", label: "US market", sub: "pending", pending: true, segments: [{ cat: "untraced", value: 1 }] }];
    }
    const cats = CATS.filter((c) => used.has(c.id));
    SM.alluvial(cont, cols, cats, {
      height: 400, absolute: L3ok,
      tip: (col, c, S) => {
        if (col.pending) return `<b>${esc(col.label)}</b><br>Not yet traced. Volume is shown in grey, not left out.`;
        const conf = LEVEL_CONF[c.id];
        return `<b>${esc(c.label)}</b> · ${esc(col.label)}<br>${usd(S.v)} · ${(S.share * 100).toFixed(1)}% of this column${conf ? `<div class="t-src">Confidence of this exposure level: <b>${esc(conf)}</b><br>Source: Sayari risk factors, snapshot ${esc(D.snapshot || "")}</div>` : ""}`;
      },
    });
    $("flow-legend").innerHTML = cats.map((c) => `<span><i class="${c.id === "clean" ? "outline" : ""}" style="background:${c.color}"></i>${esc(c.label)}</span>`).join("");
    if (!L3ok) {
      cont.insertAdjacentHTML("beforeend", `<p class="small" style="margin:14px 0 0">The chain is drawn; the volumes are not. Once Sayari's trade graph is pulled (M1, M2, M5), each column splits by exposure level, and the last column shows what stays on the US market when flagged supply is removed.</p>`);
    }
  }

  /* ---------------------------------------------------------------- curves */
  function renderCurves() {
    const cont = $("curves");
    cont.innerHTML = "";
    const cr = R.cliff_rule;
    $("curve-note").textContent = `Cliff: exposure ≥ ${cr.min_ratio}× and +${cr.min_share_pp} pp in one step`;
    if (!L3ok) {
      cont.innerHTML = `<div class="pending"><div><strong>Curves appear with Layer 3</strong>One step chart per dial, others held at default, with cliffs marked under the rule in spec §12.</div></div>`;
      return;
    }
    const map = { tier_depth: "tier", trigger_scope: "scope", ownership_reach: "own" };
    for (const dial of ["tier_depth", "trigger_scope", "ownership_reach"]) {
      const box = h("div", { style: "margin-bottom:10px" });
      box.innerHTML = `<div class="small" style="font-weight:600;color:var(--navy)">${esc(R.dials[dial].label)}</div>`;
      const chart = h("div");
      box.appendChild(chart);
      cont.appendChild(box);
      const steps = L3.curves[dial].map((p) => ({
        ...p, y: state.basis === "count" ? (p.exposed_count / L3.exporter_count) * 100 : p.exposed_share,
        current: state[map[dial]] === p.position,
      }));
      SM.stepChart(chart, steps, {
        height: 170, title: R.dials[dial].label,
        tip: (p) => `<b>${esc(p.label)}</b><br>${pct(p.y)} exposed · ${usd(p.exposed_value)}${p.ratio_vs_prev !== undefined ? `<br>vs previous step: ×${p.ratio_vs_prev ?? "∞"}, +${p.added_pp} pp` : ""}${p.cliff ? "<br><b>Cliff under the spec rule</b>" : ""}<div class="t-src">Sayari snapshot ${esc(D.snapshot || "")}</div>`,
      });
    }
  }

  /* ---------------------------------------------------------------- enforcement */
  function renderEnf() {
    const s = L2.summary;
    const rows = [];
    const add = (key, label) => {
      const g = s[key];
      if (!g || !(g.released || g.denied || g.pending)) return;
      rows.push({ label, sub: g.stopped ? `${usd(g.stopped.value_usd)} · ${int(g.stopped.shipments)} shipments` : "", values: { released: g.released?.value_usd || 0, denied: g.denied?.value_usd || 0, pending: g.pending?.value_usd || 0 }, g });
    };
    add("all", "All industries");
    add("electronics", "Electronics");
    add("hts8541", "HTS 8541");
    const cont = $("enf");
    if (!rows.length) {
      cont.innerHTML = `<div class="pending"><div><strong>CBP figures pending</strong>Layer 2 research is in progress.</div></div>`;
      return;
    }
    const cats = [
      { id: "released", label: "Released", color: COL.E3, textColor: "#22386c" },
      { id: "denied", label: "Denied", color: COL.E0 },
      { id: "pending", label: "Pending", color: COL.untraced, textColor: "#22386c" },
    ];
    cont.innerHTML = `<div class="legend" style="margin-bottom:12px">${cats.map((c) => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join("")}<span class="small">share of stopped value</span></div><div id="enf-bars"></div><div id="enf-notes"></div>`;
    SM.outcomeBars($("enf-bars"), rows, cats, {
      tip: (r, c, v, tot) => { const g = r.g[c.id]; return srcTipHTML(g?.source_id, { title: `${r.label} · ${c.label}`, body: `${usd(v)} (${((v / tot) * 100).toFixed(1)}%)${g?.shipments ? " · " + int(g.shipments) + " shipments" : ""}<br>${esc(g?.period || "")}`, conf: "high" }); },
    });
    const solar = (L2.stats || []).filter((r) => r.industry === "solar_reported");
    $("enf-notes").innerHTML = `<p class="small" style="margin:14px 0 0">CBP's industry categories don't isolate solar. Electronics is an upper bound; HTS 8541 also includes LEDs, diodes and other semiconductor devices.</p>` +
      (solar.length ? `<div style="margin-top:14px">${solar.map((r) => `<div class="small" style="margin-top:6px">${esc(r.period)}: ${r.shipments ? int(r.shipments) + " solar shipments " : ""}${r.value_usd ? usd(+r.value_usd) + " " : ""}${esc(r.exam_result)}. ${esc(r.notes)} <a data-sid="${esc(r.source_id)}" href="${esc(SRC[r.source_id]?.url || "#")}" target="_blank" rel="noopener">${esc(r.source_id)}</a></div>`).join("")}</div>` : "");
    bindDeclared(cont);
  }

  /* ---------------------------------------------------------------- evidence */
  function normDial(d) {
    d = String(d || "").toLowerCase();
    if (d.includes("tier")) return "tier_depth";
    if (d.includes("trigger") || d.includes("scope")) return "trigger_scope";
    if (d.includes("owner")) return "ownership_reach";
    if (d.includes("look") || d.includes("tim")) return "lookback";
    return "general";
  }
  const DIAL_LABEL = { all: "All dials", tier_depth: "Tier depth", trigger_scope: "Trigger scope", ownership_reach: "Ownership reach", lookback: "Timing & intensity", general: "General" };
  function confClass(c) { c = String(c || "").toLowerCase(); return c.startsWith("high") ? "high" : c.startsWith("low") ? "low" : "medium"; }

  function renderEvidence() {
    const chips = $("dial-chips");
    const present = new Set(EV.claims.map((c) => normDial(c.dial)).concat(EV.timeline.map((t) => normDial(t.dial))));
    chips.innerHTML = "";
    ["all", "tier_depth", "trigger_scope", "ownership_reach", "lookback", "general"].filter((k) => k === "all" || present.has(k) || ["tier_depth", "trigger_scope", "ownership_reach"].includes(k)).forEach((k) => {
      const n = k === "all" ? EV.claims.length : EV.claims.filter((c) => normDial(c.dial) === k).length;
      const b = h("button", { class: "chip", type: "button", "aria-pressed": String(state.evDial === k) }, `${DIAL_LABEL[k]} <span style="opacity:.6">${n}</span>`);
      b.addEventListener("click", () => { state.evDial = k; if (R.dials[k]) state.activeDial = k; renderEvidence(); renderDials(); });
      chips.appendChild(b);
    });

    const tl = $("timeline");
    if (!EV.timeline.length) {
      tl.innerHTML = `<div class="pending"><div><strong>Timeline in progress</strong>Evidence research (M5a) is running.</div></div>`;
    } else {
      tl.innerHTML = EV.timeline.map((t) => {
        const match = state.evDial === "all" || normDial(t.dial) === state.evDial;
        return `<li class="${match ? "" : "dim"}"><span class="d">${esc(t.date)}</span><span class="pip" style="background:${catColor(t.category)}"></span><div><div class="ev">${esc(t.event)}</div><div class="meta"><span>${esc(t.category)}</span><span class="conf ${confClass(t.confidence)}">${esc(t.confidence)}</span><span>${srcLinks(t.source_ids)}</span></div></div></li>`;
      }).join("");
    }
    $("tl-count").textContent = EV.timeline.length ? `${EV.timeline.length} events, 2020–2026` : "";

    const claims = EV.claims.filter((c) => state.evDial === "all" || normDial(c.dial) === state.evDial);
    const order = { fact: 0, position: 1, interpretation: 2 };
    claims.sort((a, b) => (order[a.claim_type] ?? 3) - (order[b.claim_type] ?? 3) || ["high", "medium", "low"].indexOf(confClass(a.confidence)) - ["high", "medium", "low"].indexOf(confClass(b.confidence)));
    $("claims").innerHTML = claims.length ? claims.map((c) => c.held ? `
      <article class="claim low" style="background:rgba(255,255,255,0.55)">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="type">intent claim · held</span><span class="small">${esc(DIAL_LABEL[normDial(c.dial)])} · ${esc(c.claim_id)}</span></div>
        <p class="small" style="margin-top:8px">${esc(c.held)}. The claim is kept in the register and will be shown here once both conditions are met.</p>
      </article>` : `
      <article class="claim ${confClass(c.confidence)}">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="type">${esc(c.claim_type)}</span><span class="conf ${confClass(c.confidence)}">${esc(c.confidence)} confidence</span><span class="small">${esc(DIAL_LABEL[normDial(c.dial)])} · ${esc(c.claim_id)}</span></div>
        <p>${esc(c.claim_text)}</p>
        ${c.counter_evidence ? `<div class="counter"><b>Other explanations:</b> ${esc(c.counter_evidence)}</div>` : ""}
        <div class="srcs">Sources: ${srcLinks(c.sources)}</div>
      </article>`).join("") : `<div class="pending"><div><strong>${EV.claims.length ? "No claims for this dial yet" : "Claims register in progress"}</strong>${EV.claims.length ? "Pick another dial above." : "Evidence research (M5a) is running."}</div></div>`;
    bindDeclared($("why"));
  }
  function catColor(c) {
    return { statute: COL.E0, entity_list: COL.E1, guidance: COL.E2, enforcement: COL.A1, consultation: COL.R1, lobbying: COL.R1, research: COL.E3, market: COL.untraced }[c] || COL.peri;
  }

  /* ---------------------------------------------------------------- companies */
  function lvlBadge(l) { return `<span class="lvl"><i style="background:${COL[l] || COL.peri}"></i>${esc(l)}</span>`; }
  function renderCompanies() {
    const ce = $("company-exposure");
    if (!L3ok) {
      ce.innerHTML = `<div class="panel-title"><h4>Top exporters by US import value</h4><span class="badge pend">Awaiting Sayari snapshot</span></div><div class="pending" style="min-height:160px"><div><strong>Exporter exposure appears with Layer 3</strong>Each row will show exposure level, confidence and the underlying Sayari source records. A company is never named without all three.</div></div>`;
    } else {
      const rows = L3.exporters.filter((e) => e.flags.length).slice(0, 30);
      ce.innerHTML = `<div class="panel-title"><h4>Exporters with a flag, by US import value</h4><span class="small">${rows.length} shown · current dial settings shade the level</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Exporter</th><th>Country</th><th class="r">US import value</th><th>Exposure levels</th><th>Under current dials</th><th>Confidence</th><th>Sayari records</th></tr></thead><tbody>
        ${rows.map((e) => { const c = categoryOf(e); return `<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.country)}</td><td class="r">${usd(e.value)}</td><td>${e.levels.map(lvlBadge).join(" ")}</td><td>${esc(CAT[c].label)}</td><td><span class="conf ${confClass(e.confidence)}">${esc(e.confidence || "—")}</span></td><td class="small">${e.source_records.length ? e.source_records.map(esc).join(", ") : esc(e.sayari_entity_id || "—")}</td></tr>`; }).join("")}
        </tbody></table></div>`;
    }
    const cases = L2.cases || [];
    $("company-cases").innerHTML = `<div class="panel-title"><h4>Public enforcement events in solar</h4><span class="small">Layer 2 · known-case check (spec §8)</span></div>` + (cases.length ? `
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Company</th><th>Event</th><th>Outcome</th><th>Confidence</th><th>Source</th></tr></thead><tbody>
      ${cases.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((c) => `<tr><td style="white-space:nowrap">${esc(c.date)}</td><td><b>${esc(c.company)}</b><div class="small">${esc(c.company_role)} · ${esc(c.country)}</div></td><td>${esc(c.event.replace(/_/g, " "))}<div class="small">${esc(c.description)}</div></td><td>${esc(c.outcome)}</td><td><span class="conf ${confClass(c.confidence)}">${esc(c.confidence)}</span></td><td class="small">${srcLinks(c.source_ids)}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="pending" style="min-height:140px"><div><strong>Cases register in progress</strong></div></div>`);
    bindDeclared($("companies"));
  }

  /* ---------------------------------------------------------------- simulation */
  const SIM = D.simulation;
  let simInputs = null, simInc = null, simStatus = {};
  function simDefaults() {
    simInputs = {}; simStatus = {};
    SIM.inputs.forEach((i) => { simInputs[i.id] = { ...i.dist }; simStatus[i.id] = { status: i.status, source: i.source }; });
    const rr = L2.summary.release_rate;
    if (rr) {
      const k = 60;
      simInputs.release = { type: "beta", a: rr.value * k, b: (1 - rr.value) * k };
      simStatus.release = { status: "from_layer2", source: `CBP: released ÷ (released + denied), ${rr.basis}, ${(rr.value * 100).toFixed(0)}%. Sources ${rr.source_ids.join(", ")}. Concentration k=60 is our assumption.` };
    }
    simInc = {};
    if (L3ok) {
      let prev = 0;
      SIM.thresholds.forEach((t) => { const sh = L3.combos[t.combo].exposed_share; simInc[t.id] = Math.max(0, sh - prev); prev = Math.max(prev, sh); });
      simStatus._inc = { status: "from_layer3" };
    } else {
      SIM.thresholds.forEach((t) => { const [lo, mode, hi] = SIM.step_increments_placeholder[t.id]; simInc[t.id] = { type: "triangular", lo, mode, hi }; });
      simStatus._inc = { status: "placeholder" };
    }
  }
  function simCfg() {
    return { seed: SIM.seed, runs: SIM.runs, thresholds: SIM.thresholds, increments: simInc, inputs: simInputs, rho: SIM.copula_rho_hidden_rerouting };
  }
  const STATUS_LABEL = { placeholder: "placeholder", from_layer2: "CBP-calibrated", from_layer3: "from Sayari", sourced: "sourced" };
  function renderSimStatic() {
    const seg = $("sim-thresholds");
    seg.innerHTML = "";
    SIM.thresholds.forEach((t, i) => {
      const b = h("button", { type: "button", "aria-pressed": String(state.simT === i) }, `${esc(t.id)} · ${esc(t.label.replace(" (≈ current practice)", ""))}${t.current ? '<span class="def">≈ current</span>' : ""}`);
      b.addEventListener("click", () => { state.simT = i; renderSimStatic(); runSim(); });
      seg.appendChild(b);
    });
    $("sim-seed").textContent = SIM.seed;
    $("sim-model").innerHTML = SIM.model.map((m) => `<li style="margin-bottom:6px">${esc(m)}</li>`).join("");
    const nPlace = Object.values(simStatus).filter((s) => s.status === "placeholder").length;
    $("sim-flag").innerHTML = `<b>Scenario, not forecast.</b> ${nPlace ? `${nPlace} of ${SIM.inputs.length + 1} input groups are still structural placeholders${L3ok ? "" : ", including the flagged share at each threshold, which waits on the Sayari Layer 3 pull"}. Until they're replaced, the curves show how the model behaves, not what the market would do.` : "All inputs are sourced or calibrated; ranges remain editable below."}`;
    renderSimInputs();
  }
  function fmtDist(d) {
    if (typeof d === "number") return d.toFixed(2) + " pp (fixed, from Layer 3)";
    if (d.type === "beta") return `Beta(${d.a.toFixed(1)}, ${d.b.toFixed(1)})`;
    if (d.type === "uniform") return `Uniform ${d.lo.toFixed(2)}–${d.hi.toFixed(2)}`;
    if (d.type === "triangular") return `Triangular ${d.lo.toFixed(1)} / ${d.mode.toFixed(1)} / ${d.hi.toFixed(1)}`;
    return "";
  }
  function renderSimInputs() {
    const t = $("sim-inputs");
    const rowsIn = SIM.inputs.map((i) => {
      const d = simInputs[i.id], [p5, p95] = SM.distRange(d), st = simStatus[i.id];
      const dec = p95 < 2 ? 2 : 1;
      return `<tr><td><b>${esc(i.label)}</b><div class="small">${esc(i.represents)}</div></td><td class="small">${fmtDist(d)}</td>
        <td><input type="number" step="any" data-in="${i.id}" data-q="lo" value="${p5.toFixed(dec)}" aria-label="${esc(i.label)} 5th percentile"></td>
        <td><input type="number" step="any" data-in="${i.id}" data-q="hi" value="${p95.toFixed(dec)}" aria-label="${esc(i.label)} 95th percentile"></td>
        <td><span class="badge ${st.status === "placeholder" ? "pend" : "ok"}">${STATUS_LABEL[st.status] || st.status}</span></td>
        <td class="small" style="max-width:340px">${esc(st.source)}</td></tr>`;
    });
    const rowsInc = SIM.thresholds.map((th) => {
      const d = simInc[th.id];
      if (typeof d === "number") return `<tr><td><b>Added flagged share · ${esc(th.id)}</b><div class="small">${esc(th.label)} · ${esc(th.confidence)} confidence</div></td><td class="small">${fmtDist(d)}</td><td colspan="2" class="small">from data</td><td><span class="badge ok">from Sayari</span></td><td class="small">Layer 3 combo ${esc(th.combo)}</td></tr>`;
      const [p5, p95] = SM.distRange(d);
      return `<tr><td><b>Added flagged share · ${esc(th.id)}</b><div class="small">${esc(th.label)} · pp of US market · ${esc(th.confidence)} confidence</div></td><td class="small">${fmtDist(d)}</td>
        <td><input type="number" step="any" data-inc="${th.id}" data-q="lo" value="${p5.toFixed(1)}"></td><td><input type="number" step="any" data-inc="${th.id}" data-q="hi" value="${p95.toFixed(1)}"></td>
        <td><span class="badge pend">placeholder</span></td><td class="small">Waits on the Layer 3 Sayari classification. Not data.</td></tr>`;
    });
    t.innerHTML = `<thead><tr><th>Input</th><th>Distribution</th><th>P5</th><th>P95</th><th>Status</th><th>Source / basis</th></tr></thead><tbody>${rowsInc.join("")}${rowsIn.join("")}</tbody>`;
    t.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
      const row = inp.closest("tr");
      const lo = +row.querySelector('[data-q="lo"]').value, hi = +row.querySelector('[data-q="hi"]').value;
      if (inp.dataset.in) {
        simInputs[inp.dataset.in] = SM.distFromRange(simInputs[inp.dataset.in], lo, hi);
        simStatus[inp.dataset.in] = { status: "user", source: "Edited on this page" };
      } else {
        simInc[inp.dataset.inc] = SM.distFromRange(simInc[inp.dataset.inc], lo, hi);
      }
      renderSimInputs();
      runSim();
    }));
  }
  STATUS_LABEL.user = "edited";

  let simTimer = null;
  function runSim() {
    clearTimeout(simTimer);
    simTimer = setTimeout(() => {
      const cfg = simCfg();
      const res = SM.simulate(cfg);
      const j = state.simT, X = state.simX;
      const g = SM.summarise(res.gaps[j], X), du = SM.summarise(res.durs[j], 0);
      let pDur = 0; for (const v of res.durs[j]) if (v > 0) pDur++;
      const th = SIM.thresholds[j];
      const hhi = L3ok ? L3.combos[th.combo] : null;
      $("sim-readout").innerHTML = [
        metric("Median supply gap", pct(g.p50, 1), `90% of runs: ${pct(g.p5, 1)}–${pct(g.p95, 1)}`),
        metric(`P(gap &gt; ${X}%)`, pct(g.pOver, 0), "probability of significant disruption"),
        metric("Median shortage after buffer", du.p50.toFixed(1) + '<span style="font-size:.45em"> mo</span>', `${(pDur / res.durs[j].length * 100).toFixed(0)}% of runs see any shortage · P95 ${du.p95.toFixed(1)} mo`),
        metric("Concentration after removal (HHI)", hhi ? int(hhi.hhi_exporter_after) : "—", hhi ? `by exporter · country ${int(hhi.hhi_country_after)} · deterministic` : "needs Layer 3"),
        metric("Threshold", esc(th.id), esc(th.label)),
        metric("Runs", int(SIM.runs), `seed ${SIM.seed}`),
      ].join("");
      SM.histogram($("h-gap"), res.gaps[j], { unit: "%", threshold: X, thresholdLabel: `${X}% significant`, xMax: Math.max(X * 1.4, SM.niceMax(SM.quantile(res.gaps[SIM.thresholds.length - 1], 0.995))) });
      if (du.p95 === 0 && pDur / res.durs[j].length < 0.05) {
        $("h-dur").innerHTML = `<div class="pending" style="min-height:200px"><div><strong>${pDur ? "Shortages in under 5% of runs" : "No shortage in any run"}</strong>At this threshold, the inventory buffer covers the gap until replacement supply arrives${pDur ? ` in ${(100 - pDur / res.durs[j].length * 100).toFixed(1)}% of runs` : ""}. Try a tighter threshold or a smaller buffer.</div></div>`;
      } else SM.histogram($("h-dur"), res.durs[j], { unit: " mo", title: "Shortage months" });
      SM.lineChart($("t-curve"), SIM.thresholds.map((t, i) => ({ id: t.id, short: ({ T0: "Listed", T1: "Direct", T2: "Tiers 2–3", T3: "Tiers 2–4", T4: "+ Ownership", T5: "+ Research" })[t.id] || "", y: SM.summarise(res.gaps[i], X).pOver, sel: i === j, t, s: SM.summarise(res.gaps[i], X) })), {
        tip: (p) => `<b>${esc(p.id)} · ${esc(p.t.label)}</b><br>P(gap &gt; ${X}%) = ${p.y.toFixed(1)}%<br>median gap ${p.s.p50.toFixed(1)}% (P5–P95 ${p.s.p5.toFixed(1)}–${p.s.p95.toFixed(1)}%)`,
      });
      const labels = Object.fromEntries(SIM.inputs.map((i) => [i.id, i.label]));
      const sens = SM.sensitivity(cfg, j, labels);
      SM.tornado($("tornado"), sens.rows, sens.base);
    }, 30);
  }
  function initSim() {
    simDefaults();
    renderSimStatic();
    const x = $("sim-x");
    x.value = state.simX;
    x.addEventListener("input", () => { state.simX = +x.value; $("sim-x-val").textContent = x.value + "%"; runSim(); });
    $("sim-x-val").textContent = state.simX + "%";
    $("sim-reset").addEventListener("click", () => { simDefaults(); renderSimStatic(); runSim(); });
  }

  /* ---------------------------------------------------------------- method */
  function renderMethod() {
    const lv = R.exposure_levels;
    const hasStats = (L2.stats || []).length > 0, hasCases = (L2.cases || []).length > 0, hasClaims = EV.claims.length > 0;
    const ms = [
      ["M1", "Market universe: US importers of HS 8541.42/.43 and their exporters", L3ok ? "done" : "waiting on Sayari"],
      ["M2", "Exporter risk factors; E0–E3 / A1 / R1 classification", L3ok ? "done" : "waiting on Sayari (pipeline ready)"],
      ["M3", "CBP stats and solar cases (Layer 2)", hasStats && hasCases ? "done (first pass)" : "in progress"],
      ["M4", "All dial combinations, exposure curves", L3ok ? "done" : "pipeline ready, needs M2"],
      ["M5", "Upstream tracing (Sankey tiers)", (D.tiers || {}).status === "ok" ? "done" : "waiting on Sayari"],
      ["M5a", "Evidence layer: sources, claims, timeline", hasClaims ? "done (first pass)" : "in progress"],
      ["M6", "Interface", "built"],
      ["M6a", "Simulation", "built; exposure inputs are placeholders until M2"],
      ["M7", "Validation (§8) and independent review of named companies / intent claims", "not started"],
    ];
    $("method").innerHTML = `
      <div class="panel"><h3 class="display" style="margin-bottom:18px">Exposure levels</h3>
        <p>Layer 3 classifies each exporter by the Sayari risk factors attached to it. A flag means a supply chain <b>connection</b>, not proof that a product contains a targeted input.</p>
        <table class="tbl"><thead><tr><th>Level</th><th>Meaning</th><th>Confidence</th></tr></thead><tbody>
        ${lv.map((l) => `<tr><td>${lvlBadge(l.id)} ${esc(l.label)}</td><td>${esc(l.meaning)}</td><td><span class="conf ${confClass(l.confidence)}">${esc(l.confidence)}</span></td></tr>`).join("")}</tbody></table>
        <p class="small">A flag's confidence goes up one level when it's independently corroborated (a detention case, company disclosure or investigative report) and down when Sayari's source records are thin.</p></div>

      <div class="panel"><h3 class="display" style="margin-bottom:18px">Confidence &amp; claims</h3>
        <table class="tbl"><tbody>
        <tr><td><span class="conf high">high</span></td><td>Stated directly in a primary official document, or a matter of public record</td></tr>
        <tr><td><span class="conf medium">medium</span></td><td>Two or more independent non-primary sources agree, or a reasonable reading of primary documents</td></tr>
        <tr><td><span class="conf low">low</span></td><td>One secondary source, or our own inference</td></tr></tbody></table>
        <p>Claims are typed <b>fact</b> (something happened), <b>position</b> (someone argued X) or <b>interpretation</b> (our reading). Advocacy and industry sources are capped at low confidence for facts. An intent claim is reported only as “evidence consistent with a deliberate choice”, and only when there's both a data cliff at that dial and a medium-or-higher source showing the boundary was contested or chosen.</p></div>

      <div class="panel"><h3 class="display" style="margin-bottom:18px">Metrics</h3>
        <ul>
          <li><b>Exposed share</b>: exposed US import value ÷ total US import value (cells + modules, 730-day window).</li>
          <li><b>Tolerated exposure</b>: Layer 3 exposed value − Layer 2 stopped value. CBP doesn't report solar, so the Layer 2 basis is HTS 8541 where captured, otherwise Electronics (both upper bounds). The windows differ (Sayari 730 days, CBP since June 2022).</li>
          <li><b>Remaining suppliers</b>: traced exporters with no flag under the current dials.</li>
          <li><b>HHI</b>: Herfindahl–Hirschman Index (0–10,000) of the supply that remains, by exporter and by country of export.</li>
          <li><b>Cliff</b>: one step at least ×${R.cliff_rule.min_ratio} exposed value <i>and</i> +${R.cliff_rule.min_share_pp} pp of market share.</li>
          <li><b>Replacement time</b>: a labelled sector assumption, shown as an input, not a result.</li>
        </ul></div>

      <div class="panel"><h3 class="display" style="margin-bottom:18px">Known limits</h3>
        <ul>
          <li><b>Trade data coverage is uneven.</b> US import records are strong; many producer-country records are partial or absent. “No exposure found” can mean “no data”.</li>
          <li><b>Company-level links ≠ product-level content.</b> A firm that buys Xinjiang polysilicon and sells wafers doesn't prove a particular shipment contained it.</li>
          <li><b>Entity resolution is imperfect.</b> Name matching across languages and registries introduces false positives and negatives.</li>
          <li><b>Recent activity bias.</b> Sayari's trade risk factors cover the last 730 days of trade activity only.</li>
          <li><b>Not an accusation engine, not a forecast, not proof of intent.</b> Price effects are out of scope for v1.</li>
        </ul></div>

      <div class="panel" style="grid-column:1/-1"><h3 class="display" style="margin-bottom:18px">Build status</h3>
        <table class="tbl status-tbl"><thead><tr><th>Milestone</th><th>What</th><th>Status</th></tr></thead><tbody>
        ${ms.map((m) => `<tr><td>${m[0]}</td><td>${esc(m[1])}</td><td><span class="badge ${/done|built/.test(m[2]) ? "ok" : "pend"}">${esc(m[2])}</span></td></tr>`).join("")}</tbody></table>
        <p class="small">Data files: <a href="../data/cbp_uflpa_stats.csv">cbp_uflpa_stats.csv</a> · <a href="../data/cases.csv">cases.csv</a> · <a href="../data/evidence/sources.csv">sources.csv</a> · <a href="../data/evidence/claims.csv">claims.csv</a> · <a href="../data/evidence/timeline.csv">timeline.csv</a> · <a href="../data/derived/metrics.json">metrics.json</a> · <a href="../rules/uflpa.json">rules/uflpa.json</a></p></div>`;
  }

  /* ---------------------------------------------------------------- views */
  function refreshExplorer() {
    renderDials(); renderReadout(); renderFlow(); renderCurves(); renderEvidence(); renderCompanies();
    if (L3ok) renderHero(), bindDeclared($("hero-stats"));
  }
  let simInited = false;
  function route() {
    const v = (location.hash || "#explorer").slice(1);
    const view = ["explorer", "simulation", "method"].includes(v) ? v : "explorer";
    document.querySelectorAll(".view").forEach((n) => n.classList.toggle("on", n.id === "view-" + view));
    document.querySelectorAll(".tabs a").forEach((a) => (a.dataset.view === view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    if (view === "simulation") { if (!simInited) { initSim(); simInited = true; } runSim(); }
    if (view === "explorer") { renderFlow(); renderCurves(); renderEnf(); }
    if (["simulation", "method"].includes(v) || v === "explorer" || !v) window.scrollTo(0, 0);
  }

  renderHero(); renderLayers(); renderDials(); renderReadout(); renderEvidence(); renderCompanies(); renderMethod();
  bindDeclared();
  window.addEventListener("hashchange", route);
  route();
  let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { const v = (location.hash || "#explorer").slice(1); if (v === "simulation") runSim(); else { renderFlow(); renderCurves(); renderEnf(); } }, 150); });
})();
