// ABOUTME: Circling wind for the XC engine (ext6.js): Kasa circle fit of the ground velocities over the last full turn,
// ABOUTME: and XCSoar's 8-entry wind store (quality x age x height weights). Loaded once per exercise; writes X[11..14].
function (E, N, X) {
  // E, N: ground velocity ring of ext6.js (40 x east, north m/s; newest at k, older at k + 1, k + 2, ...). X: main.js's
  // shared results (11 wind-to east, 12 wind-to north in m/s, 13 1 while the store gives a wind, 14 tick of the newest
  // estimate). S: the store, 8 x (east, north, quality, tick, altitude); the oldest entry is overwritten.
  var S = new Float32Array(40), w = 0, r = -1e9, L = NaN;
  // Fits the newest samples that turned a full 360 deg around (e, n), the mean of the last 10 velocities, in the
  // circling direction c (+1/-1). q: samples in the ring. The centre of the velocity circle is the wind (to), its
  // radius the airspeed. Stores the estimate and returns the samples used, or 0 when a gate rejects the turn.
  var F = function (t, a, q, k, e, n, c) {
    var m = 1, s = 0, P = E, Q = N, p = Math.atan2(P[k] - e, Q[k] - n), b, d, i, j, u, v, z,
      x = 0, y = 0, uu = 0, vv = 0, uv = 0, uz = 0, vz = 0, zz = 0, g = 0;
    for (j = k; m < q && s < 6.2832; m++) { // 1. walk back until the velocity turned 360 deg (needs >= 9 samples)
      j = (j + 1) % 40;
      b = Math.atan2(P[j] - e, Q[j] - n);
      d = p - b;
      if (d > 3.1416) d -= 6.2832; else if (d < -3.1416) d += 6.2832;
      s += d * c;
      p = b;
    }
    if (s < 6.2832 || m < 9) return 0;
    for (i = 0, j = k; i < m; i++, j = (j + 1) % 40) { x += P[j]; y += Q[j]; }
    x /= m;
    y /= m;
    for (i = 0, j = k; i < m; i++, j = (j + 1) % 40) { // 2. centred sums: u^2 + v^2 + D u + E v + F = 0
      u = P[j] - x;
      v = Q[j] - y;
      z = u * u + v * v;
      uu += u * u; vv += v * v; uv += u * v; uz += u * z; vz += v * z; zz += z;
    }
    d = uu * vv - uv * uv;
    if (d < 0.0625 * (uu + vv) * (uu + vv)) return 0; // roundness: 1 for a full circle, 0 for a line
    e = (uz * vv - vz * uv) / (2 * d); // centre in centred coordinates (a 2x2 solve, no 3x3 Cramer)
    n = (vz * uu - uz * uv) / (2 * d);
    d = Math.sqrt(e * e + n * n + zz / m); // radius
    for (i = 0, j = k; i < m; i++, j = (j + 1) % 40) { // 3. RMS residual of |v - c| - R
      u = P[j] - x - e;
      v = Q[j] - y - n;
      z = Math.sqrt(u * u + v * v) - d;
      g += z * z;
    }
    g = Math.sqrt(g / m);
    x += e;
    y += n;
    // airspeed 25-58 km/h (below 25 km/h, 7 m/s, the fits that pass are mostly white GPS noise on a straight line,
    // XC review 2026-10-04: 40 false estimates in 2 h at 3 m noise with 5 m/s, 4 with 7 m/s), wind <= 90 km/h
    if (d < 7 || d > 16 || x * x + y * y > 625 || g > 1.5) return 0;
    w = (w + 5) % 40;
    S[w] = x; S[w + 1] = y; S[w + 2] = g <= 0.6 ? 3 : (g <= 1 ? 2 : 1); S[w + 3] = t; S[w + 4] = a;
    X[14] = t;
    return m;
  };
  // Every tick: f = 1 tries a fit (returns the samples used, 0 if none), f = -1 clears the store (take-off). The
  // weighted mean is refreshed after a new estimate, every 10 ticks and after a 100 m altitude change. Without an
  // altitude (a NaN) the last valid one stands in (L), so the wind stays shown and new estimates keep a height; an
  // estimate without any height counts as at the current height.
  return function (t, a, f, q, k, e, n, c) {
    var m = 0, i, g, h, y, sE = 0, sN = 0, sW = 0, P = S;
    if (a === a) L = a; else a = L;
    if (f < 0) {
      for (i = 0; i < 40; i++) P[i] = 0;
      X[13] = 0;
      return 0;
    }
    if (f) m = F(t, a, q, k, e, n, c);
    if (m || !(t % 10) || a - r > 100 || r - a > 100) {
      for (i = 0; i < 40; i += 5) {
        g = P[i + 2];
        y = (t - P[i + 3]) / 3600;
        h = (a - P[i + 4]) / 1000;
        if (h !== h) h = 0;
        if (g > 0 && y <= 1 && h >= -1 && h <= 1) { // older than 1 h or 1000 m away: skipped
          g *= 0.0025 * (1 - y) / (y * y + 0.0025) * (2 / (1 + h * h) - 1);
          sE += g * P[i];
          sN += g * P[i + 1];
          sW += g;
        }
      }
      X[13] = sW > 0 ? 1 : 0;
      if (sW > 0) { X[11] = sE / sW; X[12] = sN / sW; }
      r = a;
    }
    return m;
  };
}
