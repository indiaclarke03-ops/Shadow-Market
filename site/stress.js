/* The Shadow Market: "What could break it?" — a reverse stress test.
   Forward: choose the inputs, see the outcome. Reverse: choose an outcome you can't accept, then ask which
   combinations of the uncertain inputs most plausibly produce it under the model.
   Method (DECISIONS #42): run the simulator with each future's input draws recorded (no extra random draws, so
   the results match the simulator), keep the futures where the failure happens, and compare them with all futures:
   how often it happens, how each input shifts, the typical failing future (the "central scenario": the median of
   each input across failing futures), and families of failing futures (k-means on the inputs that shift most).
   This is a sampling-based reading, simpler than the analytical multi-tier method in the research it follows. */
(function () {
  const SM = (window.SM = window.SM || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => SM.esc(s);
  const f1 = (v) => (Math.abs(v) > 0 && Math.abs(v) < 10 ? v.toFixed(1) : String(Math.round(v)));
  const RUNS = 20000, MIN_FAIL = 40;

  const FAILS = {
    solar: [
      { id: "loss", label: "Serious supply loss", q: (t) => `The US loses ${t}% or more of its solar supply for good`, min: 2, max: 40, step: 1, def: 6, unit: "%", metric: "lost", dir: 1, axis: "share of US solar supply lost for good" },
      { id: "short", label: "A long shortage", q: (t) => `A solar shortage lasting ${t} months or more`, min: 1, max: 24, step: 1, def: 3, unit: " months", metric: "short", dir: 1, axis: "months of shortage" },
      { id: "enf", label: "Enforcement falls short", q: (t) => `Even under this rule, less than ${t}% of the linked supply is kept out`, min: 5, max: 80, step: 1, def: 30, unit: "%", metric: "keep", dir: -1, axis: "linked supply kept out for good (%)" },
    ],
    optics: [
      { id: "pshort", label: "Serious shortfall", q: (t) => `AI data centres face a peak-year shortfall of ${t}% of demand or more`, min: 1, max: 40, step: 1, def: 5, unit: "%", metric: "peakShort", dir: 1, axis: "peak-year shortfall (% of demand)" },
      { id: "miss", label: "The rule barely bites", q: (t) => `The rule blocks less than ${t}% of supply even at its peak`, min: 1, max: 60, step: 1, def: 15, unit: "%", metric: "peakBlocked", dir: -1, axis: "peak share of supply blocked (%)" },
      { id: "delay", label: "Long deployment delay", q: (t) => `New AI data-centre deployments are delayed ${t} months or more`, min: 1, max: 36, step: 1, def: 12, unit: " months", metric: "delay", dir: 1, axis: "deployment delay (months)" },
    ],
  };
  // what someone could actually watch for each input
  const WATCH = {
    release: "Share of decided solar cases CBP releases (CBP’s monthly UFLPA statistics)",
    p_enf: "How many flagged solar shipments CBP detains",
    reroute: "Solar imports arriving from countries new to the trade after enforcement",
    hidden: "How much US solar supply can be traced upstream",
    buffer: "US module inventory, in months of demand (industry reports)",
    ramp: "How long new suppliers take to qualify with US developers",
    capacity: "New US and allied cell and module output coming online",
    detention: "How long CBP takes to decide a detained shipment",
    shift: "Orders moving to uncovered lines (for example Thai factories) or redesigned modules",
    headroom: "Spare capacity at non-Chinese optics makers",
    capacity_add: "New non-Chinese transceiver capacity announced and qualified",
    pull_forward: "Optics ordered ahead of the rule’s start",
    fed_share: "Federal systems’ share of AI data-centre optics demand",
    bom_u: "US companies’ share of module parts value (teardowns, supplier data)",
    th_innolight: "Share of InnoLight output built in Thailand",
    th_eoptolink: "Share of Eoptolink output built in Thailand",
  };
  const SHORT = { release: "paperwork accepted", p_enf: "shipments stopped", reroute: "rerouting", hidden: "untraced exposure", buffer: "stock", ramp: "supplier delay", capacity: "new supply", detention: "review time", shift: "shifting", headroom: "spare capacity", capacity_add: "new capacity", pull_forward: "buying ahead", fed_share: "federal share", bom_u: "US parts share", th_innolight: "InnoLight in Thailand", th_eoptolink: "Eoptolink in Thailand", ramp_o: "qualification time" };

  // the same inputs as noun phrases, for the plain-English sentence
  const NOUN = { release: "the share of stopped shipments released", p_enf: "the share of flagged shipments customs stops", reroute: "the share of blocked supply that gets back in", detention: "the time a review takes", buffer: "US solar stock", ramp: "the wait for new suppliers", capacity: "the rate new suppliers fill the gap", hidden: "the exposure of untraced supply", shift: "the share of blocked demand that shifts elsewhere", headroom: "spare non-covered capacity", capacity_add: "capacity added each year", pull_forward: "stock bought ahead", fed_share: "the federal share of demand", bom_u: "US companies’ share of parts value", th_innolight: "InnoLight’s share made in Thailand", th_eoptolink: "Eoptolink’s share made in Thailand" };
  const st = { cs: "solar", fail: { solar: "loss", optics: "pshort" }, thr: {}, run: null, sel: null };
  Object.values(FAILS).flat().forEach((f) => (st.thr[f.id] = f.def));

  /* ---------------- input metadata for each case ---------------- */
  function inputsFor(cs) {
    if (cs === "solar") {
      const A = SM.simApi;
      return A.SIM.inputs.map((i) => ({ id: i.id, label: i.label, min: i.min, max: i.max, now: A.sim.vals[i.id], fmt: (v) => A.fmtVal(i.id, v), step: i.step }));
    }
    const P = SM.proposedApi, s = P.st();
    const list = P.SUP.inputs.filter((i) => i.id !== "elasticity").map((i) => ({
      id: i.id, label: i.label, min: i.min, max: i.max, now: s.vals[i.id], step: i.unit === "share" ? 0.05 : i.unit === "pct" ? 0.5 : 1,
      fmt: (v) => (i.unit === "share" ? Math.round(v * 100) + "%" : i.unit === "pct" ? (+v.toFixed(1)) + "%" : i.unit === "months" ? (+v.toFixed(1)) + " months" : (+v.toFixed(1)) + ""),
    }));
    list.push({ id: "bom_u", label: "US companies’ share of parts value", min: 0, max: 1, now: 0.5, fmt: (v) => `${Math.round(v * 100)}th percentile of its range` });
    P.SUP.splits.forEach((sp) => list.push({ id: "th_" + sp.maker, label: sp.label, min: 0, max: 1, now: sp.th_share.centre, fmt: (v) => Math.round(v * 100) + "%" }));
    return list;
  }

  /* ---------------- run + analyse ---------------- */
  function run() {
    const cs = st.cs;
    let out, label, sub;
    if (cs === "solar") {
      const A = SM.simApi; A.ensure();
      const cfg = { ...A.cfg(), runs: RUNS, record: true }, res = SM.simulate(cfg), j = A.reach(), full = res.flagged[res.flagged.length - 1];
      const keep = new Float64Array(RUNS);
      for (let r = 0; r < RUNS; r++) keep[r] = full[r] > 0 ? (res.lost[j][r] / full[r]) * 100 : 0;
      out = { metrics: { lost: res.lost[j], short: res.short[j], keep }, inputs: res.inputs };
      label = A.label(); sub = A.TH[j].label;
    } else {
      const P = SM.proposedApi; P.ensure();
      const res = P.simulate({ runs: RUNS, record: true });
      out = { metrics: { peakShort: res.peakShort, peakBlocked: res.peakBlocked, delay: res.delay }, inputs: res.inputs, swaps: res.swaps };
      label = P.label(); const L = P.L(); sub = L.trigger === "none" ? "no transceiver rule" : `${P.leverLabel("trigger", L.trigger)} · ${P.leverLabel("generation", L.generation)} · from ${L.start_year}`;
    }
    st.run = { cs, ...out, label, sub, meta: inputsFor(cs) };
    analyse();
  }
  const sortF = (a) => Float64Array.from(a).sort();
  const q = (s, p) => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
  function analyse() {
    const R = st.run, F = FAILS[R.cs].find((f) => f.id === st.fail[R.cs]), t = st.thr[F.id], m = R.metrics[F.metric], N = m.length;
    let idx = [];
    for (let r = 0; r < N; r++) if (F.dir > 0 ? m[r] >= t : m[r] < t) idx.push(r);
    const pFail = (idx.length / N) * 100;
    let closest = false;
    if (idx.length < MIN_FAIL) { // too rare to read: study the futures that come closest instead
      closest = true;
      idx = Array.from({ length: N }, (_, r) => r).sort((a, b) => F.dir * (m[b] - m[a])).slice(0, Math.max(MIN_FAIL, Math.round(N * 0.01)));
    }
    const inFail = new Uint8Array(N); idx.forEach((r) => (inFail[r] = 1));
    const rows = R.meta.filter((x) => R.inputs[x.id]).map((x) => {
      const all = R.inputs[x.id], fail = Float64Array.from(idx, (r) => all[r]);
      const sa = sortF(all), sf = sortF(fail);
      let mean = 0; for (const v of all) mean += v; mean /= N;
      let sd = 0; for (const v of all) sd += (v - mean) ** 2; sd = Math.sqrt(sd / N) || 1e-9;
      const medA = q(sa, 0.5), medF = q(sf, 0.5);
      // where the failing median sits in the full range of futures (percentile)
      let lo = 0, hi = sa.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (sa[mid] < medF) lo = mid + 1; else hi = mid; }
      const pct = lo / sa.length;
      return { ...x, all, fail, medA, medF, sd, z: (medF - medA) / sd, pct, varies: sd > 1e-6 && q(sa, 0.95) - q(sa, 0.05) > 1e-6 };
    }).filter((r) => r.varies).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    // families: k-means on the inputs that shift most
    const feats = rows.slice(0, 4), K = idx.length >= 120 ? 3 : 2;
    const fam = kmeans(idx.map((r) => feats.map((f) => (f.all[r] - f.medA) / f.sd)), K);
    const famRows = fam.groups.map((g, gi) => {
      const members = g.map((i) => idx[i]);
      const dz = feats.map((f) => { const s = sortF(Float64Array.from(members, (r) => f.all[r])); return { f, z: (q(s, 0.5) - f.medA) / f.sd, med: q(s, 0.5) }; });
      return { share: (g.length / idx.length) * 100, n: g.length, dz, top: dz.slice().sort((a, b) => Math.abs(b.z) - Math.abs(a.z)) };
    }).filter((x) => x.share >= 8).sort((a, b) => b.share - a.share);
    // design choices that came out differently (Case 2: low-confidence cards)
    const swapRows = [];
    if (R.swaps) for (const [k, arr] of Object.entries(R.swaps)) {
      let a = 0, f = 0; for (let r = 0; r < N; r++) { if (arr[r]) { a++; if (inFail[r]) f++; } }
      const pa = (a / N) * 100, pf = (f / idx.length) * 100;
      if (Math.abs(pf - pa) >= 5) swapRows.push({ k, pa, pf });
    }
    const near = (() => { let n = 0; for (let r = 0; r < N; r++) if (!inFail[r] && (F.dir > 0 ? m[r] >= t * 0.75 : m[r] < t * 1.25)) n++; return (n / N) * 100; })();
    st.sel = { F, t, m, idx, pFail, closest, rows, famRows, swapRows, near, N };
    render();
  }
  // small deterministic k-means (farthest-point start)
  function kmeans(X, K) {
    const n = X.length, d = X[0] ? X[0].length : 0;
    if (!n || !d) return { groups: [Array.from({ length: n }, (_, i) => i)] };
    const dist = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
    const mean = Array.from({ length: d }, (_, j) => X.reduce((s, x) => s + x[j], 0) / n);
    let first = 0, bd = -1; X.forEach((x, i) => { const dd = dist(x, mean); if (dd > bd) { bd = dd; first = i; } });
    const C = [X[first].slice()];
    while (C.length < K) { let bi = 0, bv = -1; X.forEach((x, i) => { const v = Math.min(...C.map((c) => dist(x, c))); if (v > bv) { bv = v; bi = i; } }); C.push(X[bi].slice()); }
    let asg = new Array(n).fill(0);
    for (let it = 0; it < 25; it++) {
      asg = X.map((x) => { let b = 0, bv = Infinity; C.forEach((c, k) => { const v = dist(x, c); if (v < bv) { bv = v; b = k; } }); return b; });
      C.forEach((c, k) => { const mem = X.filter((_, i) => asg[i] === k); if (mem.length) for (let j = 0; j < d; j++) c[j] = mem.reduce((s, x) => s + x[j], 0) / mem.length; });
    }
    return { groups: C.map((_, k) => asg.map((a, i) => (a === k ? i : -1)).filter((i) => i >= 0)).filter((g) => g.length) };
  }

  /* ---------------- words ---------------- */
  const where = (p) => (p <= 0.1 ? "near the bottom of its range" : p <= 0.3 ? "on the low side" : p >= 0.9 ? "near the top of its range" : p >= 0.7 ? "on the high side" : "close to the middle");
  const verdict = (p) => (p >= 20 ? ["Likely", "bad"] : p >= 5 ? ["Plausible", "warn"] : p >= 1 ? ["Unlikely but possible", "mid"] : p > 0 ? ["Rare", "ok"] : ["Outside the model’s ranges", "ok"]);
  function famName(f) {
    const a = f.top[0], b = f.top[1];
    const w = (x) => `${x.z > 0 ? "more" : "less"} ${SHORT[x.f.id] || x.f.label.toLowerCase()}`;
    return b && Math.abs(b.z) > 0.25 ? `${w(a)} + ${w(b)}` : w(a);
  }

  /* ---------------- render ---------------- */
  function renderControls() {
    const F = FAILS[st.cs], cur = st.fail[st.cs], f = F.find((x) => x.id === cur);
    const scen = st.cs === "solar"
      ? SM.simApi.SIM.presets.map((p) => `<button type="button" data-p="${p.id}" aria-pressed="${SM.simApi.sim.preset === p.id}">${esc(p.label)}</button>`).join("")
      : SM.proposedApi.presets.map((p) => `<button type="button" data-p="${p.id}" aria-pressed="${SM.proposedApi.st().preset === p.id}">${esc(p.label)}</button>`).join("");
    $("rs-controls").innerHTML = `
      <div class="ctl-group"><p class="kicker">1 · Which case</p>
        <div class="seg rs-case" role="group" aria-label="Case"><button type="button" data-c="solar" aria-pressed="${st.cs === "solar"}">US solar imports<span class="def">today’s forced-labour rule</span></button><button type="button" data-c="optics" aria-pressed="${st.cs === "optics"}">AI data-centre optics<span class="def">the proposed rule</span></button></div></div>
      <div class="ctl-group"><p class="kicker">2 · Which rule</p><div class="rs-scen">${scen}</div>
        <p class="small held">${st.run ? `${esc(st.run.label)} · ${esc(st.run.sub)}` : ""}. Settings are shared with the ${st.cs === "solar" ? "What if?" : "Proposed rule"} page.</p></div>
      <div class="ctl-group"><p class="kicker">3 · The failure you can’t accept</p>
        <div class="rs-fails">${F.map((x) => `<button type="button" data-f="${x.id}" aria-pressed="${x.id === cur}"><b>${esc(x.label)}</b><span>${esc(x.q(st.thr[x.id]))}</span></button>`).join("")}</div>
        <div class="ctl"><label for="rs-thr">Where the line is</label><div class="row"><input type="range" id="rs-thr" min="${f.min}" max="${f.max}" step="${f.step}" value="${st.thr[f.id]}" style="--p:${((st.thr[f.id] - f.min) / (f.max - f.min)) * 100}%"><span class="val" id="rs-thr-v">${st.thr[f.id]}${f.unit}</span></div></div></div>
      <p class="small held">${RUNS.toLocaleString("en-US")} simulated futures. Everything uncertain varies; the rule’s settings stay as chosen.</p>`;
    $("rs-controls").querySelectorAll(".rs-case button").forEach((b) => b.addEventListener("click", () => { st.cs = b.dataset.c; renderControls(); run(); renderControls(); }));
    $("rs-controls").querySelectorAll(".rs-scen button").forEach((b) => b.addEventListener("click", () => {
      if (st.cs === "solar") SM.simApi.preset(b.dataset.p); else SM.proposedApi.preset(b.dataset.p);
      run(); renderControls();
    }));
    $("rs-controls").querySelectorAll(".rs-fails button").forEach((b) => b.addEventListener("click", () => { st.fail[st.cs] = b.dataset.f; renderControls(); analyse(); }));
    const el = $("rs-thr");
    let raf = 0;
    el.addEventListener("input", () => {
      st.thr[f.id] = +el.value; $("rs-thr-v").textContent = el.value + f.unit; el.style.setProperty("--p", ((+el.value - f.min) / (f.max - f.min)) * 100 + "%");
      const btn = $("rs-controls").querySelector(`.rs-fails button[data-f="${f.id}"] span`); if (btn) btn.textContent = f.q(+el.value);
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; analyse(); });
    });
  }

  function render() {
    const R = st.run, S = st.sel, F = S.F, [vword, vcls] = verdict(S.pFail);
    const top = S.rows[0];
    $("rs-question").innerHTML = `<p class="pr-k">The question</p><h3>“What would have to be true for this to happen?”</h3><p class="rs-q-fail">${esc(F.q(S.t))}, under <b>${esc(R.label)}</b> <span>(${esc(R.sub)})</span>.</p>`;
    $("rs-readout").innerHTML = `
      <div class="metric key ${vcls === "bad" ? "bad" : ""}"><div class="lbl">How often it happens, under the model</div><div class="num">${S.pFail > 0 && S.pFail < 0.1 ? "<0.1" : f1(S.pFail)}%</div><div class="gauge"><i style="width:${Math.min(100, S.pFail)}%"></i></div><div class="sub"><b class="rs-v ${vcls}">${vword}</b> · ${Math.round((S.pFail / 100) * S.N).toLocaleString("en-US")} of ${S.N.toLocaleString("en-US")} futures${S.near > 0.5 ? ` · another ${f1(S.near)}% come close` : ""}</div></div>
      <div class="metric"><div class="lbl">What it depends on most</div><div class="num rs-word">${top ? esc(SHORT[top.id] || top.label) : "—"}</div><div class="sub">${top ? `in failing futures it sits ${where(top.pct)}` : "nothing varies"}</div></div>
      <div class="metric"><div class="lbl">${S.closest ? "It almost never happens" : "Ways it happens"}</div><div class="num">${S.closest ? "—" : S.famRows.length}</div><div class="sub">${S.closest ? `fewer than ${MIN_FAIL} futures fail, so this reads the ${S.idx.length} futures that come closest` : "distinct families of failing futures, below"}</div></div>`;
    // 100 futures
    const cats = [
      { id: "fail", label: S.closest ? "Comes closest (studied below)" : "The failure happens", color: "#9b2f26", share: S.closest ? (S.idx.length / S.N) * 100 : S.pFail },
      { id: "near", label: "Comes close (within a quarter of the line)", color: "#c8841a", share: S.near },
      { id: "ok", label: "Stays clear", color: "#ffffff", share: Math.max(0, 100 - (S.closest ? (S.idx.length / S.N) * 100 : S.pFail) - S.near) },
    ];
    const n = SM.futures($("rs-futures"), cats);
    $("rs-futures-legend").innerHTML = cats.map((c, i) => `<span><i class="${c.id === "ok" ? "outline" : ""}" style="background:${c.color}"></i><b>${n[i]}</b>&nbsp;${esc(c.label)}</span>`).join("");
    histo();
    renderCentral();
    renderShifts();
    renderFamilies();
    renderWatch();
    $("rs-note").innerHTML = S.closest
      ? `<b>A finding in itself:</b> under the ranges this model uses, the failure almost never happens. The analysis below reads the ${S.idx.length} futures that come closest. Making it happen would take inputs outside the ranges we consider plausible.`
      : "";
  }
  function histo() {
    const S = st.sel, box = $("rs-hist"); box.innerHTML = "";
    const w = Math.max(280, box.clientWidth), h = 170, m = { t: 18, r: 10, b: 34, l: 10 };
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": `Spread of ${S.F.axis} across futures, with the failure line at ${S.t}` }, box);
    const sorted = sortF(S.m), hi = Math.max(S.t * 1.3, q(sorted, 0.995), 1), bins = 48, bw = hi / bins, cnt = new Array(bins).fill(0);
    for (const v of S.m) cnt[Math.min(bins - 1, Math.max(0, Math.floor(v / bw)))]++;
    const yMax = Math.max(...cnt, 1), iw = w - m.l - m.r, ih = h - m.t - m.b, X = (v) => m.l + (v / hi) * iw;
    cnt.forEach((c, i) => {
      if (!c) return;
      const v0 = i * bw, fail = S.F.dir > 0 ? v0 + bw / 2 >= S.t : v0 + bw / 2 < S.t;
      SM.svg("rect", { x: X(v0) + 0.5, y: m.t + ih - (c / yMax) * ih, width: Math.max(1, iw / bins - 1), height: (c / yMax) * ih, fill: fail ? "#9b2f26" : "#22386c", opacity: fail ? 1 : 0.85 }, s);
    });
    const tx = X(Math.min(S.t, hi));
    SM.svg("line", { x1: tx, x2: tx, y1: m.t - 8, y2: m.t + ih, stroke: "#9b2f26", "stroke-width": 2, "stroke-dasharray": "4 3" }, s);
    SM.svg("text", { x: tx + (S.F.dir > 0 ? 6 : -6), y: m.t - 2, "text-anchor": S.F.dir > 0 ? "start" : "end", style: "fill:#9b2f26;font-weight:700;font-size:12px" }, s).textContent = S.F.dir > 0 ? `failure: ${S.t}${S.F.unit.trim() === "%" ? "%" : ""} or more →` : `← failure: under ${S.t}%`;
    for (let i = 0; i <= 4; i++) SM.svg("text", { x: X((hi / 4) * i), y: m.t + ih + 16, "text-anchor": i === 0 ? "start" : i === 4 ? "end" : "middle" }, s).textContent = f1((hi / 4) * i);
    SM.svg("text", { x: m.l + iw / 2, y: h - 3, "text-anchor": "middle", style: "fill:#6b7690" }, s).textContent = S.F.axis;
  }
  function renderCentral() {
    const S = st.sel, R = st.run, top = S.rows.filter((r) => Math.abs(r.z) >= 0.15).slice(0, 4);
    const parts = top.map((r) => `<b>${esc(NOUN[r.id] || r.label.toLowerCase())}</b> is ${esc(r.fmt(r.medF))} (${esc(where(r.pct))}; now ${esc(r.fmt(r.now))})`);
    const sentence = top.length
      ? `${S.closest ? "It comes closest" : "It happens most plausibly"} when ${parts.slice(0, -1).join(", ")}${parts.length > 1 ? " and " : ""}${parts[parts.length - 1]}.`
      : "No single input stands out: the failure comes from many small combinations.";
    $("rs-central").innerHTML = `<p class="pr-k">The most plausible way it happens</p><p class="rs-sentence">${sentence}</p>
      <div class="rs-actions"><button type="button" class="act primary" id="rs-play"><span aria-hidden="true">▶</span> ${R.cs === "solar" ? "Play this scenario" : "Run this scenario"}</button><button type="button" class="act" id="rs-open">Open it in the ${R.cs === "solar" ? "simulator" : "Proposed rule page"} →</button></div>
      <p class="small rs-loop">Reverse, then forward: the scenario above came from working backwards. Send it to the simulator to test it forwards and see how it plays out.</p>`;
    const central = Object.fromEntries(S.rows.filter((r) => R.cs === "solar" ? SM.simApi.INP[r.id] : SM.proposedApi.INP[r.id]).map((r) => [r.id, r.step ? Math.round(r.medF / r.step) * r.step : r.medF]));
    const send = (play) => {
      if (R.cs === "solar") { SM.simApi.set({ vals: central }); if (play) SM.playFocus(); else location.hash = "#simulation"; }
      else { SM.proposedApi.setVals(central); location.hash = "#proposed"; setTimeout(() => { const t = $("pr-sim"); if (t) scrollTo({ top: t.getBoundingClientRect().top + scrollY - 110 }); }, 120); }
    };
    $("rs-play").addEventListener("click", () => send(true));
    $("rs-open").addEventListener("click", () => send(false));
  }
  // one row per input: all futures (outline) against failing futures (filled), with today's setting marked
  function renderShifts() {
    const S = st.sel, box = $("rs-shifts"); box.innerHTML = "";
    const rows = S.rows.slice(0, 8), w = Math.max(300, box.clientWidth), nar = w < 560;
    const lw = nar ? 0 : 230, rh = nar ? 74 : 56, h = rows.length * rh + 26;
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": "How each input shifts in failing futures: " + rows.map((r) => `${r.label}: ${r.fmt(r.medF)} in failing futures against ${r.fmt(r.medA)} overall`).join("; ") }, box);
    const iw = w - lw - 70;
    rows.forEach((r, i) => {
      const y0 = i * rh + (nar ? 22 : 8), hh = rh - (nar ? 30 : 16), lo = Math.min(r.min, q(sortF(r.all), 0)), hi = Math.max(r.max === undefined ? 1 : Math.min(r.max, q(sortF(r.all), 1) * 1.05), q(sortF(r.all), 1));
      const X = (v) => lw + ((v - lo) / (hi - lo || 1)) * iw, bins = 36, bw = (hi - lo) / bins || 1;
      const dens = (arr) => { const c = new Array(bins).fill(0); for (const v of arr) c[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / bw)))]++; const sm = c.map((v, k) => (c[k - 1] || 0) * 0.25 + v * 0.5 + (c[k + 1] || 0) * 0.25); const mx = Math.max(...sm, 1e-9); return sm.map((v) => v / mx); };
      const dA = dens(r.all), dF = dens(r.fail);
      const path = (d, close) => { let p = `M${X(lo)},${y0 + hh}`; d.forEach((v, k) => (p += `L${X(lo + (k + 0.5) * bw)},${y0 + hh - v * hh}`)); return p + `L${X(hi)},${y0 + hh}` + (close ? "Z" : ""); };
      SM.svg("text", { x: nar ? 0 : lw - 12, y: nar ? i * rh + 14 : y0 + hh / 2 + 4, "text-anchor": nar ? "start" : "end", class: "lbl-strong" }, s).textContent = r.label.length > 44 && !nar ? r.label.slice(0, 42) + "…" : r.label;
      SM.svg("line", { x1: lw, x2: lw + iw, y1: y0 + hh, y2: y0 + hh, stroke: "rgba(15,27,51,0.2)" }, s);
      SM.svg("path", { d: path(dF, true), fill: "rgba(155,47,38,0.28)", stroke: "#9b2f26", "stroke-width": 1.5 }, s);
      SM.svg("path", { d: path(dA, false), fill: "none", stroke: "#22386c", "stroke-width": 1.5, "stroke-dasharray": "3 2", opacity: 0.8 }, s);
      const nx = X(clamp(r.now, lo, hi));
      SM.svg("line", { x1: nx, x2: nx, y1: y0 - 2, y2: y0 + hh, stroke: "#22386c", "stroke-width": 2 }, s);
      const fx = X(clamp(r.medF, lo, hi));
      SM.svg("circle", { cx: fx, cy: y0 + hh, r: 5, fill: "#9b2f26", stroke: "#fff", "stroke-width": 1.5 }, s);
      const arrow = Math.abs(r.z) >= 0.15 ? (r.z > 0 ? "▲ higher" : "▼ lower") : "≈ no shift";
      SM.svg("text", { x: lw + iw + 10, y: y0 + hh / 2 + 4, style: `font-size:12px;font-weight:700;fill:${Math.abs(r.z) >= 0.15 ? "#9b2f26" : "#6b7690"}` }, s).textContent = arrow;
      const hit = SM.svg("rect", { x: 0, y: i * rh, width: w, height: rh, class: "hit" }, s);
      SM.bindTip(hit, () => `<b>${esc(r.label)}</b><br>Now set to ${esc(r.fmt(r.now))}<br>All futures, middle: ${esc(r.fmt(r.medA))}<br>Failing futures, middle: <b>${esc(r.fmt(r.medF))}</b> (${esc(where(r.pct))})${WATCH[r.id] ? `<div class="t-src">Watch: ${esc(WATCH[r.id])}</div>` : ""}`);
    });
    SM.svg("text", { x: lw, y: h - 6, style: "fill:#6b7690;font-size:11.5px" }, s).textContent = "each row runs from the low to the high end of that input’s range";
    $("rs-shifts-legend").innerHTML = `<span><i style="background:rgba(155,47,38,0.35);box-shadow:inset 0 0 0 1.5px #9b2f26"></i>Futures where it fails</span><span><i style="background:none;border-top:2px dashed #22386c;height:0;width:16px;margin-top:6px"></i>All futures</span><span><i style="background:#22386c;width:3px"></i>Current setting</span><span><i style="background:#9b2f26;border-radius:50%"></i>Middle of the failing futures</span>`;
    if (S.swapRows.length) {
      const P = SM.proposedApi, L = P.L();
      const alt = (k) => { const l = P.LV[k]; if (l.type === "options" && l.alt && l.alt[L[k]] != null) return `“${P.leverLabel(k, l.alt[L[k]])}” instead of “${P.leverLabel(k, L[k])}”`; if (l.type === "toggle") return L[k] ? "switched off" : "switched on"; return "a different value"; };
      const rows = S.swapRows.slice().sort((a, b) => Math.abs(b.pf - b.pa) - Math.abs(a.pf - a.pa));
      $("rs-swaps").innerHTML = `<p class="pr-k">The rule’s design matters too</p><p class="small" style="margin:0 0 8px">Parts of the rule set by less certain cards sometimes take their next-most-likely form. Compared with all futures, failing futures are more or less likely to have:</p><ul>${rows.map((x) => `<li><b>${esc(P.LV[x.k].label)}</b> as ${esc(alt(x.k))}: <b>${f1(x.pf)}%</b> of failing futures, against ${f1(x.pa)}% of all futures.</li>`).join("")}</ul>`;
    }
    else $("rs-swaps").innerHTML = "";
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function renderFamilies() {
    const S = st.sel, box = $("rs-families");
    if (S.closest || !S.famRows.length) { box.innerHTML = `<div class="rs-fam none"><p>${S.closest ? "Too few failing futures to group reliably." : "No distinct families."}</p></div>`; return; }
    const L = "ABCDE";
    box.innerHTML = S.famRows.map((f, i) => `<article class="rs-fam">
      <div class="rs-fam-h"><span class="rs-fam-tag">${L[i]}</span><div><b>${esc(famName(f))}</b><span>${f1(f.share)}% of failing futures</span></div></div>
      <div class="rs-fam-bars">${f.dz.map((d) => { const v = clamp(d.z, -2.5, 2.5), pc = (Math.abs(v) / 2.5) * 50; return `<div class="fb"><span class="fb-l">${esc(SHORT[d.f.id] || d.f.label)}</span><span class="fb-t"><i class="${v >= 0 ? "pos" : "neg"}" style="${v >= 0 ? `left:50%;width:${pc}%` : `right:50%;width:${pc}%`}"></i></span><span class="fb-v">${esc(d.f.fmt(d.med))}</span></div>`; }).join("")}</div>
    </article>`).join("");
  }
  function renderWatch() {
    const S = st.sel, rows = S.rows.filter((r) => Math.abs(r.z) >= 0.15 && WATCH[r.id]).slice(0, 4);
    $("rs-watch").innerHTML = rows.length ? rows.map((r) => `<li><span class="rw-dir ${r.z > 0 ? "up" : "down"}">${r.z > 0 ? "▲" : "▼"}</span><div><b>${esc(WATCH[r.id])}</b><span>Warning sign: ${esc(SHORT[r.id] || r.label)} moving ${r.z > 0 ? "up" : "down"} towards ${esc(r.fmt(r.medF))} (now ${esc(r.fmt(r.now))})</span></div></li>`).join("") : `<li><div><span>No single indicator stands out for this failure.</span></div></li>`;
  }

  let inited = false;
  SM.renderStress = function (resizeOnly) {
    if (!SM.simApi || !SM.proposedApi) return;
    if (inited && resizeOnly) { if (st.sel) { histo(); renderShifts(); } return; }
    if (!inited) { inited = true; SM.simApi.ensure(); SM.proposedApi.ensure(); if (SM.simApi.sim.preset === "today") SM.simApi.preset("everything"); }
    run(); renderControls();
  };
  if ((location.hash || "").split("?")[0] === "#stress") setTimeout(() => SM.renderStress(), 0);
})();
