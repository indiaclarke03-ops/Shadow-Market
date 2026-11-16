/* The Shadow Market: Monte Carlo engine (spec §5b). Seeded, so results reproduce. */
(function () {
  const SM = (window.SM = window.SM || {});

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function gamma(rng, k) {
    if (k < 1) return gamma(rng, k + 1) * Math.pow(rng(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = rng();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  function beta(rng, a, b) { const x = gamma(rng, a); return x / (x + gamma(rng, b)); }
  function triInv(u, lo, mode, hi) {
    const f = (mode - lo) / (hi - lo || 1);
    return u < f ? lo + Math.sqrt(u * (hi - lo) * (mode - lo)) : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
  }
  function phi(x) { // standard normal CDF (Abramowitz–Stegun)
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  // Draw from a distribution spec; u (optional) is a uniform for inverse-CDF types (used by the copula)
  function draw(rng, d, u) {
    switch (d.type) {
      case "beta": return beta(rng, d.a, d.b);
      case "uniform": return d.lo + (u ?? rng()) * (d.hi - d.lo);
      case "triangular": return triInv(u ?? rng(), d.lo, d.mode, d.hi);
      case "fixed": return d.value;
      default: throw new Error("unknown dist " + d.type);
    }
  }
  SM.draw = draw;

  /* p5/p95 helpers so every input can be edited as a plain range */
  SM.distRange = function (d) {
    const rng = mulberry32(7), xs = [];
    for (let i = 0; i < 4000; i++) xs.push(draw(rng, d));
    xs.sort((a, b) => a - b);
    return [xs[Math.floor(0.05 * 4000)], xs[Math.floor(0.95 * 4000)], xs.reduce((a, b) => a + b, 0) / xs.length];
  };
  SM.distFromRange = function (d, lo, hi) {
    if (!(hi > lo)) return d;
    if (d.type === "uniform") { // p5/p95 → bounds
      const span = (hi - lo) / 0.9;
      return { type: "uniform", lo: Math.max(0, lo - span * 0.05), hi: hi + span * 0.05 };
    }
    if (d.type === "triangular") {
      const [plo, phi_, ] = SM.distRange(d);
      const rel = (d.mode - d.lo) / (d.hi - d.lo || 1);
      const scale = (hi - lo) / (phi_ - plo || 1);
      const nlo = Math.max(0, lo - (plo - d.lo) * scale), nhi = hi + (d.hi - phi_) * scale;
      return { type: "triangular", lo: nlo, mode: nlo + rel * (nhi - nlo), hi: nhi };
    }
    if (d.type === "beta") { // method of moments: mean = midpoint, sd = (p95-p5)/3.29
      lo = Math.max(0.001, lo); hi = Math.min(0.999, hi);
      const mu = (lo + hi) / 2, sd = (hi - lo) / 3.29, v = sd * sd;
      const k = Math.max(0.5, (mu * (1 - mu)) / v - 1);
      return { type: "beta", a: mu * k, b: (1 - mu) * k };
    }
    return d;
  };

  const TAU_FOR = { high: "tau_high", "medium-high": "tau_medium", medium: "tau_medium", "low-medium": "tau_low", low: "tau_low" };
  const DEPTH = [0, 0.25, 0.5, 0.75, 0.9, 1];

  /**
   * cfg: { seed, runs, thresholds:[{id,confidence}], increments: {T0:{type..}|number}, inputs:{id:dist}, rho, fixed:{inputId:value} }
   * returns per-threshold arrays of gap and duration
   */
  SM.simulate = function (cfg) {
    const rng = mulberry32(cfg.seed);
    const T = cfg.thresholds, nT = T.length, N = cfg.runs;
    const gaps = T.map(() => new Float64Array(N)), durs = T.map(() => new Float64Array(N));
    const rho = cfg.rho ?? 0.5, fixed = cfg.fixed || {};
    const get = (id, u) => (id in fixed ? fixed[id] : draw(rng, cfg.inputs[id], u));
    for (let r = 0; r < N; r++) {
      // correlated hidden exposure & rerouting via Gaussian copula
      const z1 = normal(rng), z2 = rho * z1 + Math.sqrt(1 - rho * rho) * normal(rng);
      const hidden = get("hidden", phi(z1));
      const reroute = get("reroute", phi(z2));
      const tau = { tau_high: get("tau_high"), tau_medium: get("tau_medium"), tau_low: get("tau_low") };
      const pEnf = get("p_enf"), rel = get("release");
      const cap = Math.max(0.05, get("capacity")), ramp = get("ramp"), buf = get("buffer");
      const pass = pEnf * (1 - rel) * (1 - reroute);
      let cum = 0;
      for (let j = 0; j < nT; j++) {
        const inc = cfg.increments[T[j].id];
        const delta = typeof inc === "number" ? inc : draw(rng, inc);
        cum += delta * tau[TAU_FOR[T[j].confidence] || "tau_medium"];
        const removed = Math.min(100, (cum + hidden * DEPTH[Math.min(j, DEPTH.length - 1)]) * pass);
        gaps[j][r] = removed;
        const refill = removed > 0 ? ramp + removed / cap : 0;
        const cover = removed > 0 ? (buf * 100) / removed : Infinity;
        durs[j][r] = Math.max(0, refill - cover);
      }
    }
    return { gaps: gaps.map((a) => Array.from(a)), durs: durs.map((a) => Array.from(a)) };
  };

  SM.summarise = function (arr, X) {
    const s = Float64Array.from(arr).sort();
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
    let over = 0;
    for (const v of arr) if (v > X) over++;
    return { p5: q(0.05), p50: q(0.5), p95: q(0.95), pOver: (over / arr.length) * 100 };
  };

  /* one-at-a-time sensitivity: fix each input at its P10 / P90, median gap at threshold j */
  SM.sensitivity = function (cfg, j, labels) {
    const out = [];
    const base = SM.summarise(SM.simulate({ ...cfg, runs: 3000 }).gaps[j], 0).p50;
    for (const id of Object.keys(cfg.inputs)) {
      const rng = mulberry32(11), xs = [];
      for (let i = 0; i < 3000; i++) xs.push(draw(rng, cfg.inputs[id]));
      xs.sort((a, b) => a - b);
      const lo = SM.summarise(SM.simulate({ ...cfg, runs: 3000, fixed: { [id]: xs[300] } }).gaps[j], 0).p50;
      const hi = SM.summarise(SM.simulate({ ...cfg, runs: 3000, fixed: { [id]: xs[2700] } }).gaps[j], 0).p50;
      out.push({ id, label: labels[id] || id, lo, hi });
    }
    out.sort((a, b) => Math.abs(b.hi - b.lo) - Math.abs(a.hi - a.lo));
    return { base, rows: out };
  };
})();
