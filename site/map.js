/* The Shadow Market: supply chain map (canvas).
   One circle per exporter of solar cells and panels to the US, area proportional to its shipments (Sayari).
   Grouped by how far back the first forced-labour link sits, and lit by what a given rule would catch.
   Classification replicates pipeline/build.py flagged_under(), so the shares match combos exactly. */
(function () {
  const SM = (window.SM = window.SM || {});
  const TIER = ["E0", "E1", "E2", "E3"], SCOPE = ["entity_list", "xinjiang", "research"];

  function flaggedUnder(flags, combo) {
    const [t, s, o] = combo.split("|");
    for (const f of flags) {
      if (SCOPE.indexOf(f.scope) > SCOPE.indexOf(s)) continue;
      if (f.level === "A1") { if (o === "one_hop") return true; continue; }
      if (TIER.indexOf(f.level) <= TIER.indexOf(t)) return true;
    }
    return false;
  }
  SM.flaggedUnder = flaggedUnder;

  // Groups, left to right. Depth groups follow the simulator's reach steps (sim_inputs.json thresholds).
  const GROUPS = [
    { id: "g0", label: "On the blacklist", sub: "the exporter itself", th: "T0" },
    { id: "g2", label: "2–3 steps back", sub: "link in its supply chain", th: "T2" },
    { id: "g3", label: "Up to 4 steps back", sub: "or a shared owner", th: "T3" },
    { id: "g5", label: "Named by researchers", sub: "ASPI, Sheffield Hallam", th: "T5" },
    { id: "none", label: "No link found", sub: "in the Sayari data", gap: true },
    { id: "aside", label: "Set aside", sub: "thin-film and LED, no polysilicon" },
    { id: "untraced", label: "Can’t be traced", sub: "shipped via forwarders" },
  ];
  SM.MAP_GROUPS = GROUPS;

  /** Build the node list once. product: "on" (default) uses flags; "off" uses flags_all for set-aside makers. */
  SM.mapNodes = function (D, product = "on") {
    const L3 = D.layer3, TH = D.simulation.thresholds;
    const total = L3.exporters.reduce((a, e) => a + e.value, 0);
    return L3.exporters.map((e) => {
      const flags = product === "off" && !e.product_relevant ? e.flags_all || e.flags : e.flags;
      const caught = TH.map((t) => (t.combo === "observed" ? !!e.detained_group : e.traced && flaggedUnder(flags, t.combo)));
      let g = "none";
      if (!e.traced) g = "untraced";
      else {
        const first = ["T0", "T2", "T3", "T4", "T5"].find((id) => caught[TH.findIndex((t) => t.id === id)]);
        if (first) g = first === "T4" ? "g3" : "g" + first.slice(1);
        else if (!e.product_relevant && product === "on") g = "aside";
      }
      return { e, share: (e.value / total) * 100, caught, linked: caught[TH.length - 1], g, x: 0, y: 0, tx: 0, ty: 0, r: 1, a: 0, ta: 1 };
    });
  };

  /* tiny deterministic force layout: pull to a target, push apart.
     Typed arrays and a linked-list grid, so a tick allocates nothing. Small circles collide through the grid
     (cell > 2 × the small radius); the few large ones scan the grid cells they cover. */
  function relaxer(nodes, W, H, targetFn, ticks = 200, top = 0) {
    const N = nodes.length, BIG = 9, cell = 2 * BIG + 2, rnd = SM.rng ? SM.rng(7) : Math.random;
    const R = new Float64Array(N), X = new Float64Array(N), Y = new Float64Array(N), GX = new Float64Array(N), GY = new Float64Array(N);
    nodes.forEach((n, i) => { const t = targetFn(n); R[i] = n.r; GX[i] = t[0]; GY[i] = t[1]; X[i] = t[0] + (rnd() - 0.5) * 60; Y[i] = t[1] + (rnd() - 0.5) * 60; });
    const big = [], small = [];
    for (let i = 0; i < N; i++) (R[i] > BIG ? big : small).push(i);
    const cols = Math.ceil(W / cell) + 4, rows = Math.ceil(H / cell) + 4, head = new Int32Array(cols * rows), next = new Int32Array(N);
    const cellOf = (i) => (Math.min(rows - 1, Math.max(0, ((Y[i] / cell) | 0) + 2))) * cols + Math.min(cols - 1, Math.max(0, ((X[i] / cell) | 0) + 2));
    const sep = (n, m) => {
      const dx = X[m] - X[n], dy = Y[m] - Y[n], d2 = dx * dx + dy * dy, min = R[n] + R[m] + 0.7;
      if (d2 >= min * min) return;
      const d = Math.sqrt(d2) || 0.01, push = ((min - d) / d) * 0.5, rn = R[n] * R[n], rm = R[m] * R[m], wn = rm / (rn + rm);
      X[n] -= dx * push * wn; Y[n] -= dy * push * wn; X[m] += dx * push * (1 - wn); Y[m] += dy * push * (1 - wn);
    };
    const scan = (n, span, smallOnly) => {
      const c = cellOf(n), cy = (c / cols) | 0, cx = c % cols;
      for (let j = Math.max(0, cy - span); j <= Math.min(rows - 1, cy + span); j++)
        for (let i = Math.max(0, cx - span); i <= Math.min(cols - 1, cx + span); i++)
          for (let m = head[j * cols + i]; m !== -1; m = next[m]) if (m !== n && (!smallOnly || R[m] <= R[n] && m < n || R[m] < R[n])) sep(n, m);
    };
    let k = 0;
    const step = () => {
      const alpha = 1 - k / ticks;
      for (let i = 0; i < N; i++) { X[i] += (GX[i] - X[i]) * 0.05 * alpha; Y[i] += (GY[i] - Y[i]) * 0.04 * alpha; }
      head.fill(-1);
      for (const i of small) { const c = cellOf(i); next[i] = head[c]; head[c] = i; }
      for (const i of small) scan(i, 1, true);
      for (const i of big) { scan(i, Math.ceil((R[i] + BIG + 1) / cell), false); for (const m of big) if (m > i) sep(i, m); }
      for (let i = 0; i < N; i++) { X[i] = Math.max(R[i] + 2, Math.min(W - R[i] - 2, X[i])); Y[i] = Math.max(top + R[i] + 2, Math.min(H - R[i] - 2, Y[i])); }
      k++;
    };
    return {
      run(budgetMs) { const end = performance.now() + budgetMs; while (k < ticks && performance.now() < end) step(); return k >= ticks; },
      result: () => nodes.map((_, i) => [X[i], Y[i]]),
    };
  }
  // run a relaxer in ~8 ms slices so animation frames keep flowing
  function runAsync(rx, done) {
    let cancelled = false;
    const go = () => { if (cancelled) return; if (rx.run(8)) done(rx.result()); else setTimeout(go, 0); };
    setTimeout(go, 0);
    return () => (cancelled = true);
  }

  /**
   * SM.SupplyMap(container, D, opts) -> api
   *   api.layout("cloud" | "groups"), api.state({ reach, mode }), api.onHover(fn)
   *   mode: "plain" (all neutral), "caught" (caught at reach vs not), "shadow" (caught vs linked-unseen),
   *         "detained" (customs action on record), "aside" (dim the set-aside makers)
   */
  SM.SupplyMap = function (container, D, opts = {}) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cvs = document.createElement("canvas");
    cvs.className = "map-canvas";
    cvs.setAttribute("role", "img");
    container.appendChild(cvs);
    const labels = document.createElement("div");
    labels.className = "map-labels";
    container.appendChild(labels);
    const ctx = cvs.getContext("2d");
    let nodes = SM.mapNodes(D, opts.product || "on");
    let W = 0, H = 0, layouts = {}, cur = "cloud", st = { reach: null, mode: "plain" }, hover = null, raf = 0, hoverFn = null;
    const groupOf = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

    function sizeNodes() {
      const tot = nodes.reduce((a, n) => a + n.e.value, 0), fill = W < 560 ? 0.2 : 0.24;
      const k = Math.sqrt((fill * W * H) / (Math.PI * tot));
      nodes.forEach((n) => (n.r = Math.max(W < 560 ? 0.9 : 1.2, k * Math.sqrt(n.e.value))));
    }
    function groupGeometry() {
      // column widths follow each group's share (sqrt so small groups stay visible), with a gap before the unlinked groups
      const share = {}; GROUPS.forEach((g) => (share[g.id] = 0));
      nodes.forEach((n) => (share[n.g] += n.share));
      const wts = GROUPS.map((g) => (share[g.id] > 0 ? Math.max(0.9, Math.sqrt(share[g.id])) : 0));
      const gap = W * 0.035, avail = W - gap, sum = wts.reduce((a, b) => a + b, 0);
      let x = 0; const geo = {};
      GROUPS.forEach((g, i) => { const w = (wts[i] / sum) * avail; if (g.gap) x += gap; geo[g.id] = { x0: x, x1: x + w, cx: x + w / 2, share: share[g.id], empty: !share[g.id] }; x += w; });
      return geo;
    }
    let cancels = [];
    function computeLayouts(first) {
      cancels.forEach((c) => c()); cancels = [];
      const W0 = W, H0 = H;
      sizeNodes();
      const geo = groupGeometry(), band = W < 640 ? 46 : 66;
      const mk = { cloud: () => relaxer(nodes, W, H, () => [W / 2, H * 0.52]), groups: () => relaxer(nodes, W, H, (n) => [geo[n.g].cx, band + (H - band) * 0.5], 200, band) };
      layouts.geo = geo;
      if (first) {
        // a quick cloud now, then everything refined in the background
        const q = relaxer(nodes, W, H, () => [W / 2, H * 0.52], 50); q.run(1e9); layouts.cloud = q.result();
        layouts.groups = layouts.cloud;
      }
      ["cloud", "groups"].forEach((name) => cancels.push(runAsync(mk[name](), (res) => {
        if (W !== W0 || H !== H0) return;
        layouts[name] = res;
        if (cur === name) applyLayout(name, false, true);
      })));
    }
    function resize() {
      const w = Math.max(300, container.clientWidth), h = opts.height ? opts.height(w) : Math.round(Math.min(460, Math.max(300, w * 0.42)));
      if (w === W && h === H) return;
      const first = !W, sx = W ? w / W : 1, sy = H ? h / H : 1;
      W = w; H = h;
      cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + "px"; cvs.style.height = H + "px";
      if (!first) {
        // rescale what's on screen straight away; the new layout settles in when ready
        ["cloud", "groups"].forEach((k) => { if (layouts[k]) layouts[k] = layouts[k].map(([x, y]) => [x * sx, y * sy]); });
        nodes.forEach((n) => { n.x *= sx; n.y *= sy; n.fx = n.x; n.fy = n.y; });
      }
      computeLayouts(first);
      applyLayout(cur, true);
    }
    function applyLayout(name, instant, settle) {
      cur = name;
      const L = layouts[name];
      nodes.forEach((n, i) => {
        n.tx = L[i][0]; n.ty = L[i][1];
        n.delay = instant || settle ? 0 : (name === "groups" ? (n.tx / W) * 500 + (i % 7) * 30 : (i % 11) * 25);
        n.t0 = performance.now();
        n.fx = n.x || n.tx; n.fy = n.y || n.ty;
        if (instant) { n.x = n.tx; n.y = n.ty; }
      });
      renderLabels();
      kick();
    }
    function renderLabels() {
      if (cur !== "groups" || opts.labels === false) { labels.innerHTML = ""; return; }
      const geo = layouts.geo, narrow = W < 640;
      labels.innerHTML = GROUPS.filter((g) => !geo[g.id].empty).map((g) => {
        const G = geo[g.id];
        return `<div class="ml${g.gap ? " gap" : ""}${["none", "aside", "untraced"].includes(g.id) ? " off" : ""}" style="left:${G.x0}px;width:${G.x1 - G.x0}px"><b>${(G.share < 0.05 ? 0 : G.share < 10 ? G.share.toFixed(1) : Math.round(G.share))}%</b><span>${SM.esc(narrow ? g.label.replace(" steps back", " steps").replace("Named by researchers", "Research").replace("Up to 4 steps", "4 steps").replace("On the blacklist", "Listed").replace("No link found", "No link").replace("Can’t be traced", "Untraced") : g.label)}</span>${narrow ? "" : `<em>${SM.esc(g.sub)}</em>`}</div>`;
      }).join("") + (W >= 640 ? `<div class="ml-bracket" style="left:${geo.g2.x0}px;width:${geo.g5.x1 - geo.g2.x0}px"><span>Linked to forced-labour risk</span></div>` : "");
    }

    const C = { caught: "#8eaad6", shadow: "#c8841a", plain: "rgba(243,245,249,0.55)", dim: "rgba(243,245,249,0.16)", aside: "rgba(243,245,249,0.10)" };
    function colourOf(n) {
      const m = st.mode, j = st.reach;
      if (m === "plain") return [C.plain, false];
      if (m === "detained") return n.e.detained_group ? [C.caught, true] : [C.dim, false];
      if (m === "aside") return n.g === "aside" ? [C.aside, false] : n.e.detained_group ? [C.caught, true] : [C.dim, false];
      const caught = j != null && n.caught[j];
      if (caught) return [C.caught, !!n.e.detained_group];
      if (m === "shadow" && n.linked) return [C.shadow, false];
      if (n.g === "aside" || n.g === "untraced") return [C.aside, false];
      return [C.dim, false];
    }
    function draw(now) {
      raf = 0;
      let moving = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const dur = opts.reduced ? 0 : 1100;
      for (const n of nodes) {
        const t = dur ? Math.min(1, Math.max(0, (now - n.t0 - n.delay) / dur)) : 1;
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        n.x = n.fx + (n.tx - n.fx) * e; n.y = n.fy + (n.ty - n.fy) * e;
        if (t < 1) moving = true;
        n.a += (n.ta - n.a) * (dur ? 0.12 : 1);
        if (Math.abs(n.ta - n.a) > 0.01) moving = true;
      }
      for (const n of nodes) {
        const [col, ring] = colourOf(n);
        ctx.globalAlpha = n.a;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (n.g === "aside" && st.mode !== "plain") { ctx.strokeStyle = "rgba(243,245,249,0.32)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); }
        else { ctx.fillStyle = col; ctx.fill(); }
        if (ring && n.r > 2.5) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.min(2, n.r / 5); ctx.stroke(); }
        if (n === hover) { ctx.strokeStyle = "#f0c27a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 2.5, 0, Math.PI * 2); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
      if (moving) kick();
    }
    function kick() { if (!raf) raf = requestAnimationFrame(draw); }

    function pick(ev) {
      const r = cvs.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      let best = null, bd = 1e9;
      for (const n of nodes) { const d = Math.hypot(n.x - x, n.y - y) - n.r; if (d < bd) { bd = d; best = n; } }
      return bd < 6 ? best : null;
    }
    cvs.addEventListener("mousemove", (ev) => {
      const n = pick(ev);
      if (n !== hover) { hover = n; kick(); }
      if (n && hoverFn) SM.showTip(hoverFn(n, st), ev); else SM.hideTip();
    });
    cvs.addEventListener("mouseleave", () => { hover = null; SM.hideTip(); kick(); });
    // keyboard: Tab to the map, then arrow keys step through exporters from largest to smallest
    cvs.tabIndex = 0;
    let kIdx = -1;
    cvs.addEventListener("keydown", (ev) => {
      if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Escape", "Home"].includes(ev.key)) return;
      ev.preventDefault();
      if (ev.key === "Escape") { hover = null; kIdx = -1; SM.hideTip(); kick(); return; }
      const order = nodes.map((n, i) => i).sort((a, b) => nodes[b].e.value - nodes[a].e.value);
      kIdx = ev.key === "Home" ? 0 : (kIdx + (ev.key === "ArrowRight" || ev.key === "ArrowDown" ? 1 : -1) + order.length) % order.length;
      hover = nodes[order[kIdx]]; kick();
      const r = cvs.getBoundingClientRect();
      if (hoverFn) SM.showTip(hoverFn(hover, st), { clientX: r.left + hover.x, clientY: r.top + hover.y });
    });
    cvs.addEventListener("blur", () => { if (kIdx >= 0) { hover = null; kIdx = -1; SM.hideTip(); kick(); } });
    cvs.addEventListener("click", (ev) => { const n = pick(ev); if (n && hoverFn) { hover = n; SM.showTip(hoverFn(n, st), ev); kick(); } });

    let rT; const ro = new ResizeObserver(() => { clearTimeout(rT); rT = setTimeout(resize, 120); });
    ro.observe(container);
    resize();
    nodes.forEach((n) => { n.x = n.tx; n.y = n.ty; n.fx = n.x; n.fy = n.y; });

    const api = {
      layout(name) { if (layouts[name]) applyLayout(name); return api; },
      state(s) { Object.assign(st, s); kick(); cvs.setAttribute("aria-label", api.describe()); return api; },
      fade(to, stagger) { const now = performance.now(); nodes.forEach((n, i) => { n.ta = to; if (stagger) { n.a = to ? 0 : n.a; n.t0 = now; n.delay = (i % 40) * 18; } }); kick(); return api; },
      scatter() { nodes.forEach((n) => { n.x = n.fx = Math.random() * W; n.y = n.fy = Math.random() * H; n.t0 = performance.now(); n.delay = Math.random() * 700; }); kick(); return api; },
      onHover(fn) { hoverFn = fn; return api; },
      shares(j) {
        const out = { caught: 0, linked: 0, unseen: 0, detained: 0, notDetained: 0 };
        nodes.forEach((n) => {
          if (n.linked) out.linked += n.share;
          if (j != null && n.caught[j]) out.caught += n.share;
          else if (n.linked) out.unseen += n.share;
          if (n.e.detained_group) out.detained += n.share;
          if (n.linked && !n.e.detained_group) out.notDetained += n.share;
        });
        return out;
      },
      describe() {
        const s = api.shares(st.reach);
        return `Map of ${nodes.length} exporters of solar cells and panels to the US, sized by shipments. ${st.reach != null ? `The rule catches ${s.caught.toFixed(0)}% of shipments; ${s.unseen.toFixed(0)}% are linked to forced-labour risk but not caught.` : ""}`;
      },
      setProduct(p) { nodes = SM.mapNodes(D, p); W = 0; resize(); return api; },
      redraw() { kick(); return api; },
    };
    return api;
  };
})();
