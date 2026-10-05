// ABOUTME: Reads the app settings from localStorage (data.json) once in onLoad, with safe defaults (demo variant: also dp).
// ABOUTME: Returns plain values, main.js's texts and selectors; enum settings are stored as index strings. The only localStorage reader.
function () {
  var g = function (k, max, d) {
    var s = localStorage.getItem(k), v;
    if (s === null || s === undefined || s === '') return d;
    v = +s;
    return v >= 0 && v <= max && v === Math.floor(v) ? v : d;
  };
  var w = g('aw', 3, 0), k = g('sk', 5, 3), n = localStorage.getItem('sn');
  //@demo var p = g('dp', 14, 0); // hidden key dp: the demo variant's phase (test/ble_vario/variant.js)
  return {
    dm: g('dm', 1, 0), // vario model: 0 UltraBip, 1 BlueBip
    sn: typeof n == 'string' ? n.slice(0, 40) : '', // vario name or the part after the parachute
    aw: w == 3 ? 30 : 10 + 5 * w, // average climb window, seconds
    ar: g('ar', 2, 0), // altitude reference: 0 match watch, 1 watch sea-level pressure, 2 QNE
    sk: k ? -0.95 - 0.5 * k : -9999, // red at or below this climb in m/s, where the displayed tenths reach the setting (Off = never)
    //@demo dp: p % 10 > 4 ? 0 : p, // simulator demo phase 0-4, 10-14
    gp: g('gp', 1, 0), // bottom line: 0 flight time, 1 vario GPS speed and course
    // pages: stored 0 automatic glide/thermal, 1 classic single page (the default: the automatic pages need about 38 KB
    // at the exercise start and push a second app out of memory on a Race S); internally 0 automatic, 2 classic
    pg: g('pg', 1, 1) * 2,
    hr: g('hr', 1, 0), // height shown: 0 above take-off, 1 above the exercise start
    // texts main.js shows, by index (12: the average label, 13/14: the first hint line, 15-18: parts of the vario GPS
    // line), and the selectors in mask-bit order (each element and its children)
    tx: ('SEARCHING|CONNECTING|NO GPS FIX|NO DATA|LINK LOST|BAD DATA|BLE ERROR|ALT|QNH|QNE|GAIN|LAST|AVG ' + (w == 3 ? 30 : 10 + 5 * w) +
      's|Restart exercise and vario|Restart vario, check name|GPS |\u00b0 | km/h| mph').split('|'),
    sl: '#s0|#s0 *|#s2|#s2 *|#bt|#bt *|#la|#la *|#lg|#lg *|#av|#av *|#gn|#gn *|#h0|#h0 *|#h1|#h1 *|#vn|#vn *|#vi|#vi *|#fl|#fl *|#rs|#rs *|#gp|#gp *|#cv|#cv *|#ac|#ac *|#ax|#ax *|#mp|#mp *|#ml|#ml *|#ll|#ll *|#mg|#mg *'.split('|')
  };
}
