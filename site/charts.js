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
    E0: "#1b1f5e", E1: "#33409e", E2: "#5b68cf", E3: "#98a3ec", A1: "#a0509a", R1: "#b06a1e",
    shadow: "#cfc8ee", clean: "#ffffff", untraced: "#b9bdc9", navy: "#22386c", peri: "#6f78cf", ink3: "#6f7896",
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
    SM.svg("path", { d: d + `L${m.l + iw},${Y(0)}L${m.l},${Y(0)}Z`, fill: "rgba(111,120,207,0.14)" }, s);
    SM.svg("path", { d, fill: "none", stroke: SM.COL.navy, "stroke-width": 2, "stroke-linejoin": "round" }, s);
    steps.forEach((p, i) => {
      const cx = m.l + i * bw + bw / 2, y = Y(p.y);
      if (p.cliff) {
        SM.svg("line", { x1: m.l + i * bw, x2: m.l + i * bw, y1: Y(steps[i - 1].y), y2: y, stroke: SM.COL.A1, "stroke-width": 3 }, s);
        const t = SM.svg("text", { x: m.l + i * bw + 6, y: y - 8, class: "lbl-strong", fill: SM.COL.A1 }, s);
        t.textContent = "Cliff";
        t.setAttribute("style", "fill:" + SM.COL.A1);
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
        const r = SM.svg("rect", { x: p.x, y: S.y, width: colW, height: S.h, rx: 2, fill: c.color, stroke: c.id === "clean" ? "#c3cde3" : "none", tabindex: 0 }, s);
        if (p.col.pending) r.setAttribute("stroke-dasharray", "4 3"), r.setAttribute("stroke", "rgba(34,56,108,0.45)");
        SM.bindTip(r, () => opts.tip ? opts.tip(p.col, c, S) : `<b>${SM.esc(c.label)}</b><br>${SM.esc(p.col.label)}: ${(S.share * 100).toFixed(1)}%`);
        if (!p.col.pending && S.h > 22 && S.share > 0.04) {
          const dark = ["E0", "E1", "E2", "A1", "R1"].includes(c.id);
          const t = SM.svg("text", { x: p.x + 8, y: S.y + 16, style: `fill:${dark ? "#fff" : "#22386c"};font-weight:600` }, s);
          t.textContent = (S.share * 100).toFixed(0) + "%";
        }
      });
    });
    return s;
  };

  /* ---------- histogram with percentile band ---------- */
  SM.histogram = function (container, values, opts = {}) {
    container.innerHTML = "";
    const { w } = size(container), h = opts.height || 230;
    const m = { t: 20, r: 12, b: 34, l: 40 };
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": opts.title || "Histogram" }, container);
    const xMax = opts.xMax || niceMax(SM.quantile(values, 0.995) || 1);
    const bins = opts.bins || 40, bwv = xMax / bins;
    const counts = new Array(bins).fill(0);
    values.forEach((v) => counts[Math.min(bins - 1, Math.max(0, Math.floor(v / bwv)))]++);
    const yMax = Math.max(...counts, 1);
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    const X = (v) => m.l + (v / xMax) * iw, Y = (c) => m.t + ih - (c / yMax) * ih;
    const p5 = SM.quantile(values, 0.05), p50 = SM.quantile(values, 0.5), p95 = SM.quantile(values, 0.95);
    SM.svg("rect", { x: X(p5), y: m.t, width: Math.max(1, X(p95) - X(p5)), height: ih, fill: "rgba(111,120,207,0.10)" }, s);
    const bw = iw / bins;
    counts.forEach((c, i) => {
      if (!c) return;
      const x0 = i * bwv;
      const over = opts.threshold !== undefined && x0 >= opts.threshold;
      const r = SM.svg("rect", { x: m.l + i * bw + 1, y: Y(c), width: Math.max(1, bw - 2), height: m.t + ih - Y(c), rx: 1.5, fill: over ? SM.COL.A1 : SM.COL.E2 }, s);
      SM.bindTip(r, () => `<b>${(x0).toFixed(1)}–${(x0 + bwv).toFixed(1)}${opts.unit || ""}</b><br>${((c / values.length) * 100).toFixed(1)}% of runs`);
    });
    if (opts.threshold !== undefined && opts.threshold <= xMax) {
      SM.svg("line", { x1: X(opts.threshold), x2: X(opts.threshold), y1: m.t - 6, y2: m.t + ih, stroke: SM.COL.A1, "stroke-width": 2, "stroke-dasharray": "4 3" }, s);
      SM.svg("text", { x: X(opts.threshold) + 6, y: m.t + 4, style: `fill:${SM.COL.A1};font-weight:600` }, s).textContent = opts.thresholdLabel || "threshold";
    }
    SM.svg("line", { x1: X(p50), x2: X(p50), y1: m.t, y2: m.t + ih, stroke: SM.COL.navy, "stroke-width": 2 }, s);
    SM.svg("text", { x: X(p50) + 5, y: m.t + 18, class: "lbl-strong" }, s).textContent = "median " + p50.toFixed(1) + (opts.unit || "");
    for (let i = 0; i <= 5; i++) {
      const v = (xMax / 5) * i;
      SM.svg("text", { x: X(v), y: h - m.b + 18, "text-anchor": "middle" }, s).textContent = (v % 1 ? v.toFixed(1) : v) + (opts.unit || "");
    }
    SM.svg("line", { x1: m.l, x2: w - m.r, y1: m.t + ih, y2: m.t + ih, stroke: "rgba(34,56,108,0.35)" }, s);
    SM.svg("text", { x: m.l, y: h - 2, style: "fill:#6f7896" }, s).textContent = `shaded: 5th–95th percentile (${p5.toFixed(1)}–${p95.toFixed(1)}${opts.unit || ""})`;
    return s;
  };

  /* ---------- line with points (threshold curve) ---------- */
  SM.lineChart = function (container, pts, opts = {}) {
    container.innerHTML = "";
    const { w } = size(container), h = opts.height || 230;
    const m = { t: 20, r: 16, b: 48, l: 40 };
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": "Threshold curve" }, container);
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    const X = (i) => m.l + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw), Y = (v) => m.t + ih - (v / 100) * ih;
    const g = SM.svg("g", { class: "grid" }, s);
    [0, 25, 50, 75, 100].forEach((v) => { SM.svg("line", { x1: m.l, x2: w - m.r, y1: Y(v), y2: Y(v) }, g); SM.svg("text", { x: m.l - 8, y: Y(v) + 4, "text-anchor": "end" }, s).textContent = v + "%"; });
    // band p5..p95 of gap is not on this axis; draw only probability line
    let d = "";
    pts.forEach((p, i) => (d += (i ? "L" : "M") + X(i) + "," + Y(p.y)));
    SM.svg("path", { d, fill: "none", stroke: SM.COL.navy, "stroke-width": 2, "stroke-linejoin": "round" }, s);
    pts.forEach((p, i) => {
      SM.svg("circle", { cx: X(i), cy: Y(p.y), r: p.sel ? 6 : 4.5, fill: p.sel ? SM.COL.A1 : SM.COL.navy, stroke: "#eef3fd", "stroke-width": 2 }, s);
      SM.svg("text", { x: X(i), y: Y(p.y) - 11, "text-anchor": "middle", class: p.sel ? "lbl-strong" : "" }, s).textContent = p.y.toFixed(0) + "%";
      SM.svg("text", { x: X(i), y: h - m.b + 18, "text-anchor": "middle", class: p.sel ? "lbl-strong" : "" }, s).textContent = p.id;
      SM.svg("text", { x: X(i), y: h - m.b + 32, "text-anchor": "middle", style: "font-size:11px;fill:#6f7896" }, s).textContent = p.short || "";
      const hit = SM.svg("rect", { x: X(i) - iw / pts.length / 2, y: m.t, width: iw / pts.length, height: ih, class: "hit" }, s);
      SM.bindTip(hit, () => opts.tip ? opts.tip(p) : `${p.y.toFixed(1)}%`);
    });
    return s;
  };

  /* ---------- tornado ---------- */
  SM.tornado = function (container, rows, base, opts = {}) {
    container.innerHTML = "";
    const { w } = size(container);
    const rh = 30, m = { t: 14, r: 50, b: 30, l: Math.min(210, w * 0.42) };
    const h = m.t + m.b + rows.length * rh;
    const s = SM.svg("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": "Sensitivity chart" }, container);
    const lo = Math.min(base, ...rows.map((r) => Math.min(r.lo, r.hi))), hi = Math.max(base, ...rows.map((r) => Math.max(r.lo, r.hi)));
    const pad = (hi - lo) * 0.08 || 1;
    const X = (v) => m.l + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (w - m.l - m.r);
    rows.forEach((r, i) => {
      const y = m.t + i * rh;
      const t = SM.svg("text", { x: m.l - 10, y: y + rh / 2 + 4, "text-anchor": "end" }, s);
      t.textContent = r.label.length > 34 ? r.label.slice(0, 33) + "…" : r.label;
      const a = Math.min(r.lo, r.hi), b = Math.max(r.lo, r.hi);
      const bar = SM.svg("rect", { x: X(a), y: y + 6, width: Math.max(2, X(b) - X(a)), height: rh - 12, rx: 2, fill: i === 0 ? SM.COL.A1 : SM.COL.E2 }, s);
      SM.bindTip(bar, () => `<b>${SM.esc(r.label)}</b><br>At its P10: median gap ${r.lo.toFixed(1)}%<br>At its P90: median gap ${r.hi.toFixed(1)}%<br>Swing ${Math.abs(r.hi - r.lo).toFixed(1)} pp`);
      SM.svg("text", { x: X(b) + 6, y: y + rh / 2 + 4 }, s).textContent = Math.abs(r.hi - r.lo).toFixed(1) + " pp";
    });
    SM.svg("line", { x1: X(base), x2: X(base), y1: m.t - 4, y2: h - m.b + 4, stroke: SM.COL.navy, "stroke-width": 1.5 }, s);
    SM.svg("text", { x: X(base), y: h - 8, "text-anchor": "middle", class: "lbl-strong" }, s).textContent = "baseline median " + base.toFixed(1) + "%";
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
