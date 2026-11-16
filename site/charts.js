/* The Shadow Market: small SVG chart kit + tooltip. No dependencies. */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const SM = (window.SM = window.SM || {});

  SM.svg = function (tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };
  SM.h = function (tag, attrs = {}, html) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
    if (html !== undefined) n.innerHTML = html;
    return n;
  };
  SM.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- formatting ---------- */
  SM.usd = function (v, digits) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(digits ?? (a >= 1e10 ? 1 : 2)) + "bn";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(digits ?? (a >= 1e8 ? 0 : 1)) + "m";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(0) + "k";
    return "$" + Math.round(v);
  };
  SM.pct = (v, d = 1) => (v === null || v === undefined || isNaN(v) ? "—" : (+v).toFixed(d) + "%");
  SM.int = (v) => (v === null || v === undefined || isNaN(v) ? "—" : Math.round(v).toLocaleString("en-US"));

  SM.COL = {
    E0: "#0f1b33", E1: "#22386c", E2: "#4467a6", E3: "#8eaad6", A1: "#a8432f", R1: "#c8841a",
    shadow: "#efd9a7", clean: "#ffffff", untraced: "#c4c8d0", navy: "#22386c", peri: "#4467a6", ink3: "#6b7690",
    accent: "#c8841a", brick: "#a8432f", ok: "#8eaad6", ghost: "#6b7690",
  };

  /* ---------- tooltip ---------- */
  const tip = () => document.getElementById("tip");
  SM.showTip = function (html, ev) {
    const t = tip();
    t.innerHTML = html;
    t.classList.add("on");
    SM.moveTip(ev);
  };
  SM.moveTip = function (ev) {
    const t = tip();
    if (!ev) return;
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
    t.style.left = Math.max(8, x) + "px";
    t.style.top = Math.max(8, y) + "px";
  };
  SM.hideTip = () => tip().classList.remove("on");
  SM.bindTip = function (node, htmlFn) {
    node.addEventListener("mouseenter", (e) => SM.showTip(typeof htmlFn === "function" ? htmlFn() : htmlFn, e));
    node.addEventListener("mousemove", SM.moveTip);
    node.addEventListener("mouseleave", SM.hideTip);
    node.addEventListener("focus", (e) => { const r = node.getBoundingClientRect(); SM.showTip(typeof htmlFn === "function" ? htmlFn() : htmlFn, { clientX: r.left, clientY: r.bottom }); });
    node.addEventListener("blur", SM.hideTip);
  };

  function size(container, h) {
    const w = Math.max(280, container.clientWidth || 600);
    return { w, h };
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  SM.niceMax = niceMax;
  function niceStep(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  // split a label into at most two lines near the middle, only if longer than maxChars
  function wrap2(label, maxChars) {
    if (label.length <= maxChars) return [label];
    const words = label.split(" ");
    let best = [label], bestD = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      const d = Math.abs(a.length - b.length);
      if (d < bestD) { bestD = d; best = [a, b]; }
    }
    return best;
  }

  /* ---------- step chart (exposure curve, one dial) ---------- */
  SM.stepChart = function (container, steps, opts = {}) {
    container.innerHTML = "";
    const { w } = size(container), h = opts.height || 210;
    const m = { t: 26, r: 14, b: 46, l: 40 };
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": opts.title || "Exposure curve" }, container);
    const rawMax = Math.max(...steps.map((d) => d.y), 1) * 1.12;
    const yStep = niceMax(rawMax / 4) === rawMax / 4 ? rawMax / 4 : niceStep(rawMax / 4);
    const yMax = opts.yMax || yStep * 4;
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    const n = steps.length, bw = iw / n;
    const Y = (v) => m.t + ih - (v / yMax) * ih;
    const g = SM.svg("g", { class: "grid" }, s);
    for (let i = 0; i <= 4; i++) {
      const v = (yMax / 4) * i;
      SM.svg("line", { x1: m.l, x2: w - m.r, y1: Y(v), y2: Y(v) }, g);
      SM.svg("text", { x: m.l - 8, y: Y(v) + 4, "text-anchor": "end" }, s).textContent = opts.fmtAxis ? opts.fmtAxis(v) : Math.round(v) + "%";
    }
    // step path
    let d = "";
    steps.forEach((p, i) => {
      const x0 = m.l + i * bw, x1 = x0 + bw, y = Y(p.y);
      d += (i === 0 ? `M${x0},${y}` : `L${x0},${y}`) + `L${x1},${y}`;
    });
    SM.svg("path", { d: d + `L${m.l + iw},${Y(0)}L${m.l},${Y(0)}Z`, fill: "rgba(34,56,108,0.08)" }, s);
    SM.svg("path", { d, fill: "none", stroke: SM.COL.navy, "stroke-width": 2, "stroke-linejoin": "round" }, s);
    steps.forEach((p, i) => {
      const cx = m.l + i * bw + bw / 2, y = Y(p.y);
      if (p.cliff) {
        SM.svg("line", { x1: m.l + i * bw, x2: m.l + i * bw, y1: Y(steps[i - 1].y), y2: y, stroke: SM.COL.accent, "stroke-width": 3 }, s);
        const t = SM.svg("text", { x: m.l + i * bw + 6, y: y - 8, class: "lbl-strong" }, s);
        t.textContent = "Jump";
        t.setAttribute("style", "fill:#9a6210");
      }
      if (p.current) SM.svg("circle", { cx, cy: y, r: 5, fill: SM.COL.navy, stroke: "#fff", "stroke-width": 2 }, s);
      const v = SM.svg("text", { x: cx, y: y - (p.cliff ? 22 : 8), "text-anchor": "middle", class: p.current ? "lbl-strong" : "" }, s);
      v.textContent = opts.fmt ? opts.fmt(p.y) : p.y.toFixed(1) + "%";
      // x labels (wrap to two lines)
      const lines = wrap2(p.label.replace(/^\+ /, "+\u00a0"), Math.max(10, bw / 6.5));
      lines.forEach((ln, k) => {
        const tx = SM.svg("text", { x: cx, y: h - m.b + 18 + k * 14, "text-anchor": "middle", class: p.current ? "lbl-strong" : "" }, s);
        tx.textContent = ln;
      });
      const hit = SM.svg("rect", { x: m.l + i * bw, y: m.t, width: bw, height: ih, class: "hit", tabindex: 0 }, s);
      SM.bindTip(hit, () => opts.tip ? opts.tip(p, i) : `<b>${SM.esc(p.label)}</b><br>${p.y.toFixed(1)}%`);
    });
    SM.svg("line", { x1: m.l, x2: w - m.r, y1: Y(0), y2: Y(0), stroke: "rgba(34,56,108,0.35)" }, s);
    return s;
  };

  /* ---------- alluvial chain (stacked columns + ribbons) ---------- */
  // columns: [{id,label,total,segments:[{cat,value,label}]}]; cats: ordered [{id,label,color}]
  SM.alluvial = function (container, columns, cats, opts = {}) {
    container.innerHTML = "";
    const { w } = size(container), h = opts.height || 380;
    const m = w < 640 ? { t: 46, r: 10, b: 50, l: 10 } : { t: 30, r: 10, b: 34, l: 10 };
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": "Supply chain flow by exposure category" }, container);
    const n = columns.length, colW = Math.min(118, (w - m.l - m.r) / (n * 2.2));
    const gapX = (w - m.l - m.r - colW * n) / (n - 1);
    const ih = h - m.t - m.b, segGap = 2;
    const colTot = (col) => col.segments.reduce((a, b) => a + (b.value || 0), 0);
    const maxTot = Math.max(...columns.map(colTot), 1);
    const pos = columns.map((col, ci) => {
      const x = m.l + ci * (colW + gapX);
      const segs = cats.map((c) => col.segments.find((sg) => sg.cat === c.id) || { cat: c.id, value: 0 }).filter((sg) => sg.value > 0);
      const tot = segs.reduce((a, b) => a + b.value, 0) || 1;
      const scale = opts.absolute ? tot / maxTot : 1;
      const usable = (ih - segGap * Math.max(0, segs.length - 1)) * scale;
      let y = m.t;
      const out = {};
      segs.forEach((sg) => {
        const hh = Math.max(2, (sg.value / tot) * usable);
        out[sg.cat] = { x, y, h: hh, v: sg.value, share: sg.value / tot, sg };
        y += hh + segGap;
      });
      return { x, col, out };
    });
    // ribbons between consecutive columns, same category
    for (let ci = 0; ci < n - 1; ci++) {
      const a = pos[ci], b = pos[ci + 1];
      cats.forEach((c) => {
        const A = a.out[c.id], B = b.out[c.id];
        if (!A || !B) return;
        const x0 = A.x + colW, x1 = B.x, mx = (x0 + x1) / 2;
        const d = `M${x0},${A.y}C${mx},${A.y} ${mx},${B.y} ${x1},${B.y}L${x1},${B.y + B.h}C${mx},${B.y + B.h} ${mx},${A.y + A.h} ${x0},${A.y + A.h}Z`;
        const dashed = a.col.pending || b.col.pending;
        const r = SM.svg("path", { d, fill: c.color, "fill-opacity": c.id === "clean" ? 0.55 : 0.28, stroke: dashed ? "rgba(34,56,108,0.25)" : "none", "stroke-dasharray": dashed ? "3 3" : null }, s);
        SM.bindTip(r, () => `<b>${SM.esc(c.label)}</b><br>${SM.esc(a.col.label)} → ${SM.esc(b.col.label)}`);
      });
    }
    pos.forEach((p) => {
      // Wrap labels to the space between column centres so neighbours never collide on narrow screens
      const slot = pos.length > 1 ? (w - m.l - m.r) / pos.length : w, maxCh = Math.max(6, Math.floor(slot / 6.6));
      const wrap = (str) => { const out = []; let line = ""; String(str || "").split(/\s+/).forEach((wd) => { if (line && (line + " " + wd).length > maxCh) { out.push(line); line = wd; } else line = line ? line + " " + wd : wd; }); if (line) out.push(line); return out; };
      const put = (lines, y0, cls, up) => { const t = SM.svg("text", { x: p.x + colW / 2, y: up ? y0 - (lines.length - 1) * 13 : y0, "text-anchor": "middle", ...(cls ? { class: cls } : {}) }, s);
        lines.forEach((ln, i) => { const ts = SM.svg("tspan", { x: p.x + colW / 2, dy: i ? 13 : 0 }, t); ts.textContent = ln; }); };
      put(wrap(p.col.label), m.t - 12, "lbl-strong", true);
      put(wrap(p.col.sub), h - m.b + 20, "", false);
      cats.forEach((c) => {
        const S = p.out[c.id];
        if (!S) return;
        const r = SM.svg("rect", { x: p.x, y: S.y, width: colW, height: S.h, rx: 2, fill: c.color, stroke: c.id === "clean" ? "#b8c2d4" : "none", tabindex: 0 }, s);
        if (p.col.pending) r.setAttribute("stroke-dasharray", "4 3"), r.setAttribute("stroke", "rgba(34,56,108,0.45)");
        SM.bindTip(r, () => opts.tip ? opts.tip(p.col, c, S) : `<b>${SM.esc(c.label)}</b><br>${SM.esc(p.col.label)}: ${(S.share * 100).toFixed(1)}%`);
        if (!p.col.pending && S.h > 22 && S.share > 0.04) {
          const dark = ["E0", "E1", "E2", "A1"].includes(c.id);
          const t = SM.svg("text", { x: p.x + 8, y: S.y + 16, style: `fill:${dark ? "#fff" : "#22386c"};font-weight:600` }, s);
          t.textContent = (S.share * 100).toFixed(0) + "%";
        }
      });
    });
    return s;
  };

  /* ---------- simulation: where the supply goes (funnel, % of US supply) ---------- */
  SM.funnel = function (container, rows, opts = {}) {
    container.innerHTML = "";
    const { w } = size(container);
    const narrow = w < 560;
    const rh = narrow ? 64 : 52, m = { t: 4, r: 64, b: 22, l: narrow ? 0 : 230 };
    const h = m.t + m.b + rows.length * rh;
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": "Where the supply goes, typical future: " + rows.map((r) => `${r.label} ${r.p50.toFixed(1)}% (9 in 10 futures ${r.p5.toFixed(1)} to ${r.p95.toFixed(1)}%)`).join("; ") }, container);
    const iw = w - m.l - m.r, X = (v) => m.l + (Math.max(0, Math.min(100, v)) / 100) * iw;
    const g = SM.svg("g", { class: "grid" }, s);
    [0, 25, 50, 75, 100].forEach((v) => {
      SM.svg("line", { x1: X(v), x2: X(v), y1: m.t, y2: h - m.b }, g);
      SM.svg("text", { x: X(v), y: h - 6, "text-anchor": "middle", style: "fill:#6b7690;font-size:11px" }, s).textContent = v + "%";
    });
    rows.forEach((r, i) => {
      const y = m.t + i * rh, by = narrow ? y + 26 : y + 12, bh = narrow ? 22 : rh - 24;
      const lx = narrow ? 0 : m.l - 14, anchor = narrow ? "start" : "end";
      SM.svg("text", { x: lx, y: narrow ? y + 14 : y + 24, "text-anchor": anchor, class: "lbl-strong" }, s).textContent = r.label;
      if (!narrow && r.sub) SM.svg("text", { x: lx, y: y + 39, "text-anchor": anchor, style: "fill:#6b7690;font-size:11.5px" }, s).textContent = r.sub;
      SM.svg("rect", { x: m.l, y: by, width: iw, height: bh, fill: "rgba(34,56,108,0.05)" }, s);
      const bar = SM.svg("rect", { x: m.l, y: by, width: Math.max(r.p50 > 0 ? 2 : 0, X(r.p50) - m.l), height: bh, fill: r.color, class: "anim" }, s);
      if (r.p95 - r.p5 > 0.2) {
        SM.svg("line", { x1: X(r.p5), x2: X(r.p95), y1: by + bh / 2, y2: by + bh / 2, stroke: r.dark ? "#fff" : "#0f1b33", "stroke-width": 1.5, opacity: 0.75 }, s);
        [r.p5, r.p95].forEach((v) => SM.svg("line", { x1: X(v), x2: X(v), y1: by + bh / 2 - 5, y2: by + bh / 2 + 5, stroke: r.dark ? "#fff" : "#0f1b33", "stroke-width": 1.5, opacity: 0.75 }, s));
      }
      if (r.prev !== undefined && r.prev !== null && Math.abs(r.prev - r.p50) > 0.3) {
        SM.svg("line", { x1: X(r.prev), x2: X(r.prev), y1: by - 4, y2: by + bh + 4, stroke: SM.COL.accent, "stroke-width": 2.5 }, s);
      }
      SM.svg("text", { x: X(Math.max(r.p50, r.p95)) + 8, y: by + bh / 2 + 5, class: "lbl-strong", style: "font-size:14px" }, s).textContent = r.p50.toFixed(r.p50 < 10 && r.p50 > 0 ? 1 : 0) + "%";
      const hit = SM.svg("rect", { x: 0, y, width: w, height: rh, class: "hit" }, s);
      SM.bindTip(hit, () => `<b>${SM.esc(r.label)}</b><br>Typical future: ${r.p50.toFixed(1)}% of US supply<br>9 in 10 futures: ${r.p5.toFixed(1)}–${r.p95.toFixed(1)}%${r.prev != null ? `<br><span style="color:#9a6210">Your last setting: ${r.prev.toFixed(1)}%</span>` : ""}${r.tip ? `<div class="t-src">${r.tip}</div>` : ""}`);
    });
    return s;
  };

  /* ---------- simulation: 100 futures (HTML grid so colours animate) ---------- */
  SM.futures = function (container, cats) {
    let grid = container.querySelector(".futures");
    if (!grid) { container.innerHTML = '<div class="futures" role="img"></div>'; grid = container.querySelector(".futures"); for (let i = 0; i < 100; i++) grid.appendChild(document.createElement("i")); }
    // largest-remainder rounding so the squares add up to exactly 100
    const raw = cats.map((c) => c.share), fl = raw.map(Math.floor);
    let left = 100 - fl.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { fl[i]++; left--; } });
    const cells = grid.children; let k = 0;
    cats.forEach((c, i) => { for (let n = 0; n < fl[i]; n++, k++) { cells[k].style.background = c.color; cells[k].className = c.id; cells[k].title = c.label; } });
    grid.setAttribute("aria-label", cats.map((c, i) => `${fl[i]} in 100 futures: ${c.label}`).join("; "));
    return fl;
  };

  /* ---------- simulation: distribution of outcomes, with your last setting as an outline ---------- */
  SM.distChart = function (container, values, prev, opts = {}) {
    container.innerHTML = "";
    const { w } = size(container), h = opts.height || 220;
    const m = { t: 26, r: 14, b: 40, l: 14 };
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": `Spread of supply lost across futures: median ${SM.quantile(values, 0.5).toFixed(1)}%, 9 in 10 futures between ${SM.quantile(values, 0.05).toFixed(1)}% and ${SM.quantile(values, 0.95).toFixed(1)}%` }, container);
    const xMax = opts.xMax || 100, bins = 50, bwv = xMax / bins;
    const count = (arr) => { const c = new Array(bins).fill(0); arr.forEach((v) => c[Math.min(bins - 1, Math.max(0, Math.floor(v / bwv)))]++); return c.map((x) => x / arr.length); };
    const cur = count(values), pv = prev ? count(prev) : null;
    const yMax = Math.max(...cur, ...(pv || [0]), 0.001);
    const iw = w - m.l - m.r, ih = h - m.t - m.b, bw = iw / bins;
    const X = (v) => m.l + (v / xMax) * iw, Y = (c) => m.t + ih - (c / yMax) * ih;
    cur.forEach((c, i) => {
      if (!c) return;
      const over = opts.threshold !== undefined && i * bwv >= opts.threshold;
      const r = SM.svg("rect", { x: m.l + i * bw + 0.5, y: Y(c), width: Math.max(1, bw - 1), height: m.t + ih - Y(c), fill: over ? SM.COL.brick : SM.COL.E1 }, s);
      SM.bindTip(r, () => `<b>${(i * bwv).toFixed(0)}–${((i + 1) * bwv).toFixed(0)}% of supply lost</b><br>${(c * 100).toFixed(1)}% of futures`);
    });
    if (pv) {
      let d = `M${m.l},${Y(0)}`;
      pv.forEach((c, i) => { d += `L${m.l + i * bw},${Y(c)}L${m.l + (i + 1) * bw},${Y(c)}`; });
      SM.svg("path", { d: d + `L${m.l + iw},${Y(0)}`, fill: "none", stroke: SM.COL.accent, "stroke-width": 2, "stroke-dasharray": "4 3" }, s);
    }
    if (opts.threshold !== undefined) {
      const tx = X(Math.min(opts.threshold, xMax));
      SM.svg("line", { x1: tx, x2: tx, y1: m.t - 10, y2: m.t + ih, stroke: SM.COL.brick, "stroke-width": 1.5, "stroke-dasharray": "3 3" }, s);
      SM.svg("text", { x: tx + (tx > w - 170 ? -6 : 6), y: m.t - 12, "text-anchor": tx > w - 170 ? "end" : "start", style: `fill:${SM.COL.brick};font-weight:600` }, s).textContent = `Serious disruption (${opts.threshold}%+)`;
    }
    for (let i = 0; i <= 4; i++) {
      const v = (xMax / 4) * i;
      SM.svg("text", { x: X(v), y: m.t + ih + 18, "text-anchor": i === 0 ? "start" : i === 4 ? "end" : "middle" }, s).textContent = Math.round(v) + "%";
    }
    SM.svg("line", { x1: m.l, x2: w - m.r, y1: m.t + ih, y2: m.t + ih, stroke: "rgba(15,27,51,0.35)" }, s);
    SM.svg("text", { x: m.l + iw / 2, y: h - 4, "text-anchor": "middle", style: "fill:#6b7690" }, s).textContent = "share of US solar supply lost for good";
    return s;
  };

  /* ---------- simulation: outcome at every reach level ---------- */
  SM.reachChart = function (container, pts, opts = {}) {
    container.innerHTML = "";
    const { w } = size(container), h = opts.height || 250;
    const m = { t: 22, r: 8, b: 46, l: 38 };
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": "Typical supply lost at each reach: " + pts.map((p) => `${p.short} ${p.p50.toFixed(1)}%`).join("; ") }, container);
    const iw = w - m.l - m.r, ih = h - m.t - m.b, n = pts.length, bw = iw / n;
    const yMax = opts.yMax || 100, Y = (v) => m.t + ih - (Math.min(v, yMax) / yMax) * ih;
    const g = SM.svg("g", { class: "grid" }, s);
    for (let i = 0; i <= 4; i++) { const v = (yMax / 4) * i; SM.svg("line", { x1: m.l, x2: w - m.r, y1: Y(v), y2: Y(v) }, g); SM.svg("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end" }, s).textContent = Math.round(v) + "%"; }
    if (opts.threshold !== undefined && opts.threshold <= yMax) SM.svg("line", { x1: m.l, x2: w - m.r, y1: Y(opts.threshold), y2: Y(opts.threshold), stroke: SM.COL.brick, "stroke-width": 1.5, "stroke-dasharray": "3 3" }, s);
    pts.forEach((p, i) => {
      const cx = m.l + i * bw + bw / 2, bwid = Math.min(46, bw * 0.56);
      const over = opts.threshold !== undefined && p.p50 > opts.threshold;
      SM.svg("rect", { x: cx - bwid / 2, y: Y(p.p50), width: bwid, height: Math.max(0, Y(0) - Y(p.p50)), fill: over ? SM.COL.brick : p.sel ? SM.COL.E1 : SM.COL.E3 }, s);
      if (p.p95 - p.p5 > 0.3) {
        SM.svg("line", { x1: cx, x2: cx, y1: Y(p.p5), y2: Y(p.p95), stroke: "#0f1b33", "stroke-width": 1.2 }, s);
        [p.p5, p.p95].forEach((v) => SM.svg("line", { x1: cx - 5, x2: cx + 5, y1: Y(v), y2: Y(v), stroke: "#0f1b33", "stroke-width": 1.2 }, s));
      }
      SM.svg("text", { x: cx, y: Y(p.p95) - 7, "text-anchor": "middle", class: p.sel ? "lbl-strong" : "" }, s).textContent = p.p50.toFixed(p.p50 < 10 && p.p50 > 0 ? 1 : 0) + "%";
      const lines = wrap2(p.short, Math.max(7, bw / 6.5));
      lines.forEach((ln, k) => SM.svg("text", { x: cx, y: h - m.b + 16 + k * 13, "text-anchor": "middle", class: p.sel ? "lbl-strong" : "", style: p.sel ? "" : "font-size:11.5px" }, s).textContent = ln);
      if (p.sel) SM.svg("rect", { x: m.l + i * bw + 2, y: m.t - 14, width: bw - 4, height: ih + 14 + 40, fill: "none", stroke: SM.COL.E1, "stroke-width": 1 }, s);
      const hit = SM.svg("rect", { x: m.l + i * bw, y: m.t - 14, width: bw, height: ih + 54, class: "hit", style: "cursor:pointer", tabindex: 0, role: "button", "aria-label": p.short }, s);
      SM.bindTip(hit, () => (opts.tip ? opts.tip(p) : ""));
      if (opts.onPick) { hit.addEventListener("click", () => opts.onPick(i)); hit.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onPick(i); } }); }
    });
    return s;
  };

  /* ---------- simulation: what matters most (sensitivity) ---------- */
  SM.tornado = function (container, rows, base, opts = {}) {
    container.innerHTML = "";
    const { w } = size(container);
    const narrow = w < 520;
    const rh = narrow ? 50 : 34, m = { t: 8, r: 56, b: 30, l: narrow ? 8 : Math.min(250, w * 0.42) };
    const h = m.t + m.b + rows.length * rh;
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": "What changes the result most, largest first: " + rows.map((r) => `${r.label} ±${(Math.abs(r.hi - r.lo) / 2).toFixed(1)} points`).join("; ") }, container);
    const lo = Math.min(base, ...rows.map((r) => Math.min(r.lo, r.hi))), hi = Math.max(base, ...rows.map((r) => Math.max(r.lo, r.hi)));
    const pad = (hi - lo) * 0.06 || 1;
    const X = (v) => m.l + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (w - m.l - m.r);
    rows.forEach((r, i) => {
      const y = m.t + i * rh, by = narrow ? y + 20 : y + 7, bh = narrow ? 20 : rh - 14;
      SM.svg("text", { x: narrow ? m.l : m.l - 12, y: narrow ? y + 14 : y + rh / 2 + 4, "text-anchor": narrow ? "start" : "end", class: i === 0 ? "lbl-strong" : "" }, s).textContent = r.label;
      const a = Math.min(r.lo, r.hi), b = Math.max(r.lo, r.hi);
      const bar = SM.svg("rect", { x: X(a), y: by, width: Math.max(2, X(b) - X(a)), height: bh, fill: i === 0 ? SM.COL.accent : SM.COL.E3 }, s);
      SM.bindTip(bar, () => opts.tip ? opts.tip(r) : "");
      SM.svg("text", { x: X(b) + 6, y: by + bh / 2 + 4, style: "font-size:12px" }, s).textContent = "±" + (Math.abs(r.hi - r.lo) / 2).toFixed(1) + " pts";
    });
    SM.svg("line", { x1: X(base), x2: X(base), y1: m.t - 4, y2: h - m.b + 4, stroke: SM.COL.navy, "stroke-width": 1.5 }, s);
    SM.svg("text", { x: X(base), y: h - 8, "text-anchor": "middle", class: "lbl-strong" }, s).textContent = "typical loss " + base.toFixed(1) + "%";
    return s;
  };

  /* ---------- stacked horizontal bars (enforcement outcomes) ---------- */
  SM.outcomeBars = function (container, rows, cats, opts = {}) {
    container.innerHTML = "";
    const { w } = size(container);
    const rh = 50, m = { t: 6, r: 8, b: 8, l: Math.min(150, w * 0.32) };
    const h = m.t + m.b + rows.length * rh;
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": opts.title || "Enforcement outcomes" }, container);
    const iw = w - m.l - m.r;
    rows.forEach((r, i) => {
      const y = m.t + i * rh;
      SM.svg("text", { x: 0, y: y + 18, class: "lbl-strong" }, s).textContent = r.label;
      SM.svg("text", { x: 0, y: y + 34, style: "fill:#6f7896" }, s).textContent = r.sub || "";
      const tot = cats.reduce((a, c) => a + (r.values[c.id] || 0), 0) || 1;
      let x = m.l;
      cats.forEach((c) => {
        const v = r.values[c.id] || 0;
        if (!v) return;
        const ww = (v / tot) * iw;
        const rect = SM.svg("rect", { x, y: y + 8, width: Math.max(1, ww - 2), height: rh - 20, rx: 2, fill: c.color }, s);
        SM.bindTip(rect, () => (opts.tip ? opts.tip(r, c, v, tot) : `${c.label}: ${v}`));
        if (ww > 46) {
          const t = SM.svg("text", { x: x + 7, y: y + 8 + (rh - 20) / 2 + 4, style: `fill:${c.textColor || "#fff"};font-weight:600` }, s);
          t.textContent = ((v / tot) * 100).toFixed(0) + "%";
        }
        x += ww;
      });
    });
    return s;
  };

  SM.quantile = function (arr, q) {
    if (!arr.length) return NaN;
    const a = arr._sorted || (arr._sorted = Float64Array.from(arr).sort());
    const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return a[lo] + (a[hi] - a[lo]) * (i - lo);
  };
})();
