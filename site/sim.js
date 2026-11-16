/* The Shadow Market: Monte Carlo engine (spec §5b, model revised in DECISIONS #23). Seeded, so results reproduce. */
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
  // shared helpers for other engines (proposed.js); results of SM.simulate are unchanged
  SM.rng = mulberry32; SM.triInv = triInv; SM.normal = normal; SM.phi = phi;

  /* An input on the page is a centre value plus a spread. Each simulated future draws it from a
     symmetric triangular distribution (centre ± spread), clipped to the input's allowed range. */
  SM.distOf = function (inp, centre) {
    const c = centre ?? inp.centre, w = inp.spread;
    const lo = Math.max(inp.min, c - w), hi = Math.min(inp.max, c + w);
    return { type: "triangular", lo, mode: Math.min(hi, Math.max(lo, c)), hi };
  };
  SM.distRange = function (d) { // 5th and 95th percentile of a triangular distribution
    if (d.type !== "triangular") return [d.lo, d.hi];
    return [triInv(0.05, d.lo, d.mode, d.hi), triInv(0.95, d.lo, d.mode, d.hi)];
  };

  /**
   * cfg: { seed, runs, flagged:[share per reach step, % of US supply], traced (%), inputs:{id:dist}, rho, fixed:{id:value} }
   * Per simulated future and per reach step j:
   *   flagged = F_j + untraced × (F_j / traced) × hidden
   *   stopped = flagged × p_enf;  keptOut = stopped × (1 − release);  lost = keptOut × (1 − reroute)
   *   shortage = max( ramp + lost/capacity − buffer×100/lost ,  detention − buffer×100/stopped , 0 )
   */
  SM.simulate = function (cfg) {
    const rng = mulberry32(cfg.seed);
    const F = cfg.flagged, nT = F.length, N = cfg.runs;
    const mk = () => F.map(() => new Float64Array(N));
    const out = { flagged: mk(), stopped: mk(), keptOut: mk(), lost: mk(), short: mk() };
    const rho = cfg.rho ?? 0.5, fixed = cfg.fixed || {};
    const get = (id, u) => (id in fixed ? fixed[id] : draw(rng, cfg.inputs[id], u));
    const traced = cfg.traced ?? 100, untraced = 100 - traced;
    for (let r = 0; r < N; r++) {
      // opaque supply chains are also the leakiest: couple hidden exposure and rerouting (Gaussian copula)
      const z1 = normal(rng), z2 = rho * z1 + Math.sqrt(1 - rho * rho) * normal(rng);
      const hidden = get("hidden", phi(z1)), reroute = get("reroute", phi(z2));
      const pEnf = get("p_enf"), rel = get("release");
      const cap = Math.max(0.1, get("capacity")), ramp = get("ramp"), buf = get("buffer");
      const det = cfg.inputs.detention ? get("detention") : 0;
      for (let j = 0; j < nT; j++) {
        const f = typeof F[j] === "number" ? F[j] : draw(rng, F[j]);
        const fl = Math.min(100, f + (traced ? untraced * (f / traced) * hidden : 0));
        const st = fl * pEnf, ko = st * (1 - rel), lost = ko * (1 - reroute);
        out.flagged[j][r] = fl; out.stopped[j][r] = st; out.keptOut[j][r] = ko; out.lost[j][r] = lost;
        const perm = lost > 0.05 ? Math.max(0, ramp + lost / cap - (buf * 100) / lost) : 0;
        const held = st > 0.05 ? Math.max(0, det - (buf * 100) / st) : 0; // stopped supply waits at the border
        out.short[j][r] = Math.max(perm, held);
      }
    }
    return out;
  };

  SM.summarise = function (arr, X) {
    const s = Float64Array.from(arr).sort();
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
    let over = 0, pos = 0;
    for (const v of arr) { if (v > X) over++; if (v > 0) pos++; }
    return { p5: q(0.05), p50: q(0.5), p95: q(0.95), pOver: (over / arr.length) * 100, pPos: (pos / arr.length) * 100 };
  };

  /* one-at-a-time sensitivity: hold each input at its P10 / P90, median loss at reach step j */
  SM.sensitivity = function (cfg, j) {
    const out = [];
    const base = SM.summarise(SM.simulate({ ...cfg, runs: 2000 }).lost[j], 0).p50;
    for (const id of Object.keys(cfg.inputs)) {
      const d = cfg.inputs[id];
      const p10 = triInv(0.1, d.lo, d.mode, d.hi), p90 = triInv(0.9, d.lo, d.mode, d.hi);
      const lo = SM.summarise(SM.simulate({ ...cfg, runs: 2000, fixed: { [id]: p10 } }).lost[j], 0).p50;
      const hi = SM.summarise(SM.simulate({ ...cfg, runs: 2000, fixed: { [id]: p90 } }).lost[j], 0).p50;
      out.push({ id, lo, hi, p10, p90 });
    }
    out.sort((a, b) => Math.abs(b.hi - b.lo) - Math.abs(a.hi - a.lo));
    return { base, rows: out };
  };
})();
