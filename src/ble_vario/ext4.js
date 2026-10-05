// ABOUTME: Simulator-only DEMO feed (demo variant, test/ble_vario/variant.js): a looping synthetic flight as $LK8EX1/$GPRMC lines
// ABOUTME: through main.js's BLE handler (every 3rd split like MTU-23 data), and a watch GPS track (feed.a, feed.o) for the XC pages.
function (h, ph) {
  // ph (data.json "dp" mod 10): 0 thermal, 1 strong sink, 2 data stops after one tick, 3 never connects, 4 on the ground.
  // Script (128 s loop): thermal +2.4 +-0.6 m/s 60 s (circling), glide -1.2 m/s 30 s, sink -3.1 m/s 10 s,
  // no lines 8 s, glide 20 s. One $GPRMC per tick while flying (ground speed ~35 km/h, course). Watch GPS fixes
  // (int32 degrees x 1e7, the feed's properties a and o, read by main.js's demo line): 22-s circles at 9.5 m/s in a
  // 5 m/s wind from 270 deg during the thermal, straight on 245 deg after it, standing still on the ground (phase 4);
  // feed.s: the track's ground speed (m/s), for the watch speed input; feed.h: the synthetic altitude, for the watch
  // altitude input (a watch altitude unrelated to the vario's would show as a jump on the XC pages' heights).
  var buf = new Uint8Array(96),
    t = ph == 1 ? 92 : 10,
    k = 0,
    n = 0,
    alt = 1504;
  var rate = function (s, j) {
    s = s % 128;
    if (s < 60) return 2.4 + 0.6 * Math.sin(j * 0.37) * Math.cos(s * 0.21);
    if (s < 90 || s >= 108) return -1.2 + 0.15 * Math.sin(j * 0.9);
    return -3.1 + 0.2 * Math.sin(j * 0.7);
  };
  // Writes one complete sentence (with CR LF) for the given body into buf; returns its length.
  var line = function (s) {
    var c = 0, i, x = '0123456789ABCDEF';
    for (i = 0; i < s.length; i++) c ^= s.charCodeAt(i);
    if (n % 40 == 39) c ^= 1; // every 40th line carries a wrong checksum
    s = '$' + s + '*' + x.charAt(c >> 4) + x.charAt(c & 15) + '\r\n';
    for (i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i);
    return s.length;
  };
  var F = function () {
    var i, m, v, l, s = t % 128, w = 0.285599, x = 400 * Math.floor(t / 128), y = 0;
    if (ph != 4) {
      if (s < 60) { x += 5 * s + 33.264 * (1 - Math.cos(w * s)); y = 33.264 * Math.sin(w * s); }
      else { x += 338 - 3.61 * (s - 60); y = -32.92 - 4.015 * (s - 60); } // on from where the circles ended
    }
    F.s = s < 60 && ph != 4 ? Math.sqrt(Math.pow(5 + 9.5 * Math.sin(w * s), 2) + Math.pow(9.5 * Math.cos(w * s), 2)) : (ph == 4 ? 0 : 5.4);
    F.h = alt;
    F.a = Math.round(460000000 + y / 0.0111195);
    F.o = Math.round(80000000 + x / 0.0077243);
    k++;
    if (ph == 3 || (ph == 2 && k > 1)) return;
    if (ph != 4 && t % 128 >= 100 && t % 128 < 108) { // the vario sends nothing; the glider keeps gliding
      alt -= 1.2;
      t++;
      return;
    }
    m = 8 + k % 3; // 8-10 lines per tick, as real notifications arrive in bursts
    for (i = 0; i < m; i++) {
      v = ph == 4 ? 0.08 * Math.sin(n * 0.5) : rate(t, n);
      alt += v / m;
      l = line('LK8EX1,' + Math.round(101325 * Math.pow(1 - alt / 44330.77, 5.255876)) + ',' + Math.round(alt) + ',' +
        Math.round(v * 100) + ',12,1087,');
      if (n % 3 == 2) {
        h(1, 106, buf.subarray(0, 20));
        h(1, 106, buf.subarray(20, l));
      } else {
        h(1, 106, buf.subarray(0, l));
      }
      n++;
    }
    if (ph != 4) {
      v = t % 128 < 60 ? (t * 24) % 360 : 245;
      l = line('GPRMC,120000.00,A,4600.000,N,00800.000,E,' + (18.9 + 4 * Math.sin(v * 0.0174533)).toFixed(1) + ',' +
        v.toFixed(1) + ',031026,,,A,V');
      h(1, 106, buf.subarray(0, l));
    }
    t++;
  };
  return F;
}
