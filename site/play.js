/* The Shadow Market: "Play it out". Plays the typical future of a simulator scenario month by month.
   Shipments (dots) head for the US; customs stops some of the flagged ones and holds them while it reviews
   the paperwork; most are released, the rest are turned away, and some of those get back in another way.
   US warehouse stock covers the gap until replacement suppliers reach full volume.
   Stock follows the simulator's own simplification (sim.js): while reviews run the gap is everything stopped,
   after that it is the supply lost for good, until new suppliers are qualified (ramp) and scaled (lost ÷ capacity). */
(function () {
  const SM = (window.SM = window.SM || {});
  const $ = (id) => document.getElementById(id);
  const COL = { base: "#8eaad6", flag: "#c8841a", lost: "#a8432f", back: "#c9b6e4", fresh: "#4467a6" };

  function model(d) {
    const v = d.vals, det = v.detention || 0, ramp = v.ramp, cap = Math.max(0.1, v.capacity), stock0 = v.buffer * 100;
    const L = d.L, Sx = d.S;
    const tRep = L > 0.05 ? ramp + L / cap : 0;
    const T = Math.max(18, Math.min(36, Math.ceil(Math.max(tRep + 4, det + 4))));
    const gap = (t) => (Sx < 0.05 ? 0 : t < det ? Sx : t < tRep ? L : 0);
    // stock by integrating month by month in small steps
    const dt = 0.05, pts = [];
    let stock = stock0, t = 0;
    for (; t <= T + 1e-9; t += dt) {
      const g = gap(t), short = stock <= 0 && g > 0;
      pts.push({ t, stock: Math.max(0, stock), short, unmet: short ? g : 0 });
      stock -= g * dt;
    }
    return { T, det, ramp, tRep, stock0, L, S: Sx, gap, pts, at: (tt) => pts[Math.min(pts.length - 1, Math.max(0, Math.round(tt / dt)))] };
  }

  let M = null, D = null, raf = 0, playing = false, simT = 0, last = 0, speed = 1, parts = [], spawnAcc = 0, W = 0, H = 0, cvs, ctx, dpr = 1, prevFocus = null;
  const MONTH_MS = 1100, RATE = 30; // dots per month of normal demand

  function geo() {
    return {
      laneY: H * 0.42, srcX: 16, gateX: W * 0.43, tankX0: W * 0.8, tankX1: W * 0.94, tankY0: H * 0.14, tankY1: H * 0.82,
      yard: { x0: W * 0.34, x1: W * 0.52, y0: H * 0.6, y1: H * 0.88 }, binX: W * 0.15, binY: H * 0.84, loopY: H * 0.07,
      newX: W * 0.66, newY: H * 0.06,
    };
  }
  function spawn(kind, t) {
    const g = geo(), y = g.laneY + (Math.random() - 0.5) * 18;
    if (kind === "fresh") { parts.push({ k: "fresh", x: g.newX, y: g.newY, st: "fresh", c: COL.fresh }); return; }
    const flag = Math.random() * 100 < D.F;
    const p = { x: g.srcX, y, k: flag ? "flag" : "base", c: flag ? COL.flag : COL.base, st: "lane" };
    if (flag) {
      const stopped = Math.random() < (D.F > 0 ? D.S / D.F : 0);
      p.fate = !stopped ? "pass" : Math.random() < (D.S > 0 ? D.K / D.S : 0) ? (Math.random() < (D.K > 0 ? (D.K - D.L) / D.K : 0) ? "reroute" : "lost") : "release";
      p.releaseAt = t + M.det;
    }
    parts.push(p);
  }
  function stepParts(dtMs) {
    const g = geo(), v = (W * 0.5) / (MONTH_MS * 0.55) * dtMs; // ~half a month across the lane
    for (const p of parts) {
      if (p.st === "lane") {
        p.x += v;
        if (p.k === "flag" && p.fate && p.fate !== "pass" && p.x >= g.gateX - 6) {
          p.st = "toYard"; p.tx = g.yard.x0 + 8 + Math.random() * (g.yard.x1 - g.yard.x0 - 16); p.ty = g.yard.y0 + 8 + Math.random() * (g.yard.y1 - g.yard.y0 - 16);
        } else if (p.x >= g.tankX0) p.dead = true;
      } else if (p.st === "toYard") {
        p.x += (p.tx - p.x) * 0.12; p.y += (p.ty - p.y) * 0.12;
        if (Math.abs(p.tx - p.x) < 1 && simT >= p.releaseAt) p.st = "held";
        else if (Math.abs(p.tx - p.x) < 1) p.st = "held";
      } else if (p.st === "held") {
        if (simT >= p.releaseAt) {
          if (p.fate === "release") { p.st = "out"; p.tx = g.gateX + 10; p.ty = g.laneY; }
          else { p.st = "toBin"; p.c = COL.lost; p.tx = g.binX + (Math.random() - 0.5) * 30; p.ty = g.binY + (Math.random() - 0.5) * 10; }
        }
      } else if (p.st === "out") {
        p.x += (p.tx - p.x) * 0.1; p.y += (p.ty - p.y) * 0.1;
        if (Math.abs(p.ty - p.y) < 2) { p.st = "lane"; p.fate = "pass"; p.c = COL.base; }
      } else if (p.st === "toBin") {
        p.x += (p.tx - p.x) * 0.08; p.y += (p.ty - p.y) * 0.08;
        if (Math.abs(p.tx - p.x) < 1.5) {
          if (p.fate === "reroute") { p.st = "loop"; p.c = COL.back; p.a = 0; }
          else { p.st = "fade"; p.life = 1; }
        }
      } else if (p.st === "loop") {
        // arc from the bin up and over to the start of the lane
        p.a += dtMs / (MONTH_MS * 0.9);
        const a = Math.min(1, p.a), x0 = g.binX, y0 = g.binY, x1 = g.srcX + 30, y1 = g.laneY;
        const cx = (x0 + x1) / 2 - W * 0.06, cy = g.loopY;
        p.x = (1 - a) * (1 - a) * x0 + 2 * (1 - a) * a * cx + a * a * x1; p.y = (1 - a) * (1 - a) * y0 + 2 * (1 - a) * a * cy + a * a * y1;
        if (a >= 1) { p.st = "lane"; p.fate = "pass"; p.k = "back"; }
      } else if (p.st === "fade") {
        p.life -= dtMs / 1600; if (p.life <= 0) p.dead = true;
      } else if (p.st === "fresh") {
        p.x += (g.tankX0 + 10 - p.x) * 0.05; p.y += (g.tankY0 + 30 - p.y) * 0.05;
        if (Math.abs(g.tankX0 + 10 - p.x) < 3) p.dead = true;
      }
    }
    parts = parts.filter((p) => !p.dead);
  }

  function drawScene() {
    const g = geo(), s = M.at(simT), shortNow = s.short;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const nar = W < 560;
    ctx.font = `600 ${nar ? 10 : 12}px 'Source Sans 3', sans-serif`; ctx.textBaseline = "alphabetic";
    // lane
    ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(g.srcX, g.laneY - 16, g.tankX0 - g.srcX, 32);
    ctx.fillStyle = "rgba(243,245,249,0.6)"; ctx.fillText(nar ? "TO THE US" : "SHIPMENTS HEADING FOR THE US", g.srcX, g.laneY - 24);
    // gate
    ctx.fillStyle = "#f3f5f9"; ctx.fillRect(g.gateX - 2, g.laneY - 34, 4, 68);
    ctx.fillStyle = "rgba(243,245,249,0.85)"; ctx.textAlign = "center"; ctx.fillText("US CUSTOMS", g.gateX, g.laneY - 42); ctx.textAlign = "left";
    // yard
    const held = parts.filter((p) => p.st === "held" || p.st === "toYard").length;
    ctx.strokeStyle = "rgba(200,132,26,0.7)"; ctx.setLineDash([4, 4]); ctx.strokeRect(g.yard.x0, g.yard.y0, g.yard.x1 - g.yard.x0, g.yard.y1 - g.yard.y0); ctx.setLineDash([]);
    ctx.fillStyle = "#f0c27a"; ctx.fillText(`${nar ? "HELD" : "HELD AT THE BORDER"}${held ? " · " + held : ""}`, g.yard.x0, g.yard.y1 + 16);
    // kept-out bin + loop path
    ctx.fillStyle = "rgba(226,135,111,0.9)"; ctx.fillText("KEPT OUT", g.binX - 30, g.binY + 24);
    ctx.strokeStyle = "rgba(201,182,228,0.35)"; ctx.setLineDash([2, 5]); ctx.beginPath();
    ctx.moveTo(g.binX, g.binY); ctx.quadraticCurveTo((g.binX + g.srcX + 30) / 2 - W * 0.06, g.loopY, g.srcX + 30, g.laneY); ctx.stroke(); ctx.setLineDash([]);
    if (D.K - D.L > 0.05 && !nar) { ctx.fillStyle = "rgba(201,182,228,0.85)"; ctx.fillText("GETS BACK IN ANOTHER WAY", g.srcX + 4, g.loopY + 34); }
    // new suppliers
    const nsOn = M.L > 0.05 && simT >= M.ramp, nsFull = M.L > 0.05 && simT >= M.tRep;
    ctx.fillStyle = nsOn ? "rgba(142,170,214,0.95)" : "rgba(243,245,249,0.35)";
    ctx.textAlign = "center"; ctx.fillText(M.L <= 0.05 ? "" : nar ? "NEW SUPPLIERS" : nsFull ? "NEW SUPPLIERS · FULL VOLUME" : nsOn ? "NEW SUPPLIERS · SCALING UP" : "NEW SUPPLIERS · NOT YET QUALIFIED", nar ? g.newX - 20 : g.newX, g.newY + 4); ctx.textAlign = "left";
    // tank
    const fill = M.stock0 > 0 ? s.stock / M.stock0 : 0, th = g.tankY1 - g.tankY0;
    ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(g.tankX0, g.tankY0, g.tankX1 - g.tankX0, th);
    ctx.fillStyle = shortNow ? "#a8432f" : "#8eaad6"; ctx.fillRect(g.tankX0, g.tankY1 - th * fill, g.tankX1 - g.tankX0, th * fill);
    ctx.strokeStyle = shortNow ? "#e2876f" : "rgba(243,245,249,0.5)"; ctx.lineWidth = shortNow ? 2 : 1; ctx.strokeRect(g.tankX0, g.tankY0, g.tankX1 - g.tankX0, th); ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(243,245,249,0.85)"; ctx.textAlign = "center"; ctx.fillText(nar ? "STOCK" : "US WAREHOUSES", (g.tankX0 + g.tankX1) / 2, g.tankY0 - 10);
    if (shortNow) { ctx.fillStyle = "#e2876f"; ctx.fillText("SHORTAGE", (g.tankX0 + g.tankX1) / 2, g.tankY1 + 18); }
    else { ctx.fillStyle = "rgba(243,245,249,0.6)"; ctx.fillText(nar ? "→ projects" : "→ US solar projects", (g.tankX0 + g.tankX1) / 2, g.tankY1 + 18); }
    ctx.textAlign = "left";
    // dots
    for (const p of parts) {
      ctx.globalAlpha = p.st === "fade" ? Math.max(0, p.life) : 1;
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.k === "base" ? 2.6 : 3.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function side() {
    const s = M.at(simT), months = s.stock / 100;
    $("th-month").textContent = Math.floor(simT);
    $("th-stock").textContent = `${months.toFixed(1)} months of demand`;
    $("th-stock-g").style.width = (M.stock0 ? (s.stock / M.stock0) * 100 : 0) + "%";
    $("th-stock-g").classList.toggle("bad", s.short);
    let ns = "Not needed", nsP = 0;
    if (M.L > 0.05) {
      if (simT < M.ramp) { ns = `Qualifying · ${Math.ceil(M.ramp - simT)} months to go`; nsP = 0; }
      else if (simT < M.tRep) { nsP = Math.min(1, (simT - M.ramp) / (M.tRep - M.ramp)); ns = `Scaling up · ${Math.round(nsP * 100)}%`; }
      else { ns = "At full volume"; nsP = 1; }
    }
    $("th-new").textContent = ns; $("th-new-g").style.width = nsP * 100 + "%";
    const f1 = (v) => (v > 0 && v < 10 ? v.toFixed(1) : Math.round(v));
    let msg;
    if (M.S < 0.05) msg = "At this reach the rule catches nothing, so supply carries on as normal.";
    else if (s.short) msg = `<b>Shortage.</b> The stock has run out, and ${f1(s.unmet)}% of normal demand can’t be met until new suppliers reach full volume.`;
    else if (simT < M.det) msg = `Customs is holding <b>${f1(M.S)}%</b> of supply at the border while it reviews the paperwork. Stock covers the gap.`;
    else if (M.L <= 0.05) msg = "Reviews are done and almost everything was released. Supply is back to normal.";
    else if (simT < M.ramp) msg = `Reviews are done. Most stopped shipments were released, but <b>${f1(M.L)}%</b> of supply is lost for good. Stock is running down while new suppliers qualify.`;
    else if (simT < M.tRep) msg = `New suppliers have qualified and are scaling up. Until they reach full volume, stock keeps covering the <b>${f1(M.L)}%</b> gap.`;
    else msg = `New suppliers now cover the lost <b>${f1(M.L)}%</b>. The gap is closed.`;
    $("th-status").innerHTML = msg;
    drawTimeline();
  }

  let tl = null;
  function buildTimeline() {
    const box = $("th-timeline"); box.innerHTML = "";
    const w = Math.max(280, box.clientWidth), h = 120, m = { l: 34, r: 10, t: 14, b: 24 };
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", class: "th-tl" }, box);
    const iw = w - m.l - m.r, ih = h - m.t - m.b, yMax = Math.max(1, M.stock0 / 100);
    const X = (t) => m.l + (t / M.T) * iw, Y = (v) => m.t + ih - (v / 100 / yMax) * ih;
    let d = `M${X(0)},${Y(0)}`;
    M.pts.forEach((p) => (d += `L${X(p.t)},${Y(p.stock)}`));
    d += `L${X(M.T)},${Y(0)}Z`;
    SM.svg("path", { d, fill: "rgba(142,170,214,0.35)", stroke: "#8eaad6", "stroke-width": 1.5 }, s);
    // shortage shading
    let i0 = null;
    M.pts.forEach((p, i) => {
      if (p.short && i0 === null) i0 = i;
      if ((!p.short || i === M.pts.length - 1) && i0 !== null) { SM.svg("rect", { x: X(M.pts[i0].t), y: m.t, width: Math.max(1, X(p.t) - X(M.pts[i0].t)), height: ih, fill: "rgba(168,67,47,0.45)" }, s); i0 = null; }
    });
    const mark = (t, label, col) => {
      if (!(t > 0 && t < M.T)) return;
      SM.svg("line", { x1: X(t), x2: X(t), y1: m.t, y2: m.t + ih, stroke: col, "stroke-dasharray": "3 3" }, s);
      SM.svg("text", { x: X(t) + 4, y: m.t + 9, style: `fill:${col};font-size:10.5px` }, s).textContent = label;
    };
    mark(M.det, "reviews done", "#f0c27a");
    if (M.L > 0.05) { mark(M.ramp, "new suppliers qualified", "#8eaad6"); mark(M.tRep, "gap closed", "#c9d6ec"); }
    for (let t = 0; t <= M.T; t += 6) SM.svg("text", { x: X(t), y: h - 6, "text-anchor": "middle", style: "fill:rgba(243,245,249,0.6);font-size:11px" }, s).textContent = t === 0 ? "start" : `month ${t}`;
    SM.svg("text", { x: 4, y: m.t + 8, style: "fill:rgba(243,245,249,0.6);font-size:10.5px" }, s).textContent = "stock";
    const head = SM.svg("line", { y1: m.t - 4, y2: m.t + ih, stroke: "#f3f5f9", "stroke-width": 2 }, s);
    tl = { head, X };
  }
  function drawTimeline() { if (tl) { const x = tl.X(Math.min(simT, M.T)); tl.head.setAttribute("x1", x); tl.head.setAttribute("x2", x); } }

  function size() {
    const box = $("th-stage");
    W = Math.max(300, box.clientWidth); H = W < 560 ? 280 : 330;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + "px"; cvs.style.height = H + "px";
    buildTimeline();
  }
  function frame(now) {
    raf = 0;
    if (!playing) return;
    const dt = Math.min(64, now - last); last = now;
    const dm = (dt * speed) / MONTH_MS;
    simT += dm;
    spawnAcc += dm * RATE;
    while (spawnAcc >= 1) { spawnAcc -= 1; spawn("ship", simT); }
    if (M.L > 0.05 && simT >= M.tRep && Math.random() < dm * RATE * (M.L / 100) * 3) spawn("fresh");
    for (let k = 0; k < speed; k++) stepParts(dt);
    drawScene(); side();
    if (simT >= M.T) { playing = false; $("th-play").textContent = "Replay"; return; }
    raf = requestAnimationFrame(frame);
  }
  function play() { if (simT >= M.T) restart(); playing = true; last = performance.now(); $("th-play").textContent = "Pause"; if (!raf) raf = requestAnimationFrame(frame); }
  function pause() { playing = false; $("th-play").textContent = "Play"; }
  function restart() { simT = 0; parts = []; spawnAcc = 0; side(); drawScene(); }
  function close() {
    pause(); $("theatre").hidden = true; document.body.classList.remove("no-scroll");
    if (prevFocus) prevFocus.focus();
  }

  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    cvs = document.createElement("canvas"); cvs.className = "th-canvas"; cvs.setAttribute("aria-hidden", "true");
    $("th-stage").appendChild(cvs); ctx = cvs.getContext("2d");
    $("th-close").addEventListener("click", close);
    $("theatre").addEventListener("click", (e) => { if (e.target.id === "theatre") close(); });
    document.addEventListener("keydown", (e) => { if (!$("theatre").hidden && e.key === "Escape") close(); });
    $("th-play").addEventListener("click", () => (playing ? pause() : play()));
    $("th-restart").addEventListener("click", () => { restart(); play(); });
    $("th-speed").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      speed = +b.dataset.v; $("th-speed").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }));
    let rT; window.addEventListener("resize", () => { if ($("theatre").hidden) return; clearTimeout(rT); rT = setTimeout(() => { size(); drawScene(); side(); }, 120); });
  }

  /** d: { label, reach, plain, vals, F, S, K, L } — the simulator's typical future */
  SM.playScenario = function (d) {
    wire();
    D = d; M = model(d);
    prevFocus = document.activeElement;
    $("th-title").textContent = d.label;
    $("th-kick").textContent = `Playing out the typical future · ${d.reach}`;
    $("th-note").textContent = "Each dot is a share of normal monthly demand. This is a simplified month-by-month view of the typical future; the headline numbers come from the full 10,000-future simulation.";
    $("theatre").hidden = false; document.body.classList.add("no-scroll");
    size(); restart();
    $("th-close").focus();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { simT = M.T; side(); drawScene(); $("th-play").textContent = "Replay"; }
    else play();
  };
})();
