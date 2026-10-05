# ble_vario: XC feature addendum

Derived from docs/research/xc-features/. Requested by the user on 2026-10-03: altitude, AGL, lift/sink, speed, wind estimate, thermal map; XCSoar/XCTrack-informed fields for hike-and-fly and XC.

**Implementation status (2026-10-04): MVP-A is implemented as v1.1** (SPEC §0.1.9: code in `src/ble_vario/` main.js hooks plus the XC engine `ext6.js`-`ext9.js`; tests X1-X8 in `test/ble_vario/run.js`). Hardware gates W1, P1, G1/H10b, H12, W9 and F1 are still open. Departures from this addendum, forced by the 5,000-B template check and the 1.9-KB block rule, are listed in SPEC §0.1.9: TO/ST in the A2 slot and L/D in C2 on GLIDE; the big number stays the vario on HIKE (UP in A1, AVG in C2, no GPS-status or exercise-time field); the wind line reads `WIND 270° 18 km/h` with no head/tail component and no dimming (gone after 30 min); the vario GPS line became text (`GPS 245° 35 km/h`) and the outputs `gs`/`hd` were dropped; the classic page setting loads no XC engine. Memory: automatic pages 31.8 KB steady and a 38.2 KB exercise-start peak against the binding 10 / 12 KB budget (classic page 21.5 / 27.6 KB); the price of each part is in SPEC §0.1.9. MVP-B (the map) is not started.

**XC review round (2026-10-04, SPEC §0.1.10).** Three reviews of v1.1; every finding was reproduced first. Fixed: ext files no longer call `evalFile` (main.js compiles ext6-9.js); heights, max height and total climb stay on one altitude basis across vario/watch switches; the circling direction follows a reversal; sparse fixes and GPS dropouts no longer flap the page (the circling state counts only with 3 or more velocity samples, otherwise the vario thermal state, as §1.2 says); TC is exact from its first value; max above take-off covers every flight; a pause adds no climb; a take-off within 2 minutes of a landing (a false landing while hovering) keeps the flight's references and wind; a missing altitude keeps the wind; the fitted airspeed must be at least 7 m/s; the wind line shows its age from 5 minutes (`29' 270° 18 km/h`, §3.6) and `WIND CALM` below 1.5 m/s; HIKE's bottom line is `SUNSET IN 10h45` text; C2 values stay within 4 characters. **The classic page is now the store default** (setting `pg` "2"): the automatic pages compile the engine at the exercise start, 38.6 KB est32 against about 32 KB usable on a Race S, and wait for gate G1 (HARDWARE_TEST X4). With the fixes the automatic pages are 33.3 KB steady (+1.5 KB). **MVP-B (the map) is not implemented: the headroom it needs does not exist (§6.3).**

## Key points
- Pages switch automatically by flight phase, with no button overrides, so up (pause), down (lap) and middle (native display cycling) stay native. HIKE on the ground, GLIDE when airborne, THERMAL when circling and the 30-s average is at least -0.5 m/s (XCTrack's gate), with a 20-s minimum dwell. One always-mounted template uses visibility groups; colour comes from pre-built variants, because runtime setStyle is proven only for visibility. Manual override (long press on up with no onClick) is Later, behind hardware test P2.
- Always-visible set on airborne pages: instant vario, altitude with its ALT/QNH/QNE label, and link status. GLIDE adds ground speed, L/D over ground (only while sinking), height above take-off or exercise start, and wind with head/tailwind. THERMAL adds the 10-s average, gain, current-thermal average and wind, plus the map. HIKE shows ascent rate in m/h, altitude, exercise time and time to sunset.
- True AGL is impossible: none of the 238 whitelisted paths gives terrain. The field shows height above take-off (TO) or above exercise start (ST, about height above landing for hike-and-fly) and is never labelled AGL. Wind exists only from circling (no pitot; XCSoar's EKF and XCTrack likewise need a circle or real airspeed).
- Wind: a sliding-window Kasa circle fit in ground-velocity space over the last full turn (centre = wind vector, radius = airspeed estimate). Velocity comes from raw watch position differences, never fused speed plus heading. Gates: at least 9 samples, steps of 4 s or less, radius 5-16 m/s, wind 25 m/s or less, RMS residual 1.5 m/s or less, roundness. The store is XCSoar's quality x age x height weighting with 8 entries, reset at take-off. Measured: 1,101 B minified.
- Circling detection is measured on velocity minus its last-10 mean (the wind cancels exactly), with the XCSoar rate (4 deg/s, EMA 0.3), at least 8 s of turning and 225 deg swept, a 4.5 m/s noise gate, and a 10-s exit. In my simulations THERMAL appears after about 0.9 of a circle (16/20/27 s for 18/22/30-s circles). Straight glides at 2/4/6 m GPS noise, S-turns and ridge reversals gave zero false circling. A 3 m/s gate gave 109-211 false ticks at 4-6 m noise.
- Wind accuracy in my simulations (1 Hz, 2 m correlated noise, wobble): first estimate 0.37 m/s and 4.3 deg RMS; displayed after about 4 circles 0.15 m/s and 2.0 deg. With wind stronger than airspeed (W/V 1.21): 100/100 valid, 0.21 m/s, 0.7 deg. This is consistent with the feasibility sim's 0.50 m/s and 6 deg per estimate. The noise model must be re-fitted from watch data (W1).
- Thermal map: a 240-point ring in the template (1,920 + 240 B), fed by per-tick outputs tx/ty (absolute metres) and tn (tick*8 + lift bucket) through hidden eval script formatters. It uses equirectangular metres, north-up, a radius setting of 75/115/190 m, and points shifted by wind x age (XCTrack Classic). Seven fixed brutto buckets use XCSoar VARIO_2 hex colours with grey for neutral, from a 3-s vario with 0.15 m/s hysteresis. One REFRESH per new point, only while the map page is active.
- Canvas budget is counted in code: cap 150 units including moveTo, at most 20 lineTo per path, segments decimated by age (stride 1/2/4), a newest-first pre-pass and an oldest-first draw pass. On a mock canvas the maximum was 148 units per frame, with 122/70/39 segments for constant / thermal-like / every-second colour changes. Template JS is 2,116 B minified and was tested against undefined outputs.
- FIT logs vs, av, ws (Speed_Fourdigits), wd (CompassHeadingDeg_Fourdigits, rad) and src. alt and bat are no longer logged, since the native FIT has altitude, track and speed. Summary order: flight time, max altitude, max height above take-off, best climb, total climb (3 m hysteresis), best gain, vario link; the practical limit is 4-5 (H12). data.json grows to 118 B with inline-enum settings pg/hr/ms/md/lc; number settings are deferred.
- Code size is the gating risk. main.js grows from 5,672 B to about 9.2 KB and the template from 4,695 B to about 10 KB with the map. The 8-module-function limit is kept by merging fmt+avg and inlining loadExt. Gates: H10 on v0.1, then the H10b headroom probe (cold code spread across helpers, not one big function), then the real-L2 template probe. Cut orders are given for both.
- MVP-A (v0.2) is numbers and wind with no canvas: inputs lat/lon after probe W1, ground speed, height above TO/ST, L/D, circling, wind text, thermal stats, automatic pages. MVP-B (v0.3) is the thermal map, gated on W4/W6/W7/W8 and the template probe. Later: manual override, thermal-core marker, netto, landing-elevation features, wind from vario RMC, alarms.

# ble_vario feature addendum: flight pages, computed metrics, wind and thermal map

Status: draft, 2026-10-03, for v0.2 (MVP-A) and v0.3 (MVP-B). It extends `docs/ble_vario/SPEC.md`. For the features it covers, this addendum replaces SPEC §1-§18. SPEC §0.1, the binding decisions and the `deep-dive/` rules still win on every platform question.

## 0. How to read this

| Tag | Source |
|---|---|
| [xcsoar] | XCSoar deep-dive report. XCSoar `master` at `b252ae6` (2026-10-02); `file:Lx` is XCSoar source |
| [xctrack] | XCTrack and watch-apps report; `#n` = `gitlab.com/xcontest-public/xctrack-public/-/issues/n` |
| [hfxc] | Hike-and-fly and XC metrics report |
| [feas] | Race S feasibility report (prototypes in `scratchpad/feas/`) |
| [sim-A] | My simulations for this addendum, in the scratchpad: `addsim_final.js` (wind, 100 runs per case), `addsim_first.js` (single-estimate error), `addsim_lat_final.js` (latency, 50 runs), `trailsim.js` (render budget on a mock canvas). Sizes are terser output from the editor's own `node_modules/terser`. |
| SPEC §x | `docs/ble_vario/SPEC.md` |
| R Lnnn | `SUUNTOPO/reference/suuntoplus_reference_docs.md` |
| limits / refresh / crash | `docs/research/deep-dive/limits.md`, `refresh-rate.md`, `suuntopo-crash.md` |
| gaps Lnnn | `SUUNTOPO/docs/research/suuntopo-gaps.md` |

Labels:
- **(design)** = a decision made in this addendum.
- **(estimate)** = a byte or pixel number not yet measured on the watch.
- **(unverified)** = needs the named hardware test (Appendix B).

### 0.1 Decisions

| # | Decision | Basis |
|---|---|---|
| A1 | Pages switch **automatically** by flight phase. The template has no `<userInput>`, so pause, lap and display cycling stay native. | gaps L165-166; SPEC D3; [xctrack] §4.1 |
| A2 | **One always-mounted template.** A page is a visibility group. There is never a template swap. | [feas] §3 (a swap loses the trail); refresh L11, L17 |
| A3 | The "AGL" field is height above **take-off** or above **exercise start**, labelled `TO` / `ST`. It is **never** labelled AGL. | No DEM among the 238 whitelisted paths [feas] §1; [xcsoar] §1.2 |
| A4 | Ground velocity comes from **watch position differences** (new fix only, divided by elapsed ticks). The fused speed is used only for the displayed GS. Wind is never computed from `Activity/Current/Speed` + a heading. | [feas] §2 (scalar smoothing gives −13 / −24 %); [xcsoar] §2.6 (+32-40° with smoothed GS) |
| A5 | **Circling** = the ground velocity turning around the mean of its last 10 samples. A step counts only when \|v − mean\| > 4.5 m/s. Turning means ≥ 4°/s on an EMA (α 0.3). Circling starts after ≥ 8 s of turning **and** ≥ 225° swept, and ends after 10 s without turning. | [xcsoar] §4 + [sim-A] (§3.2) |
| A6 | **Wind** = sliding-window Kåsa circle fit in velocity space over the last full turn, with gates, an XCSoar-weighted 8-entry store, and a reset at take-off. | [xcsoar] §2.6, [feas] §2, [sim-A] |
| A7 | **Thermal map**: a 240-point ring owned by the template, fed by the per-tick outputs `tx`/`ty`/`tn`. It uses 7 lift colours and a 150-unit cap counted in code. Points drift with the wind. | [feas] §3, crash L25, [xcsoar] §3.4, [xctrack] §2.2 |
| A8 | **FIT** logs `vs`, `av`, `ws`, `wd`, `src`. `alt` and `bat` are no longer logged. | R L2066; [feas] §4 |
| A9 | **Summary** has 7 entries, ordered so that truncation drops the least useful. | R L2081 |
| A10 | Two stages: **MVP-A** (numbers and wind, no canvas), then **MVP-B** (the map). Code size is the gating risk (§6). | SPEC B7; limits L28-29 |

---

## 1. Pages and how the pilot switches between them

### 1.1 Switching without disturbing pause and lap

- **Race family buttons:** up = pause/resume, down = lap, middle = native display switching. The long presses may be activity change, control panel or previous display (gaps L165-166). Any `<pushButton>` in the template takes that button away from the pilot while the app view is shown (gaps L333; SPEC D3, §5).
- **So the template has no `<userInput>`.** The app picks the page itself from the flight phase. XCTrack, My Vario and Flightmeter all switch to the thermal view automatically, and gloved pilots should not press buttons in a thermal ([xctrack] §4 item 1).
- **The app is one display** in the sport-mode carousel. The middle button still cycles to native Suunto displays (for example the native map) and back. Pause and lap stay native on every page.
- **The setting `pg`** (§5) restricts the automatic set: hike, glide and thermal; glide and thermal only; or the classic v0.1 single page.
- **Manual override is "Later", behind test P2.** The candidate is `<pushButton name="up" longPressDuration="2" onLongPress="$.put('/Zapp/{zapp_index}/Event', 7, null, 'int32')"/>` with **no** `onClick`. `onLongPress` fires on release once the duration is reached; the default is 2 s and it must exceed 0.6 s (R L1849-1863). Ship it only if a short press on up still pauses on a Race S.
  - A touch alternative is `onTap` on a full-screen element, or a pannable `uiViewSet` (R L1756-1780). It can only ever be an extra: Touch must be switched on per exercise and is often off (store.md L238; forum-projects L159), and it does not work with gloves.

### 1.2 Page state machine (in `ui`, once per evaluate)

Inputs:
- `air`: the v0.1 flight state (SPEC §8.3).
- `cs`: the circling state (§3.2): 0 cruise, 1 possible, 2 circling, 3 possible cruise.
- `a30`: the 30-s average climb from the v0.1 ring.
- `thIn`: the v0.1 thermal state (SPEC §8.4).
- `gpsOk`: a velocity sample arrived within the last 4 ticks. v1.1 since the XC review (algorithms P1-3): a fix within the last 4 ticks **and** at least 3 velocity samples in the window (the circling state needs them); a gap of more than 4 ticks empties the window and turns circling into "possible cruise" with a fresh 10-s grace, so `thIn` drives the page until 3 new fixes arrived. Before the fix, fixes every 5 s gave no THERMAL at all and 6-60-s fixes flapped the page 9-25 times in 5 minutes.
- `pgT`: the tick of the last page change.

| From | To | Condition |
|---|---|---|
| any | HIKE | not airborne and `pg` = 0 |
| any | GLIDE | not airborne and `pg` = 1 |
| HIKE | GLIDE | take-off detected (SPEC §8.3) |
| GLIDE | THERMAL | `gpsOk ? (cs >= 2 && a30 >= -0.5) : thIn` |
| THERMAL | GLIDE | `tk - pgT >= 20` **and** `(gpsOk ? (cs === 0 \|\| a30 < -1.0) : !thIn)` |
| airborne | HIKE or GLIDE | landing (SPEC §8.3) |

- **`pg` = 2 (classic):** the v0.1 single page, never switched.
- **The −0.5 m/s entry gate** is XCTrack's rule ([xctrack] §2.2). It keeps a spiral or circling in sink on GLIDE, where the vario is largest. Exit at −1.0 m/s (design) gives hysteresis.
- **`cs` = 3 still counts as circling**, so XCSoar's 10-s exit grace applies ([xcsoar] §4). The 20-s minimum dwell (design) stops flapping when the pilot is searching.
- **THERMAL appears about 0.9 of a circle after the turn starts.** That is 16 / 20 / 27 s (median) for 18 / 22 / 30-s circles, and it does not depend on the wind [sim-A]. For comparison, the XCSoar code waits 15 s of turning (`Settings.hpp:L199-209`), and its manual says "about three quarters of a turn" (`ch05:L26-31`) ([xcsoar] §0).
- **Without a velocity source**, the v0.1 vario rule `thIn` drives THERMAL. That covers the watch GPS being off with no RMC, and the BlueBip. The map shows NO GPS.

### 1.3 Mechanism

- **Two layout containers in one template:** `#L1` (numbers) and `#L2` (map). Each page is "which container is visible" plus the slot texts.
- **Visibility** uses `setStyle('#L1 *', 'visibility', ...)` from main.js. Visibility is the only runtime style proven on hardware (refresh L11, L17; SPEC B6).
- **Slots:**
  - Labels and app-formatted values are written with `setText`. Labels come from the `TXT` table, which is split once in onLoad (SPEC B8).
  - A page change forces a full push, as any visibility change already does (SPEC I1).
- **Colour never depends on `setStyle(..., 'color')`.** Every coloured value has pre-built variants with static classes (`c-green`, none, `c-red`, `cm-mid`). main.js makes one variant visible and writes `setText` to it (refresh L17, L222). Every "green / red / dim" below means this.
- **String budget:** at most 6 short strings per tick (design; v0.1 allowed 3), each built only when its displayed integer changed.

### 1.4 Layout geometry

All geometry is for q (466 px) and is an estimate. Positions are in % so that n and o scale, and each one needs a simulator screenshot (Appendix B, S8).

The chord half-width at y is √(233² − (y − 233)²). Digit width is about 0.42 em (SPEC I1).

**L1 "numbers"** (HIKE, GLIDE, and THERMAL without the map). It reuses the v0.1 rows (SPEC I1):

| Id | Role | Left / centre | Y % (q px) | Class | Mechanism |
|---|---|---|---|---|---|
| `s0`/`s2`/`r*` | status: VARIO / WATCH BARO / link reason | centre | 5 % (≈34) | `sp-t-s`, static colours | v0.1 |
| `a1l` / `a1v` | slot A1 label / value | left 15 % | 17 % (79) / 26 % (121) | `sp-t-s cm-mid` / `sp-d-s f-num` | setText |
| `bt` | vario battery % | centre | 17 % | v0.1 | eval (v0.1) |
| `a2l` / `a2v` | slot A2 | left 62 % | 17 % / 26 % | as A1 | setText |
| `vn`/`vi` ×3 variants | BIG value | centre | 50 % (233) | `sp-d-xxl` / `sp-d-xl` | setText (v0.1) |
| `vu` | BIG unit | right of BIG | | `sp-t-s cm-mid` | setText per page |
| `ll` + `al` | C1: ALT/QNH/QNE + altitude | label centre 13 %, value centre 32 % | 76 % (354) | `sp-t-s cm-mid` / `sp-d-xs f-num` + postfix | v0.1 eval `Output/alt`, moved left |
| `c2l` / `c2v` | slot C2 | label 55 %, value centre 75 % | 76 % | `sp-t-s cm-mid` / `sp-d-xs f-num` | setText |
| `d0` / `d1` | line D, normal / dim | centre | 89 % (415) | `sp-t-s` / `sp-t-s cm-mid` | setText |
| `lf` + `ft` | FLT + flight time | | 89 % | v0.1 | eval (v0.1) when D is empty |
| `hT` | exercise time (HIKE only) | at C2 | 76 % | `sp-d-xs f-num` | `<eval input="/Activity/Move/-1/Duration/Current" outputFormat="Duration_FourdigitsFixed">` (R L1610) |
| `hS` | time to sunset (HIKE only) | at D | 89 % | `sp-t-s` | `<eval input="/Outdoor/Sunset/ETE" outputFormat="Duration_Fixed" default="--">` (R L829) |

Fit checks on the C row (y 354, chord x 29-437):
- "12345 ft" at 46 px ≈ 132 px, centred at 150 → 84-216.
- C2 "+1234" ≈ 97 px, centred at 350 → 301-399.
- The C2 unit goes in its label ("TO m" / "TO ft").

**L2 "map"** (THERMAL with the map):

| Id | Role | Centre (q px) | Class | Mechanism |
|---|---|---|---|---|
| `s0`/`s2`/`r*` | status | 233, 34 | as L1 | v0.1 |
| `vt` ×3 variants | vario (green / neutral / red) | 233, 100 | `sp-d-xl f-num` (118 px) | setText |
| `g1l`/`g1v` | AVG label / value | 60, 233 / 60, 265 | `sp-t-s cm-mid` / `sp-d-xs f-num` | setText |
| `g2l`/`g2v` | GAIN (unit in the label) | 406, 233 / 406, 265 | same | setText |
| `g3l`/`g3v` | TC (current-thermal average) | 70, 308 / 70, 340 | `sp-t-s cm-mid` / `sp-b-s f-num` | setText |
| `g4l`/`g4v` (+ dim variant) | WIND: speed, with from-bearing in the label | 396, 308 / 396, 340 | same | setText |
| `map` | `<object type="canvas" build="ctx => build(ctx)">` 230 × 230 px (49 % × 49 %) | 234, 269 (x 119-349, y 154-384) | | template (§4) |
| `ng` | "NO GPS", over the map | 233, 269 | `sp-t-s cm-mid` | visibility |
| `al2` | ALT + altitude | 233, 419 | `sp-d-xs f-num` + label | eval `Output/alt` |

Fit checks:
- The map is drawn as a circle of radius 115 centred 36 px below the display centre: 36 + 115 = 151 < 233.
- G1 "+1.8" at 46 px ≈ 77 px → x 21-99, left of the map edge at 119.
- G2 "1234" → 368-444, inside the chord (2-464 at y 265).
- G3/G4 at y 340 (chord 26-440): the 29-px values fit in the 93-px gutters.
- `vt` "+2.3" ≈ 198 px → 134-332, inside the chord at y 100 (42-424).
- The bottom ALT row at y 419 has chord 91-375.
- These glyph boxes are estimates: SPEC I1 notes the build adds 52 px of top padding to `sp-d-xxl` on q.

### 1.5 Page contents, priority (1 = flight-critical) and colour

**GLIDE** (airborne, not circling; layout L1)

| Slot | Field | Prio | Format (metric / imperial) | Colour |
|---|---|---|---|---|
| status | link: VARIO / WATCH BARO / reason | 1 | v0.1 | VARIO green, WATCH BARO orange, LINK LOST red (v0.1) |
| BIG | instant vario | 1 | `+2.3` m/s / `+470` ft/min (SPEC §4.6) | green ≥ +0.2; red ≤ sink threshold `sk`; else neutral (SPEC §4.6) |
| C1 | altitude, labelled ALT / QNH / QNE | 1 | native `Altitude_Fivedigits` | neutral |
| C2 | height above take-off (`TO`) or exercise start (`ST`), per setting `hr` | 2 | signed integer m / ft | neutral (green-above / red-below variants are Later, as in XCTracey [xctrack] §3) |
| A1 | GS: ground speed | 2 | integer km/h / mph | neutral |
| A2 | L/D over ground | 2 | ≥ 10 integer, < 10 one decimal; `--` unless sinking > 0.3 m/s and GS > 3 m/s | neutral; `--` when not valid ([xctrack] §2.3: show glide only while sinking) |
| D | wind `270° 18 km/h HW12`; if no valid wind: NO GPS FIX when there is no velocity source, else FLT time | 3 | from-bearing, speed, head (+) / tail (−) wind component | normal when < 5 min old; dim (`d1`) 5-30 min old, with the age `7'` in place of HW; never `0`/`N` ([xctrack] #713) |

**THERMAL** (circling; layout L2, or L1 when the map is off or there is no GPS)

| Slot (L2 / L1) | Field | Prio | Format | Colour |
|---|---|---|---|---|
| status | link | 1 | v0.1 | v0.1 |
| `vt` / BIG | instant vario | 1 | as GLIDE | as GLIDE |
| `al2` / C1 | altitude | 1 | native | neutral |
| G1 / A1 | AVG: average climb, window `aw` (10 s default) | 1 | signed m/s, ft/min | neutral |
| G2 / A2 | GAIN in this thermal (v0.1) | 2 | integer, unit in the label | neutral in a thermal; dim after it (v0.1) |
| G3 / C2 | TC: current-thermal average = gain ÷ time in thermal | 2 | signed m/s; `--` for the first 10 s | neutral (green when above the last thermal is Later) |
| G4 / D | WIND speed + from-bearing (L1: `IN 1'45 270° 18`) | 3 | km/h / mph | fresh / dim / `--` as GLIDE |
| map | track coloured by lift, glider chevron, wind arrow (downwind), north tick | 2 | §4 | §4.3 |

**HIKE** (on the ground with `pg` = 0, before and between flights; layout L1)

| Slot | Field | Prio | Format | Colour |
|---|---|---|---|---|
| status | link + vario battery (`bt`) | 1 (readiness) | v0.1 | v0.1; battery orange ≤ 15 % (SPEC §4.6) |
| BIG | UP: ascent rate | 1 | `+620` m/h / `+2030` ft/h, rounded to 10; `vu` = "m/h" | neutral |
| C1 | altitude | 1 | native | neutral |
| A1 | AVG: vario average (shows thermal cycles at launch) | 2 | signed m/s | neutral |
| A2 | GPS: watch GPS ready / vario GPS fix | 2 | `OK` / `--` | dim when `--` |
| C2 | TIME: exercise duration (`hT`) | 2 | native `Duration_FourdigitsFixed` | neutral |
| D | SUNSET: time to sunset (`hS`) | 3 | native `Duration_Fixed` | neutral |

Why these HIKE fields: [hfxc] §2a ranks vario readiness first, then pace and time to sunset. "Height still to climb to launch" needs a launch-elevation number setting, so it is Later (§6).

### 1.6 Always visible

- **Every airborne page** shows the instant vario, the altitude with its source label, and the link status. That is what is left when a gloved pilot glances once [hfxc] §6; [xctrack] §1.2.
- **HIKE** shows the altitude and the link and battery status.
- **Classic mode** (`pg` = 2) is the v0.1 page unchanged.

---

## 2. Computed metrics

### 2.1 New inputs and outputs

**Inputs** (the limit is 10, R L133; v0.1 uses 5):

| Name | Source | Note |
|---|---|---|
| `la` | `Fusion/Location/GeoCoordinates.latitude` | int32 degrees × 10⁷, about 1 Hz, repeats the last value when there is no new fix (R L655-664). The reference documents only the object. The dotted fields are whitelisted in the tools library, and the public app AnchorAlarm v0.3 uses them ([feas] §1). **A wrong manifest path stops the app loading (R L133), so probe W1 comes first.** |
| `lo` | `Fusion/Location/GeoCoordinates.longitude` | as above |

That makes 7 of 10. Not used:
- `/Fusion/Heading` is whitelisted though undocumented ([feas] §1; corrects SPEC §8.3), but its smoothing and source switching around 2 km/h are unknown, and the wrist compass is not the flight direction.
- Exercise time and sunset are template `<eval>`s on native paths. They are not manifest inputs (the reference uses `/Activity/Move/-1/Duration/Current` directly in templates, R L1610). (unverified, S8)

**Outputs** (validator error at 20, SPEC §3). v0.1 has 10: `con vs av alt src bat gn ft gs hd`.
- New in MVP-A: `ws`, `wd` (12).
- New in MVP-B: `tx`, `ty`, `tn`, `pf` (page flags for the template; distinct from the setting `pg`) (16).
- Changed meaning: `gs` = displayed ground speed from the best source; `hd` = track over ground (rad) from the best source.

### 2.2 Metric table

Notation:
- `tk`: evaluate tick counter.
- `alt`: calibrated altitude of the active source (SPEC §8.1).
- `H[]`, `ri`: the active-source slice of the v0.1 32-tick altitude ring and its head.
- Every metric is computed once per evaluate (1 Hz), and only while its inputs are valid. Otherwise it shows `--`.

| Metric | Inputs | Algorithm | Window / smoothing | RAM | Limitation |
|---|---|---|---|---|---|
| Instant vario | LK8EX1 | v0.1: mean of the tick's samples (SPEC §7.4) | 1 tick | v0.1 | 1 Hz display (SPEC D4) |
| Average climb AVG | `H[]` | v0.1: `(H[ri] − H[ri−N]) / N`, N from `aw` (10/15/20/30) | N s | v0.1 | Farina uses 16 s, about one turn ([hfxc] §1) |
| `a30` | `H[]` | the same with N = 30 | 30 s | 0 | drives the page gate only |
| `v3` (map colour) | `H[]` | `(H[ri] − H[(ri+29)%32]) / 3` | 3 s | 0 | |
| Altitude | v0.1 | SPEC §8.1 | | | QNE stays available for airspace |
| Height above TO / ST | `alt`, `altTO` (SPEC §8.3: ring value 12 ticks before detection), `altSt` (first valid `alt` after `onExerciseStart`) | `hto = alt − (hr === 0 ? altTO : altSt)` | none | 2 floats | **No terrain** (§2.4). `TO` is invalid until take-off is detected. |
| Ground velocity, track | `la`, `lo` | §2.3 `air`: on a new fix only, `v = Δpos / Δticks` (Δticks ≤ 4); track = `atan2(vE, vN)` when \|v\| > 1.5 m/s | raw, one fix | 320 B ring | 1 Hz; duplicates handled; position noise is a hardware question (W1) |
| GS (display) | `spd`, RMC, `DR` | `spd` if the watch GPS is fresh (≤ 3 ticks), else RMC speed if ≤ 3 s old (v0.1 B4), else `(DR[ri] − DR[ri−3]) / 3` | as delivered | 0 | `spd` smoothing unknown (W3), so it is used for display only |
| Ground distance `DR` | fix steps | `DR[ri] = DR[ri−1] + step`; a step is dropped when > 60 m/s | per tick | 128 B | path length, slightly long from GPS noise |
| L/D over ground | `DR`, `H` | `j = (ri+12)%32` (20 s back); `dd = DR[ri]−DR[j]`; `dh = H[j]−H[ri]`; valid if `cs < 2 && dd > 60 && dh > 6`; `ld = dd/dh` | 20 s | 0 | no airspeed, so this is glide **over ground** and includes wind. XCSoar GR Avg ignores circling too (`GlideRatioCalculator.cpp:L59, L111`). |
| Head/tail wind | wind, track | `hw = W·cos(wdFrom − trk)`, + = headwind ([xcsoar] §1.3 Head Wind) | wind age | 0 | needs GS > 3 m/s and a valid wind |
| Circling `cs` | ground velocity | §3.2 | EMA α 0.3 | 9 scalars | needs a watch fix at least every 4 s; wind additionally needs circles ≤ 40 s (ring), §3.6 |
| Wind | ground velocity, `alt` | §3.3 | last full turn; 8-entry store | 160 B + 9 scalars | circling only (§2.4) |
| Thermal gain, IN | v0.1 | SPEC §8.4, I2 | | v0.1 | vario-based, not circling-based |
| Time in thermal | `tIn` | `tc = tk − tIn + 5`, back-dated by the 5-tick entry rule, as XCSoar back-dates to the first turn (`CirclingComputer.cpp:L130-164`) | | 1 int | |
| TC average | gain, `tc` | `gain / tc` once `tc ≥ 10` | thermal | 0 | XCSoar TC Avg ([xcsoar] §1.1); XCTrack lacks it (#198) |
| Ascent rate UP | `alt` | `vr += (alt − aPrev − vr) / 60` when the same source on both ticks; shown as `vr·3600` | EMA τ 60 s | 2 floats | the watch's native vertical-speed field also exists |
| Total climb | `alt` (airborne) | `if (alt − aRef >= 3) { tot += alt − aRef; aRef = alt; } else if (aRef − alt >= 3) aRef = alt;` | 3 m hysteresis (design) | 2 floats | the hysteresis suppresses baro noise but slightly under-counts weak zig-zags |
| Max height above TO | `hto` | max while airborne | | 1 float | |
| Lift colour bucket `bk` | `v3`, `BT[]` | §2.3 | 3 s ± 0.15 m/s hysteresis | 24 B | brutto, not netto (§4.3) |

### 2.3 ES5 code (SPEC §0.1 T2)

The code follows the main.js rules:
- State lives in top-level `var` initialisers. Helpers are top-level `var f = function (...)` and receive `output` by identifier.
- No allocation per tick, no `Date`, no regex.
- The sizes are terser output with the editor's settings [sim-A]: `air` (GPS and circling part) 903 B; `wnd` (fit + store, no sector gate) 1,101 B.

```js
// --- module state (top-level var initialisers) ---
var GV = new Float32Array(80);   // last 40 ground velocities (vE, vN) m/s, newest at gH
var WS = new Float32Array(40);   // wind store, 8 x (wE, wN, quality, tick, alt)
var DR = new Float32Array(32);   // cumulative ground distance per tick (m), same head ri as the v0.1 ring
var BT = new Float32Array(6);    // bucket thresholds, set in onLoad from setting lc (section 4.3)
var gN = 0, gH = 39, wI = 7, sus = 0, la0 = 0, lo0 = 0, kx = 0, laP = 0, loP = 0, tF = -1,
    pX = 0, pY = 0, vE = 0, vN = 0, trk = NaN, stp = 0, cE = 0, cN = 0, psP = 0, psOk = 0,
    rs = 0, cs = 0, cT = 0, cD = 0, sw = 0, wE = 0, wN = 0, wOk = 0, wNew = -1, wAR = -1e9, bk = 2;

// --- once per evaluate, after the v0.1 ring advance; alt = calibrated altitude, v3 = 3-s vario ---
var air = function (input, output, tk, alt, run, v3) {
  var la = input.la, lo = input.lo, dt, dn, de, i, k, aE, aN, ps, d, t;
  stp = 0;
  if (tF >= 0 && tk - tF > 4) { gN = 0; cs = 0; rs = 0; psOk = 0; }      // GPS gap: drop the window
  if (isFinite(la) && isFinite(lo) && (la !== laP || lo !== loP)) {      // new fix only (CirclingWind.cpp:L122-125)
    if (tF < 0) { la0 = la; lo0 = lo; kx = 0.0111195 * Math.cos(la * 1.745329e-9); }
    dt = tk - tF;
    if (tF >= 0 && dt <= 4) {                                             // step <= 4 s (CirclingWind.cpp:L239-248)
      dn = (la - laP) * 0.0111195; de = (lo - loP) * kx;                  // metres per 1e-7 degree
      vN = dn / dt; vE = de / dt;
      if (vE * vE + vN * vN < 3600) {                                     // > 60 m/s = glitch
        gH = (gH + 1) % 40; GV[gH * 2] = vE; GV[gH * 2 + 1] = vN; if (gN < 40) gN++;
        stp = Math.sqrt(de * de + dn * dn);
        if (vE * vE + vN * vN > 2.25) trk = Math.atan2(vE, vN);
      } else gN = 0;
    } else gN = 0;
    laP = la; loP = lo; tF = tk;
    pX = (lo - lo0) * kx; pY = (la - la0) * 0.0111195;                  // local metres east / north of the first fix
    if (gN >= 3) {
      cE = 0; cN = 0;                                                     // reference = mean of the newest <= 10 velocities
      for (i = 0, k = gH; i < gN && i < 10; i++, k = (k + 39) % 40) { cE += GV[k * 2]; cN += GV[k * 2 + 1]; }
      cE /= i; cN /= i;
      aE = vE - cE; aN = vN - cN; d = 0;
      if (aE * aE + aN * aN > 20) {                                       // |v - c| > 4.5 m/s (noise gate, section 3.2)
        ps = Math.atan2(aE, aN);
        if (psOk) { d = ps - psP; if (d > Math.PI) d -= 6.2832; else if (d < -Math.PI) d += 6.2832; }
        psP = ps; psOk = 1;
      } else psOk = 0;
      d /= dt; if (d > 0.873) d = 0.873; else if (d < -0.873) d = -0.873; // clamp 50 deg/s (CirclingComputer.cpp:L32-91)
      rs = 0.7 * rs + 0.3 * d;                                            // EMA alpha 0.3
      t = Math.abs(rs) >= 0.0698;                                         // turning >= 4 deg/s (CirclingComputer.cpp:L14)
      if (cs === 0) { if (t) { cs = 1; cT = tk; sw = 0; } }
      else if (cs === 1) { sw += d * dt; if (!t) cs = 0; else if (tk - cT >= 8 && Math.abs(sw) >= 3.927) { cs = 2; cD = sw > 0 ? 1 : -1; } }
      else if (cs === 2) { if (!t) { cs = 3; cT = tk; } }
      else if (t) cs = 2; else if (tk - cT >= 10) cs = 0;
      if (cs >= 2 && gN >= 9) { if (sus > 0) sus--; else wnd(tk, alt, 1); }
    }
  }
  DR[ri] = DR[(ri + 31) % 32] + stp;
  if (isFinite(alt) && (tk % 10 === 0 || Math.abs(alt - wAR) > 100)) wnd(tk, alt, 0); // store refresh (Store.cpp:L31-77)
  if (isFinite(v3)) {                                                     // lift bucket with 0.15 m/s hysteresis
    i = 0; while (i < 6 && v3 - 0.15 > BT[i]) i++;
    k = 0; while (k < 6 && v3 + 0.15 > BT[k]) k++;
    if (bk < i) bk = i; else if (bk > k) bk = k;
  }
  output.hd = tk - tF <= 3 ? trk : rmcHd;                               // rmcHd = v0.1 RMC course if <= 3 s old, else undefined
  if (run && tF >= 0) {                                                   // MVP-B map feed (section 4.1)
    output.tx = Math.round(pX); output.ty = Math.round(pY);
    output.tn = tk * 8 + (tk - tF <= 2 ? bk : 7);                         // 7 = no fresh fix (pen up)
  }
};
```

`wnd` is in §3.3.

The rest goes into existing helpers:

```js
// in fly (airborne only; take-off sets altTO, aRef = altTO, hMax = 0, tot = 0, and clears the wind: for (i = 0; i < 40; i++) WS[i] = 0; wOk = 0; wNew = -1):
if (alt - aRef >= 3) { tot += alt - aRef; aRef = alt; } else if (aRef - alt >= 3) aRef = alt;
if (alt - altTO > hMax) hMax = alt - altTO;
// in ui:
j = (ri + 12) % 32; dd = DR[ri] - DR[j]; dh = H[j] - H[ri];
ld = (cs < 2 && dd > 60 && dh > 6) ? dd / dh : NaN;          // shown "--" when NaN or > 99
hw = wOk ? Math.sqrt(wE * wE + wN * wN) * Math.cos(Math.atan2(-wE, -wN) - trk) : NaN;
```

### 2.4 Known limitations, stated in the store text and the FAQ

**Height above ground.**
- True AGL needs terrain. XCSoar's H AGL is the nav altitude minus a raster DEM from the `.xcm` map ([xcsoar] §1.2), and XCTrack's AGL needs downloaded terrain tiles (#334, #365) ([xctrack] §2.3).
- None of the 238 whitelisted SuuntoPlus paths, nor the reference, exposes ground elevation ([feas] §1). A DEM tile would also break the ~4 KB allocation cap and the ~2 KB data.json limit (limits L23-24).
- So the app shows height above take-off (like XCSoar's H T/O, `Altitude.cpp:L146-166`) or above the exercise start. For hike-and-fly, where the exercise usually starts near the landing, height above start approximates height above the landing (inference).
- The label is `TO` or `ST`, never AGL. It says nothing about clearance over the ground below.

**Wind without airspeed.**
- The UltraBip has no pitot. XCSoar's straight-flight EKF needs a real airspeed and never runs without one (`Computer.cpp:L50-69`) ([xcsoar] §2.4). XCTrack has no straight-flight method either (#974) ([xctrack] §2.1).
- So wind exists only after a full circle. On glide it ages: from 5 minutes its age in minutes replaces the label, and it is hidden after 30 (v1.1; the dimmed variant of the design needs a second element).
- The fit assumes roughly constant airspeed around the circle. **Correction (XC review, algorithms P2-3):** an airspeed change that repeats once per circle (bar or brake held through the same part of every turn) does not widen the residual; it shifts the fitted centre. Airspeed varying by ±1/2/3 m/s with the heading gave a wind error of 0.96/1.94/2.91 m/s in 15 of 15 runs with an unchanged residual. This is inherent to circle fits; the FAQ says to circle at a steady speed.
- Circles of about 45 s or longer (wide, flat circles in weak lift) are not detected as circling: the velocity's distance from its 10-sample mean shrinks with the circle period, below the 4.5 m/s gate (0.46 × airspeed at 60 s). At 9.5 m/s airspeed 40-s circles reach THERMAL after a median of about 70 s, 45-s circles rarely, 50-70-s circles never; no wind from 45 s on. A gate relative to the ground speed would fix it but needs X3 re-run with measured noise (W1). Without circling, THERMAL then follows only when no watch GPS is available.
- Fast weaving or wingovers in lift (±90°, 4-8 s period) read as circling and show THERMAL on 30-90 % of the ticks; in sink they stay on GLIDE.
- A gondola or car ride above 16 km/h is detected as a take-off (SPEC §8.3, H13): GLIDE and THERMAL appear in the cabin and the summary counts the ride. The FAQ asks pilots to pause the exercise in lifts and cars.

**GPS at 1 Hz.**
- evaluate is not phase-locked to the fix (R L1044), so a tick sometimes sees the same fix twice and then a 2-s jump ([feas] §1). The code uses a sample only when lat or lon changed and divides by the elapsed ticks.
- 18-30-s circles give 18-30 samples, more than XCSoar's minimum of 9 (`CirclingWind.cpp:L184-192`).
- Displayed values lag about 1-2 s.
- The map's newest point can lag one tick (§4.1).
- In a reduced GPS mode the fix comes about every 60 s ([feas] §1). Wind and the map then stop, and GS falls back to RMC.

---

## 3. Wind estimation

### 3.1 Method choice

| Candidate | Source | Verdict |
|---|---|---|
| XCSoar no-TAS CirclingWind | Wind speed = mean\|GS − mean\| × π/2; direction from a 24-pass phase search. Restored for paragliders in v7.45.1 (commit 22d9e17) ([xcsoar] §2.2). | **Not chosen.** In the [xcsoar] sim it was 3.7° and −1.1 m/s off at W/V 0.8, and it fails when W > V because the track never sweeps 360°. |
| My Vario / SkyDrop 8 sectors | Wind = (max GS − min GS) / 2; accepted only for roughly opposite sectors ([xctrack] §2.1) | **Not chosen.** It needs a full track rotation, so it also fails when W > V. It uses 2 samples of about 20 and gives no airspeed check. |
| **Kåsa circle fit in velocity space** | The ground-velocity vectors lie on a circle: centre = wind (to), radius ≈ TAS ([xcsoar] §2.6, [feas] §2) | **Chosen.** No bias at W/V 0.8, works at W/V 1.2, gives a free TAS check, O(n) with n ≤ 40. |

- **Disagreement:** [xctrack] §5 suggests starting with the 8-sector method; [xcsoar] and [feas] both recommend Kåsa. I follow the latter.
- **Difference from the [feas] prototype:** it reset its sums every turn and counted rotation on the raw track (`feas/wind_es5.js`). That fails when W > V. This addendum keeps a 40-sample ring, fits the last full turn, and measures rotation around the recent mean velocity (§3.2).
- **Input rule:** raw per-fix velocity only. Pairing a smoothed speed with a track rotated the [xcsoar] sim estimate by 32-40°. Smoothing only the scalar speed shrank the [feas] estimate by 13 % (τ 2 s) or 24 % (τ 3 s). Position differences are linear in the fix, so any position filter leaves the circle centre unchanged ([feas] §2).

### 3.2 Circling detection

| Rule | Source | Notes |
|---|---|---|
| XCSoar: track turn rate, EMA α 0.3, turning ≥ 4°/s, circling after > 15 s turning, cruise after > 10 s straight | `CirclingComputer.cpp:L14, L32-91, L128-212`; `Settings.hpp:L199-209` ([xcsoar] §4) | Track-based, so blind when W > V |
| XCTrack: ≥ 90° heading change in 30 s **and** 30-s vario ≥ −0.5 m/s; end at < 30° in 30 s and < −0.5 | xctrack.org/Manual.html ([xctrack] §2.2) | Loose: a 90° ridge turn qualifies |
| My Vario: 5 circling ticks to switch, 20 to switch back | `MyProcessing.mc` L355-372 ([xctrack] §3) | Hysteresis only |
| **Chosen** (design) | Turning is measured on the velocity **minus the mean of its last 10 samples**, counting a step only when \|v − mean\| > 4.5 m/s. The XCSoar rate and EMA, ≥ 8 s of turning **and** ≥ 225° swept in one direction, exit after 10 s (XCSoar default). XCTrack's −0.5 m/s gate applies to the **page** only (§1.2), not to the wind. | The wind cancels out of `v − mean(v)`, so detection is the same at any W/V, including W > V [sim-A]. |

[sim-A] results (50-100 runs; 1 Hz; AR(1) position noise with ρ 0.9, σ 2 m unless stated; ±15 % turn-rate and ±5 % airspeed wobble):

| Variant | Detection, 22-s circles (median) | S-turns ±90°, 10 min | 180° ridge reversals, 10 min | ¾ circle |
|---|---|---|---|---|
| 20-sample mean, ≥ 270°, gate 3 m/s | 24 s | 0 ticks circling | 0 | 0 |
| 10-sample mean, ≥ 180°, gate 3 m/s | 16 s | **103 ticks circling (false)** | 0 | 12 ticks, 15/100 estimates |
| 10-sample mean, ≥ 225°, gate 3 m/s | 19 s | 0 at 2 m noise, **109 at 4 m** | 0 | 1/100 estimates |
| **10-sample mean, ≥ 225°, gate 4.5 m/s (chosen)** | **20 s** (16 s at 18-s circles, 27 s at 30-s circles) | **0** at 2 m and 4 m noise | **0** | 0/100 estimates |
| Straight glide 30 min, chosen rule | — | 0 ticks at 2, 4 and 6 m noise (the 3 m/s gate gave 211 false ticks at 6 m) | — | — |

The 4.5 m/s gate sits well below the circling radius of \|v − mean\| ≈ 6-9 m/s, so it costs about 1 s of latency, and accuracy is unchanged. The slow first version had a geometric cause. When circling starts, the mean still sits **on** the velocity circle, at the straight-flight velocity, so the angle seen from it sweeps at half rate (inscribed-angle theorem). A shorter mean moves it inside the circle sooner.

### 3.3 Algorithm (`wnd`; ≈ 1.1 KB minified [sim-A])

```js
// fit = 1: try a fit over the last full turn, then refresh the store; fit = 0: refresh the store only
var wnd = function (tk, alt, fit) {
  var k = gH, m = 1, s = 0, ok = 0, pa, a, d, i, u, v, z, t, h, g, w, mx = 0, my = 0,
      suu = 0, svv = 0, suv = 0, suz = 0, svz = 0, sz = 0, det, ex, ey, R, e2 = 0, x, y, sE = 0, sN = 0, sW = 0;
  if (fit) {                                  // 1. walk back until the velocity turned 360 deg around (cE, cN)
    pa = Math.atan2(GV[k * 2] - cE, GV[k * 2 + 1] - cN);
    while (m < gN && s < 6.2832) {
      k = (k + 39) % 40;
      a = Math.atan2(GV[k * 2] - cE, GV[k * 2 + 1] - cN);
      d = pa - a; if (d > Math.PI) d -= 6.2832; else if (d < -Math.PI) d += 6.2832;
      s += d * cD; pa = a; m++;
    }
    ok = s >= 6.2832 && m >= 9;               // XCSoar needs n_samples > 8 (CirclingWind.cpp:L184-192)
  }
  if (ok) {                                   // 2. Kasa fit on centred data: u^2 + v^2 + D u + E v + F = 0
    for (i = 0, k = gH; i < m; i++, k = (k + 39) % 40) { mx += GV[k * 2]; my += GV[k * 2 + 1]; }
    mx /= m; my /= m;
    for (i = 0, k = gH; i < m; i++, k = (k + 39) % 40) {
      u = GV[k * 2] - mx; v = GV[k * 2 + 1] - my; z = u * u + v * v;
      suu += u * u; svv += v * v; suv += u * v; suz += u * z; svz += v * z; sz += z;
    }
    det = suu * svv - suv * suv;              // 2x2 system (centring removes the third row; no 3x3 Cramer)
    ok = det >= 0.0625 * (suu + svv) * (suu + svv);   // roundness: 1 for a full circle, 0 for a line
  }
  if (ok) {
    ex = (suz * svv - svz * suv) / (2 * det); // centre (-D/2, -E/2) in centred coordinates
    ey = (svz * suu - suz * suv) / (2 * det);
    R = Math.sqrt(ex * ex + ey * ey + sz / m);// radius = airspeed estimate (F = -sz/m)
    for (i = 0, k = gH; i < m; i++, k = (k + 39) % 40) {
      u = GV[k * 2] - mx - ex; v = GV[k * 2 + 1] - my - ey;
      z = Math.sqrt(u * u + v * v) - R; e2 += z * z;
    }
    e2 = Math.sqrt(e2 / m); x = mx + ex; y = my + ey;    // x, y = wind-TO vector east, north (m/s)
    ok = R >= 5 && R <= 16 && x * x + y * y <= 625 && e2 <= 1.5;
  }
  if (ok) {                                   // 3. store the estimate
    wI = (wI + 1) % 8;
    WS[wI * 5] = x; WS[wI * 5 + 1] = y; WS[wI * 5 + 2] = e2 <= 0.6 ? 3 : (e2 <= 1.0 ? 2 : 1);
    WS[wI * 5 + 3] = tk; WS[wI * 5 + 4] = alt;
    sus = m >> 2; if (sus < 3) sus = 3;       // XCSoar re-fits about every quarter circle (CirclingWind.cpp:L218-223)
    wNew = tk;
  }
  for (i = 0; i < 8; i++) {                   // 4. weighted mean: quality x age x height (MeasurementList.cpp:L17-109)
    g = WS[i * 5 + 2]; if (g <= 0) continue;
    t = (tk - WS[i * 5 + 3]) / 3600; h = (alt - WS[i * 5 + 4]) / 1000;
    if (t > 1 || !(h >= -1 && h <= 1)) continue;  // also skips a NaN height
    w = g * (0.0025 * (1 - t) / (t * t + 0.0025)) * (2 / (1 + h * h) - 1);
    sE += w * WS[i * 5]; sN += w * WS[i * 5 + 1]; sW += w;
  }
  wOk = sW > 0 ? 1 : 0; if (wOk) { wE = sE / sW; wN = sN / sW; }
  wAR = alt;
};
```

- **Take-off:** `fly` clears `WS` and sets `wOk = 0` and `wNew = -1`, so no stale age is shown. XCTrack resets wind at take-off detection (0.5.1.4, [xctrack] §2.1), and it stops one flight's wind leaking into the next on a hike-and-fly day.
- **Recursion depth:** the centred 2×2 solve avoids the one-expression 3×3 Cramer, which measured compiler recursion depth 30 ([feas] §2). crash L14 and L152 tie depth 31 to stack exhaustion at load. The circling state machine is a 4-branch chain, so it is shallow.

### 3.4 Gates and quality

| Gate | Value | Source |
|---|---|---|
| Fix step | ≤ 4 ticks, otherwise the window is reset | `CirclingWind.cpp:L239-248` |
| Turn step counted | only when \|v − mean₁₀\| > 4.5 m/s | design, [sim-A] noise cases |
| Samples in the turn | ≥ 9, ≤ 40 (the ring) | `L184-192`; ring as XCSoar's 80-sample buffer `.hpp:L53` |
| Swept angle | ≥ 360° around the 10-sample mean, in the circling direction | design (XCSoar sums track deltas, `L179-189`) |
| Roundness | det ≥ ¼ · (tr/2)² | design |
| Fitted radius (TAS) | 7-16 m/s (25-58 km/h); was 5-16 m/s until the XC review | [xcsoar] §5; [feas] §2; XC review (algorithms P2-2): with white GPS noise of 3 m a straight line gave 40 false estimates in 2 h with the 5 m/s floor, 4 with 7 m/s; the yield at 4 m AR(1) noise stayed 98-101 estimates per 12 runs at 7.5-9.5 m/s airspeed (96 → 90 at 7 m/s). A residual gate relative to the radius (≤ 0.15 R) was tried and dropped: at 7.5 m/s and 4 m noise it cut the estimates from 101 to 25. |
| Wind | ≤ 25 m/s (90 km/h) | design; XCSoar rejects ≥ 30 m/s (`L294`) |
| RMS residual of \|v − c\| − R | ≤ 1.5 m/s | design |
| Quality | 3 if residual ≤ 0.6; 2 if ≤ 1.0; else 1 | design, on XCSoar's 1-3 scale for no-TAS (`L365-413`) |
| Re-fit cadence | every max(3, n/4) new fixes | `L218-223` |

A 12-sector angular-coverage gate was tested and dropped. With the 360° walk-back and the roundness gate already in place, it changed nothing measurable in a run with the earlier 3 m/s gate: ¾-circle estimates went from 1/100 to 2/100 without it, and other cases were within noise. Dropping it saves about 150 B [sim-A].

### 3.5 Store weights

These are XCSoar's formulas ([xcsoar] §2.3), using 8 entries instead of 200:
- Quality weight: `q`.
- Age weight: `0.0025(1−τ)/(τ²+0.0025)`, with τ = age/3600. It halves after about 3 minutes; entries older than 1 h are skipped.
- Height weight: `2/(1+(Δh/1000)²) − 1`. At 300 m difference it is 0.83, at 900 m 0.10; entries more than 1000 m away are skipped.
- The store is refreshed on a new estimate, every 10 ticks, or on a 100-m altitude change. So the displayed wind follows altitude, as XCSoar's does (`Store.cpp:L31-77`).
- When the store is full, the oldest entry is overwritten (design; XCSoar replaces the lowest score).

### 3.6 Display and blind spots

**Values**
- Wind-from = `atan2(−wE, −wN)`, in rad 0..2π. Speed = |w|. Age = `tk − wNew`.
- The from-bearing in degrees follows XCSoar's wind bearing ([xcsoar] §1.3).

**GLIDE line D:** `270° 18 km/h HW12` (head + / tail −). v1.1: `WIND 270° 18 km/h`, no head/tail component; `WIND CALM` below 1.5 m/s with no bearing and no logged direction (XC review, product P2-10: a calm wind showed a random bearing).

**THERMAL G4:** speed, with `270°` in the label.

**Map arrow:** points **downwind**, the way the thermal drifts.
- Length = r·min(0.8, W/15 m/s), where r is the map radius.
- White when fresh, grey when 5-30 minutes old, absent after that.

**Age rules (design)**

| Age | Display |
|---|---|
| < 5 min | normal |
| 5-30 min | dim, with the age in minutes in place of HW. v1.1: not dimmed; the age replaces the label, `29' 270° 18 km/h` (XC review, product P1-3) |
| ≥ 30 min or none | `--`. The outputs `ws` and `wd` become `undefined`, so the FIT graph shows a gap. |

The display never shows `0` / `N` for an unknown wind (XCTrack #713 is the counter-example, [xctrack] §2.1).

**Blind spots**
- **Wind stronger than airspeed:** handled. Detection and the fit both use `v − mean(v)`: 100/100 valid at W/V 1.21 [sim-A].
- **Circles longer than about 40 s** at 1 Hz never close in the ring. That is the same limit as XCSoar at 80 samples / 2 Hz.
- **Figure-eights and partial turns** give no estimate.
- **Ridge soaring** with 180° turns gives no estimate, as in XCTrack #713.
- **In a reduced watch-GPS mode (~60 s fixes)** there is no wind. Feeding the same estimator from UltraBip RMC Doppler velocity is Later. [feas] §2 measured it as the best input when the vario has a fix (0.08 m/s, 1°).

### 3.7 Test plan

**T-W1 (Node, in `test/ble_vario/`).** A generator writes synthetic 1 Hz tracks as int32 lat/lon × 10⁷ and feeds `input.la`/`input.lo` through the existing harness (`run.js` pattern, SPEC §16a). The generator:

```js
// x, y metres; psi heading; wind-to (wE, wN) from a "from" bearing; noise AR(1) rho 0.9, sigma 2 m
for (t = 0; t < n; t++) {
  om = 2 * Math.PI / T * (1 + 0.15 * Math.sin(0.7 * t)); psi += om;
  V = TAS * (1 + 0.05 * Math.sin(0.37 * t));
  x += wE + V * Math.sin(psi); y += wN + V * Math.cos(psi);
  nx = 0.9 * nx + 0.436 * sigma * gauss(); ny = 0.9 * ny + 0.436 * sigma * gauss();
  lat[t] = Math.round((46 + (y + ny) / 111195) * 1e7);
  lon[t] = Math.round((8 + (x + nx) / (111195 * Math.cos(46 * Math.PI / 180))) * 1e7);
}
// late ticks: with probability p the tick sees lat[t-1], lon[t-1] (the next tick then jumps 2 s)
```

| Case | Expected (acceptance, design) | [sim-A] measured |
|---|---|---|
| 22-s circles, W 5 m/s from 270°, 2 m noise | first estimate: speed RMS ≤ 0.6 m/s, direction RMS ≤ 8°; displayed after 4 circles: ≤ 0.3 m/s, ≤ 4° | first: 0.37 m/s (bias +0.32), 4.3°; displayed: 0.15 m/s, 2.0° |
| W 2 / 8 m/s | direction ≤ 12° / ≤ 4° (displayed) | 5.2° / 1.3° |
| W 11.5 m/s, TAS 9.5 (W/V 1.21) | estimates exist; ≤ 0.5 m/s, ≤ 5° | 100/100; 0.21 m/s, 0.7° |
| 18-s / 30-s circles | ≤ 0.6 m/s, ≤ 8° | 0.31 / 0.11 m/s; 4.1° / 1.3° |
| 4 m noise | ≥ 80 % of runs with an estimate | 88 %; 0.40 m/s, 5.3° |
| 20 % late ticks | ≥ 90 % with an estimate | 98 %; 0.27 m/s, 3.5° |
| Recentring (turn rate at 25 % for 4 s every 45 s) | no degradation | 0.14 m/s, 1.6° |
| ¾ circle, then straight | ≤ 2 % with an estimate | 0 % |
| Straight glide 30 min; S-turns ±90° 10 min; 180° ridge reversals 10 min (2 m noise) | **0** circling ticks, **0** estimates | 0 / 0 / 0 |
| Straight glide 30 min at 4 m and 6 m noise; S-turns and ridge reversals at 4 m | **0** circling ticks | 0 / 0 / 0 / 0 |
| Latency (60 s straight, then circles) | first wind ≤ 1.2 circles after the turn starts | 17 / 21 / 29 s for 18 / 22 / 30-s circles |
| Calm (W 0) | displayed ≤ 0.4 m/s | 0.23 m/s (a noisy vector's length is always biased high) |
| Store: estimate A at 1500 m, then B at 2500 m; display at 2400 m | weighted toward B, by the §3.5 weights | to add |
| Take-off reset; 31 min without circling | no wind before the first circle; `--` after 30 min | to add |

The [feas] sim got 0.50 m/s / 6° per estimate under a similar noise model, so the per-estimate acceptance above is set from both.

**T-W2 (hardware W1, on foot).** Walk or cycle tight circles with the exercise running: no crash, circling detected. Wind on the ground is meaningless; this only checks the GPS input path, duplicates and rates.

**T-W3 (flight F1).**
- A live comparison is impossible: the UltraBip accepts one central at a time (SPEC §2).
- Instead, replay the UltraBip's own IGC log in XCSoar ≥ 7.45.1 (which includes the no-TAS fix) and compare XCSoar's wind with the FIT `ws`/`wd` graph.
- Acceptance (design): ≤ 20° and ≤ 5 km/h during steady circling in steady wind.

---

## 4. Thermal map

### 4.1 Architecture and data channel

The canvas exists only in the template (R L1631-1656), and main.js cannot pass arrays to the template (forum 14766 #92) ([feas] §3). So:

1. **The trail buffer lives in the template's `onLoad` variables.** They persist across laps and screen switches in matram's Race S app (15320). There is one always-mounted template and no `unload('_cm')`.
2. **main.js writes three outputs per tick** while the exercise runs and a fix exists (code in §2.3):
   - `tx`, `ty`: local metres east and north of the first fix, rounded to 1 m;
   - `tn` = `tick·8 + bucket`, where bucket 0-6 is the lift colour and 7 means no fresh fix (pen up).
   - `tn` changes every tick, so its `<eval>` fires every tick (evals fire only on change, [feas] §3 B2). `tick·8` stays below 2²⁴ for 580 h, so it is exact even if outputs are float32.
3. **Hidden `<eval>` script formatters** receive the values (the climb-logger pattern; framework-managed and leak-free, refresh L205). `$.subscribe` on outputs is avoided, because 15320 reports it severed after an overlay (refresh L120).

```html
<div style="visibility:hidden">
  <eval input="Zapp/{zapp_index}/Output/tx" outputFormat="script x => fx(x)" default="" />
  <eval input="Zapp/{zapp_index}/Output/ty" outputFormat="script x => fy(x)" default="" />
  <eval input="Zapp/{zapp_index}/Output/pf" outputFormat="script x => fp(x)" default="" />
  <eval input="Zapp/{zapp_index}/Output/ws" outputFormat="script x => fw(x)" default="" />
  <eval input="Zapp/{zapp_index}/Output/wd" outputFormat="script x => fd(x)" default="" />
  <eval input="Zapp/{zapp_index}/Output/tn" outputFormat="script x => put(x)" default="" />
</div>
```

- **The output `pf`** (not the setting `pg`) packs what the template needs: `page (0 HIKE, 1 GLIDE, 2 THERMAL-L1, 3 THERMAL-map) | 4·windDim | 8·windValid | 16·groundTrack | 32·scaleIndex`. The template keeps it in `PG`.
- **Callback order within one evaluate is unknown (W4).** If `tn` fires before `tx`/`ty`, the stored point is one tick old: about 10 m, or 10 px at the default scale. The worst case is that one-sample skew ([feas] §3).
- **Absolute coordinates instead of deltas** mean a missed tick only leaves a gap; it never shifts the trail.
- **Outputs:** 16 in total. **Live bindings** add 6 hidden evals, out of about 80 across all co-apps (refresh L24, L182).

### 4.2 Storage and projection

| Item | Value |
|---|---|
| Ring | `TX = new Float32Array(480)` (x, y for N = 240) = 1,920 B; `TB = new Uint8Array(240)` = 240 B. Allocated once in template onLoad, each under the ~2 KB dependable size (limits L23) |
| Index | slot = tick mod 240. Ticks missed while another display was shown are marked 7 (gap) when the next point arrives, so a slot's age is always `(newest − slot) mod 240` |
| Projection | equirectangular around the first fix: `y = Δlat_e7 · 0.0111195`, `x = Δlon_e7 · 0.0111195 · cos(lat0)` ([feas] §3). float32 keeps 1-m precision to 16,000 km, so there is no re-centring. Distortion over a ±250 m view is far below 1 %. |
| Screen | north-up, centred on the newest point: `sx = w2 + (x + drift − xn)·s`, `sy = w2 − (y + drift − yn)·s`, with `s = (w2 − 4) / Rm` |
| Scale | the setting `ms` gives the view **radius** in metres: 75 / 115 (default) / 190. That is display-independent. 115 m on a 230-px canvas ≈ 1 px/m, close to My Vario's default ([xctrack] §3) and XCTrack's 120-m paraglider scale ([xctrack] §2.2) |
| Drift | XCTrack "Classic": displayed point = point + wind × age ([xctrack] §2.2; XCSoar does the same in circling mode, [xcsoar] §3.4). It stacks the circles in the air-mass frame. Setting `md` turns it off (ground track). Without a valid wind there is no drift. |

### 4.3 Colour scale

The colour is the **brutto** 3-s vario `v3` with 0.15 m/s hysteresis (§2.3). Netto needs a polar and airspeed (Later).

The hex values are from XCSoar's default `VARIO_2` ramp ([xcsoar] §3.4, `TrailLook.cpp:L12-41`). The ramp's zero colour, yellow, is replaced by grey (design): on AMOLED a grey neutral band reduces clutter, and yellow then means weak lift.

| Bucket | Normal (`lc` = 1) | Weak day (×0.6 on lift) | Strong day (×1.5) | Colour | Width |
|---|---|---|---|---|---|
| 0 strong sink | ≤ −2.5 | same | same | `#0047FF` | 3 px |
| 1 sink | −2.5 … −1.0 | same | same | `#00B3FF` | 3 |
| 2 neutral (glider's own sink is about −1.1) | −1.0 … +0.2 | … +0.12 | … +0.3 | `#808080` | 3 |
| 3 weak lift | +0.2 … +1.0 | +0.12 … +0.6 | +0.3 … +1.5 | `#FFDF00` | 6 |
| 4 lift | +1.0 … +2.0 | +0.6 … +1.2 | +1.5 … +3.0 | `#FF9700` | 6 |
| 5 good | +2.0 … +3.0 | +1.2 … +1.8 | +3.0 … +4.5 | `#FF4B00` | 6 |
| 6 strong | ≥ +3.0 | ≥ +1.8 | ≥ +4.5 | `#FF0000` | 6 |

- `BT` = [−2.5, −1.0, T0, T1, T2, T3] is set in onLoad.
- Fixed buckets, not XCSoar's adaptive scale (`TrailRenderer.cpp:L605-677`), so a colour always means the same climb (design).
- Lift is drawn wider, as XCSoar does.
- Fewer colours than XCSoar's 15 means longer same-colour runs, which matters for the canvas budget.
- Dark theme assumed; a light-theme palette is Later.

### 4.4 Rendering within the canvas budget

**Budget rules**
- Race S limits: 2 × strokes + lineTo ≤ about 200 per canvas per frame, at most about 24 lineTo per path, and everything is silently dropped above that (forum 15279 #0, #3; crash L61-62).
- Rule: count units in code with a cap of **150**, at most **20 lineTo per path** (crash L25).
- moveTo is counted as **1 unit** until W6 shows it is free.

**Pre-pass, newest → oldest**
- Walk segments by age with **decimation by age**: stride 1 for ages 0-60 s, 2 for 60-120 s, 4 for 120-236 s.
- A strided segment's colour is the **highest** bucket among its points, so lift is never hidden.
- Each new path (colour change, a gap, or 20 lineTo reached) costs stroke 2 + moveTo 1; each segment costs 1.
- Stop before the running total exceeds 150, including 16 units reserved for the overlays.

**Draw pass, oldest → newest**
- It walks the same deterministic age grid (ages 60 and 120 lie on both grids), so the costs match the pre-pass. The newest segment ends up on top.
- There is no off-canvas culling, because culling would split paths and break the count. Off-canvas lineTo is already counted, and the canvas clips.

**Overlays**

| Overlay | Drawn | Cost |
|---|---|---|
| Wind arrow (downwind) + north tick | first, under the trail | 3 moveTo + 4 lineTo + 1 stroke = 9 units |
| Glider chevron, direction from the newest segment | last | 1 moveTo + 2 lineTo + 1 stroke = 5 units |

There is no fillText and no arc, because their unit cost is unknown (limits T8).

[sim-A] on a mock canvas (`trailsim.js`, 600 frames each, moveTo counted):

| Colour pattern | Max units / frame | lineTo / frame | Track shown |
|---|---|---|---|
| constant | 148 | 122 | the whole 4-min ring |
| thermal-like (a change every 2-3 s) | 148 | 70 | ≈ 80 s |
| a change every second (worst) | 148 | 39 | 39 s |
| a gap every 10 s | 148 | 83 | ≈ 105 s |

No path exceeded 20 lineTo.
- **Disagreement on drawable points:** [xctrack] §5 caps the trail at about 60 drawn points; [feas] §3 drew 94-136 segments with runs; [sim-A] gives 39-122. I keep the cap in **units**, not points: it adapts to the colour pattern and never exceeds the budget.
- **If W6 shows moveTo is free**, the cap stays and about 20-30 % more segments fit.

Template JS (`trailsim.js` source, 2,116 B minified). It was tested with `undefined` outputs injected every 50 ticks: no NaN reached `moveTo`/`lineTo`. Whether the build minifies template JS is unknown (check the built `.fea`). If it does not, ship it hand-compacted as below with the comments stripped.

```js
var N=240,TX=new Float32Array(480),TB=new Uint8Array(240),lt=-1,act=0,PG=0,CX=0,CY=0,WE=0,WN=0,WV=0,RM=115,
 RMS=[75,115,190],COL=['#0047FF','#00B3FF','#808080','#FFDF00','#FF9700','#FF4B00','#FF0000'],
 a,b,st,nb,rl,cost,last,h,w2,s,ox,oy,sx,sy,df,ux,uy,L,j,t;
function fx(v){if(isFinite(v))CX=v;return '';}                  // guards: an undefined output must never reach the trail
function fy(v){if(isFinite(v))CY=v;return '';}
function fp(v){PG=v|0;RM=RMS[(PG>>5)&3]||115;return '';}
function fw(v){WV=v>0?v:0;return '';}
function fd(v){if(isFinite(v)){WE=-Math.sin(v);WN=-Math.cos(v);}return '';} // unit wind-TO vector
function put(v){                                                  // one new point per tick
 t=Math.floor(v/8);b=v-t*8;
 if(!(t>lt))return '';
 if(lt>=0){for(j=lt+1;j<t&&j<=lt+N;j++)TB[j%N]=7;}               // missed ticks become gaps
 j=t%N;TX[j*2]=CX;TX[j*2+1]=CY;TB[j]=b;lt=t;
 if(act&&(PG&3)===3)control('#map','REFRESH');                    // one REFRESH per point, map page only
 return '';
}
function sb(a,st){var j,m=0,k;                                    // bucket of the segment age a+st -> a
 for(j=0;j<=st;j++){k=TB[(h-a-j+N)%N];if(k===7)return 7;if(j<st&&k>m)m=k;}return m;}
function pr(a){var k=(h-a+N)%N;                                   // project the point of age a
 sx=w2+(TX[k*2]+WE*WV*a*df-ox)*s;sy=w2-(TX[k*2+1]+WN*WV*a*df-oy)*s;}
function build(c){
 if(lt<0||(PG&3)!==3)return;
 h=lt%N;w2=c.width/2;s=(w2-4)/RM;df=(PG&16)||!(PG&8)?0:1;ox=TX[h*2];oy=TX[h*2+1];
 if(WV>0&&(PG&8)){                                                // wind arrow + north tick (9 units)
  L=w2*Math.min(0.8,WV/15);ux=WE;uy=-WN;
  c.beginPath();c.strokeStyle=(PG&4)?'#808080':'#FFFFFF';c.lineWidth=2;
  c.moveTo(w2-ux*L/2,w2-uy*L/2);c.lineTo(w2+ux*L/2,w2+uy*L/2);
  c.lineTo(w2+ux*L/2-(ux*0.866-uy*0.5)*12,w2+uy*L/2-(ux*0.5+uy*0.866)*12);
  c.moveTo(w2+ux*L/2,w2+uy*L/2);
  c.lineTo(w2+ux*L/2-(ux*0.866+uy*0.5)*12,w2+uy*L/2-(uy*0.866-ux*0.5)*12);
  c.moveTo(w2,4);c.lineTo(w2,16);c.stroke();
 }
 cost=16;nb=9;rl=0;last=0;                                        // pre-pass, newest -> oldest
 for(a=0;a<N-4;a+=st){
  st=a<60?1:(a<120?2:4);b=sb(a,st);
  if(b===7){nb=9;continue;}
  if(b!==nb||rl===20){cost+=3;rl=0;nb=b;}
  cost++;rl++;if(cost>150)break;last=a+st;
 }
 nb=9;rl=0;                                                       // draw, oldest -> newest
 for(a=last;a>0;a-=st){
  st=a>120?4:(a>60?2:1);b=sb(a-st,st);
  if(b===7){if(nb!==9)c.stroke();nb=9;continue;}
  if(b!==nb||rl===20){
   if(nb!==9)c.stroke();
   c.beginPath();c.strokeStyle=COL[b];c.lineWidth=b>2?6:3;pr(a);c.moveTo(sx,sy);rl=0;nb=b;
  }
  pr(a-st);c.lineTo(sx,sy);rl++;
 }
 if(nb!==9)c.stroke();
 if(TB[(h+N-1)%N]!==7){                                           // glider chevron (5 units)
  pr(1);ux=w2-sx;uy=w2-sy;L=Math.sqrt(ux*ux+uy*uy);
  if(L>0.5){ux/=L;uy/=L;c.beginPath();c.strokeStyle='#FFFFFF';c.lineWidth=3;
   c.moveTo(w2-ux*8+uy*6,w2-uy*8-ux*6);c.lineTo(w2+ux*8,w2+uy*8);c.lineTo(w2-ux*8-uy*6,w2-uy*8+ux*6);c.stroke();}
 }
}
```

It goes in `<uiView onLoad="..." onActivate="act=1" onDeactivate="act=0">`, with `<object id="map" type="canvas" build="ctx => build(ctx)" style="position:absolute;left:25.5%;top:33%;width:49%;height:49%;">`. The reference shows the onLoad-function and canvas-build pattern at R L1662-1705.

**If the template byte budget forces a cut** (§6), drop in this order:
1. the strides (draw stride 1 only);
2. the chevron (the map centre is the glider);
3. the arrowhead (shaft only).

### 4.5 Redraw cadence and memory

**Cadence**
- One `control('#map','REFRESH')` per new point, only while the map page is visible and the view is active (`onActivate` / `onDeactivate`). No Tick10hz.
- Evidence this is safe: matram ran 2 canvases at about 10 Hz on a Race S, the WBMAIN overflow appeared only with 3 at once, and ZoneSense refreshes every 2 s ([feas] §3; refresh L93-98, L176).

**Allocation**
- `build` allocates nothing: every variable is declared in onLoad, and the colours are pre-built strings.

**Memory**
- Template typed arrays: 2,168 B. main.js typed arrays: +608 B (GV 320, WS 160, DR 128) + BT 24.
- Canvas surface: 230 × 230 ≈ 53 KB at about 1 B/px (inference from the 217 KB full-face figure, [feas] §3). Unmeasured on a Race S: W7.

### 4.6 Long flights

- The ring holds the newest 240 s and overwrites the oldest. Nothing grows over a long flight.
- The origin never moves (float32 metres).
- Time spent on native displays leaves gaps (template evaluation stops off-screen, [feas] §3). It never shifts the trail.
- A whole-flight "where were the thermals" layer is Later. Main.js would send one marker per finished thermal (x, y, average climb, gain), kept as 32 × 4 floats = 512 B in the template and drawn as 2-lineTo crosses ([feas] §3 table).

### 4.7 Unknowns and their tests

| Unknown | Test |
|---|---|
| eval firing order and rate; behaviour after a lap overlay and while another display is shown; float32 vs double outputs | W4 |
| unit cost of moveTo, strokeStyle and lineWidth; whether off-canvas drawing counts | W6 |
| canvas surface memory with 2 apps | W7 |
| trail survives laps and display switches | W8 |
| template of about 10 KB on a Race S with 2 apps | T-tpl (G2) |

The pilot-side limitation: [hfxc] §2c, Farina warns against "dot-chasing", and 1 Hz lag made one XCSoar user stop using the thermal assistant. So the map is a secondary aid: the vario number stays the largest element on the page.

---

## 5. Settings, FIT logging and summary

### 5.1 Settings

All enums are inline `values` stored as an index string (R L2224-2229; never `valuePath`, SPEC §11). New keys:

| Path | shownName | values | Default |
|---|---|---|---|
| `pg` | Pages | `["Auto: hike, glide, thermal", "Auto: glide, thermal", "Classic single page"]` | `"0"`; v1.1 after the XC review round: `"2"` (classic) until gate G1 passes (SPEC §0.1.10) |
| `hr` | Height shown | `["Above take-off", "Above exercise start"]` | `"0"` |
| `ms` | Thermal map | `["Close (75 m / 250 ft)", "Normal (115 m / 380 ft)", "Wide (190 m / 620 ft)", "Off"]` | `"1"` |
| `md` | Map drift | `["Follow the wind", "Ground track"]` | `"0"` |
| `lc` | Lift colours | `["Weak day", "Normal", "Strong day"]` | `"1"` |

- **Kept from v0.1:** `dm`, `sn`, `ar`, `aw`, `sk`, and `gp`, which now applies only to the classic page. Hidden: `dp`, `dbg`.
- **Number settings are deliberately avoided** (launch elevation, landing elevation, ceiling). Settings cannot be tested before publishing (SPEC §11), and an int setting with units cannot follow the watch's imperial switch. They are Later (§6).

data.json (118 B; v0.1 was 90 B; the limit is ~2 KB, limits L24). It is read only in `ext5.js` onLoad (SPEC B5):

```json
{"dm":"0","sn":"","ar":"0","aw":"0","sk":"3","gp":"0","pg":"0","hr":"0","ms":"1","md":"0","lc":"1","dp":"0","dbg":"0"}
```

### 5.2 FIT logging (at most 5, R L2066; the validator allows 6)

| Output | Log | Format | shownName | Why |
|---|---|---|---|---|
| `vs` | yes | `VerticalSpeed_Fourdigits` | Vario | unchanged |
| `av` | yes | `VerticalSpeed_Fourdigits` | Avg climb | thermal strength over time, readable at a glance |
| `ws` | **new** | `Speed_Fourdigits` (m/s in, R L6650) | Wind speed | only the app knows it; steps once per refit; `undefined` when ≥ 30 min old |
| `wd` | **new** | `CompassHeadingDeg_Fourdigits` (rad in, R L5937) | Wind from | the graph jumps at 0/360 |
| `src` | yes | `Count_Twodigits` | Vario link | dropout timeline (H8) |
| `alt` | **no longer** | | | The native FIT already has altitude, GPS track and speed ([feas] §4). The offset to the calibrated value only matters for calibration. |
| `bat` | **no longer** | | | Vario battery drain per flight is lost; it is still on screen |

- **Disagreement:** [feas] §4 logs `tg` (thermal gain) instead of `av`. I keep `av`, because gain can be read off the native altitude graph and the climb average cannot.
- **If W9 shows a 6th logged output is recorded**, add `alt`.

### 5.3 Summary outputs (hard limit 8, practical about 4-5, R L2081)

The order puts the user's five first, so that truncation drops the least useful. The body stays in `ext3.js`.

| # | id | Name | Format | Value |
|---|---|---|---|---|
| 1 | `f` | Flight time | `Duration_FourdigitsFixed` | v0.1 |
| 2 | `a` | Max altitude | `Altitude_Fivedigits` | v0.1 |
| 3 | `h` | Max above take-off | `Altitude_Fivedigits` | `hMax` (§2.2) |
| 4 | `c` | Best climb | v0.1 (`OneDecimal_Fourdigits` + m/s; imperial `Count_Fourdigits` + ft/min) | max AVG while airborne (v0.1) |
| 5 | `t` | Total climb | `Altitude_Fivedigits` | 3-m hysteresis sum (§2.2) |
| 6 | `g` | Best thermal gain | `Altitude_Fivedigits` | v0.1 |
| 7 | `l` | Vario link | `Percentage_Threedigits` | v0.1 |

H12 decides how many entries are shown. If entries 6 and 7 do not appear, drop them; the link quality stays visible as the logged `src`.

---

## 6. MVP vs later, budgets and gates

### 6.1 Code and memory budget (estimates from measured pieces)

| Part | v0.1 measured (SPEC B7) | After MVP-A | After MVP-B | How |
|---|---|---|---|---|
| main.js minified | 5,672 B | ≈ 9.2 KB | ≈ 9.3 KB | see the rows below |
| `air` (new) | — | ≈ 1.2 KB (903 B measured without DR, bucket and feed) | ≈ 1.25 KB | §2.3 |
| `wnd` (new) | — | 1,101 B measured | same | §3.3 |
| `ui` | 798 B | ≈ 1.35 KB | ≈ 1.4 KB | page machine, slots, L/D, HW, unit factors |
| `fly` | 769 B | ≈ 1.05 KB | same | heights, total climb, UP, TC, take-off reset |
| new module `var` state | — | ≈ 0.3 KB | same | about 45 scalars + 4 typed arrays |
| dispatcher | 514 B | ≈ 0.6 KB | same | `loadExt` inlined |
| module functions | 8 | **8**: parser, ble, dat, fly, ui, `fa` (= fmt + avg merged), air, wnd | 8 | limits L29: at most 8, each ≤ 1.5 KB |
| ext3 / ext5 | 611 / 400 B | ≈ 800 / 500 B | same | summary h, t; settings |
| main.js typed arrays | 256 + 6 B | + 632 B | same | §4.5 |
| template q | 4,695 B (the build check fails above 5,000, SPEC T1) | ≈ 5.4 KB | ≈ 10 KB | L2 elements ≈ 1.9 KB, hidden evals ≈ 0.7 KB, trail JS 2.1 KB measured (minified), canvas ≈ 0.15 KB |
| template typed arrays | 0 | 0 | 2,168 B | §4.2 |
| outputs / inputs | 10 / 5 | 12 / 7 | 16 / 7 | ≤ 19 / ≤ 10 |
| data.json | 90 B | 118 B | 118 B | §5.1 |

Context for these numbers:
- About 9.2 KB of main.js is well above the 4 KB guideline and above the only clean measurement, 7.1 KB on a Vertical 2 with 3 apps (limits L28). Nothing has been measured on a Race S yet (H10 is pending, SPEC B7).
- The template datapoints: 6,379 B clean on a Race 2 with 2 apps, and 12,289 B on a Vertical 2 with 3 apps ([feas] §3).
- **The memory gate therefore comes before any code is written.**

**Gates, in order**

| Gate | Test | Pass condition |
|---|---|---|
| G0 | H10 on v0.1 (Race S, a second app, 2 h) | no `relMemCb`, no eviction |
| G1 | **H10b headroom probe** (new): v0.1 restructured to the MVP-A shape (fmt + avg merged into `fa`, `loadExt` inlined) plus ≈ 3.5 KB of cold code **spread across helpers** so each reaches its MVP-A size: two new helpers of ≈ 1.2 KB and ≈ 1.1 KB, `ui` ≈ 1.4 KB, `fly` ≈ 1.05 KB. The code sits behind a never-true setting so terser keeps it. Still 8 module functions; no single function near the ~4 KB allocation cap ([feas] §2 measured a 770 B function compiling to a 3,362 B allocation on desktop). Same run as H10. | same as H10. Then MVP-A may raise the M2 size check to 9.5 KB. A single 3.5 KB padding function would be wrong: it could trip the per-allocation cap and fail for reasons unrelated to heap headroom. |
| G2 | **T-tpl probe**: the **real L2 template**, with the trail JS, both typed arrays and the 230-px canvas element, plus a `build` that draws nothing. Same run. | same as H10. It also covers W7 (canvas memory). Then MVP-B may raise the `build.js` template check to 10.5 KB. Static padding would not exercise the onLoad compile, the 2,168 B arrays or the canvas surface. |

**Cut order if G1 fails** (estimated saving):
1. Demo generator and gate → a simulator-only build (−0.2 KB, already in SPEC B7).
2. Poll-read fallback, if H1/H5 show notify works (−0.1).
3. Classic GPS line `gp`; GLIDE already shows GS from RMC (−0.25).
4. Wind store → the newest estimate only (−0.25).
5. HIKE page (−0.3).
6. L/D (−0.15).

If it still fails, ship wind and GS on the classic page without page switching.

**Cut order if G2 fails:**
1. L2 G3/G4 slots (−0.45 KB).
2. Single vario element, if test A / S6 shows runtime colour works (−0.25).
3. The trail cuts in §4.4.

### 6.2 MVP-A (v0.2): numbers and wind, no canvas

**Scope**
- Inputs `la`/`lo` (after W1).
- Ground velocity, track, GS, `DR`.
- Height above TO/ST.
- L/D.
- Circling.
- Kåsa wind with store, as text plus age, and HW on GLIDE.
- TC average and time in thermal.
- Ascent rate; HIKE time and sunset.
- Automatic pages on L1 only (THERMAL uses L1).
- FIT `ws`/`wd`; summary `h`, `t`.
- The T-W1 Node tests.

**Why first**
- It answers everything the pilot listed as numbers: altitude, a height proxy, vario, speed, wind.
- It adds no canvas risk. The wind code is already simulated (§3.7).
- It uses only proven runtime styles (visibility, setText).

**Gates:** W1, W3, P1 (page groups), G1 (H10b), H12, W9; one real flight with F1.

### 6.3 MVP-B (v0.3): thermal map

**Scope**
- L2 layout.
- Template trail, data channel `tx`/`ty`/`tn`/`pf`.
- Colour buckets, wind arrow, chevron, drift.
- Settings `ms`, `md`, `lc`.

**Why separate:** the map is the riskiest part. It needs an untested channel (W4), canvas costs (W6, W7), trail survival (W8) and roughly double the template bytes, about 10 KB against 4.7 KB today (G2). The pilot asked for it, but pilots rank it as a secondary aid ([hfxc] §2c).

**Gates:** W4, W6, W7, W8, G2; a flight with the map visible for at least 30 min of thermalling and no black canvas or WBMAIN line in the system events (refresh L30).

**Decision (XC review round, 2026-10-04): MVP-B is not implemented in v1.1; it waits for a later version.** The rule was to build it only if sp-mem shows the app plus the map within budget per the gates above. It does not, and not by a margin a cut can close:

- **Budget.** The binding budget of a BLE display app is 10 KB steady and 12 KB peak; even the more generous one for a canvas app is 16 KB steady and 20 KB peak (SPEC binding decisions, sp-mem lowmem est32, every compiled function ≤ 1.9 KB). The app **without** the map is already 33.3 KB steady and 38.6 KB at the exercise start with the automatic pages (SPEC §0.1.10), so the missing headroom against the canvas budget is 17.3 KB steady and 18.6 KB peak before the map adds a byte (23.3 / 26.6 KB against the BLE budget). Even the classic page alone (21.6 KB steady, 27.7 KB load peak), which has no XC engine, is over the canvas budget.
- **What the map adds, measured.** A scratch prototype (not in the repo): the current app plus the §4.4 trail JS in the template's onLoad, the 230-px canvas object, the six hidden evals and the outputs `tx`, `ty`, `tn`, `pf` (positions from ext6.js, lift bucket and page bits in `put()`). sp-mem, xc-flight state: **steady 44.5 KB (+11.2 KB), load peak 48.6 KB (+10.1 KB), run peak 47.3 KB, exercise end 49.5 KB**; the mounted template grows to **8,498 B** (the template check allows 5,000 B; G2 asks for a hardware probe before 10.5 KB); the largest compiled block becomes a **2,520 B function** of the template code (the 1.9 KB rule fails; it would have to be split) and the trail array a **1,936 B buffer**; main.js 6,134 B. The canvas surface itself (about 53 KB at 1 B per pixel, an inference) is not JS heap and is not in these numbers; W7 measures it on the watch. In the harness the canvas was never redrawn (no `onActivate` there), so the draw path's transients are not in the run peak either.
- **Against the usable heap.** About 32 KB is estimated usable for one app on a Race S, and the hardware results in SPEC logged a practically full heap (131,072 of 133,120 B) with LiftLink Vario v1.0 and Air Temperature v1.0 together. A 44.5 KB steady app plus a canvas surface cannot share a sport mode, and probably cannot run alone.
- **What would have to change first.** The engine and the map would need about 28 KB less steady memory to meet the canvas budget: more than the whole XC engine (≈ 11.8 KB of the 33.3 KB) plus the main.js hooks (≈ 2.5 KB) plus every feature of the §0.1.8 cut list (≈ 6 KB). In other words a map version would have to be a different, map-first app (core vario number, the trail, nothing else), measured from scratch with its own gates G2 and W7.
- **Order before it can be reconsidered:** X4 (G1) on a Race S with the current pages; W1 (GPS noise, fix interval); W4/W6/W7/W8 with a probe template; then a map-first design priced in sp-mem.

### 6.4 Later (each with its reason)

| Item | Why later |
|---|---|
| Manual page override (long press up, P2; touch `onTap`) | must first prove that a short press still pauses; Touch is opt-in per exercise |
| Thermal-core marker (XCSoar lift-weighted centroid over 60 s with drift, `ThermalLocator.cpp`; or My Vario's weighted mean) | about 6 canvas units and about 0.4 KB; pilots warn about dot-chasing ([hfxc] §2c) |
| Past-thermal markers (whole-flight map) | needs a second channel (one marker per thermal) |
| Last-thermal stats (TL ≥ 45 s and positive gain, `GlideComputerAirData.cpp:L17, L340-378`); TC shown green when above the last thermal | bytes |
| Netto vario and airspeed (fitted R while circling; \|v − w\| on glide; 2-3 polar numbers) | low value at 1 Hz without a pitot ([hfxc] §2d #9) |
| Number settings: launch elevation (HIKE "to go" + ETA), landing elevation (height above LZ, glide needed), ceiling alarm | number settings with units; untestable before publishing |
| Distance and bearing to take-off (home arrow, XCTracey) | an SVG `gaugeControl` arrow is unverified (refresh L10, L18); the canvas is already busy |
| Track-up wind arrow on GLIDE via SVG `gaugeControl` | same unverified native |
| Wind and map from UltraBip RMC when the watch GPS is reduced (needs lat/lon parsing in the byte parser) | parser bytes; Doppler is the best wind input ([feas] §2) |
| Sink, ceiling and height-above-landing alarms (`playIndication`, 6 named sounds) | coarse; settings needed ([hfxc] §3) |
| Heading-up map; light-theme palette | cost of `ctx.rotate` unknown |
| GS colour in the A row; green/red height above TO (XCTracey) | template bytes |

### 6.5 Not possible on this hardware

- True AGL (no DEM).
- Airspace and task/turnpoint fields (need external data).
- Straight-flight wind (needs airspeed).
- Wind from the LXWP0 fields (not sent, `ultrabip.md`).
- A live comparison with XCTrack (the UltraBip accepts one central).

---

## Appendix A. XCSoar / XCTrack fields and what this app does with them

| Field (XCSoar InfoBox / XCTrack widget) | How they compute it | Here |
|---|---|---|
| Vario / Vertical speed | LK8EX1 non-compensated vario → brutto ([xcsoar] §1.1) | v0.1 BIG |
| TC 30s; XCTrack average with user interval; acoustic strength 10 s | 30-sample average, reset on mode change ([xcsoar] §1.1); [xctrack] §2.3 | AVG 10/15/20/30 s (v0.1) |
| TC Avg / TC Gain / TC Time | gain since the back-dated climb start ÷ time ([xcsoar] §1.1); XCTrack has only gain (#198) | TC, GAIN, IN (MVP-A) |
| TL Avg / Gain (≥ 45 s, positive gain); T Avg | [xcsoar] §1.1 | Later |
| H AGL | nav altitude − DEM ([xcsoar] §1.2); XCTrack GPS altitude − tiles | **not possible**; `TO`/`ST` |
| H T/O | altitude − take-off altitude ([xcsoar] §1.2) | `TO` (MVP-A) |
| V GND, Track | GPS; bearing between fixes when no track ([xcsoar] §1.3) | GS, `hd` (MVP-A) |
| Wind speed / bearing / arrow; XCTrack wind after a full circle | CirclingWind + store ([xcsoar] §2); XCTrack circle-only (#974) | Kåsa + store (MVP-A text, MVP-B arrow) |
| Head Wind | W·cos(wind − heading) ([xcsoar] §1.3) | HW on GLIDE (MVP-A) |
| GR Inst / GR Avg; XCTrack glide ratio, sinking only | EMA of the glide angle; a ring ignoring circling ([xcsoar] §1.4); [xctrack] §2.3 | L/D over 20 s, sinking only (MVP-A) |
| Netto | brutto − polar sink at the estimated TAS ([xcsoar] §1.1) | Later |
| Circle diameter | 2·TAS / turn rate ([xcsoar] §1.1) | Later (R is available from the fit) |
| Thermal assistant (36 heading buckets) | [xcsoar] §3.2; XCTrack's coloured track inside the assistant ([xctrack] §2.2) | the map replaces it (MVP-B) |
| Snail trail coloured by netto, adaptive 15 colours | [xcsoar] §3.4 | 7 fixed brutto buckets (MVP-B) |
| Thermal locator / sources | [xcsoar] §3.1 | Later |
| Thermal band | [xcsoar] §3.3 | not planned |
| Flight duration | since detected take-off ([xcsoar] §1.5) | v0.1 FLT |
| Final glide, MC, WP/Home AltD, contest distance | polar, task or waypoints ([xcsoar] §1.5) | not possible / Later (landing elevation) |
| XCTrack altitude statistics per 100 m | 20-s vario per slice ([xctrack] §2.2) | not planned |
| Sunset / civil twilight | [xctrack] §1.1 | HIKE `hS` (MVP-A) |

## Appendix B. New tests (adding to SPEC §16 and [feas] §5)

| Id | Kind | Test | Gate for |
|---|---|---|---|
| T-W1 | Node | §3.7 wind and circling cases through the harness, plus M2 size checks for `air` ≤ 1.5 KB and `wnd` ≤ 1.5 KB | MVP-A |
| T-P1 | Node | page machine: hike → take-off → glide → circling (THERMAL after ≈ 0.9 circle) → straight (GLIDE after ≥ 20 s and 10 s straight); spiral at −8 m/s stays GLIDE; no GPS → v0.1 thermal rule | MVP-A |
| T-M1 | Node | trail: `trailsim.js` cases (cap ≤ 150, ≤ 20 lineTo per path); gaps from missed ticks; drift on/off | MVP-B |
| S8 | simulator | L1 for HIKE, GLIDE, THERMAL and L2 on q/n/o: no clipping; HIKE `hT`/`hS` evals render without manifest inputs | MVP-A/B |
| W1 | watch | `input.la`/`lo` each tick: duplicates, skips, GPSinterval, GeoAccuracy units ([feas] W1). Also log 10 min of **stationary fix scatter** and 10 min of straight walking, so the sim's AR(1) noise model (σ, ρ) can be re-fitted and T-W1 re-run with it. The 4.5 m/s gate and every [sim-A] accuracy number rest on that model. | MVP-A |
| W3 | watch | `Activity/Current/Speed` smoothing vs position-difference speed | GS source |
| P1 | watch | `setStyle` visibility on the `#L1 *` / `#L2 *` groups and `setText` on shared slots from main.js: switch within 1 tick; recovery after a lap overlay | MVP-A |
| G1 / H10b | watch | headroom probe (§6.1) | MVP-A |
| W9, H12 | watch | 6th logged output; 7 summary entries shown | FIT, summary |
| W4, W6, W7, W8 | watch | [feas] §5 | MVP-B |
| G2 / T-tpl | watch | 10 KB template probe (§6.1) | MVP-B |
| P2 | watch | long press on up with no `onClick`: short press still pauses; long press switches page; nothing else lost | Later |
| F1 | flight | IGC replay in XCSoar ≥ 7.45.1 vs FIT `ws`/`wd`; GS and max altitude vs the IGC | acceptance |


## Sources
- PROJECTS/SUUNTOPLUS-SENSORS/docs/ble_vario/SPEC.md — Current spec: v0.1 implementation (§0.1 T1 template 5,000 B build check, T2 minifier rules, B4 RMC GPS line, B6 colour, B7 main.js 5,672 B and function sizes, I1 layout), D3 no button overrides, §8.3-8.4 flight and thermal rules, §9 outputs and summary, §11 settings.
- PROJECTS/SUUNTOPO/reference/suuntoplus_reference_docs.md — SuuntoPlus reference: L133 10 inputs and a bad path stops loading; L281 Activity/Current/Speed; L655-664 GeoCoordinates int32 x1e7; L829 Sunset ETE; L1044 evaluate timing; L1610 eval script formatter; L1631-1705 canvas API and onLoad build pattern; L1756-1780 uiViewSet; L1849-1863 long-press events (default 2 s, > 0.6 s); L2066 5 logged outputs; L2081 summary limit; L2224-2229 enum settings; L5937 CompassHeadingDeg_Fourdigits; L6650 Speed_Fourdigits.
- PROJECTS/SUUNTOPLUS-SENSORS/docs/research/deep-dive/limits.md — L23-24 2 KB dependable allocation and data.jsn under 2 KB; L28 main.js 4 KB guideline and 7.1 KB clean on Vertical 2; L29 at most 8 module functions, each 1.5 KB or less; L35 canvas budget; T8 fillText/arc cost unknown.
- PROJECTS/SUUNTOPLUS-SENSORS/docs/research/deep-dive/refresh-rate.md — L11, L17 setStyle proven only for visibility; L24, L182 about 80 live eval bindings across co-apps; L93-98, L176 matram 2 canvases at 10 Hz on Race S and the WBMAIN overflow; L120 15320 $.subscribe severed after an overlay; L205 climb-logger hidden eval script-formatter pattern; L10, L18 SVG gaugeControl unverified.
- PROJECTS/SUUNTOPLUS-SENSORS/docs/research/deep-dive/suuntopo-crash.md — L25 count canvas units in code with a cap of about 150; L61-62 matram 2*strokes + lineTo <= ~200, black canvas at 182 segments; L14, L152 compile recursion depth 31 and stack risk.
- PROJECTS/SUUNTOPO/docs/research/suuntopo-gaps.md — L165-166, L333: on the Race family up = pause, down = lap, middle = display switching; template button overrides remove these.
- PROJECTS/SUUNTOPLUS-SENSORS/docs/research/store.md — L238 Touch is optional and must be enabled per exercise.
- PROJECTS/SUUNTOPLUS-SENSORS/docs/research/forum-projects.md — L159 Touch is often off; L32, L111 heading resource used by a store app.
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/Wind/CirclingWind.cpp — No-TAS circling wind: new-fix gating L122-125, n_samples > 8 L184-192, step <= 4 s L239-248, wind < 30 m/s L294, suspend n/4 L218-223, quality L365-413 (via the [xcsoar] report).
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/CirclingComputer.cpp — Turn rate clamp of 50 deg/s and EMA 0.3 (L32-91), 4 deg/s turning (L14, L107-108), state machine and back-dating (L128-212, L130-164); 15/10 s thresholds in Settings.hpp L199-209.
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/Wind/MeasurementList.cpp — Wind store weights: quality x age x height, 1 h and 1000 m limits (L17-109); Store.cpp L31-77 recalculates on a new estimate or a 100 m change.
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Look/TrailLook.cpp — VARIO_2 ramp hex colours (L12-41); TrailRenderer.cpp L605-677 adaptive scale and colour runs.
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/Wind/Computer.cpp — The WindEKF straight-flight wind runs only with real measured TAS (L50-69), so it is not usable without a pitot.
- https://www.xctrack.org/Manual.html — XCTrack thermalling detection: >= 90 deg in 30 s and 30-s vario >= -0.5 m/s; end < 30 deg and < -0.5 m/s; automatic switch to the thermal assistant.
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/713 — XCTrack shows 0/N instead of unknown when no circle has been flown; the reason this addendum shows -- and never 0/N.
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/974 — XCTrack developer: wind uses GPS points only after a full circle; there is no straight-flight method.
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/594 — XCTrack wind fails with fast gliders in strong wind (open).
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/198 — Request for a current-thermal average-climb widget in XCTrack; this app adds TC average.
- (a scratch folder, not kept) — My simulation of the exact ES5 circling and Kasa wind code on synthetic 1 Hz int32 lat/lon tracks: accuracy, false-positive and noise-gate results ([sim-A]); addsim_first.js gives single-estimate errors.
- (a scratch folder, not kept) — Latency of circling detection and the first wind after a 60-s straight lead-in (16/20/27 s for 18/22/30-s circles).
- (a scratch folder, not kept) — Template trail code run against a mock canvas: unit cap (max 148), lineTo per path at most 20, segments per colour pattern, NaN guards, minified size 2,116 B.
- (a scratch folder, not kept) — The feasibility report's per-turn running-sum Kasa prototype (770 B), which counts rotation on the raw track; this addendum replaces it with a sliding window measured around the mean velocity.
