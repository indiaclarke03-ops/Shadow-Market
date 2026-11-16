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
  const DEFAULT_COMBO = `${R.dials.tier_depth.default}|${R.dials.trigger_scope.default}|${R.dials.ownership_reach.default}`;
  const FULL_COMBO = "E3|research|one_hop";
  const L3ok = L3.status === "ok";
  // Layer 3 size measure: USD if Sayari carried values, else US bill-of-lading shipment counts (DECISIONS #15)
  const BYSHIP = L3ok && L3.measure === "shipments";
  const amt = (v) => (BYSHIP ? `${int(v)} shipments` : usd(v));
  const MV = BYSHIP ? "shipments" : "import value";

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
    { id: "E0", label: "On the US blacklist", color: COL.E0 },
    { id: "E1", label: "Direct supplier link", color: COL.E1 },
    { id: "E2", label: "Link 2–3 steps back", color: COL.E2 },
    { id: "E3", label: "Link up to 4 steps back", color: COL.E3 },
    { id: "R1", label: "Named in research", color: COL.R1 },
    { id: "A1", label: "Shares an owner", color: COL.A1 },
    { id: "shadow", label: "Shadow market: flagged only if the rule went further", color: COL.shadow },
    { id: "clean", label: "No link found", color: COL.clean },
    { id: "untraced", label: "Can’t be traced", color: COL.untraced },
  ];
  const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
  const LEVEL_CONF = Object.fromEntries(R.exposure_levels.map((l) => [l.id, l.confidence]));
  const PLAIN = {
    tier_depth: { label: "How far back to look", question: "How many steps up the supply chain does the rule check?", positions: { E0: "Blacklisted companies only", E1: "Direct suppliers", E2: "2–3 steps back", E3: "Up to 4 steps back" } },
    trigger_scope: { label: "Who counts as a red flag", question: "Which companies trigger the rule?", positions: { entity_list: "US blacklist only", xinjiang: "+ any Xinjiang company", research: "+ companies named by researchers" } },
    ownership_reach: { label: "Do shared owners count?", question: "Flag a supplier that shares an owner with a blacklisted company?", positions: { off: "No", one_hop: "Yes" } },
    value_basis: { label: "Measure by", question: "Count shipments, or count companies?", positions: { value: "Share of shipments", count: "Number of exporters" } },
  };
  const dialLabel = (id) => (PLAIN[id] || {}).label || R.dials[id].label;
  const posLabel = (id, pos) => ((PLAIN[id] || {}).positions || {})[pos] || pos;
  const hhiWord = (v) => (v == null ? "" : v < 1500 ? "spread out" : v < 2500 ? "moderately concentrated" : "highly concentrated");

  /* ---------------------------------------------------------------- header + hero */
  function renderHero() {
    const elh = L2.entity_list_history || [];
    const latest = elh.length ? elh.slice().sort((a, b) => a.date.localeCompare(b.date)).pop() : null;
    const all = (L2.summary.all || {}).stopped;
    const stats = [];
    if (L3ok) {
      const now = L3.combos[DEFAULT_COMBO], full = L3.combos[FULL_COMBO];
      $("h1-a").textContent = `${pct(now.exposed_share, 0)} flagged.`;
      $("h1-b").textContent = `${pct(full.exposed_share, 0)} linked.`;
      $("hero-lede").innerHTML = `The US bans goods made with forced labour in Xinjiang, China. Check only the companies that ship solar cells and panels to America, roughly how the rule is applied today, and <b>${pct(now.exposed_share, 0)}</b> of shipments are flagged. Follow the same supply chains back to the polysilicon and wafers, and <b>${pct(full.exposed_share, 0)}</b> come from suppliers with a link to companies tied to forced labour.`;
      stats.push(`<div class="hero-stat"><span class="num">${int(L3.total_value)}</span><span class="lbl">solar cell and panel shipments to the US in two years, from ${int(L3.exporter_count)} exporters (Sayari trade data)</span></div>`);
    }
    stats.push(latest
      ? `<div class="hero-stat"><span class="num" data-src="${esc(latest.source_id)}" data-title="UFLPA Entity List" data-conf="high">${int(latest.total_entities)}</span><span class="lbl">companies on the US forced-labour blacklist (UFLPA Entity List, ${esc(latest.date)})</span></div>`
      : `<div class="hero-stat"><span class="num">187</span><span class="lbl">companies on the US forced-labour blacklist after 3 Aug 2026</span></div>`);
    if (all) stats.push(`<div class="hero-stat"><span class="num" data-src="${esc(all.source_id)}" data-title="Shipments stopped, all industries" data-body="${esc(int(all.shipments) + " shipments · " + (all.period || ""))}" data-conf="high">${usd(all.value_usd)}</span><span class="lbl">of goods stopped by US customs under the law since June 2022, across all industries</span></div>`);
    $("hero-stats").innerHTML = stats.join("");
    $("coverage").innerHTML = L3ok
      ? `Coverage: ${pct(L3.traced_share, 0)} of shipments can be traced upstream. The rest is shown in grey, not left out, because “no link found” can also mean “no data”. A link is a supply chain connection, not proof that a product contains forced labour.`
      : `Supply chain data (Layer 3) is waiting on the Sayari snapshot. Nothing on this page is estimated in its place.`;
    $("snap").textContent = (D.snapshot ? "Data as of " + D.snapshot : "Sayari snapshot pending");
    $("foot-built").textContent = "Data built " + D.built;
    if (D.fixture) {
      const b = h("div", { style: "position:fixed;left:0;right:0;bottom:0;z-index:99;background:#a8432f;color:#fff;text-align:center;padding:8px;font-weight:600" }, "TEST FIXTURE: synthetic exporters for layout testing only. Not real data.");
      document.body.appendChild(b);
    }
  }

  /* ---------------------------------------------------------------- three layers */
  function renderLayers() {
    $("layer1").innerHTML = `
      <div class="tag">1 · On paper</div>
      <h3 class="display">What the law says</h3>
      <div class="body"><p style="margin:0 0 10px">The Uyghur Forced Labor Prevention Act (in force since June 2022) presumes that goods are made with forced labour, and bars them from the US, if they were made <b>wholly or in part</b>:</p>
      <ul><li>in Xinjiang, China, or</li><li>by a company on the US blacklist (the UFLPA Entity List).</li></ul>
      <p style="margin:12px 0 0">The importer must prove otherwise with “clear and convincing evidence”. The law sets no limit on how far up the supply chain this applies, and no minimum amount.</p></div>
      <div class="foot"><div class="big">No limit</div><p class="small" style="margin:6px 0 0">on how far back the law reaches. This is the theoretical maximum the other two readings are tested against.</p></div>`;

    const s = L2.summary, e = s.electronics || {}, hts = s.hts8541 || {};
    const basis = hts.stopped ? hts : e.stopped ? e : null;
    const basisName = hts.stopped ? "solar cells and panels, plus other semiconductor devices (customs code HTS 8541)" : "electronics (an upper bound for solar)";
    const rr = s.release_rate;
    $("layer2").innerHTML = `
      <div class="tag">2 · In practice</div>
      <h3 class="display">What customs stops</h3>
      <div class="body">Shipments US Customs and Border Protection (CBP) has stopped under the law since June 2022. CBP doesn’t report solar on its own, so we use ${esc(basisName)}.
      ${rr ? `<p style="margin:12px 0 0">Most stopped goods get through in the end: <b data-src="${esc(rr.source_ids.join(";"))}" data-title="Release rate" data-body="released ÷ (released + denied), ${esc(rr.basis)}, by ${esc(rr.by)}" data-conf="high">${pct(rr.value * 100, 0)}</b> of the value of decided cases was released after importers submitted paperwork${rr.by_count != null ? ` (${pct(rr.by_count * 100, 0)} by number of shipments)` : ""}.</p>` : ""}
      <p style="margin:8px 0 0">${(L2.cases || []).length} public solar cases are listed further down.</p></div>
      <div class="foot">${basis ? `<div class="big" data-src="${esc(basis.stopped.source_id)}" data-title="Stopped" data-body="${esc(int(basis.stopped.shipments) + " shipments · " + (basis.stopped.period || "") + (basis.stopped.notes ? " · " + basis.stopped.notes : ""))}" data-conf="high">${usd(basis.stopped.value_usd)}</div><p class="small" style="margin:6px 0 0">stopped, ${esc(basis.stopped.period || "").replace("..", " to ")}</p>` : `<div class="big">Pending</div><p class="small">CBP statistics not yet captured.</p>`}</div>`;

    if (L3ok) {
      const m = L3.combos[DEFAULT_COMBO], full = L3.combos[FULL_COMBO];
      $("layer3").innerHTML = `
        <div class="tag">3 · With full visibility</div>
        <h3 class="display">What the law could catch</h3>
        <div class="body">The same test, applied to every step of the supply chain that Sayari’s trade and company records can see. ${int(L3.exporter_count)} exporters sent ${int(L3.total_value)} shipments of solar cells and panels to the US over two years, and ${pct(L3.traced_share, 0)} of them can be traced upstream.${BYSHIP ? " (US shipping records give weight, not value, so we count shipments.)" : ""}</div>
        <div class="foot"><div class="big">${pct(full.exposed_share, 0)}</div><p class="small" style="margin:6px 0 0">of shipments have a supply chain link to forced-labour risk when every link counts, against ${pct(m.exposed_share, 0)} under today’s approach.</p></div>`;
    } else {
      $("layer3").innerHTML = `
        <div class="tag">3 · With full visibility</div>
        <h3 class="display">What the law could catch</h3>
        <div class="body">The same test applied through every step Sayari’s trade and ownership records can see.</div>
        <div class="foot"><span class="badge pend">Awaiting Sayari snapshot</span></div>`;
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
      d.innerHTML = `<div class="dial-head"><span class="dial-name">${esc(dialLabel(id))}</span></div><div class="dial-q">${esc((PLAIN[id] || {}).question || dial.question)}</div>`;
      const seg = h("div", { class: "seg", role: "group", "aria-label": dialLabel(id) });
      dial.positions.forEach((p) => {
        const b = h("button", { type: "button", "aria-pressed": String(state[key] === p.id) }, `${esc(posLabel(id, p.id))}${p.id === dial.default ? `<span class="def">${id === "value_basis" ? "default" : "≈ today"}</span>` : ""}`);
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
    const repl = metric("Time to bring in a new supplier", `${ra.months_low}–${ra.months_high}<span style="font-size:.45em"> months</span>`, "to qualify and ramp up a replacement", "assume", `data-src="" data-title="Assumption" data-body="${esc(ra.source)}"`);
    if (!L3ok) {
      $("readout").innerHTML = [metric("Share of shipments flagged", "—", "needs Sayari data"), repl].join("");
      bindDeclared($("readout"));
      return;
    }
    const m = L3.combos[comboKey()], now = L3.combos[DEFAULT_COMBO];
    const byCount = state.basis === "count";
    const share = byCount ? m.exposed_count_share : m.exposed_share;
    const nowShare = byCount ? now.exposed_count_share : now.exposed_share;
    const extra = share - nowShare;
    $("readout").innerHTML = [
      metric(byCount ? "Exporters flagged" : "US solar shipments flagged", pct(share, 1), byCount ? `${int(m.exposed_count)} of ${int(L3.exporter_count)} exporters` : `${int(m.exposed_value)} of ${int(L3.total_value)} shipments`, "key"),
      metric("Flagged here but not under today’s rule", (extra > 0 ? "+" : "") + pct(extra, 1), extra > 0 ? "the shadow market at these settings" : "these settings catch no more than today’s"),
      metric("Suppliers left with no link", int(m.remaining_suppliers), `of ${int(L3.exporter_count)} exporters`),
      metric("How concentrated the rest is, by company", int(m.hhi_exporter_after), `${hhiWord(m.hhi_exporter_after)} · ${int(L3.hhi_exporter_before)} before (HHI, 0–10,000)`, "", `data-src="" data-title="Concentration (HHI)" data-body="Herfindahl–Hirschman Index of the supply left after flagged suppliers are removed. Under 1,500 = spread out; 1,500–2,500 = moderate; over 2,500 = high (US merger guidelines). It can fall when one big supplier is removed."`),
      metric("How concentrated the rest is, by country", int(m.hhi_country_after), `${hhiWord(m.hhi_country_after)} · ${int(L3.hhi_country_before)} before`),
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
        upstream("S1", "Polysilicon", "the raw material"),
        upstream("S2", "Wafers", "sliced from polysilicon"),
        { id: "S34", label: "Cells & panels", sub: "shipped to the US", segments: Object.entries(agg).map(([cat, value]) => ({ cat, value })) },
        { id: "US", label: "What’s left", sub: "if flagged supply is blocked", segments: Object.entries(aggLeft).map(([cat, value]) => ({ cat, value })) },
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
        if (col.pending) return `<b>${esc(col.label)}</b><br>Not traced yet. Shown in grey, not left out.`;
        const conf = LEVEL_CONF[c.id];
        return `<b>${esc(c.label)}</b> · ${esc(col.label)}<br>${amt(S.v)} · ${(S.share * 100).toFixed(1)}% of this column${conf ? `<div class="t-src">How confident this kind of link is: <b>${esc(conf)}</b><br>Source: Sayari risk factors, data as of ${esc(D.snapshot || "")}</div>` : ""}`;
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
    $("curve-note").textContent = `Jump = one step at least doubles the flagged share and adds ${cr.min_share_pp}+ points`;
    if (!L3ok) {
      cont.innerHTML = `<div class="pending"><div><strong>Curves appear with Layer 3</strong>One step chart per dial, others held at default, with cliffs marked under the rule in spec §12.</div></div>`;
      return;
    }
    const map = { tier_depth: "tier", trigger_scope: "scope", ownership_reach: "own" };
    for (const dial of ["tier_depth", "trigger_scope", "ownership_reach"]) {
      const box = h("div", { style: "margin-bottom:10px" });
      box.innerHTML = `<div class="small" style="font-weight:600;color:var(--navy)">${esc(dialLabel(dial))}</div>`;
      const chart = h("div");
      box.appendChild(chart);
      cont.appendChild(box);
      const steps = L3.curves[dial].map((p) => ({
        ...p, label: posLabel(dial, p.position), y: state.basis === "count" ? (p.exposed_count / L3.exporter_count) * 100 : p.exposed_share,
        current: state[map[dial]] === p.position,
      }));
      SM.stepChart(chart, steps, {
        height: 170, title: R.dials[dial].label,
        tip: (p) => `<b>${esc(p.label)}</b><br>${pct(p.y)} flagged · ${amt(p.exposed_value)}${p.ratio_vs_prev !== undefined ? `<br>vs the step before: ×${p.ratio_vs_prev ?? "∞"}, +${p.added_pp} points` : ""}${p.cliff ? "<br><b>A jump: one small change flags much more supply</b>" : ""}<div class="t-src">Sayari data as of ${esc(D.snapshot || "")}</div>`,
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
    add("hts8541", "Solar & chips");
    const cont = $("enf");
    if (!rows.length) {
      cont.innerHTML = `<div class="pending"><div><strong>CBP figures pending</strong>Layer 2 research is in progress.</div></div>`;
      return;
    }
    const cats = [
      { id: "released", label: "Released", color: COL.E3, textColor: "#0f1b33" },
      { id: "denied", label: "Refused entry", color: COL.E0 },
      { id: "pending", label: "Still pending", color: COL.untraced, textColor: "#0f1b33" },
    ];
    cont.innerHTML = `<div class="legend" style="margin-bottom:12px">${cats.map((c) => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join("")}<span class="small">share of the value stopped</span></div><div id="enf-bars"></div><div id="enf-notes"></div>`;
    SM.outcomeBars($("enf-bars"), rows, cats, {
      tip: (r, c, v, tot) => { const g = r.g[c.id]; return srcTipHTML(g?.source_id, { title: `${r.label} · ${c.label}`, body: `${usd(v)} (${((v / tot) * 100).toFixed(1)}%)${g?.shipments ? " · " + int(g.shipments) + " shipments" : ""}<br>${esc(g?.period || "")}`, conf: "high" }); },
    });
    const solar = (L2.stats || []).filter((r) => r.industry === "solar_reported");
    $("enf-notes").innerHTML = `<p class="small" style="margin:14px 0 0">Most goods customs stops are eventually released. CBP doesn’t report solar on its own: “Solar &amp; chips” (customs code HTS 8541) also includes LEDs, diodes and other semiconductors, and “Electronics” is broader still.</p>` +
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
  const DIAL_LABEL = { all: "Everything", tier_depth: "How far back to look", trigger_scope: "Who counts as a red flag", ownership_reach: "Shared owners", lookback: "Timing & intensity", general: "General" };
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
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="type">Claim about intent · on hold</span><span class="small">${esc(DIAL_LABEL[normDial(c.dial)])} · ${esc(c.claim_id)}</span></div>
        <p class="small" style="margin-top:8px">${esc(c.held)}. The claim is kept in the register and will be shown here once both conditions are met.</p>
      </article>` : `
      <article class="claim ${confClass(c.confidence)}">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="type">${esc(c.claim_type)}</span><span class="conf ${confClass(c.confidence)}">${esc(c.confidence)} confidence</span><span class="small">${esc(DIAL_LABEL[normDial(c.dial)])} · ${esc(c.claim_id)}</span></div>
        <p>${esc(c.claim_text)}</p>
        ${c.counter_evidence ? `<div class="counter"><b>Other possible explanations:</b> ${esc(c.counter_evidence)}</div>` : ""}
        <div class="srcs">Sources: ${srcLinks(c.sources)}</div>
      </article>`).join("") : `<div class="pending"><div><strong>${EV.claims.length ? "No claims for this choice yet" : "Claims register in progress"}</strong>${EV.claims.length ? "Pick another filter above." : ""}</div></div>`;
    bindDeclared($("why"));
  }
  function catColor(c) {
    return { statute: COL.E0, entity_list: COL.E1, guidance: COL.E2, enforcement: COL.A1, consultation: COL.R1, lobbying: COL.R1, research: COL.E3, market: COL.untraced }[c] || COL.peri;
  }

  /* ---------------------------------------------------------------- companies */
  function lvlBadge(l) { return `<span class="lvl"><i style="background:${COL[l] || COL.peri}"></i>${esc((CAT[l] || {}).label || l)}</span>`; }
  function renderCompanies() {
    const ce = $("company-exposure");
    if (!L3ok) {
      ce.innerHTML = `<div class="panel-title"><h4>Top exporters by US import value</h4><span class="badge pend">Awaiting Sayari snapshot</span></div><div class="pending" style="min-height:160px"><div><strong>Exporter exposure appears with Layer 3</strong>Each row will show exposure level, confidence and the underlying Sayari source records. A company is never named without all three.</div></div>`;
    } else {
      const rows = L3.exporters.filter((e) => e.flags.length).slice(0, 30);
      ce.innerHTML = `<div class="panel-title"><h4>Exporters with a link, by US shipments</h4><span class="small">top ${rows.length} · the “Under your settings” column follows the choices above</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Exporter</th><th>Country</th><th class="r">${BYSHIP ? "US shipments" : "US import value"}</th><th>Types of link</th><th>Under your settings</th><th>Confidence</th><th>Sayari records</th></tr></thead><tbody>
        ${rows.map((e) => { const c = categoryOf(e); return `<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.country)}</td><td class="r">${BYSHIP ? int(e.value) : usd(e.value)}</td><td>${e.levels.map(lvlBadge).join("<br>")}</td><td>${esc(CAT[c].label)}</td><td><span class="conf ${confClass(e.confidence)}">${esc(e.confidence || "—")}</span></td><td class="small">${e.source_records.length ? e.source_records.map(esc).join(", ") : esc(e.sayari_entity_id || "—")}</td></tr>`; }).join("")}
        </tbody></table></div>`;
    }
    const cases = L2.cases || [];
    $("company-cases").innerHTML = `<div class="panel-title"><h4>Public solar cases</h4><span class="small">detentions, blacklistings and other enforcement on record</span></div>` + (cases.length ? `
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Company</th><th>Event</th><th>Outcome</th><th>Confidence</th><th>Source</th></tr></thead><tbody>
      ${cases.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((c) => `<tr><td style="white-space:nowrap">${esc(c.date)}</td><td><b>${esc(c.company)}</b><div class="small">${esc(c.company_role)} · ${esc(c.country)}</div></td><td>${esc(c.event.replace(/_/g, " "))}<div class="small">${esc(c.description)}</div></td><td>${esc(c.outcome)}</td><td><span class="conf ${confClass(c.confidence)}">${esc(c.confidence)}</span></td><td class="small">${srcLinks(c.source_ids)}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="pending" style="min-height:140px"><div><strong>Cases register in progress</strong></div></div>`);
    bindDeclared($("companies"));
  }

  /* ---------------------------------------------------------------- simulation */
  const SIM = D.simulation;
  const INP = Object.fromEntries(SIM.inputs.map((i) => [i.id, i]));
  const TH = SIM.thresholds;
  const CUR_T = Math.max(0, TH.findIndex((t) => t.current));
  const flaggedAt = TH.map((t) => (L3ok ? L3.combos[t.combo].exposed_share : (([lo, mode, hi]) => ({ type: "triangular", lo, mode, hi }))(SIM.step_increments_placeholder[t.id])));
  const sim = { reach: CUR_T, vals: {}, status: {}, X: SIM.significant_gap_pct, preset: "today", cur: null, prev: null };
  const f1 = (v) => (v > 0 && v < 10 ? v.toFixed(1) : v.toFixed(0));
  const fmtVal = (id, v) => {
    const u = INP[id].unit;
    if (u === "share") return Math.round(v * 100) + "%";
    if (u === "times") return v.toFixed(1) + "×";
    if (u === "months") return (v % 1 ? v.toFixed(1) : v) + (v === 1 ? " month" : " months");
    if (u === "pp") return v.toFixed(1) + "% / mo";
    return String(v);
  };
  const STATUS_LABEL = { placeholder: "placeholder", from_layer2: "from CBP data", from_layer3: "from Sayari", sourced: "sourced", user: "your setting", preset: "scenario setting" };

  function simDefaults() {
    SIM.inputs.forEach((i) => { sim.vals[i.id] = i.centre; sim.status[i.id] = { status: i.status, source: i.source }; });
    const rr = L2.summary.release_rate;
    if (rr) {
      sim.vals.release = Math.round(rr.value * 200) / 200;
      sim.status.release = { status: "from_layer2", source: `US Customs (CBP): ${pct(rr.value * 100, 1)} of the value of decided cases for solar cells, panels and other chips (HTS 8541) was released (${pct(rr.by_count * 100, 0)} by number of shipments). Source ${rr.source_ids.join(", ")}. The ±10-point spread is our assumption.` };
    }
    sim.base = { ...sim.vals };
  }
  function applyPreset(id) {
    const pr = SIM.presets.find((p) => p.id === id);
    simDefaults();
    for (const [k, v] of Object.entries(pr.set || {})) {
      sim.vals[k] = v;
      sim.status[k] = { status: "preset", source: `Set by the “${pr.label}” scenario. Default: ${fmtVal(k, sim.base[k])}. ${INP[k].source}` };
    }
    sim.reach = TH.findIndex((t) => t.id === pr.reach);
    sim.preset = id;
  }
  function simCfg() {
    const inputs = {};
    SIM.inputs.forEach((i) => (inputs[i.id] = SM.distOf(i, sim.vals[i.id])));
    return { seed: SIM.seed, runs: SIM.runs, flagged: flaggedAt, traced: L3ok ? L3.traced_share : 100, inputs, rho: SIM.copula_rho_hidden_rerouting };
  }

  function renderPresets() {
    $("sim-presets").innerHTML = SIM.presets.map((p, i) => `<button type="button" class="preset" data-p="${p.id}" aria-pressed="${sim.preset === p.id}"><span class="k">Scenario ${i + 1}</span><b>${esc(p.label)}</b><span>${esc(p.blurb)}</span></button>`).join("");
    $("sim-presets").querySelectorAll(".preset").forEach((b) => b.addEventListener("click", () => { applyPreset(b.dataset.p); renderControls(); compute(); }));
  }
  function sliderHTML(id) {
    const i = INP[id], v = sim.vals[id], d = SM.distOf(i, v), st = sim.status[id];
    return `<div class="ctl" data-ctl="${id}">
      <label for="in-${id}">${esc(i.label)}</label>
      <div class="q">${esc(i.question)}</div>
      <div class="row"><input type="range" id="in-${id}" min="${i.min}" max="${i.max}" step="${i.step}" value="${v}"><span class="val" id="val-${id}">${fmtVal(id, v)}</span></div>
      <div class="meta"><span id="rng-${id}">varies ${fmtVal(id, d.lo)}–${fmtVal(id, d.hi)}</span><span class="badge ${st.status === "placeholder" ? "pend" : "ok"}" data-src="" data-title="${esc(STATUS_LABEL[st.status] || st.status)}" data-body="${esc(st.source)}">${esc(STATUS_LABEL[st.status] || st.status)}</span></div>
    </div>`;
  }
  function renderControls() {
    renderPresets();
    const reach = TH.map((t, i) => `<button type="button" data-r="${i}" aria-pressed="${sim.reach === i}"><span>${esc(t.label)}</span><span class="f">${L3ok ? pct(flaggedAt[i], 0) + " flagged" : ""}</span></button>`).join("");
    $("sim-controls").innerHTML = `
      <div class="ctl-group"><p class="kicker">The rule</p>
        <div class="ctl"><label>How far back does customs look?</label><div class="q">Customs blocks shipments when it finds a link to forced-labour risk this far up the supply chain. The % is the share of US solar shipments the rule would flag (Sayari data).</div>
        <div class="reach-list" role="group" aria-label="Reach">${reach}</div></div></div>
      <div class="ctl-group"><p class="kicker">Enforcement</p>${["p_enf", "release", "reroute"].map(sliderHTML).join("")}</div>
      <div class="ctl-group"><p class="kicker">The market’s cushion</p>${["buffer", "ramp", "capacity"].map(sliderHTML).join("")}</div>
      <div class="ctl-group"><p class="kicker">Unknowns and the line</p>${sliderHTML("hidden")}
        <div class="ctl"><label for="in-X">What counts as a serious disruption?</label><div class="q">Losing more than this share of US solar supply.</div>
        <div class="row"><input type="range" id="in-X" min="5" max="50" step="1" value="${sim.X}"><span class="val" id="val-X">${sim.X}%</span></div></div></div>
      <button type="button" class="btn" id="sim-reset" style="color:var(--on-dark)">Reset to defaults</button>`;
    $("sim-controls").querySelectorAll(".reach-list button").forEach((b) => b.addEventListener("click", () => { sim.reach = +b.dataset.r; sim.preset = null; renderControls(); compute(); }));
    SIM.inputs.forEach((i) => {
      const el = $("in-" + i.id);
      el.addEventListener("input", () => {
        sim.vals[i.id] = +el.value; sim.preset = null;
        sim.status[i.id] = { status: "user", source: `You changed this. Default: ${fmtVal(i.id, sim.base[i.id])}. ${i.source}` };
        const d = SM.distOf(i, +el.value);
        $("val-" + i.id).textContent = fmtVal(i.id, +el.value);
        $("rng-" + i.id).textContent = `varies ${fmtVal(i.id, d.lo)}–${fmtVal(i.id, d.hi)}`;
        $("sim-presets").querySelectorAll(".preset").forEach((b) => b.setAttribute("aria-pressed", "false"));
        scheduleCompute();
      });
      el.addEventListener("change", () => { const b = el.closest(".ctl").querySelector(".badge"); b.className = "badge ok"; b.textContent = "your setting"; b.dataset.title = "your setting"; b.dataset.body = sim.status[i.id].source; });
    });
    const x = $("in-X");
    x.addEventListener("input", () => { sim.X = +x.value; $("val-X").textContent = x.value + "%"; scheduleCompute(); });
    $("sim-reset").addEventListener("click", () => { applyPreset("today"); renderControls(); compute(); });
    bindDeclared($("sim-controls"));
  }

  let simTimer = null;
  function scheduleCompute() { clearTimeout(simTimer); simTimer = setTimeout(compute, 40); }
  function compute() {
    const cfg = simCfg(), res = SM.simulate(cfg), X = sim.X, j = sim.reach;
    const S = {};
    for (const k of ["flagged", "stopped", "keptOut", "lost"]) S[k] = SM.summarise(res[k][j], X);
    const sh = res.short[j], pos = [];
    for (const v of sh) if (v > 0) pos.push(v);
    pos.sort((a, b) => a - b);
    S.pShort = (pos.length / sh.length) * 100;
    S.durMed = pos.length ? pos[Math.floor(pos.length / 2)] : 0;
    S.durP95 = pos.length ? pos[Math.floor(pos.length * 0.95)] : 0;
    let serious = 0, shortOnly = 0, absorbed = 0;
    for (let r = 0; r < sh.length; r++) { const l = res.lost[j][r]; if (l > X) serious++; else if (sh[r] > 0) shortOnly++; else if (l >= 1) absorbed++; }
    const N = sh.length;
    S.cats = { serious: (serious / N) * 100, shortOnly: (shortOnly / N) * 100, absorbed: (absorbed / N) * 100, none: ((N - serious - shortOnly - absorbed) / N) * 100 };
    S.reach = TH.map((t, i) => SM.summarise(res.lost[i], X));
    S.sens = S.flagged.p50 > 0.5 ? SM.sensitivity({ ...cfg, seed: SIM.seed + 1 }, j) : null;
    S.lostArr = res.lost[j];
    S.j = j; S.X = X; S.vals = { ...sim.vals }; S.preset = sim.preset;
    if (sim.cur) sim.prev = sim.cur;
    sim.cur = S;
    renderSim();
  }

  function tween(el, to, fmt) {
    const from = +(el.dataset.v ?? to);
    el.dataset.v = to;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || Math.abs(from - to) < 0.05) { el.innerHTML = fmt(to); return; }
    const t0 = performance.now(), dur = 420;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.innerHTML = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function deltaHTML(cur, prev, unit = " pts") {
    if (prev == null) return "";
    const d = cur - prev;
    if (Math.abs(d) < 0.1) return "";
    return `${d > 0 ? "▲ +" : "▼ −"}${f1(Math.abs(d))}${unit} vs your last setting`;
  }

  function renderSim() {
    const S = sim.cur, P = sim.prev, X = S.X, th = TH[S.j];
    const pr = SIM.presets.find((p) => p.id === S.preset);
    $("sim-head").innerHTML = `<b>${pr ? esc(pr.label) : "Your own scenario"}.</b> Customs blocks solar shipments ${esc(th.plain)}.`;

    // headline numbers
    if (!$("m-lost")) {
      $("sim-readout").innerHTML = `
        <div class="metric"><div class="lbl">US solar supply lost for good, in a typical future</div><div class="num" id="m-lost"></div><div class="sub" id="m-lost-s"></div><span class="delta" id="m-lost-d"></span></div>
        <div class="metric" id="m-ser-box"><div class="lbl">Chance of a serious disruption</div><div class="num" id="m-ser"></div><div class="sub" id="m-ser-s"></div><span class="delta" id="m-ser-d"></span></div>
        <div class="metric" id="m-sh-box"><div class="lbl">Chance of a shortage</div><div class="num" id="m-sh"></div><div class="sub" id="m-sh-s"></div><span class="delta" id="m-sh-d"></span></div>`;
    }
    tween($("m-lost"), S.lost.p50, (v) => f1(v) + "%");
    $("m-lost-s").textContent = S.lost.p95 > 0.05 ? `9 in 10 futures: ${f1(S.lost.p5)}–${f1(S.lost.p95)}%` : "none in any future";
    tween($("m-ser"), S.lost.pOver, (v) => Math.round(v) + "%");
    $("m-ser-s").textContent = `futures where more than ${X}% of supply is lost`;
    $("m-ser-box").classList.toggle("bad", S.lost.pOver >= 50);
    tween($("m-sh"), S.pShort, (v) => (v > 0 && v < 1 ? "<1" : Math.round(v)) + "%");
    $("m-sh-s").textContent = S.pShort > 0 ? `when stock runs out before new suppliers arrive, it lasts about ${f1(S.durMed)} months` : "stock covers the gap in every future";
    $("m-sh-box").classList.toggle("bad", S.pShort >= 50);
    const setD = (id, html) => { const n = $(id); n.textContent = html; n.classList.toggle("on", !!html); };
    setD("m-lost-d", P ? deltaHTML(S.lost.p50, P.lost.p50) : "");
    setD("m-ser-d", P ? deltaHTML(S.lost.pOver, P.lost.pOver) : "");
    setD("m-sh-d", P ? deltaHTML(S.pShort, P.pShort) : "");

    $("sim-analysis").innerHTML = analyse(S, P);

    SM.funnel($("sim-funnel"), [
      { label: "Flagged by the rule", sub: "supply with a link at this reach", ...S.flagged, prev: P && P.flagged.p50, color: COL.E3, tip: "Sayari trade data, plus an estimate for the untraced share" },
      { label: "Stopped at the border", sub: "customs stops and inspects", ...S.stopped, prev: P && P.stopped.p50, color: COL.E2, dark: true },
      { label: "Kept out after review", sub: "not released on paperwork", ...S.keptOut, prev: P && P.keptOut.p50, color: COL.E1, dark: true },
      { label: "Lost for good", sub: "after some gets back in", ...S.lost, prev: P && P.lost.p50, color: COL.brick, dark: true },
    ]);

    const cats = [
      { id: "serious", label: `Serious disruption: more than ${X}% of supply lost`, color: COL.brick, share: S.cats.serious },
      { id: "short", label: "A shortage, but a smaller loss", color: COL.accent, share: S.cats.shortOnly },
      { id: "absorbed", label: "Some supply lost; stock and new suppliers cover it", color: COL.E3, share: S.cats.absorbed },
      { id: "ok", label: "Little or no effect (under 1% lost)", color: "#ffffff", share: S.cats.none },
    ];
    const n = SM.futures($("sim-futures"), cats);
    $("sim-futures-legend").innerHTML = cats.map((c, i) => `<span><i class="${c.id === "ok" ? "outline" : ""}" style="background:${c.color}"></i><b>${n[i]}</b>&nbsp;${esc(c.label)}</span>`).join("");

    const hi = Math.max(SM.quantile(S.lostArr, 0.995), P ? SM.quantile(P.lostArr, 0.995) : 0, X * 1.25);
    SM.distChart($("sim-dist"), S.lostArr, P && P.lostArr !== S.lostArr ? P.lostArr : null, { threshold: X, xMax: Math.min(100, SM.niceMax(hi)) });

    const yTop = Math.max(...S.reach.map((r) => r.p95), X * 1.15);
    SM.reachChart($("sim-reach"), TH.map((t, i) => ({ short: t.short, ...S.reach[i], sel: i === S.j, t })), {
      threshold: X, yMax: Math.min(100, SM.niceMax(yTop * 1.1)),
      tip: (p) => `<b>${esc(p.t.label)}</b><br>Rule flags ${L3ok ? pct(flaggedAt[TH.indexOf(p.t)], 0) : "—"} of shipments<br>Typical loss ${p.p50.toFixed(1)}% (9 in 10 futures: ${p.p5.toFixed(1)}–${p.p95.toFixed(1)}%)<br>Serious disruption in ${p.pOver.toFixed(0)}% of futures`,
      onPick: (i) => { sim.reach = i; sim.preset = null; renderControls(); compute(); },
    });

    if (S.sens) {
      SM.tornado($("sim-tornado"), S.sens.rows.map((r) => ({ ...r, label: INP[r.id].label })), S.sens.base, {
        tip: (r) => `<b>${esc(INP[r.id].label)}</b><br>At the low end (${fmtVal(r.id, r.p10)}): typical loss ${r.lo.toFixed(1)}%<br>At the high end (${fmtVal(r.id, r.p90)}): typical loss ${r.hi.toFixed(1)}%`,
      });
    } else {
      $("sim-tornado").innerHTML = `<div class="pending" style="min-height:120px"><div><strong>Nothing to test at this reach</strong>The rule flags no shipments, so no input changes the result. Pick a reach further back.</div></div>`;
    }
    renderSimDetails();
  }

  const INSIGHT = {
    release: (v) => v.release >= 0.6
      ? "In other words, <b>how much paperwork customs accepts matters more than how far back the rule looks.</b> Today most stopped solar shipments are released, so a deeper rule with the same release rate mostly creates delays, not lost supply."
      : "In other words, <b>how much paperwork customs accepts matters more than how far back the rule looks.</b> At a release rate this low, most of what customs stops stays out.",
    p_enf: () => "That depends on <b>customs’ staff, data and priorities</b> as much as on the wording of the rule.",
    reroute: () => "So <b>leakage matters most</b>: if blocked goods can come back in through other countries or suppliers, a tougher rule achieves less.",
    hidden: () => "So <b>better data on the supply nobody can trace</b> would narrow the result down more than anything else.",
    buffer: () => "Stock on hand <b>decides whether a loss turns into a shortage</b>.",
    ramp: () => "So <b>how soon replacement suppliers can start shipping</b> is the key unknown.",
    capacity: () => "So <b>how fast replacement suppliers can scale up</b> is the key unknown.",
  };
  function analyse(S, P) {
    const th = TH[S.j], v = S.vals, X = S.X, L = S.lost;
    const fullF = L3ok ? flaggedAt[TH.length - 1] : null;
    const out = [];
    if (S.flagged.p50 < 0.5) {
      out.push(`<p class="takeaway">At this reach the rule sees nothing, so nothing is lost. That doesn’t mean the supply is clean.</p>`);
      out.push(`<p>With customs checking ${esc(th.plain)}, Sayari’s records show no US solar shipments from suppliers the rule would flag. Every one of the 10,000 simulated futures ends the same way: no supply lost and no shortage.</p>`);
      if (fullF) out.push(`<p>Yet <b>${pct(fullF, 0)}</b> of the same shipments come from suppliers with a link further up the supply chain. This is the shadow market: supply the law is meant to cover, but which a rule that only checks direct suppliers never reaches. Try <b>Look further back</b> or <b>Look everywhere</b> to see what reaching it would cost.</p>`);
    } else {
      let take;
      if (L.pOver >= 50) take = `A serious shock. In most futures, the US loses more than ${X}% of its solar supply.`;
      else if (L.pOver >= 10) take = `A real risk of serious disruption: about ${Math.round(L.pOver / 10)} in 10 futures lose more than ${X}% of supply.`;
      else if (S.pShort >= 50) take = `Supply gets tight. Most futures see a shortage, though rarely a serious loss.`;
      else if (S.flagged.p50 >= 20 && L.p50 < S.flagged.p50 / 3) take = `The rule flags a lot (${f1(S.flagged.p50)}% of supply), but the US loses far less: about ${f1(L.p50)}%.`;
      else take = `The US loses about ${f1(L.p50)}% of its solar supply, and copes.`;
      out.push(`<p class="takeaway">${take}</p>`);
      out.push(`<p><b>What happens.</b> With customs checking ${esc(th.plain)}, the rule flags about <b>${f1(S.flagged.p50)}%</b> of US solar cell and panel supply. Customs stops ${f1(S.stopped.p50)}%. Because about ${fmtVal("release", v.release)} of stopped shipments are released once importers show paperwork, only ${f1(S.keptOut.p50)}% is kept out. Some of that gets back in another way, so a typical future loses <b>${f1(L.p50)}%</b> of US supply for good (between ${f1(L.p5)}% and ${f1(L.p95)}% in 9 out of 10 futures).</p>`);
      if (S.pShort < 0.5) out.push(`<p><b>Can the US cope?</b> Yes, in almost every future. The stock already in the country (about ${fmtVal("buffer", v.buffer)} of demand) lasts until replacement suppliers catch up, so the loss never becomes a shortage. ${L.pOver > 0 ? `Even so, ${f1(L.pOver)}% of futures cross your ${X}% line for a serious disruption.` : ""}</p>`);
      else out.push(`<p><b>Can the US cope?</b> ${S.pShort >= 50 ? "Often not." : "Usually."} In <b>${f1(S.pShort)}%</b> of futures, stock runs out before replacement suppliers catch up. When that happens, the shortage lasts about <b>${f1(S.durMed)} months</b>${S.durP95 > S.durMed + 1 ? `, and up to ${f1(S.durP95)} months in the worst 1 in 20` : ""}. ${L.pOver >= 1 ? `${f1(L.pOver)}% of futures cross your ${X}% line for a serious disruption.` : ""}</p>`);
      if (S.sens && S.sens.rows.length) {
        const t = S.sens.rows[0];
        out.push(`<p><b>What matters most.</b> The result depends most on <b>${esc(INP[t.id].label.toLowerCase())}</b>: moving it from the low to the high end of its range changes the typical loss by about ${f1(Math.abs(t.hi - t.lo))} points. ${INSIGHT[t.id] ? INSIGHT[t.id](v) : ""}</p>`);
      }
      const today = S.reach[CUR_T], full = S.reach[TH.length - 1];
      const cmp = [];
      if (S.j !== CUR_T) cmp.push(`a rule at today’s reach loses ${f1(today.p50)}% of supply`);
      if (S.j !== TH.length - 1) cmp.push(`a rule that counts every link loses ${f1(full.p50)}%`);
      if (cmp.length) out.push(`<p><b>For comparison.</b> With the same assumptions, ${cmp.join(", and ")}.</p>`);
    }
    if (P && (P.j !== S.j || JSON.stringify(P.vals) !== JSON.stringify(S.vals) || P.X !== S.X)) {
      const dl = L.p50 - P.lost.p50, ds = L.pOver - P.lost.pOver;
      out.push(`<p><b>Compared with your last setting:</b> the typical loss ${Math.abs(dl) < 0.1 ? `stayed at ${f1(L.p50)}%` : `went ${dl > 0 ? "up" : "down"} from ${f1(P.lost.p50)}% to ${f1(L.p50)}%`}, and the chance of a serious disruption ${Math.abs(ds) < 0.5 ? `stayed at ${Math.round(L.pOver)}%` : `went ${ds > 0 ? "up" : "down"} from ${Math.round(P.lost.pOver)}% to ${Math.round(L.pOver)}%`}.</p>`);
    }
    const nPlace = SIM.inputs.filter((i) => sim.status[i.id].status === "placeholder").length;
    out.push(`<p class="caveat">This is a what-if, not a forecast. The flagged shares come from Sayari trade records${L2.summary.release_rate ? " and the release rate from US Customs data" : ""}; ${nPlace} of the other inputs are placeholder ranges that still need sources (marked on each slider). Released shipments can still sit at the border for weeks or months, which this model doesn’t count, and it says nothing about prices.</p>`);
    return `<h4>What this means</h4>` + out.join("");
  }

  function renderSimDetails() {
    $("sim-seed").textContent = SIM.seed;
    $("sim-runs").textContent = int(SIM.runs);
    $("sim-model").innerHTML = SIM.model.map((m) => `<li>${esc(m)}</li>`).join("");
    const rowsF = TH.map((t, i) => `<tr><td><b>Flagged share · ${esc(t.label)}</b></td><td>${L3ok ? pct(flaggedAt[i], 1) : "placeholder"}</td><td class="small">fixed</td><td><span class="badge ${L3ok ? "ok" : "pend"}">${L3ok ? "from Sayari" : "placeholder"}</span></td><td class="small">${L3ok ? `Share of US cell + module shipments (730 days to ${esc(D.snapshot || "")}) from exporters flagged at ${esc(t.combo.replace(/\|/g, " · "))}.` : "Waits on Layer 3."}</td></tr>`);
    const rowsI = SIM.inputs.map((i) => { const d = SM.distOf(i, sim.vals[i.id]), st = sim.status[i.id]; return `<tr><td><b>${esc(i.label)}</b><div class="small">${esc(i.question)}</div></td><td>${fmtVal(i.id, sim.vals[i.id])}</td><td class="small">${fmtVal(i.id, d.lo)}–${fmtVal(i.id, d.hi)}</td><td><span class="badge ${st.status === "placeholder" ? "pend" : "ok"}">${esc(STATUS_LABEL[st.status] || st.status)}</span></td><td class="small" style="max-width:380px">${esc(st.source)}</td></tr>`; });
    $("sim-inputs").innerHTML = `<thead><tr><th>Input</th><th>Value</th><th>Range across futures</th><th>Status</th><th>Source</th></tr></thead><tbody>${rowsF.join("")}${rowsI.join("")}</tbody>`;
  }

  function initSim() {
    simDefaults();
    applyPreset("today");
    renderControls();
  }
  function runSim() { if (!sim.cur) compute(); else renderSim(); }

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
      ["M6a", "Simulation", "built; flagged shares from Sayari, release rate from CBP, other inputs are placeholders"],
      ["M7", "Validation (§8) and independent review of named companies / intent claims", "first pass done; independent review outstanding"],
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
          <li><b>Flagged share</b>: flagged ÷ total US ${MV} (cells + modules, 730-day window).${BYSHIP ? " Sayari\u2019s US import records are bills of lading with weight but no declared value, so the measure is shipment records, not dollars." : ""}</li>
          <li><b>Tolerated exposure</b>: Layer 3 exposed value − Layer 2 stopped value. CBP doesn't report solar, so the Layer 2 basis is HTS 8541 where captured, otherwise Electronics (both upper bounds). The windows differ (Sayari 730 days, CBP since June 2022).</li>
          <li><b>Suppliers left with no link</b>: traced exporters with no flag under the current settings.</li>
          <li><b>Concentration (HHI)</b>: Herfindahl–Hirschman Index (0–10,000) of the supply that remains, by exporter and by country. Under 1,500 is spread out, over 2,500 is highly concentrated.</li>
          <li><b>Jump</b> (spec: “cliff”): one step at least ×${R.cliff_rule.min_ratio} flagged supply <i>and</i> +${R.cliff_rule.min_share_pp} percentage points of the market.</li>
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
