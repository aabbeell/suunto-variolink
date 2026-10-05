// ABOUTME: Builds the two BLE search parameters that find the vario by its advertised local name (no service UUID).
// ABOUTME: Called once from main.js onLoad() with the model and the optional name setting; returns [sp1, sp2] for connect.
function (m, s) {
  // The UltraBip/BlueBip advertises only "UltraBip" / "BlueBip" + U+1FA82 (UTF-8 F0 9F AA 82) + the BipLink pilot
  // name or the serial. Empty setting: the model name alone (works only if the watch matches name prefixes).
  // Otherwise the complete name: the setting may be the part after the parachute ("Abel", "1234") or the whole
  // name. A model name typed at the start is recognised in any letter case ("ultrabip abel") and wins over the
  // model setting; the separators after it (spaces, '-', '_', the parachute) are dropped, and the pilot name is
  // kept as typed, because the advertised name is case-sensitive. Both parameters carry the same name, as
  // complete (9) and short (8) local name, so neither is broader than the other. At most 16 name bytes are sent.
  // A non-BMP character arrives as one code point when the firmware pushes the setting as raw UTF-8 (Duktape
  // keeps it whole) and as a surrogate pair from a JS literal or in Node: both forms are handled.
  var w = m ? 'BlueBip' : 'UltraBip',
    p = [9],
    i, c;
  s = typeof s == 'string' ? s.trim() : '';
  c = s.toLowerCase();
  if (c.indexOf('ultrabip') == 0) { w = 'UltraBip'; s = s.slice(8); }
  else if (c.indexOf('bluebip') == 0) { w = 'BlueBip'; s = s.slice(7); }
  for (;;) {
    c = s.charCodeAt(0);
    if (c == 32 || c == 45 || c == 95 || c == 0x1FA82) s = s.slice(1);
    else if (c == 0xD83E && s.charCodeAt(1) == 0xDE82) s = s.slice(2);
    else break;
  }
  if (s) s = w + '🪂' + s;
  else s = w;
  for (i = 0; i < s.length; i++) {
    c = s.charCodeAt(i);
    if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.length) c = 0x10000 + ((c - 0xD800) << 10) + (s.charCodeAt(++i) - 0xDC00);
    if (c > 0xFFFF) {
      if (p.length > 13) break;
      p.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else if (c < 0x80) {
      if (p.length > 16) break;
      p.push(c);
    } else if (c < 0x800) {
      if (p.length > 15) break;
      p.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    } else {
      if (p.length > 14) break;
      p.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  s = p.slice(0);
  s[0] = 8;
  return [p, s];
}
