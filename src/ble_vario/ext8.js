// ABOUTME: XC engine statistics and page machine (called by ext6.js every tick): heights above take-off and exercise start,
// ABOUTME: max height, total climb, glide ratio over ground, time in thermal, and the automatic page.
function (X, p, r, W) {
  // A: altitude per tick, D: cumulative ground distance per tick (m), both indexed by tick & 31. W: the wind (ext7.js).
  // O: watch altitude minus the vario's (EMA while the vario is the source), so that the altitude stays on one basis
  // when the source switches (a link dropout would otherwise count the difference as climb or sink).
  // o: take-off altitude (12 ticks before the detection, SPEC §8.3), z: altitude at the exercise start (first valid
  // altitude), c: total-climb reference (3 m hysteresis), h: max height above take-off (over every flight of the
  // exercise), l: total climb, j: tick the current thermal's gain is
  // counted from, ap/tp/up: last tick's air/th/u, lt: landing tick, P: page, pt: tick of the last change.
  var A = new Float32Array(32), D = new Float32Array(32), O = NaN, o = NaN, z = NaN, c = 0, h = -1e9, l = 0,
    j = 0, ap = 0, tp = 0, up = 0, lt = -1e9, P = 0, pt = 0;
  for (; j < 32; j++) A[j] = NaN;
  // Climb session gain (docs/research/xc-features/thermal-gain-rules.md): starts when the 10-s climb exceeds +0.5 m/s
  // (Flymaster), baseline the lowest altitude of the previous 15 s; ends after 30 s with the 10-s climb below -1 m/s
  // (Flymaster exit over XCTrack's window) or 30 m below the peak; then LAST = peak - baseline if it lasted >= 45 s.
  // X[9]: altitude - baseline during a session, 1e6 + LAST between sessions, NaN before the first one.
  var sb = NaN, sp = 0, ss = 0, sk = 0, sl = NaN;
  var G = function (t, a, b) {
    var e = (a - b[(t - 10) & 31]) / 10, i;
    if (a !== a) return;
    if (sb === sb) {
      if (a > sp) sp = a;
      sk = e < -1 ? sk + 1 : 0;
      if (sk >= 30 || sp - a >= 30) {
        if (t - ss >= 45 && sp > sb) sl = sp - sb;
        sb = NaN;
      }
    } else if (e > 0.5) {
      for (sb = a, i = 1; i < 16; i++) if (b[(t - i) & 31] < sb) sb = b[(t - i) & 31];
      sp = a; ss = t; sk = 0;
    }
    X[9] = sb === sb ? a - sb : 1e6 + sl;
  };
  // t: tick, a: altitude (NaN if none), g: ground distance of this tick's fix step, air/th: flight and thermal
  // states, u: the exercise runs, s: circling state, f: ticks since the last watch fix (9: too few fixes for the
  // circling state), q: watch altitude, m: main.js's source (2 vario). Returns the altitude it used.
  return function (t, a, g, air, th, u, s, f, q, m) {
    var k = t & 31, b = A, d = D, e, n, y = P;
    if (m > 1) { if (q === q && a === a) O = O === O ? O + (q - a - O) / 10 : q - a; } else if (O === O) a -= O;
    b[k] = a;
    d[k] = d[(t + 31) & 31] + g;
    if (!air && ap) lt = t;
    // take-off: a new flight's references and an empty wind store; a take-off within 2 minutes of a landing is the
    // same flight (a false landing, for example hovering in a wind as strong as the airspeed)
    if (air && !ap && t - lt > 120) {
      c = o = b[(t - 12) & 31];
      W(t, a, -1);
    }
    if (air && o !== o) c = o = a; // no altitude 12 ticks back: the first valid one in flight
    if (u && !up) c = a; // exercise (re)started: no climb counted for the pause
    ap = air;
    up = u;
    if (u && z !== z) z = a;
    X[6] = a - o; // NaN until the first take-off
    G(t, a, b);
    X[15] = a - z;
    if (air && u && a === a) {
      if (a - c >= 3) { l += a - c; c = a; } else if (c - a >= 3) c = a;
      if (h < 0) h = 0;
      if (a - o > h) h = a - o;
      X[7] = h;
      X[8] = l;
    }
    e = (t - 20) & 31; // glide ratio over ground over 20 s, only while sinking and not circling
    n = d[k] - d[e];
    e = b[e] - a;
    X[5] = s < 2 && n > 60 && e > 6 ? n / e : NaN;
    // time in thermal, from the lowest altitude of the 20 ticks before the entry, as main.js's gain is
    if (th && !tp) for (j = t, e = 1; e < 20; e++) if (b[(t - e) & 31] < b[j & 31]) j = t - e;
    tp = th;
    X[10] = th ? t - j : NaN;
    // Page: GLIDE (2) on the ground; airborne GLIDE, THERMAL (3) when circling with a 30-s
    // average of at least -0.5 m/s (without a fresh watch fix: the vario thermal state), back to GLIDE after at least
    // 20 s when the circling ended or the 30-s average fell below -1 m/s. pg 2 never loads the engine.
    e = (a - b[(t - 30) & 31]) / 30;
    if (!air) y = 2;
    else if (y < 3) { y = 2; if (f < 5 ? s > 1 && e >= -0.5 : th) { y = 3; pt = t; } }
    else if (t - pt > 19 && (f < 5 ? !s || e < -1 : !th)) { y = 2; pt = t; }
    X[0] = P = y;
    return a;
  };
}
