# ble_vario: product and technical specification

## BINDING DECISIONS (2026-10-03, after this spec was written; these override the spec below)

**HARDWARE RESULTS 2026-10-04 (Race S fw 2.53.42 + the user's UltraBip; probes in docs/probe, watch log via SUUNTOPO/tools/watch-log) - binding:**
- Discovery: the exact full name filter [9, "UltraBip🪂Abel"] connects (stage 6, data flowing). The service-UUID filter (FFE0) never finds it. Prefix matching ([9, "UltraBip"]) is still unconfirmed.
- regUuid/enaCharNotf: the base-expanded 16-byte UUID form gets event 110 (CONFIG_FAILED); the plain 2-byte form [0xE0,0xFF]/[0xE1,0xFF] gets 109 and delivers data. Enable the 2-byte form FIRST (v1.0 tried 16-byte first and only reached data after a disconnect/reconnect, about 30 s).
- The watch receives the NMEA stream in 20-byte notifications (4 notifications per LK8EX1+LXWP0 pair), not whole lines: reassembly across notifications is mandatory on the Race S.
- v1.0 on the watch: connected within 5 s of enabling, layout fits the round screen, VARIO battery 50 % and ALT 228 m shown correctly.
- v1.1 (2026-10-04, VarioLink thread): `ext2.js` now registers the 2-byte form as id 1 and the 16-byte form as id 2, so notifications are enabled on the 2-byte form first; `main.js` is unchanged. B1 expects the new order; `golden.json` was re-recorded from the v1.0 source with only this `ext2.js` swapped. The app is renamed VarioLink (appId `variol01`), author "O. Vitya".
- **v1.1 on the watch (2026-10-04 10:13, `v1.1-abel-dbg`, pages automatic):** X1 pass, the app loads with the new inputs, but the load logged `ERR APPLICATION : ZappPrv:sub r:401 l:16907->get` (one input refused as a subscription and read once instead; which of GeoCoordinates / Sunset ETE is not yet known). Connect: `connect` 10:13:30, 100 at 10:13:41, 107 on both forms, **109 on form 1 (2-byte) at 10:13:44**, LIVE at once, 20-byte notifications, 0 bad lines, ~10 lines/s. **X4 fail for the automatic pages:** 3 s after the exercise start compiled ext6-9 the firmware unloaded the other app in the mode (Climbing Topo, `Zapp:relMemCb`, `JsTotMem 132316/133120`); when Air Temperature v1.0 was loaded at 10:15:19 the firmware unloaded VarioLink (`relMemCb (exec:zapp)`, `Zapp variol01:Disable`). The XC pages do not fit beside a second app; the classic page with a second app is still to be measured.
- **Owner decision 2026-10-04 after the watch test:** the vario battery ("VARIO 87%") and the HIKE sunset line are dropped (the watch has its own fields for both). The status line is the template's plain VARIO, the `ss` input (`Outdoor/Sunset/ETE`) is gone, and HIKE's bottom line is flight time or the vario GPS line like the classic page. D1 compares only the visibility of `s0` now. sp-mem: automatic pages steady 32.6 KB, peak 37.8 KB; classic 21.2 / 27.3 KB; 50 module names.
- **Owner decisions 2026-10-04 (second round):** no HIKE page (the watch's own pages show ascent, height and time): on the ground the automatic pages show GLIDE; the setting "Pages" is now two values, stored 0 = automatic glide/thermal ("only app in mode"), 1 = classic (the default; `ext5.js` maps them to the internal 0 / 2, so a stored "2" from older builds falls back to classic). "No static text": the VARIO status line is hidden while the vario is live; the top line appears only for WATCH BARO. The ascent-rate EMA (`X[9]`) is gone. sp-mem: automatic pages steady 32.1 KB, peak 37.3 KB; classic 21.2 / 27.3 KB.
- **Take-off from the UltraBip (owner, 2026-10-04):** the UltraBip detects take-off itself, but its documented BLE stream (LK8EX1, LXWP0, GGA, RMC) carries no flight state and the desk capture shows none. The debug variant now logs every new unknown sentence id (`[vl] id <hex>`, from the 10-tick line, nothing in the data path) so a flight or a drive shows whether the vario announces it; until then the app's own detection stays.
- **Take-off by speed (owner, 2026-10-04: "16 km/h for 8 s is quite a lot"):** now `spd` ≥ 3.5 m/s (12.6 km/h) for 5 ticks, 5 s back-dated (was 4.5 m/s for 8); the climb/sink rule (|avg10| ≥ 1 m/s for 10 s) is unchanged. Stodeus does not publish the UltraBip's own detection. golden.json re-recorded from v1.0 with the same rule.
- **TO and TC off the screen (owner, 2026-10-04):** GLIDE no longer shows TO (A2 hidden), THERMAL no longer shows TC (C2 hidden); the engine still computes both (TC is meant for the map page), and the summary keeps max above take-off. True height above ground is impossible: SuuntoPlus exposes no terrain data. The "Height shown" setting (`hr`) is gone from the manifest and data.json.
- **Thermal map as the THERMAL page (owner, 2026-10-04):** circling switches to a full-screen canvas trail (north up around the glider, red lift / blue sink by `vI` bucket, darker with age, 240-s ring, about 140 canvas units per frame), the small climb `#ml` at the bottom, the bottom line kept (wind / flight time / reason). Positions come from ext6.js in the air mass (ground position minus the integrated wind drift, so circles stack) through XC[3]/XC[4] and the outputs `tx`, `ty`, `tn` (tick*16 + 8 on the map page + bucket, 7 = no fresh fix); the template subscribes to the three (Suuntopo's pattern) and REFRESHes only on the map page. sp-mem: automatic pages steady 41.2 KB (was 32.2), classic 27.0 KB (was 21.2: the template's map code is compiled on every page; the ring is allocated only when points arrive). Template 7.4 KB (cap raised to 9 KB). Not yet run on a watch; `variant.js dbg,map` forces the map page from the exercise start for that test.
- **Map page v2 (owner: "mix of A and B", 2026-10-04):** dots instead of a line, one per second (every 2nd/3rd when older), size by lift bucket (6/6/5/9/14/19 px on q, scaled to the display), colour fading with age; the core = climb-weighted centre of the lift dots of the last 33 s, drawn as a yellow ring and used as the map centre once it has weight; a track line from the glider cross. Big instant climb (`#ml`, sp-d-l) and under it the climb session gain (`#mg`, ext8.js `G` + ext9.js `M`, rule in docs/research/xc-features/thermal-gain-rules.md: start at 10-s climb > +0.5 m/s with a 15-s backdated baseline, end after 30 s below -1 m/s or 30 m under the peak, LAST kept if >= 45 s and > 0). sp-mem: automatic pages steady 44.3 KB, classic 28.6 KB.
- **Map page v3 (owner, 2026-10-04: "K", opacity, dynamic core):** round dots from round line caps (a 0.1-px segment per dot, same canvas cost as the square dots; `arc` works on the Race S but its frame cost is unmeasured), fading in 4 steps (1/0.72/0.48/0.28 at 0-20/20-45/45-90/90+ s; colours built once from 6 base colours), the core weighted by the lift step squared, its ring radius 0.7 x the weighted RMS distance of the lift dots from the centre (the lift area; 8 px to 0.6 of the half height), ring width 2-4 by the weight behind it (confidence). sp-mem: automatic pages steady 45.8 KB, classic 29.4 KB.
- **Map page v4 (owner, 2026-10-05):** no bottom line on the map page (the wind text had stayed by mistake; wind, flight time and the GPS line are on GLIDE); the view radius fits the last 25 points, about one circle, around the centre (x1.1, 25-150 m, was a fixed 45 m; 60 points zoomed out to the glide-in) and every dot of the last 60 s is drawn (was every 2nd from 30 s) for a continuous trail. sp-mem: automatic pages steady 46.4 KB, classic 30.0 KB.
- **2026-10-05 (owner):** GLIDE's empty top-right slot (TO until 2026-10-04) shows the climb session gain, labelled GAIN during a climb and LAST between climbs (`gn` output and ext9.js label from ext8.js X[9]). The map holds still: its radius changes only by more than 25 % and its centre moves only when the core (or the glider, before a core exists) is more than 0.3 of the radius away; the core ring is drawn at the core. sp-mem: automatic pages steady 46.95 KB.
- Memory: with LiftLink Vario v1.0 and Air Temperature v1.0 enabled together the firmware logged "WRN UI_FRAMEWORK : JsTotMem 131072/133120" (heap practically full).

1. **Live capture of the user's UltraBip** (docs/research/ultrabip-capture/README.md, raw data in capture-2026-10-03.json and lines-2026-10-03.txt): it advertises ONLY its local name `UltraBip🪂<pilot name>` (here `UltraBip🪂Abel`; the BipLink pilot name replaces the serial); no service UUIDs, no manufacturer data. Discovery must therefore use the name: sp1 = complete local name prefix `UltraBip` [9, 0x55,0x6C,0x74,0x72,0x61,0x42,0x69,0x70]; whether the watch matches by prefix or only exactly is being tested on the watch with the probe apps (docs/probe/). Design for both: a phone setting for the full device name (inline string setting, default empty = prefix mode) and document it. sp2 may be ignored by the firmware entirely, so the important filter goes in sp1.
2. The stream: one complete line per notification on Race S (MTU 127), `$LK8EX1` and `$LXWP0` each at ~10 Hz, lines end with \r\n. Battery Service 0x180F / 0x2A19 exists. Use the recorded capture as the primary test fixture (all 794 notifications, plus re-chunked 1..19-byte variants for MTU-23 watches).
3. Add an optional vario-GPS readout (ground speed, heading, fix indicator from $GPRMC/$GPGGA when present) for pilots who lower the watch GPS to save battery; the FAQ must explain that SuuntoPlus cannot feed positions into the watch's own track.
- Platform rules found after this spec was written are in `docs/research/deep-dive/` (limits.md, ble-gatt.md, refresh-rate.md, ble-discovery.md, suuntopo-crash.md). They are binding and override this spec where they differ. The most important:
  - No single allocation above ~4,000 B (string, array of more than ~500 elements, typed-array buffer, compiled function or ext file); oversize requests fail outright and try/catch does not contain them. Keep anything (re)created during an exercise under ~2 KB.
  - data.json (settings + localStorage, one file) must stay under ~2 KB, never above ~3.5 KB; every localStorage call allocates a buffer the size of the whole file, so call it only in onLoad, on rare user actions or at exercise end.
  - Never use `output` as a bare value: only `output.<name>` inside lifecycle functions (or passed as an argument to a module-level helper). Never write outputs from the BLE handler, closures or ext files, never alias `output`.
  - Every appConn call goes in try/catch (an uncaught BLE error disables the app); no appConn call before event 100; 107 means 'registered locally' only; treat 106 and 115 alike; one GATT request in flight; a handler firing faster than 1 Hz must allocate nothing (no new, literals, string concatenation or closures).
  - The display is guaranteed to update only once per evaluate (~1 Hz).
  - Race S: 2 SuuntoPlus app slots per sport mode.
- **Memory budgets (binding, measured with the calibrated Duktape harness; its numbers match real watch allocation logs byte for byte):** run `bash ../SUUNTOPLUS-AGENTIC-DEV-ENV/tools/sp-mem/build.sh` once, then `node ../SUUNTOPLUS-AGENTIC-DEV-ENV/tools/sp-mem/sp-mem.js <appDir>` (see its README; write scenarios for your app). Use the lowmem est32 columns. Targets: BLE display app peak <= 12 KB and steady <= 10 KB; canvas topo app peak <= 20 KB and steady <= 16 KB including the topo; every compiled function block <= ~1.9 KB; no allocation per BLE notification; no cyclic garbage per frame (hoist callbacks out of draw loops). For reference: SUUNTOPO v0.3 is 31 KB steady with empty slots and has a 6.9 KB function block (both fail); the hardware-test app hwtest3 that ran fine on the user's Race S is 15.7 KB steady.
  - **Measured result (2026-10-04 memory round, §0.1.8): not met.** Steady 19.1 KB, load peak 25.0 KB, run peak 21.6 KB, every compiled function ≤ 1,876 B, scope record 728 B, no cyclic garbage per frame or per connect retry, no allocation per notification. That is the structural floor without a user-visible change; §0.1.8 prices each feature that would have to go.
  - **v1.1 with the XC pages (§0.1.9): not met, further from it.** Automatic pages (default): steady 31.8 KB, exercise-start peak 38.2 KB, run peak 34.4 KB; classic page setting (no XC engine): 21.5 / 27.6 / 24.2 KB. Every compiled function ≤ 1,848 B, no cyclic garbage per frame, no heap allocation per notification (about 6 transient activation records per line, freed on return; §0.1.10). §0.1.9 prices the wind, the GPS engine and the pages.
  - **v1.1 after the XC review round (§0.1.10): not met; the default is now the classic page.** Classic page (store default): steady 21.6 KB, load peak 27.7 KB, run peak 24.3 KB. Automatic pages (setting "Pages"): steady 33.3 KB, exercise-start peak 38.6 KB, run peak 36.1 KB (the review fixes cost 1.5 KB). Every compiled function ≤ 1,772 B, module scope record 728 B (51 names), no cyclic garbage per frame.


Status: draft 2, 2026-10-03. **Implemented as v0.3** (packaged as v1.0, §0.1.7; restructured for memory with identical behaviour after the package, §0.1.8; XC pages added as v1.1, §0.1.9; XC review round, classic page the default again, §0.1.10) in `src/ble_vario` (v0.1 plus the review round 1 fixes in §0.1.5 and the round 2 fixes in §0.1.6; unit-tested, memory-measured, simulator-checked; v1.0 ran on the user's Race S with the UltraBip on 2026-10-04, see the hardware results at the top; v1.1 has not run on a watch). §0.1 is authoritative where it disagrees with §1-§18 below. Target: a SuuntoPlus sports app (`"type": "device"`) that shows live data from a Stodeus UltraBip or BlueBip vario on the wrist while paragliding. Primary watch: Suunto Race S (display `q`, 466x466 AMOLED).

## 0.1 Implementation v0.1 (2026-10-03): what was built, and every place it departs from this spec

Files: `src/ble_vario/` (`main.js`, `ext1.js`-`ext5.js`, the XC engine `ext6.js`-`ext9.js` since §0.1.9, `v.html`, `manifest.json`, `data.json`, `en.json`); tests `test/ble_vario/run.js` (58 tests since §0.1.8, 66 since §0.1.9 with the synthetic tracks of `xctrack.js`, plain Node; B2b also runs `ext1.js` in Duktape when `duk` is installed, M2 runs SUUNTOPO `tools/sp-mem` when present) with `harness.js`, the differential sessions `sessions.js` and their v1.0 recording `golden.json` (written by `golden.js`), the debug/demo variant builder `variant.js`, and the sp-mem scenarios and measuring script in `test/ble_vario/mem/` (`scen-vario.js`, `scen-idle.js`, `scen-flight.js`, `scen-xc.js`, `measure.js`); build `node tools/sp-build.js src/ble_vario builds/ble_vario/v<ver>` or the stricter `node test/ble_vario/build.js` (same library calls, plus ext checks, warnings as errors and the 5 KB template budget); builds in `builds/ble_vario/` (v0.3 and v0.3-abel-dbg: `sn` "Abel", `dbg` "1"); an unadopted memory experiment in `docs/ble_vario/experiments/main-slots.js` (B7).

### 0.1.1 Toolchain facts found while building (they constrain every SuuntoPlus app)

| # | Finding | Consequence |
|---|---|---|
| T1 | `tools/sp-build.js` runs the **main.js validator** on every `ext*.js`: it parses the bare `function (...) {}` as a statement and requires `getUserInterface`. It fails on the **unmodified official BLE template**. | Build with `test/ble_vario/build.js`: the same library calls (validateSourceDirectory, validateProject, validateAndMinify(main.js), buildApp), with each ext file checked the way the real build (`project/minify.js` minifyExt) and `evalFile` treat it: exactly one function expression, ES5 ESLint with the editor's globals, ABOUTME header, no `{{`. It also fails on the library's "Unknown token" / "Unsupported CSS class" warnings (they only warn) and on a template `.xml` above 5,000 B. Fix for the shared tool: validate only `main.js` with validateAndMinify. |
| T2 | The editor minifier keeps **only top-level `var` declarations and lifecycle function declarations** (any other top-level statement is silently dropped), mangles all top-level names (terser toplevel), and folds every lifecycle body into one dispatcher `function(_e,_,_d)`, where `_` is one flat array: inputs at 0..4, outputs after. `input.x`/`output.x` are rewritten to `_[i]` only inside lifecycle functions and inside top-level `var` helpers that receive `input`/`output` **by identifier**. | State is initialised in top-level `var` initialisers; ext files cannot see main.js names, so they get everything as arguments and never touch `output`; helpers that write outputs take `output` as a parameter (`ble(output)`, `fly(input, output)`). Test M1 runs the editor-minified bundle against the source and compares every output, screen state and BLE call. |
| T3 | main.js and ext files pass through **Handlebars** at build time (with `en.json` as data). | `{{` must never appear in JS (test P9). |
| T4 | `sp-c-*` classes are rewritten to inline `color:` at build time (`css-transform.js` styleMap), so `getStyle('css:.sp-c-green')` finds nothing on the watch. | The template uses the native classes `c-green`, `c-orange`, `c-red`, `cm-mid` (valid for the build, present in the n/o/q CSS) and main.js reads `getStyle('css:.c-green'/'css:.c-red'/'css:.cm-bgc', 'color')`, the reference's own pattern. No `#ref` element. If getStyle returns nothing, no colour is set (test U5). |
| T5 | `displays: ["n","o","q"]` builds, but the build still emits s/m/l packages with no template and no data.jsn (an app with no screen on UI1 watches). | The restriction is dropped; the same template serves every display. UI1 stays untested and unlisted. |
| T6 | `calc(X% - 50%e)` positioning costs ~230 B of template XML per element; `p-hc` plus a plain `top:%` costs ~115 B. | Centred elements use `p-hc`; the AVG/GAIN columns are left-aligned at 15 % / 62 %. Mounted template q: 4,695 B (budget 5,000 B). |
| T7 | `postfix` class padding does not render in the simulator; inline `padding-left` does (the build supports it, the official template uses inline padding). | Gaps use inline `padding-left`. |
| T8 | The bridge's headless simulator gives main.js an **empty localStorage** (data.json is not applied); its appConn methods are no-ops and `enabledZappId` is a function. | Demo phases for screenshots are selected by patching the `dp` default in a scratch copy's `ext5.js` (since §0.1.8: `node test/ble_vario/variant.js demo <dir> sim dp=N [gp=1]` builds that copy); settings are verified only in unit tests (B6). |
| T10 | (§0.1.8) The simulator loads the minified main.js by replacing the **first** `return function` with `function main` and running it as a script (editor `lib/javascript/minified-script.js`); the firmware's loader is not documented. A closure that returns a function puts an earlier `return function` in the file: the simulator then fails with "Line 2: Illegal return statement". | Each closure assigns its helper to the module variable and returns the variable (`onBle = function (...) {...}; return onBle;`, minified `return n=function`), so the dispatcher holds the file's only `return function`. The harness refuses a minified main.js with any other count, and M1 loads it both ways. |
| T9 | The simulator renders capital letters in `f-num` with a serif fallback. | `f-num` only on numeric elements. |

### 0.1.2 Changes forced by the binding decisions and `docs/research/deep-dive/`

| # | Was | Now |
|---|---|---|
| B1 | §6.2: name prefix in sp1, `[3,0xE0,0xFF]` in sp2; serial setting | The UltraBip advertises **only its name** (capture). sp1 = `[9, name]`, sp2 = `[8, same name]`, equally specific, no UUID filter. Setting `sn` "Vario name (optional)": empty = model name only (works only if the watch matches name prefixes); otherwise the part after the parachute ("Abel", "1234") or the whole name ("UltraBip🪂Abel", "UltraBip Abel"); the app builds `<model>` + U+1FA82 + text, UTF-8, at most 16 name bytes, so only 4 characters of a pilot name fit after "UltraBip🪂" (5 after "BlueBip🪂"); a longer pilot name can then only match by prefix (H2 decides the setting label and `maxLength`). Built in `ext1.js` (test B2). v0.2: the parachute is recognised by code point, because a setting the firmware pushes as raw UTF-8 holds U+1FA82 as **one** Duktape character (a JS literal holds a surrogate pair), and the encoder writes code points above 0xFFFF as 4 bytes (test B2b runs the minified `ext1.js` in Duktape 2.7 with raw-UTF-8 inputs). v0.3: a model name at the start of the setting is recognised in any letter case ("Ultrabip Abel", "ULTRABIP ABEL") and wins over the model setting ("BlueBip Abel" with the model left on UltraBip searches for a BlueBip); spaces, '-', '_' and the parachute after it are dropped; the pilot-name part is kept as typed, because the advertised name is case-sensitive (v0.2 searched for "UltraBip🪂Ultr" for "Ultrabip Abel"; tests B2, B2b). |
| B2 | §6.3: regUuid once with 16-byte arrays, enaCharNotf, re-issue once after 10 silent ticks | After **100** only: regUuid id 1 (16-byte base-expanded form), next tick id 2 (2-byte form `[0xE0,0xFF]`/`[0xE1,0xFF]`). A registration that throws is retried once after 4 ticks; a second throw or a 108 marks that form failed (an expected outcome, not a BLE error) and setup moves on. Then at most 5 ticks until both forms have answered (107 or failed), and notifications are enabled: phase 0 = form 1, phase 1 = form 2, or the other form when only that one has its 107 (v0.3: a 107 wins over a failure mark, which a refused duplicate registration can set). 10 ticks without a byte (from the enable, or 10 failed enable attempts) switch to the other form; the first byte locks the form, also across reconnects. **The readChar poll fallback was dropped in v0.2**: FFE1 alternates LK8EX1 and LXWP0, so a 1 Hz read returns LXWP0 about half the time and could not hold LIVE; it was also the only source of 103s and of a second request in flight. **On every 100 (v0.3)** setup restarts at form 1 and `ble()` skips, in the same tick, every form that already has a 107 or a failure mark, so a 101/100 flap between the two registrations no longer leaves form 2 unregistered (v0.2 jumped to step 3 as soon as any form had its 107, and kept a failure mark over a 107: CONNECTING for the rest of the session in up to 9 % of the round-2 reviewer's fuzzed flap runs); a new connect call (after 112) gets a new connection id and starts unregistered. On 101: con 0, no appConn call until the next 100, **but a connect retry already scheduled after a 112 stays scheduled** (v0.2 cancelled it: SEARCHING for the session). **A 112 while connected is stale** and starts nothing (v0.2 called connect every 4 s while LIVE if the watch refused a second connect). **Every appConn call is in try/catch** and is made before the step changes, so a throw retries the same step after 4 ticks. **Connect retries are bounded (v0.3)**: after each of the first 6 failures (112) the next connect comes 10 ticks later, then every 60 ticks; a connect that throws is tried 7 times 4 ticks apart, then every 60 ticks; a 100 ends any back-off wait, so a link the system connects by itself is set up at once (v0.2: unbounded, up to 900 connect calls, ext1.js compilations and log lines per hour). BLE ERROR = more than 8 failures (112, 110, a throw of connect or enaCharNotf) with no good sign in between: the count `nf` (also the back-off counter) is cleared by 100, 109 and every tick with valid data, so an error can never outlive data. In BLE ERROR on the ground the hint lines appear after 30 s, the first reading "Restart exercise and vario". `con` = 1 on 109 or the first data byte, 0 on 101 (the last event wins). The "[vl] connect" systemEvent is logged for the first 3 connect attempts since the last 100 (it separates "never connected" from a dead onLoad) and for every attempt with `dbg`. One call per tick, none from the handler (tests B1, B1c, B8-B19). |
| B3 | D6: LXWP0 parsed as a fallback; GGA/RMC counted and skipped | **Only LK8EX1 is used** (deep-dive refresh-rate rule; the capture shows LK8EX1 always present). LXWP0 and ..GGA are recognised and ignored silently; **..RMC is parsed** for the vario-GPS readout (binding decision 3): status A, speed (knots to m/s), course (degrees to radians). The pressure-invalid / altitude-field fallback is dropped (a line without valid pressure is bad). Sentence ids are matched as one exact 48-bit number (`hw = hw*256 + b`) instead of a `Uint8Array(6)`. v0.2: LXWP0 and ..GGA end at the sentence id (no per-byte parsing or checksum; the reviewer's Duktape benchmark: 257 → 168 ms for 15,880 lines), unknown ids are still checked and count as bad; the vario field is accepted within ±9,000 cm/s (only the 9999 sentinel is rejected, a -32 m/s spiral is valid); a tick with valid pressure but no usable vario field shows the pressure-derived 1-tick rate, or `--` after an empty tick, never the last value (tests P10, P11). |
| B4 | — (binding decision 3) | Setting `gp` "Bottom line": Flight time (default) / "Vario GPS speed and course (UltraBip only)" (v0.3 label; v0.2 said "track", the FAQ's word for the watch's own GPS track). Outputs `gs` (m/s, `Speed_Approximate`) and `hd` (radians, `CompassHeadingDeg_Fourdigits`) are written while the last **valid** RMC fix is at most 10 s old (v0.3; v0.2: 3 s, but RMC lines are dropped: 1 in 26 s in the 2023 log, none in the 2026 capture); a status-V line ends that at once and does not overwrite the last speed. With the GPS line selected the bottom row shows "41 km/h 120°" with such a fix, NO GPS FIX while the last valid fix is 10-30 s old (or the status is V), and **flight time before the first fix and from 30 s after the last one** (v0.3; v0.2 showed an orange NO GPS FIX and no flight time for a whole BlueBip flight). H6 decides whether the line stays in the store text (listing item 5). The FAQ must say SuuntoPlus cannot feed positions into the watch's own track (store text). Test U6. |
| B5 | Settings read in main.js onLoad | `localStorage` is read **only in `ext5.js`, once, in onLoad** (deep-dive: every call allocates the whole data.jsn); model and name are passed to `ext1.js` as arguments. data.json is 90 B (since §0.1.8: 68 B, the six settings only; data.jsn 54 B). |
| B6 | §4.3 colour by `setStyle` | Runtime `setStyle` is proven on hardware only for visibility (deep-dive). Colour is kept as a **progressive enhancement**: the big number's green/red/neutral via `setStyle(color)`; if that is a no-op on the watch, the number stays in the theme colour and the sign carries the meaning (H11 decides; the store text does not claim colour until then). Battery and gain colours were dropped. Status texts that must be coloured (VARIO green, WATCH BARO orange, reasons orange) use static template classes. v0.2: the vario battery is part of the green status line, "VARIO 87%" (v0.1's lone "87%" read as the watch battery; "BAT 87%" did not fit between AVG and GAIN on n), and the DEMO tag is static template text. v0.3: the DEMO tag is `c-yellow` (D12). In the light theme (detected as `getStyle('css:.cm-bgc')` equal to `getStyle('css:.c-black')`: two getStyle results, so the colour string format does not matter) the climb number uses `c-darkgreen` (#2E9E41, about 3.5:1 on white; #3FF07F is about 1.5:1); red stays (3.4:1). The static status classes (VARIO green, WATCH BARO and the reasons orange, about 1.5-1.7:1 on white) are not theme-aware: H11 checks the light theme on the watch (the bridge cannot switch themes), and the store description says "Best read with the dark watch theme" until then (listing item 7). Test U5b. |
| B7 | §12.1 budgets | **Decided and superseded by §0.1.8 (2026-10-04): the closure split was adopted (scope record 728 B, steady 19.1 KB, load peak 25.0 KB, every function ≤ 1,876 B); the slots experiment below was not.** v0.3, measured in Duktape 2.7 with SUUNTOPO `tools/sp-mem` (lowmem est32; scenario `test/ble_vario/mem/scen-vario.js`: the recorded UltraBip stream at 20 lines/s, one drop and reconnect; test M2 runs it): steady app heap **21.5 KB** (watch-fit 21.1 KB), load peak **28.1 KB**, run peak **30.6 KB** (a lower bound; it includes the queued notification arrays), no growth per tick, cyclic garbage only on the setup ticks, none per frame, no allocation per notification. v0.3 costs about 0.9 KB more than v0.2 (20.6 KB): onEvent, the light-theme read, the BLE ERROR hint, the connect back-off, the GPS hold. Compiled functions (est32): ui 1,900, fly 1,876, dat 1,868, onBle 1,808, dispatcher 1,756, ble 1,592, fin 1,584 B, all within the ~1.9 KB guideline (M2 now asserts ≤ 1,900 B; v0.1's parser was 3,132 B); round 2 first pushed ui to 2,012 B and the BLE fixes were restructured (registration skip in `ble()`, a lookup-free hint index, the red threshold precomputed in `ext5.js`) to get back under it. Minified main.js 6,041 B (about 6,050 B in the package; accepted cap 6,100 B; the limits.md 4 KB guideline is exceeded, compiled size is the binding quantity, and the clean threshold measured with 3 apps on a Vertical 2 is ~7.1 KB). ext 849/191/675/1,082/402 B; template q 4,788 B (≤ 5 KB, about 200 B of slack left); data.json 90 B. **Largest live block: the module scope's property table, 2,480 B for 104 module names**, inside the 1.96-3.1 KB band of logged watch allocation failures. Measured in round 2: Duktape sizes that table in steps (capacity …48, 56, 65, 75, 86, 98, 112, 128 entries; each growth adds (n + 16) / 8), at 13 B per capacity entry plus, in lowmem Duktape, a 1,024 B hash part from 64 entries: ≤ 56 names → 728 B, ≤ 65 → 1,872 B, ≤ 75 → about 2,000 B, ≤ 86 → 2,142 B, ≤ 112 → 2,480 B (104 + 8 test names did not grow it, 104 + 12 grew it to 3,712 B). The round-2 reviewer's "about 80 names" therefore stays above 2 KB; under 2 KB needs ≤ 65 names. **Experiment, not adopted (`docs/ble_vario/experiments/main-slots.js`)**: 48 numeric state names moved into `ring[64..111]` (Float32), each function naming its slots as local constants that the editor's terser folds into literals, giving 56 names; 54 of 56 tests passed on it (B6: Float32 rounding of the -2.45 threshold; M2: the size cap); the harness reads such slots through the `// S` table (`env.state`). Result: scope block 728 B, steady 19.8 KB (−1.6 KB), load peak 23.1 KB (−5 KB), run peak 29.0 KB, but fly 2,136 B, ui 2,012 B, dat 1,952 B, dispatcher 1,856 B: Duktape loads a literal property index with an extra LDINT on every access (+4 B; a register index would cost nothing per access, but terser folds the local constants that would hold it; an object property costs about half the literal penalty). One >2 KB block is traded for two. A hybrid does not help: ui, fly and dat have no headroom, and the names used only in the lighter functions (about 29) leave about 76 names (2,142 B). **Owner decision before H10**, now with numbers: (i) keep v0.3 (scope 2.48 KB, every function ≤ 1.9 KB, load peak 28.1 KB); (ii) adopt the slots variant (scope 0.73 KB, load peak 23.1 KB, two function blocks of 2.0-2.1 KB); (iii) cut a feature first, for example thermal/gain (~1 KB compiled) or the GPS line (~0.7 KB), then adopt the slots variant with every block under 1.9 KB. None of them meets the binding BLE display budget above (steady ≤ 10 KB, peak ≤ 12 KB); that still needs a different design or a much smaller feature set. Until decided, H10 runs with the second slot occupied before any store submission. |
| B8 | UI strings in the template | The template is near its 5 KB budget, so the 7 reason texts, ALT/QNH/QNE, GAIN/LAST and the average label are set from main.js (one literal split once in onLoad, `TX`; since §0.1.8 built by `ext5.js` as `S.tx`, which keeps them out of the dispatcher's constants); selector strings are also split once in onLoad from a literal (since §0.1.8 `S.sl`, also from `ext5.js`; nothing is concatenated per push). English only in v1 (§14). Static hints: two single lines ("Restart vario, check name" / "Close phone vario apps"), no alternation. v0.3: the first hint line is pushed from `TX[13]`/`TX[14]` ("Restart exercise and vario" in BLE ERROR, "Restart vario, check name" otherwise); the template keeps `{{h_on}}` as its seed text, because setText only changes an element that has text. |

### 0.1.3 Other implementation decisions

| # | Spec said | Implemented |
|---|---|---|
| I1 | §4.4 table | Elements: `s0` VARIO (+ vario battery, "VARIO 87%") / `s2` WATCH BARO (top 5 %), `la` "AVG 10s" (left 15 %), `bt` DEMO tag (centre, demo phases 0-4 only), `lg` GAIN, or LAST after a thermal ended (left 62 %), `av` average, `gn` gain eval + unit, `h0`/`h1` hints (replace the two rows above; on the ground after 30 s in SEARCHING, LINK LOST and, v0.3, BLE ERROR), `vn` = `nm` number in `sp-d-xxl` + "m/s" (metric always, measured glyphs ~0.42 em per digit so "+30.0 m/s" fits), `vi` = `ni` in `sp-d-xl` + "ft/min", `ll` ALT/QNH/QNE + centred altitude eval, bottom row `fl` (FLT + time) / `rs` (reason) / `gp` (GPS, top 81 %: at 83 % "65km/h 358°" touched the bezel on n; now 3.5 px clear on n, 6.4 px on o), with the altitude row moved up to 65.5 % (ALT label 71.5 %) so it keeps 5-10 px above the GPS row on n/o/q. The unit sits right of the number, baseline-aligned (the build adds 52 px top padding to `sp-d-xxl` on q, which made a unit row under the number collide). Visibility is set on `#id` and `#id *` (VISIBLE/HIDDEN); `setText` only reaches visible elements; any visibility or text-key change forces a full push, as do the 2 ticks after getUserInterface or (v0.3) a view activation, and every 5th tick. v0.3: the uiView's `onActivate` sends `$.put('/Zapp/{zapp_index}/Event', 1, null, 'int32')` and `onEvent` resets the repaint counter, so a view the firmware rebuilds after a lap, an overlay or a screen switch without calling getUserInterface is fully repainted on the next evaluate instead of showing the template's WATCH BARO / SEARCHING / `--` for up to 4 s (test U4b; whether the firmware delivers it is H11). Texts are rebuilt only when their integer value changes (test U2, U4, U8, no lost setText anywhere). |
| I2 | §8.4 gain = alt − base | gain = (alt − lowest of the last 20 ticks) at entry, then a telescoping sum of vario steps that bridges up to 3 missing ticks (a late burst or a short dropout costs nothing); from the 4th missing tick the watch's steps, the first one from the last vario sample (the offset is frozen in flight, so both rings move together); steps beyond 30 m are jumps, not climb. v0.1 lost two ticks of climb per gap (255 of 360 m with one empty tick in 3). Tests A4 (±1.5 m, the 1-s bins lag the tick end), A4b. |
| I3 | §9.3 best gain | Includes a thermal still running at the end (B5). |
| I4 | §8.1 offset > 1500 m: QNH for the session | QNH while the offset is missing or implausible; back to match-watch when it becomes plausible (not sticky). |
| I5 | §7.4 A2 tolerance | Bins carry no timestamps: a 2-s burst delivered in one tick biases avg10 by ~0.1 m/s for that tick, then it is exact again. Accepted. |
| I6 | §10 demo seeds + 4 s screenshot | Seeds only airborne, flight time 720 s and best climb; screenshots wait 8-14 s (25 s for the GPS image, 34 s for the hint phases 3/13). Demo also sends one `$GPRMC` per tick (circling course in the thermal). v0.2: the demo seeds a zero altitude offset instead of forcing QNH, so the label is the default ALT (the store images show what users get), and phase 2/12 starts airborne (the fallback image shows WATCH BARO with FLT). |
| I7 | §11 `fx` fast-display experiment, `dbg` logging | `fx` removed (deep-dive: display updates once per evaluate; the experiment allocated in the 10 Hz handler). Since §0.1.8 the logging is a build-time **debug variant** (`node test/ble_vario/variant.js dbg <dir> [sn=Abel gp=1]`, the `//@dbg` lines; no `dbg` key any more), with the same log lines. `dbg` = "1" logs BLE events and every 10 ticks `[vl] <state> <ok> <bad> <maxlen> <phase> <step> <rg> <fm>` (rg/fm: bit 2 = form 1, bit 4 = form 2 got its 107 / failed; fm bits 16/32 = threw once). v0.3: "[vl] connect" only for the first 3 attempts since the last 100 unless `dbg`; with `dbg`, `onEvent` logs "[vl] onEvent 1" (H11). |
| I8 | §16a B7 "72,000 ticks" | 2 h is 7,200 ticks (72,000 LK8EX1 lines). |
| I9 | §6.3 101 clears the bins | Only the parser is reset; samples received before the drop are valid. |
| I10 | §9.3 summary | v0.2: flight values (best climb, max altitude, flight time, best gain) only after a detected take-off; without one only "Vario link" (v0.1 wrote "Max altitude 0 m"). Max altitude is left out if no altitude was ever valid in flight (test B5b). |
| I11 | §9.2 logged `src` "Vario link" | Renamed "Vario source" (2 vario, 1 watch barometer, 0 none) so it is not confused with the summary's "Vario link" percentage; the FAQ explains the codes. |

### 0.1.4 What was verified here, and what only a watch can show

Verified (v0.3): `node test/ble_vario/run.js` 56/56 (new: B16-B19, U4b, U5b; rewritten B1c and U6; more cases in B2, B2b; M2 asserts every compiled function ≤ 1,900 B). The round-2 regression tests fail on the v0.2 code (12 of 56 fail there). The round-2 adversarial reviewer's liveness fuzz (one working UUID form, delayed 107/109, random link flaps, 6 firmware models × 150 runs) reaches LIVE in all 900 runs on v0.3, and its probes R1, R1b, R2 and the stray-112 probe pass (stray 112: 0 connect calls in 600 s, LIVE 600/600). Both build scripts clean on all displays (template q 4,788 B). Simulator screenshots q/n/o of dp0 (yellow DEMO tag), dp13 (searching hints), gps10 (GPS line) and err13 (BLE ERROR hint, a scratch copy forcing `nf = 99`); the simulator log shows the onActivate `$.put: /Zapp/0/Event 1` on every view start and no app errors; twice in about 30 starts it logged "Error loading HTML template 'v.html': Execution context was destroyed, most likely because of a navigation", once right after another agent's app (t.html) had used the shared simulator, the template then loaded on the next try and the screenshots are complete; 6 v0.2 and 6 v0.3 starts in a row afterwards did not repeat it. The light theme could not be checked (the bridge cannot switch themes). Verified (v0.2): `node test/ble_vario/run.js` 50/50 (incl. the recorded capture: 794 notifications, 397 LK8EX1 accepted, 397 LXWP0 ignored, 0 bad, re-chunked 1..19 B identical; real-time replay LIVE from the 2nd tick, QNE 75.2 m, battery 50 %; scripted watch/vario BLE outcomes B8-B15; `ext1.js` in Duktape with raw-UTF-8 settings B2b; sp-mem memory M2); the editor-minified bundle matches the source (M1); `tools/sp-build.js` and `test/ble_vario/build.js` clean on all displays; simulator screenshots q/n/o (demo phases, fallback, GPS line, imperial, hints) with no simulator errors. Hardware only: H1 (does `[9,"UltraBip"]` match by prefix, or is the exact name needed), which UUID form the watch accepts and which delivers data, whether settings strings really arrive as raw UTF-8 (Duktape behaviour is strong evidence, not proof), `setStyle` colour/visibility and `getStyle` from main.js, `#id *` selectors, glyph widths, reconnect on Race S, heap with a second app (H10), and everything in §16c.

### 0.1.5 Review round 1 (2026-10-03): what changed in v0.2

Three reviews (platform, adversarial, product). Fixed: regUuid throw on one UUID form no longer stalls setup (B2); BLE ERROR no longer latches over live data (B2); enaCharNotf throw retried, not skipped (B2); readChar polling dropped (B2); parser split under 2 KB compiled and LXWP0/GGA dropped at the id (B3, B7); raw-UTF-8 parachute (B1); frozen instant vario on sentinel/out-of-range vario fields (B3); thermal gain across gaps (I2); summary without take-off (I10); battery label, LAST label, GPS row on n (I1, B6); demo ALT label and airborne fallback image (I6); logged output renamed (I11); store text, FAQ, screenshots, banner draft (`store/ble_vario/`); hardware checklist (§16c). Deferred: module-variable count (B7), the binding memory budget (B7, owner decision), the name-setting label and `maxLength` (H2), RMC hold time for the GPS line (H6), support address (owner).

### 0.1.6 Review round 2 (2026-10-04): what changed in v0.3

Three reviews again (platform, adversarial, product), 17 findings, each checked against the code first.

| Finding | Severity | Outcome |
|---|---|---|
| Memory: 104 module names, 2,480 B scope block, 2x the binding budget | P1 | **Deferred, owner decision** (B7), with new measurements: the table grows in steps, so ~80 names is not enough (≤ 65 needed); a 56-name slots variant was built and measured (scope 728 B, load peak −5 KB) but pushes fly/ui to 2,136/2,012 B, so it is parked in `docs/ble_vario/experiments/` with a decision menu |
| Unbounded connect retries, no hint in BLE ERROR | P2 | Fixed (B2 back-off, hint "Restart exercise and vario", log throttle; B1c) |
| Repaint only every 5th tick after a view rebuild | P2 | Fixed (onActivate → onEvent → full repaint, I1; U4b); delivery on the watch is H11 |
| Eval bindings across laps and text latency not in H11 | P2 | Fixed (H11 extended) |
| UUID-form bookkeeping broken by a link flap during setup | P1 | Fixed (B2; B16, B17) |
| `bs` held both the connect retry and the link step (101 cancelled a retry; stray 112 reconnected while LIVE) | P2 | Fixed (B2; B18, B19); also a 100 now clears a pending back-off, which the new 60-tick waits would otherwise have turned into up to 60 s of CONNECTING (B18) |
| Vario name: model prefix matched case-sensitively | P2 | Fixed (B1; B2, B2b) |
| FAQ has nowhere to be published | P1 | Fixed in the text (day-one facts moved into the description); hosting the FAQ is an owner TODO (`<faq-url>`, listing item 2) |
| GPS line sold but never seen working | P1 | Fixed in code (10 s hold, flight time before the first fix and after 30 s without one, label "speed and course (UltraBip only)"; B4, U6) and gated on H6 in the listing (item 5) |
| FAQ promised that the watch reconnects by itself | P1 | Fixed (hedged as the temperature listing does; H8 decides) |
| Light theme: fixed accent colours on white | P1 | Partly fixed: the climb number uses the darker green in the light theme (B6, U5b); the static status-line colours wait for H11's light-theme step, and the description says "Best read with the dark watch theme" (listing item 7) |
| "Red below" setting may do nothing; unclear label | P2 | Fixed (renamed "Show sink in red below"; listing item 6 removes it if colour is a no-op) |
| Graph units (m/min) not explained | P2 | Fixed (FAQ) |
| "Best climb" is the best average | P2 | Fixed (summary "Best avg climb", FAQ) |
| Unsupported watches not named | P2 | Fixed (description) |
| The watch's own Searching screen not in the FAQ | P2 | Fixed with an H7 fill-in marker (no source gives its timeout; the sibling listing's "closes after 60 s" is not copied) |
| DEMO tag plain white | P2 | Fixed (`c-yellow`, D12) |

v0.3 screenshots (same folder): dp0 now shows the yellow DEMO tag; err13 is new (BLE ERROR hint); dp13 and gps10 were retaken; the others are v0.2 images of unchanged screens.

v0.2 screenshots: `docs/ble_vario/screenshots/<display>-<variant>.png`: dp0 demo thermal with the DEMO tag, dp10/dp11 store thermal/sink, fb12 watch-barometer fallback (scratch copy with synthetic watch altitude and vertical speed, which the simulator lacks), gps10 GPS bottom line, gpsreal layout stress with large fixed values ("65km/h 358°", 4567 m, -12.4), imp10 imperial, dp13 searching hints. Scratch copies only patch the `dp`/`gp` defaults in `ext5.js` (and, for fb12/gpsreal/imp10, the named values in `main.js`); `src/` is never patched.

### 0.1.7 Store package v1.0 (2026-10-04)

The v0.3 code unchanged, with `version` "1.0" and `modificationTime` 1791069264 (activities and languages still omitted). **Since §0.1.8 `src/ble_vario` is no longer byte-identical to these packages** (same behaviour, less memory; the manifest still says 1.0 until the next package). Package, listing text, images and the pre-submission list: `store/ble_vario/listing.md`. Builds: `builds/ble_vario/v1.0/` (`.dev` files from `tools/sp-build.js` and the source package `liftli01-source-1.0.zip`, byte-identical to `src/ble_vario`), debug variants `v1.0-dbg/` (store settings), `v1.0-abel-dbg/`, `v1.0-abel-gps-dbg/`. The user's hardware procedure is `docs/ble_vario/HARDWARE_TEST.md` (a short form of §16c). Screenshots dp10, dp11, fb12, gps10 (q, n, o) and q-dp13 were retaken from the v1.0 source; the store images are the q ones.

### 0.1.8 Memory round (2026-10-04, after the v1.0 package): what changed and what it measures

**Behaviour.** Nothing a user sees on a watch changed. Test D1 replays 8 scripted sessions (a full flight with five settings/theme variants, never-found with the 112 back-off, link flaps during setup, connect/enable throws; 2,480 records of every output and the whole screen model, plus every appConn call and the summary) and compares them with `test/ble_vario/golden.json`, recorded from the v1.0 source before this round: identical for the store build and both variants, in source and editor-minified form (a one-tick timing mutation is caught). Simulator screenshots (q/n/o) are byte-identical to the v1.0 images, except the demo's GPS numbers (below).

**What was applied** (the profile's plan, in order of value and risk, each measured with `node test/ble_vario/mem/measure.js <appDir>`: SUUNTOPO sp-mem, lowmem est32, shipped form):

1. **Demo and debug code out of the store build** (plan item 1). Their lines stay in the source as comments starting with `//@demo ` or `//@dbg ` (free once minified); `test/ble_vario/variant.js` copies the app and switches them on. The debug variant has the same log lines as before (§0.1 I7, now with every connect attempt logged); the demo variant is §10. `nOk`/`nMax` exist only in the debug variant (tests count accepted lines with the tick bin `bN`); `dp` and `dbg` left `data.json`.
2. **Connect search parameters built once** (item 3): `ext1.js` returns `[sp1, sp2]` in onLoad (`S.sa`) and `ble()` calls `appConn.connect` itself. Compiling `ext1.js` at every connect attempt left 2,445 B host of cyclic garbage each time, every 10-60 s while searching (rule R7 below).
3. **Texts and selectors from `ext5.js`** (item 4): `S.tx`, `S.sl` instead of the dispatcher's string constants.
4. **Module scope split into closures** (item 2): `onBle` (parser and `fin`), `ble` (link events and the setup step, with its try/catch), `dat` (with `avg`), `fly`, `ui` (with `fmt`) keep their own state; `put(output)` writes every output; settings live in `S` (from `ext5.js`). 52 module names (v1.0: 104), so the scope record is 728 B with no hash part.

| Step (state capture-u8 unless noted) | Steady (watch-fit) | Load peak (bracket) | Run peak, Uint8Array | Run peak, Array | Exercise end | Largest live block | Scope record (names) | Cyclic garbage | Shipped main.js |
|---|---|---|---|---|---|---|---|---|---|
| v1.0 | 21,502 (21,066) | 28,140 (25,968-30,433) | 26,540 | 30,623 | 25,899 | 2,480 scope | 2,480 (104) | 2,445 B host per connect attempt; 1,008 B x2 at the first registration | 6,052 |
| + item 1 | 20,200 (19,760) | 26,835 | 25,246 | 29,358 | 24,507 | 2,304 scope | 2,304 (97) | as v1.0 | 5,613 |
| + item 3 | 20,521 (20,057) | 26,577 | 23,108 | 29,637 | 24,809 | 2,304 scope | 2,304 (96) | none per attempt; 1,008 B x2 (ticks 2-3) | 5,637 |
| + item 4 | 20,128 (19,664) | 26,351 | 22,706 | 29,215 | 24,402 | 2,304 scope | 2,304 | as above | 5,314 |
| + item 2 (now) | **19,098 (18,550)** | **24,969 (23,153-27,207)** | **21,619** | 27,983 | 23,289 | 1,876 (ui function) | **728 (52)** | as above | 5,270 |

Other states, now (v1.0 in brackets): idle with three 112s run peak 20,430 (26,569), cyclic garbage none (2,445 B host at ticks 1, 13, 26, 39); synthetic flight with the GPS line 19,068 / 24,938 / 21,497 (21,472 / 28,109 / 26,509); 2 hours (7,200 ticks, 24 drops) run peak 21,765 (26,509), live growth 0.00 B/tick (0.00). Live blocks 236 → 200 (the watch allocator adds a header per block). Allocations per tick 1,066 → 1,067: lowmem Duktape allocates an activation per call (freed at once by refcount), and `put()` is one more call per tick; the app allocates nothing per notification (P9). The Array-payload run peaks stay inflated because sp-mem queues a whole tick's notification arrays at once; the watch delivers them one at a time. Run peaks are lower bounds (sp-mem collects garbage after every tick), which is why the cyclic garbage column matters.

Compiled functions now (est32, from a Duktape bytecode dump): ui 1,876, dat 1,708, fly 1,696, fin 1,572, ble 1,500, onBle handler 1,264, dispatcher 1,244, put 668, fmt 476, avg 296, the five closure wrappers about 400 together; 12,700 B in all (v1.0 13,804: ui 1,900, fly 1,876, dat 1,868, onBle 1,812, dispatcher 1,756, ble 1,592, fin 1,584, fmt 476, avg 296). Builds: `tools/sp-build.js` and the strict `test/ble_vario/build.js` clean for the store build and both variants; template q 4,788 B, data.jsn 54 B, ext1-ext5 815/191/675/1,082/700 B minified.

**Budget: not met.** The binding BLE display budget (steady ≤ 10 KB, peak ≤ 12 KB) is about 9 KB below what this app can reach without a user-visible change. The memory profile of the same date (prototypes under `/tmp/mem-ble_vario`, not kept in the repo) priced what would have to go, each feature removed alone from its closure-split prototype p-s6 (19,129 B steady, 31 B more than this source):

| Feature removed | Steady | Load peak |
|---|---|---|
| F9 flight detection, flight time and the summary (includes the thermal) | −3,076 | −3,115 (exercise-end peak −7.2 KB) |
| F2 thermal gain, LAST, best gain | −1,418 | −1,454 |
| F1 vario GPS line | −956 | −971 |
| F7 climb colours (light theme, sink red) | −634 | −643 |
| F3 second UUID form | −368 | −385 |
| F5 QNH/QNE altitude reference | −330 | −343 |
| F4 watch-barometer fallback (vario, average) | −300 | −324 |
| F8 ground hints | −246 | −254 |
| F6 imperial ft/min | −220 | −228 |

Together (steady / load peak): F1+F2+F3 16,467 / 22,515; + F7 15,763 / 21,811; + F5 + F8 15,191 / 21,212; F1+F3+F9 14,729 / 20,780; all nine 13,029 / 19,023, still over budget. Only a core-shaped redesign reached it: checksummed LK8EX1 parse, 1 Hz bins, vario number, 10 s average, match-watch altitude, SEARCHING/LIVE/LINK LOST, connect by name, one UUID form, re-enable on reconnect; 2.3 KB minified main.js, 8,745 B steady, 11,185 B run peak, 12,907 B load peak (bracket 11,715-14,685), and only with the search arrays and a small ASCII-only name encoder built in onLoad. Beyond the nine features it drops the 7-state link machine (NO DATA, BAD DATA, BLE ERROR, back-off and throw retries), the mask-driven UI with its 28 selectors and 15 texts, the vario battery %, the average-window setting, the onEvent repaint and the forgiving name parsing. No feature was cut in this round: no single cut, nor all nine together, reaches the budget, so the choice belongs to the owner (with H10's result on the watch).

**Not applied:** plan item 5 (drop the `#id *` selectors if hiding `#id` hides its children; H11 decides) −384 / −466 B and 14 fewer setStyle calls per full repaint; item 6 (one UUID form after hardware test T1b, ble-gatt deep dive) −368 / −385 B and one `ext2.js` compile per connection less; both together measured 18,377 / 24,443 B on the prototype. Item 7 (UUID arrays built in onLoad) costs +644 B steady to remove the registration compile and its 1,008 B x2 of garbage; the load peak, not the run peak, is the larger one, so it was skipped.

**Rules found (they apply to every SuuntoPlus app; the header of `main.js` repeats R1-R4):**
- R1: a helper made inside a closure is not rewritten by the editor's minifier (`input.x`/`output.x` → `_[i]` happens only in lifecycle functions and module-level `var` helpers that get `input`/`output` by name). Called from the dispatcher it then reads undefined globals; no build warns. Closures take numbers; one module-level helper writes the outputs.
- R2: terser inlines a single-use helper declared inside a closure (not at module level), which grows the compiled block; the M2 size check catches it.
- R3: a try/catch in a closure-private function that is called from another function of the same closure, whose try body touches a variable two scopes up, leaves 304 B host of cyclic garbage per call. Keep try/catch at module level or in the helper the closure hands out.
- R4 (§0.1 T10): the minified main.js must contain `return function` exactly once. The profile's prototype (and any closure that returns a function literal) breaks the simulator and possibly the watch; assign the helper and return the variable instead. The test harness now refuses a minified file with any other count.
- R5: 56 module names or fewer avoids the 1 KB hash part of the scope record (lowmem Duktape: 64 entries, capacity steps …48, 56, 65…).
- R6: the load peak is the resident heap plus the compile transient (about 6 KB here for a 5.3 KB minified main.js); `ext5.js` and `ext1.js` compiled back to back in onLoad add up.
- R7: every `evalFile` leaves the ext's whole compiled code as cyclic garbage until a mark-and-sweep (the compile wrapper's `.prototype` cycle in sp-mem; unverified on the firmware), so an `evalFile` that recurs (per connect attempt, per tick) should be avoided; load once and keep the result.

**What changed for users:** nothing on a watch. Elsewhere:
- The store build in the simulator shows SEARCHING with the hints (the screen of v1.0's demo phase 13, byte-identical) instead of the demo flight; the demo lives in the demo variant.
- The debug builds for the hardware tests (§16c) and the screenshot copies come from `variant.js`, so they are no longer byte-identical to the store build (D1 shows the same behaviour apart from the logs).
- Demo variant only: the vario-GPS outputs are now written after the demo has fed the tick's lines (`put()` at the end of evaluate; v1.0 wrote them before the feed), so the GPS line is one demo tick fresher: the GPS screenshot reads "42 km/h 72°" instead of "41 km/h 48°" (`docs/ble_vario/screenshots/{q,n,o}-gps10.png` retaken; `store/ble_vario/screenshots/4-vario-gps.png` is still a true screen of the app and was left alone). On a watch BLE events arrive between evaluates, so the order cannot matter there (D1).

**Open (hardware or owner):** items 5 and 6 above (H11, T1b); the same two search arrays are now passed to every connect attempt, which assumes the firmware neither keeps nor changes them; whether the firmware's main.js loader matches the simulator's (R4 is safe either way) and whether its `evalFile` leaves the same compile-wrapper garbage as sp-mem; the version bump and new packages (`builds/ble_vario/`, the store listing's package notes) at the next release; H10 on the watch with a build of this source (§16c).


### 0.1.9 XC pages, v1.1 (2026-10-04): MVP-A of `docs/ble_vario/XC_FEATURES.md`

**What was built.** Automatic HIKE / GLIDE / THERMAL pages with no button overrides, ground speed, height above take-off or exercise start (labelled TO / ST, never AGL), glide ratio over ground while sinking, circling detection, circling wind (Kåsa fit in ground-velocity space with the addendum's gates and the XCSoar-weighted 8-entry store, reset at take-off), current-thermal average (TC), ascent rate and time to sunset on HIKE, FIT wind, and the new summary entries. The vario GPS line (binding decision 3) stays on the classic page and is the bottom line of GLIDE/THERMAL whenever no wind is known. Manifest 1.1 (`modificationTime` 1791091426). Hardware gates W1, P1, G1/H10b, H12, W9 are still open (HARDWARE_TEST.md, v1.1 steps).

**Where the code lives (memory first).**
- `main.js` keeps the classic page and only the hooks: one shared `Float32Array(16)` `XC` (the engine's results; layout in the file), the page-aware visibility mask and key in `ui`, a second helper `ut` handed out by the same closure (big number, colour, A1 on the classic and THERMAL pages, the vario GPS line, then the engine's text call), and the per-page `gn`/`ft` and wind outputs in `put`. 51 module names (memory round: 52; `cG`/`cR`/`cN` moved into the `ui` closure), 7 compiled module functions as before.
- The XC engine is four ext files, compiled once in `onExerciseStart` and kept (`S.e`): `ext6.js` ground velocity from new watch fixes and circling detection; `ext7.js` the Kåsa fit and the wind store; `ext8.js` heights, max height, total climb, ascent rate, glide ratio, time in thermal and the page machine; `ext9.js` the XC labels and slot texts. Every function ≤ 1,848 B est32; nothing runs per BLE notification; no cyclic garbage after the setup ticks. Order: `ext9` first (measured: the lowest exercise-start peak of the orders tried; staggering the compiles over the first ticks only moved the peak into a tick).
- **The classic page setting (`pg` 2) never loads the engine**: v1.0's screen at about v1.0's memory, but no wind, no heights and no XC summary entries.

**Decisions and departures from the addendum** (template budget ≤ 5,000 B and the per-function 1.9 KB rule forced most of them):

| Addendum | v1.1 | Why |
|---|---|---|
| L1 slots: A1 GS, A2 L/D, C2 TO (GLIDE) | A1 GS, **A2 TO/ST through the existing `gn` eval** (native altitude units), C2 L/D | the `gn` eval already shows an altitude with its unit: no template bytes, no JS formatting |
| HIKE: BIG = UP (m/h), A1 AVG, A2 GPS OK, C2 TIME, D SUNSET | **BIG stays the vario**; A1 UP (tens of m/h or ft/h, EMA τ 60 s), A2 ST, C2 AVG, bottom SUNSET (the `fl` eval fed with the new input `ss` = `/Outdoor/Sunset/ETE`) | one meaning for the big number on every page; the GPS-status and exercise-time fields were dropped (the watch shows both natively); an imperial UP of 5 characters did not fit in C2 on n (stress screenshot) |
| C row: altitude left, C2 right | the classic page keeps its centred altitude (`ac`); the XC pages show a second altitude eval on the left (`ax`, left 21 %) with C2 at 62 % (`cv` = value `cw` + label `cl` as a postfix, `sp-d-xs`) | moving the shared element would have changed the classic page; one more eval fits the budget |
| D: `270° 18 km/h HW12`, dim 5-30 min, `--` after 30 min | **`WIND 270° 18 km/h`**, no head/tail component, no dim variant; after 30 min the outputs become undefined and the line falls back to FLT / GPS line | HW needs the track over ground and a second format; dimming needs a second element; both cost template or block bytes |
| THERMAL L1 D: `IN 1'45 270° 18` | wind line only; time in thermal feeds TC = gain / (time + 5 s back-dating), shown from 10 s | line length on n |
| GS: watch `spd` if fresh, else RMC ≤ 3 s, else DR | watch `spd` while a watch fix is ≤ 3 ticks old or when there is no RMC; else the vario RMC (10-s hold, as the GPS line); no DR fallback | the fused speed is the watch's best GS; DR only helps when `spd` is missing but fixes arrive |
| L/D with a 20-s DR ring (`DR[ri]`) | the same in `ext8.js` (its own 32-tick altitude and distance rings) | engine-owned state |
| a30 from the v0.1 ring | the engine's own calibrated-altitude ring | the classic ring holds raw QNE / watch altitude |
| Outputs `gs`, `hd` changed meaning | **dropped**; the vario GPS line is one app-formatted text, `GPS 245° 35 km/h` (v1.0: two evals, `35 km/h 245°`) | the template budget (the eval block was 700 B); the format matches the WIND line |
| FIT: `vs av ws wd src`; `alt`, `bat` no longer logged | as specified (`alt` stays an unlogged output for the template; `bat` is gone, the battery is in the status line) | |
| Summary: f a h c t g l | as specified; `h` and `t` only with the engine (the classic setting shows f a c g l) | |
| Settings `pg`, `hr`, `ms`, `md`, `lc` | `pg` (default automatic hike/glide/thermal), `hr`; `ms`, `md`, `lc` are MVP-B (map) | |
| Pages before the exercise starts | classic page until `onExerciseStart` (the engine loads there) | the pre-start view is about the link (SEARCHING, hints, battery); no flight before the start |

Other details: the take-off altitude is the engine ring's value 12 ticks before the detection, or the first valid altitude in flight when the ring has none (engine started less than 12 s before); the total-climb reference resets to it at take-off (test X6 catches the missing reset); a30 needs 30 s of engine history, so THERMAL cannot start in the first 30 s after the exercise start. The demo variant feeds a synthetic watch track, speed and altitude (`ext4.js` properties `a`, `o`, `s`, `h`) for the screenshots.

**Tests** (`node test/ble_vario/run.js`, 66, all pass): new X1-X8 drive synthetic 1 Hz tracks (`test/ble_vario/xctrack.js`, the addendum's §3.7 generator: AR(1) noise, wobble, late ticks) through the whole app: X1 first estimate and displayed wind at 5 m/s from 270 and five other directions (30 runs: first estimate RMS within 0.6 m/s / 8°, displayed within 0.3 m/s / 4°), FIT `ws`/`wd`, the WIND line; X2 2 / 8 m/s, W > V, 18-s / 30-s circles, 4 m noise (≥ 80 % with a wind), 20 % late ticks (≥ 90 %), recentring, calm; X3 zero circling ticks and zero estimates on 30-min straight glides at 2/4/6 m noise, S-turns and ridge reversals at 2/4 m, ≤ 2 % on a ¾ circle; X4 THERMAL within one circle and the first wind within 1.2 circles for 18/22/30-s circles, a −8 m/s spiral stays GLIDE; X5 the store's height and age weights, the 1000-m cut-off and the take-off reset (ext7.js driven directly); X6 the page machine (classic before the start, HIKE, GLIDE, THERMAL within a circle, GLIDE after the exit grace and dwell, HIKE after landing) with labels, slots, sunset, TO from 12 ticks back, total climb and max height; X7 no-GPS THERMAL from the vario thermal state with the 20-s dwell, `pg` 1, `pg` 2 (engine never loaded), `hr` 1; X8 GS sources and units, L/D only while sinking, UP and AVG on HIKE, wind gone after 30 min. Changed: B5 (summary order, h and t), B6 (pg, hr), C3/B7/U6/U7 (dropped outputs), and the classic-page tests pin `pg` 2. **D1** now compares a projection with the v1.0 recording (re-recorded from the commit ccd13c9 source, `golden.js --source-only`): every session with `pg` 2, the outputs v1.0 and v1.1 share, every v1.0 element except the GPS line's content (its visibility is compared), the summary sorted by id: identical in store, debug and demo variants, source and minified (a one-tick change of the GPS hold is caught). **M1** now feeds a circling GPS track, so the minified engine (escodegen-compacted ext6-9 plus the dispatcher's new in/out order) is compared with the source form and reaches THERMAL with a wind. **M2** measures three runs (capture, XC flight, XC flight with the classic setting) and asserts per-run function size, no growth and setup-only cyclic garbage. Builds: `test/ble_vario/build.js` clean on all displays, template q 4,977 B.

**Screenshots** (`docs/ble_vario/screenshots/`, simulator, demo variant with the synthetic watch track): `{q,n,o}-thermal.png` (dp 10 at 45 s: THERMAL, `WIND 270° 18 km/h`, TC), `{q,n,o}-glide.png` (dp 10 at 78 s: GS, TO, L/D, wind), `{q,n,o}-hike.png` (dp 14: UP, ST, AVG in C2, SUNSET), `n-glide-imp.png` (app units imperial: GS mph, ft/min, wind in mph), `{q,n}-xcstress.png` (HIKE with a forced 12345 altitude and a -7090 ft/h ascent rate: A1 and C2 fit), `{q,n,o}-gps10.png` retaken (classic page, `pg` 2, the GPS line as text `GPS 96° 42 km/h`; the classic page is otherwise unchanged against the v1.0 `q-dp10.png`), `n-gpsstress.png` (`GPS 358° 165 km/h` fits on n). `{q,n,o}-gpsreal.png` still show v1.0's eval GPS line. The simulator calls onExerciseStart (the engine loads there) and gives a sunset ETE; its native formatters stay metric, so an imperial altitude was not shown.

**Memory** (sp-mem lowmem est32, shipped form; `node test/ble_vario/mem/measure.js`; new states `xc-flight` = synthetic flight with watch fixes circling in a 5 m/s wind, `xc-classic` = the same with `pg` 2):

| State | Steady (watch-fit) | Load peak | Run peak | Exercise end | Largest block | Shipped main.js |
|---|---|---|---|---|---|---|
| memory round (§0.1.8), capture-u8 | 19,098 (18,550) | 24,969 | 21,619 | 23,289 | 1,876 | 5,270 |
| v1.1 automatic pages, capture-u8 | 31,806 (30,902) | 38,225 (the exercise-start engine compile; onLoad itself ~25 KB) | 34,368 | 36,743 | 1,848 | 5,941 |
| v1.1 automatic pages, xc-flight (wind fit running) | 31,791 (30,887) | 38,210 | 34,532 | 36,728 | 1,848 | 5,941 |
| v1.1 classic page (`pg` 2), xc-classic | 21,493 (20,897) | 27,577 | 24,203 | 26,374 | 1,748 | 5,941 |
| v1.1 debug variant (`sn` Abel), automatic / classic | 32,375 / 22,062 | 38,826 / 28,002 | 34,935 / 24,770 | 37,356 / 26,986 | 1,848 | 6,155 |

Other v1.1 states: idle-retry run peak 33,586, flight-sparse 31,776 / 38,195 / 34,298, long2h run peak 34,517 with growth 0.00, capture-array run peak 40,834 (Array payloads queued per tick, inflated as before). Cyclic garbage: 1,008 B host at ticks 2 and 3 only (ext2.js registrations), none per wind-fit tick. Per BLE notification (21 vs 42 lines per tick, same recording on both builds): 22.2 allocations and 1,261 B host per notification (memory round: 22.3 and 1,264 B), nearly all the harness's. Correction (§0.1.10, platform review P2-4): against a copy with the parser stubbed out the parser adds about 6.3 allocations and 565 B host per notification, one lowmem activation record per `fin()` call (about 5.5 calls per line), freed on return: no heap object and no garbage per notification, but not literally nothing. Allocations per tick 1,156 (memory round 1,067): the engine calls. Largest single transient request 3,488 B host during load, 3,728 B host within a tick (value-stack growth from the deeper call chain; about half on the watch), both under 4 KB.

**Budget: not met, and further from it.** The binding BLE display budget (steady ≤ 10 KB, peak ≤ 12 KB) was already 9 KB away (§0.1.8). The automatic pages add 12.7 KB steady and 13.3 KB to the highest peak; the exercise-start peak (38.2 KB) is above the ~32 KB estimated usable heap of one Race S app. **Price list** (xc-flight, each row removes one more part from the final code; steady / load peak):

| Configuration | Steady | Load peak | Run peak | Δ steady |
|---|---|---|---|---|
| full MVP-A (automatic pages, default) | 31,791 | 38,210 | 34,532 | |
| without the wind (no `ext7.js`: no fit, no store) | 28,831 | 34,243 | 31,555 | −2,960 |
| without GPS velocity and circling as well (THERMAL from the vario thermal state) | 26,448 | 32,631 | 29,162 | −2,383 |
| without the engine (classic page setting): pages, heights, L/D, UP, TC, texts gone | 21,493 | 27,577 | 24,203 | −4,955 |
| without the main.js hooks (memory round) | 19,098 | 24,969 | 21,619 | −2,395 |

Even the classic page is 2.4 KB above the memory round (the hooks every user pays for: page mask, `ut`, the GPS line as text, wind outputs, the `XC` array, 4 selectors). Below 19.1 KB the §0.1.8 cut list applies unchanged; only its core-shaped redesign reaches 12 KB, and it has none of the XC features. **Owner decision before G1/H10:** keep the automatic pages as the default (the addendum's choice, used for every number above), or ship the classic page as the default and the XC pages as an opt-in.

**Open:** W1 (the dotted `GeoCoordinates.latitude`/`.longitude` and `Outdoor/Sunset/ETE` manifest paths have never run on a watch; a wrong path stops the app loading), P1 (page visibility groups and `setText` on the shared slots on the watch), G1/H10b (memory with a second app, now with the engine compiled at the exercise start), H12 (7 summary entries), W9 (wind graphs), F1 (flight comparison with an IGC replay), the GPS noise model re-fit from W1's stationary and walking logs (X1-X4 rest on the addendum's AR(1) model), and a five-character imperial C2 value on n (`+590 TC` sits 7 px from the bezel in the estimate; not screenshot-tested).


### 0.1.10 XC review round (2026-10-04): what changed in v1.1, and what it costs

Three reviews of the v1.1 build (platform and memory, algorithms, product) reported 29 findings. Each was reproduced first, with the reviewers' probes running the whole app through `test/ble_vario/harness.js` on scratch copies (`src/` untouched), then fixed or deferred with a reason. The regression tests X9-X14 fail on the review build with only the evalFile fix applied, P12 fails on the review build, V2 covers a new hardware-check variant; all pass now (`node test/ble_vario/run.js`: 74). The harness can run the suite on another copy: `BLEVARIO_APP=<dir> node test/ble_vario/run.js`.

**The one change a user sees first: the classic page is the store default again** (`pg` "2" in `data.json` and as `ext5.js`'s fallback). All three reviews ranked memory first: the automatic pages compile the XC engine at the exercise start, 38.6 KB est32 here, above the ~32 KB estimated usable for one Race S app, and the hardware results at the top of this spec logged a practically full heap with LiftLink Vario v1.0 and Air Temperature v1.0 together. Until X4 (G1/H10b) passes with a second app, a first-time user gets v1.0's screen (21.6 KB steady); the HIKE / GLIDE / THERMAL pages, wind, heights, L/D, TC and the summary entries `h` and `t` are the "Pages" setting. Test B6 pins the default; the X tests and M1 set `pg` 0; the sp-mem scenarios take a `pg` parameter, and `measure.js` measures the automatic pages in its usual states plus `capture-classic` (the default).

| Finding (review) | Outcome |
|---|---|
| Default above the usable heap (platform P0-1, product P0-1, algorithms P1-4) | Classic page the default (above) |
| `ext6.js` called `evalFile` from an ext file; the reference allows it only in main.js (L1212); no simulator or sp-mem check can see it (platform P1-1) | **Fixed.** `onExerciseStart` compiles `ext6.js` and passes the compiled factories of `ext9.js`, `ext7.js` and `ext8.js`; `ext6.js` replaces each factory parameter with what it returns, which releases the factory (keeping them would cost 1.7 KB steady). The harness gives ext files no `evalFile` any more, so an ext file that calls it fails every XC test; P12 checks the source and the load order. +201 B steady, −964 B exercise-start peak on its own |
| About 4 KB est32 of cyclic garbage at the exercise start, hidden by the checkpoint GC (platform P2-1) | Not fixable cheaply: each ext's compile wrapper and its prototype cycle (R7) are freed only by a mark-and-sweep. Only the automatic pages pay it; X4 reads its result with it in mind (HARDWARE_TEST) |
| Exercise-end peak (P2-2) | Follows the resident set: 26.5 KB with the default, 38.3 KB with the automatic pages |
| Value-stack growth every tick (P2-3) | Automatic pages 3,952 B host within a tick (review build 3,728; about 2.0 KB on the watch, the edge of the 2 KB dependable size), classic page 3,200 B. Not flattened: that needs main.js to call `ext7.js`/`ext8.js` directly, more main.js bytes for every user; decide after X4 |
| "No allocation per notification" (P2-4) | Wording corrected in §0.1.9 and the binding decisions: no heap allocation; about 6 transient activation records per line |
| Headroom (P2-5) | Largest compiled function now 1,772 B (`ext9.js` split in two, below; the review build's 1,848 B text function is gone), template q 4,966 B, ext files ≤ 1,333 B minified |
| Scope check read 0 from sp-mem's top-8 block list (P2-6) | **Fixed** with what sp-mem gives (it lists only the 8 largest blocks, all functions of 1.5 KB or more here, and is outside this repo): `harness.moduleNames` counts the shipped main.js's module names, `harness.scopeRecord` turns them into the record size with the step table measured in review round 2 (51 names → 728 B); M2 asserts both and that no scope record is among the 8 largest blocks (a record with the hash part, ≥ 1.87 KB, would be); `measure.js` prints the derived record and the measured total of all scope records |
| Vario/watch altitude switches counted as climb or sink in TO/ST, max height, total climb, L/D, a30 (algorithms P1-1, product P2-9) | **Fixed in `ext8.js`** (the classic page and `dat()` untouched): while the vario is the source it tracks O = EMA(watch − vario altitude), τ 10 ticks; otherwise it uses the watch altitude minus O. X9: six 8-s dropouts with ±25 m drift (match watch) or ±150 m (QNE): total climb 344 m and max above take-off 140 m, as with no offset (review build: up to 1,248 m and 290 m) |
| Circling direction not followed through a reversal; the wind fit then rejects every turn (algorithms P1-2) | **Fixed in `ext6.js`**: the direction follows the turn whenever the state is (again) circling. X10: 25 or more estimates in 5 min after reversals 20, 26 and 60 s into the circles (review build: 0-2) |
| Page rule contradicted XC_FEATURES §1.2; any GPS gap reset circling (algorithms P1-3) | **Fixed**: the page uses the circling state only with at least 3 velocity samples in the window, otherwise the vario thermal state; a gap turns circling into "possible cruise" with a fresh 10-s grace. X11: fixes every 5/6/10/30 s and dropouts of 4/6/10 s: THERMAL on at least 280 of 300 ticks with at most one page change (review build: 0 ticks at 5 s, 19-25 changes at 6-30 s, 21-23 s of GLIDE after a dropout) |
| Wide circles (≥ 45 s) never detected (algorithms P2-1) | Documented (XC_FEATURES §2.4, FAQ); a gate relative to the ground speed needs X3 re-run with measured noise (W1) |
| False wind from white GPS noise (algorithms P2-2) | **Gate: fitted airspeed ≥ 7 m/s** (was 5). False estimates on a straight line with 3 m white noise: 40 → 4 per 2 h; the yield at 4 m AR(1) noise unchanged at 7.5-9.5 m/s, 96 → 90 estimates at 7 m/s. The suggested residual gate (≤ 0.15 R) was tried and dropped: at 7.5 m/s and 4 m noise it cut the estimates from 101 to 25. X13 asserts ≤ 4 false estimates in 1 h. W1 must still measure the noise |
| "Bar or brake changes widen the residual" is wrong for a once-per-circle change (algorithms P2-3) | XC_FEATURES §2.4 and the FAQ corrected (circle at a steady speed) |
| TC high early in a thermal (algorithms P2-4, product P2-6) | **Fixed in `ext8.js`**: thermal time counts from the tick of the lowest altitude the gain counts from. X12: +2.0 from its first value for a constant 2.0 m/s climb (review build: +2.7, +2.5, … +2.1) |
| Max above take-off reset at every take-off (algorithms P2-5, product P2-7) | **Fixed**: over every flight of the exercise (TO itself stays per flight). X12 |
| A false landing while hovering reset TO, max height and the wind (algorithms P2-6) | **Fixed in the engine**: a take-off within 2 minutes of a landing is the same flight (references and wind store kept; `ext8.js` now clears the store). `fly()`'s landing rule and flight time are v1.0's (D1). X12 |
| Climb during a pause added on resume (algorithms P2-7) | **Fixed**: the total-climb reference is reset when the exercise runs again. X12 |
| A missing altitude emptied the wind display (algorithms P2-8) | **Fixed in `ext7.js`**: the last valid altitude stands in; an estimate without any height counts as at the current height. X13 |
| Weaving and wingovers read as circling (algorithms P2-9) | Documented (XC_FEATURES §2.4, FAQ) |
| TO/ST show `--` below −500 m: the editor's Altitude formatter stops there (product P1-2) | **Deferred to a hardware check**: whether the firmware has the same floor is unknown. The fix (the A2 value as app text instead of the `gn` eval) would move height formatting into main.js for every user and change the classic page's A2 element. HARDWARE_TEST X8 checks it with the new variant `neg` (`variant.js dbg,neg`: A2 reads −600 m on the XC pages; test V2) |
| The wind's age never shown (product P1-3) | **Fixed**: from 5 minutes the age in minutes replaces the label, `29' 358° 90 km/h` (key includes the minutes); fits q, n and o (stress screenshots); the FAQ no longer says the wind "disappears rather than show an old value" |
| HIKE's `SUNSET 08:57` read as a clock time and clipped (product P1-4) | **Fixed**: `SUNSET IN 10h45`, `SUNSET IN 45 min`, `SUNSET --` (unknown, or more than 20 h: after today's sunset) as text in `#gp`, written by `ext9.js`; the vario GPS line never overwrites it (`ut()` skips `#gp` whenever the engine writes it); `ft` is always the flight time; the `#fx` id is gone. Screenshots: no longer clipped on q, n or o. X6, X14 |
| Store image `4-vario-gps.png` showed v1.0's GPS line (product P1-5) | Retaken from v1.1 (classic page, GPS line as text); listing table corrected |
| Gondola or car ride counted as flight (product P2-8) | FAQ and description: pause the exercise in lifts and cars |
| A calm wind showed a random bearing (product P2-10) | **Fixed**: below 1.5 m/s `WIND CALM`, no logged direction (`wd` undefined, `ws` kept). X13 |
| A five-character imperial C2 value clipped on n (product P2-11) | **Fixed**: at most 4 characters: no `+` from 1,000 ft/min (`1180 TC`, fits on n), −990 ft/min the lowest shown, whole m/s from 10 m/s. X14 |
| Flight time hidden on GLIDE/THERMAL while the wind or GPS line shows (product P2-12) | Description and FAQ say so and point to the watch's own duration field |
| Listing wording (product P2-13) | Short description, long description, release notes and FAQ rewritten for the classic default, the vario vs watch-GPS sources, ST vs the landing, and the classic page's text GPS line |

**Code.** `ext6.js`: takes the three factories; the circling-state changes above; calls `ext8.js` first (it returns the altitude on one basis) and then the wind. `ext7.js`: the 7 m/s gate and the missing-altitude handling. `ext8.js`: the altitude basis O, the take-off rule with the 2-minute window and the wind-store reset, max height over all flights, the pause reset, TC from the lowest altitude. `ext9.js`: the bottom line in its own helper (sunset and wind texts; the text function would otherwise pass 1.9 KB), the 4-character C2. `main.js`: compiles ext6-9 in `onExerciseStart`; passes the watch altitude and the source to the engine and the sunset ETE and tick to the texts; the engine owns `#gp` on HIKE; `put()` writes `ft` = flight time and no wind direction in a calm. `v.html`: `#fx` id removed (template q 4,966 B). Minified main.js 6,016 B (M2 cap raised from 5,950 to 6,050 B; compiled size is the binding quantity).

**Memory** (sp-mem lowmem est32, shipped form, `node test/ble_vario/mem/measure.js`):

| State | Steady (watch-fit) | Load peak | Run peak | Exercise end | Largest block | Scope record | Cyclic garbage |
|---|---|---|---|---|---|---|---|
| review build, automatic pages (its default), capture-u8 | 31,806 (30,902) | 38,225 | 34,368 | 36,743 | 1,848 | 728 (51) | 1,008 B host at ticks 2, 3 |
| review build, xc-flight | 31,791 (30,887) | 38,210 | 34,532 | 36,728 | 1,848 | 728 | same |
| review build, classic page | 21,493 (20,897) | 27,577 | 24,203 | 26,374 | 1,748 | 728 | same |
| **now, classic page (default), capture-classic** | **21,613 (21,017)** | **27,710** | **24,145** | **26,494** | **1,756** | **728 (51)** | same |
| now, classic page, xc-classic | 21,613 (21,017) | 27,697 | 24,323 | 26,494 | 1,756 | 728 | same |
| now, automatic pages (setting), capture-u8 | 33,345 (32,409) | 38,582 | 35,914 | 38,297 | 1,772 | 728 | same |
| now, automatic pages, xc-flight | 33,345 (32,409) | 38,582 | 36,094 | 38,297 | 1,772 | 728 | same |

Other states (automatic pages): idle-retry run peak 35,166, flight-sparse 33,315 / 38,552 / 35,880, long2h run peak 36,064 with growth 0.00 B/tick, capture-array run peak 42,400 (Array payloads queued per tick, inflated as before). The run peaks are lower bounds (sp-mem collects garbage after every tick); the only cyclic garbage per tick is still the 1,008 B host of the two `ext2.js` registrations, plus the ~4 KB at the exercise start that the checkpoint GC hides (above). All scope records together: 2,812 B with the engine, 1,668 B without. **20-byte notifications** (the shape the hardware results report on the Race S; new states `mtu23-auto` / `mtu23-classic`, the synthetic flight in 37 notifications per tick): automatic pages 33,315 steady / 38,552 load peak / 37,255 run peak (review build 31,761 / 38,180 / 35,689), classic page 21,583 / 27,666 / 25,466 (review build 21,463 / 27,546 / 25,346), 1,341 and 1,283 allocations per tick, growth 0.00; the run peaks are about 1.2 KB above the line-per-notification states because sp-mem queues a tick's payloads at once.

**Price of the fixes** (xc-flight, steady / load peak, each row adds to the one above): review build 31,791 / 38,210; + evalFile hoist 31,992 / 37,246; + the engine fixes in `ext6.js`/`ext8.js` and the main.js hooks 32,345 / 37,500; + `ext7.js` (missing altitude, 7 m/s gate) 32,401 / 37,589; + the `ext9.js` texts (wind age, CALM, sunset text, 4-character C2, and the second function object the split needs) 33,345 / 38,582. The classic page pays 120 B of it (21,493 → 21,613): the three extra path strings and the engine arguments in main.js.

**Budget: not met.** Default (classic page) 21.6 / 27.7 KB against the binding 10 / 12 KB, the automatic pages 33.3 / 38.6 KB. Nothing below the memory round's 19.1 KB was attempted: §0.1.8's cut list and §0.1.9's price list still say what would have to go (all nine §0.1.8 features together: 13.0 / 19.0 KB; only the core-shaped redesign, 8.7 KB steady and 12.9 KB load peak, reaches the budget, without any XC feature).

**MVP-B (thermal map): not implemented**; XC_FEATURES §6.3 has the decision and the measured gap (a scratch prototype of the map on top of this build: 44.5 KB steady, 48.6 KB load peak, an 8.5 KB template and a 2.5 KB compiled function).

**Screenshots** (`docs/ble_vario/screenshots/`, demo variant `pg=0`): `{q,n,o}-hike.png` (the sunset countdown; v1.1's `SUNSET 09:21` clipped on all three, now within the accepted bottom-line clearance), `{q,n,o}-thermal.png` retaken (identical apart from TC, now +2.4 instead of +2.6 at 45 s), `{q,n,o}-glide.png` retaken (q identical; n and o showed TO 1272 m, the simulator's fixed 320 m watch altitude taken as the take-off altitude before the vario took over, the source-switch bug fixed above; now 88 m as on q), `{n,q,o}-sun45.png` (`SUNSET IN 45 min`), `{n,o}-sun1045.png` (`SUNSET IN 10h45`), `{q,n,o}-xcstress2.png` (THERMAL with `29' 358° 90 km/h` and `1180 TC`). `store/ble_vario/screenshots/4-vario-gps.png` retaken (classic page, `gp` 1). `tools/safe-area.js`: no new element is CLIPPED; the bottom lines are "OUTSIDE SAFE" by the checker's strict 1.15-inflation rule, as every accepted wind and GPS line already is (−1 to −11 px against their −8 to −18 px).

**Open.** The hardware results at the top of this spec ask for the 2-byte UUID form first: not part of this round, so the v1.1 package still registers the 16-byte form first, as v1.0 did (listing item 16). X8 (the −500 m formatter floor), X4 (memory with a second app; decides whether the automatic pages stay an option), W1 (GPS noise and fix interval; the wind gates and the wide-circle limit rest on it), whether the firmware forces a GC after each callback (how long the exercise-start garbage stays), the watch's value-stack slack, and P1, H12, W9, F1 as before.


## 0. How to read the citations

Every platform claim carries a source tag.

| Tag | Source |
|---|---|
| `R L123` | `../SUUNTOPO/reference/suuntoplus_reference_docs.md`, line 123 (authoritative) |
| `[ub §n]` | `docs/research/ultrabip.md` section n |
| `[cr §n]` | `docs/research/critique.md` section n. **The critique wins where it disagrees with another report.** |
| `[fb §n]` | `docs/research/forum-ble.md` |
| `[st §n]` | `docs/research/store.md` |
| `[fp §n]` | `docs/research/forum-projects.md` |
| `[gaps Lnnn]` | `../SUUNTOPO/docs/research/suuntopo-gaps.md` |
| `[tpl Lnnn]` | `~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/templates/New-SuuntoPlus-BLE-Sport-App/main.js` |
| `[limit.js]`, `[data.js]` | `.../node_modules/@suunto-internal/suuntoplus-tools/lib/ng/limit.js` and `lib/formatter/data.js` (formatter definitions, dumped with Node) |
| `[sim]` | `.../suuntoplus-editor-1.42.0/webview-resources/main.js` (the simulator runtime) |

Statements marked **(design)** are decisions made in this spec, not facts about the platform. Statements marked **(unverified)** need a hardware check, listed in §16c.

---

## 1. Product summary and key decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Store name "LiftLink Vario"**, on-watch description "UltraBip/BlueBip vario" (22 bytes) | Neutral; does not imply Stodeus or Suunto authorship; compatibility is stated in the description. App id from the editor rule = first 6 ASCII chars of the name, lower case, + `01` → `liftli01` [cr §2, `getAppId`] |
| D2 | **Glanceable display only, no audio.** The UltraBip already beeps. | There is no pitch control and no silent haptic: `playIndication` plays one of 6 named sounds, vibration only if enabled in watch settings (R L1257-1274) [cr 0.3] [fp §3] |
| D3 | **One screen, no button overrides.** The template has no `<userInput>` element. | Overriding buttons blocks pause/end from that screen [cr 3c, forum 14766 #37] [gaps L164-168] |
| D4 | **Screen refresh is 1 Hz** (evaluate tick). Faster `setText` from the BLE handler is a hardware experiment only. | `evaluate` runs every 1 s ±5 ms (R L1044); output changes made outside evaluate reach the firmware only after the next evaluate (R L1129-1131, stated for `onAccelerometer`; inferred for the BLE handler) [cr 0.3] |
| D5 | **Byte-level streaming NMEA parser; no strings, no `split`, no regex, no per-event allocation.** | Allocating in functions called at 10 Hz exhausts the heap over time (forum 15279); regex fails on the watch (14940). The critique overrides the string-based parser sketched in [ub §8] [cr §2 "Wrong or overstated", cr 3a] |
| D6 | **LK8EX1 is the only primary source.** LXWP0 is parsed only as a fallback when LK8EX1 is absent; GGA/RMC are recognised and skipped in v1. | LK8EX1 has full-resolution pressure; firmware 2023-03 sent no LXWP0; never double-count two 10 Hz streams [ub §5, §8.7] |
| D7 | **Time base = the 1 s evaluate tick.** Samples are binned per tick; averages are altitude differences between per-tick bins. | main.js has no sub-second clock (`Date` forbidden; `/Dev/Time` is whole seconds, R L472). Notifications carry no timestamps and arrive in bursts [ub §8.8] |
| D8 | **Altitude is calibrated on the watch**, default "Match watch altitude" (offset to `/Fusion/Altitude`, frozen in flight); alternatives watch sea-level pressure (QNH) or raw QNE. Source label on screen. | LK8EX1 altitude is uncalibrated QNE [ub §5.1, §8.9]; on-watch calibration resources [cr 3a] (R L515, L630) |
| D9 | **Fallback to the watch's own barometer** (`/Fusion/Altitude/VerticalSpeed`, `/Fusion/Altitude`) whenever the vario data is not live, labelled "WATCH BARO" in orange. | [cr 3a] (R L574, L515) |
| D10 | **Vario numbers are formatted by the app** (metric m/s with 1 decimal, imperial ft/min in 10s) from `/Settings/Unit/UnitsMode`; altitude, gain, flight time and battery use native eval formatters. | No native formatter shows signed m/s with a decimal (§5.4) [data.js]; native formatters convert units automatically (R L1611-1618, L893-899) |
| D11 | **No canvas, no images.** Plain HTML elements only. | Removes the Race S canvas budget risk (~24 lineTo/path, ~200 units/frame, silent black canvas) [cr 0.2] and the 2-image limit (R L1581) |
| D12 | **Demo mode only when both simulator fingerprints are present** (`connect` returned `undefined` AND `typeof enabledZappId === 'function'`), with a yellow DEMO tag on screen. | The simulator stubs `appConn.connect(){}` and sets `enabledZappId=()=>{}` [sim]; on the watch `enabledZappId` is an integer set by the system (R L2492). A demo vario in flight would be dangerous. |
| D13 | **Discovery: slot 1 = complete-local-name prefix of the chosen model, slot 2 = 16-bit service FFE0**, pending the hardware probe (§6.2). An optional serial setting switches to an exact full-name search with no slot 2. | Name vs UUID advertising and prefix vs exact matching are unknown [ub §2] [cr 3a]; there is no device picker, the first match wins [fb §3] |
| D14 | **Five logged outputs, five summary outputs.** | Reference says 5 logged (R L101, L2066) although the validator allows 6 [cr §1]; summary hard limit 8 but practical limit "around 4 or 5" (R L2081) |

### 1.1 Scope

In v1: live vario, average climb, calibrated altitude, thermal gain, flight time, vario battery, link state, watch fallback, FIT logging, summary, demo mode, English UI.

Deferred to v1.1+ (not designed in detail here): a vertical climb bar, a "focus" layout, glide ratio and ground speed (UltraBip RMC or watch GPS), circling detection from LXWP0 heading, more languages, height above take-off on screen.

Out of scope: audio vario, haptic climb pulses (not possible silently [cr 0.3]), airspace, XC route features, UI1 watches (s, m, l: "no longer maintained", R L16).

---

## 2. Target users and use cases

**Users.** Paraglider pilots who fly with a Stodeus UltraBip (BLE + GPS) or BlueBip (BLE, no GPS) [ub §1] and wear a UI2 Suunto watch: Race S (the author's set-up), Race, Race 2, Vertical 2, Ocean, Ocean Lite (display `q`), 9 Peak Pro (`n`), Vertical (`o`) (R L33-47). No published SuuntoPlus vario app exists [fb §5] [fp §3]; the closest product is TracerLink on Apple Watch [ub §7].

**Use cases.**

| UC | Situation | What the pilot needs from the watch |
|---|---|---|
| UC1 | Thermalling | Is this core better than the last? Big colour-coded climb number, 10 s average, gain in this thermal |
| UC2 | Gliding between thermals | Sink rate (red when strong sink), altitude |
| UC3 | Pre-flight at launch | Confirm the watch sees *this* vario (battery %, "VARIO" in green), altitude agrees with the watch |
| UC4 | Hike & fly | Exercise runs during the hike; flight time must start only at take-off |
| UC5 | Link drops mid-flight | The screen keeps showing usable numbers (watch barometer), clearly labelled, and returns to vario data on reconnect |
| UC6 | Post-flight | Summary: best climb, max altitude, flight time, best thermal gain, link quality; FIT graphs in the Suunto app |

**Assumptions given to the user (store text and §16c).** Turn the UltraBip on less than 5 minutes before selecting the app (BLE switches off otherwise [ub §2]); close XCTrack/FlySkyHy etc. (one central at a time [ub §2]); keep BipLink remote-control mode off [ub §6]; set the paragliding sport mode display to always-on (AMOLED ignores button presses while dark, R L1830) [cr 3a].

---

## 3. Platform constraints this design respects

| Constraint | Value used | Source |
|---|---|---|
| Inputs | ≤10 (we use 5) | R L133; [limit.js] `MAX_RESOURCES_IN=10` |
| Outputs | ≤20 (we use 8) | validator error at 20, schema 25 [cr §1] (R L937 says 25) |
| Logged outputs | 5 | R L101, L2066; validator 6 [cr §1] |
| Summary outputs | 5 (hard limit 8) | R L2081; [limit.js] |
| Name / description | ≤60 / ≤100 UTF-8 bytes; description ~22 chars on watch | R L64, L76; [st §2.1] (forum 14770) |
| Version | ≤4 chars, changes on every upload | R L68; [st §1.4] |
| JS | ES5 only, no `Date`, no regex literals, helpers as `var f = function(){}`, top-level `function` only for lifecycle callbacks | R L946-981 (Date unsupported L964-965, global function rule L970-981); [st §2.2]; [fb §3] |
| Typed arrays | only `Int8Array`, `Uint8Array`, `Float32Array` are listed as supported; use one buffer, not many | R L949-960 |
| Text output | `setText` only works on a visible element that already has non-space text | R L1307 |
| CSS on watch | width, height, color, background-color, opacity, border, visibility; px and % only; centring via `calc(X% - X%e)` | [st §2.3]; R L2025-2052 |
| Subscriptions | template subscriptions in `onActivate`, never `onLoad` (severed after laps/overlays) | R L1466; [fp §4] (forum 15320) |
| Settings | only on n, o, q; inline enum `values`, never `valuePath`; cannot be tested before publishing | [cr §1, §2]; [cr 3c] (forum 14768) |
| BLE | `"type":"device"` + `con` output; connect/regUuid/enaCharNotf/readChar/writeChar only; no disconnect, scan, RSSI, MTU or pairing call | R L2474-2486; [fb §1] |
| Race S BLE | 2 connections, ATT MTU 127 (124-byte payload); older UI1 watches MTU 23 | R L2467-2472; [ub §4] |
| Apps per sport mode on Race S | 2 (or 1 app + 1 guide) | [cr 0.4] |
| Heap on Race S | usable heap may be ~28 KB, shared | [cr 0.1] (forum 15279, 14940) |
| Canvas on Race S | not used (D11) | [cr 0.2] |

---

## 4. Screens

### 4.1 Templates

- One template file **`v.html`** (short names save space, R L3219), declared as `{"name":"v.html","displays":["n","o","q"]}`. The same HTML serves all three displays, as recommended (R L1566), using the display-independent `sp-*` font classes (R L1924-1936) and %-based positions.
- **Verify with `sp-build`** that restricting `displays` to n, o, q builds cleanly. If the build demands templates for s/m/l, drop the `displays` restriction instead (UI1 stays unsupported and unlisted in the store text).
- `getUserInterface()` returns `{ template: 'v' }` (R L1167-1177).
- No `<userInput>`, no `<img>`, no canvas, no `uiViewSet`.

### 4.2 Font classes per display (from R L1924-1963)

| Class | q (466 px) | n (240) / o (280) |
|---|---|---|
| `sp-d-xxl` | f-d-xxxl, 155 px | f-d-xxl, 65 px |
| `sp-d-xl` | f-d-xxl, 118 px | f-d-xl, 57 px |
| `sp-d-s` | f-d-s, 65 px | f-d-s, 35 px |
| `sp-d-xs` | f-d-xs, 46 px | f-d-xs, 25 px |
| `sp-t-s` | f-t-s, 27 px | f-t-s, 14 px |
| `sp-b-s` | f-b-s, 29 px | f-b-s, 15 px |

All numeric elements also carry `f-num` (monospace digits, R L1901).

### 4.3 Colours (theme-aware classes only)

| Use | Class | Notes |
|---|---|---|
| Normal values | none (inherits the theme foreground) | Light theme flips automatically (R L1902-1904) |
| Labels, units, dimmed values | `cm-mid` | theme-dependent grey (R L1904) |
| Lift (vario ≥ +0.2 m/s), "VARIO" status | `sp-c-green` | R L1908 |
| Strong sink (vario ≤ sink threshold), "LINK LOST", "BLE ERROR" | `sp-c-red` | R L1911 |
| "WATCH BARO", "NO DATA", "BAD DATA", battery ≤15 % | `sp-c-orange` | R L1909 |
| "DEMO" | `sp-c-yellow` | R L1912 |

**(v0.1: superseded by §0.1 T4/B6 — native `c-*` classes, `getStyle('css:.c-green')`, colour only on the big number.)** Dynamic colour (the big vario number, the gain value, the battery) is set with `setStyle(id, 'color', c)` where `c` comes from `getStyle('css:.sp-c-green', 'color')` etc. (R L1370-1408). Both are native functions callable from main.js (R L1202). The colours are fetched once, on the first evaluate after `getUserInterface`. The neutral colour is fetched from an invisible reference element with no colour class (`#ref`). **Simulator check S6:** if `getStyle` returns an empty string from main.js, move the colour logic into the template's `onActivate` with a `$.subscribe` to a tier output (the documented pattern at R L1374-1396) and add outputs `vt` and `gt`.

### 4.4 Layout (all displays)

**(v0.1: the implemented layout is §0.1 I1; the table below is the original design.)**

Positions are element centres: `top:calc(Y% - 50%e); left:calc(X% - 50%e)`. Pixel centres are computed for q / n / o.

```
                 VARIO                    <- status (source)          Y 9
       AVG        87%        GAIN         <- labels + vario battery   Y 17
      +1.8                   312m         <- avg climb, thermal gain  Y 26

                 +2.3                     <- instant vario (big)      Y 50
                  m/s                     <- vario unit               Y 64
     ALT        2345 m                    <- altitude                 Y 76
           FLT   12'34                    <- flight time / link reason Y 89
```

| Id | Content | Class | X % | Y % | Centre q | Centre n | Centre o | Visible when |
|---|---|---|---|---|---|---|---|---|
| `s0` | `{{vario}}` "VARIO" | `sp-t-s sp-c-green` | 50 | 9 | 233,42 | 120,22 | 140,25 | LIVE |
| `s2` | `{{watch}}` "WATCH BARO" | `sp-t-s sp-c-orange` | 50 | 9 | same | | | every state except LIVE |
| `s1` | `{{demo}}` "DEMO" | `sp-t-s sp-c-yellow` | 50 | 17 | 233,79 | 120,41 | 140,48 | demo flag set (replaces `bt`), unless `dp` ≥ 10 |
| `la` | `{{avg}}` "AVG" (or "AVG 15s" etc., one span per window value) | `sp-t-s cm-mid` | 30 | 17 | 140,79 | 72,41 | 84,48 | always |
| `bt` | `<eval Output/bat BatteryPercentage_Threedigits>` + `<postfix/>` | `sp-t-s f-num` | 50 | 17 | 233,79 | 120,41 | 140,48 | LIVE and no DEMO tag |
| `lg` | `{{gain}}` "GAIN" | `sp-t-s cm-mid` | 70 | 17 | 326,79 | 168,41 | 196,48 | always |
| `av` | average climb, `setText` | `sp-d-s f-num` | 30 | 26 | 140,121 | 72,62 | 84,73 | always ("--" seed) |
| `gn` | `<eval Output/gn Altitude_Fivedigits>` + `<postfix/>` | `sp-d-s f-num` (postfix `sp-t-s`) | 70 | 26 | 326,121 | 168,62 | 196,73 | always ("--") |
| `vn` | instant vario, metric, `setText` | `sp-d-xxl f-num` | 50 | 50 | 233,233 | 120,120 | 140,140 | metric and \|v\| < 10 m/s |
| `vi` | instant vario, imperial (or metric ≥10 m/s), `setText` | `sp-d-xl f-num` | 50 | 50 | same | | | imperial, or metric with \|v\| ≥ 10 m/s |
| `vu` | "m/s" or "ft/min", `setText` once | `sp-t-s cm-mid` | 50 | 64 | 233,298 | 120,154 | 140,179 | always |
| `ll` | `{{alt}}` "ALT", `{{qnh}}` "QNH" or `{{qne}}` "QNE" (three spans, one visible) | `sp-t-s cm-mid` | 18 | 76 | 84,354 | 43,182 | 50,213 | always |
| `al` | `<eval Output/alt Altitude_Fivedigits>` + `<postfix/>` | `sp-d-s f-num` | 55 | 76 | 256,354 | 132,182 | 154,213 | always |
| `lf` | `{{flt}}` "FLT" | `sp-t-s cm-mid` | 33 | 89 | 154,415 | 79,214 | 92,249 | LIVE, and every state while airborne |
| `ft` | `<eval Output/ft Duration_FourdigitsFixed>` | `sp-d-xs f-num` | 60 | 89 | 280,415 | 144,214 | 168,249 | same as `lf` |
| `r0`-`r5` | link reason: `{{srch}}` SEARCHING, `{{conn}}` CONNECTING, `{{nodata}}` NO DATA, `{{lost}}` LINK LOST, `{{bad}}` BAD DATA, `{{err}}` BLE ERROR | `sp-t-s`, orange (r0-r2, r4) or red (r3, r5) | 50 | 89 | 233,415 | 120,214 | 140,249 | non-live state while **not** airborne, one at a time |
| `h0`,`h1` | hints `{{h_on}}` "Restart vario (BT off after 5 min)", `{{h_app}}` "Close phone vario apps" | `sp-b-s cm-mid`, width 70 % | 50 | 26 | 233,121 | 120,62 | 140,73 | SEARCHING or LINK LOST for >30 ticks while not airborne; alternate every 5 ticks; `av`/`gn`/`la`/`lg` hidden meanwhile (P1) |
| `ref` | "." colour reference, `visibility:hidden` | none | 50 | 50 | | | | never |

Geometry checks (round display, chord half-width `sqrt(r² - dy²)`; font width estimated at 0.6 em per digit):
- q row Y 26 (y 121): chord x 29..437. "+2.3" at 65 px ≈156 px wide → 62..218 and 248..404. Fits.
- q vario: normal metric values ("+2.3", "-1.1") at 155 px are ≈ 340 px. A 5-character metric value ("-12.4", ≈465 px) would overflow, so values with |v| ≥ 10 m/s are drawn in `vi` (118 px, ≈354 px) instead of `vn`. Imperial uses the smaller `sp-d-xl` (118 px): "-1250" ≈ 354 px → 56..410. Fits.
- q altitude row Y 76 (y 354): chord x 29..437; label 70..98, value "12345" + "ft" ≈ 225 px → 143..368. Fits (5-digit feet is why altitude has its own full-width row).
- q bottom row Y 89 (y 415): chord x 88..378; "FLT" 130..178, "12'34" ≈ 138 px → 211..349. Fits.
- n row Y 26 (y 62): chord x 15..225; "+2.3" at 35 px ≈ 84 px → 30..114 and 126..210. Fits. n altitude "12345 ft" ≈ 120 px → 72..192 within 15..225.
- These are estimates. Real glyph widths are verified by simulator screenshots on q, n, o (§16b) and on the watch (H11).

Design rule: **max climb is not on the live screen.** The UltraBip voice gives max climb only after landing [ub §9]; in flight the decision values are instant climb, average and gain. Max climb is a summary output (§9.2).

### 4.5 Display states

| State `ls` | Meaning | Status (Y 9) | Data source | Bottom row (Y 89) |
|---|---|---|---|---|
| 0 SEARCH | connect issued, no CONNECTED yet | WATCH BARO | watch | SEARCHING (or FLT if airborne) |
| 1 LINKING | CONNECTED, registering / enabling notifications, or waiting for the first valid line | WATCH BARO | watch | CONNECTING |
| 2 LIVE | a valid vario sentence in the last 2 ticks | VARIO (green) | vario | FLT + flight time |
| 3 STALE | BLE connected but no valid sentence for ≥3 ticks | WATCH BARO | watch | NO DATA |
| 4 LOST | DISCONNECTED (101) received; the system reconnects by itself (R L2597) | WATCH BARO | watch | LINK LOST (red) |
| 5 BAD | bytes arrive but no valid LK8EX1/LXWP0 for ≥10 ticks while ≥20 lines failed checksum or were unknown | WATCH BARO | watch | BAD DATA |
| 6 ERROR | registration or notification setup failed after retries | WATCH BARO | watch | BLE ERROR (red) |
| demo flag | simulator only (§10). Not a link state: the synthetic stream drives states 2-3 exactly like real data | VARIO or WATCH BARO as above, plus the yellow DEMO tag at Y 17 | synthetic vario stream | as above |

LIVE is entered after **2 consecutive ticks** with valid data and left after **3 ticks** without (hysteresis, prevents flapping on 150-240 ms gaps [ub §5]). While airborne, the bottom row keeps the flight time in every state (the status line already says WATCH BARO).

### 4.6 Value formatting (all computed in main.js, D10)

- **Metric vario** (`um == 0`): m/s, 1 decimal, explicit sign: `+2.3`, `-0.4`, `0.0`. Integer arithmetic on tenths: `t = round(v*10)`.
- **Imperial vario** (`um == 1`): ft/min rounded to 10, explicit sign: `+470`, `-490`. 1 m/s = 196.85 ft/min. This is the native imperial unit of Suunto's own `VerticalSpeed` formatter [data.js].
- Range clamp for display: ±30.0 m/s / ±5900 ft/min; beyond that show the clamp value.
- No data: `--`.
- Colour tier of the big number (uses the displayed, rounded value): ≥ +0.2 m/s green; ≤ sink threshold red (setting, default -2.5 m/s; "Off" disables red); otherwise neutral. The same tiers apply in WATCH BARO states.
- AVG uses the same format, always neutral colour.
- GAIN: native `Altitude_Fivedigits` (m or ft, R L5804-5806); neutral while in a thermal, `cm-mid` after the thermal ends ("last gain"); `--` before the first thermal.
- ALT: native `Altitude_Fivedigits`.
- Flight time: native `Duration_FourdigitsFixed` (`mm'ss` under 1 h, `hh:mm` above; R L6298-6300). Not `Duration_Fourdigits`, which shows `ss.f` below 60 s (R L6294).
- Battery: native `BatteryPercentage_Threedigits` (R L5928); colour orange ≤15 %, red ≤5 %.

`setText` targets are seeded with `--` in the HTML (R L1307). main.js re-pushes every `setText`/`setStyle` value when it changes and unconditionally on the 2 ticks after each `getUserInterface` call (templates need a cycle or two after load [gaps L307]) and every 5th tick (recovers a view re-activated after a lap or overlay [fp §4]).

---

## 5. Buttons and exercise control

- **No button is overridden.** `v.html` contains no `<userInput>`/`<pushButton>`, so every button keeps its native exercise function from the app screen: pause/resume, lap, display switching, and ending the exercise through the pause menu [cr 3c] [gaps L164-168]. Hardware check H11 confirms it on the Race S.
- Laps have no effect on the app (`onLap` is not defined). Using `/Activity/Trigger` is forbidden: it creates laps [cr 0.3].
- Pause: `onExercisePause` freezes the flight statistics (flight time, thermal, best values); the live vario, average and altitude keep updating. `onExerciseContinue` resumes them.
- AMOLED: a button press while the display is off is ignored unless `enabledWhileDisplayOff` is set (R L1830). We set no buttons, so native behaviour applies. The store text tells pilots to use the always-on display setting for the paragliding sport mode [cr 3a].

---

## 6. BLE: discovery, GATT and connection lifecycle

### 6.1 Device facts

| Item | Value | Source |
|---|---|---|
| Service | `0000FFE0-0000-1000-8000-00805F9B34FB` | [ub §3] (XCTrack #976 GATT dump) |
| Characteristic | `0000FFE1-...` notify, not writable, no handshake | [ub §3] |
| regUuid service, little-endian | `[0xFB,0x34,0x9B,0x5F,0x80,0x00,0x00,0x80,0x00,0x10,0x00,0x00,0xE0,0xFF,0x00,0x00]` | [ub §3]; 16-byte arrays as in the examples (R L2690) [fb §1] |
| regUuid characteristic | same with `0xE1` in place of `0xE0` | [ub §3] |
| Advertised name | `UltraBip🪂XXXX` / `BlueBip🪂XXXX`; UTF-8 `55 6C 74 72 61 42 69 70 F0 9F AA 82` + 4 serial digits = 16 bytes | [ub §2] (computed) |
| FFE0 in advertisement | **unknown**; ble_fanet_sender could not filter on it | [ub §2] |
| Name after a BipLink pilot name is set | **unknown** | [ub §2, open questions] |
| BLE off if nothing connects within 5 min of power-on | yes | [ub §2] |
| One central at a time | probably | [ub §2] |
| Pairing | none needed (remote-control mode must stay off) | [ub §2, §6]; [cr §1] (14783 #5) |

### 6.2 Search parameters

**(v0.1: superseded by binding decision 1 and §0.1 B1 — the vario advertises only its name; no FFE0 filter.)**

`appConn.connect(enabledZappId, handler, sp1[, sp2])`; byte 0 of each param = AD type: 2/3 partial/complete 16-bit UUID list, 8/9 short/complete local name, 255 manufacturer data (R L2490-2521). Max length is documented as 16 bytes (R L2494), but the official template passes 17 (type byte + 16) [fb §1], so 17 is treated as allowed **(unverified, H1)**. The semantics of name matching (exact, prefix, substring) and of combining two params (assumed OR) are undocumented [fb open questions].

| Settings | sp1 | sp2 |
|---|---|---|
| `sn` empty, model UltraBip (default) | `[9, 0x55,0x6C,0x74,0x72,0x61,0x42,0x69,0x70]` ("UltraBip") | `[3, 0xE0, 0xFF]` |
| `sn` empty, model BlueBip | `[9, 0x42,0x6C,0x75,0x65,0x42,0x69,0x70]` ("BlueBip") | `[3, 0xE0, 0xFF]` |
| `sn` = 1-6 digits, e.g. `1234` | `[9, <model prefix bytes>, 0xF0,0x9F,0xAA,0x82, 0x31,0x32,0x33,0x34]` (17 bytes for UltraBip, 16 for BlueBip) | **none** (a UUID slot would bypass the serial filter) |
| `sn` = any other text | `[9, <UTF-8 bytes of the text, truncated to 16>]` (the pilot's own name, if BipLink renames the unit) | none |

UTF-8 encoding of the setting string (it may contain the emoji as a surrogate pair) is done in `ext1.js` (cold code).

**Post-hardware decision table (H1/H2 decide which row ships as the default):**

| Hardware result | Shipped default sp1 | sp2 | Consequence |
|---|---|---|---|
| A. type-9 name **prefix** matches | model prefix | `[9, "BlueBip"]` if model UltraBip (both models work without a setting), FFE0 dropped | best: no FFE0 false matches (another pilot's XC Tracer also uses FFE0 [ub §7]) |
| B. exact match only, FFE0 advertised | `[3,0xE0,0xFF]` | `[2,0xE0,0xFF]` | any FFE0 device can be grabbed: serial setting strongly recommended in the store text |
| C. exact match only, FFE0 not advertised | full name, serial **mandatory** (`"mandatory"` setting, R L2231) | none | store text explains where to read the serial (BipLink / device name) |
| D. name only in scan response and the watch does not see it, FFE0 not advertised | no working filter | | **no-go**: stop and report; ask Stodeus |
| Prefix of type 8 matches but type 9 does not | swap the type byte to 8 | | |

### 6.3 Connection state machine

**(v0.1: superseded by §0.1 B2 — both UUID forms, notify/read fallback phases, try/catch, setup only after 100. v0.2: notifications on either form only; the read fallback was dropped. v0.3: registration skip on every 100, bounded connect back-off, 101 keeps a scheduled retry, a 112 while connected is ignored; see §0.1 B2.)**

All `appConn` calls are made from `evaluate()`, one call per tick, as in the reference flow (R L2608-2868) and the template [tpl L150-231]. The handler only records events and parses data; it never calls `appConn`. The handler is `var onBle = function (ch, ev, d) {...}`; it receives no connection id [fb §1].

| State | evaluate action | Next |
|---|---|---|
| C0 START | `cid = evalFile('{file_path}/ext1.js')(onBle, settings)` (connect). If `cid === undefined && typeof enabledZappId === 'function'` → DEMO (§10). Else `ls = SEARCH`. | C9 WAIT |
| C1 REGISTER | `evalFile('{file_path}/ext2.js')(cid)` → `appConn.regUuid(cid, 1, svcLE, chrLE)` | C9 |
| C2 NOTIFY | `appConn.enaCharNotf(cid, 1)` | C9 |
| C3 READY | `output.con = 1` (closes the Searching view, R L2485, L2842); `ls = LINKING` until the first valid line | C9 |
| C9 WAIT | nothing; watchdogs below | |

| Event | Handling |
|---|---|
| 111 CONNECT_DONE | note only (the template comment claiming a state change here is wrong [fb §3]) |
| 112 CONNECT_FAILED | retry C0 after 10 ticks, at most 6 times, then ERROR. A repeated `connect` may log `Duktape BLE API err 1` (connection already exists, R L3175) if the firmware still holds the first attempt; debug builds log every retry and H1/H7 record whether err 1 appears, so the retry cap is tuned on evidence |
| 100 CONNECTED | `registered ? C2 : C1`; `ls = LINKING`. Registration persists across reconnects; notifications must be re-enabled after every reconnect [fb §1] [tpl L29-47] |
| 107 UUID_REGISTERED | `registered = 1` → C2 |
| 108 UUID_REGISTERED_FAILED | retry C1 after 3 ticks, at most 3 times, then ERROR |
| 109 CONFIG_DONE | → C3 |
| 110 CONFIG_FAILED | retry C2 after 2 ticks, at most 5 times, then ERROR |
| 106 NOTIFICATION, 115 INDICATION | if `ch == 1`: feed the bytes to the parser (§7). 115 is undocumented but handled like 106 (Nuki pattern) [fb §1] |
| 101 DISCONNECTED | `output.con = 0`, `ls = LOST`, parser reset, bins cleared; keep `registered`; wait for the system's automatic reconnect (R L2597) [tpl L69-71, L182-194] |
| 113, 114 | ignored (undocumented) [cr §2] |

Watchdogs (evaluate, D7):
- 3 ticks without a valid sentence while connected → STALE; display switches to the watch.
- 10 ticks with **zero bytes** received after 109 → issue C2 again, once per connection (covers a lost CCCD write; unverified need).
- No reconnect API exists, so after LOST the app can only wait. Race S users report that external sensors do not reconnect after a dropout and the fix has not shipped to the Race S [cr 3a] [fb §3] (forum 15754). H8 measures it; the hint row tells the pilot what to try.

`data` is treated as an array-like of byte numbers: only `d.length` and `d[i]` are used, no Array methods, no `DataView` [fb §1].

### 6.4 Throughput

At 10 Hz LK8EX1 (~33 B) plus 10 Hz LXWP0 (~37 B) plus 1 Hz GGA/RMC (~145 B) the stream is about 0.9 KB/s [ub §4]. On the Race S (MTU 127, 124-byte payload) every line fits one notification; on MTU-23 watches each line spans 2-4 notifications (R L2467-2472) [ub §4]. The parser is indifferent to chunking (§7).

---

## 7. Data flow and parser

### 7.1 Data flow

```
UltraBip --notify FFE1--> onBle(106, bytes)
   -> feed(): byte state machine, XOR checksum, field accumulation (no allocation)
   -> on a valid $LK8EX1: add to the current tick bin (sum pressure, sum vario, count, last battery)
      on a valid $LXWP0: add to the secondary bin
evaluate() every 1 s:
   -> BLE state step (at most one appConn call)
   -> close the bin -> per-tick mean pressure & vario -> QNE altitude -> ring buffer
   -> link state + hysteresis -> choose source (vario | watch)
   -> calibration (§8.1) -> outputs vs, av, alt, gn, ft, src, bat, con
   -> flight and thermal state machines (§8.3, §8.4), only while the exercise runs
   -> setText / setStyle for vn|vi, av, vu, colours, visibility
Settings (localStorage.getItem, R L2238-2244) are read in onLoad.
Watch inputs (slp, walt, wvs, spd, um) arrive as input.* every evaluate.
Template evals render alt, gn, ft, bat with native unit conversion (R L1611-1618).
```

### 7.2 Sentence formats

**`$LK8EX1,<p>,<alt>,<vario>,<temp>,<bat>,*CS\r\n`** [ub §5.1] (LK8000 `Docs/LK8EX1.txt`). Note the empty field before `*`.

| Field | Content | Sentinel | Accept range (design) | Use |
|---|---|---|---|---|
| 0 | static pressure, Pa (integer today; decimals tolerated) | 999999 | 10000-120000 | altitude (primary) |
| 1 | QNE altitude, m (integer) | 99999 | -1000-12000 | used only if field 0 is invalid |
| 2 | vario, cm/s, signed | 9999 | -3000-3000 | instant vario |
| 3 | temperature, °C | 99 | | parsed, not shown (probably case temperature [ub §8.16]) |
| 4 | battery: ≥1000 → percent = value - 1000; <1000 → volts | 999 | | battery % (volts → unknown, shown as `--`) |

**`$LXWP0,<logger>,<IAS>,<alt>,<v1>,...,<v6>,<hdg>,<wdir>,<wspd>*CS`** [ub §5.2]: field 2 = QNE altitude (m), fields 3-8 = up to six vario samples in m/s; take the first non-empty one; always count all six so later fields stay aligned. Used only as the fallback source (D6).

**GGA / RMC**: recognised by the 3 letters after the 2-letter talker (`GP` or `GN`), checksum-validated, counted, and otherwise ignored in v1 [ub §8.10].

**Checksum**: XOR of every byte between `$` and `*`, written as two hex digits; accept upper or lower case [ub §4, §8.3].

### 7.3 Streaming parser (D5)

**(v0.1: LK8EX1 only; LXWP0/GGA ignored, RMC parsed for the GPS line; ids as a 48-bit number — §0.1 B3.)**

Module-level scalars only, plus one preallocated `Uint8Array(6)` for the sentence id. No line buffer is needed because fields are accumulated as they stream past.

| Parser state | On byte b |
|---|---|
| P0 WAIT | `$` → reset counters, `ck = 0`, `len = 0`, `hdrLen = 0`, → P1. Anything else: ignore (resynchronisation) |
| P1 HEADER | `,` → identify the id from `hdr[]`: `LK8EX1` → 1, `LXWP0` → 2, `??GGA` → 3, `??RMC` → 4, else 0; `ck ^= b`; → P2. Otherwise store into `hdr` (if `hdrLen < 6`), `ck ^= b`. More than 6 header bytes → P0 |
| P2 FIELDS | `*` → finish the current field, → P3. `,` → finish field, `fi++`, `ck ^= b`. Digit → `acc = acc*10 + (b-48)` (count decimals after `.`), `ck ^= b`. `-`/`+` at field start → sign. `.` → decimal mode. Other printable → mark field invalid, `ck ^= b`. `$` → restart at P1 (lost tail). CR/LF → P0 (no checksum, drop). Only fields 0-4 (LK8EX1) or 2-8 (LXWP0) are stored, in scalars `f0..f4` |
| P3 CS-HI / P4 CS-LO | hex digit → accumulate; non-hex → P0 (drop). After the second digit: if `cs == ck` and id ∈ {1, 2} and fields pass the sentinel and range checks → **commit** to the tick bin; else count `nBad`. → P0 |
| any | `len++`; `len > 96` → P0 and count overflow. LK8EX1 is 33-34 B, LXWP0 ~37 B, GGA/RMC ~72 B [ub §4] |

Field finish: empty field → NaN marker; value = `sign * acc / 10^dec`; `-0` and leading `+` accepted [ub §8.4].

Commit LK8EX1: `binP += p; binN++; binV += vario; binVN++; bat = ...`. Commit LXWP0: `binA2 += alt; binV2 += v; binN2++`. Counters for diagnostics: `nOk`, `nBad`, `nBytes`, `nMaxLen` (largest notification seen, for H5).

### 7.4 Per-tick binning and ring buffers (D7)

- One `Float32Array(64)`: indices 0-31 = vario-source QNE altitude per tick, 32-63 = watch altitude per tick; `NaN` marks an empty tick. One buffer, as the reference recommends (R L951-960); 256 bytes of data.
- At each evaluate: if `binN > 0`: `pMean = binP/binN`, `hQNE = 44330.77 × (1 − (pMean/101325)^0.190263)` [ub §5.1] (98705 Pa → 220.41 m), `vInst = binV/binVN/100` m/s. Else if the LXWP0 bin is non-empty and LK8EX1 has been absent ≥3 ticks: `hQNE` = mean LXWP0 altitude, `vInst` = mean LXWP0 vario. Else the tick is empty.
- The watch ring is filled every tick from `input.walt` (guarded with `isFinite`; inputs can be `undefined`→`NaN` on the watch [fp §4]).
- **Average climb over N s** (N from the setting: 10/15/20/30) = `(h[t] − h[t−N]) / N`, using the nearest valid bins and dividing by their real tick distance; needs at least N/2 s of span, else `--`. This is the integrated vario, independent of burst arrival.
- **Instant vario** = mean of the LK8EX1 vario field over the tick (the UltraBip's IMU-assisted "instant vario" [ub §1]), not a pressure derivative.

---

## 8. Algorithms

### 8.1 Altitude calibration (D8)

Setting `ar`:

| Mode | Formula | Notes |
|---|---|---|
| 0 "Match watch altitude" (default) | `alt = hQNE + off`. While **not airborne**: `off = EMA30(walt − hQNE)` (time constant 30 ticks; initialised to the first valid difference). While airborne: `off` frozen. | Removes the sensor bias between the vario and the watch; follows any calibration the pilot did on the watch (manual, or FusedAlti in the sport mode). If `|off| > 1500 m` or no valid `walt` ever arrived, fall back to mode 1 for this session (label QNH). |
| 1 "Watch sea-level pressure" | `alt = 44330.77 × (1 − (pMean/slp)^0.190263)` with `slp = /Fusion/Altitude/SeaLevelPressure` in Pa (R L630-635), valid range 87000-108500 Pa, else 101325 | 98705 Pa at slp 101800 → 259.65 m |
| 2 "Standard (QNE)" | `alt = hQNE` | for flight-level/airspace reference |

The label at Y 76 shows ALT (mode 0), QNH (mode 1) or QNE (mode 2). When the source is the watch, `alt = walt` regardless of mode and the status line says WATCH BARO. The app never writes `/Fusion/Altitude/FusedAlti` (R L602-617): changing the watch's own altimeter behaviour is the sport mode's job. The store text recommends calibrating the watch at launch.

When only LXWP0 is available, `hQNE` is its altitude field; modes 0 and 2 work unchanged; mode 1 converts through `p = 101325 × (1 − h/44330.77)^(1/0.190263)`.

### 8.2 Source selection

`src = 2` (vario) in LIVE (real or demo stream), else `src = 1` if the watch inputs are valid, else `0`. Instant vario in watch mode = `input.wvs` (`/Fusion/Altitude/VerticalSpeed`, R L574-579); average from the watch ring. Because both rings fill continuously, a source switch never empties the average.

### 8.3 Flight detection (exercise running and not paused)

Circling detection needs heading, and no heading resource is documented in the reference (only formatters, R L5935-5941), so flight and thermal detection use speed and climb only **(design)**. XCTrack's rule (≥90° heading change in 30 s) [ub §9] is a v1.1 option using LXWP0 heading.

| Transition | Rule |
|---|---|
| GROUND → AIRBORNE | (`spd` = `/Activity/Current/Speed` ≥ 4.5 m/s for 8 consecutive ticks) OR (`|avg10|` ≥ 1.0 m/s for 10 consecutive ticks). On transition, add the detection window (8 or 10 s) to flight time; take-off altitude = ring value from 12 ticks earlier. |
| AIRBORNE → GROUND | `|avg10|` < 0.3 m/s AND (`spd` < 1.5 m/s) for 60 consecutive ticks (90 ticks if `spd` is not finite). On transition, subtract the 60/90-tick window from flight time; resume altitude-offset tracking. |

`spd` is the watch's own fused speed (R L281-286). Hiking climbs (≈0.3 m/s) and walking speeds do not trigger take-off (UC4). Multiple flights in one exercise accumulate.

### 8.4 Thermal detection and gain (airborne only)

| Transition | Rule |
|---|---|
| OUT → IN | `avg10` ≥ +0.3 m/s for 5 consecutive ticks. `base` = minimum ring altitude over the last 20 ticks. |
| IN | `gain = alt − base`, `top = max(top, alt)`; GAIN shown in neutral colour |
| IN → OUT | `avg10` < 0.0 m/s for 15 consecutive ticks. `lastGain = top − base`; `bestGain = max(bestGain, lastGain)`; GAIN shows `lastGain` in `cm-mid` |

### 8.5 Best climb

`bestClimb = max(avgN)` while airborne (the same window the pilot sees as AVG). Summary only.

### 8.6 Link quality

`linkTicks` counts exercise ticks in LIVE; `exTicks` counts all running exercise ticks. Summary "Vario link" = `100 × linkTicks / exTicks`.

---

## 9. Manifest, outputs, FIT logging and summary

### 9.1 Manifest (target content)

**(v0.1: as below plus outputs `gs`, `hd`, setting `gp`, setting `sn` renamed "Vario name (optional)" (maxLength 24), template without `displays` — see `src/ble_vario/manifest.json`.)**

```json
{
  "name": "LiftLink Vario",
  "version": "1.0",
  "author": "<author name>",
  "description": "UltraBip/BlueBip vario",
  "type": "device",
  "usage": "workout",
  "modificationTime": <unix seconds at build>,
  "in": [
    { "name": "slp",  "source": "Fusion/Altitude/SeaLevelPressure", "type": "subscribe" },
    { "name": "walt", "source": "Fusion/Altitude",                  "type": "subscribe" },
    { "name": "wvs",  "source": "Fusion/Altitude/VerticalSpeed",    "type": "subscribe" },
    { "name": "spd",  "source": "Activity/Current/Speed",           "type": "subscribe" },
    { "name": "um",   "source": "Settings/Unit/UnitsMode",          "type": "get" }
  ],
  "out": [
    { "name": "con" },
    { "name": "vs",  "log": true, "shownName": "Vario",          "format": "VerticalSpeed_Fourdigits" },
    { "name": "av",  "log": true, "shownName": "Avg climb",      "format": "VerticalSpeed_Fourdigits" },
    { "name": "alt", "log": true, "shownName": "Vario altitude", "format": "Altitude_Fivedigits" },
    { "name": "src", "log": true, "shownName": "Vario link",     "format": "Count_Twodigits" },
    { "name": "bat", "log": true, "shownName": "Vario battery",  "format": "BatteryPercentage_Threedigits" },
    { "name": "gn" },
    { "name": "ft" }
  ],
  "template": [ { "name": "v.html", "displays": ["n", "o", "q"] } ],
  "settings": [ ...see §11 ... ]
}
```

- Source paths without a leading slash follow the manifest example (R L120); a nonexistent path stops the app loading (R L133), so every path above is from the reference: R L630, L515, L574, L281, L893. `sp-build` must report no unsupported-resource warning.
- `activities` (e.g. 92 Paragliding, R L5761) is **omitted**: its effect is undocumented [cr §2] and it could hide the app from a hike-and-fly pilot's hiking mode.
- Output names contain no `/` or `.` [st §2.1].

### 9.2 FIT logging (5 outputs, D14)

| Output | Unit written | Format (graph in Suunto app) | Why |
|---|---|---|---|
| `vs` | m/s (SI) | `VerticalSpeed_Fourdigits` → m/min or ft/min | The only signed vertical-speed formatter; `VerticalSpeedFreedive` expects m/min input with a minimum of 0 [data.js] |
| `av` | m/s | `VerticalSpeed_Fourdigits` | |
| `alt` | m | `Altitude_Fivedigits` | |
| `src` | 2 vario / 1 watch / 0 none | `Count_Twodigits` | Lets the pilot (and H8) see dropouts on the timeline |
| `bat` | % | `BatteryPercentage_Threedigits` | Vario battery drain per flight |

Logging happens after each evaluate, when the value changed (R L2066). When a value is unavailable, the output is set to `undefined` (as the template does on disconnect [tpl L182-194]).

### 9.3 Summary outputs (`getSummaryOutputs`, R L1179-1199, L2069-2083)

| id | Name | Format | Value |
|---|---|---|---|
| `c` | Best avg climb (v0.3 name; it is the best AVG-window average, not the instant peak) | metric `OneDecimal_Fourdigits` + postfix `m/s` (R L6545); imperial `Count_Fourdigits` + `ft/min` | §8.5 |
| `a` | Max altitude | `Altitude_Fivedigits` | max calibrated altitude while airborne |
| `f` | Flight time | `Duration_FourdigitsFixed` | §8.3 |
| `g` | Best thermal gain | `Altitude_Fivedigits` | §8.4 |
| `l` | Vario link | `Percentage_Threedigits` (R L6590) | §8.6 |

`getSummaryOutputs` is also called when the user backs out of the start screen without starting [tpl L277-280]. If the exercise never started, return `[]` (simulator check S5; if `[]` misbehaves, return the five entries with value 0). The body lives in `ext3.js` (cold code).

---

## 10. Demo mode (simulator only)

**(§0.1.8: the demo is no longer in the store build. Its code is the `//@demo` lines of `main.js` and `ext5.js` plus `ext4.js`; `node test/ble_vario/variant.js demo <dir> sim dp=N [gp=1]` builds a copy with it switched on and the phase as the default, which is how the screenshots are made. The gate and the phases below are unchanged in that variant (tests B3, U7); the store build in the simulator shows SEARCHING. In the variant the vario-GPS outputs are written after the tick's demo lines, one tick fresher than in v1.0.)**

**Gate (D12).** In C0: `cid === undefined` AND `typeof enabledZappId === 'function'`. The simulator runtime defines `appConn = {connect(m,k,T,S){}, ...}` and `enabledZappId=()=>{}` [sim]; on the watch `enabledZappId` is the system integer (R L2492) and `connect` returns a connection id (R L2496). Additional rules:
- Once any BLE event (100, 106, 111) has been received, demo can never start.
- Demo shows the yellow DEMO tag at Y 17 for as long as it runs and sets `con = 1` at once. `dp` values 10-14 repeat phases 0-4 with the tag hidden, for store screenshots only; they have no effect unless the demo gate already passed, so they cannot hide anything on a watch.
- Unit test B3 covers every combination.

**Generator (`ext4.js`, loaded once with `evalFile`, R L1204-1212).** Each tick it builds 8-10 synthetic `$LK8EX1` lines with correct checksums into one reusable `Uint8Array(40)` and feeds them through the **same** `feed()` parser. Every 3rd line is split into two chunks (20 B + rest) to exercise reassembly. Every 40th line gets a wrong checksum.

Flight script (loops): thermal +2.4 ±0.6 m/s for 60 s → glide -1.2 m/s for 30 s → strong sink -3.1 m/s for 10 s → 8 s with no lines (shows the watch fallback) → glide 20 s → thermal. Pressure starts at 84512 Pa (QNE 1504 m); battery `1087` (87 %). The demo seeds the flight state (airborne, flight time 720 s, best climb 3.1 m/s) so a 4-second screenshot already looks like mid-flight. The simulator's own altitude (320 m) and sea-level pressure (101325 Pa) do not match the synthetic flight [sim data-source-default], so demo forces altitude mode 1 (which equals QNE at 101325 Pa).

**Screenshot phases.** Hidden `data.json` key `dp` (not exposed as a setting) selects the starting phase:

| `dp` | Shows |
|---|---|
| 0 | in a thermal, green number, gain building (store screenshot 1) |
| 1 | strong sink, red number (screenshot 2) |
| 2 | data stops after 1 tick → NO DATA / WATCH BARO (screenshot 3) |
| 3 | never feeds → SEARCHING with the hint row (screenshot 4) |
| 4 | on the ground before take-off, flight time 0 |
| 10-14 | phases 0-4 without the DEMO tag (store screenshots; the battery shows 87 % instead) |

Screenshots are taken by copying `src/ble_vario` to a scratch folder, editing `dp` in the copy, and calling the bridge.

---

## 11. Settings and data.json

**(v0.1: data.json is `{ "dm": "0", "sn": "", "ar": "0", "aw": "0", "sk": "3", "gp": "0", "dp": "0", "dbg": "0" }`; read only by `ext5.js` in onLoad — §0.1 B5, I7. Since §0.1.8: `{ "dm": "0", "sn": "", "ar": "0", "aw": "0", "sk": "3", "gp": "0" }`, 68 B; `dp` is read only by the demo variant, `dbg` is gone: the debug variant is a build, §0.1 I7.)**

Settings exist only on n, o, q [cr §2] and **cannot be edited for sideloaded apps or tested before publishing** [cr 3c] [st §1.5], so `data.json` defaults must give a working app. Enums use inline `values` and are stored as an index string (R L2224-2229); never `valuePath` [cr §1]. main.js reads every key with `localStorage.getItem` (R L2242-2244) and falls back to the default on `null`, `NaN` or out of range.

| Path | shownName | Type | Values | Default |
|---|---|---|---|---|
| `dm` | Vario model | enum | `["UltraBip", "BlueBip"]` | `"0"` |
| `sn` | Vario name (optional) | string, `maxLength` 24 | the part after the parachute or the whole advertised name; only 16 name bytes are sent (§0.1 B1). Label and `maxLength` to be fixed after H2 | `""` |
| `ar` | Altitude reference | enum | `["Match watch altitude", "Watch sea-level pressure", "Standard (QNE)"]` | `"0"` |
| `aw` | Average climb window | enum | `["10 s", "15 s", "20 s", "30 s"]` | `"0"` |
| `sk` | Show sink in red below (v0.3 label; `ext5.js` turns it into the m/s threshold, -0.95 - 0.5 × index, at which the displayed tenths reach the setting) | enum | `["Off", "-1.5 m/s (-300 ft/min)", "-2.0 m/s (-390 ft/min)", "-2.5 m/s (-490 ft/min)", "-3.0 m/s (-590 ft/min)", "-3.5 m/s (-690 ft/min)"]` | `"3"` |
| `gp` | Bottom line | enum | `["Flight time", "Vario GPS speed and course (UltraBip only)"]` (v0.3) | `"0"` |

Setting labels are static strings, so the sink thresholds show both units.

`data.json`:

```json
{ "dm": "0", "sn": "", "ar": "0", "aw": "0", "sk": "3", "gp": "0", "dp": "0", "dbg": "0" }
```

Hidden keys (not in `settings`): `dp` demo phase (§10); `dbg` = 1 logs BLE events and 10-tick counters with `systemEvent('[vl] ...')` for hardware tests [fb §4] (§0.1 I7). `fx` was removed (§0.1 I7). Store builds ship `dbg` as `"0"`. (§0.1.8: neither key is in the store build any more; `dp` belongs to the demo variant, the logging to the debug variant.)

---

## 12. Budgets

### 12.1 Memory (Race S, D5)

**(v0.1: measured sizes and the 4 KB conflict are in §0.1 B7. Measured now, after the memory round: §0.1.8, steady 19.1 KB, load peak 25.0 KB, minified main.js 5.26 KB, ext1.js called once in onLoad with its two search arrays kept, ext4.js only in the demo variant.)**

Usable heap on a Race S may be as low as ~28 KB, shared by the enabled apps (up to 2 on Race S) [cr 0.1, 0.4]. Under pressure the firmware evicts an app and its BLE link dies for the rest of the exercise [fb §3] (forum 15692). Target: **leave at least half the heap to a second app.**

| Item | Budget |
|---|---|
| `main.js` minified | ≤ 6 KB (compiled bytecode lives in the heap) |
| `ext1.js` connect + search-param builder + UTF-8 encoder | ≤ 1.5 KB, released after use (`ext = undefined` before each `evalFile`, R L1223) |
| `ext2.js` regUuid | ≤ 0.5 KB |
| `ext3.js` summary | ≤ 1 KB |
| `ext4.js` demo generator | ≤ 3 KB, simulator only |
| Typed arrays | `Float32Array(64)` (256 B) + `Uint8Array(6)` header (+40 B demo buffer only in demo) |
| Module-level scalars | ≤ 60 variables (≈1 KB) |
| Module-level functions | the 7 lifecycle callbacks (`onLoad`, `evaluate`, `onExerciseStart`, `onExercisePause`, `onExerciseContinue`, `getUserInterface`, `getSummaryOutputs`) + at most 4 `var` helpers (`onBle` with the parser inlined, a formatter, a UI push, an ext loader). The re-enable leak scales with the number of module-level functions [fp §4] (forum 15490) |
| Allocation in the 106 handler | **none** (no strings, arrays, closures or objects) |
| Allocation per evaluate | ≤ 3 short strings, only when a displayed value changed |
| Template | ≤ 30 elements, no template JS beyond `onActivate` colour fallback (§4.3) |
| **Total resident JS heap target** | **≤ 12 KB** without demo; measured on hardware (H10) |

Memory faults show as `releaseMemoryCb (exec. zapp)` or `(exec. ui)` in the system events (R L3333-3340).

### 12.2 Canvas

**0 units**: no canvas element (D11). If a later version adds one: one canvas, at most one path of ≤24 `lineTo`, ≤60 budget units (2 × strokes + lineTo) per frame, well under the ~200-unit Race S ceiling [cr 0.2].

### 12.3 Images

0 of the 2 allowed (R L1581).

---

## 13. Edge cases and error handling

| Case | Behaviour |
|---|---|
| No vario found | Searching view stays (con = 0); the app screen shows WATCH BARO + SEARCHING; after 30 ticks two hint lines "Restart vario, check name" / "Close phone vario apps" (v0.3: "Restart exercise and vario" in BLE ERROR) [ub §2, §8.14]. Connect retries back off to once a minute (§0.1 B2). Whether the pilot can dismiss the Searching view and start the exercise is H7. |
| Phone app (XCTrack, FlySkyHy) holds the link | Same as above; hint covers it [ub §2]. |
| Another pilot's vario nearby | First match wins [fb §3]. Mitigation: serial setting (§6.2); the battery % on screen lets the pilot spot a wrong unit. |
| Mid-flight dropout | ≤3 ticks to WATCH BARO; `src` logged as 1; LOST on 101; vario data back after 2 good ticks. Flight stats continue on watch data. |
| Race S never reconnects | Stays in LOST with watch data (still a working display). Store text and H8 document the workaround; re-entering the app is a last resort because toggling apps leaks memory [fb §3] (forum 15490). |
| Malformed data, MTU-23 fragmentation | Checksum drops it; counted; BAD after 10 ticks with ≥20 failures and no valid line [ub §8]. |
| All-sentinel LK8EX1 | Rejected; never enters averages (XCTrack #1059) [ub §8.5]. |
| Battery in volts (<1000) or 999 | Battery shown as `--`. |
| Pressure field invalid, altitude field valid | Use field 1 as QNE altitude. |
| LK8EX1 and LXWP0 both present | LK8EX1 only (D6). |
| LXWP0 only | Fallback source after 3 ticks without LK8EX1; switches back after 2 ticks of LK8EX1. |
| Unknown sentences ($PFLAU, private BipLink traffic) | Ignored [ub §8.13]. |
| Watch inputs undefined/NaN | Guarded with `isFinite`; altitude mode 0 falls back to mode 1; watch fallback shows `--`. |
| Units mode NaN | Metric. |
| Exercise paused | Live values continue; flight stats frozen (§5). |
| Lap / overlay re-activates the view | v0.3: the view's onActivate sends event 1 and onEvent forces a full re-push on the next evaluate (≤ 1 s); the 5-tick full push remains as the fallback (§0.1 I1, H11). |
| App selected but exercise never started | `getSummaryOutputs` returns `[]` (§9.3). |
| Settings sync triggers "Maximum SuuntoPlus apps reached" | Known community bug with settings [st §2.4]; H14 checks after publishing. |
| Demo gate wrongly true on a watch | Impossible by construction (both fingerprints + no BLE event seen); B3 tests it; H1 confirms DEMO never appears. |

---

## 14. Localization

**(v0.1: en.json keys `vario watch avg gain alt flt srch h_on h_app`; reason texts and ALT/QNH/QNE come from main.js — §0.1 B8.)**

- HTML text uses `{{key}}` identifiers resolved from `<lang>.json` at build time (R L2416-2434). All status, label, reason and hint strings are HTML spans toggled by `setStyle(..., 'visibility', ...)`, so main.js builds no localized strings. Unit strings (`m/s`, `ft/min`) are not translated.
- v1 ships **`en.json` only**. Hungarian and Slovak are not supported languages [cr 3c]; poor translations draw criticism [fp §4]. de, fr, it (Alpine paragliding markets) are v1.1 candidates and must keep each string within the same widths (status ≤12 chars, labels ≤5, reasons ≤12, hints ≤34).
- If a glyph renders as a square on the watch, switch that element to `sp-b-cjk` (R L1936) [st §2.3].
- Manifest name and description are checked per language for byte limits [st §2.5].

`en.json` keys: `vario` VARIO, `demo` DEMO, `watch` WATCH BARO, `avg` AVG (+ `avg15` AVG 15s, `avg20` AVG 20s, `avg30` AVG 30s), `gain` GAIN, `alt` ALT, `qnh` QNH, `qne` QNE, `flt` FLT, `srch` SEARCHING, `conn` CONNECTING, `nodata` NO DATA, `lost` LINK LOST, `bad` BAD DATA, `err` BLE ERROR, `h_on` Restart vario (BT off after 5 min), `h_app` Close phone vario apps.

---

## 15. Store listing plan

| Field | Content | Limit / source |
|---|---|---|
| Name | **LiftLink Vario** (14 bytes) | ≤60 bytes (R L64) |
| On-watch description | **UltraBip/BlueBip vario** (22 bytes) | ≤100 bytes, ~22 chars recommended [st §2.1] |
| Long description (single-line field [st §1.2]) | see below | |
| Screenshots | 466x466 PNG from the simulator demo phases `dp` 10, 11, 12, 13 (DEMO tag hidden; the data is synthetic but every element is the real UI) | 466x466 attested [st §1.2] |
| Banner | dark background, app name, a large green "+2.4" and a thin climb arc; **no Stodeus or Suunto logos, no product photos** | dimensions to be read in the signed-in console [st §4]; "unauthorized images" block publication [st §1.2] [cr 3a] |
| Support contact | an email in the description | [st §1.4] |
| Version | `1.0` for the first store upload; sideload test builds `0.1`, `0.2`, ... | [st §1.4] |

Long description draft (superseded: the current text, FAQ and pre-submission list are in `store/ble_vario/listing.md`):

> Shows your Stodeus UltraBip or BlueBip Bluetooth vario on your Suunto watch: colour-coded climb rate, 10 s average climb, altitude calibrated to your watch, thermal gain, flight time and vario battery. If the link drops, the app switches to the watch's own barometer and says so. Logs vario, average climb and altitude to your workout. No sound: your vario keeps beeping. Before flying: switch the vario on less than 5 minutes before starting, close phone flight apps (the vario accepts one connection), and set the paragliding display to always-on. Works on Race, Race S, Race 2, Vertical, Vertical 2, Ocean, Ocean Lite and 9 Peak Pro. Tested with UltraBip on Race S. Not affiliated with Stodeus or Suunto; UltraBip and BlueBip are Stodeus trademarks. Support: <email>.

Compatibility is stated in text because the store cannot restrict installs by watch model [st §1.5]. BlueBip support is described as compatible but untested until someone tests it (the author owns only an UltraBip).

---

## 16. Test plan

### 16a. Automated tests (runnable here, plain Node, no installs)

`test/ble_vario/run.js` loads the shipping `main.js` and `ext*.js` with `vm.runInNewContext` and a stub of the watch globals: `appConn` mock (records calls, emits events), `enabledZappId` (a number for watch-mode tests, a function for simulator-mode tests), `setText`/`setStyle`/`getStyle`/`systemEvent`/`playIndication` recorders, `evalFile` that reads the real `ext*.js` from disk, `localStorage` backed by a copy of `data.json`, and `Uint8Array`/`Float32Array` from Node. It drives `onLoad`, `evaluate`, `onExerciseStart`, etc. as the watch would.

Test vectors (checksums computed and matching [cr §2]):

```
$LK8EX1,98705,220,0,20,1090,*2A            real, UltraBip fw 2023-03 [ub §5.1]
$LK8EX1,98706,220,-1,20,1090,*05           real
$GPGGA,171143.00,4513.6048,N,00548.5377,E,1,04,4.1,269.3,M,48.5,M,,*6D   real
$GPRMC,171143.00,A,4513.6048,N,00548.5377,E,0.0,330.3,300323,,,A,V*21    real
$LK8EX1,84512,1504,185,12,1072,*12         synthetic, 1.85 m/s, 72 %
$LXWP0,N,,1504.2,1.85,,,,,,245,,*50        synthetic
$LK8EX1,999999,99999,9999,99,999,*13       all sentinels
$LK8EX1,84512,1504,-312,12,3.95,*26        battery in volts
$PFLAU,0,0,0,1,0,,0,,*63                   unknown sentence
```

| Id | Test |
|---|---|
| P1 | Checksums of all vectors accepted; one flipped bit → rejected and counted; lower-case hex accepted |
| P2 | LK8EX1 fields: 98705 Pa, 220 m, 0 / -1 cm/s, 1090 → 90 % |
| P3 | Fragmentation: the same 5-line stream split at every boundary 1..40 bytes, at 20 bytes (MTU 23), and packed 3 lines per 124-byte notification (MTU 127) → identical committed samples |
| P4 | Resync: leading garbage, missing `$`, truncated line followed by a full line, `$` in mid-line, a 200-byte junk run (overflow), CR/LF without checksum |
| P5 | Sentinels rejected; never reach the bins |
| P6 | Empty trailing field, leading `+`, `-0`, decimal pressure `98705.5` |
| P7 | LXWP0 fallback: used only after 3 ticks without LK8EX1; switch back after 2 ticks; never both in one tick |
| P8 | GGA, RMC, GNGGA, $PFLAU ignored without disturbing state |
| P9 | Static scan of the shipped `main.js`: the parser and handler bodies contain no `String.fromCharCode`, `split`, `substr`, `slice`, `new `, `[]` literal or `function` (allocation guard), and the file has no regex literal, `Date`, `let`, `const`, `=>` |
| A1 | Altitude: QNE(98705) = 220.41 ± 0.05 m; QNH mode with slp 101800 → 259.65 ± 0.05 m; offset mode tracks the watch on the ground and freezes when airborne |
| A2 | Averages: 10 Hz samples climbing exactly 2.00 m/s → avg10 = 2.00 ± 0.05; bursty arrival (20 samples in one tick, 0 in the next) and a 1-tick gap do not change it |
| A3 | Flight detection: car-speed burst on the ground, hiking climb at 0.3 m/s, real take-off (speed and climb), ridge soaring at zero ground speed, landing; flight time corrected by the detection windows |
| A4 | Thermal: synthetic 300 m climb → gain 300 ± 5 m; two thermals → best gain; exit rule |
| A5 | Formatting: metric `+2.3`, `-0.4`, `0.0`, clamp; imperial `+470`, `-490`; colour tiers for every `sk` value including Off |
| B1 | BLE state machine with the mock: connect → 111 → 100 → regUuid called with the exact FFE0/FFE1 LE arrays and id 1 → 107 → enaCharNotf → 109 → `con == 1`; 106 data parsed; 101 → `con == 0`, LOST; second 100 → enaCharNotf again **without** regUuid; 108/110/112 retries and ERROR; at most one appConn call per evaluate; zero appConn calls from inside the handler |
| B2 | Search params for every settings row in §6.2, byte for byte, including the 17-byte UltraBip serial name, the emoji UTF-8 encoding of a custom name and truncation to 16 bytes |
| B3 | Demo gate: (`undefined`, function) → demo; (`undefined`, number) → SEARCH; (0, function) → not demo; any BLE event before → not demo |
| B4 | Stale/hysteresis: 3 empty ticks → watch source and `src == 1`; 2 good ticks → LIVE |
| B5 | `getSummaryOutputs` before start → `[]`; after a scripted flight → 5 entries with the §9.3 ids and formats |
| B6 | Settings: `null`, `"abc"`, `"9"` → defaults |
| B7 | Long run: 2 h of synthetic stream (72,000 ticks of lines) through the parser with no exception and bounded counters |

Plus: `node test/ble_vario/build.js src/ble_vario builds/ble_vario/v<ver>` exits 0 with no validation errors or warnings (`tools/sp-build.js` cannot build ext files, §0.1 T1). Memory round (§0.1.8): **D1** behaviour identical to the v1.0 recording (`golden.json`) for the store build and the debug and demo variants, source and minified; **V1** the debug variant's log lines; P9 also scans both variants, counts closures as module functions and checks ≤ 56 module names; M1 loads the minified file as sp-mem does and as the simulator does (exactly one `return function`, §0.1 T10); M2 checks ≤ 56 names, a scope record ≤ 728 B, steady ≤ 19.5 KB, no growth and cyclic garbage only on the setup ticks; B3, U7 and the `dp` cases of B6 run on the demo variant. Tests read closure state through a harness-only accessor injected into the source form. v0.2 test ids: C1-C3 (recorded capture), P1-P11, A1-A5 (A1b, A4b), B1-B15 (B1c robustness, B2b ext1 in Duktape, B5b summary without take-off, B8-B15 scripted watch/vario BLE outcomes), U1-U8, M1-M3 (minified bundle equivalence, sp-mem memory, ids).

### 16b. Simulator checks (bridge screenshots)

| Id | Check |
|---|---|
| S1 | `dp` 0-4 on display q: layout matches §4.4, no clipping at the circle edge, no overlap, DEMO tag visible; `dp` 10-13 for the store screenshots. Expected: in `dp` 2/12 the big number may read `--`, because the simulator's resource table has no case for `/Fusion/Altitude/VerticalSpeed` (it simulates only the Activity-window vertical speed) [sim data-source-watch.js]; the fallback number itself is verified on hardware (H8) |
| S2 | The same on n and o: nothing broken or cut off (small screens need not be beautiful) |
| S3 | Imperial units (if the simulator exposes the unit setting): `vi` shown, ft/min, altitude in ft |
| S4 | `sim_log` right after each screenshot: no exceptions, no unsupported-resource warnings |
| S5 | `getSummaryOutputs` with `[]` does not error |
| S6 | `getStyle` from main.js returns colours, and `setStyle(..., 'visibility', ...)` and `setStyle(..., 'color', ...)` called from main.js take effect (status, reason, hint and label spans depend on it); otherwise move the toggles into the template's `onActivate` subscription (§4.3) |
| S7 | Light theme, if the simulator offers it: colours readable |

The simulator is more permissive than the watch [st §3.7] and has no BLE [fb §4]; passing here proves layout and logic only.

### 16c. Hardware checklist for the user (Race S + UltraBip)

(Rewritten for v0.2, extended for v0.3. For v1.0 the step-by-step version for the user is `docs/ble_vario/HARDWARE_TEST.md`, with the builds in `builds/ble_vario/v1.0*/`. Since §0.1.8 debug builds are made with `node test/ble_vario/variant.js dbg <dir> [sn=Abel] [gp=1]` and `tools/sp-build.js`, not by setting `dbg` in data.json; the `[vl]` lines are unchanged. The probes are in `docs/probe/README.md`; the app builds are `builds/ble_vario/v0.3/` (store defaults) and `v0.3-abel-dbg/` (`sn` "Abel", `dbg` "1"). Settings cannot be edited for a sideloaded app, so every settings variant is its own build: copy `src/ble_vario`, edit `data.json`, build with `tools/sp-build.js`.)

Do these in order. Use sideloaded `.dev` builds over USB; every Suunto app sync deletes sideloaded apps [fb §4], so keep the phone disconnected (or use SyncFix) during testing. Debug builds have `dbg = "1"`; read logs in VS Code → Suunto Watch → View system events [fb §4]. The 10-tick line is `[vl] <state> <ok> <bad> <maxlen> <phase> <step> <rg> <fm>` (§0.1 I7).

| Id | Step | Record |
|---|---|---|
| H0 | Done on a Mac on 2026-10-03 (`docs/research/ultrabip-capture/`): name-only advertising, FFE0/FFE1, LK8EX1 + LXWP0 at ~10 Hz each. Still to do with nRF Connect on the phone: whether the name is in the ADV packet or the scan response, and whether $GPRMC appears in flight with a GPS fix (and how often). Note the firmware version from BipLink. | screenshots + text log |
| H1 | Discovery: the three probes in `docs/probe/README.md` (ProbeS 0xFFE0 UUID, a control expected to fail; ProbeN name prefix `UltraBip`; ProbeF exact name `UltraBip🪂Abel`). Then `v0.3-abel-dbg`: does it reach LIVE, and what do `rg`/`fm` and the phase say (which UUID form registered, failed, delivered)? | for each probe the final stage, `form`, and whether lines count up. Decides prefix vs exact matching (§6.2) and which UUID form the watch uses. Confirm DEMO never appears. |
| H2 | Vario name setting, one build each: `sn` "" (model prefix only), "Abel" (the exact 16-byte name), and, after setting a BipLink pilot name longer than 4 characters, that long name (the app sends only its first 4 characters). | which builds connect. Decides the setting label, `maxLength` and the FAQ answer (`store/ble_vario/listing.md`). |
| H3 | Connect XCTrack (or FlySkyHy) on the phone first, then start the app. Then close the phone app. Repeat with BipLink remote-control mode on. | does the watch fail while the phone holds the link; does it connect after? |
| H4 | Power the vario on, wait 6 minutes, then select the app (debug build). Then switch the vario on again and wait. | confirms the 5-minute BT shut-off and the hint text ("Restart vario, check name"); the `[vl] ev 112` lines and their spacing (10 s six times, then 60 s); **whether a `connect()` after a 112 throws `Duktape BLE API err 1`** (connection already exists) in the system events; whether the app connects once the vario is back on, and how long that takes |
| H5 | With `dbg`: 10-tick counters for 5 minutes. | valid lines/10 s (expect 85-100), bad lines, largest notification size (MTU 127 → whole lines?) |
| H6 | GPS bottom line: a `gp` "1" build, outdoors with a GPS fix, during a drive or flight (and with `dbg`, H0's nRF log of how often $GPRMC arrives). | how often RMC arrives in flight (the 2023 log had 1 RMC in 26 s with a weak fix, the 2026 desk capture none) and what the row shows: speed and course from a fix up to 10 s old, NO GPS FIX for 10-30 s, flight time after 30 s without a fix (v0.3, §0.1 B4). **Decides listing item 5** (keep, drop or call the GPS line experimental). |
| H7 | Select the app with the vario **off**. | can the Searching view be dismissed and the exercise started (and how); does it close by itself, after how long; what does the app screen show? Fills the FAQ's `<H7: ...>` marker (listing item 9) |
| H8 | Dropout: during an exercise, put the vario in a metal tin or 30 m away for 30 s, then bring it back; repeat with a vario power-cycle. | seconds to WATCH BARO, whether it reconnects by itself (Race S bug), seconds to LIVE again, the "Vario source" graph in the Suunto app; BLE ERROR must never show while data flows. Decides the FAQ's LINK LOST answer (listing item 9) |
| H9 | Altitude: at a known spot compare ALT with the watch altitude after 2 min, and again after 30 min of standing still; repeat with modes QNH and QNE (a data.json change per build). | differences |
| H10 | Memory: 2-hour exercise with a second SuuntoPlus app enabled in the same sport mode (sp-mem: v1.0 was ~21.5 KB steady, ~28.1 KB at load, §0.1 B7; the memory-round source is ~19.1 KB steady, ~25.0 KB at load, §0.1.8). Run it with a build of the current source. | no `relMemCb`/`releaseMemoryCb`, no `JSalloc`, no eviction, `JsTotMem` lines if logged. A failure means the feature cuts in §0.1 B7. |
| H11 | Screen: does the climb number turn green/red (`setStyle` colour from main.js) and do the status, reason and hint lines switch (`setStyle` visibility, `#id *`)? Buttons: pause/resume, lap, switch display, end exercise; display-off and always-on behaviour; readability in sunlight; real glyph widths (5-digit altitude, imperial vario, "VARIO 100%"). **Laps (v0.3):** in a LIVE session press lap 3 times; after each lap ALT, GAIN/LAST, FLT and the GPS row must keep changing (they are `<eval>` bindings to Zapp outputs, and forum 15320 reports the output channel cut after a second onActivate; if they freeze, push them with setText like the climb numbers), and with `dbg` every activation must log `[vl] onEvent 1` (the template's onActivate `$.put` to `/Zapp/{zapp_index}/Event`; the reference shows that sender only on buttons) and the whole screen must be right within 1 s. **Latency:** switch the vario off and on; how long until WATCH BARO / VARIO nn%, the reason text and, on the ground after 30 s, the hint lines appear (setText reaches only visible elements; the 5-tick push is the fallback). **Light theme:** switch the watch to the light theme; does the app screen turn white; is the climb number dark green and are VARIO (green), WATCH BARO and the reason texts (orange) readable in daylight. | colour works or not (listing item 6); evals survive laps, onEvent arrives; text latency in seconds; light theme readable or not (listing item 7); all native functions work |
| H12 | After sync to the Suunto app: 5 graphs present and named (Vario, Avg climb, Vario altitude, Vario source, Vario battery); after a flight the summary shows 5 values, after a session without take-off only "Vario link"; switch the watch to imperial and repeat one short session. | screenshots |
| H13 | Ground test before flying: ride a cable car or drive a mountain road with the exercise running: take-off detection, flight time, thermal gain on the ascent. Then a real flight; compare gain and max altitude with the UltraBip IGC/BipLink log. Note watch battery %/h. | values vs IGC |
| H14 | After the first store publish: change each setting in the Suunto app, sync, check it applies and no "Maximum SuuntoPlus apps reached" appears. | |
| H15 | If a BlueBip can be borrowed: repeat H1 (winning build), H5 and one session. | |

---

## 17. Acceptance criteria for "store-ready"

1. **Build**: `test/ble_vario/build.js` exits 0 with no validation errors or warnings; minified `main.js` within the budget decided by H10 (§0.1 B7); template ≤ 5 KB; source package contains only top-level `main.js`, `manifest.json`, `data.json`, `v.html`, `ext1.js`-`ext5.js`, `en.json` [st §1.2].
2. **Code rules**: ES5, no `Date`/regex/`let`/`const`/arrow functions; helpers are `var` functions; every code file starts with the two-line `ABOUTME:` header (`<!-- ABOUTME: -->` in HTML); P9 passes.
3. **Automated tests**: every 16a test passes in `node test/ble_vario/run.js`.
4. **Simulator**: S1-S4 screenshots reviewed on q, n and o; no clipping or overlap on q; nothing broken on n and o.
5. **Discovery decided**: H0-H2 done, the §6.2 decision recorded and the defaults set; with the vario switched on less than 5 minutes earlier the watch reaches LIVE within 30 s of selecting the app, three times in a row.
6. **Link robustness**: H3, H4, H7, H8 results recorded; the screen shows WATCH BARO within 3 s of losing data and LIVE within 3 s of data returning whenever the system reconnects.
7. **Memory**: H10 passes with a second app enabled.
8. **Controls**: H11 passes; pause, lap and end work from the app screen.
9. **Data**: H12 passes; units follow the watch setting in the display, the graphs and the summary.
10. **Flight**: at least one real flight (H13) with gain and max altitude within 5 % of the vario's own log, and no crash.
11. **Demo safety**: B3 passes (the store build contains no demo code at all since §0.1.8) and DEMO never appeared on the watch in any hardware test.
12. **Store assets**: name and description within limits; the 466x466 screen image (`1-thermal.png`) plus up to 3 more if the console takes them; banner at the console's size with no third-party logos; long description with compatibility, the trademark disclaimer and a support email; `version` new and `modificationTime` current [st §1.4]. The pre-submission list in `store/ble_vario/listing.md` is done.

---

## 18. Open risks

| Risk | Impact | Where it is resolved |
|---|---|---|
| No usable discovery filter (row D of §6.2) | App cannot ship | H0-H2 |
| Race S never reconnects after a dropout [fb §3] | Rest of the flight on watch data only | H8; firmware fix outside our control |
| Heap on Race S too small with a second app | Eviction kills the link [fb §3] | H10; trim `main.js`, move more code into ext files |
| 1 Hz display feels laggy | Acceptable because the vario beeps (D2) | H6 |
| `getStyle`/`setStyle` from main.js not supported | Colour and visibility logic move into the template | S6 |
| Store review rejects third-party brand names in the text | Rename description to "BLE vario display" and keep compatibility in the long text | review |
| BlueBip untested | Description says "untested" until H15 | H15 |
