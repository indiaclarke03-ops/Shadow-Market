/* The Shadow Market: "What would it take?" goal finder.
   Works backwards: simulates every combination of the settings a government controls (reach, share of flagged
   shipments stopped, share released on paperwork, stock built up, help for new suppliers), once, with common
   random numbers, then keeps the combinations that meet the user's goal. Inputs the government does not control
   stay at the simulator's estimates. Goal metric: the share of all linked supply (every link the data can see)
   that is lost to the US market for good, per simulated future, median across futures. */
(function () {
  const SM = (window.SM = window.SM || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => SM.esc(s);
  const RUNS = 3000;

  let A = null, G = null;

  const LEVERS = [
    { id: "reach", label: "How far back customs looks", hint: "from blacklist only to every link" },
    { id: "p_enf", label: "How many flagged shipments customs stops", hint: "30% to 100%" },
    { id: "release", label: "How much paperwork customs accepts", hint: "share of stopped shipments released, 0% to 90%" },
    { id: "buffer", label: "Build up solar stock", hint: "4 to 10 months of demand in US warehouses" },
    { id: "capacity", label: "Help new suppliers scale faster", hint: "1.5% to 4.5% of demand added a month" },
  ];

  function grids() {
    // today's value replaces any grid step within 2 points of it, so the axis never shows two near-identical columns
    const b = A.sim.base, r1 = (v) => Math.round(v * 1000) / 1000;
    const uniq = (a) => { const base = r1(a[a.length - 1]); return [...new Set(a.map(r1))].filter((v) => v === base || Math.abs(v - base) > 0.02 * Math.max(1, base)).sort((x, y) => x - y); };
    return {
      reach: A.TH.map((_, i) => i),
      p_enf: uniq([0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, b.p_enf]),
      release: uniq([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, b.release]),
      buffer: uniq([4, 6, 8, 10, b.buffer]),
      capacity: uniq([1.5, 3, 4.5, b.capacity]),
    };
  }
  const baseOf = () => ({ reach: A.CUR_T, p_enf: A.sim.base.p_enf, release: A.sim.base.release, buffer: A.sim.base.buffer, capacity: A.sim.base.capacity });
  const close = (a, b) => Math.abs(a - b) < 1e-6;

  function runSearch(done) {
    const g = grids(), combos = [];
    for (const p of g.p_enf) for (const rel of g.release) for (const buf of g.buffer) for (const cap of g.capacity) combos.push({ p_enf: p, release: rel, buffer: buf, capacity: cap });
    const flagged = A.flaggedAt(), traced = A.traced(), X = A.SIM.significant_gap_pct, nT = A.TH.length;
    const rows = [];
    let k = 0;
    const t0 = performance.now();
    const chunk = () => {
      const until = performance.now() + 14;
      while (k < combos.length && performance.now() < until) {
        const c = combos[k++], inputs = {};
        A.SIM.inputs.forEach((i) => (inputs[i.id] = SM.distOf(i, c[i.id] ?? A.sim.base[i.id])));
        const res = SM.simulate({ seed: A.SIM.seed, runs: RUNS, flagged, traced, inputs, rho: A.SIM.copula_rho_hidden_rerouting });
        const full = res.flagged[nT - 1];
        for (let j = 0; j < nT; j++) {
          const lost = res.lost[j], sh = res.short[j], ratio = new Float64Array(RUNS);
          let s = 0, o = 0;
          for (let r = 0; r < RUNS; r++) { ratio[r] = full[r] > 0 ? (lost[r] / full[r]) * 100 : 0; if (sh[r] > 0) s++; if (lost[r] > X) o++; }
          ratio.sort();
          rows.push({ reach: j, ...c, keep: ratio[RUNS >> 1], pShort: (s / RUNS) * 100, pSer: (o / RUNS) * 100, lost: lost.slice().sort()[RUNS >> 1] });
        }
      }
      $("goal-prog").style.width = (k / combos.length) * 100 + "%";
      if (k < combos.length) setTimeout(chunk, 0);
      else { G.ms = Math.round(performance.now() - t0); G.nCombos = combos.length; done(rows); }
    };
    chunk();
  }

  /* ---------- controls ---------- */
  function ctlSlider(id, label, q, min, max, step, v, fmt) {
    return `<div class="ctl"><label for="g-${id}">${label}</label><div class="q">${q}</div>
      <div class="row"><input type="range" id="g-${id}" min="${min}" max="${max}" step="${step}" value="${v}" style="--p:${((v - min) / (max - min)) * 100}%"><span class="val" id="gv-${id}">${fmt(v)}</span></div></div>`;
  }
  function renderControls() {
    const g = G.goal;
    $("goal-controls").innerHTML = `
      <div class="ctl-group"><p class="kicker">Your goal</p>
        ${ctlSlider("keep", "Keep out at least", "of the solar supply linked to forced-labour risk, for good, in a typical future", 10, 90, 5, g.keep, (v) => v + "%")}
        ${ctlSlider("short", "Chance of a shortage no higher than", "futures where stock runs out before new suppliers catch up", 0, 50, 5, g.short, (v) => v + "%")}
        ${ctlSlider("serious", "Chance of a serious disruption no higher than", `futures that lose more than ${A.SIM.significant_gap_pct}% of US solar supply`, 0, 50, 5, g.serious, (v) => v + "%")}
      </div>
      <div class="ctl-group"><p class="kicker">What the government can change</p>
        <div class="levers">${LEVERS.map((l) => `<label class="lever"><input type="checkbox" data-l="${l.id}" ${G.levers[l.id] ? "checked" : ""}><span><b>${l.label}</b><em>${l.hint}</em></span></label>`).join("")}</div>
        <p class="small held">Untick a setting to hold it where it is today. Always held at our estimates: how much blocked supply gets back in, how exposed the untraced supply is, how long reviews take, and how long new suppliers take to qualify.</p>
      </div>
      <div class="goal-prog" aria-hidden="true"><i id="goal-prog"></i></div>`;
    ["keep", "short", "serious"].forEach((id) => {
      const el = $("g-" + id);
      el.addEventListener("input", () => {
        G.goal[id] = +el.value; $("gv-" + id).textContent = el.value + "%";
        el.style.setProperty("--p", ((+el.value - +el.min) / (+el.max - +el.min)) * 100 + "%");
        if (G.rows) renderResults();
      });
    });
    $("goal-controls").querySelectorAll(".lever input").forEach((c) => c.addEventListener("change", () => { G.levers[c.dataset.l] = c.checked; if (G.rows) renderResults(); }));
  }

  /* ---------- evaluation ---------- */
  function allowed(r) {
    const b = baseOf();
    return LEVERS.every((l) => G.levers[l.id] || close(r[l.id], b[l.id]));
  }
  const meets = (r) => r.keep >= G.goal.keep && r.pShort <= G.goal.short && r.pSer <= G.goal.serious;
  const safe = (r) => r.pShort <= G.goal.short && r.pSer <= G.goal.serious;
  function dist(r) {
    const b = baseOf();
    return Math.abs(r.reach - b.reach) / 5 + Math.abs(r.p_enf - b.p_enf) / 0.7 + Math.abs(r.release - b.release) / 0.8 + Math.abs(r.buffer - b.buffer) / 6 + Math.abs(r.capacity - b.capacity) / 3;
  }
  const best = (rows) => rows.slice().sort((a, b) => dist(a) - dist(b) || b.keep - a.keep)[0] || null;

  function fmtLever(id, v) {
    if (id === "reach") return A.TH[v].label;
    return A.fmtVal(id, v);
  }
  function routeCard(title, why, r, failMsg, idx) {
    if (!r) return `<div class="route none"><p class="route-k">${esc(title)}</p><p class="route-fail">${failMsg}</p></div>`;
    const b = baseOf();
    const items = LEVERS.map((l) => {
      const ch = !close(r[l.id], b[l.id]);
      return `<li class="${ch ? "ch" : ""}"><span>${esc(l.label)}</span><b>${esc(fmtLever(l.id, r[l.id]))}</b>${ch ? `<em>today: ${esc(fmtLever(l.id, b[l.id]))}</em>` : ""}</li>`;
    }).join("");
    return `<div class="route${idx === 0 ? " lead" : ""}"><p class="route-k">${esc(title)}</p><p class="route-why">${why}</p>
      <ul class="route-set">${items}</ul>
      <div class="route-out"><div><b>${Math.round(r.keep)}%</b><span>of linked supply kept out</span></div><div><b>${Math.round(r.pShort)}%</b><span>chance of a shortage</span></div><div><b>${Math.round(r.pSer)}%</b><span>chance of a serious disruption</span></div></div>
      <a class="act" href="${A.hash({ reach: r.reach, vals: { p_enf: r.p_enf, release: r.release, buffer: r.buffer, capacity: r.capacity } })}">Open in the simulator →</a></div>`;
  }
  function failReason(rows) {
    if (!rows.length) return "Not possible with the settings you allowed.";
    const safeRows = rows.filter(safe), keepRows = rows.filter((r) => r.keep >= G.goal.keep);
    const mk = safeRows.length ? Math.max(...safeRows.map((r) => r.keep)) : null;
    const over = (r) => Math.max(r.pShort - G.goal.short, r.pSer - G.goal.serious);
    const bk = keepRows.length ? keepRows.slice().sort((a, b) => over(a) - over(b))[0] : null;
    const parts = [];
    if (mk != null) parts.push(`Within your risk limits, the most it can keep out is <b>${Math.round(mk)}%</b>.`);
    else parts.push("No setting stays within your risk limits.");
    if (bk) parts.push(`At best, keeping out ${G.goal.keep}% comes with a <b>${Math.round(bk.pShort)}%</b> chance of a shortage and a <b>${Math.round(bk.pSer)}%</b> chance of a serious disruption.`);
    else parts.push(`No setting keeps out ${G.goal.keep}%.`);
    return "Not possible. " + parts.join(" ");
  }

  function renderResults() {
    const all = G.rows.filter(allowed), ok = all.filter(meets);
    const r1 = best(ok);
    const b = baseOf();
    const bufLock = !G.levers.buffer && !G.levers.capacity;
    const cat2 = all.filter((r) => close(r.buffer, b.buffer) && close(r.capacity, b.capacity));
    const cat3 = all.filter((r) => close(r.release, b.release));
    const r2 = bufLock ? null : best(cat2.filter(meets));
    const r3 = G.levers.release ? best(cat3.filter(meets)) : null;
    // headline
    const today = G.rows.find((r) => r.reach === b.reach && close(r.p_enf, b.p_enf) && close(r.release, b.release) && close(r.buffer, b.buffer) && close(r.capacity, b.capacity));
    $("goal-answer").innerHTML = ok.length
      ? `<p class="ga-k">The answer</p><h3><span class="yes">Yes.</span> ${ok.length} of ${all.length} combinations meet all three goals.</h3>
         <p>Today’s settings keep out about <b>${Math.round(today.keep)}%</b> of the linked supply. The smallest change that reaches <b>${G.goal.keep}%</b> is shown first below.</p>`
      : `<p class="ga-k">The answer</p><h3><span class="no">Not with these settings.</span></h3><p>${failReason(all)}</p><p>Today’s settings keep out about <b>${Math.round(today.keep)}%</b> of the linked supply.</p>`;
    // routes
    const cards = [];
    if (ok.length) {
      cards.push(routeCard("Smallest change from today", "The combination closest to today’s settings that meets every goal.", r1, "", 0));
      const same = (msg) => `<span class="same">${msg}</span>`;
      if (!bufLock) cards.push(r2 && r2 === r1 ? routeCard("Customs alone", "", null, same("The smallest change above already uses customs alone: no extra stock and no help for new suppliers."), 1)
        : routeCard("Customs alone", "No extra stock and no help for new suppliers: only how customs enforces the rule changes.", r2, failReason(cat2), 1));
      if (G.levers.release) cards.push(r3 && r3 === r1 ? routeCard("Without tightening the paperwork", "", null, same("The smallest change above already keeps today’s paperwork rate."), 2)
        : routeCard("Without tightening the paperwork", "Customs keeps accepting paperwork as often as it does today.", r3, failReason(cat3), 2));
    }
    $("goal-routes").innerHTML = cards.join("");
    $("goal-routes").classList.toggle("empty", !cards.length);
    // map defaults follow the lead route
    if (G.mapReach == null || G.lastLead !== (r1 && JSON.stringify(r1))) {
      const ref = r1 || G.rows.filter(allowed).sort((x, y) => y.keep - x.keep)[0];
      G.mapReach = ref ? ref.reach : A.TH.length - 1; G.mapBuf = ref ? ref.buffer : b.buffer; G.mapCap = ref ? ref.capacity : b.capacity;
      G.lastLead = r1 && JSON.stringify(r1); G.lead = r1;
    }
    renderMap();
    renderAnalysis(all, ok, r1, r2);
  }

  /* ---------- trade-off map: customs stops (y) × paperwork released (x) ---------- */
  function renderMap() {
    const g = grids(), b = baseOf();
    $("goal-map-tabs").innerHTML = `<div class="gm-row"><span class="mc-k">How far back</span><div class="seg light">${A.TH.map((t, i) => `<button type="button" data-r="${i}" aria-pressed="${i === G.mapReach}">${esc(t.short)}</button>`).join("")}</div></div>
      <div class="gm-row"><span class="mc-k">Stock</span><div class="seg light">${g.buffer.map((v) => `<button type="button" data-b="${v}" aria-pressed="${close(v, G.mapBuf)}">${v} mo</button>`).join("")}</div>
      <span class="mc-k">New suppliers</span><div class="seg light">${g.capacity.map((v) => `<button type="button" data-c="${v}" aria-pressed="${close(v, G.mapCap)}">${v}%/mo</button>`).join("")}</div></div>`;
    $("goal-map-tabs").querySelectorAll("button").forEach((bt) => bt.addEventListener("click", () => {
      if (bt.dataset.r != null) G.mapReach = +bt.dataset.r; if (bt.dataset.b != null) G.mapBuf = +bt.dataset.b; if (bt.dataset.c != null) G.mapCap = +bt.dataset.c;
      renderMap();
    }));
    $("goal-map-sub").textContent = `${A.TH[G.mapReach].label} · ${G.mapBuf} months of stock · new suppliers add ${G.mapCap}% a month`;
    const box = $("goal-map"); box.innerHTML = "";
    const w = Math.max(300, box.clientWidth), xs = g.release, ys = g.p_enf.slice().reverse();
    const m = { l: w < 560 ? 46 : 64, r: 8, t: 8, b: 52 }, cw = (w - m.l - m.r) / xs.length, ch = Math.min(38, Math.max(24, cw * 0.62)), h = m.t + m.b + ch * ys.length;
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": "Which combinations of customs stopping and paperwork accepted meet the goal" }, box);
    const COLS = { ok: "#22386c", low: "#dfe8f6", risk: "#e9b8a8" };
    const cells = G.rows.filter((r) => r.reach === G.mapReach && close(r.buffer, G.mapBuf) && close(r.capacity, G.mapCap));
    ys.forEach((p, yi) => xs.forEach((rel, xi) => {
      const r = cells.find((c) => close(c.p_enf, p) && close(c.release, rel)); if (!r) return;
      const cls = meets(r) ? "ok" : safe(r) ? "low" : "risk";
      const x = m.l + xi * cw, y = m.t + yi * ch;
      const rect = SM.svg("rect", { x: x + 1, y: y + 1, width: cw - 2, height: ch - 2, fill: COLS[cls] }, s);
      if (cw > 40) SM.svg("text", { x: x + cw / 2, y: y + ch / 2 + 4, "text-anchor": "middle", style: `font-size:11px;fill:${cls === "ok" ? "#fff" : "#3d4a63"}` }, s).textContent = Math.round(r.keep) + "%";
      const isToday = G.mapReach === b.reach && close(p, b.p_enf) && close(rel, b.release) && close(G.mapBuf, b.buffer) && close(G.mapCap, b.capacity);
      const isLead = G.lead && G.lead.reach === G.mapReach && close(G.lead.p_enf, p) && close(G.lead.release, rel) && close(G.lead.buffer, G.mapBuf) && close(G.lead.capacity, G.mapCap);
      if (isToday) SM.svg("rect", { x: x + 2.5, y: y + 2.5, width: cw - 5, height: ch - 5, fill: "none", stroke: "#c8841a", "stroke-width": 2.5 }, s);
      if (isLead) SM.svg("circle", { cx: x + cw - 8, cy: y + 8, r: 4, fill: "#c8841a" }, s);
      SM.bindTip(rect, () => `<b>Customs stops ${Math.round(p * 100)}% · releases ${Math.round(rel * 100)}% on paperwork</b><br>Linked supply kept out for good: ${Math.round(r.keep)}%<br>Chance of a shortage: ${Math.round(r.pShort)}%<br>Chance of a serious disruption: ${Math.round(r.pSer)}%${isToday ? "<br><i>Today’s settings</i>" : ""}`);
    }));
    xs.forEach((rel, xi) => { if (xs.length > 9 && w < 560 && xi % 2) return; SM.svg("text", { x: m.l + xi * cw + cw / 2, y: h - m.b + 16, "text-anchor": "middle", style: "font-size:11px;fill:#6b7690" }, s).textContent = Math.round(rel * 100) + "%" + (close(rel, b.release) && w >= 560 ? " now" : ""); });
    SM.svg("text", { x: m.l + (w - m.l - m.r) / 2, y: h - 10, "text-anchor": "middle", style: "font-size:12px;fill:#3d4a63" }, s).textContent = w < 560 ? "← stricter · released on paperwork · lenient →" : "← stricter   Share of stopped shipments released on paperwork   more lenient →";
    ys.forEach((p, yi) => SM.svg("text", { x: m.l - 8, y: m.t + yi * ch + ch / 2 + 4, "text-anchor": "end", style: "font-size:11px;fill:#6b7690" }, s).textContent = Math.round(p * 100) + "%");
    SM.svg("text", { x: 0, y: m.t + 2, style: "font-size:11px;fill:#3d4a63", transform: `rotate(90 4 ${m.t + 2})` }, s).textContent = "";
    $("goal-map-legend").innerHTML = `<span><i style="background:${COLS.ok}"></i>Meets every goal</span><span><i style="background:${COLS.low}" class="outline"></i>Within the risk limits, keeps out too little</span><span><i style="background:${COLS.risk}"></i>Too much risk of a shortage or disruption</span><span><i style="background:none;box-shadow:inset 0 0 0 2px #c8841a"></i>Today</span><span><i style="background:#c8841a;border-radius:50%"></i>Smallest change</span><span class="small">Rows: share of flagged shipments customs stops. Number in each square: linked supply kept out.</span>`;
  }

  function renderAnalysis(all, ok, r1, r2) {
    const b = baseOf(), T = A.TH;
    const maxAt = (j) => Math.max(0, ...G.rows.filter((r) => r.reach === j).map((r) => r.keep));
    const cap1 = maxAt(b.reach), capFull = maxAt(T.length - 1);
    const out = [];
    out.push(`<h4>What this means</h4>`);
    out.push(`<p><b>How far back customs looks sets a ceiling.</b> At today’s reach the rule only acts on companies customs has already stopped, so even if customs stopped every flagged shipment and accepted no paperwork, it could keep out at most about <b>${Math.round(cap1)}%</b> of the linked supply. Looking at every link the data can see raises that ceiling to about <b>${Math.round(capFull)}%</b>. The rest gets back in another way or can’t be traced.</p>`);
    const linked = (A.flaggedAt()[T.length - 1] / A.traced()) * 100, lossAtGoal = (linked * G.goal.keep) / 100;
    out.push(`<p><b>Keeping supply out means losing supply.</b> About <b>${Math.round(linked)}%</b> of US solar supply has a link to forced-labour risk, counting an estimate for the supply nobody can trace. Keeping out ${G.goal.keep}% of it means the US loses about <b>${Math.round(lossAtGoal)}%</b> of all its solar supply for good.${lossAtGoal >= A.SIM.significant_gap_pct ? ` That is past the ${A.SIM.significant_gap_pct}% line this tool counts as a serious disruption, so most futures would count as one.` : ""}</p>`);
    out.push(`<p><b>Paperwork is the main lever after that.</b> Today about ${A.fmtVal("release", b.release)} of stopped solar shipments are released once importers show supply chain documents. Most of what customs stops comes back in, so keeping more out means accepting less paperwork. On the map, the dark squares sit on the stricter side.</p>`);
    if (ok.length && r1) {
      const usesStock = !close(r1.buffer, b.buffer) || !close(r1.capacity, b.capacity);
      out.push(`<p><b>The cost is the risk of a shortage.</b> Every share of supply kept out has to be covered by stock and new suppliers. ${usesStock ? `The smallest change that meets your goal also builds up stock or speeds up new suppliers, because enforcement alone would push shortage risk past your limit.` : `At your goal, enforcement alone stays within your risk limits.`}${r2 === null && G.levers.buffer ? " Without extra stock or help for new suppliers, no setting meets every goal." : ""}</p>`);
    } else {
      out.push(`<p><b>The cost is the risk of a shortage.</b> Every share of supply kept out has to be covered by stock and new suppliers. With the settings you allowed, keeping out ${G.goal.keep}% would push the chance of a shortage or serious disruption past your limit, or the rule can’t reach that much of the linked supply. Try allowing more settings, a smaller goal, or a higher risk limit.</p>`);
    }
    out.push(`<p class="caveat">This searches a model, not the real world, and it isn’t a recommendation. It tested ${G.nCombos.toLocaleString("en-US")} combinations of settings at six reach levels, each over ${RUNS.toLocaleString("en-US")} simulated futures, using the same assumptions as the simulator. “Kept out” means lost to the US market for good, as a share of all supply with a link to forced-labour risk.</p>`);
    $("goal-analysis").innerHTML = out.join("");
    $("goal-method").innerHTML = `<ul class="model-list">
      <li>Settings searched: how far back customs looks (6 levels), share of flagged shipments stopped (${grids().p_enf.map((v) => Math.round(v * 100) + "%").join(", ")}), share of stopped shipments released (${grids().release.map((v) => Math.round(v * 100) + "%").join(", ")}), stock (${grids().buffer.join(", ")} months) and new-supplier capacity (${grids().capacity.join(", ")}% of demand a month).</li>
      <li>Every other input stays at the simulator’s default and keeps its uncertainty range: ${A.SIM.inputs.filter((i) => !["p_enf", "release", "buffer", "capacity"].includes(i.id)).map((i) => esc(i.label.toLowerCase())).join("; ")}.</li>
      <li>Each combination runs ${RUNS.toLocaleString("en-US")} futures with the same random numbers, so differences between squares come from the settings, not from chance. Search took ${G.ms} ms in your browser.</li>
      <li>“Smallest change” ranks combinations by how far each setting moves from today, scaled by its range.</li></ul>`;
  }

  SM.renderGoal = function (resizeOnly) {
    A = SM.simApi;
    if (!A) return;
    if (G && resizeOnly) { if (G.rows) renderMap(); return; }
    if (G) return;
    G = { goal: { keep: 30, short: 10, serious: 10 }, levers: { reach: true, p_enf: true, release: true, buffer: true, capacity: true }, rows: null, mapReach: null };
    if (!A.sim.base || !Object.keys(A.sim.base).length) A.ensure();
    renderControls();
    $("goal-answer").innerHTML = `<p class="ga-k">Searching</p><h3>Testing every combination of settings…</h3>`;
    runSearch((rows) => { G.rows = rows; renderResults(); });
  };
  // the router ran before this file loaded
  if ((location.hash || "").split("?")[0] === "#goal") SM.renderGoal();
})();
