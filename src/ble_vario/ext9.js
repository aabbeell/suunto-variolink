// ABOUTME: XC engine screen texts (made by ext6.js, called by main.js after its own push): the XC labels, A1 (ground
// ABOUTME: speed), the C2 slot (average climb, glide ratio, thermal average) and the bottom line (wind), when visible and changed.
function (X) {
  // X: main.js's shared results. a, c, d: keys of the A1, C2 and bottom-line texts (rebuilt only when they change).
  var a = 1e9, c = 1e9, d = 1e9, e = 1e9, L = -1;
  // Bottom line #gp on GLIDE/THERMAL: the wind, "WIND 270° 18 km/h", "WIND CALM" below 1.5 m/s (no direction); from 5 minutes after the newest estimate its age
  // in minutes replaces the label ("29' 270° 18 km/h"). f: full push, u: imperial, t: tick.
  var B = function (f, u, t) {
    var v, w, g;
    v = Math.sqrt(X[11] * X[11] + X[12] * X[12]);
    v = v < 1.5 ? -1 : Math.round(v * (u ? 2.23694 : 3.6));
    w = v < 0 ? -1 : Math.round(Math.atan2(-X[11], -X[12]) * 57.2958 + 360) % 360;
    g = (t - X[14]) / 60 | 0;
    if (g < 5) g = 0;
    if (f || (g * 361 + w + 1) * 1e3 + v != d) {
      d = (g * 361 + w + 1) * 1e3 + v;
      setText('#gp', (g ? g + '\' ' : 'WIND ') + (v < 0 ? 'CALM' : w + '\u00b0 ' + v + (u ? ' mph' : ' km/h')));
    }
  };
  // The map page's climb session gain (ext8.js X[9]): signed during a session, LAST between sessions, -- before one.
  var M = function (f, u) {
    var v = X[9], t = v !== v ? 1e9 : Math.round((v > 9e5 ? v - 1e6 : v) * (u ? 3.28084 : 1)) + (v > 9e5 ? 1e8 : 0);
    if (f || t != e) { e = t; setText('#mg', t > 9e8 ? '--' : (t > 9e7 ? 'LAST ' : '') + (t % 1e8 > 0 ? '+' : '') + t % 1e8 + (u ? ' ft' : ' m')); }
  };
  // f: full push (labels and every text), m: main.js's visibility mask (bits of S.sl: 8 la, 32 av, 8192 gp, 16384 cv:
  // the C2 value cw and its label cl), u: imperial, n: the thermal gain (m),
  // g: ground speed (m/s, NaN unknown), r: setting hr, b: the engine writes the bottom line (a wind whose newest
  // estimate is less than 30 minutes old on GLIDE or THERMAL), k: tick.
  return function (f, m, u, n, g, r, b, k) {
    var P = X[0], e = u ? 2.23694 : 3.6, t, v, w;
    if (!P) return;
    if (f) {
      if (P < 3) setText('#la', u ? 'GS mph' : 'GS km/h');
      // C2 label after its value (a no-break space as the gap: the template has no padding for it)
      if (m & 16384) setText('#cl', P > 2 ? '\u00a0TC' : '\u00a0L/D');
    }
    if (P < 3 && m & 16) { // GLIDE's A2: the climb session gain (GAIN) or, between climbs, the last one (LAST)
      t = X[9] > 9e5 ? 1 : 0;
      if (f || t != L) { L = t; setText('#lg', t ? 'LAST' : 'GAIN'); }
    }
    if (P < 3 && m & 32) { // ground speed (GLIDE) in tenths, one decimal below 100 (owner request 2026-10-04)
      t = g === g ? Math.round(g * e * 10) : 1e9;
      if (f || t != a) { a = t; setText('#av', t > 1e8 ? '--' : (t < 1000 ? (t / 10 | 0) + '.' + t % 10 : '' + ((t + 5) / 10 | 0))); }
    }
    if (m & 16384) { // glide ratio in tenths (one decimal below 10); current-thermal average
      // (THERMAL, from 10 s of thermal time) signed, in tenths of m/s or tens of ft/min; at most 4 characters, which
      // is what fits on the 240-px display: no '+' from 1000 ft/min, -990 ft/min the lowest shown, whole m/s from 10
      v = P == 2 ? X[5] * 10 : (X[10] > 9 ? n / X[10] : NaN) * (u ? 19.685 : 10);
      t = v > -1e3 && v < 1e3 ? Math.round(v) : 1e9; // NaN and a glide ratio of 100 or more: --
      if (f || t != c) {
        c = t;
        w = t < 0 ? -t : t;
        setText('#cw', t > 1e8 ? '--' : (P == 2 ? (t < 100 ? (t / 10 | 0) + '.' + t % 10 : '' + ((t + 5) / 10 | 0)) :
          (u ? (t < -99 ? '-990' : (t < 0 ? '-' : (t && w < 100 ? '+' : '')) + w * 10) :
            (t > 0 ? '+' : (t < 0 ? '-' : '')) + (w > 99 ? (w + 5) / 10 | 0 : (w / 10 | 0) + '.' + w % 10))));
      }
    }
    if (m & 8192 && b) B(f, u, k); // main.js shows the vario GPS line otherwise
    if (m & 1048576) M(f, u);
  };
}
