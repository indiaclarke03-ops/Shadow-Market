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
    product: R.dials.product_check.default,
    activeDial: "tier_depth",
    evDial: "all",
    simT: 1,
    simX: D.simulation.significant_gap_pct,
  };
  const comboKey = (t = state.tier, s = state.scope, o = state.own) => `${t}|${s}|${o}`;
  const DEFAULT_COMBO = `${R.dials.tier_depth.default}|${R.dials.trigger_scope.default}|${R.dials.ownership_reach.default}`;
  const FULL_COMBO = "E3|research|one_hop";
  const L3ok = L3.status === "ok";
  // Product check (DECISIONS #26): "on" uses flags with thin-film makers set aside; "off" uses Sayari flags as given
  const C = (key, product = state.product) => (product === "off" && L3.combos_unadjusted && L3.combos_unadjusted[key]) || L3.combos[key];
  const OBS = L3ok ? L3.combos.observed : null;
  const shareOf = (m, basis = state.basis) => (basis === "count" ? m.exposed_count_share : basis === "weight" ? m.exposed_weight_share : m.exposed_share);
  const HAS_W = L3ok && L3.weight && L3.weight.status === "ok";
  const techShare = (t) => (L3ok ? L3.exporters.filter((e) => e.technology === t).reduce((a, e) => a + e.value, 0) / L3.total_value * 100 : 0);
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
    for (const f of (state.product === "off" ? ex.flags_all || ex.flags : ex.flags)) {
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
    if (state.product === "on" && ex.product_relevant === false) return "thinfilm";
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
    { id: "thinfilm", label: "Not the polysilicon route: thin film or LED (set aside by the product check)", color: "#cfdaea" },
    { id: "clean", label: "No link found", color: COL.clean },
    { id: "untraced", label: "Can’t be traced", color: COL.untraced },
  ];
  const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
  const LEVEL_CONF = Object.fromEntries(R.exposure_levels.map((l) => [l.id, l.confidence]));
  const PLAIN = {
    tier_depth: { label: "How far back to look", question: "How many steps up the supply chain does the rule check?", positions: { E0: "Blacklisted companies only", E1: "Direct suppliers", E2: "2–3 steps back", E3: "Up to 4 steps back" } },
    trigger_scope: { label: "Who counts as a red flag", question: "Which companies trigger the rule?", positions: { entity_list: "US blacklist only", xinjiang: "+ any Xinjiang company", research: "+ companies named by researchers" } },
    ownership_reach: { label: "Do shared owners count?", question: "Flag a supplier that shares an owner with a blacklisted company?", positions: { off: "No", one_hop: "Yes" } },
    product_check: { label: "Product check", question: "First Solar makes thin-film panels with no polysilicon, the main route for Xinjiang risk in solar. Set its links aside?", positions: { on: "Set thin film aside", off: "Count every flag" } },
    value_basis: { label: "Measure by", question: "Count shipments, estimated tonnes, or companies?", positions: { value: "Shipments", weight: "Est. weight", count: "Exporters" } },
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
      const full = L3.combos[FULL_COMBO], fullRaw = L3.combos_unadjusted[FULL_COMBO];
      $("hero-lede").innerHTML = `The US bans goods made with forced labour in Xinjiang, China. Trace the solar cells and panels shipped to America back through their supply chains, and <b>${pct(full.exposed_share, 0)}</b> of shipments come from suppliers with a link to forced-labour risk. US customs has publicly detained or refused shipments from the company groups behind <b>${pct(OBS.exposed_share, 0)}</b>. That leaves <b>${pct(full.not_detained_share, 0)}</b> linked, from companies with no public detention on record.`;
      $("hero-check").innerHTML = `These figures set aside First Solar’s thin-film panels (${pct(techShare("thin_film_cdte"), 0)} of shipments), which use no polysilicon, and LED modules declared as solar (${pct(techShare("led_not_pv"), 1)}). Count every Sayari flag as given and ${pct(fullRaw.exposed_share, 0)} are linked.`;
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
      const b = h("div", { style: "position:fixed;left:0;right:0;bottom:0;z-index:99;background:#9b2f26;color:#fff;text-align:center;padding:8px;font-weight:600" }, "TEST FIXTURE: synthetic exporters for layout testing only. Not real data.");
      document.body.appendChild(b);
    }
  }

  /* ---------------------------------------------------------------- landing preview + supply chain map */
  const CTY = { VNM: "Vietnam", IND: "India", IDN: "Indonesia", MYS: "Malaysia", KOR: "South Korea", SGP: "Singapore", CHN: "China", THA: "Thailand", KHM: "Cambodia", MEX: "Mexico", ETH: "Ethiopia", TUR: "Türkiye", LAO: "Laos", USA: "United States", DEU: "Germany", JPN: "Japan", TWN: "Taiwan", PHL: "Philippines", CAN: "Canada" };
  let MAP = null, LAND = null;
  function mapTip(n) {
    const e = n.e, G = SM.MAP_GROUPS.find((g) => g.id === n.g);
    const link = n.linked ? `Sayari records a link to forced-labour risk: <b>${esc(G.label.toLowerCase())}</b> (${esc(G.sub)})`
      : n.g === "aside" ? `Links set aside: ${esc((L3.product_notes || {})[e.technology] || "the product uses no polysilicon")}`
      : n.g === "untraced" ? "Can’t be traced upstream: shipped through a freight forwarder" : "No link found in the Sayari data";
    const act = e.detained_group ? `<br>Customs action on record: <b>${esc(e.detained_group)}</b> group${e.detained_cases && e.detained_cases.length ? ` (${esc(e.detained_cases.join(", "))})` : ""}` : n.linked ? "<br>No public customs detention on record" : "";
    return `<b>${esc(e.name)}</b><br>${esc(CTY[e.country] || e.country)} · ${int(e.shipments)} shipments (${n.share < 0.1 ? "<0.1" : n.share.toFixed(1)}% of US supply)<br>${link}${e.confidence && n.linked ? `<br>Confidence: <b>${esc(e.confidence)}</b>` : ""}${act}<div class="t-src">Sayari trade records and risk factors${e.sayari_entity_id ? ` · entity ${esc(e.sayari_entity_id)}` : ""}. A link is a supply chain connection, not proof that a product contains forced labour.</div>`;
  }
  function countUp(el, to, fmt, dur = 1400) {
    const t0 = performance.now(), reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = (t) => { const k = reduced ? 1 : Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.innerHTML = fmt(to * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function initLanding() {
    if (!L3ok || MAP) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    MAP = SM.SupplyMap($("map-host"), D, { reduced, height: (w) => (w < 560 ? 270 : Math.round(Math.min(430, Math.max(320, w * 0.34)))) });
    MAP.onHover(mapTip);
    const sh = MAP.shares(CUR_T), aside = techShare("thin_film_cdte") + techShare("led_not_pv");
    const big = (v, l) => `<b>${v}</b><span>${l}</span>`;
    const P0 = (v) => Math.round(v) + "%";
    const scenes = [
      { t: 0, cap: "Every circle is a company that shipped solar cells or panels to the US in the last two years, sized by its shipments.",
        go: () => { MAP.layout("cloud").state({ mode: "plain", reach: null }).scatter(); countUp($("cap-num"), L3.exporter_count, (v) => big(int(v), `exporters · ${int(L3.total_value)} shipments`)); } },
      { t: 5500, cap: "US customs has publicly detained or refused solar shipments from the company groups behind the circles now lit up.",
        go: () => { MAP.state({ mode: "detained" }); countUp($("cap-num"), sh.detained, (v) => big(P0(v), "of shipments: customs has acted")); } },
      { t: 11000, cap: "The biggest circles are First Solar. Its thin-film panels use no polysilicon, so their links are set aside.",
        go: () => { MAP.state({ mode: "aside" }); countUp($("cap-num"), aside, (v) => big(P0(v), "of shipments set aside")); } },
      { t: 16000, cap: "Now follow every supply chain back. Orange circles have a link to forced-labour risk further up the chain.",
        go: () => { MAP.layout("groups").state({ mode: "shadow", reach: CUR_T }); countUp($("cap-num"), sh.linked, (v) => big(P0(v), "of shipments linked"), 2600); } },
      { t: 22500, cap: `Customs has acted on ${P0(sh.caught)}. The other ${P0(sh.unseen)} is linked, from companies with no public detention on record.`,
        go: () => { countUp($("cap-num"), sh.unseen, (v) => `<b class="amber">${P0(v)}</b><span>the shadow market</span>`); } },
      { t: 27500, final: true, cap: "Choose what the rule checks and watch what it catches. Hover over any circle for the company, its link and the source.",
        go: () => showMapControls() },
    ];
    const DUR = 30000;
    LAND = { el: 0, playing: false, last: 0, i: -1 };
    const setScene = (i) => {
      LAND.i = i; const sc = scenes[i];
      $("cap-k").textContent = sc.final ? "Explore the map" : `${i + 1} / ${scenes.length - 1}`;
      const c = $("cap-text"); c.classList.remove("in"); void c.offsetWidth; c.textContent = sc.cap; c.classList.add("in");
      sc.go();
    };
    const tick = (now) => {
      if (!LAND.playing) return;
      LAND.el += now - LAND.last; LAND.last = now;
      $("stage-prog").style.width = Math.min(100, (LAND.el / DUR) * 100) + "%";
      while (LAND.i + 1 < scenes.length && LAND.el >= scenes[LAND.i + 1].t) setScene(LAND.i + 1);
      if (LAND.el < DUR) requestAnimationFrame(tick); else { LAND.playing = false; $("stage-pause").textContent = "Play"; }
    };
    LAND.play = () => { if (LAND.el >= DUR) LAND.restart(); LAND.playing = true; LAND.last = performance.now(); $("stage-pause").textContent = "Pause"; requestAnimationFrame(tick); };
    LAND.pause = () => { LAND.playing = false; $("stage-pause").textContent = "Play"; };
    LAND.restart = () => { LAND.el = 0; LAND.i = -1; $("map-ctl").hidden = true; $("stage").classList.remove("done"); $("cap-num").innerHTML = ""; LAND.playing = true; LAND.last = performance.now(); $("stage-pause").textContent = "Pause"; requestAnimationFrame(tick); };
    LAND.skip = () => { LAND.playing = false; LAND.el = DUR; $("stage-prog").style.width = "100%"; MAP.layout("groups"); setScene(scenes.length - 1); $("stage-pause").textContent = "Play"; };
    $("stage-pause").addEventListener("click", () => (LAND.playing ? LAND.pause() : LAND.play()));
    $("stage-replay").addEventListener("click", () => LAND.restart());
    $("stage-skip").addEventListener("click", () => LAND.skip());
    document.addEventListener("visibilitychange", () => { if (document.hidden && LAND.playing) LAND.pause(); });
    if (reduced) LAND.skip(); else LAND.play();
  }
  function showMapControls() {
    $("stage").classList.add("done");
    const box = $("mc-reach");
    if (!box.children.length) {
      box.innerHTML = TH.map((t, i) => `<button type="button" data-r="${i}" aria-pressed="${i === CUR_T}">${esc(t.short)}</button>`).join("");
      box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => setMapReach(+b.dataset.r)));
      $("mc-legend").innerHTML = `<span><i style="background:#8eaad6"></i>Caught by the rule</span><span><i style="background:#c8841a"></i>Linked, not caught</span><span><i style="background:rgba(243,245,249,0.16)"></i>No link found</span><span><i class="dash"></i>Set aside</span><span><i class="ring"></i>Customs action on record</span>`;
    }
    $("map-ctl").hidden = false;
    setMapReach(CUR_T);
  }
  function setMapReach(j) {
    MAP.layout("groups").state({ mode: "shadow", reach: j });
    $("mc-reach").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.r === j)));
    const s = MAP.shares(j);
    $("mc-caught").textContent = Math.round(s.caught) + "%";
    $("mc-unseen").textContent = Math.round(s.unseen) + "%";
    $("cap-text").textContent = `${TH[j].label}: the rule catches ${Math.round(s.caught)}% of US solar shipments. Orange marks the ${Math.round(s.unseen)}% linked to forced-labour risk but not caught.`;
    $("cap-num").innerHTML = `<b class="amber">${Math.round(s.unseen)}%</b><span>linked, not caught</span>`;
  }

  /* ---------------------------------------------------------------- findings */
  function renderFindings() {
    if (!L3ok) { $("findings").style.display = "none"; return; }
    const full = L3.combos[FULL_COMBO], raw = L3.combos_unadjusted[FULL_COMBO];
    const direct = L3.combos[DEFAULT_COMBO], deep = L3.combos["E2|xinjiang|off"];
    // two quick scenario runs at default assumptions, so the finding stays in step with the simulation page
    const S = D.simulation, rr = L2.summary.release_rate;
    const run = (preset) => {
      const pr = S.presets.find((p) => p.id === preset), vals = {};
      S.inputs.forEach((i) => (vals[i.id] = i.centre));
      if (rr) vals.release = Math.round(rr.value * 200) / 200;
      Object.assign(vals, pr.set || {});
      const inputs = {}; S.inputs.forEach((i) => (inputs[i.id] = SM.distOf(i, vals[i.id])));
      const j = S.thresholds.findIndex((t) => t.id === pr.reach);
      const res = SM.simulate({ seed: S.seed, runs: 4000, flagged: S.thresholds.map((t) => L3.combos[t.combo].exposed_share), traced: L3.traced_share, inputs, rho: S.copula_rho_hidden_rerouting });
      return SM.summarise(res.lost[j], S.significant_gap_pct);
    };
    const ev = run("everything"), st = run("strict"), td = run("today");
    renderPlayBand({ today: td, everything: ev, strict: st });
    const items = [
      [pct(full.exposed_share, 0), `of US solar cell and panel shipments come from suppliers with a <b>link to forced-labour risk</b> somewhere upstream: on the US blacklist, in Xinjiang, or named by independent researchers.`, "#layers", "See the three readings"],
      [pct(full.not_detained_share, 0), `are linked but come from companies with <b>no public detention on record</b>. Customs has publicly acted against the groups behind ${pct(OBS.exposed_share, 0)} of shipments (${L3.detained_groups.length} groups). This is the shadow market.`, "#dials-section", "Move the line"],
      [`${pct(direct.exposed_share, 0)} → ${pct(deep.exposed_share, 0)}`, `The links sit <b>2–3 steps back</b>, at the polysilicon and wafer stage. A check of direct suppliers alone flags ${pct(direct.exposed_share, 0)}; one step further flags ${pct(deep.exposed_share, 0)}.`, "#curve-panel", "See the jump"],
      [pct(techShare("thin_film_cdte"), 0), `of shipments are First Solar’s <b>thin-film panels</b>, which use no polysilicon. Sayari links them to forced-labour risk anyway. Counted as given, the linked share would be ${pct(raw.exposed_share, 0)}, so <b>product-level checks matter</b> as much as company links.`, "#companies", "See the companies"],
      [`${f1x(ev.p50)}% vs ${f1x(st.p50)}%`, `<b>Paperwork decides the outcome.</b> Customs releases ${rr ? pct(rr.value * 100, 0) : "most"} of the solar-and-chips value it stops. Enforcing at every link at today’s release rate removes about ${f1x(ev.p50)}% of supply in a typical simulated future; if customs rarely accepted the paperwork, about ${f1x(st.p50)}%.`, "#simulation?preset=strict", "Run the scenarios"],
    ];
    FIND = { items, ev, st, full, direct, deep };
    $("find-list").innerHTML = items.map(([n, t, href, cta]) => `<li><span class="num">${n}</span><p>${t}</p><a href="${href}">${cta} →</a></li>`).join("");
  }
  const f1x = (v) => (v > 0 && v < 10 ? v.toFixed(1) : v.toFixed(0));
  // home page: three scenarios, each one tap from playing out
  function renderPlayBand(R3) {
    const S = D.simulation, blurb = { today: "Customs acts on the companies it has stopped before.", everything: "Every link the data can see counts.", strict: "Every link counts, and customs rarely accepts the paperwork." };
    $("pi-band-cards").innerHTML = ["today", "everything", "strict"].map((id) => {
      const pr = S.presets.find((p) => p.id === id), r = R3[id];
      return `<button type="button" class="pi-card ${id}" data-p="${id}"><span class="k">${esc(pr.label)}</span><span class="b">${esc(blurb[id])}</span><b>${f1x(r.p50)}%</b><span class="l">of US solar supply lost for good, in a typical future</span><span class="go"><span aria-hidden="true">▶</span> Play it out</span></button>`;
    }).join("");
    $("pi-band-cards").querySelectorAll(".pi-card").forEach((b) => b.addEventListener("click", () => { SM.simApi.ensure(); SM.simApi.preset(b.dataset.p); SM.playFocus(); }));
  }
  let FIND = null;

  /* ---------------------------------------------------------------- one-screen brief */
  let briefMap = null;
  function renderBrief() {
    if (!L3ok || !FIND) return;
    const { full, ev, st } = FIND, rr = L2.summary.release_rate;
    $("brief-lede").innerHTML = `The US bans goods made with forced labour in Xinjiang. Trace America’s solar cells and panels back through their supply chains and <b>${pct(full.exposed_share, 0)}</b> of shipments link to forced-labour risk, but customs has publicly acted against the companies behind only <b>${pct(OBS.exposed_share, 0)}</b>. The rest, <b>${pct(full.not_detained_share, 0)}</b>, is the shadow market.`;
    const nums = [
      [pct(full.exposed_share, 0), "of US solar shipments link to forced-labour risk upstream", "sky"],
      [pct(OBS.exposed_share, 0), "come from company groups customs has publicly acted against", "sky"],
      [pct(full.not_detained_share, 0), "are linked, with no public detention on record: the shadow market", "amber"],
      [`${f1x(ev.p50)}% → ${f1x(st.p50)}%`, `of supply lost if customs enforced every link: at today’s paperwork release rate (${rr ? pct(rr.value * 100, 0) : "most"}), then if it rarely accepted the paperwork`, "brick"],
    ];
    $("brief-nums").innerHTML = nums.map(([n, t, c]) => `<li class="${c}"><b>${n}</b><span>${t}</span></li>`).join("");
    const tools = [
      ["#explorer", "The gap", "Where is the shadow market?", "A map of all 792 exporters, by how far back their link sits."],
      ["#simulation", "Play it out", "What happens, month by month, if customs looks further?", "Watch shipments stopped, held, released or kept out, and US stock run down. 10,000 futures behind it."],
      ["#goal", "What would it take?", "Which rules reach a goal without a shortage?", "Searches over 6,000 combinations of the settings a government controls."],
      ["#stress", "What could break it?", "What would have to be true for it to fail?", "A reverse stress test: from the failure back to its likely causes."],
      ["#proposed", "New rules", "What would a rule on AI data-centre optics do?", "Tests a reported rule before it exists."],
    ];
    $("brief-tools").innerHTML = tools.map(([h, k, q, d]) => `<a href="${h}"><span class="k">${k}</span><b>${q}</b><span>${d}</span><i aria-hidden="true">→</i></a>`).join("");
    $("brief-caveats").innerHTML = [
      "A link is a supply chain connection in Sayari’s records, not proof that a product contains forced labour.",
      `“No public detention on record” is an upper bound: customs doesn’t name most detained importers.`,
      "Simulations are what-ifs over stated assumptions, not forecasts. Every input shows whether it is sourced or a placeholder.",
      "The optics case runs on a reported rule with no official text, and illustrative supply shares.",
    ].map((t) => `<li>${t}</li>`).join("");
    $("brief-cite").innerHTML = `The Shadow Market (${esc(D.built)}). Data: Sayari trade and company records (snapshot ${esc(D.snapshot || "")}), US Customs and Border Protection UFLPA statistics, and the public sources listed on the Method page. ${esc(location.href.split("#")[0])}`;
    if (!briefMap) {
      briefMap = SM.SupplyMap($("brief-map"), D, { reduced: true, height: (w) => (w < 560 ? 240 : 300) });
      briefMap.onHover(mapTip);
    }
    briefMap.layout("groups").state({ mode: "shadow", reach: CUR_T }).redraw();
    const s2 = briefMap.shares(CUR_T);
    $("brief-map-cap").innerHTML = `<b>Each circle is an exporter</b>, sized by US shipments and grouped by how far back its link sits. <span class="cap-sky">Blue</span>: customs has acted (${Math.round(s2.caught)}%). <span class="cap-amber">Orange</span>: linked, not caught (${Math.round(s2.unseen)}%).`;
  }

  /* ---------------------------------------------------------------- three layers */
  function renderReadings() {
    if (!L3ok) { $("readings").style.display = "none"; return; }
    const full = L3.combos[FULL_COMBO], acted = full.exposed_share - full.not_detained_share;
    const W = (v) => Math.max(0.6, Math.min(100, v)) + "%";
    $("readings").innerHTML = `<div class="panel-title"><h4>Share of US solar shipments each reading reaches</h4><span class="small">0–100% of ${int(L3.total_value)} shipments</span></div>
      <div class="rd">
        <div class="rd-row"><div class="rd-l"><b>On paper</b><span>what the law covers</span></div><div class="rd-t"><i class="paper" style="width:100%"></i><em>every link, however far back: no limit</em></div></div>
        <div class="rd-row"><div class="rd-l"><b>With full visibility</b><span>linked to forced-labour risk</span></div><div class="rd-t"><i class="sky" style="width:${W(acted)}"></i><i class="amber" style="left:${W(acted)};width:${W(full.not_detained_share)}"></i><em style="left:calc(${W(full.exposed_share)} + 10px)">${pct(full.exposed_share, 0)}</em></div></div>
        <div class="rd-row"><div class="rd-l"><b>In practice</b><span>groups customs has acted against</span></div><div class="rd-t"><i class="sky" style="width:${W(OBS.exposed_share)}"></i><em style="left:calc(${W(OBS.exposed_share)} + 10px)">${pct(OBS.exposed_share, 0)}</em></div></div>
        <div class="rd-gap" style="--a:${acted};--w:${full.not_detained_share}"><span class="long">the shadow market: ${pct(full.not_detained_share, 0)} linked, no public detention on record</span><span class="short">shadow market: ${pct(full.not_detained_share, 0)}</span></div>
        <div class="rd-axis">${[0, 25, 50, 75, 100].map((v) => `<span style="left:${v}%">${v}%</span>`).join("")}</div>
      </div>`;
  }
  function renderLayers() {
    renderReadings();
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
      ${OBS ? `<p style="margin:8px 0 0">Named cases cover ${L3.detained_groups.length} company groups (${esc(L3.detained_groups.join(", "))}). In the Sayari data, those groups account for <b>${pct(OBS.exposed_share, 0)}</b> of US solar shipments.</p>` : ""}
      <p style="margin:8px 0 0">${(L2.cases || []).length} public solar cases are listed further down.</p></div>
      <div class="foot">${basis ? `<div class="big" data-src="${esc(basis.stopped.source_id)}" data-title="Stopped" data-body="${esc(int(basis.stopped.shipments) + " shipments · " + (basis.stopped.period || "") + (basis.stopped.notes ? " · " + basis.stopped.notes : ""))}" data-conf="high">${usd(basis.stopped.value_usd)}</div><p class="small" style="margin:6px 0 0">stopped, ${esc(basis.stopped.period || "").replace("..", " to ")}</p>` : `<div class="big">Pending</div><p class="small">CBP statistics not yet captured.</p>`}</div>`;

    foldLayers();
    if (L3ok) {
      const full = L3.combos[FULL_COMBO], fullRaw = L3.combos_unadjusted[FULL_COMBO];
      $("layer3").innerHTML = `
        <div class="tag">3 · With full visibility</div>
        <h3 class="display">What the law could catch</h3>
        <div class="body">The same test, applied to every step of the supply chain that Sayari’s trade and company records can see. ${int(L3.exporter_count)} exporters sent ${int(L3.total_value)} shipments of solar cells and panels to the US over two years, and ${pct(L3.traced_share, 0)} of them can be traced upstream.${BYSHIP ? " (US shipping records give weight, not value, so we count shipments.)" : ""}</div>
        <div class="foot"><div class="big">${pct(full.exposed_share, 0)}</div><p class="small" style="margin:6px 0 0">of shipments have a supply chain link to forced-labour risk when every link counts (${pct(fullRaw.exposed_share, 0)} including thin-film panels, which use no polysilicon). Only ${pct(OBS.exposed_share, 0)} come from company groups customs has publicly acted against.</p></div>`;
      foldLayers();
    } else {
      $("layer3").innerHTML = `
        <div class="tag">3 · With full visibility</div>
        <h3 class="display">What the law could catch</h3>
        <div class="body">The same test applied through every step Sayari’s trade and ownership records can see.</div>
        <div class="foot"><span class="badge pend">Awaiting Sayari snapshot</span></div>`;
    }
  }

  // each reading card: tag, title, the number, and the explanation folded away
  function foldLayers() {
    ["layer1", "layer2", "layer3"].forEach((id) => {
      const el = $(id), body = el.querySelector(":scope > .body"), foot = el.querySelector(":scope > .foot");
      if (!body || !foot || el.querySelector(":scope > details")) return;
      const d = document.createElement("details"); d.className = "layer-more";
      d.innerHTML = "<summary>How this is measured</summary>";
      d.appendChild(body); el.insertBefore(foot, null); el.appendChild(d);
    });
  }

  /* ---------------------------------------------------------------- dials */
  const DIAL_STATE = { tier_depth: "tier", trigger_scope: "scope", ownership_reach: "own", product_check: "product", value_basis: "basis" };
  function renderDials() {
    const wrap = $("dials");
    wrap.innerHTML = "";
    for (const [id, dial] of Object.entries(R.dials)) {
      const key = DIAL_STATE[id];
      const d = h("div", { class: "dial" + (state.activeDial === id ? " active" : ""), "data-dial": id });
      d.innerHTML = `<div class="dial-head"><span class="dial-name">${esc(dialLabel(id))}</span></div><div class="dial-q">${esc((PLAIN[id] || {}).question || dial.question)}</div>`;
      const seg = h("div", { class: "seg", role: "group", "aria-label": dialLabel(id) });
      dial.positions.filter((p) => p.id !== "weight" || HAS_W).forEach((p) => {
        const b = h("button", { type: "button", "aria-pressed": String(state[key] === p.id) }, `${esc(posLabel(id, p.id))}${p.id === dial.default ? '<span class="def">default</span>' : ""}`);
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          state[key] = p.id;
          if (!["value_basis", "product_check"].includes(id)) { state.activeDial = id; state.evDial = id; }
          refreshExplorer();
        });
        seg.appendChild(b);
      });
      d.appendChild(seg);
      d.addEventListener("click", () => { if (!["value_basis", "product_check"].includes(id)) { state.activeDial = id; state.evDial = id; renderDials(); renderEvidence(); } });
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
    const m = C(comboKey());
    const byCount = state.basis === "count", byW = state.basis === "weight";
    const share = shareOf(m);
    const unit = byCount ? "exporters" : byW ? "of estimated tonnes" : "shipments";
    const sub = byCount ? `${int(m.exposed_count)} of ${int(L3.exporter_count)} exporters` : byW ? `share of estimated tonnes (median weight per shipment from Sayari samples × shipments; relative shares only)` : `${int(m.exposed_value)} of ${int(L3.total_value)} shipments`;
    const ms = [
      metric(byCount ? "Exporters with a link" : `US solar ${byW ? "imports by weight" : "shipments"} with a link`, pct(share, 1), sub),
      metric("Linked, but no public detention on record", pct(m.not_detained_share, 1), `of shipments: the shadow market at these settings. Customs has acted against groups behind ${pct(OBS.exposed_share, 0)}.`, "key", `data-src="" data-title="No public detention on record" data-body="Linked at these settings, and not part of a company group named in a public solar detention or denial (${esc(L3.detained_groups.join(", "))}). CBP doesn't name most detained importers, so some of this supply may have been stopped without it being reported."`),
      metric("Suppliers left with no link", int(m.remaining_suppliers), `of ${int(L3.exporter_count)} exporters`),
      metric("How concentrated the rest is, by company", int(m.hhi_exporter_after), `${hhiWord(m.hhi_exporter_after)} · ${int(L3.hhi_exporter_before)} before (HHI, 0–10,000)`, "", `data-src="" data-title="Concentration (HHI)" data-body="Herfindahl–Hirschman Index of the supply left after linked suppliers are removed. Under 1,500 = spread out; 1,500–2,500 = moderate; over 2,500 = high (US merger guidelines). It can fall when one big supplier is removed."`),
      metric("How concentrated the rest is, by country", int(m.hhi_country_after), `${hhiWord(m.hhi_country_after)} · ${int(L3.hhi_country_before)} before`),
      repl,
    ];
    $("readout").innerHTML = ms.slice(0, 3).join("");
    $("readout-more").innerHTML = ms.slice(3).join("");
    bindDeclared($("readout")); bindDeclared($("readout-more"));
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
    const svgF = cont.querySelector("svg");
    if (svgF) svgF.setAttribute("aria-label", "Supply chain flow. " + cols.map((c) => { const tot = c.segments.reduce((x, y) => x + y.value, 0) || 1; return `${c.label}: ` + c.segments.filter((g) => g.value / tot > 0.005).map((g) => `${(CAT[g.cat] || { label: g.cat }).label} ${(g.value / tot * 100).toFixed(0)}%`).join(", "); }).join(". "));
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
      const cr2 = R.cliff_rule;
      const steps = R.dials[dial].positions.map((pos) => {
        const parts = { tier: state.tier, scope: state.scope, own: state.own, [map[dial]]: pos.id };
        const mm = C(`${parts.tier}|${parts.scope}|${parts.own}`);
        return { position: pos.id, label: posLabel(dial, pos.id), y: shareOf(mm), exposed_value: mm.exposed_value, current: state[map[dial]] === pos.id };
      });
      steps.forEach((p, i) => {
        if (!i) return;
        const a = steps[i - 1];
        p.ratio_vs_prev = a.y ? +(p.y / a.y).toFixed(2) : null;
        p.added_pp = +(p.y - a.y).toFixed(1);
        p.cliff = (a.y ? p.y / a.y >= cr2.min_ratio : p.y > 0) && p.y - a.y >= cr2.min_share_pp;
      });
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
      const TL_N = 8, tlAll = state.tlAll;
      tl.innerHTML = EV.timeline.filter((_, i) => tlAll || i >= EV.timeline.length - TL_N).map((t) => {
        const match = state.evDial === "all" || normDial(t.dial) === state.evDial;
        return `<li class="${match ? "" : "dim"}"><span class="d">${esc(t.date)}</span><span class="pip" style="background:${catColor(t.category)}"></span><div><div class="ev">${esc(t.event)}</div><div class="meta"><span>${esc(t.category)}</span><span class="conf ${confClass(t.confidence)}">${esc(t.confidence)}</span><span>${srcLinks(t.source_ids)}</span></div></div></li>`;
      }).join("");
    }
    $("tl-count").textContent = EV.timeline.length ? `${EV.timeline.length} events, 2020–2026` : "";
    if (EV.timeline.length > 8) tl.insertAdjacentHTML("beforeend", `<li class="more-li"><button type="button" class="act" id="tl-more">${state.tlAll ? "Show the latest 8 only" : `Show all ${EV.timeline.length} events`}</button></li>`);
    if ($("tl-more")) $("tl-more").addEventListener("click", () => { state.tlAll = !state.tlAll; renderEvidence(); });

    const claims = EV.claims.filter((c) => state.evDial === "all" || normDial(c.dial) === state.evDial);
    const order = { fact: 0, position: 1, interpretation: 2 };
    claims.sort((a, b) => (order[a.claim_type] ?? 3) - (order[b.claim_type] ?? 3) || ["high", "medium", "low"].indexOf(confClass(a.confidence)) - ["high", "medium", "low"].indexOf(confClass(b.confidence)));
    const CL_N = 5, shown = state.clAll ? claims : claims.slice(0, CL_N);
    $("claims").innerHTML = claims.length ? shown.map((c) => c.held ? `
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
    if (claims.length > CL_N) $("claims").insertAdjacentHTML("beforeend", `<button type="button" class="act more-btn" id="cl-more">${state.clAll ? "Show fewer" : `Show all ${claims.length} claims`}</button>`);
    if ($("cl-more")) $("cl-more").addEventListener("click", () => { state.clAll = !state.clAll; renderEvidence(); });
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
      const allRows = L3.exporters.filter((e) => (e.flags_all || e.flags).length).slice(0, 30), rows = state.coAll ? allRows : allRows.slice(0, 10);
      ce.innerHTML = `<div class="panel-title"><h4>Exporters with a link, by US shipments</h4><span class="small">top ${allRows.length} · the “Under your settings” column follows the choices above</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Exporter</th><th>Country</th><th class="r">${BYSHIP ? "US shipments" : "US import value"}</th><th>Types of link</th><th>Under your settings</th><th>Customs action on record</th><th>Confidence</th><th>Sayari entity</th></tr></thead><tbody>
        ${rows.map((e) => { const c = categoryOf(e); return `<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.country)}</td><td class="r">${BYSHIP ? int(e.value) : usd(e.value)}</td><td>${[...new Set((e.flags_all || e.flags).map((f) => f.level))].sort().map(lvlBadge).join("<br>")}</td><td>${esc(CAT[c].label)}${e.technology ? `<div class="small" style="margin-top:4px"><span data-src="${e.technology === "thin_film_cdte" ? "SI-014;SI-016" : ""}" data-title="Product check" data-body="${esc((L3.product_notes || {})[e.technology] || "")}">${e.technology === "thin_film_cdte" ? "Thin film (CdTe): no polysilicon" : "LED modules, not solar"}</span></div>` : ""}</td><td>${e.detained_group ? `${esc(e.detained_group)}<div class="small">${e.detained_cases.map(esc).join(", ")}</div>` : '<span class="small">none public</span>'}</td><td><span class="conf ${confClass(e.confidence)}">${esc(e.confidence || "—")}</span></td><td class="small"><span title="${esc(e.source_records.join("\n"))}">${e.source_records.length} pull${e.source_records.length === 1 ? "" : "s"}</span><div>${esc(e.sayari_entity_id || "")}</div></td></tr>`; }).join("")}
        </tbody></table></div>${allRows.length > 10 ? `<button type="button" class="act more-btn" id="co-more">${state.coAll ? "Show the top 10 only" : `Show all ${allRows.length} exporters`}</button>` : ""}`;
      if ($("co-more")) $("co-more").addEventListener("click", () => { state.coAll = !state.coAll; renderCompanies(); });
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
  const sim = { reach: CUR_T, vals: {}, status: {}, X: SIM.significant_gap_pct, preset: "today", cur: null, prev: null, product: "on" };
  let flaggedAt = [];
  const setFlagged = () => { flaggedAt = TH.map((t) => (L3ok ? C(t.combo, sim.product).exposed_share : (([lo, mode, hi]) => ({ type: "triangular", lo, mode, hi }))(SIM.step_increments_placeholder[t.id]))); };
  setFlagged();
  const f1 = (v) => (v > 0 && v < 10 ? v.toFixed(1) : v.toFixed(0));
  const fmtVal = (id, v) => {
    const u = INP[id].unit;
    if (u === "share") return Math.round(v * 100) + "%";
    if (u === "times") return v.toFixed(1) + "×";
    if (u === "months") return (v % 1 ? v.toFixed(1) : v) + (v === 1 ? " month" : " months");
    if (u === "pp") return v.toFixed(1) + "% / mo";
    return String(v);
  };
  const STATUS_LABEL = { placeholder: "placeholder", from_layer2: "from CBP data", from_layer3: "from Sayari", sourced: "sourced", user: "your setting", preset: "scenario setting", sourced_estimate: "estimate from sources" };

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
    $("sim-presets").innerHTML = SIM.presets.map((p, i) => `<button type="button" class="preset" data-p="${p.id}" aria-pressed="${sim.preset === p.id}"><span class="k">${i + 1}</span><b>${esc(p.label)}</b><span>${esc(p.blurb)}</span></button>`).join("");
    $("sim-presets").querySelectorAll(".preset").forEach((b) => b.addEventListener("click", () => { applyPreset(b.dataset.p); renderControls(); compute(); }));
  }
  function sliderHTML(id) {
    const i = INP[id], v = sim.vals[id], d = SM.distOf(i, v), st = sim.status[id];
    return `<div class="ctl" data-ctl="${id}">
      <label for="in-${id}">${esc(i.label)}</label>
      <div class="q">${esc(i.question)}</div>
      <div class="row"><input type="range" id="in-${id}" min="${i.min}" max="${i.max}" step="${i.step}" value="${v}" style="--p:${((v - i.min) / (i.max - i.min)) * 100}%"><span class="val" id="val-${id}">${fmtVal(id, v)}</span></div>
      <div class="meta"><span id="rng-${id}">varies ${fmtVal(id, d.lo)}–${fmtVal(id, d.hi)}</span><span class="badge ${st.status === "placeholder" ? "pend" : "ok"}" data-src="${esc((INP[id].source_ids || []).join(";"))}" data-title="${esc(STATUS_LABEL[st.status] || st.status)}" data-body="${esc(st.source)}">${esc(STATUS_LABEL[st.status] || st.status)}</span></div>
    </div>`;
  }
  function renderControls() {
    renderPresets();
    const reach = TH.map((t, i) => `<button type="button" data-r="${i}" aria-pressed="${sim.reach === i}"><span>${esc(t.label)}</span><span class="f">${L3ok ? pct(flaggedAt[i], 0) + " flagged" : ""}</span></button>`).join("");
    $("sim-controls").innerHTML = `
      <div class="ctl-group"><p class="kicker">The rule</p>
        <div class="ctl"><label>How far back does customs look?</label><div class="q">Customs blocks shipments when it finds a link to forced-labour risk this far up the supply chain. The % is the share of US solar shipments the rule would flag (Sayari data).</div>
        <div class="reach-list" role="group" aria-label="Reach">${reach}</div></div></div>
      <div class="ctl-group"><p class="kicker">Enforcement</p>${["p_enf", "release", "detention", "reroute"].map(sliderHTML).join("")}</div>
      <div class="ctl-group"><p class="kicker">The market’s cushion</p>${["buffer", "ramp", "capacity"].map(sliderHTML).join("")}</div>
      <div class="ctl-group"><p class="kicker">Unknowns and the line</p>${sliderHTML("hidden")}
        <div class="ctl"><label>Count thin-film panels’ links?</label><div class="q">First Solar’s panels use no polysilicon. By default their Sayari links are set aside.</div>
        <div class="seg" id="sim-product" role="group" aria-label="Product check"><button type="button" data-v="on" aria-pressed="${sim.product === "on"}">Set aside</button><button type="button" data-v="off" aria-pressed="${sim.product === "off"}">Count them</button></div></div>
        <div class="ctl"><label for="in-X">What counts as a serious disruption?</label><div class="q">Losing more than this share of US solar supply.</div>
        <div class="row"><input type="range" id="in-X" min="5" max="50" step="1" value="${sim.X}" style="--p:${((sim.X - 5) / 45) * 100}%"><span class="val" id="val-X">${sim.X}%</span></div></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" id="sim-reset" style="color:var(--on-dark)">Reset to defaults</button><button type="button" class="btn" id="sim-copy" style="color:var(--on-dark)">Copy link to this scenario</button></div>`;
    $("sim-controls").querySelectorAll(".reach-list button").forEach((b) => b.addEventListener("click", () => { sim.reach = +b.dataset.r; sim.preset = null; renderControls(); compute(); }));
    SIM.inputs.forEach((i) => {
      const el = $("in-" + i.id);
      el.addEventListener("input", () => {
        sim.vals[i.id] = +el.value; sim.preset = null;
        el.style.setProperty("--p", ((+el.value - i.min) / (i.max - i.min)) * 100 + "%");
        sim.status[i.id] = { status: "user", source: `You changed this. Default: ${fmtVal(i.id, sim.base[i.id])}. ${i.source}` };
        const d = SM.distOf(i, +el.value);
        $("val-" + i.id).textContent = fmtVal(i.id, +el.value);
        $("rng-" + i.id).textContent = `varies ${fmtVal(i.id, d.lo)}–${fmtVal(i.id, d.hi)}`;
        $("sim-presets").querySelectorAll(".preset").forEach((b) => b.setAttribute("aria-pressed", "false"));
        schedulePreview();
      });
      el.addEventListener("change", () => {
        compute(); const b = el.closest(".ctl").querySelector(".badge"); b.className = "badge ok"; b.textContent = "your setting"; b.dataset.title = "your setting"; b.dataset.body = sim.status[i.id].source; });
    });
    $("sim-product").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { sim.product = b.dataset.v; sim.preset = null; setFlagged(); renderControls(); compute(); }));
    const x = $("in-X");
    x.addEventListener("input", () => { sim.X = +x.value; x.style.setProperty("--p", ((+x.value - 5) / 45) * 100 + "%"); $("val-X").textContent = x.value + "%"; schedulePreview(); });
    x.addEventListener("change", () => compute());
    $("sim-copy").addEventListener("click", () => {
      const url = location.href.split("#")[0] + simHash();
      const done = () => { $("sim-copy").textContent = "Link copied"; setTimeout(() => ($("sim-copy").textContent = "Copy link to this scenario"), 1600); };
      try { navigator.clipboard.writeText(url).then(done, () => prompt("Copy this link", url)); } catch (e) { prompt("Copy this link", url); }
    });
    $("sim-reset").addEventListener("click", () => { sim.product = "on"; setFlagged(); applyPreset("today"); renderControls(); compute(); });
    bindDeclared($("sim-controls"));
  }

  // Smooth sliders: while dragging, a 2,000-future preview runs once per frame (about 1 ms) and only the fast
  // charts redraw; letting go runs the full 10,000 futures plus the sensitivity test.
  let previewRaf = 0;
  function schedulePreview() { if (!previewRaf) previewRaf = requestAnimationFrame(() => { previewRaf = 0; compute(true); }); }
  function scheduleCompute() { compute(); }
  function compute(quick) {
    const cfg = simCfg(); if (quick) cfg.runs = 2000;
    const res = SM.simulate(cfg), X = sim.X, j = sim.reach;
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
    S.sens = quick ? (sim.cur && sim.cur.j === j ? sim.cur.sens : null) : S.flagged.p50 > 0.5 ? SM.sensitivity({ ...cfg, seed: SIM.seed + 1 }, j) : null;
    S.lostArr = res.lost[j];
    S.ratio = Float64Array.from(res.lost[j], (v, r) => (res.flagged[TH.length - 1][r] > 0 ? (v / res.flagged[TH.length - 1][r]) * 100 : 0));
    S.keep = SM.quantile(S.ratio, 0.5);
    S.j = j; S.X = X; S.vals = { ...sim.vals }; S.preset = sim.preset; S.product = sim.product; S.quick = !!quick;
    // "your last setting" = the settings before this drag started
    if (quick) { if (!sim.dragBase) sim.dragBase = sim.cur; sim.prev = sim.dragBase; }
    else { sim.prev = sim.dragBase || sim.cur; sim.dragBase = null; }
    sim.cur = S;
    renderSim(quick);
    if (quick) return;
    if (SM.playRefresh) SM.playRefresh();
    try { if ((location.hash || "").startsWith("#simulation")) history.replaceState(null, "", simHash()); } catch (e) { /* file:// or sandbox */ }
  }

  function tween(el, to, fmt) {
    const from = +(el.dataset.v ?? to);
    el.dataset.v = to;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || Math.abs(from - to) < 0.05) { el.innerHTML = fmt(to); return; }
    const t0 = performance.now(), dur = 420;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.innerHTML = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function deltaHTML(cur, prev, unit = " pts", vs = " vs your last setting") {
    if (prev == null) return "";
    const d = cur - prev;
    if (Math.abs(d) < 0.1) return "";
    return `${d > 0 ? "▲ +" : "▼ −"}${f1(Math.abs(d))}${unit}${vs}`;
  }

  // Supply flow: tween from what is on screen to the new values, redrawing in place each frame.
  let flowShown = null, flowRaf = 0;
  function flowScale() { return Math.max(10, ...flaggedAt.map((x) => (typeof x === "number" ? x : x.hi || 0))) * 1.15; }
  function animateFlow(to, range, cmp) {
    const el = $("sim-flow"), scale = flowScale();
    cancelAnimationFrame(flowRaf);
    const from = flowShown && el._flow && el.querySelector("svg") ? flowShown : null;
    if (!from || matchMedia("(prefers-reduced-motion: reduce)").matches) { flowShown = to; SM.flow(el, to, { scale, range, cmp }); return; }
    const t0 = performance.now(), dur = 520;
    const step = (t) => {
      const q = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - q, 3), cur = {};
      for (const k in to) cur[k] = from[k] + (to[k] - from[k]) * e;
      flowShown = cur; SM.flow(el, cur, { scale, range, cmp });
      if (q < 1) flowRaf = requestAnimationFrame(step);
    };
    flowRaf = requestAnimationFrame(step);
  }

  // Live bar: the three headline numbers, pinned to the bottom of the screen whenever the dashboard is out of view.
  function renderLive(S) {
    $("lv-lost").textContent = f1(S.lost.p50) + "%";
    $("lv-ser").textContent = Math.round(S.lost.pOver) + "%";
    $("lv-sh").textContent = (S.pShort > 0 && S.pShort < 1 ? "<1" : Math.round(S.pShort)) + "%";
    $("lv-ser").classList.toggle("bad", S.lost.pOver >= 50);
    $("lv-sh").classList.toggle("bad", S.pShort >= 50);
    const pr = SIM.presets.find((p) => p.id === S.preset);
    $("lv-take").textContent = `${pr ? pr.label : "Your own scenario"} · ${TH[S.j].label}`;
    syncLive();
  }
  function syncLive() {
    const bar = $("sim-live"), r = $("sim-readout").getBoundingClientRect();
    const st = $("pi-host").getBoundingClientRect(), stageOn = st.top < innerHeight - 140 && st.bottom > 160; // keep the stage clear
    const on = $("view-simulation").classList.contains("on") && !stageOn && (r.bottom < 70 || r.top > innerHeight - 40);
    bar.classList.toggle("on", on); bar.setAttribute("aria-hidden", on ? "false" : "true");
  }
  let liveRaf = 0;
  window.addEventListener("scroll", () => { if (!liveRaf) liveRaf = requestAnimationFrame(() => { liveRaf = 0; if (sim.cur) syncLive(); }); }, { passive: true });
  document.addEventListener("click", (e) => { if (e.target && e.target.id === "lv-up") $("sim-dash").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); });

  /* ---- compare: pin the current scenario as A, keep changing B ---- */
  const scenLabel = (S) => { const pr = SIM.presets.find((p) => p.id === S.preset); return pr ? pr.label : "Your own scenario"; };
  function diffList(a, b) {
    const out = [];
    if (a.j !== b.j) out.push(`How far back: ${TH[a.j].short} → ${TH[b.j].short}`);
    SIM.inputs.forEach((i) => { if (Math.abs(a.vals[i.id] - b.vals[i.id]) > 1e-9) out.push(`${i.label}: ${fmtVal(i.id, a.vals[i.id])} → ${fmtVal(i.id, b.vals[i.id])}`); });
    if (a.product !== b.product) out.push(`Thin-film links: ${a.product === "on" ? "set aside" : "counted"} → ${b.product === "on" ? "set aside" : "counted"}`);
    if (a.X !== b.X) out.push(`Serious-disruption line: ${a.X}% → ${b.X}%`);
    return out;
  }
  function renderCompare() {
    const box = $("sim-compare"), A = sim.A, S = sim.cur, pin = $("act-pin");
    pin.textContent = A ? "Stop comparing" : "Compare: pin this as A";
    pin.classList.toggle("on", !!A);
    if (!A) { box.hidden = true; return; }
    box.hidden = false;
    const chg = (a, b, pts) => { const d = b - a; return Math.abs(d) < (pts ? 0.5 : 0.1) ? `<span class="same">same</span>` : `<span class="${d > 0 ? "up" : "down"}">${d > 0 ? "▲ +" : "▼ −"}${pts ? Math.round(Math.abs(d)) : f1(Math.abs(d))} pts</span>`; };
    const rows = [
      ["Supply lost for good", f1(A.S.lost.p50) + "%", f1(S.lost.p50) + "%", chg(A.S.lost.p50, S.lost.p50)],
      ["Chance of a serious disruption", Math.round(A.S.lost.pOver) + "%", Math.round(S.lost.pOver) + "%", chg(A.S.lost.pOver, S.lost.pOver, true)],
      ["Chance of a shortage", Math.round(A.S.pShort) + "%", Math.round(S.pShort) + "%", chg(A.S.pShort, S.pShort, true)],
      ["Linked supply kept out for good", Math.round(A.S.keep) + "%", Math.round(S.keep) + "%", chg(A.S.keep, S.keep, true)],
    ];
    const d = diffList(A.S, S);
    box.innerHTML = `<div class="cmp-h"><span class="abtag a">A</span><b>${esc(A.label)}</b><span class="vs">against</span><span class="abtag b">B</span><b>Now: ${esc(scenLabel(S))}</b></div>
      <table class="cmp-t"><thead><tr><th></th><th><span class="abtag a">A</span></th><th><span class="abtag b">B</span></th><th>Change</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td><b>${r[2]}</b></td><td>${r[3]}</td></tr>`).join("")}</tbody></table>
      <p class="cmp-d">${d.length ? `<b>What’s different:</b> ${d.map(esc).join(" · ")}` : "B is the same as A. Change any setting or pick a scenario to compare."}</p>`;
  }
  function pinToggle() {
    if (sim.A) sim.A = null; else sim.A = { S: sim.cur, label: scenLabel(sim.cur) };
    renderSim();
  }

  function renderSim(quick) {
    const S = sim.cur, X = S.X, th = TH[S.j], A = sim.A;
    const P = A ? A.S : sim.prev;
    const pr = SIM.presets.find((p) => p.id === S.preset);
    $("sim-head").innerHTML = `<b>${pr ? esc(pr.label) : "Your own scenario"}.</b> Customs blocks solar shipments ${esc(th.plain)}.`;

    // headline numbers
    if (!$("m-lost")) {
      $("sim-readout").innerHTML = `
        <div class="metric key" id="m-lost-box"><div class="lbl">US solar supply lost for good, in a typical future</div><div class="num" id="m-lost"></div><div class="gauge" id="g-lost"><span class="rng"></span><i></i><em></em></div><div class="sub" id="m-lost-s"></div><span class="delta" id="m-lost-d"></span></div>
        <div class="metric" id="m-ser-box"><div class="lbl">Chance of a serious disruption</div><div class="num" id="m-ser"></div><div class="gauge" id="g-ser"><i></i></div><div class="sub" id="m-ser-s"></div><span class="delta" id="m-ser-d"></span></div>
        <div class="metric" id="m-sh-box"><div class="lbl">Chance of a shortage</div><div class="num" id="m-sh"></div><div class="gauge" id="g-sh"><i></i></div><div class="sub" id="m-sh-s"></div><span class="delta" id="m-sh-d"></span></div>`;
    }
    const tw = quick ? (el, to, fmt) => { el.dataset.v = to; el.innerHTML = fmt(to); } : tween;
    tw($("m-lost"), S.lost.p50, (v) => f1(v) + "%");
    $("m-lost-s").textContent = S.lost.p95 > 0.05 ? `9 in 10 futures: ${f1(S.lost.p5)}–${f1(S.lost.p95)}%` : "none in any future";
    tw($("m-ser"), S.lost.pOver, (v) => Math.round(v) + "%");
    $("m-ser-s").textContent = `futures where more than ${X}% of supply is lost`;
    $("m-ser-box").classList.toggle("bad", S.lost.pOver >= 50);
    tw($("m-sh"), S.pShort, (v) => (v > 0 && v < 1 ? "<1" : Math.round(v)) + "%");
    $("m-sh-s").textContent = S.pShort > 0 ? `when stock runs out before new suppliers arrive, it lasts about ${f1(S.durMed)} months` : "stock covers the gap in every future";
    $("m-sh-box").classList.toggle("bad", S.pShort >= 50);
    const setD = (id, html) => { const n = $(id); n.textContent = html; n.classList.toggle("on", !!html); };
    const vs = A ? " vs A" : " vs your last setting";
    setD("m-lost-d", P ? deltaHTML(S.lost.p50, P.lost.p50, " pts", vs) : "");
    setD("m-ser-d", P ? deltaHTML(S.lost.pOver, P.lost.pOver, " pts", vs) : "");
    setD("m-sh-d", P ? deltaHTML(S.pShort, P.pShort, " pts", vs) : "");
    // gauges: loss on a 0..2×line scale with the serious-disruption line marked; chances on 0..100
    const gMax = Math.max(X * 2, SM.niceMax(S.lost.p95 * 1.1));
    const gl = $("g-lost"), gp = (v) => Math.max(0, Math.min(100, (v / gMax) * 100)) + "%";
    gl.querySelector("i").style.width = gp(S.lost.p50);
    gl.querySelector(".rng").style.left = gp(S.lost.p5); gl.querySelector(".rng").style.width = `calc(${gp(S.lost.p95)} - ${gp(S.lost.p5)})`;
    const em = gl.querySelector("em"); em.style.left = gp(X); em.dataset.l = `${X}% line`;
    $("g-ser").querySelector("i").style.width = Math.min(100, S.lost.pOver) + "%";
    $("g-sh").querySelector("i").style.width = Math.min(100, S.pShort) + "%";
    $("m-lost-box").classList.toggle("bad", S.lost.p50 > X);
    renderLive(S);

    $("sim-analysis").innerHTML = analyse(S, A ? null : P);
    renderCompare();

    const fv = { F: S.flagged.p50, S: S.stopped.p50, K: S.keptOut.p50, L: S.lost.p50 }, frange = S.lost.p95 > 0.05 ? `9 in 10 futures: ${f1(S.lost.p5)}–${f1(S.lost.p95)}%` : "none in any future";
    const fcmp = A ? { F: A.S.flagged.p50, S: A.S.stopped.p50, K: A.S.keptOut.p50, L: A.S.lost.p50 } : null;
    if (quick) { cancelAnimationFrame(flowRaf); flowShown = fv; SM.flow($("sim-flow"), fv, { scale: flowScale(), range: frange, cmp: fcmp }); }
    else animateFlow(fv, frange, fcmp);

    const cats = [
      { id: "serious", label: `Serious disruption: more than ${X}% of supply lost`, color: COL.brick, share: S.cats.serious },
      { id: "short", label: "A shortage, but a smaller loss", color: COL.accent, share: S.cats.shortOnly },
      { id: "absorbed", label: "Some supply lost; stock and new suppliers cover it", color: COL.E3, share: S.cats.absorbed },
      { id: "ok", label: "Little or no effect (under 1% lost)", color: "#ffffff", share: S.cats.none },
    ];
    const n = SM.futures($("sim-futures"), cats);
    $("sim-futures-legend").innerHTML = cats.map((c, i) => `<span><i class="${c.id === "ok" ? "outline" : ""}" style="background:${c.color}"></i><b>${n[i]}</b>&nbsp;${esc(c.label)}</span>`).join("");

    const hi = Math.max(SM.quantile(S.lostArr, 0.995), P ? SM.quantile(P.lostArr, 0.995) : 0, X * 1.25);
    SM.distChart($("sim-dist"), S.lostArr, P && P.lostArr !== S.lostArr ? P.lostArr : null, { threshold: X, xMax: Math.min(100, SM.niceMax(hi)), height: 196 });

    const yTop = Math.max(...S.reach.map((r) => r.p95), X * 1.15);
    SM.reachChart($("sim-reach"), TH.map((t, i) => ({ short: t.short, ...S.reach[i], sel: i === S.j, t })), {
      threshold: X, yMax: Math.min(100, SM.niceMax(yTop * 1.1)),
      tip: (p) => `<b>${esc(p.t.label)}</b><br>Rule flags ${L3ok ? pct(flaggedAt[TH.indexOf(p.t)], 0) : "—"} of shipments<br>Typical loss ${p.p50.toFixed(1)}% (9 in 10 futures: ${p.p5.toFixed(1)}–${p.p95.toFixed(1)}%)<br>Serious disruption in ${p.pOver.toFixed(0)}% of futures`,
      onPick: (i) => { sim.reach = i; sim.preset = null; renderControls(); compute(); },
    });

    $("sim-dist-note").innerHTML = A ? `<span class="mark-prev dash"></span> outline = scenario A` : `<span class="mark-prev dash"></span> your last setting`;
    if (quick) return;
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
    detention: () => "So <b>how long customs takes to review stopped shipments</b> matters most: while they wait at the border, stock has to cover the gap.",
  };
  function analyse(S, P) {
    const th = TH[S.j], v = S.vals, X = S.X, L = S.lost;
    const fullF = L3ok ? flaggedAt[TH.length - 1] : null;
    const out = [];
    if (S.flagged.p50 < 0.5) {
      out.push(`<p class="takeaway">At this reach the rule sees nothing, so nothing is lost. That doesn’t mean the supply is clean.</p>`);
      out.push(`<p>With customs blocking shipments ${esc(th.plain)}, Sayari’s records show no US solar shipments from suppliers the rule would flag. Every one of the 10,000 simulated futures ends the same way: no supply lost and no shortage.</p>`);
      if (fullF) out.push(`<p>Yet <b>${pct(fullF, 0)}</b> of the same shipments come from suppliers with a link further up the supply chain. This is the shadow market: supply the law is meant to cover, but which a rule that only checks direct suppliers never reaches. Try <b>Look further back</b> or <b>Look everywhere</b> to see what reaching it would cost.</p>`);
    } else {
      let take;
      if (L.pOver >= 50) take = `A serious shock. In most futures, the US loses more than ${X}% of its solar supply.`;
      else if (L.pOver >= 10) take = `A real risk of serious disruption: about ${Math.round(L.pOver / 10)} in 10 futures lose more than ${X}% of supply.`;
      else if (S.pShort >= 50) take = `Supply gets tight. Most futures see a shortage, though rarely a serious loss.`;
      else if (S.flagged.p50 >= 20 && L.p50 < S.flagged.p50 / 3) take = `The rule flags a lot (${f1(S.flagged.p50)}% of supply), but the US loses far less: about ${f1(L.p50)}%.`;
      else take = `The US loses about ${f1(L.p50)}% of its solar supply, and copes.`;
      out.push(`<p class="takeaway">${take}</p>`);
      out.push(`<p><b>What happens.</b> With customs blocking shipments ${esc(th.plain)}, the rule flags about <b>${f1(S.flagged.p50)}%</b> of US solar cell and panel supply. Customs stops ${f1(S.stopped.p50)}%. Because about ${fmtVal("release", v.release)} of stopped shipments are released once importers show paperwork, only ${f1(S.keptOut.p50)}% is kept out. Some of that gets back in another way, so a typical future loses <b>${f1(L.p50)}%</b> of US supply for good (between ${f1(L.p5)}% and ${f1(L.p95)}% in 9 out of 10 futures).</p>`);
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
    out.push(`<p class="caveat">This is a what-if, not a forecast. The flagged shares come from Sayari trade records${L2.summary.release_rate ? " and the release rate from US Customs data" : ""}; ${nPlace ? `${nPlace} input${nPlace > 1 ? "s are" : " is a"} placeholder${nPlace > 1 ? "s" : ""} still needing a source, and the rest are estimates from cited sources (marked on each slider)` : "the other inputs are estimates from cited sources (marked on each slider)"}. Shortage months include time stopped shipments wait at the border; the model says nothing about prices.</p>`);
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

  // Shareable scenarios: #simulation?preset=strict or #simulation?r=T5&release=0.25&X=20&product=off
  function readSimHash() {
    const qs = new URLSearchParams((location.hash.split("?")[1]) || "");
    if (!qs.toString()) return false;
    if (qs.get("preset") && SIM.presets.some((p) => p.id === qs.get("preset"))) applyPreset(qs.get("preset"));
    if (qs.get("product")) { sim.product = qs.get("product") === "off" ? "off" : "on"; setFlagged(); }
    const r = TH.findIndex((t) => t.id === qs.get("r"));
    if (r >= 0) { sim.reach = r; sim.preset = qs.get("preset") || null; }
    SIM.inputs.forEach((i) => { const v = parseFloat(qs.get(i.id)); if (!isNaN(v)) { sim.vals[i.id] = Math.min(i.max, Math.max(i.min, v)); sim.status[i.id] = { status: "user", source: `Set by the link. Default: ${fmtVal(i.id, sim.base[i.id])}. ${i.source}` }; sim.preset = null; } });
    const X = parseFloat(qs.get("X")); if (!isNaN(X)) sim.X = Math.min(50, Math.max(5, X));
    return true;
  }
  function simHash() {
    const qs = new URLSearchParams();
    if (sim.preset) qs.set("preset", sim.preset);
    else {
      qs.set("r", TH[sim.reach].id);
      SIM.inputs.forEach((i) => { if (Math.abs(sim.vals[i.id] - sim.base[i.id]) > 1e-9) qs.set(i.id, +sim.vals[i.id].toFixed(3)); });
    }
    if (sim.X !== SIM.significant_gap_pct) qs.set("X", sim.X);
    if (sim.product !== "on") qs.set("product", sim.product);
    return "#simulation?" + qs.toString();
  }
  function initSim() {
    simDefaults();
    applyPreset("today");
    readSimHash();
    renderControls();
    $("act-pin").addEventListener("click", pinToggle);
    $("act-play").addEventListener("click", () => SM.playFocus && SM.playFocus());
    $("pi-results").addEventListener("click", (e) => { e.preventDefault(); $("sim-dash").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); });
    const story = () => SM.startStory && SM.startStory();
    $("act-story").addEventListener("click", story);
    $("hero-story").addEventListener("click", story);
  }
  function playData() {
    const S = sim.cur;
    return { label: scenLabel(S), preset: S.preset, j: S.j, reach: TH[S.j].label, short: TH[S.j].short, plain: TH[S.j].plain, vals: { ...S.vals }, F: S.flagged.p50, S: S.stopped.p50, K: S.keptOut.p50, L: S.lost.p50, pShort: S.pShort, pSer: S.lost.pOver, durMed: S.durMed, X: S.X };
  }
  // for story.js, goal.js and play.js
  SM.simApi = {
    SIM, TH, INP, CUR_T, fmtVal, L3ok, sim,
    flaggedAt: () => flaggedAt, traced: () => (L3ok ? L3.traced_share : 100),
    ensure: () => { if (!simInited) { initSim(); simInited = true; } if (!sim.cur) compute(); },
    preset: (id) => { applyPreset(id); renderControls(); compute(); },
    set: (o) => {
      if (o.preset) applyPreset(o.preset);
      if (o.reach != null) { sim.reach = o.reach; sim.preset = null; }
      if (o.vals) { Object.entries(o.vals).forEach(([k, v]) => { sim.vals[k] = v; sim.status[k] = { status: "user", source: `You changed this. Default: ${fmtVal(k, sim.base[k])}. ${INP[k].source}` }; }); sim.preset = o.preset || null; }
      renderControls(); compute();
    },
    data: () => playData(),
    cfg: () => simCfg(), reach: () => sim.reach, X: () => sim.X, label: () => (sim.cur ? scenLabel(sim.cur) : "Today’s enforcement"),
    cur: () => sim.cur, pin: (on) => { if (!!sim.A !== !!on) pinToggle(); }, play: () => SM.playFocus && SM.playFocus(),
    hash: (o) => { const qs = new URLSearchParams(); qs.set("r", TH[o.reach].id); Object.entries(o.vals || {}).forEach(([k, v]) => qs.set(k, +(+v).toFixed(3))); return "#simulation?" + qs.toString(); },
  };
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
      <div class="panel" style="grid-column:1/-1"><h3 class="display" style="margin-bottom:18px">About this tool</h3>
        <p><b>The Shadow Market</b> measures the gap between what a supply chain law is meant to cover and what it reaches in practice. Case 1 is the US Uyghur Forced Labor Prevention Act and US imports of solar cells and panels. It combines three things: the law and official guidance, US Customs (CBP) enforcement statistics and public cases, and Sayari’s trade and company records traced upstream. It is an independent research and teaching project by India Clarke (Beyond the Brand). It isn’t funded by, or acting for, any company or government named on it.</p>
        <p><b>What it is not:</b> an accusation, a forecast, or legal advice. A “link” is a supply chain connection found in trade or company records, not proof that a product contains forced labour.</p>
        <p><b>How to cite:</b> Clarke, I. (2026). <i>The Shadow Market: UFLPA × US solar PV</i>, version ${esc(D.built)}, data as of ${esc(D.snapshot || "")}. https://indiaclarke03-ops.github.io/Shadow-Market/site/</p>
        <p><b>Download the data:</b> <a href="../data/derived/exporters.csv">exporters (Sayari roll-up)</a> · <a href="../data/derived/named_companies.csv">named-company review sheet</a> · <a href="../data/derived/shipment_samples.csv">shipment samples</a> · <a href="../data/derived/metrics.json">all derived metrics (JSON)</a> · <a href="../data/cbp_uflpa_stats.csv">CBP statistics</a> · <a href="../data/cases.csv">public cases</a> · <a href="../data/evidence/sources.csv">source register</a> · <a href="../data/evidence/claims.csv">claims</a> · <a href="../pipeline/sim_inputs.json">simulation inputs</a> · <a href="../DECISIONS.md">every judgement call (DECISIONS.md)</a></p></div>

      <div class="panel" style="grid-column:1/-1"><h3 class="display" style="margin-bottom:18px">Naming companies: review status</h3>
        <p>Companies are named only with how they are linked, how confident we are, and the source records. The review sheet lists every exporter named on the page, with its links, the product check, and any customs action on record.</p>
        <table class="tbl status-tbl"><tbody>
          <tr><td>Language check</td><td><span class="badge ok">done</span> No page text says a company “uses” forced labour. Links are described as “linked to” or “exposure”.</td></tr>
          <tr><td>Product check</td><td><span class="badge ok">done</span> Thin-film (First Solar) and LED shipments declared as solar are set aside by default. Both views are shown.</td></tr>
          <tr><td>Source spot checks</td><td><span class="badge ok">first pass</span> Six exporters checked against live Sayari profiles: five matched exactly (pipeline/notes/layer3_validation.md).</td></tr>
          <tr><td>Independent review</td><td><span class="badge pend">outstanding</span> A second reviewer, ideally with legal advice, should check each named company before public presentation.</td></tr>
          <tr><td>Right of reply</td><td><span class="badge pend">outstanding</span> The largest named exporters have not yet been invited to comment. Responses will be published here alongside the data.</td></tr>
        </tbody></table></div>

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
          <li><b>Product check</b>: exporters whose product doesn’t follow the polysilicon route (First Solar’s CdTe thin film; LED modules declared as solar) are set aside by default. Their Sayari links are still shown with the check off.</li>
          <li><b>No public detention on record</b>: linked, and not part of one of the ${L3ok ? L3.detained_groups.length : 7} company groups named in public solar detentions or denials. CBP doesn’t name most detained importers, so this is an upper bound on what enforcement has missed.</li>
          <li><b>Estimated weight</b>: shipments × the median weight per shipment from Sayari samples of the 30 largest exporters (pooled median for the rest). Weights repeat across bill-of-lading lines, so only relative shares are shown, never tonnes.</li>
        </ul></div>

      <div class="panel"><h3 class="display" style="margin-bottom:18px">Known limits</h3>
        <ul>
          <li><b>Trade data coverage is uneven.</b> US import records are strong; many producer-country records are partial or absent. “No exposure found” can mean “no data”.</li>
          <li><b>Company-level links ≠ product-level content.</b> A firm that buys Xinjiang polysilicon and sells wafers doesn't prove a particular shipment contained it.</li>
          <li><b>Entity resolution is imperfect.</b> Name matching across languages and registries introduces false positives and negatives.</li>
          <li><b>Recent activity bias.</b> Sayari's trade risk factors cover the last 730 days of trade activity only.</li>
          <li><b>Not an accusation engine, not a forecast, not proof of intent.</b> Price effects are out of scope for v1.</li>
        </ul></div>

      <div class="panel" style="grid-column:1/-1"><h3 class="display" style="margin-bottom:18px">Proposed rule (Case 2)</h3>
        <ul>
          <li><b>The core rule doesn’t exist yet.</b> Generation threshold, exemption and trigger come from press and analyst reporting (Reuters; Morgan Stanley notes via Economic Daily News and Commercial Times; Cignal AI; Counterpoint). The FCC hasn’t published a threat determination or draft text.</li>
          <li><b>Supply shares are illustrative</b> until replaced with student analysis. Public figures are revenue-based global market estimates, which differ by source (InnoLight 27% vs 34%, on different measures) and aren’t US-specific.</li>
          <li><b>US BOM share is unknown.</b> No public teardown data was used. The exemption is the most assumption-sensitive part of the model; see “What matters most”.</li>
          <li><b>Manufacturing location ≠ ownership.</b> The entity/origin distinction drives much of the result, and the reported rule doesn’t yet settle it.</li>
          <li><b>Price and delay are indices and orders of magnitude</b>, not forecasts. <b>Design considerations are questions, not advice.</b></li>
          <li><b>Neutral by design.</b> Stakeholder positions are attributed. The tool doesn’t assess whether the rule is warranted. Corrections to the original brief (dates, attributions, unsupported claims) are logged in DECISIONS.md.</li>
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
  let simInited = false, piMounted = false, lastView = null;
  function route() {
    const v = (location.hash || "#explorer").slice(1).split("?")[0];
    const view = ["explorer", "simulation", "goal", "stress", "proposed", "method", "brief"].includes(v) ? v : "explorer";
    const group = ["simulation", "goal", "stress"].includes(view) ? "test" : view;
    document.querySelectorAll(".view").forEach((n) => n.classList.toggle("on", n.id === "view-" + view));
    document.querySelectorAll(".tabs a, .brief-btn").forEach((a) => (a.dataset.group === group ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    $("subnav").hidden = group !== "test";
    document.body.classList.toggle("has-subnav", group === "test");
    $("subnav").querySelectorAll("a").forEach((a) => (a.dataset.view === view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    document.querySelector(".nav").classList.remove("open"); $("menu-btn").setAttribute("aria-expanded", "false");
    if (sim.cur) syncLive();
    // charts drawn while a page was hidden have the wrong width: clear them so they redraw at the real size
    if (lastView !== view && ["simulation", "proposed"].includes(view)) document.querySelectorAll(`#view-${view} .sim-results svg, #view-${view} .pr-gap-grid svg`).forEach((n) => n.remove());
    lastView = view;
    if (view === "simulation") {
      if (!simInited) { initSim(); simInited = true; }
      if (SM.playInline && !piMounted) { piMounted = true; setTimeout(() => SM.playInline($("pi-host")), 0); }
      else if (readSimHash()) { renderControls(); compute(); return; }
      runSim();
    }
    if (view === "explorer") { renderFlow(); renderCurves(); renderEnf(); initLanding(); if (MAP) MAP.redraw(); }
    if (view === "goal" && SM.renderGoal) SM.renderGoal();
    if (view === "stress" && SM.renderStress) SM.renderStress();
    if (view === "brief") renderBrief();
    if (SM.storyRoute) SM.storyRoute(view);
    if (view === "proposed" && SM.renderProposed) { SM.renderProposed(); SM.renderProposed(true); }
    if (["simulation", "goal", "stress", "proposed", "method", "brief"].includes(v) || v === "explorer" || !v) window.scrollTo(0, 0);
  }

  // numbered step bar (gap page): smooth jumps and highlight the section in view
  function setupGapSteps() {
    const links = [...$("gap-steps").querySelectorAll("a")];
    links.forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); const t = $(a.dataset.s); if (t) scrollTo({ top: t.getBoundingClientRect().top + scrollY - 108, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }));
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => a.classList.toggle("on", a.dataset.s === en.target.id));
      const a = links.find((x) => x.dataset.s === en.target.id), bar = a && a.parentElement;
      if (bar && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: Math.max(0, a.offsetLeft - 16), behavior: "smooth" });
    }), { rootMargin: "-45% 0px -50% 0px" });
    links.forEach((a) => { const t = $(a.dataset.s); if (t) io.observe(t); });
  }
  setupGapSteps();
  renderHero(); renderFindings(); renderLayers(); renderDials(); renderReadout(); renderEvidence(); renderCompanies(); renderMethod();
  bindDeclared();
  window.addEventListener("hashchange", route);
  $("brief-print").addEventListener("click", () => window.print());
  $("menu-btn").addEventListener("click", () => { const n = document.querySelector(".nav"), o = !n.classList.contains("open"); n.classList.toggle("open", o); $("menu-btn").setAttribute("aria-expanded", String(o)); });
  route();
  let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { document.querySelectorAll(".view.on svg").forEach((n) => n.remove()); // old widths would hold containers open
    const v = (location.hash || "#explorer").slice(1).split("?")[0]; if (v === "simulation") runSim(); else if (v === "goal") { if (SM.renderGoal) SM.renderGoal(true); } else if (v === "stress") { if (SM.renderStress) SM.renderStress(true); } else if (v === "brief") { renderBrief(); } else if (v === "proposed") { if (SM.renderProposed) SM.renderProposed(true); } else { renderFlow(); renderCurves(); renderEnf(); } }, 150); });
})();
