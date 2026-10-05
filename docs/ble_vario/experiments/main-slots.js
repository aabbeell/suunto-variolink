// ABOUTME: NOT SHIPPED. Experiment (review round 2): src/ble_vario/main.js v0.3 with 48 numeric state names moved into ring[64..111].
// ABOUTME: 56 module names (scope block 728 B), but fly/ui compile to 2,136/2,012 B. See docs/ble_vario/SPEC.md §0.1 B7 before adopting.

// Build and platform rules this file follows (docs/ble_vario/SPEC.md §0.1, docs/research/deep-dive/):
// - only top-level `var` declarations and lifecycle functions survive the minifier, which mangles top-level names
//   and merges the lifecycle bodies into one dispatcher: state is initialised here or in onLoad, ext*.js get
//   everything as arguments, `output` is only written in lifecycle functions or helpers that receive it as a parameter;
// - at most 8 module-level functions, each compiling to less than ~1.9 KB (measured with SUUNTOPO tools/sp-mem);
//   no array/object literals, regex or `Date`; never two opening braces in a row (Handlebars); nothing is
//   allocated on the BLE data path, UI strings are built once in onLoad;
// - at most 56 module-level names: each is one entry of the module scope's property table, which Duktape allocates
//   as one block (2,480 B at 104 names, inside the 2-3 KB band of logged watch allocation failures; 728 B at 56,
//   the last size without a hash part in lowmem Duktape). Numeric state that is not on the per-byte parser path
//   therefore lives in ring[64..111] (Float32), see the slot table below;
// - every appConn call is in try/catch, one per tick, setup calls only after event 100.

// ---- vario name setting (ext5.js, read once in onLoad); the numeric settings are slots AW..DM ----
var sn = '';
// ---- BLE: step bs (0 connect, 1/2 register UUID form 1/2, 3 enable notifications, 9 wait); phase ph (0 form 1,
// 1 form 2); rg: bit (1 << form) set by its 107; fm: bit (1 << form) set when its registration failed (108 or a
// second throw), bit (8 << form) after its first throw; got = data since the last connect; cv = con value to push
// (-1 none); nf = failures since the last 100, 109 or valid tick (BLE ERROR above 8; also the connect back-off) ----
var cid, bs = 0, ph = 0, wt = 0, rT = 0, rg = 0, fm = 0, got = 0, conn = 0, wasConn = 0, cv = -1;
var seenEv = 0, nf = 0, dg;
// ---- streaming NMEA parser: scalars (reset on every '$') and one preallocated field array ----
var fld = new Float32Array(5);
var pst = 0, ck, cs, hl, hw, sid, fi, acc, dv, sg, fs, len, nOk = 0, nBad = 0, nMax = 0;
// ---- tick bins (LK8EX1 pressure and vario, battery) and the last vario-GPS fix ($GPRMC) ----
var bP = 0, bN = 0, bV = 0, bVN = 0, bat = -1, gFix = 0, gsp = 0, ghd = 0, gT = -99; // gT: tick of the last valid fix
// ---- ring[0..31] vario QNE altitude per tick, ring[32..63] watch altitude per tick, ring[64..111] numeric state.
// Every function names the slots it uses as local constants with exactly these values (test M3 checks it); the
// editor's minifier folds them into literals, so they cost no module name.
// S HLAST 64 VLAST 65 OFF 66 LASTG 67 BESTC 68 MAXA 69 ST 70 PZ 71 AIR 72 AT 73 AC 74 LT 75 FSEC 76 EXT 77 LINKT 78
// S TH 79 THC 80 THX 81 GN 82 GMAX 83 BESTG 84 UIT 85 VM 86 VK 87 TV 88 TA 89 TB 90 AW 91 AM0 92 SKT 93 DP 94 DBG 95
// S GPM 96 DM 97 GOODRUN 98 EMPTYRUN 99 EVERVALID 100 BADBASE 101 LS 102 LST 103 UM 104 SRC 105 VI 106 AVN 107
// S A10 108 ALT 109 AM 110 DEMO 111
// Values: HLAST/VLAST last vario QNE altitude and rate, OFF watch-minus-vario altitude offset (NaN until known),
// LASTG gain of the last finished thermal (NaN none), BESTC/MAXA best average climb and maximum altitude (-1e9 none);
// exercise ST running, PZ paused, AIR airborne, AT/AC take-off timers (speed, climb), LT landing timer, FSEC flight
// seconds, EXT/LINKT exercise seconds and those with LIVE data, TH thermal running, THC/THX thermal entry/exit
// timers, GN/GMAX gain and maximum gain of the current thermal, BESTG best thermal gain; UI: UIT ticks since
// getUserInterface/onEvent, VM/VK last pushed visibility mask and text key, TV/TA/TB last climb key, average key,
// battery; settings AW average window (s), AM0 altitude reference, SKT red at or below (m/s), DP demo phase, DBG,
// GPM bottom line, DM model; link GOODRUN/EMPTYRUN ticks with/without data in a row, EVERVALID data since the
// connect, BADBASE nBad at the last valid tick, LS link state, LST ticks in it; UM imperial, SRC source (2 vario,
// 1 watch, 0 none), VI climb, AVN/A10 average over AW / 10 s, ALT altitude, AM altitude mode; DEMO simulator demo.
var ring = new Float32Array(112), tk = 0;
// ---- UI: theme colours (the last pushed one in kV), strings and selectors built once in onLoad ----
var kV = '', cG = '', cR = '', cN = '', TX, SL;

// BLE event handler: parses notification bytes and records events for evaluate(); never calls appConn.
// Parser states: 0 wait for '$', 1 sentence id, 2 fields, 3/4 checksum hex digits. Separators and checksum
// digits go to fin() so that neither function compiles to a large block.
var onBle = function (ch, ev, d) {
  var i, b, n, EVERVALID = 100, DBG = 95;
  seenEv = 1;
  if (ev == 106 || ev == 115) {
    if (!d) return;
    n = d.length;
    if (n > nMax) nMax = n;
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
  if (ring[DBG]) systemEvent('[vl] ev ' + ev + ' ch ' + ch);
  switch (ev) {
    case 100: // connected (again): registration from form 1 (ble() skips the forms that already have a 107 or a
      // failure mark, so a link flap during setup cannot skip one), then notifications on the form that worked last
      conn = wasConn = 1; ring[EVERVALID] = got = wt = nf = rT = 0;
      bs = 1;
      break;
    case 101: // disconnected: the system reconnects by itself; no appConn call until the next 100, but a connect
      // retry that is already scheduled (step 0) stays scheduled
      conn = pst = cv = 0;
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
};

// Ends the sentence id (','), a field (',' or '*'), or takes a checksum digit and commits a valid sentence.
var fin = function (b) {
  var v;
  if (pst == 1) { // the id as one exact 48-bit number: LK8EX1 -> 1, ..RMC -> 3; LXWP0 and ..GGA (2) end here
    ck ^= b;
    v = hl == 5 ? hw % 16777216 : 0;
    sid = hw == 0x4C4B38455831 ? 1 : (v == 0x524D43 ? 3 : (hw == 0x4C58575030 || v == 0x474741 ? 2 : 0));
    pst = sid == 2 ? 0 : 2;
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
      bat = fld[4] >= 1000 && fld[4] <= 1100 ? fld[4] - 1000 : -1; // 1000 + percent; volts or 999 = unknown
      nOk++;
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

// Signed climb text (metric m/s with one decimal, imperial ft/min in tens, '--' when unknown), or with k the
// integer the text is made from, so the text is only rebuilt when it would change.
var fmt = function (v, k) {
  var t, s, u = ring[104]; // UM
  if (v !== v) return k ? 1e9 : '--';
  t = Math.floor(Math.abs(v) * (u ? 19.685 : 10) + 0.5);
  if (k) return v < 0 ? -t : t;
  if (u) s = '' + (t > 590 ? 5900 : t * 10);
  else s = (t > 300 ? 30 : (t / 10) | 0) + '.' + (t > 300 ? 0 : t % 10);
  return t ? (v < 0 ? '-' : '+') + s : s;
};

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

// One BLE step per tick (always guarded), the "con" output that closes the Searching view and the vario-GPS
// outputs (a fix at most 10 s old: RMC lines can be dropped). A call is made before the step changes, so a throw
// leaves the step to be retried in 4 ticks (a connect that keeps throwing backs off to 60 s after 6 throws); a
// registration that throws twice marks its UUID form failed and setup moves on (the watch may accept only one of
// the two forms).
var ble = function (o) {
  var k, c = gFix && tk - gT < 11, r = ring, OFF = 66, BESTC = 68, AIR = 72, FSEC = 76, DP = 94, DBG = 95, DM = 97,
    DEMO = 111;
  o.gs = c ? gsp : undefined;
  o.hd = c && ghd === ghd ? ghd : undefined;
  if (cv >= 0) { o.con = cv; cv = -1; }
  if (rT > 0) { rT--; return; }
  // 10 ticks of step 3 or 9 with no byte since the connect: notifications on the other UUID form.
  if (conn && !got && bs > 2 && ++wt > 9) { wt = 0; ph ^= 1; bs = 3; }
  // A UUID form that already has its 107 or a failure mark is not registered again (a 100 restarts at form 1).
  while (bs && bs < 3 && (rg | fm) & 1 << bs) bs++;
  k = bs;
  try {
    switch (bs) {
      case 0: // a new connection id: its UUIDs are not registered yet; the log line separates "never connected" from
        // a dead onLoad, and only the first retries repeat it
        if (nf < 3 || r[DBG]) systemEvent('[vl] connect');
        rg = fm = 0;
        cid = evalFile('{file_path}/ext1.js')(onBle, r[DM], sn);
        bs = 9;
        // Simulator only: its appConn.connect returns nothing and its enabledZappId is a function. On a watch
        // enabledZappId is a number, so this can never start in flight.
        if (cid === undefined && typeof enabledZappId == 'function' && !seenEv) {
          r[DEMO] = 1;
          r[OFF] = 0; // ALT then shows the synthetic QNE altitude (the simulator's own altitude does not match it)
          c = r[DP] % 10;
          dg = evalFile('{file_path}/ext4.js')(onBle, c);
          o.con = 1;
          conn = c != 3;
          if (c < 3) { r[AIR] = 1; r[FSEC] = 720; r[BESTC] = 3.1; } // start mid-flight for screenshots
        }
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

// Closes the tick bin, updates the rings, link state, source and calibration, and the displayed values and outputs.
var dat = function (n, o) {
  var h = NaN, v = NaN, w = n.walt, k, l, s, f, r = ring, HLAST = 64, VLAST = 65, OFF = 66, AIR = 72, AW = 91,
    AM0 = 92, GOODRUN = 98, EMPTYRUN = 99, EVERVALID = 100, BADBASE = 101, LS = 102, LST = 103, SRC = 105, VI = 106,
    AVN = 107, A10 = 108, ALT = 109, AM = 110;
  if (bN) h = 44330.77 * (1 - Math.pow(bP / bN / 101325, 0.190263));
  if (bVN) v = bV / bVN / 100;
  bP = bN = bV = bVN = 0;
  k = h === h;
  r[tk & 31] = h;
  // Lines with valid pressure but no usable vario field: the pressure-derived 1-tick rate (NaN after an empty tick).
  if (k && v !== v) v = h - r[(tk - 1) & 31];
  if (k) { r[HLAST] = h; r[VLAST] = v; }
  if (!isFinite(w)) w = NaN;
  r[32 + (tk & 31)] = w;
  if (k) { r[GOODRUN]++; r[EMPTYRUN] = 0; r[EVERVALID] = 1; r[BADBASE] = nBad; nf = 0; } else { r[EMPTYRUN]++; r[GOODRUN] = 0; }
  // 0 SEARCH, 1 LINKING, 2 LIVE (2 ticks in, 3 ticks out), 3 STALE, 4 LOST, 5 BAD, 6 ERROR (no data, > 8 failures)
  l = r[LS];
  f = r[EMPTYRUN];
  k = nf > 8 ? 6 : (!conn ? (wasConn ? 4 : 0) : (r[GOODRUN] > 1 || (l == 2 && f < 3) ? 2 :
    (f > 9 && nBad - r[BADBASE] > 19 ? 5 : (r[EVERVALID] && f > 2 ? 3 : (l == 3 || l == 5 ? l : 1)))));
  if (k != l) { r[LS] = k; r[LST] = 0; } else r[LST]++;
  r[SRC] = s = k == 2 ? 2 : (w === w ? 1 : 0);
  f = r[OFF];
  if (!r[AIR] && h === h && w === w) r[OFF] = f = f === f ? f + (w - h - f) / 30 : w - h; // frozen in flight
  r[AM] = l = r[AM0] || (f < 1500 && f > -1500 ? 0 : 1); // no watch altitude or an implausible offset: QNH
  if (s == 2) {
    r[VI] = r[VLAST];
    r[AVN] = avg(0, r[AW]);
    r[A10] = avg(0, 10);
    v = n.slp;
    h = r[HLAST];
    r[ALT] = l ? (l > 1 ? h : 44330.77 * (1 - (1 - h / 44330.77) *
      Math.pow(101325 / (v >= 87000 && v <= 108500 ? v : 101325), 0.190263))) : h + f;
  } else {
    v = n.wvs;
    r[VI] = isFinite(v) ? v : NaN;
    r[AVN] = avg(32, r[AW]);
    r[A10] = avg(32, 10);
    r[ALT] = w;
  }
  v = r[VI];
  o.vs = v === v ? v : undefined;
  v = r[AVN];
  o.av = v === v ? v : undefined;
  v = r[ALT];
  o.alt = v === v ? v : undefined;
  o.src = s;
};

// Flight, thermal and summary statistics (only while the exercise runs), then the remaining outputs in SI units.
var fly = function (n, o) {
  var r = ring, s = n.spd, f = isFinite(s), a = r[108], p, h, i, e, LASTG = 67, BESTC = 68, MAXA = 69, ST = 70,
    PZ = 71, AIR = 72, AT = 73, AC = 74, LT = 75, FSEC = 76, EXT = 77, LINKT = 78, TH = 79, THC = 80, THX = 81, GN = 82,
    GMAX = 83, BESTG = 84, LS = 102, SRC = 105, AVN = 107, ALT = 109; // a: A10
  if (r[ST] && !r[PZ]) {
    r[EXT]++;
    if (r[LS] == 2) r[LINKT]++;
    if (!r[AIR]) {
      r[AT] = f && s >= 4.5 ? r[AT] + 1 : 0;
      r[AC] = a >= 1 || a <= -1 ? r[AC] + 1 : 0;
      if (r[AT] > 7 || r[AC] > 9) { r[AIR] = 1; r[FSEC] += r[AT] > 7 ? 8 : 10; r[AT] = r[AC] = r[LT] = r[THC] = r[THX] = 0; }
    } else {
      r[FSEC]++;
      r[LT] = a < 0.3 && a > -0.3 && (!f || s < 1.5) ? r[LT] + 1 : 0;
      e = r[LT] >= (f ? 60 : 90); // landed: the detection window was not flight time
      if (e) { r[AIR] = 0; r[FSEC] -= r[LT]; r[LT] = 0; }
      p = r[SRC] == 2 ? 0 : 32;
      if (r[TH]) { // gain = telescoping sum of vario steps (i: ticks back to the previous vario sample), bridging up to 3
        // missing ticks; from the 4th the watch's steps, the first one from the last vario sample (the offset is
        // frozen in flight, so both rings move together); a step beyond 30 m is a jump, not climb
        h = r[tk & 31];
        for (i = 1; i < 5; i++) if (r[(tk - i) & 31] === r[(tk - i) & 31]) break;
        if (i < 4 || (i == 4 && h === h)) h -= r[(tk - i) & 31];
        else h = r[32 + (tk & 31)] - r[32 + ((tk - (i == 4 ? 4 : 1)) & 31)];
        if (h > -30 && h < 30) r[GN] += h;
        if (r[GN] > r[GMAX]) r[GMAX] = r[GN];
        r[THX] = a < 0 ? r[THX] + 1 : 0;
        if (e || r[THX] > 14) { r[TH] = r[THX] = 0; h = r[LASTG] = r[GMAX]; if (h > r[BESTG]) r[BESTG] = h; }
      } else if (!e) {
        r[THC] = a >= 0.3 ? r[THC] + 1 : 0;
        if (r[THC] > 4) { // base = lowest altitude of the last 20 ticks
          for (i = 0, e = 1e9, s = NaN; i < 20; i++) {
            h = r[p + ((tk - i) & 31)];
            if (h < e) e = h;
            if (s !== s) s = h;
          }
          if (s === s) { r[TH] = 1; r[THC] = 0; r[GN] = r[GMAX] = s - e; }
        }
      }
      if (r[AIR]) {
        if (r[AVN] > r[BESTC]) r[BESTC] = r[AVN];
        if (r[ALT] > r[MAXA]) r[MAXA] = r[ALT];
      }
    }
  }
  o.bat = r[LS] == 2 && bat >= 0 ? bat : undefined;
  h = r[LASTG];
  o.gn = r[TH] ? r[GN] : (h === h ? h : undefined);
  o.ft = r[FSEC];
};

// Pushes visibility, texts and colours. Texts go only to visible elements and only when they change; any
// visibility or state-text change forces a full push, as do the 2 ticks after getUserInterface or a view
// activation (onEvent) and every 5th tick.
var ui = function (f) {
  var i, b, m, s, c, t, k, g, l, r = ring, LASTG = 67, AIR = 72, TH = 79, VM = 86, VK = 87, TV = 88, TA = 89,
    TB = 90, SKT = 93, DP = 94, GPM = 96, LS = 102, LST = 103, UM = 104, SRC = 105, VI = 106, AVN = 107, AM = 110,
    DEMO = 111;
  l = r[LS];
  b = r[AIR] || l == 2; // bottom line free for flight time or vario GPS
  // Bottom row: the reason when b is not set; with b, flight time unless the vario GPS line is chosen and a valid
  // fix is less than 30 s old (so flight time before the first fix and after a long loss); then speed and course
  // from a fix at most 10 s old (RMC lines can be dropped), NO GPS FIX in between.
  t = tk - gT;
  g = b && !(r[GPM] && t < 31);
  c = b && r[GPM] && t < 11 && gFix;
  i = !r[AIR] && 81 >> l & 1 && r[LST] > 30; // hints: searching, lost or BLE error (ls 0, 4, 6) on the ground for 30 s
  // bits follow SL: s0 s2 bt la lg av gn h0 h1 vn vi fl rs gp
  m = (l == 2 ? 1 : 2) | (r[DEMO] && r[DP] < 10 ? 4 : 0) | (i ? 384 : 120) |
    (r[UM] ? 1024 : 512) | (g ? 2048 : (c ? 8192 : 4096));
  // key: reason (bits 0-2), altitude label (3-4), LAST instead of GAIN (5: no thermal running, one finished)
  t = r[LASTG];
  k = (b ? 2 : l) | (r[SRC] == 2 ? r[AM] : 0) << 3 | (r[TH] || t !== t ? 0 : 32);
  if (m != r[VM] || k != r[VK]) f = 1;
  if (f) {
    for (i = 0; i < 28; i++) setStyle(SL[i], 'visibility', (m >> (i >> 1)) & 1 ? 'VISIBLE' : 'HIDDEN');
    r[VM] = m;
    r[VK] = k;
    if (m & 128) setText('#h0', TX[13 + (l < 6)]); // BLE ERROR: restarting the app is the way out
    if (m & 8) setText('#la', TX[12]);
    if (m & 16) setText('#lg', TX[10 + (k >> 5)]);
    if (m & 4096) setText('#rs', TX[k & 7]);
    setText('#ll', TX[7 + ((k >> 3) & 3)]);
  }
  s = r[UM] ? '#ni' : '#nm';
  b = r[VI];
  c = b >= 0.15 ? cG : (b <= r[SKT] ? cR : cN); // tiers of the displayed tenths
  if (c && (f || c != kV)) setStyle(s, 'color', kV = c);
  t = fmt(b, 1);
  if (f || t != r[TV]) { r[TV] = t; setText(s, fmt(b)); }
  if (m & 32) {
    b = r[AVN];
    t = fmt(b, 1);
    if (f || t != r[TA]) { r[TA] = t; setText('#av', fmt(b)); }
  }
  if (m & 1 && (f || bat != r[TB])) { // the vario's battery next to the source it belongs to
    r[TB] = bat;
    setText('#s0', bat >= 0 ? 'VARIO ' + bat + '%' : 'VARIO');
  }
};

function onLoad(input, output) {
  var s = evalFile('{file_path}/ext5.js')(), r = ring, BESTC = 68, MAXA = 69, AW = 91, AM0 = 92, SKT = 93, DP = 94,
    DBG = 95, GPM = 96, DM = 97;
  r[AW] = s.aw; r[AM0] = s.ar; r[SKT] = s.sk; r[DP] = s.dp; r[DBG] = s.dbg; r[GPM] = s.gp; r[DM] = s.dm; sn = s.sn;
  r[BESTC] = r[MAXA] = -1e9; // none yet
  // Texts main.js shows, by index (12: the average label, 13/14: the first hint line), and the selectors in mask-bit
  // order (each element and its children).
  TX = 'SEARCHING|CONNECTING|NO GPS FIX|NO DATA|LINK LOST|BAD DATA|BLE ERROR|ALT|QNH|QNE|GAIN|LAST|AVG|Restart exercise and vario|Restart vario, check name'.split('|');
  TX[12] = 'AVG ' + s.aw + 's';
  SL = '#s0|#s0 *|#s2|#s2 *|#bt|#bt *|#la|#la *|#lg|#lg *|#av|#av *|#gn|#gn *|#h0|#h0 *|#h1|#h1 *|#vn|#vn *|#vi|#vi *|#fl|#fl *|#rs|#rs *|#gp|#gp *'.split('|');
  for (s = 0; s < 68; s++) r[s] = NaN; // both altitude rings and HLAST, VLAST, OFF, LASTG
  output.con = 0;
}

function evaluate(input, output) {
  var r = ring, UIT = 85, DBG = 95, LS = 102, UM = 104, DEMO = 111;
  tk++;
  r[UIT]++;
  r[UM] = input.um == 1 ? 1 : 0;
  ble(output);
  if (r[DEMO]) dg();
  dat(input, output);
  fly(input, output);
  if (!cG) { // theme colours for the climb number, re-read after every getUserInterface or view activation
    cN = getStyle('css:.cm-bgc', 'color');
    // Light theme (the theme's text colour is black): the darker green, the bright one is unreadable on white.
    // Two getStyle results are compared, so the colour string format does not matter.
    cG = getStyle(cN == getStyle('css:.c-black', 'color') ? 'css:.c-darkgreen' : 'css:.c-green', 'color');
    cR = getStyle('css:.c-red', 'color');
  }
  if (r[DBG] && !(tk % 10)) systemEvent('[vl] ' + r[LS] + ' ' + nOk + ' ' + nBad + ' ' + nMax + ' ' + ph + ' ' + bs + ' ' + rg + ' ' + fm);
  ui(r[UIT] < 3 || !(tk % 5));
}

// Slot numbers are literals in the short lifecycle functions: a constant declared in several of them stays a
// variable in the minified dispatcher, where all lifecycle bodies share one scope.
function onExerciseStart() {
  ring[70] = 1; // ST
  ring[71] = 0; // PZ
}

function onExercisePause() {
  ring[71] = 1; // PZ
}

function onExerciseContinue() {
  ring[71] = 0; // PZ
}

function getUserInterface() {
  ring[85] = 0; // UIT
  cG = ''; // re-read theme colours
  return { template: 'v' };
}

// The view's onActivate sends event 1 every time the view is activated, also when the firmware rebuilds it after a
// lap, an overlay or a screen switch without calling getUserInterface: repaint everything on the next evaluate.
function onEvent(input, output, id) {
  ring[85] = 0; // UIT
  cG = '';
  if (ring[95]) systemEvent('[vl] onEvent ' + id); // DBG
}

function getSummaryOutputs() {
  var r = ring, BESTC = 68, MAXA = 69, ST = 70, FSEC = 76, EXT = 77, LINKT = 78, TH = 79, GMAX = 83, BESTG = 84,
    UM = 104;
  return evalFile('{file_path}/ext3.js')(r[ST], r[UM], r[BESTC], r[MAXA], r[FSEC],
    r[TH] && r[GMAX] > r[BESTG] ? r[GMAX] : r[BESTG], r[EXT] ? 100 * r[LINKT] / r[EXT] : 0);
}
