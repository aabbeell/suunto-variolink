# XC features research: suunto-feasibility

## Key points
- Resources: GPS position = Fusion/Location/GeoCoordinates.latitude/.longitude, int32 degrees x1e7, about 1 Hz. Only the dotted fields are whitelisted, and AnchorAlarm v0.3 uses them in main.js. Ground speed = Activity/Current/Speed or position differences. Altitude = Fusion/Altitude (FusedAlti by default in GPS exercises). Climb rate = the UltraBip LK8EX1 vario, with the watch's Fusion/Altitude/VerticalSpeed as fallback.
- Heading resources do exist, which corrects SPEC §8.3: /Fusion/Heading (GPS course above about 2 km/h, compass below, per a forum developer; used by the VMG/VMC app), /Fusion/Heading/IsCompass and /Fusion/Compass/Heading (wrist magnetometer, useless as flight direction). None is in the reference. Computing course from position differences is the most robust option.
- No terrain, DEM or ground-elevation resource exists among the 238 whitelisted paths or in the reference. AGL must be shown as height above take-off (best), above the start or lowest point (hike-and-fly), or above a set landing altitude. Weather grndLevel and route MinAltitude are weak proxies.
- Wind: fit a circle (Kåsa) to the ground-velocity vectors over each completed 360° turn, using 9 running sums and one 3x3 solve. It needs no sample buffer (48 B of state) and about 1.4 µs per tick on desktop Duktape. 1 Hz gives 18-30 samples per circle, well above XCSoar's minimum of more than 8 samples with steps of 4 s or less. A synthetic test gave about 0.5 m/s and 6° RMS from 1 Hz positions with 2 m noise.
- Build wind input from position differences, not from Activity/Current/Speed plus /Fusion/Heading. Smoothing only the scalar speed biases wind low (τ=2 s: -13 %, τ=3 s: -24 %), while vector smoothing does not. The drift method breaks when the pilot recentres. UltraBip RMC can feed the same estimator when the watch GPS is reduced (readable through GPSinterval).
- Wind code adds about 770 B minified to main.js, which is already 5.7 KB with all 8 module functions used. Fold it into the existing 'fly' helper (about 1.5 KB total, at the per-function limit) and split the Cramer expression to keep compiler recursion depth well below the measured 30.
- Thermal map: canvas is template-only and main.js cannot pass arrays. The trail must live in template onLoad variables, inside one always-mounted template (no template swap). A per-tick point channel is needed: tx/ty/tn outputs read through hidden <eval> script formatters, or one packed output. The trail will have gaps while other screens are shown.
- Trail storage: Float32Array(2N) for x,y plus Uint8Array(N) for colour. N=240 (4 min) is 1,920 + 240 B, under the 2 KB dependable allocation size, allocated once. Equirectangular local metres around the first fix, drawn north-up and centred on the newest fix at about 0.6-0.75 px/m.
- Render budget per canvas: cap in code at about 150 units (2 x strokes + lineTo), with at most 20 lineTo per path. The prototype drew 136 segments with constant colour, 94 with realistic thermal colouring and 50 if colour changes every second. Batching by colour bucket gives about 120 segments if moveTo is free (untested). Draw newest-within-budget, cull off-canvas segments, decimate points under 3 px. Use a 240-300 px canvas, not full-face (about 217 KB surface).
- Redrawing once per second is very likely safe: 1 REFRESH per new point, only when the view is active and the point changed, with an allocation-free build function. matram ran 2 canvases at 10 Hz on a Race S, the pool overflow appeared only with 3 at once, and ZoneSense refreshes every 2 s. Desktop cost is about 0.3 ms per frame.
- FIT: 5 logged outputs (validator allows 6, unverified on watch). The watch already logs GPS, speed and altitude natively, so log what only the app knows: vs, wind speed (Speed_Fourdigits), wind direction (CompassHeadingDeg_Fourdigits, radians), thermal gain, link source. Drop bat, alt and av; move vario battery and mean wind / thermal stats to the summary (hard limit 8).
- New hardware tests needed: GPS input duplicates and rate, Fusion/Heading semantics, Speed smoothing, hidden-eval channel order and float precision, template GPS eval, moveTo/strokeStyle canvas cost and off-canvas counting, canvas-size memory with 2 apps, trail persistence across laps, and whether a 6th logged output is recorded.

# Suunto Race S feasibility: onboard vario values, wind, thermal map, FIT logging

Read-only research. No repo files were edited. Scratch prototypes are in `(a scratch folder, not kept)`: `windsim.js`, `windmc.js`, `windmc2.js`, `smooth.js`, `wind_es5.js`, `trail_es5.js`, `bench2.js`.

**Evidence tags:**
- **[D]** documented in the local reference, `SUUNTOPO/reference/suuntoplus_reference_docs.md` (cited as R Lnnn).
- **[T]** whitelisted in the tools library or simulator (the build accepts it) but not in the reference.
- **[P]** used in a public app's source. Hardware use is unconfirmed unless stated.
- **[F]** forum report.
- **[M]** my own measurement: a desktop Duktape prototype or a synthetic simulation.
- **[I]** inference.

## 0. Bottom line

- **Altitude, lift/sink rate and ground speed are feasible.** Track and wind are feasible from inputs that already exist.
- **Wind costs almost nothing:** 9 running sums and one 3×3 solve per circle.
- **No resource gives terrain height.** "AGL" can only be height above take-off, above a landing altitude you set, or above the lowest point so far, and should be labelled that way on screen.
- **The thermal map is feasible but drives the architecture:**
  - Canvas exists only in the template, and main.js cannot pass arrays to it (matram, forum 14766 #92). So the trail buffer has to live in template `onLoad` variables.
  - It needs a per-tick point channel from main.js and one template that stays mounted all session.
  - It also needs a code-side render budget: about 100-140 coloured segments per canvas per frame.
- **Redrawing at 1 Hz should be safe** if each frame is counted and capped [I, strong evidence].
- **FIT logging:** wind takes 2 of the 5 logged slots, so something in the current set has to go.

## 1. Watch resources

The full whitelist has 238 paths: `~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/lib/project/resource-common.js`, export `watchResources`. The validator (`lib/project/resource.js` `isSupported`; `lib/project/manifest.js`; `lib/project/html.js`) only warns on unknown paths. But a path that does not exist on the watch stops the app loading (R L133), so use whitelisted paths only.

| Need | Best source | Unit, precision, rate | Evidence | Notes and alternatives |
|---|---|---|---|---|
| **Coordinates** | Two manifest inputs: `Fusion/Location/GeoCoordinates.latitude` and `.longitude` | int32 = degrees × 10⁷. The step is 1.1 cm north-south; real accuracy is GNSS metres. "Last known" value, so it repeats when there is no new fix (R L658). | [D] R L655-664 documents the object. Only the dotted fields are whitelisted [T]. [P] AnchorAlarm v0.3 uses the dotted inputs and divides by 1e7 in main.js. Its changelog reads "Fixed invalid GPS resource path in manifest causing watch resource warning". | `/Fusion/Location/Readiness` gives 0-100 % [D]. `/Fusion/Location/GeoAccuracy` [T] has undocumented units. `/Navigation/Gps/Coordinates/Full` is a string [D]; HexHunter parses it with split and parseFloat, which allocates every second and depends on the position-format setting, so avoid it. |
| **GPS rate** | — | About 1 s in the Best and Good GPS modes, about 60 s in OK (Suunto Spartan GPS doc). The Race S Performance battery mode uses best multi-band GNSS. | Suunto docs | `/Settings/Activity/Current/ActiveMode/GPSinterval` [T] (the simulator returns 1) lets the app detect a reduced GPS mode and switch to UltraBip RMC. |
| **Ground speed** | Position differences (preferred for wind), or `Activity/Current/Speed` | m/s float, "fusion speed algorithm" (R L281) | [D] | The Race S user guide §3.16 says FusedSpeed is automatically enabled for running-type sports, so in a paragliding mode this is probably plain GPS speed [I]. Its smoothing is unknown. UltraBip `$GPRMC` speed over ground arrives at 1 Hz with a fix only, and v0.1 already parses it (SPEC §0.1 B3/B4). |
| **Track (course over ground)** | Computed as atan2 of position differences | rad | — | `/Fusion/Heading` [T] is 0..2π rad in the simulator. [P] The VMG/VMC sailing app uses it as boat course (speed·cos(heading − wind)). [F] A developer (Szmigiel, forum post 197459): "Compass when stationary and GPS while above ~2 km/h". `/Fusion/Heading/IsCompass` [T] probably flags the source [I]. `/Fusion/Compass/Heading` is the wrist magnetometer (AnchorAlarm and HexHunter use it to point the watch) and is **useless as flight direction**. UltraBip RMC course over ground is a second source. |
| **Altitude** | `Fusion/Altitude` | m float (R L515). By default it is FusedAlti in GPS exercises (Race S guide §3.17). | [D] | Also available: `AltiBaroPressure` in Pa (R L522), `Device/Measurement/Pressure.Measurement` [T], `SeaLevelPressure` (R L630), `GeoCoordinates.altitude` (R L664; GNSS or fused is not stated), and UltraBip pressure → QNE as now. |
| **Vertical speed** | UltraBip LK8EX1 vario (cm/s, 10 Hz, IMU-assisted) | — | — | Watch: `Fusion/Altitude/VerticalSpeed` (R L574) and `Activity/Move/-1/VerticalSpeed/Current` (the validator accepts a Move window). |
| **Forecast wind** | `/Weather/Current.windSpeed`, `.windDeg`, `.windGust` [T] | The simulator returns 6, 230 and 8. The field names follow OpenWeatherMap. | [T] | This is a phone-synced surface forecast for the sync location, not wind at flight level. Whether it is served on a Race S on firmware 2.53.42 is unverified. |
| **Terrain / DEM** | **None** | — | None of the 238 paths, `schema/html-data.json` or the simulator exposes ground elevation. Navigation only gives route `MinAltitude`/`MaxAltitude`/`RemainAscent` (R L726ff). | See the AGL options below. |

**Correction to SPEC §8.3 and §1.1** ("no heading resource is documented"). That is true of the reference only. `/Fusion/Heading`, `/Fusion/Heading/IsCompass` and `/Fusion/Compass/Heading` pass the validator and ship in public apps.

**Input budget.** The current 5 inputs (slp, walt, wvs, spd, um) plus lat and lon make 7 of 10 (R L133). `GPSinterval` (get) and `Fusion/Heading` would be optional extras.

**Duplicate fixes.** evaluate is not phase-locked to the GPS fix (R L1044: 1 s ± 5 ms). It will sometimes see the same fix twice and then a 2-second jump [I]. Rules:
- Only use a sample when lat or lon has changed.
- Divide by the ticks elapsed since the last change.
- XCSoar does the same: it skips samples without a new fix (`CirclingWind.cpp` L122-125).

**AGL approximations, in order of usefulness:**
1. **Height above take-off.** Altitude minus the take-off altitude captured by SPEC §8.3 (the ring value 12 ticks before detection). The most robust option.
2. **Height above the exercise-start point or the lowest point so far.** For hike-and-fly, the exercise usually starts near the valley or landing, so this approximates height above the landing [I].
3. **Height above a set landing altitude.** A phone setting. It cannot be changed in flight, and settings only work for published apps (SPEC §11).
4. **Weak options:**
   - Weather `grndLevel` with `seaLevel` gives the model terrain at the weather location: h ≈ 44330.8·(1 − (grnd/sea)^0.1903) [I]. It is coarse and not under the glider.
   - `NavigatedRoute/MinAltitude` gives the lowest point of a planned route.
5. **An embedded DEM is not realistic.** A local tile breaks the ~4 KB allocation cap and the "no literal data in code" and data.jsn ≤ 2-3.5 KB rules (limits.md).

Never label any of these "AGL" without a qualifier.

## 2. Circling wind: method, samples, CPU and memory

**Reference implementation: XCSoar** (`src/Computer/Wind/CirclingWind.cpp`, master):
- It buffers ground-speed and track samples in `boost::circular_buffer<Sample> samples{80}` (hpp L53).
- On each new fix it walks back until the track has turned more than 360°. It requires `n_samples > 8` (L184-192) and an average step of 4 s or less (L243-248).
- Wind speed is the mean absolute deviation of ground speed × π/2 (L283-292). It rejects ≥ 30 m/s (L294).
- Direction comes from an iterative cosine grid search (L298-335). After a good circle it suspends for n/4 samples (L220-221).
- Its comment says that for paragliders, where wind is a large fraction of airspeed, the GPS track rate is not constant, so the roundness gate is skipped (L43-46).

**Circling detection** in `CirclingComputer.cpp`:
- `MIN_TURN_RATE` = 4°/s on a low-pass-filtered turn rate (L14, L76-78, L107-108).
- 15 s to enter circling and 10 s to leave it (`Computer/Settings.hpp` L204-208).

**XCTrack's rule** (xctrack.org/Manual.html):
- Start: at least 90° heading change in 30 s and a 30-s average vario of -0.5 m/s or more.
- End: less than 30° in 30 s and a 30-s average below -0.5 m/s.

**Straight-flight wind needs airspeed.** XCSoar's EKF returns nothing without a real airspeed sensor (`WindEKFGlue.cpp` L44-47; `Computer.cpp` L68). The UltraBip has no pitot, so wind exists only from circling, or possibly from S-turns covering at least 270° [I].

**Recommended estimator (prototype `wind_es5.js`).** A Kåsa algebraic circle fit in ground-velocity space, built from running sums:
- Each sample is a ground velocity (vE, vN), from position differences or UltraBip RMC.
- Accumulate n, Σx, Σy, Σx², Σy², Σxy, Σz, Σxz, Σyz with z = x² + y².
- Once the summed course change reaches 360° (and n ≥ 9, the XCSoar gate), solve the 3×3 normal equations.
- The circle centre is the wind vector (wind "from" = atan2(−wE, −wN)). The radius is about TAS, a free plausibility check (5-16 m/s).
- Blend successive circle results (an EMA, or quality weights like XCSoar's WindStore) and reset the sums.
- No sample buffer is needed. A sliding one-circle window would need a `Float32Array(64)` (256 B) ring.

**Why a velocity-space fit, from position differences** (my synthetic simulation, 300 runs; TAS 9.5 m/s; wind 5 m/s from 270°; 2 m correlated position noise; ±5 % airspeed and ±15 % turn-rate wobble):

| Case | Kåsa on position differences | Kåsa on Doppler velocity | Drift (displacement / time) |
|---|---|---|---|
| 22 s circle at 1 Hz (22 samples) | 0.50 m/s, 6° RMS | 0.08 m/s, 1° | 0.17 m/s, 2° |
| 18 s circle | 0.60, 7° | 0.08, 1° | 0.22, 2° |
| 30 s circle | 0.46, 5° | 0.07, 1° | 0.13, 1° |
| 2 circles | 0.37, 4° | 0.05, 1° | 0.09, 1° |
| 4 m position noise | 1.16, 14° | 0.08, 1° | 0.34, 4° |
| Centring shift (turn rate at 25 % for 4 s) | 0.48, 6° | 0.07, 1° | **1.09**, 3° |
| Only 3/4 of a circle | 0.76, 8° | 0.29, 4° | **2.46**, 16° |

- **Smoothing matters, and only one kind is harmless.** Low-pass filtering the *vector* never moves the circle centre: the wind stays at 5.00 m/s for any time constant. Filtering *scalar speed only* shrinks the result: τ = 2 s gives 4.35 m/s (−13 %), τ = 3 s gives 3.78 m/s (−24 %). A lagged course would rotate the direction [I].
- So do **not** combine `Activity/Current/Speed` with `/Fusion/Heading`, since the smoothing of both is unknown.
- Use position differences, which are linear in the fix, so any position filter keeps the centre. Differencing over 2 ticks reduced the error to 0.38 m/s / 4°. RMC Doppler (u-blox) is the better-quality source when the UltraBip has a fix [I].
- The drift method breaks when the pilot recentres, which happens constantly while centring a thermal.
- The noise model is mine. Real watch GNSS noise is a hardware question.

**Is 1 Hz enough?** Yes. At 18-30 s per circle, 1 Hz gives 18-30 samples, well above XCSoar's more than 8 samples and 4 s maximum step. A 2 s fix interval still gives about 11 samples (0.38 m/s, 4°). The UltraBip GPS also logs at 1 Hz (ultrabip.md table §1).

**CPU [M]/[I]:**
- Per tick: one atan2 for the turn accumulator, about 6 multiplications and 10 additions.
- Per circle: a Cramer solve of about 60 operations.
- Desktop Duktape 2.x measured 1.39 µs per `windStep` call. Even at 100× slower on the watch MCU [I] that is about 0.14 ms per second.
- For scale, the existing byte parser already handles about 700 B/s of LK8EX1 + LXWP0.

**Memory and code [M]:**
- State is a `Float32Array(12)` (48 B + header), or 9-12 module scalars.
- Code is 770 B minified (terser), so main.js grows from 5,668 B to about 6.4 KB. It is already above limits.md's 4 KB guideline, and SPEC §0.1 B7 already uses all **8** module-level functions.
- So fold the wind code into the existing `fly` helper: 769 + about 770 B ≈ 1.5 KB, which is exactly at limits.md's ~1.5 KB per-function guideline. Splitting it is not an option, because all 8 module functions are taken.
- Split the Cramer formula into cofactor temporaries. My Duktape measuring harness (`/tmp/deep-suuntopo-crash-verify/duk/m3`) found compiler recursion depth **30** for the one-expression version. suuntopo-crash.md flagged depth 31 as a stack risk, and R L3303 says crashes during load are most likely stack exhaustion.
- The harness's largest allocation, 3,362 B (1,753 B without line tables), is a 64-bit desktop figure. The watch is 32-bit and should be smaller [I], but splitting the expression also shrinks it.

**FIT and the pilot who turns the watch GPS down.** The same estimator takes UltraBip RMC speed and course (binding decision 3), switched on when `GPSinterval` is above 1 s or no fix arrives. Keep wind in main.js, because FIT logging needs it there.

## 3. Thermal map (snail trail coloured by lift)

**Hard constraint: where it runs.**
- Canvas is template-only (R L1631-1656). main.js cannot pass arrays to the template (14766 #92).
- So the trail buffer lives in template `onLoad` variables. Those persist for the exercise session across laps and screen switches (15320, matram on a Race S, the same pattern with a `Uint8Array(3800)` HR record).
- A template switch through `getUserInterface`/`unload('_cm')` presumably reruns the new template's onLoad and loses the trail [I]. So use **one always-mounted template**, with the map as a page shown by `visibility` or a `uiViewSet`, never a template swap.
- Template evaluation stops while the app screen is not shown: subscriptions are severed on deactivation (R, quoted in 15320). So the trail will have gaps while the pilot looks at other sport-mode screens [I].

**Data path from main.js to the template.** Options, all needing a hardware test:
- **(A) The template reads GPS itself.** A hidden `<eval input="/Fusion/Location/GeoCoordinates.latitude">` (and longitude). The HTML validator accepts these paths, but numeric delivery into the template is unverified. Two callbacks, one per axis, risk pairing lat and lon from different fixes.
- **(B1) main.js does the projection, recommended first.** It outputs `tx`, `ty` (local metres) and a tick counter `tn`, written last.
  - The template uses hidden `<eval>` script-formatter bindings: the climb-logger pattern, framework-managed and leak-free, per refresh-rate.md.
  - Avoid `$.subscribe` on Zapp outputs: 15320 reports the output channel severed after an overlay.
  - The template appends a point on the `tn` callback, using cached `tx`, `ty` and the `av` output for colour.
  - If the callback order inside one evaluate is wrong, the worst case is a one-sample skew: about 10 m at 10 m/s, about 6-8 px at 0.6-0.75 px/m.
  - Outputs go to about 16 of 20 (v0.1 has 10).
- **(B2) One packed output per tick** removes the skew. Example: Δx and Δy in 0.25 m steps over ±128 m (10 bits each) plus a 2-bit sequence number, kept under 2²⁴ in case outputs are float32. The sequence number makes every tick change the value, because evals fire only on change, and it reveals missed ticks.

**Projection [I].**
- Equirectangular around an origin set at the first fix: y = Δlat_e7 × 0.0111195 m, x = Δlon_e7 × 0.0111195 × cos(lat0). Distortion is far below 1 % within ±20 km.
- Re-centre past ±30 km by subtracting from the buffer.
- Draw north-up, centred on the newest fix: sx = cx + (x − xn)·s, sy = cy − (y − yn)·s.
- With s = 0.6-0.75 px/m, a 300 px canvas shows about ±200-250 m, about 6-12 recent circles.
- Heading-up costs 4 more multiplications per point. The unit cost of `ctx.rotate` is unknown.

**Storage per buffer.** Keep each buffer at or under 2 KB, the dependable size under memory pressure; the hard cap is about 4,000 B (limits.md). Allocate once in template onLoad.

| Layout | Bytes per point | N = 180 (3 min) | N = 240 (4 min) | Note |
|---|---|---|---|---|
| `Float32Array(2N)` x,y + `Uint8Array(N)` colour bucket | 9 | 1,440 + 180 B | **1,920 + 240 B** | Recommended |
| One interleaved `Float32Array(3N)` (x, y, vario) | 12 | 2,160 B | 2,880 B (over 2 KB) | The reference's one-buffer advice (R L949-960) only holds up to the cap |
| `Uint8Array` with manual int16 x,y + colour byte | 5 | 900 B | 1,200 B (N = 400 → 2,000 B) | `Int16Array` is unverified (limits.md T9). DataView in the template is unknown. |
| Thermal markers (x, y, mean climb, gain) × 32 | — | 512 B `Float32Array(128)` | — | Lets a whole-flight "thermal map" show past thermals as cheap 2-lineTo crosses |

The prototype reports 8,478 B "retained" for the whole trail module. That is a 64-bit harness total including compiled code. On the watch the data cost is the 1,920 + 240 B typed arrays plus headers.

**Render budget, per canvas per frame.**
- matram on a Race S (15279): 24 lineTo per path or fewer, and 2 × strokes + lineTo ≤ about 200. 181 segments drawn in chunks of 20 work; 182 give a black canvas.
- suuntopo-crash.md rule: count units in code and cap at about **150**.
- In my prototype (`trail_es5.js`, newest-first, same-colour runs in one path, ≤ 20 lineTo per path, 6 colour buckets) a 150-unit cap draws:
  - constant colour: 136 segments (7 paths);
  - realistic thermal colouring: 94 segments (28 paths);
  - colour changing every second: 50 segments.
- **Batching by colour bucket** (one path chain per bucket, with moveTo jumps): about N + 2·(N/20 + 6) units, so about 120 segments whatever the colour pattern, *if moveTo is free*. If moveTo costs 1 unit, the worst case falls to about 70. Untested.
- Colour from a 3-5 s average vario with hysteresis, to lengthen same-colour runs.
- Pre-pass backwards from the newest point summing the cost until the cap, then draw oldest to newest from there. This keeps the newest segment on top, and overflow drops the oldest segments instead of blacking out the canvas.
- Cull segments outside the canvas rectangle (whether off-canvas drawing counts is unknown, suuntopo-crash test 2).
- Skip points that moved less than about 3 px on screen.
- Two tiled canvases double the budget (matram) but also double the surface memory and the WBMAIN load. Stagger them.

**Store about 180-240 points, draw about 100-140 per frame.**

**Canvas size.** climb-logger reports a full-face canvas allocating about 217 KB, which equals 466 × 466 × 1 B. They blamed it for evicting co-apps and later partly retracted that, since ZoneSense ships a full-face canvas (secondhand). The Race S is tighter and unmeasured. Use about **240-300 px** (roughly 58-90 KB of surface [I]). The unit budget is per canvas regardless of size.

**Redraw cadence: is every second safe?** Likely yes [I, strong]:
- matram refreshed 2 canvases at about 10 Hz on a Race S (15279 #0).
- WBMAIN `pool id:0 full (120/120)` appeared only with 3 canvases refreshed at once at 10 Hz, and staggering fixed it (#3, #5).
- ZoneSense refreshes on `setInterval(...,2000)` plus on change (climb-logger, secondhand).
- So use one `control('#map','REFRESH')` per new point, only when the view is active and the point changed. No Tick10hz is needed.
- The build function must not allocate: declare all loop variables at load time, as matram warns.
- Desktop Duktape cost: about 0.3 ms per frame for 240 points [M]. Even at 100× slower that is about 30 ms [I].
- Template XML: q is 4,695 B of the 5,000 B budget now. The trail code is about 1.06 KB minified plus the canvas element, so expect about 6-7 KB. Clean runs elsewhere: omunoz 6,379 B on a Race 2 with 2 apps, climb-logger 12,289 B on a Vertical 2 with 3 apps. The Race S needs an H10-style test.

## 4. FIT logging

**Rules:**
- At most 5 logged outputs (R L101, L2067). The validator allows 6 (`lib/ng/limit.js` `MAX_LOGGED_OUTPUTS=6`, also `MAX_RESOURCES_OUT=20`, `MAX_SUMMARY_OUTPUTS=8`).
- Values are stored after each evaluate, only when they changed (R L2067).

**What the watch already logs.** The native FIT already holds the GPS track, speed and altitude. So the post-flight track, the height above take-off and a vario recomputed from altitude can all be rebuilt without app slots [I]. Spend the slots on what only the app knows.

**Proposed log set (5):**

| Output | Unit | Format |
|---|---|---|
| `vs` (BLE vario) | m/s | `VerticalSpeed_Fourdigits` |
| `ws` wind speed | m/s | `Speed_Fourdigits` (R L6650) |
| `wd` wind "from" | rad | `CompassHeadingDeg_Fourdigits` (R L5937; expects rad). The graph jumps at 0/360. |
| `tg` current-thermal gain | m | `Altitude_Fourdigits`. 0 or undefined outside thermals, so each thermal shows as a ramp |
| `src` link state | — | — |

- Drop `bat` (move "vario battery at end" to the summary).
- Drop `alt`: native altitude is logged, and the difference is only calibration.
- Drop `av`: it can be recomputed from `vs`.
- Test whether a **6th** logged output is actually recorded on a Race S. If it is, add `av` or `alt`.
- Wind updates once per circle, so it graphs as steps. Set it undefined when stale.

**Summary.** It has 5 entries now (c, a, f, g, l); the hard limit is 8 and the practical limit is about 4-5 (R L2081). Candidates: mean or max wind, mean climb in thermals (total gain ÷ circling time), and % time circling. If space is tight, replace link %.

## 5. New hardware tests

| # | Test |
|---|---|
| W1 | main.js `input.lat`/`lon` each tick: count duplicates and skips; read `GPSinterval` and the `GeoAccuracy` units. |
| W2 | `/Fusion/Heading`, computed course and `/Fusion/Compass/Heading` while walking circles, including `IsCompass` around 2 km/h. |
| W3 | `Activity/Current/Speed` smoothing against position-difference speed (it decides the wind-input choice). |
| W4 | Hidden-eval channel: does it fire every tick, in what order within one evaluate, after a lap overlay, and while another screen is shown? Are outputs float32 or double (for B2 packing)? |
| W5 | Does a template subscription or eval on `GeoCoordinates.latitude` deliver numbers? |
| W6 | Canvas unit cost of `moveTo` and `strokeStyle` (extends limits.md T8 / suuntopo-crash test 3); whether off-canvas drawing counts. |
| W7 | A 300 px canvas versus full-face with 2 apps for 2 h: look for `relMemCb (exec. ui)`, JsTotMem and WBMAIN pool. |
| W8 | Template onLoad trail survives laps and screen switches on a Race S; is it lost on a template swap? |
| W9 | Is the 6th logged output recorded? |

## Sources (local)

- SPEC: `SUUNTOPLUS-SENSORS/docs/ble_vario/SPEC.md` §0.1 B3/B4/B7, §3, §7.4, §8.3, §9.2, §12.
- Deep dives: `docs/research/deep-dive/limits.md` (4 KB cap, 2 KB dependable, Int16 unverified, 8 module functions, 5 KB template); `refresh-rate.md` (1 Hz, hidden-eval pattern, 15320 conflict); `suuntopo-crash.md` (150-unit cap, moveTo and off-canvas unknowns, recursion depth 31).
- Reference lines: L101, L133, L281, L515, L522, L574, L630, L655-664, L726, L937, L949-960, L1044, L1631-1656, L2067, L3303, L5935-5941, L6644-6656.
- Tools: `lib/project/resource-common.js`, `lib/resource/data-source-watch.js` (heading in rad; lat/lon as Math.trunc(1e7·deg)), `lib/resource/weather.js`, `lib/ng/limit.js`.
- Cached forum dumps: `/tmp/deep-refresh-rate-verify/t15279.txt`, `/tmp/deep-refresh-rate-verify/t15320.txt`, `/tmp/deep-refresh-rate-verify/src/climb_UI_PLATFORM_KNOWLEDGE.md` §3-§4.

## Sources
- PROJECTS/SUUNTOPO/reference/suuntoplus_reference_docs.md — SuuntoPlus reference: L101/L2067 max 5 logged outputs; L133 10 inputs, a nonexistent path stops loading; L281 Activity/Current/Speed; L515/L522/L574/L630 Fusion/Altitude family; L655-664 GeoCoordinates int32 deg×1e7; L726 route MinAltitude; L949-960 typed arrays; L1044 evaluate 1 s ±5 ms; L1631-1656 canvas API; L3303 stack crash at load; L5935-5941 CompassHeading formatters in rad
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/lib/project/resource-common.js — watchResources whitelist (238 paths): /Fusion/Heading, /Fusion/Heading/IsCompass, /Fusion/Compass/Heading, GeoCoordinates.latitude/.longitude, GeoAccuracy, GPSinterval, Weather/Current.wind*; no terrain path
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/lib/resource/data-source-watch.js — Simulator: fusion/heading and compass/heading in rad 0..2π, IsCompass true, lat/lon as Math.trunc(1e7·deg), GPSinterval returns 1
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/lib/ng/limit.js — MAX_RESOURCES_IN=10, MAX_RESOURCES_OUT=20, MAX_LOGGED_OUTPUTS=6, MAX_SUMMARY_OUTPUTS=8
- PROJECTS/SUUNTOPLUS-SENSORS/docs/research/deep-dive/limits.md — ~4 KB allocation cap, 2 KB dependable size, Int16Array unverified (T9), ≤8 module functions, ≤5 KB template, canvas ~200 units
- PROJECTS/SUUNTOPLUS-SENSORS/docs/research/deep-dive/refresh-rate.md — 1 Hz display ceiling; hidden-eval pattern; the 15320 conflict on subscribing to outputs; WBMAIN limits
- PROJECTS/SUUNTOPLUS-SENSORS/docs/research/deep-dive/suuntopo-crash.md — Cap ~150 units counted in code; moveTo and off-canvas costs unknown; compiler recursion depth 31 as a stack risk
- PROJECTS/SUUNTOPLUS-SENSORS/docs/ble_vario/SPEC.md — Current spec: v0.1 main.js 5,668 B with 8 module functions (B7), template 4,695 B, RMC parsing (B3/B4), logged outputs (§9.2), flight detection (§8.3)
- https://forum.suunto.com/topic/15279 — matram, Race S: ≤24 lineTo per path, 2×strokes+lineTo ≤ ~200 per canvas, 181 segments OK / 182 black; tiling; WBMAIN pool full with 3 canvases at 10 Hz (cached /tmp/deep-refresh-rate-verify/t15279.txt)
- https://forum.suunto.com/topic/15320 — uiView lifecycle: onLoad vars persist all session; subscriptions and the Zapp output channel are severed on the 2nd onActivate; Uint8Array(3800) trail pattern in template (cached t15320.txt)
- https://forum.suunto.com/topic/14766 — matram #92: no method of passing an array from main.js to the UI
- https://forum.suunto.com/post/197459 — Szmigiel (Gustin developer): fused direction is compass when stationary, GPS above ~2 km/h
- https://github.com/ayamshanov/AnchorAlarm-for-Suunto — Public app using Fusion/Location/GeoCoordinates.latitude/.longitude and Fusion/Compass/Heading as main.js inputs; changelog v0.3 fixed the invalid GPS resource path
- https://github.com/surfboomerang/SuuntoPlusApps/tree/main/VMG_VMC — Public VMG/VMC app: /Fusion/Heading as course over ground, /Fusion/Compass/Heading to point at the wind, Activity/Current/Speed
- https://github.com/aaroM2303/HexHunterForSuunto — Template-only GPS via /Navigation/Gps/Coordinates/Full string + split/parseFloat, canvas REFRESH per fix (allocating; hardware unconfirmed)
- https://github.com/XCSoar/XCSoar/blob/master/src/Computer/Wind/CirclingWind.cpp — Circling wind: 80-sample buffer, n>8 per full circle, ≤4 s step, amplitude ×π/2, cosine-fit direction, reject ≥30 m/s, paraglider note on track-rate roundness
- https://github.com/XCSoar/XCSoar/blob/master/src/Computer/CirclingComputer.cpp — MIN_TURN_RATE 4°/s on a smoothed turn rate; circling thresholds 15 s / 10 s (Computer/Settings.hpp L204-208)
- https://github.com/XCSoar/XCSoar/blob/master/src/Computer/Wind/WindEKFGlue.cpp — EKF (straight-flight) wind requires real airspeed
- https://xctrack.org/Manual.html — XCTrack thermalling detection: ≥90° heading change in 30 s and 30-s avg vario ≥ -0.5 m/s; end <30° in 30 s
- https://ns.suunto.com/Manuals/Suunto_Race_S/Userguides//Suunto_Race_S_UserGuide_EN.pdf — Race S user guide: FusedSpeed only for running-type activities (§3.16); FusedAlti default in GPS exercises (§3.17); four battery modes
- https://www.suunto.com/Support/Product-support/suunto_spartan_sport/suunto_spartan_sport/features/gps-accuracy-and-power-saving/ — GPS accuracy: Best ~1 s full power, Good ~1 s low power, OK ~60 s
- (a scratch folder, not kept) — My prototypes and measurements: windsim.js/windmc.js/windmc2.js (Monte Carlo), smooth.js (filter bias), wind_es5.js and trail_es5.js (ES5 prototypes), bench2.js (Duktape timing and unit counts)
