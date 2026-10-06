// ABOUTME: VarioLink: shows a Stodeus UltraBip/BlueBip BLE vario (NMEA $LK8EX1 on FFE0/FFE1) on the watch.
// ABOUTME: Byte parser, 1 Hz bins, link state, watch-barometer fallback, flight stats, vario GPS, XC pages (engine: ext6-9.js).

// Build and platform rules this file follows (docs/ble_vario/SPEC.md §0.1, docs/research/deep-dive/):
// - only top-level `var` declarations and lifecycle functions survive the minifier, which mangles top-level names
//   and merges the lifecycle bodies into one dispatcher: state is initialised here, ext*.js get everything as
//   arguments, `output` is only written in lifecycle functions or in put(), which receives it as a parameter;
// - at most 8 module-level functions, each compiling to less than ~1.9 KB (measured with SUUNTOPO tools/sp-mem);
//   no array/object literals, regex or `Date`; never two opening braces in a row (Handlebars); nothing is
//   allocated on the BLE data path, UI strings are built once in onLoad;
// - every appConn call is in try/catch, one per tick, setup calls only after event 100;
// - the simulator demo and the debug logging are not in the store build: their lines start with `//@demo ` or
//   `//@dbg ` (and one hardware check `//@neg `) and test/ble_vario/variant.js switches them on in a copy (comments
//   cost nothing once minified).
//
// Memory layout (SPEC §0.1.8): the module scope holds at most 56 names, because the 57th grows its property table
// to 65 entries plus a 1 KB hash part (lowmem Duktape). State that only one helper needs lives in that helper's
// closure (onBle, ble, dat, fly, ui). Four traps (R1-R3 found with sp-mem in Duktape 2.7, R4 in the simulator):
// - R1: a helper made inside a closure is not rewritten by the editor's minifier, so it must never see `input` or
//   `output`: closures take plain numbers from evaluate() and put() writes every output;
// - R2: terser inlines a single-use helper declared inside a closure into its caller (the compiled block grows);
// - R3: a try/catch belongs in the helper a closure hands out (or at module level): in a closure-private function
//   called from that helper it leaves ~300 B of cyclic garbage per call;
// - R4: the minified file may contain `return function` only once, in the dispatcher: the simulator loads main.js by
//   replacing the first `return function` with `function main` (and the firmware may do the same), so each closure
//   assigns its helper to the module variable and returns that variable (terser keeps `return x=function`).

// ---- shared state (more than one helper or lifecycle function uses it) ----
// S: settings, texts (tx), selectors (sl), the two connect search parameters (sa), from ext5.js and ext1.js in
// onLoad, and the XC engine (e, from ext6.js in onExerciseStart). Link: conn/wasConn connected now/ever, cv the con
// value to push (-1 none), nf failures since the last 100, 109 or valid tick (BLE ERROR above 8; also the connect
// back-off), got data since the last connect, everValid.
var S, conn = 0, wasConn = 0, cv = -1, nf = 0, everValid = 0, nBad = 0, got = 0;
// XC engine results (ext6-9.js write them every tick once the exercise started with automatic pages; zero means
// "nothing" before that, and with the classic page, pg 2, the engine is never loaded): 0 page (0 classic, 2 GLIDE,
// 3 THERMAL; 1 was HIKE, dropped 2026-10-04), 1 circling state (0 cruise, 1 possible, 2 circling, 3 possible cruise), 2 ticks since the
// last watch GPS fix, 5 glide ratio over ground (NaN unless sinking), 6 height above take-off (m), 7 max height
// above take-off over every flight of the exercise (-1 before a take-off), 8 total climb (-1 before), 9 unused,
// 10 time in thermal (s, from the lowest altitude before the entry), 11/12 wind-to east/north (m/s), 13 1 while
// a wind is known, 14 tick of the newest wind estimate, 15 height above the exercise start, 3/4 the newest fix in metres
// east/north of the exercise's first fix minus the wind drift so far (the thermal map's trail, in the air mass).
// The engine keeps its heights on one altitude basis across vario/watch source switches (ext8.js).
var XC = new Float32Array(16);
// mo: the page pinned by a long press of UP or DOWN (0 automatic, 2 GLIDE, 3 THERMAL map); the next hold unpins it
var mo = 0;
//@demo var seenEv = 0, demo = 0, dg; // any BLE event seen, demo running, its feed (ext4.js)
//@dbg var nOk = 0, nMax = 0, uId = 0, uLog = 0; // LK8EX1 lines accepted, largest notification, unknown sentence id to log, last logged
// ---- tick bins (LK8EX1 pressure and vario) and the last vario-GPS fix ($GPRMC) ----
var bP = 0, bN = 0, bV = 0, bVN = 0, gFix = 0, gsp = 0, ghd = 0, gT = -99; // gT: tick of the last valid fix
// ---- 1 Hz state: ring[0..31] vario QNE altitude per tick, ring[32..63] watch altitude per tick ----
var ring = new Float32Array(64);
var tk = 0, ls = 0, lsT = 0, off = NaN, um = 0, src, vI, avN, a10, alt, am;
// ---- exercise, flight and thermal ----
var st = 0, pz = 0, air = 0, fsec = 0, exT = 0, linkT = 0;
var th = 0, gn = 0, gmax = 0, lastG = NaN, bestG = 0, bestC = -1e9, maxA = -1e9, uiT = 0; // -1e9: none yet

// BLE event handler: parses notification bytes; link events go to ble(), which records them for evaluate(). Never
// calls appConn and never writes outputs.
// Parser states: 0 wait for '$', 1 sentence id, 2 fields, 3/4 checksum hex digits. Separators and checksum
// digits go to fin() so that neither function compiles to a large block.
var onBle = (function () {
  // streaming NMEA parser: scalars (reset on every '$') and one preallocated field array
  var fld = new Float32Array(5);
  var pst = 0, ck, cs, hl, hw, sid, fi, acc, dv, sg, fs, len;
  // Ends the sentence id (','), a field (',' or '*'), or takes a checksum digit and commits a valid sentence.
  var fin = function (b) {
    var v;
    if (pst == 1) { // the id as one exact 48-bit number: LK8EX1 -> 1, ..RMC -> 3; LXWP0 and ..GGA (2) end here
      ck ^= b;
      v = hl == 5 ? hw % 16777216 : 0;
      sid = hw == 0x4C4B38455831 ? 1 : (v == 0x524D43 ? 3 : (hw == 0x4C58575030 || v == 0x474741 ? 2 : 0));
      pst = sid == 2 ? 0 : 2;
      //@dbg if (!sid && hw != uLog) uId = hw; // an unknown id, logged by the 10-tick line (a take-off announcement?)
    } else if (pst == 2) {
      v = (fs & 1) && !(fs & 2) ? sg * acc / dv : NaN;
      if (sid == 1) { if (fi < 5) fld[fi] = v; }
      else if (fi == 1) fld[0] = fs & 16 ? 1 : 0; // RMC status 'A' = valid fix
      else if (fi == 6 || fi == 7) fld[fi - 5] = v; // RMC speed (knots), course (degrees)
      if (b == 42) pst = 3;
      else { ck ^= b; fi++; acc = fs = 0; dv = sg = 1; }
    } else {
      v = (b | 32) - 48; // hex digit, either case
      if (v > 9) v = v > 48 && v < 55 ? v - 39 : -1;
      if (v < 0) { pst = 0; nBad++; return; }
      cs = cs * 16 + v;
      if (pst++ == 3) return;
      pst = 0;
      if (cs != ck || !sid) { nBad++; return; } // bad checksum, or an unknown sentence
      if (sid == 1) { // $LK8EX1,pressure Pa,QNE alt m,vario cm/s,temp,battery
        if (!(fld[0] >= 10000 && fld[0] <= 120000)) { nBad++; return; } // sentinel 999999 or garbage
        bP += fld[0]; bN++;
        if (fld[2] > -9000 && fld[2] < 9000) { bV += fld[2]; bVN++; } // 9999 = no vario
        //@dbg nOk++;
      } else { // $GPRMC/$GNRMC: fix status; speed and course over ground and their time only from a valid fix
        gFix = fld[0] > 0 && fld[1] >= 0;
        if (gFix) {
          gsp = fld[1] * 0.514444;
          ghd = fld[2] >= 0 && fld[2] < 360 ? fld[2] * 0.0174533 : NaN;
          gT = tk;
        }
      }
    }
  };
  onBle = function (ch, ev, d) { // assigned and returned, not `return function` (R4)
    var i, b, n;
    //@demo seenEv = 1;
    if (ev == 106 || ev == 115) {
      if (!d) return;
      n = d.length;
      //@dbg if (n > nMax) nMax = n;
      if (n && !got) got = cv = 1;
      for (i = 0; i < n; i++) {
        b = d[i] & 255;
        if (b == 36) { // '$' always starts a new sentence (resynchronises after a lost tail)
          pst = 1; ck = cs = hl = hw = len = sid = fi = acc = fs = 0; dv = sg = 1;
          fld[0] = fld[1] = fld[2] = fld[3] = fld[4] = NaN;
          continue;
        }
        if (!pst) continue;
        if (++len > 96 || b == 13 || b == 10) { pst = 0; nBad++; continue; } // overlong, or CR/LF before the checksum
        if (pst > 2 || b == 44 || (b == 42 && pst == 2)) { fin(b); continue; }
        ck ^= b;
        if (pst == 2) { // field character: number with sign and decimal point, 'A' (RMC status) or anything else
          if (b > 47 && b < 58) { acc = acc * 10 + b - 48; if (fs & 8) dv *= 10; fs |= 1; }
          else if ((b == 45 || b == 43) && !fs) { if (b == 45) sg = -1; fs = 4; }
          else if (b == 46 && !(fs & 8)) fs |= 8;
          else fs |= b == 65 ? 18 : 2;
        } else if (hl++ < 6) hw = hw * 256 + b; // sentence id character
        else { pst = 0; nBad++; }
      }
      return;
    }
    //@dbg systemEvent('[vl] ev ' + ev + ' ch ' + ch);
    if (ev == 101) pst = 0; // a lost link drops the partial sentence
    ble(ev, ch);
  };
  return onBle;
})();

// BLE link. ble(ev, ch) with a link event (from onBle) only records it: no appConn call from inside the handler.
// ble(0, 0) from evaluate() makes the one setup step of this tick (always guarded). A call is made before the step
// changes, so a throw leaves the step to be retried in 4 ticks (a connect that keeps throwing is tried 7 times 4
// ticks apart, then every 60 ticks); a registration that throws twice marks its UUID form failed and setup moves on
// (the watch may accept only one of the two forms). The try/catch sits in ble() itself (R3).
// Step bs: 0 connect, 1/2 register UUID form 1/2, 3 enable notifications, 9 wait; phase ph: 0 form 1, 1 form 2;
// rg: bit (1 << form) set by its 107; fm: bit (1 << form) set when its registration failed (108 or a second throw),
// bit (8 << form) after its first throw; rT: ticks to wait; wt: ticks waited in step 3 or for data.
var ble = (function () {
  var cid, bs = 0, ph = 0, wt = 0, rT = 0, rg = 0, fm = 0;
  ble = function (ev, ch) { // assigned and returned, not `return function` (R4)
    var k, c;
    //@dbg if (ev < 0 && uId) { systemEvent('[vl] id ' + uId.toString(16)); uLog = uId; uId = 0; }
    //@dbg if (ev < 0) { systemEvent('[vl] ' + ls + ' ' + nOk + ' ' + nBad + ' ' + nMax + ' ' + ph + ' ' + bs + ' ' + rg + ' ' + fm + ' ' + air + ' ' + XC[0] + ' ' + XC[1] + ' ' + XC[2] + ' ' + XC[13]); return; }
    if (ev) {
      switch (ev) {
        case 100: // connected (again): registration from form 1 (the step skips the forms that already have a 107 or
          // a failure mark, so a link flap during setup cannot skip one), then notifications on the form that worked
          // last; a pending connect back-off (up to 60 ticks) must not hold up the setup of this link
          conn = wasConn = 1; everValid = got = wt = nf = rT = 0;
          bs = 1;
          break;
        case 101: // disconnected: the system reconnects by itself; no appConn call until the next 100, but a connect
          // retry that is already scheduled (step 0) stays scheduled
          conn = cv = 0;
          if (bs) bs = 9;
          break;
        case 107: rg |= 1 << ch; break; // registered locally (also arrives without a connection)
        case 108: fm |= 1 << ch; break; // registration failed: that form is not enabled (an expected outcome, not an error)
        case 109: cv = 1; nf = 0; break;
        case 112: // connect failed: try again after 10 s (6 times), then every 60 s; a 112 while connected is stale
          // and starts nothing
          if (!conn) { bs = 0; rT = nf > 5 ? 60 : 10; }
          nf++;
          break;
        case 110: nf++; // enabling notifications failed: the phase watchdog moves on to the other form
      }
      return;
    }
    if (rT > 0) { rT--; return; }
    // 10 ticks of step 3 or 9 with no byte since the connect: notifications on the other UUID form.
    if (conn && !got && bs > 2 && ++wt > 9) { wt = 0; ph ^= 1; bs = 3; }
    // A UUID form that already has its 107 or a failure mark is not registered again (a 100 restarts at form 1).
    while (bs && bs < 3 && (rg | fm) & 1 << bs) bs++;
    k = bs;
    try {
      switch (bs) {
        case 0: // a new connection id: its UUIDs are not registered yet; the log line separates "never connected"
          // from a dead onLoad, and only the first retries repeat it (debug builds: every attempt)
          if (nf < 3) systemEvent('[vl] connect');
          //@dbg if (nf > 2) systemEvent('[vl] connect');
          rg = fm = 0;
          cid = appConn.connect(enabledZappId, onBle, S.sa[0], S.sa[1]);
          bs = 9;
          // Demo variant only: the simulator's appConn.connect returns nothing and its enabledZappId is a function.
          // On a watch enabledZappId is a number, so this can never start in flight.
          //@demo if (cid === undefined && typeof enabledZappId == 'function' && !seenEv) {
          //@demo   demo = 1;
          //@demo   off = 0; // ALT then shows the synthetic QNE altitude (the simulator's own altitude does not match it)
          //@demo   dg = evalFile('{file_path}/ext4.js')(onBle, S.dp % 10);
          //@demo   cv = 1; // con = 1 closes the Searching view
          //@demo   conn = S.dp % 10 != 3;
          //@demo   if (S.dp % 10 < 3) { air = 1; fsec = 720; bestC = 3.1; } // start mid-flight for screenshots
          //@demo }
          break;
        case 1:
        case 2:
          bs++;
          evalFile('{file_path}/ext2.js')(cid, k);
          break;
        case 3: // wait up to 5 ticks for both forms to answer (107 or failure), then enable notifications; when only
          // the other form has its 107 (a 107 wins over a failure mark from a duplicate registration), use that one
          if (((rg | fm) & 6) != 6 && wt < 6) break;
          c = rg & 6;
          if (c && !(c & 2 << ph)) ph ^= 1;
          appConn.enaCharNotf(cid, ph + 1);
          bs = 9;
          wt = 0;
      }
    } catch (e) {
      rT = k || nf < 6 ? 3 : 60;
      if (k == 1 || k == 2) {
        if (fm & 8 << k) fm |= 1 << k;
        else { fm |= 8 << k; bs = k; }
      } else nf++;
    }
  };
  return ble;
})();

// Closes the tick bin, updates the rings, link state, source and calibration, and the displayed values. Inputs as
// numbers (R1): w watch altitude, wv watch vertical speed, sl sea-level pressure.
var dat = (function () {
  var goodRun = 0, emptyRun = 0, badBase = 0, hLast = NaN, vLast = NaN;
  // Average climb (m/s) over n seconds from ring half b (0 vario, 32 watch): newest valid sample of the last 3
  // ticks against the oldest valid sample about n ticks back, divided by their real distance (at least n/2).
  var avg = function (b, n) {
    var i, j, a, o;
    for (i = 0; i < 3; i++) {
      a = ring[b + ((tk - i) & 31)];
      if (a === a) break;
    }
    if (a !== a) return NaN;
    for (j = n; j - i >= n / 2; j--) {
      o = ring[b + ((tk - j) & 31)];
      if (o === o) return (a - o) / (j - i);
    }
    return NaN;
  };
  dat = function (w, wv, sl) { // assigned and returned, not `return function` (R4)
    var h = NaN, v = NaN, k;
    if (bN) h = 44330.77 * (1 - Math.pow(bP / bN / 101325, 0.190263));
    if (bVN) v = bV / bVN / 100;
    bP = bN = bV = bVN = 0;
    k = h === h;
    ring[tk & 31] = h;
    // Lines with valid pressure but no usable vario field: the pressure-derived 1-tick rate (NaN after an empty tick).
    if (k && v !== v) v = h - ring[(tk - 1) & 31];
    if (k) { hLast = h; vLast = v; }
    if (!isFinite(w)) w = NaN;
    ring[32 + (tk & 31)] = w;
    if (k) { goodRun++; emptyRun = 0; everValid = 1; badBase = nBad; nf = 0; } else { emptyRun++; goodRun = 0; }
    // 0 SEARCH, 1 LINKING, 2 LIVE (2 ticks in, 3 ticks out), 3 STALE, 4 LOST, 5 BAD, 6 ERROR (no data, > 8 failures)
    k = nf > 8 ? 6 : (!conn ? (wasConn ? 4 : 0) : (goodRun > 1 || (ls == 2 && emptyRun < 3) ? 2 :
      (emptyRun > 9 && nBad - badBase > 19 ? 5 : (everValid && emptyRun > 2 ? 3 : (ls == 3 || ls == 5 ? ls : 1)))));
    if (k != ls) { ls = k; lsT = 0; } else lsT++;
    src = ls == 2 ? 2 : (w === w ? 1 : 0);
    if (!air && h === h && w === w) off = off === off ? off + (w - h - off) / 30 : w - h; // frozen in flight
    am = S.ar || (off < 1500 && off > -1500 ? 0 : 1); // no watch altitude or an implausible offset: QNH
    if (src == 2) {
      vI = vLast;
      avN = avg(0, S.aw);
      a10 = avg(0, 10);
      alt = am ? (am > 1 ? hLast : 44330.77 * (1 - (1 - hLast / 44330.77) *
        Math.pow(101325 / (sl >= 87000 && sl <= 108500 ? sl : 101325), 0.190263))) : hLast + off;
    } else {
      vI = isFinite(wv) ? wv : NaN;
      avN = avg(32, S.aw);
      a10 = avg(32, 10);
      alt = w;
    }
  };
  return dat;
})();

// Flight, thermal and summary statistics (only while the exercise runs); s: ground speed (m/s).
var fly = (function () {
  var aT = 0, aC = 0, lT = 0, thC = 0, thX = 0;
  fly = function (s) { // assigned and returned, not `return function` (R4)
    var f = isFinite(s), a = a10, p, h, i, e;
    if (st && !pz) {
      exT++;
      if (ls == 2) linkT++;
      if (!air) {
        aT = f && s >= 3.5 ? aT + 1 : 0; // 12.6 km/h for 5 s (owner: 16 km/h for 8 s was too slow)
        aC = a >= 1 || a <= -1 ? aC + 1 : 0;
        if (aT > 4 || aC > 9) { air = 1; fsec += aT > 4 ? 5 : 10; aT = aC = lT = thC = thX = 0; }
      } else {
        fsec++;
        lT = a < 0.3 && a > -0.3 && (!f || s < 1.5) ? lT + 1 : 0;
        e = lT >= (f ? 60 : 90); // landed: the detection window was not flight time
        if (e) { air = 0; fsec -= lT; lT = 0; }
        p = src == 2 ? 0 : 32;
        if (th) { // gain = telescoping sum of vario steps (i: ticks back to the previous vario sample), bridging up to 3
          // missing ticks; from the 4th the watch's steps, the first one from the last vario sample (the offset is
          // frozen in flight, so both rings move together); a step beyond 30 m is a jump, not climb
          h = ring[tk & 31];
          for (i = 1; i < 5; i++) if (ring[(tk - i) & 31] === ring[(tk - i) & 31]) break;
          if (i < 4 || (i == 4 && h === h)) h -= ring[(tk - i) & 31];
          else h = ring[32 + (tk & 31)] - ring[32 + ((tk - (i == 4 ? 4 : 1)) & 31)];
          if (h > -30 && h < 30) gn += h;
          if (gn > gmax) gmax = gn;
          thX = a < 0 ? thX + 1 : 0;
          if (e || thX > 14) { th = thX = 0; lastG = gmax; if (gmax > bestG) bestG = gmax; }
        } else if (!e) {
          thC = a >= 0.3 ? thC + 1 : 0;
          if (thC > 4) { // base = lowest altitude of the last 20 ticks
            for (i = 0, e = 1e9, s = NaN; i < 20; i++) {
              h = ring[p + ((tk - i) & 31)];
              if (h < e) e = h;
              if (s !== s) s = h;
            }
            if (s === s) { th = 1; thC = 0; gn = gmax = s - e; }
          }
        }
        if (air) {
          if (avN > bestC) bestC = avN;
          if (alt > maxA) maxA = alt;
        }
      }
    }
  };
  return fly;
})();

// Every output of the tick, in SI units: the "con" output that closes the Searching view (only when it changed) and
// the displayed values. On GLIDE gn carries the height above take-off or the exercise start (setting hr). Wind (logged): speed and from-direction while the store has a wind whose newest estimate
// is less than 30 minutes old; no direction below 1.5 m/s (calm: the screen says WIND CALM).
var put = function (o) {
  var p = XC[0], w = XC[13] && tk - XC[14] < 1800, h = XC[9];
  if (cv >= 0) { o.con = cv; cv = -1; }
  o.vs = vI === vI ? vI : undefined;
  o.av = avN === avN ? avN : undefined;
  o.alt = alt === alt ? alt : undefined;
  o.src = src;
  o.gn = p == 2 ? (h === h ? (h > 9e5 ? h - 1e6 : h) : undefined) : // GLIDE: the climb session gain or LAST (ext8.js)
    (th ? gn : (lastG === lastG ? lastG : undefined));
  //@neg if (p) o.gn = -600; // hardware check (variant neg): does the watch's Altitude formatter show -600 m or "--"?
  o.ft = fsec;
  o.ws = w ? Math.sqrt(XC[11] * XC[11] + XC[12] * XC[12]) : undefined;
  h = Math.atan2(-XC[11], -XC[12]);
  o.wd = w && o.ws >= 1.5 ? (h < 0 ? h + 6.2832 : h) : undefined;
  if (!p) return;
  // thermal map trail (template m-trail): position, and tick*16 + 8 on the map page + lift bucket (7: no fresh fix)
  o.tx = XC[3];
  o.ty = XC[4];
  h = vI;
  o.tn = tk * 16 + (p > 2 ? 8 : 0) + (XC[2] > 4 || h !== h ? 7 : (h < 0.3 ? (h <= -2 ? 0 : (h <= -0.7 ? 1 : 2)) : (h < 1.5 ? 3 : (h < 2.5 ? 4 : 5))));
};

// Pushes visibility and labels (ui), then the values (ut). Texts go only to visible elements and only when the
// integer they show changes; any visibility, page or label change forces a full push, as do the 2 ticks after
// getUserInterface or a view activation (onEvent) and every 5th tick (f). Page (XC[0]): the classic page until the
// exercise starts, then GLIDE / THERMAL from the XC engine (or classic with the setting pg = 2).
// Slots: A1 la/av (AVG, GS on GLIDE), A2 lg/gn (GAIN, the height above take-off or start on GLIDE), C2
// cl/cv (XC pages: ascent rate, glide ratio, current-thermal average), bottom line fl (flight time), rs (reason) or
// gp (text: the wind on GLIDE/THERMAL, else the vario GPS speed and course).
var ut, ui = (function () {
  // last pushed mask, key, page, full-push flag and wind-shown flag; text keys of the big number, A1 and bottom
  // line; the climb colour last set and the theme colours (read on the first tick after every view (re)build)
  var vm = -1, vk = -1, P = 0, F = 0, W = 0, tV = 1e9, tA = 1e9, tD = 1e9, kV = '', cG, cR, cN;
  // Signed climb text (metric m/s with one decimal, imperial ft/min in tens, '--' when unknown), or with k the
  // integer the text is made from, so the text is only rebuilt when it would change.
  var fmt = function (v, k) {
    var t, s;
    if (v !== v) return k ? 1e9 : '--';
    t = Math.floor(Math.abs(v) * (um ? 19.685 : 10) + 0.5);
    if (k) return v < 0 ? -t : t;
    if (um) s = '' + (t > 590 ? 5900 : t * 10);
    else s = (t > 300 ? 30 : (t / 10) | 0) + '.' + (t > 300 ? 0 : t % 10);
    return t ? (v < 0 ? '-' : '+') + s : s;
  };
  ui = function (f) { // assigned and returned, not `return function` (R4)
    var i, b, m, c, t, k, g, X = S.tx, L = S.sl;
    P = XC[0];
    b = air || ls == 2; // bottom line free for flight time, wind or vario GPS
    // Bottom row: the reason when b is not set; the XC engine's wind text (W) on GLIDE/THERMAL while a wind is known; otherwise flight time unless the vario GPS line is chosen and a valid fix is less than
    // 30 s old (so flight time before the first fix and after a long loss); then speed and course from a fix at most
    // 10 s old (RMC lines can be dropped), NO GPS FIX in between.
    t = tk - gT;
    g = b && !(S.gp && t < 31);
    W = P > 1 && XC[13] && tk - XC[14] < 1800 ? 1 : 0;
    c = b && (W || S.gp && t < 11 && gFix);
    i = !air && 81 >> ls & 1 && lsT > 30; // hints: searching, lost or BLE error (ls 0, 4, 6) on the ground for 30 s
    // bits follow S.sl: s0 s2 bt la lg av gn h0 h1 vn vi fl rs gp cv ac ax mp ml ll mg (cv: the C2 slot, value cw and label cl;
    // ac: the classic page's centred altitude, ax: the XC pages' altitude on the left, next to C2)
    m = (ls == 2 ? 0 : 2) | (i ? 384 : 120) | (um ? 1024 : 512) | (P ? 81920 : 32768) | (c ? 8192 : (g ? 2048 : 4096));
    m |= 524288; // the altitude label
    if (P > 2) m = (m & 4102) | 1441792; // THERMAL is the map: trail (mp), climb (ml), gain (mg); status and reason stay
    //@demo if (demo && S.dp < 10) m |= 4; // the DEMO tag (dp 10-14: store screenshots without it)
    // key: reason (bits 0-2), altitude label (3-4), LAST instead of GAIN (5: no thermal running, one finished), page
    // (6-7), the engine's text instead of the GPS line (8: the texts share #gp and are written by two helpers)
    k = (b ? 2 : ls) | (src == 2 ? am : 0) << 3 | (th || lastG !== lastG ? 0 : 32) | P << 6 | W << 8;
    if (m != vm || k != vk) f = 1;
    if (f) {
      for (i = 0; i < 42; i++) setStyle(L[i], 'visibility', (m >> (i >> 1)) & 1 ? 'VISIBLE' : 'HIDDEN');
      vm = m;
      vk = k;
      if (m & 128) setText('#h0', X[13 + (ls < 6)]); // BLE ERROR: restarting the app is the way out
      if (m & 8) setText('#la', X[12]);
      if (m & 16) setText('#lg', X[10 + (k >> 5 & 1)]);
      if (m & 4096) setText('#rs', X[k & 7]);
      if (m & 524288) setText('#ll', X[7 + ((k >> 3) & 3)]); // the XC engine (ext9.js) then sets the XC pages' own labels
    }
    F = f;
  };
  // s: the watch's ground speed (m/s).
  ut = function (s) {
    var t, v, X = S.tx, e = um ? 2.23694 : 3.6, c = P > 2 ? '#ml' : (um ? '#ni' : '#nm');
    if (uiT < 2) { // Light theme (the theme's text colour is black): the darker green, the bright one is unreadable on
      // white. Two getStyle results are compared, so the colour string format does not matter.
      cN = getStyle('css:.cm-bgc', 'color');
      cG = getStyle(cN == getStyle('css:.c-black', 'color') ? 'css:.c-darkgreen' : 'css:.c-green', 'color');
      cR = getStyle('css:.c-red', 'color');
    }
    v = vI >= 0.15 ? cG : (vI <= S.sk ? cR : cN); // tiers of the displayed tenths
    if (v && (F || v != kV)) setStyle(c, 'color', kV = v);
    t = fmt(vI, 1);
    if (F || t != tV) { tV = t; setText(c, fmt(vI)); }
    if (vm & 32 && P % 3 == 0) { // A1: AVG (classic, THERMAL; the XC engine shows ground speed on GLIDE)
      t = fmt(avN, 1);
      if (F || t != tA) { tA = t; setText('#av', fmt(avN)); }
    }
    if (vm & 8192 && !W) { // the vario GPS line: course and speed from the last valid RMC (wind: ext9.js)
      v = ghd === ghd ? Math.round(ghd * 57.2958 + 360) % 360 : -1;
      t = Math.round(gsp * e);
      if (F || v * 1e4 + t != tD) { tD = v * 1e4 + t; setText('#gp', X[15] + (v < 0 ? '--' : v) + X[16] + t + X[17 + um]); }
    }
    // XC page texts; ground speed: the watch's while its GPS fix is fresh (or when there is no RMC), else the vario's
    // RMC from the last 10 s
    v = gFix && tk - gT < 11;
    if (S.e) S.e.u(F, vm, um, gn, isFinite(s) && (XC[2] < 4 || !v) ? s : (v ? gsp : NaN), S.hr, W, tk);
  };
  return ui;
})();

function onLoad(input, output) {
  var i;
  S = evalFile('{file_path}/ext5.js')(); // settings, texts by index and selectors in mask-bit order
  // The search parameters are built once: compiling ext1.js at every connect attempt left ~2.4 KB of cyclic garbage
  // each time (every 10-60 s while searching).
  S.sa = evalFile('{file_path}/ext1.js')(S.dm, S.sn);
  for (i = 0; i < 64; i++) ring[i] = NaN;
  XC[7] = XC[8] = -1;
  output.con = 0;
}

function evaluate(input, output) {
  tk++;
  uiT++;
  um = input.um == 1 ? 1 : 0;
  ble(0, 0);
  //@demo if (demo) { dg(); input.la = dg.a; input.lo = dg.o; input.spd = dg.s; input.walt = dg.h; } // demo watch inputs (ext4.js)
  dat(input.walt, input.wvs, input.slp);
  fly(input.spd);
  if (S.e) S.e(input.la, input.lo, tk, alt, air, th, st && !pz, input.walt, src); // XC engine (GPS fixes, circling, wind, pages)
  if (S.e && mo) XC[0] = mo; // a long press overrides the automatic page until the next one
  //@map if (S.e) XC[0] = 3; // hardware check (variant map): the thermal map page from the exercise start, no circling needed
  put(output);
  //@dbg if (!(tk % 10)) ble(-1, 0); // the 10-tick line [vl] <state> <ok> <bad> <maxlen> <phase> <step> <rg> <fm> <air> <page> <circling> <fix age> <wind>
  ui(uiT < 3 || !(tk % 5));
  ut(input.spd);
}

// The XC engine is compiled once, at the exercise start, and kept: a rare moment, after the onLoad compiles, and only
// exercises need it (the classic page is shown until then). evalFile may only be called from main.js (reference
// L1212), so all four files are compiled here: ext6.js makes the engine from the factories of ext9.js (texts), ext7.js
// (wind) and ext8.js (statistics, pages) and releases them. The classic page setting (pg 2) never loads it: v1.0's
// screen and memory, without wind, heights or XC summary entries.
function onExerciseStart() {
  st = 1;
  pz = 0;
  if (!S.e && S.pg < 2) S.e = evalFile('{file_path}/ext6.js')(XC, S.pg, S.hr, evalFile('{file_path}/ext9.js'), evalFile('{file_path}/ext7.js'), evalFile('{file_path}/ext8.js'));
}

function onExercisePause() {
  pz = 1;
}

function onExerciseContinue() {
  pz = 0;
}

function getUserInterface() {
  uiT = 0; // full repaint and the theme colours re-read on the next evaluate
  return { template: 'v' };
}

// The view's onActivate sends event 1 every time the view is activated, also when the firmware rebuilds it after a
// lap, an overlay or a screen switch without calling getUserInterface: repaint everything on the next evaluate.
// The debug line lets hardware check H11 confirm that an onActivate $.put reaches main.js.
function onEvent(input, output, id) {
  uiT = 0;
  if (id == 2 && S.e) mo = mo ? 0 : (XC[0] == 3 ? 2 : 3); // long press (template userInput): map <-> GLIDE, then automatic again
  //@dbg systemEvent('[vl] onEvent ' + id);
}

function getSummaryOutputs() {
  return evalFile('{file_path}/ext3.js')(st, um, bestC, maxA, fsec, th && gmax > bestG ? gmax : bestG, exT ? 100 * linkT / exT : 0, XC[7], XC[8]);
}
