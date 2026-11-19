/* The Shadow Market: "Play it out".
   Opens on the starting scenario (adjustable; changes run through the real simulator), then plays the typical
   future month by month. Every shipment (dot) ends in one of three places: let through, held at the border
   (then released or kept out), or kept out, and some kept-out supply gets back in another way.
   US warehouse stock covers the gap until replacement suppliers reach full volume.
   Stock follows the simulator's own simplification (sim.js, DECISIONS #37): while reviews run the gap is
   everything stopped; after that it is the supply lost for good, until new suppliers are qualified (ramp)
   and scaled (lost ÷ capacity). */
(function () {
  const SM = (window.SM = window.SM || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => SM.esc(s);
  const f1 = (v) => (v > 0 && v < 10 ? v.toFixed(1) : String(Math.round(v)));
  const COL = { pass: "#8eaad6", flag: "#f0b347", held: "#e09a2c", rel: "#eef3fb", out: "#e2876f", back: "#c9b6e4", fresh: "#7fa2e0" };
  const MONTH_MS = 1150, RATE = 40; // dots per month of normal demand: one dot = 2.5% of a month's supply

  /* ---------------- model (same assumptions as sim.js) ---------------- */
  function model(d) {
    const v = d.vals, det = v.detention || 0, ramp = v.ramp, cap = Math.max(0.1, v.capacity), stock0 = v.buffer * 100;
    const L = d.L, Sx = d.S;
    const tRep = L > 0.05 ? ramp + L / cap : 0;
    const T = Math.max(18, Math.min(36, Math.ceil(Math.max(tRep + 4, det + 4))));
    const gap = (t) => (Sx < 0.05 ? 0 : t < det ? Sx : t < tRep ? L : 0);
    const dt = 0.05, pts = [];
    let stock = stock0;
    for (let t = 0; t <= T + 1e-9; t += dt) {
      const g = gap(t), short = stock <= 0 && g > 0;
      pts.push({ t, stock: Math.max(0, stock), short, unmet: short ? g : 0 });
      stock -= g * dt;
    }
    return { T, det, ramp, tRep, stock0, L, S: Sx, K: d.K, F: d.F, gap, pts, at: (tt) => pts[Math.min(pts.length - 1, Math.max(0, Math.round(tt / dt)))] };
  }
  const fates = (d) => [
    { id: "pass", label: "Let straight through", sub: "not flagged, or flagged but not stopped", v: 100 - d.S, col: COL.pass },
    { id: "rel", label: "Held at the border, then released", sub: `after about ${A.fmtVal("detention", d.vals.detention)} of review`, v: d.S - d.K, col: COL.rel },
    { id: "back", label: "Kept out, but gets back in", sub: "another way, such as through another country", v: d.K - d.L, col: COL.back },
    { id: "out", label: "Kept out for good", sub: "lost to the US market", v: d.L, col: COL.out },
  ];

  /* ---------------- state ---------------- */
  let A = null, D = null, M = null, raf = 0, playing = false, simT = 0, last = 0, speed = 1, parts = [], pops = [], spawnAcc = 0;
  let W = 0, H = 0, cvs, ctx, dpr = 1, prevFocus = null, tl = null, flashT = -1, tally = null, lastPop = {}, yardSlots = [], binSlots = [];

  /* ---------------- setup screen ---------------- */
  const KNOBS = [
    { id: "p_enf", label: "Customs stops", tail: "of flagged shipments" },
    { id: "release", label: "Released after review", tail: "of stopped shipments" },
    { id: "detention", label: "Review takes", tail: "" },
    { id: "reroute", label: "Gets back in another way", tail: "of kept-out supply" },
    { id: "buffer", label: "Stock in US warehouses", tail: "of demand" },
  ];
  function renderSetup() {
    D = A.data();
    $("th-title").textContent = D.label;
    $("th-kick").textContent = "Play it out · set the starting scenario, then press play";
    $("th-presets").innerHTML = A.SIM.presets.map((p) => `<button type="button" data-p="${p.id}" aria-pressed="${D.preset === p.id}"><b>${esc(p.label)}</b><span>${esc(p.blurb)}</span></button>`).join("") +
      (D.preset ? "" : `<p class="th-own">Your own settings, from the simulator.</p>`);
    $("th-presets").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { A.set({ preset: b.dataset.p }); renderSetup(); }));
    const reach = `<div class="th-knob wide"><label>What the rule checks</label><div class="seg light th-reach">${A.TH.map((t, i) => `<button type="button" data-r="${i}" aria-pressed="${i === D.j}">${esc(t.short)}</button>`).join("")}</div><p class="th-plain">Customs blocks solar shipments ${esc(D.plain)}.</p></div>`;
    $("th-knobs").innerHTML = reach + KNOBS.map((k) => {
      const i = A.INP[k.id], v = D.vals[k.id];
      return `<div class="th-knob"><label for="tk-${k.id}">${esc(k.label)}</label><div class="row"><input type="range" id="tk-${k.id}" min="${i.min}" max="${i.max}" step="${i.step}" value="${v}" style="--p:${((v - i.min) / (i.max - i.min)) * 100}%"><b id="tkv-${k.id}">${esc(A.fmtVal(k.id, v))}</b></div>${k.tail ? `<span class="tail">${esc(k.tail)}</span>` : ""}</div>`;
    }).join("");
    $("th-knobs").querySelectorAll(".th-reach button").forEach((b) => b.addEventListener("click", () => { A.set({ reach: +b.dataset.r }); renderSetup(); }));
    KNOBS.forEach((k) => {
      const el = $("tk-" + k.id), i = A.INP[k.id];
      el.addEventListener("input", () => { $("tkv-" + k.id).textContent = A.fmtVal(k.id, +el.value); el.style.setProperty("--p", ((+el.value - i.min) / (i.max - i.min)) * 100 + "%"); });
      el.addEventListener("change", () => { A.set({ vals: { [k.id]: +el.value } }); renderSetup(); });
    });
    $("th-other").innerHTML = `Also from the simulator: new suppliers take <b>${esc(A.fmtVal("ramp", D.vals.ramp))}</b> to qualify, then add <b>${esc(A.fmtVal("capacity", D.vals.capacity))}</b> of demand. Change these on the What if? page.`;
    // waffle: 100 shipments
    const fs = fates(D), raw = fs.map((f) => Math.max(0, f.v)), fl = raw.map(Math.floor);
    let left = 100 - fl.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { fl[i]++; left--; } });
    const cells = []; fs.forEach((f, i) => { for (let n = 0; n < fl[i]; n++) cells.push(f); });
    $("th-waffle").innerHTML = cells.map((f, i) => `<i style="background:${f.col};animation-delay:${i * 6}ms" class="${f.id}"></i>`).join("");
    $("th-waffle").setAttribute("aria-label", fs.map((f, i) => `${fl[i]} in 100: ${f.label}`).join("; "));
    $("th-fates").innerHTML = `<li class="flagged"><b>${f1(D.F)}</b><span><em>flagged by the rule</em> (they have a link to forced-labour risk at this reach). Customs stops ${f1(D.S)}.</span></li>` +
      fs.map((f) => `<li><i style="background:${f.col}"></i><b>${f1(Math.max(0, f.v))}</b><span><em>${esc(f.label)}</em> ${esc(f.sub)}</span></li>`).join("");
    $("th-market").innerHTML = `The US starts with <b>${esc(A.fmtVal("buffer", D.vals.buffer))}</b> of solar stock. Across 10,000 simulated futures this scenario loses <b>${f1(D.L)}%</b> of supply for good in a typical future, with a <b>${Math.round(D.pShort)}%</b> chance of a shortage.`;
  }
  function showSetup() { pause(); $("th-setup").hidden = false; $("th-run").hidden = true; renderSetup(); $("th-go").focus(); }
  function showRun() {
    D = A.data(); M = model(D);
    $("th-setup").hidden = true; $("th-run").hidden = false;
    $("th-kick").textContent = `Playing out the typical future · what the rule checks: ${D.short}`;
    $("th-note").textContent = "Each dot is 2.5% of a month’s solar supply. A simplified month-by-month view of the typical future; the headline numbers come from the full 10,000-future simulation.";
    size(); restart();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { fastForward(); return; }
    play();
  }

  /* ---------------- geometry ---------------- */
  function geo() {
    const nar = W < 560;
    return {
      nar, laneY: H * 0.3, laneH: nar ? 24 : 30, srcX: 8, gateX: W * (nar ? 0.3 : 0.32),
      tank: { x0: W * 0.84, x1: W * 0.96, y0: H * 0.1, y1: H * 0.7 },
      yard: { x0: W * (nar ? 0.12 : 0.18), x1: W * (nar ? 0.46 : 0.44), y0: H * 0.5, y1: H * 0.8 },
      bin: { x0: W * (nar ? 0.54 : 0.53), x1: W * (nar ? 0.8 : 0.73), y0: H * 0.56, y1: H * 0.8 },
      joinX: W * 0.56, loopY: H * 0.93, newX: W * 0.7, newY: H * 0.04,
    };
  }
  function slots(box, step) {
    const out = [];
    for (let y = box.y0 + 22; y < box.y1 - 6; y += step) for (let x = box.x0 + 9; x < box.x1 - 6; x += step) out.push({ x, y, used: false });
    return out;
  }
  function takeSlot(list) {
    const free = list.filter((s) => !s.used);
    const s = free.length ? free[Math.floor(Math.random() * free.length)] : list[Math.floor(Math.random() * list.length)];
    if (s) s.used = true;
    return s;
  }

  /* ---------------- particles ---------------- */
  const bez = (p0, p1, p2, t) => ({ x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x, y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y });
  function pop(x, y, text, col) {
    const now = performance.now();
    if (now - (lastPop[text] || 0) < 650) return;
    lastPop[text] = now; pops.push({ x, y, text, col, life: 1 });
  }
  function spawn(prefill) {
    const g = geo(), y = g.laneY + (Math.random() - 0.5) * (g.laneH - 10);
    const flag = prefill == null && Math.random() * 100 < D.F;
    const p = { x: prefill != null ? prefill : g.srcX, y, st: "lane", kind: flag ? "flag" : "pass", c: flag ? COL.flag : COL.pass };
    if (flag) {
      const stopped = Math.random() < (D.F > 0 ? D.S / D.F : 0);
      p.fate = !stopped ? "pass" : Math.random() < (D.S > 0 ? D.K / D.S : 0) ? (Math.random() < (D.K > 0 ? (D.K - D.L) / D.K : 0) ? "back" : "out") : "rel";
    } else p.fate = "pass";
    p.px = p.x; p.py = p.y;
    parts.push(p);
  }
  function step(dtMs) {
    const g = geo(), v = ((g.tank.x0 - g.srcX) / (MONTH_MS * 0.6)) * dtMs, mo = dtMs / MONTH_MS;
    for (const p of parts) {
      p.px = p.x; p.py = p.y;
      if (p.st === "lane") {
        p.x += v;
        if (p.kind === "flag" && p.fate !== "pass" && !p.checked && p.x >= g.gateX) {
          p.checked = true; p.st = "drop"; p.a = 0; p.slot = takeSlot(yardSlots); p.from = { x: p.x, y: p.y };
          p.heldAt = simT; p.releaseAt = simT + M.det; flashT = performance.now(); p.c = COL.held;
          pop(g.gateX + 30, g.laneY + g.laneH / 2 + 16, "Stopped", COL.flag);
        } else if (p.kind === "flag" && !p.checked && p.x >= g.gateX) { p.checked = true; }
        if (p.x >= g.tank.x0) { p.dead = true; tally[p.kind === "rel" ? "rel" : p.kind === "back" ? "back" : "pass"]++; }
      } else if (p.st === "drop") {
        p.a = Math.min(1, p.a + mo / 0.22);
        const q = bez(p.from, { x: p.from.x, y: (p.from.y + p.slot.y) / 2 + 10 }, p.slot, p.a); p.x = q.x; p.y = q.y;
        if (p.a >= 1) p.st = "held";
      } else if (p.st === "held") {
        if (simT >= p.releaseAt) {
          p.slot.used = false; p.from = { x: p.x, y: p.y }; p.a = 0;
          if (p.fate === "rel") { p.st = "rise"; p.c = COL.rel; p.kind = "rel"; p.jy = g.laneY + (Math.random() - 0.5) * 8; pop(g.joinX + 4, (g.laneY + g.yard.y0) / 2 + 4, "Released", COL.rel); }
          else { p.st = "toBin"; p.c = COL.out; p.slot = takeSlot(binSlots); tally.out++; pop(g.nar ? (g.bin.x0 + g.bin.x1) / 2 : (g.yard.x1 + g.bin.x0) / 2, g.nar ? g.bin.y0 - 8 : (g.bin.y0 + g.bin.y1) / 2 - 4, "Kept out", COL.out); }
        }
      } else if (p.st === "rise") {
        p.a = Math.min(1, p.a + mo / 0.35);
        const q = bez(p.from, { x: g.joinX - 20, y: g.yard.y0 - 4 }, { x: g.joinX, y: p.jy }, p.a); p.x = q.x; p.y = q.y;
        if (p.a >= 1) p.st = "lane";
      } else if (p.st === "toBin") {
        p.a = Math.min(1, p.a + mo / 0.3);
        const q = bez(p.from, { x: (p.from.x + p.slot.x) / 2, y: Math.max(p.from.y, p.slot.y) + 26 }, p.slot, p.a); p.x = q.x; p.y = q.y;
        if (p.a >= 1) { p.st = "kept"; p.keptAt = simT; }
      } else if (p.st === "kept") {
        if (p.fate === "back" && simT - p.keptAt > 0.45) { p.st = "loop"; p.a = 0; p.slot.used = false; p.c = COL.back; p.from = { x: p.x, y: p.y }; }
        else if (p.fate === "out" && simT - p.keptAt > 7) { p.st = "fade"; p.life = 1; p.slot.used = false; }
      } else if (p.st === "loop") {
        // down to the bottom road, left to the start, up into the lane
        p.a = Math.min(1, p.a + mo / 1.1);
        const pts = [p.from, { x: p.from.x, y: g.loopY }, { x: g.srcX + 14, y: g.loopY }, { x: g.srcX + 14, y: g.laneY }];
        const segs = [0, 0.15, 0.85, 1], k = p.a < segs[1] ? 0 : p.a < segs[2] ? 1 : 2, u = (p.a - segs[k]) / (segs[k + 1] - segs[k]);
        p.x = pts[k].x + (pts[k + 1].x - pts[k].x) * u; p.y = pts[k].y + (pts[k + 1].y - pts[k].y) * u;
        if (p.a >= 1) { p.st = "lane"; p.kind = "back"; p.fate = "pass"; p.checked = true; p.y = g.laneY + (Math.random() - 0.5) * 12; pop(g.srcX + 44, g.laneY + g.laneH / 2 + 16, "Back in", COL.back); }
      } else if (p.st === "fade") {
        p.life -= dtMs / 1800; if (p.life <= 0) p.dead = true;
      } else if (p.st === "fresh") {
        p.a = Math.min(1, p.a + mo / 0.5);
        const q = bez({ x: g.newX, y: g.newY + 10 }, { x: (g.newX + g.tank.x0) / 2, y: g.newY }, { x: (g.tank.x0 + g.tank.x1) / 2, y: g.tank.y0 + 4 }, p.a); p.x = q.x; p.y = q.y;
        if (p.a >= 1) p.dead = true;
      }
    }
    parts = parts.filter((p) => !p.dead);
    for (const q of pops) { q.life -= dtMs / 1100; q.y -= dtMs * 0.012; }
    pops = pops.filter((q) => q.life > 0);
  }

  /* ---------------- drawing ---------------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function label(text, x, y, col, size = 12, align = "left", weight = 700) {
    ctx.font = `${weight} ${size}px 'Source Sans 3', sans-serif`; ctx.textAlign = align; ctx.fillStyle = col; ctx.fillText(text, x, y); ctx.textAlign = "left";
  }
  function draw() {
    const g = geo(), s = M.at(simT), nar = g.nar, now = performance.now(), fs = nar ? 10 : 12;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const flowOn = (v) => v > 0.05;
    // --- routes (drawn first, faint, colour-coded, dashes move with the flow) ---
    ctx.lineWidth = 1.5;
    const dash = (col, pat, fn) => { ctx.strokeStyle = col; ctx.setLineDash(pat); ctx.lineDashOffset = -((now / 40) % 100); ctx.beginPath(); fn(); ctx.stroke(); ctx.setLineDash([]); };
    if (flowOn(D.S)) dash("rgba(240,179,71,0.55)", [5, 5], () => { ctx.moveTo(g.gateX, g.laneY + g.laneH / 2); ctx.quadraticCurveTo(g.gateX, (g.laneY + g.yard.y0) / 2 + 6, (g.yard.x0 + g.yard.x1) / 2, g.yard.y0); });
    if (flowOn(D.S - D.K)) dash("rgba(238,243,251,0.5)", [5, 5], () => { ctx.moveTo(g.yard.x1 - 10, g.yard.y0); ctx.quadraticCurveTo(g.joinX - 20, g.yard.y0 - 4, g.joinX, g.laneY + g.laneH / 2); });
    if (flowOn(D.K)) dash("rgba(226,135,111,0.6)", [5, 5], () => { ctx.moveTo(g.yard.x1, (g.yard.y0 + g.yard.y1) / 2 + 6); ctx.lineTo(g.bin.x0, (g.bin.y0 + g.bin.y1) / 2 + 6); });
    if (flowOn(D.K - D.L)) dash("rgba(201,182,228,0.5)", [2, 5], () => { const x = (g.bin.x0 + g.bin.x1) / 2; ctx.moveTo(x, g.bin.y1); ctx.lineTo(x, g.loopY); ctx.lineTo(g.srcX + 14, g.loopY); ctx.lineTo(g.srcX + 14, g.laneY + g.laneH / 2); });
    if (M.L > 0.05) dash(simT >= M.ramp ? "rgba(127,162,224,0.6)" : "rgba(127,162,224,0.18)", [2, 5], () => { ctx.moveTo(g.newX, g.newY + 10); ctx.quadraticCurveTo((g.newX + g.tank.x0) / 2, g.newY, (g.tank.x0 + g.tank.x1) / 2, g.tank.y0); });
    // --- lane ---
    const lg = ctx.createLinearGradient(g.srcX, 0, g.tank.x0, 0);
    lg.addColorStop(0, "rgba(142,170,214,0.03)"); lg.addColorStop(0.35, "rgba(142,170,214,0.10)"); lg.addColorStop(1, "rgba(142,170,214,0.16)");
    ctx.fillStyle = lg; rr(g.srcX, g.laneY - g.laneH / 2, g.tank.x0 - g.srcX, g.laneH, 6); ctx.fill();
    ctx.strokeStyle = "rgba(243,245,249,0.10)"; ctx.lineWidth = 1.5;
    const off = (now / 18) % 40;
    for (let x = g.srcX + off; x < g.tank.x0 - 10; x += 40) { ctx.beginPath(); ctx.moveTo(x, g.laneY - 5); ctx.lineTo(x + 5, g.laneY); ctx.lineTo(x, g.laneY + 5); ctx.stroke(); }
    label(nar ? "TO THE US" : "SHIPMENTS HEADING FOR THE US", g.srcX + 2, g.laneY - g.laneH / 2 - 8, "rgba(243,245,249,0.65)", fs);
    label("LET THROUGH →", g.tank.x0 - 8, g.laneY - g.laneH / 2 - 8, COL.pass, fs, "right");
    // --- customs gate ---
    const flash = Math.max(0, 1 - (now - flashT) / 450);
    ctx.fillStyle = `rgba(240,179,71,${0.08 + flash * 0.35})`; rr(g.gateX - 9, g.laneY - g.laneH / 2 - 10, 18, g.laneH + 20, 3); ctx.fill();
    ctx.fillStyle = "#f3f5f9"; ctx.fillRect(g.gateX - 9, g.laneY - g.laneH / 2 - 12, 18, 3); ctx.fillRect(g.gateX - 9, g.laneY + g.laneH / 2 + 9, 18, 3);
    const beam = g.laneY - g.laneH / 2 + ((Math.sin(now / 260) + 1) / 2) * g.laneH;
    ctx.strokeStyle = `rgba(240,179,71,${0.5 + flash * 0.5})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g.gateX - 7, beam); ctx.lineTo(g.gateX + 7, beam); ctx.stroke();
    label("US CUSTOMS", g.gateX, g.laneY - g.laneH / 2 - 18, "#f3f5f9", fs, "center");
    // --- held at the border ---
    const heldN = parts.filter((p) => p.st === "held" || p.st === "drop").length;
    ctx.fillStyle = "rgba(224,154,44,0.08)"; rr(g.yard.x0, g.yard.y0, g.yard.x1 - g.yard.x0, g.yard.y1 - g.yard.y0, 6); ctx.fill();
    ctx.strokeStyle = "rgba(224,154,44,0.6)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; rr(g.yard.x0, g.yard.y0, g.yard.x1 - g.yard.x0, g.yard.y1 - g.yard.y0, 6); ctx.stroke(); ctx.setLineDash([]);
    label(nar ? "HELD" : "HELD AT THE BORDER", g.yard.x0 + 8, g.yard.y0 + 15, COL.held, fs);
    label(String(heldN), g.yard.x1 - 8, g.yard.y0 + 16, "#f3f5f9", nar ? 13 : 16, "right");
    label(nar ? `review ~${+M.det.toFixed(1)} mo` : `under review for about ${A.fmtVal("detention", M.det)}`, g.yard.x0 + 8, g.yard.y1 + (nar ? 13 : 16), "rgba(243,245,249,0.5)", nar ? 9.5 : 11, "left", 600);
    // --- kept out ---
    ctx.fillStyle = "rgba(226,135,111,0.08)"; rr(g.bin.x0, g.bin.y0, g.bin.x1 - g.bin.x0, g.bin.y1 - g.bin.y0, 6); ctx.fill();
    ctx.strokeStyle = "rgba(226,135,111,0.55)"; ctx.setLineDash([4, 4]); rr(g.bin.x0, g.bin.y0, g.bin.x1 - g.bin.x0, g.bin.y1 - g.bin.y0, 6); ctx.stroke(); ctx.setLineDash([]);
    label("KEPT OUT", g.bin.x0 + 8, g.bin.y0 + 15, COL.out, fs);
    label(String(tally.out), g.bin.x1 - 8, g.bin.y0 + 16, "#f3f5f9", nar ? 13 : 16, "right");
    if (flowOn(D.K - D.L) && !nar) label("GETS BACK IN ANOTHER WAY ←", (g.bin.x0 + g.bin.x1) / 2 - 8, g.loopY - 6, COL.back, 11, "right");
    if (flowOn(D.S - D.K) && !nar) label("RELEASED ↗", g.joinX - 26, (g.laneY + g.yard.y0) / 2 + 18, COL.rel, 11, "right");
    if (!flowOn(D.K)) label(nar ? "nothing kept out" : "nothing kept out in this scenario", g.bin.x0 + 8, g.bin.y0 + 34, "rgba(243,245,249,0.4)", nar ? 9.5 : 11, "left", 400);
    // --- warehouse tank ---
    const T = g.tank, th = T.y1 - T.y0, fill = M.stock0 > 0 ? s.stock / M.stock0 : 0, lvl = T.y1 - th * fill, low = s.stock / 100 < 1;
    ctx.fillStyle = "rgba(255,255,255,0.05)"; rr(T.x0, T.y0, T.x1 - T.x0, th, 6); ctx.fill();
    if (fill > 0) {
      ctx.save(); rr(T.x0, T.y0, T.x1 - T.x0, th, 6); ctx.clip();
      const tg = ctx.createLinearGradient(0, lvl, 0, T.y1); tg.addColorStop(0, low ? "#e2876f" : "#a9c0e6"); tg.addColorStop(1, low ? "#a8432f" : "#4467a6");
      ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(T.x0, T.y1);
      for (let x = T.x0; x <= T.x1; x += 3) ctx.lineTo(x, lvl + Math.sin(x / 7 + now / 300) * 2);
      ctx.lineTo(T.x1, T.y1); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.strokeStyle = s.short ? `rgba(226,135,111,${0.6 + 0.4 * Math.sin(now / 150)})` : "rgba(243,245,249,0.45)"; ctx.lineWidth = s.short ? 2.5 : 1; rr(T.x0, T.y0, T.x1 - T.x0, th, 6); ctx.stroke(); ctx.lineWidth = 1;
    label(nar ? "STOCK" : "US WAREHOUSES", (T.x0 + T.x1) / 2, T.y0 - 8, "#f3f5f9", fs, "center");
    label(`${(s.stock / 100).toFixed(1)} mo`, (T.x0 + T.x1) / 2, Math.min(T.y1 - 8, Math.max(T.y0 + 18, lvl + 18)), fill > 0.12 ? "#0f1b33" : "#f3f5f9", nar ? 11 : 13, "center");
    label(s.short ? "SHORTAGE" : nar ? "→ projects" : "→ solar projects", (T.x0 + T.x1) / 2, T.y1 + 18, s.short ? COL.out : "rgba(243,245,249,0.6)", nar ? 10 : 11.5, "center", s.short ? 700 : 600);
    if (M.L > 0.05) label(nar ? "NEW SUPPLIERS" : simT >= M.tRep ? "NEW SUPPLIERS · FULL VOLUME" : simT >= M.ramp ? "NEW SUPPLIERS · SCALING UP" : "NEW SUPPLIERS · NOT YET QUALIFIED", g.newX, g.newY + 6, simT >= M.ramp ? COL.fresh : "rgba(243,245,249,0.35)", nar ? 9.5 : 11, "center");
    // --- dots ---
    for (const p of parts) {
      const glow = p.kind !== "pass" || p.st !== "lane", alpha = p.st === "fade" ? Math.max(0, p.life) * 0.8 : 1;
      const dx = p.x - p.px, dy = p.y - p.py;
      if (p.st === "lane" && dx * dx + dy * dy > 0.5 && dx * dx + dy * dy < 40) { ctx.globalAlpha = alpha * 0.4; ctx.strokeStyle = p.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - dx * 4, p.y - dy * 4); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      ctx.globalAlpha = alpha;
      if (glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; }
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === "pass" && p.st === "lane" ? 2.6 : 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (p.st === "held" && M.det > 0) { // review clock: how far through its review this shipment is
        const k = Math.min(1, (simT - p.heldAt) / M.det);
        ctx.strokeStyle = "rgba(243,245,249,0.75)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, 6, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const q of pops) { ctx.globalAlpha = Math.min(1, q.life * 1.4); label(q.text, q.x, q.y, q.col, nar ? 10.5 : 12.5, "center"); }
    ctx.globalAlpha = 1;
  }

  /* ---------------- side panel + narrative ---------------- */
  function side() {
    const s = M.at(simT);
    $("th-month").textContent = Math.floor(simT);
    $("th-mprog").style.width = (simT % 1) * 100 + "%";
    const heldN = parts.filter((p) => p.st === "held" || p.st === "drop").length;
    const rows = [
      ["pass", "Let through", tally.pass, "reached US warehouses"],
      ["held", "Held at the border now", heldN, "waiting for a decision"],
      ["rel", "Released after review", tally.rel, "then let through"],
      ["out", "Kept out", tally.out, tally.back ? `${tally.back} of them got back in another way` : "turned away at the border"],
    ];
    $("th-tally").innerHTML = `<li class="th-tally-h">Shipments so far</li>` + rows.map(([k, l, n, sub]) => `<li><i style="background:${COL[k]}"></i><span><em>${l}</em>${sub}</span><b>${n}</b></li>`).join("");
    $("th-stock").textContent = `${(s.stock / 100).toFixed(1)} months of demand`;
    $("th-stock-g").style.width = (M.stock0 ? (s.stock / M.stock0) * 100 : 0) + "%";
    $("th-stock-g").classList.toggle("bad", s.short || s.stock / 100 < 1);
    let ns = "Not needed", nsP = 0;
    if (M.L > 0.05) {
      if (simT < M.ramp) { const n = Math.ceil(M.ramp - simT); ns = `Qualifying · ${n} month${n === 1 ? "" : "s"} to go`; }
      else if (simT < M.tRep) { nsP = Math.min(1, (simT - M.ramp) / (M.tRep - M.ramp)); ns = `Scaling up · ${Math.round(nsP * 100)}%`; }
      else { ns = "At full volume"; nsP = 1; }
    }
    $("th-new").textContent = ns; $("th-new-g").style.width = nsP * 100 + "%";
    let msg;
    if (M.S < 0.05) msg = `<b>Nothing is stopped.</b> At this reach the rule doesn’t flag any shipments customs would act on, so all supply is let through.`;
    else if (s.short) msg = `<b class="bad">Shortage.</b> The stock has run out, and ${f1(s.unmet)}% of normal demand can’t be met until new suppliers reach full volume.`;
    else if (simT < M.det) msg = `<b>Reviews under way.</b> Customs stops ${f1(M.S)}% of supply and holds it at the border while importers show their paperwork. Everything else is let through, and US stock covers the gap.`;
    else if (M.L <= 0.05) msg = `<b>Reviews done.</b> Almost everything held was released, so supply is back to normal.`;
    else if (simT < M.ramp) msg = `<b>Reviews done.</b> Most held shipments were released, but ${f1(M.K)}% of supply is kept out${M.K - M.L > 0.05 ? `, and ${f1(M.K - M.L)}% of that gets back in another way` : ""}. The US loses ${f1(M.L)}% for good, and stock is running down while new suppliers qualify.`;
    else if (simT < M.tRep) msg = `<b>New suppliers are scaling up.</b> Until they reach full volume, stock keeps covering the ${f1(M.L)}% that is lost for good.`;
    else msg = `<b>The gap is closed.</b> New suppliers now make up the ${f1(M.L)}% kept out for good.`;
    const st = $("th-status");
    if (st.dataset.m !== msg) { st.innerHTML = msg; st.dataset.m = msg; st.classList.remove("in"); void st.offsetWidth; st.classList.add("in"); }
    if (tl) { const x = tl.X(Math.min(simT, M.T)); tl.head.setAttribute("x1", x); tl.head.setAttribute("x2", x); tl.done.setAttribute("width", Math.max(0, x - tl.x0)); }
  }

  /* ---------------- timeline ---------------- */
  function buildTimeline() {
    const box = $("th-timeline"); box.innerHTML = "";
    const w = Math.max(280, box.clientWidth), nar = w < 560, h = nar ? 118 : 132, m = { l: nar ? 30 : 40, r: 10, t: 26, b: 24 };
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", class: "th-tl", "aria-label": "Stock in US warehouses over time" }, box);
    const iw = w - m.l - m.r, ih = h - m.t - m.b, yMax = Math.max(1, M.stock0 / 100);
    const X = (t) => m.l + (t / M.T) * iw, Y = (v) => m.t + ih - (v / 100 / yMax) * ih;
    const phases = [];
    if (M.S > 0.05) phases.push([0, Math.min(M.det, M.T), "Reviews under way", "rgba(224,154,44,0.6)"]);
    if (M.L > 0.05) {
      if (M.ramp > M.det) phases.push([M.det, Math.min(M.ramp, M.T), "Stock running down", "rgba(142,170,214,0.45)"]);
      phases.push([Math.max(M.det, M.ramp), Math.min(M.tRep, M.T), "New suppliers scaling up", "rgba(127,162,224,0.8)"]);
      if (M.tRep < M.T) phases.push([M.tRep, M.T, "Gap closed", "rgba(243,245,249,0.25)"]);
    } else if (M.S > 0.05 && M.det < M.T) phases.push([M.det, M.T, "Back to normal", "rgba(243,245,249,0.25)"]);
    phases.forEach(([a, b, lab, col]) => {
      if (b <= a) return;
      SM.svg("rect", { x: X(a), y: 6, width: Math.max(1, X(b) - X(a) - 1), height: 5, fill: col }, s);
      if (X(b) - X(a) > (nar ? 70 : 96)) SM.svg("text", { x: X(a) + 2, y: 22, style: "fill:rgba(243,245,249,0.7);font-size:10.5px" }, s).textContent = lab;
    });
    let d = `M${X(0)},${Y(0)}`;
    M.pts.forEach((p) => (d += `L${X(p.t)},${Y(p.stock)}`));
    d += `L${X(M.T)},${Y(0)}Z`;
    const defs = SM.svg("defs", {}, s), gr = SM.svg("linearGradient", { id: "thg", x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
    SM.svg("stop", { offset: 0, "stop-color": "#8eaad6", "stop-opacity": 0.55 }, gr); SM.svg("stop", { offset: 1, "stop-color": "#8eaad6", "stop-opacity": 0.05 }, gr);
    SM.svg("path", { d, fill: "url(#thg)", stroke: "#8eaad6", "stroke-width": 1.5 }, s);
    let i0 = null;
    M.pts.forEach((p, i) => {
      if (p.short && i0 === null) i0 = i;
      if ((!p.short || i === M.pts.length - 1) && i0 !== null) {
        SM.svg("rect", { x: X(M.pts[i0].t), y: m.t, width: Math.max(1, X(p.t) - X(M.pts[i0].t)), height: ih, fill: "rgba(168,67,47,0.5)" }, s);
        if (X(p.t) - X(M.pts[i0].t) > 50) SM.svg("text", { x: X(M.pts[i0].t) + 4, y: m.t + ih - 6, style: "fill:#f3c2b4;font-size:10.5px;font-weight:600" }, s).textContent = "SHORTAGE";
        i0 = null;
      }
    });
    for (let t = 0; t <= M.T; t += 6) SM.svg("text", { x: X(t), y: h - 6, "text-anchor": t === 0 ? "start" : "middle", style: "fill:rgba(243,245,249,0.6);font-size:11px" }, s).textContent = t === 0 ? "start" : `month ${t}`;
    SM.svg("text", { x: 2, y: m.t + 8, style: "fill:rgba(243,245,249,0.6);font-size:10.5px" }, s).textContent = "stock";
    SM.svg("text", { x: 2, y: m.t + 20, style: "fill:rgba(243,245,249,0.45);font-size:10px" }, s).textContent = `${f1(yMax)} mo`;
    const done = SM.svg("rect", { x: m.l, y: m.t, width: 0, height: ih, fill: "rgba(243,245,249,0.05)" }, s);
    const head = SM.svg("line", { y1: 4, y2: m.t + ih, stroke: "#f3f5f9", "stroke-width": 2 }, s);
    tl = { head, X, done, x0: m.l };
  }

  /* ---------------- loop ---------------- */
  function size() {
    const box = $("th-stage");
    W = Math.max(300, box.clientWidth); H = W < 560 ? 300 : 360;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + "px"; cvs.style.height = H + "px";
    const g = geo(); yardSlots = slots(g.yard, g.nar ? 8 : 10); binSlots = slots(g.bin, g.nar ? 8 : 10);
    buildTimeline();
  }
  function tick(dt) {
    const dm = dt / MONTH_MS;
    simT += dm;
    spawnAcc += dm * RATE;
    while (spawnAcc >= 1) { spawnAcc -= 1; spawn(); }
    if (M.L > 0.05 && simT >= M.tRep && Math.random() < dm * RATE * (M.L / 100)) parts.push({ st: "fresh", kind: "fresh", c: COL.fresh, a: 0, x: 0, y: 0, px: 0, py: 0 });
    step(dt);
  }
  function frame(now) {
    raf = 0;
    if (!playing) return;
    const dt = Math.min(64, now - last); last = now;
    for (let k = 0; k < speed; k++) tick(dt);
    draw(); side();
    if (simT >= M.T) { playing = false; $("th-play").textContent = "Replay"; return; }
    raf = requestAnimationFrame(frame);
  }
  function play() { if (simT >= M.T) restart(); playing = true; last = performance.now(); $("th-play").textContent = "Pause"; if (!raf) raf = requestAnimationFrame(frame); }
  function pause() { playing = false; if ($("th-play")) $("th-play").textContent = "Play"; }
  function restart() {
    simT = 0; parts = []; pops = []; spawnAcc = 0; tally = { pass: 0, rel: 0, out: 0, back: 0 };
    yardSlots.forEach((s) => (s.used = false)); binSlots.forEach((s) => (s.used = false));
    // shipments already on their way when the rule starts
    const g = geo(); for (let x = g.srcX; x < g.tank.x0; x += (g.tank.x0 - g.srcX) / (RATE * 0.6)) spawn(x + Math.random() * 6);
    draw(); side();
  }
  function fastForward() { // reduced motion: show the end state without animation
    while (simT < M.T) tick(0.05 * MONTH_MS);
    draw(); side(); $("th-play").textContent = "Replay";
  }
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
    $("th-go").addEventListener("click", showRun);
    $("th-change").addEventListener("click", showSetup);
    $("th-play").addEventListener("click", () => (playing ? pause() : play()));
    $("th-restart").addEventListener("click", () => { restart(); play(); });
    $("th-speed").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      speed = +b.dataset.v; $("th-speed").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }));
    let rT; window.addEventListener("resize", () => { if ($("theatre").hidden || $("th-run").hidden) return; clearTimeout(rT); rT = setTimeout(() => { size(); draw(); side(); }, 120); });
  }

  /** Opens on the starting scenario; the simulator's current settings are the starting point. */
  SM.playScenario = function () {
    A = SM.simApi; if (!A) return;
    A.ensure();
    wire();
    prevFocus = document.activeElement;
    $("theatre").hidden = false; document.body.classList.add("no-scroll");
    showSetup();
  };
})();
