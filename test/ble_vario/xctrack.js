// ABOUTME: Synthetic 1 Hz paraglider tracks for the XC tests (XC_FEATURES.md §3.7 T-W1): circles in a known wind, straight
// ABOUTME: glides, S-turns, ridge reversals, AR(1) GPS noise and late ticks, as int32 degrees x 1e7 like the watch input.

'use strict';

// Seeded generator (Park-Miller) and a Gaussian from it, so every case is reproducible.
function rng(seed) {
  let s = seed % 2147483647 || 1;
  const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  r.gauss = () => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return r;
}

// p: W wind speed (m/s), from (deg the wind comes from), V airspeed (m/s), T seconds per circle, n ticks, noise
// (sigma m, AR(1) rho 0.9), mode ('circle' | 'straight' | 'sturn' | 'ridge' | 'part' (3/4 circle at 60 s) | 'lead'
// (straight 60 s, then circles) | 'spiral'), wob (+-15 % turn rate, +-5 % airspeed), recentre (turn rate at 25 % for
// 4 s every 45 s), dup (probability that a tick sees the previous fix again), rev (tick from which the turn direction
// is reversed), white (1: white noise instead of AR(1)), seed.
// Returns {fix: [[lat, lon]] per tick (index 0 = tick 1), gs: ground speed per tick (m/s), wE, wN (wind-to m/s)}.
function track(p) {
  const r = rng(p.seed || 1);
  const lat0 = 46, kx = 111195 * Math.cos(lat0 * Math.PI / 180), fr = p.from * Math.PI / 180;
  const wE = -p.W * Math.sin(fr), wN = -p.W * Math.cos(fr);
  let x = 0, y = 0, psi = (p.heading || 0) * Math.PI / 180, nx = 0, ny = 0;
  const ph = r() * 6.28, raw = [], gs = [];
  for (let t = 0; t < p.n; t++) {
    let om = 2 * Math.PI / p.T;
    if (p.mode === 'straight') om = 0;
    if (p.mode === 'sturn') om = (Math.PI / 2) / 6 * Math.sin(2 * Math.PI * t / 24) * 1.6;
    if (p.mode === 'ridge') om = ((Math.floor(t / 40) % 2) ? 1 : -1) * ((t % 40) < 9 ? Math.PI / 9 : 0);
    if (p.mode === 'part') om = (t > 60 && t < 60 + 0.75 * p.T) ? 2 * Math.PI / p.T : 0;
    if (p.mode === 'lead') om = t >= 60 ? 2 * Math.PI / p.T : 0;
    if (p.wob) om *= 1 + 0.15 * Math.sin(t * 0.7 + ph);
    if (p.recentre && t % 45 > 40) om *= 0.25;
    if (p.rev && t >= p.rev) om = -om;
    psi += om;
    const V = p.V * (1 + (p.wob ? 0.05 * Math.sin(t * 0.37) : 0));
    const vx = wE + V * Math.sin(psi), vy = wN + V * Math.cos(psi);
    x += vx; y += vy;
    gs.push(Math.sqrt(vx * vx + vy * vy));
    const rho = p.white ? 0 : 0.9;
    nx = rho * nx + Math.sqrt(1 - rho * rho) * p.noise * r.gauss();
    ny = rho * ny + Math.sqrt(1 - rho * rho) * p.noise * r.gauss();
    raw.push([Math.round((lat0 + (y + ny) / 111195) * 1e7), Math.round((8 + (x + nx) / kx) * 1e7)]);
  }
  // late ticks: with probability dup a tick still sees the previous fix (the next one then jumps 2 s)
  const fix = raw.map((f, i) => (p.dup && i > 0 && r() < p.dup ? raw[i - 1] : f));
  return { fix, gs, wE, wN };
}

// Wind error of an estimate (east, north wind-to m/s) against the track's true wind: speed difference (m/s) and
// direction difference (deg, -180..180).
function windErr(e, n, tr) {
  const tw = Math.hypot(tr.wE, tr.wN), ew = Math.hypot(e, n);
  let d = (Math.atan2(-e, -n) - Math.atan2(-tr.wE, -tr.wN)) * 180 / Math.PI;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return { sp: ew - tw, dir: d };
}

module.exports = { rng, track, windErr };
