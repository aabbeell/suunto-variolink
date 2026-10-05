// ABOUTME: XC engine, made once in main.js onExerciseStart (automatic pages only): ground velocity from watch GPS fixes,
// ABOUTME: circling detection, per-tick calls into the statistics and pages (ext8.js) and the wind fit (ext7.js); texts: ext9.js.
function (X, p, r, U, W, T) {
  // X: main.js's shared Float32Array (layout in main.js). p, r: settings pg (pages) and hr (height reference).
  // U, W, T: the compiled factories of ext9.js, ext7.js and ext8.js. main.js compiles them (evalFile may only be
  // called from main.js, reference L1212); each parameter is replaced by what its factory returns, which releases
  // the factory (keeping it costs 1.7 KB).
  // E, N: the last 40 ground velocities (east, north) m/s, newest at k; q of them valid. Velocity = position
  // difference of a NEW fix divided by the ticks since the last one (at most 4), never the fused speed plus a heading.
  // Circling: the velocity turning around the mean (cE, cN) of its last 10 samples (the wind cancels out, so it works
  // when the wind is stronger than the airspeed); a step counts only when |v - mean| > 4.5 m/s; turning = EMA (0.3)
  // of the turn rate >= 4 deg/s; circling after >= 8 s of turning and >= 225 deg swept, cruise after 10 s straight.
  // s: 0 cruise, 1 possible, 2 circling, 3 possible cruise (still counts as circling); c: its direction (+1/-1),
  // followed through a reversal (2 -> 3 -> 2 in the other direction), or the wind fit would reject every turn after it.
  var E = new Float32Array(40), N = new Float32Array(40), R,
    q = 0, k = 0, kx = 0, la = 0, lo = 0, f = -99, cE = 0, cN = 0, pp = 0, po = 0, rs = 0, s = 0, ct = 0, c = 0,
    sw = 0, su = 0, oy = NaN, ox = 0, pe = 0, pn = 0, dE = 0, dN = 0;
  U = U(X);
  W = W(E, N, X);
  T = T(X, p, r, W);
  // y, x: watch fix (int32 degrees x 1e7, NaN without GPS); t: tick; a: calibrated altitude; air, th: flight and
  // thermal states; u: the exercise runs (not paused); w: the watch altitude; v: main.js's source (2: a is the vario's).
  // The thermal map: F takes a new fix in metres east and north of the exercise's first fix; M, every tick, gives the
  // map position in the air mass (the ground position minus the wind's drift so far), so the circles stack.
  var F = function (y, x) {
    if (oy !== oy) { oy = y; ox = x; }
    pe = (x - ox) * kx;
    pn = (y - oy) * 0.0111195;
  };
  var M = function () {
    if (X[13]) { dE += X[11]; dN += X[12]; }
    X[3] = pe - dE;
    X[4] = pn - dN;
  };
  R = function (y, x, t, a, air, th, u, w, v) {
    var dt = t - f, i, j, e, n, b, d, g = 0, m = 0, z = q, h = s;
    // A GPS gap drops the window; circling becomes "possible cruise" with a fresh 10-s grace, so a short dropout in a
    // thermal does not end it (the page then follows the vario thermal state until 3 new fixes arrived).
    if (dt > 4) { z = 0; h = h > 1 ? 3 : 0; ct = t; rs = 0; po = 0; }
    if (isFinite(y) && isFinite(x) && (y != la || x != lo)) { // a new fix (the input repeats the last one)
      if (dt < 5) {
        n = (y - la) * 0.0111195 / dt; // metres per 1e-7 degree
        e = (x - lo) * kx / dt;
        g = e * e + n * n;
        if (g < 3600) { // > 60 m/s: a glitch
          k = k ? k - 1 : 39; // newest first: k, k + 1, ... going back
          E[k] = e;
          N[k] = n;
          if (z < 40) z++;
          g = Math.sqrt(g) * dt;
        } else z = g = 0;
      }
      kx = 0.0111195 * Math.cos(y * 1.745329e-9);
      la = y;
      lo = x;
      F(y, x);
      f = t;
      if (z > 2) {
        for (i = 0, j = k, cE = 0, cN = 0; i < z && i < 10; i++, j = (j + 1) % 40) { cE += E[j]; cN += N[j]; }
        cE /= i;
        cN /= i;
        e -= cE;
        n -= cN;
        d = 0;
        if (e * e + n * n > 20) {
          b = Math.atan2(e, n);
          if (po) { d = b - pp; if (d > 3.1416) d -= 6.2832; else if (d < -3.1416) d += 6.2832; }
          pp = b;
          po = 1;
        } else po = 0;
        d /= dt;
        if (d > 0.873) d = 0.873; else if (d < -0.873) d = -0.873; // 50 deg/s at most
        rs = 0.7 * rs + 0.3 * d;
        b = rs >= 0.0698 || rs <= -0.0698;
        if (!h) { if (b) { h = 1; ct = t; sw = 0; } }
        else if (h == 1) { sw += d * dt; if (!b) h = 0; else if (t - ct > 7 && (sw >= 3.927 || sw <= -3.927)) { h = 2; c = sw > 0 ? 1 : -1; } }
        else if (b) { h = 2; c = rs > 0 ? 1 : -1; } // circling (again): the direction of the turn now
        else if (h == 2) { h = 3; ct = t; }
        else if (t - ct > 9) h = 0;
        if (h > 1 && z > 8) { if (su > 0) su--; else m = 1; } // a fit about every quarter turn
      }
    }
    q = z;
    s = h;
    M();
    X[1] = h;
    X[2] = t - f;
    // statistics and page first (they return the altitude on one basis across vario/watch switches), then the wind
    a = T(t, a, g, air, th, u, h, z > 2 ? t - f : 9, w, v);
    i = W(t, a, m, z, k, cE, cN, c);
    if (i) su = i < 12 ? 3 : i >> 2;
  };
  R.u = U; // the XC page texts, called by main.js after its own screen push
  return R;
}
