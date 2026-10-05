# XC features research: xcsoar

## Key points
- CirclingWind is the only XCSoar wind method that works without airspeed. Since v7.45.1 (commit 22d9e17, Aug 2026) the roundness gate is skipped when there is no TAS or gyro, because paraglider circles were all being rejected. In the no-TAS path, wind speed = mean|GS - mean GS| * pi/2 over the last full circle, and direction = the track at which GS is lowest (wind from), found by a coarse-to-fine phase search (24 fit passes). Quality is 3/2/1 from the fit residual, minus 1 if mean GS is outside [Vmin/2, 2*Vmin]. It needs at least 9 fixes per circle, an average step of at most 4 s, and wind under 30 m/s.
- WindEKF ('zig-zag') needs real measured TAS (airspeed_real) and is disabled without a pitot. When it does run, it bypasses the WindStore. It is a 3-state filter (wind x, wind y, airspeed scale) with a 3 s blackout after turns over 20 deg/s or |g-1| > 0.3.
- WindStore averages wind vectors weighted by quality (x20), altitude (Δh within 1000 m; 300 m gives 83 percent) and age (within 1 h; weight halves after about 3 min). It recalculates only on a new measurement or more than 100 m of altitude change, so the displayed wind depends on altitude.
- Circling detection: track-based turn rate, clamped to ±50 deg/s and smoothed with EMA alpha 0.3; turning means at least 4 deg/s. Circling starts after more than 15 s of turning and ends after more than 10 s without (configurable 2-30 s). The climb start is back-dated to the first detected turn. The manual's 'about 30 s' figure is stale.
- Thermal locator: lift-weighted centroid of the last 60 s of circle points (w = netto, clamped to at least -0.1), with each point drifted downwind by wind x age. Recency weight exp(-(0.2/60)*age^1.5). At least 5 points needed. Thermal sources are projected upwind to the ground at the last climb rate, up to 20 kept.
- Thermal assistant: 36 heading buckets of 10 deg holding the latest filtered netto per bucket, filled across every bucket swept between fixes and cleared per thermal. Polar plot with radius (lift + max)/(2*max), so zero lift sits at half radius; the advisor line points from the centre to the polygon centroid.
- Snail trail: coloured by netto, 15 colours. The scale adapts to the flight: vmin is clamped to [-5, -2], vmax to [0.75, 7.5], and zero lift is the middle colour. Default ramp VARIO_2 runs blue/cyan for sink, yellow at zero, orange to red for lift. Lift segments are drawn wider. Same-colour runs are merged into one polyline each, which is directly reusable for the watch canvas stroke budget.
- H AGL in XCSoar = nav (baro) altitude minus a raster DEM from the .xcm map. The SuuntoPlus reference has no terrain resource, so show height above take-off instead. XCSoar sets take-off when speed has been at least Vmin/2 for 10 s, back-dated to the start of that window.
- [sim] On synthetic paraglider circles, a velocity-space circle fit (Kasa: ground velocity vectors lie on a circle centred on the wind, radius = TAS) beat XCSoar's no-TAS method. It had no bias at W/V 0.8, where XCSoar's method was 3.7 deg and -1.1 m/s off, and it still worked when wind exceeded airspeed, where XCSoar's track-based circle detection fails. It runs on streaming sums in O(1) memory and also gives a TAS estimate.
- [sim] Use raw per-fix velocity, not a smoothed speed. Pairing a 5 s trailing-mean ground speed with the instantaneous track rotated the wind estimate by 32-40 deg. Whether /Activity/Current/Speed is smoothed must be tested on the watch.

# XCSoar deep dive for the SuuntoPlus BLE vario (Race S + UltraBip)

## 0. Sources and method

- **Code:** XCSoar `master` at commit `b252ae6ea412557ffc956c9c1d9681355497cab8` (2026-10-02). I made a sparse, shallow clone of source files into the scratchpad. Citations below use the form `path:Lx-Ly`. Permalink base: `https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/`.
- **Manual:** the LaTeX source of the official manual, `doc/manual/en/*.tex`, at the same commit. The PDF built from it is published at download.xcsoar.org/releases/7.45/XCSoar-manual.pdf. The old `xcsoar.org/discover/manual.html` link returns 404; the docs index is www.xcsoar.org/docs/.
- **History:** commit history of `CirclingWind.cpp`, read via the GitHub API.
- **My own tests:** a numeric simulation I wrote to compare wind estimators: `(a scratch folder, not kept)` and `windtest2.js` in the same folder. It is not XCSoar code, and its results are labelled **[sim]**.
- **Labels:** **[inference]** marks my own reasoning or recommendations, as opposed to what the source says.
- No repo files were edited.

**Where the manual and the code disagree, the code wins:**
- *Circling switch timing.* The manual's Flight-modes section says circling starts after about three quarters of a turn, and cruise returns after about 30 s of straight flight (`doc/manual/en/ch05_glide_computer.tex:L26-31`). The code defaults are 15 s of turning to enter circling and 10 s of straight flight to leave it (`src/Computer/Settings.hpp:L199-209`).
- *GPS fix rate for circling wind.* The manual says estimates need a fix rate better than one every 2 s (`ch06_atmosphere_and_instruments.tex:L171-173`). The code now accepts an average step of up to 4 s (`src/Computer/Wind/CirclingWind.cpp:L239-248`).

---

## 1. InfoBoxes relevant to paragliding

Names and one-line meanings come from `src/InfoBoxes/Content/Factory.cpp`. The computation details come from the code that fills them.

### 1.1 Vertical speed and thermals

| InfoBox (caption) | What it means / how XCSoar computes it |
|---|---|
| **Vario** (`e_VerticalSpeed_GPS`, Factory.cpp:L308) | Instantaneous brutto vertical speed. For an `$LK8EX1` device the vario field (cm/s) goes in as the *non-compensated* vario (`src/Device/Parser.cpp` `NMEAParser::LK8EX1`). It then becomes `gps_vario` and, with no TE vario present, the brutto vario (`src/Computer/BasicComputer.cpp:L236-319`). The fallback order is: non-compensated vario, then d(pressure altitude)/dt, then d(baro altitude)/dt, then d(GPS altitude)/dt. |
| **Netto vario** (`e_VerticalSpeed_Netto`, L469) | Brutto minus the glider's polar sink rate at the current TAS (`BasicComputer.cpp:L324-358`). Without a pitot, XCSoar *estimates* TAS as \|ground velocity + wind-from vector\| and flags it `airspeed_real=false` (`BasicComputer.cpp:L184-211`). With no polar or no wind, netto equals brutto. |
| **TC 30s** (`e_Thermal_30s`, L132) | A 30-sample window average. Each elapsed second pushes the current brutto value. The window is reset whenever the flight mode changes between circling and cruise (`src/Computer/AverageVarioComputer.cpp:L16-43`). The small number shows the current-thermal average. The value turns red when 2×average is below the risk-adjusted MacCready (`src/InfoBoxes/Content/Thermal.cpp:L41-49`). |
| **TC Avg / TC Gain / TC Time** (L284, L292) | Current thermal. Gain = TE altitude now − TE altitude at climb start. Average = gain / duration (`GlideComputerAirData.cpp:L170-183`). The climb start time and altitude are back-dated to the moment turning was **first detected** (`CirclingComputer.cpp:L130-164`), so the 15-s detection delay is included. |
| **TL Avg / TL Gain / TL duration** (L172, L180) | Last thermal. Recorded only when it lasted **at least 45 s and gained height** (`GlideComputerAirData.cpp:L17, L340-378`). A smoothed series (EMA, α = 0.3) feeds Auto-MC. |
| **T Avg** (`e_Climb_Avg`, L621) | Total height gained while circling and turning, divided by total circling time. The vario is integrated only while circling and turning (`CirclingComputer.cpp:L234-259`; `Thermal.cpp:L89-98`). |
| **% Climb / % Str Climb / Climb % chart** | Time shares (circling, circling and climbing, climbing without circling), from `CirclingComputer::PercentCircling` (`CirclingComputer.cpp:L215-273`). |
| **Circle diameter** (Factory.cpp:L975) | 2 × TAS / turn rate (rad/s), using the smoothed heading turn rate. The comment line shows the time for a full circle. It is invalid below 1°/s or above 2 km (`Thermal.cpp:L205-241`). It needs TAS, which may be the GS+wind estimate. |
| **Thermal Assistant** (L918), **Climb band** (`e_ThermalBand`, L789), **TC Trace** | See §3. |

### 1.2 Altitude

| InfoBox (caption) | What it means / how XCSoar computes it |
|---|---|
| **Alt GPS / Alt Baro / FL** | Raw altitudes. *Nav altitude* is the baro altitude by default (`nav_baro_altitude_enabled = true`, `src/Computer/Settings.cpp:L45`; `BasicComputer.cpp:L88-95`). When pressure and QNH are both known, XCSoar recomputes the baro altitude itself instead of trusting the device's own QNH (`BasicComputer.cpp:L68-85`). |
| **H AGL** (`e_HeightAGL`, L123) | Nav altitude minus the terrain elevation read from the raster DEM at the current fix (`GlideComputerAirData.cpp:L222-254`). The DEM is a lat/lon elevation grid stored as GeoJPEG2000 inside the `.xcm` map file (`doc/manual/en/ch12_data_files.tex:L35-40`). The value turns red when below the terrain-clearance height. |
| **Terrain elevation** (`e_H_Terrain`) | The DEM value alone. |
| **H T/O** (Height above take-off, `e_H_QFE`, L683) | Any available altitude (pressure, then baro, then GPS) minus the altitude stored at the detected take-off. Invalid until take-off is detected (`src/InfoBoxes/Content/Altitude.cpp:L146-166`). |

How take-off is detected and stored (`src/Computer/FlyingComputer.cpp`):
- **Speed threshold:** "moving" means speed ≥ V_takeoff, where V_takeoff = polar Vmin / 2, or 10 m/s without a polar (`GlidePolar.cpp:L456-459`; `GlideComputerAirData.cpp:L19`). Being 300 m or more AGL also counts as moving (L190).
- **Take-off:** declared after 10 s of moving. The take-off time, location and altitude are those from the **start** of that moving window (L69-76).
- **Landing:** after a long stationary period below half the threshold, unless the altitude is rising (L157-183, L277-283).
- **High above launch:** without airspeed and more than 250 m above the last ground altitude, the threshold is cut (×2/3, ×1/2, or ×1/4 above 1000 m) to avoid false landings in strong head wind (L262-275).

### 1.3 Speed, track and wind

| InfoBox (caption) | What it means / how XCSoar computes it |
|---|---|
| **V GND** (`e_Speed_GPS`) | GPS ground speed. |
| **Track** (`e_Track_GPS`) | GPS track. If the GPS gives no track, XCSoar computes the bearing between consecutive fixes, provided they are at least 1 m apart (`BasicComputer.cpp:L97-111`). That is the watch's situation when it has positions but no track. |
| **Wind speed / Wind bearing / Wind arrow** (`e_WindSpeed_Est` L316, Factory.cpp:L911) | The selected wind estimate (§2). The bearing is the direction the wind comes **from**. |
| **Head Wind** (L861) | W·cos(wind_from − heading). Without a compass, heading = track corrected by the wind (`src/Computer/Wind/Computer.cpp:L76-91`; `BasicComputer.cpp:L116-145`). |

### 1.4 Glide ratio

| InfoBox (caption) | What it means / how XCSoar computes it |
|---|---|
| **GR Inst** (L148) | On each GPS fix, the glide *angle* (Δh / distance) is low-pass filtered with α = 0.1, then inverted (`GlideRatioComputer.cpp:L48-49`; `UpdateGR` at `GlideRatioCalculator.cpp:L137`). Filtering the angle rather than the ratio avoids division blow-ups. The Factory description says "last 20 seconds", but the code uses an EMA. |
| **GR Cruise** (L156) | Distance from the cruise start divided by height lost, with EMA α = 0.5 (`GlideComputerAirData.cpp:L201-220`). |
| **GR Avg** (L692) | Ring buffer of 1-s path increments over a configurable window. The code default is 30 s (`Settings.cpp:L59`); the config-panel help and the manual suggest 15 s for paragliders (`ch11_configuration.tex:L500-508`). Steps under 3 m or over 150 m are ignored, values over 200 are shown as invalid, and nothing is computed while circling (`GlideRatioCalculator.cpp:L59, L111`). |
| **L/D vario** (`e_LD`, L541) | Needs IAS and a TE vario, so it is not available with the UltraBip. |

### 1.5 Final glide, MacCready and distances

| InfoBox (caption) | What it means / how XCSoar computes it |
|---|---|
| **MC, WP AltD, Fin AltD, Home AltD, Next GR, Final GR, Alternates** | MacCready-polar final-glide quantities: arrival height above the safety arrival height, and the required glide ratio. They need a polar. |
| *Crosswind L/D over ground* | Useful closed form: with w = W / sink_at_bestLD and θ = (wind_to − track), L/D_ground = w·cosθ + √(L/D² − w²·sin²θ), the larger root (`src/Engine/GlideSolvers/GlidePolar.cpp:L461-482`). |
| **WP Dist, Home Dist, Distance takeoff** (Factory.cpp:L982) | Distances. |
| **Flight duration** (`e_TimeSinceTakeoff`, L405) | Time since detected take-off. |
| **Contest distance** (`e_OC_Distance`, L708) | **XContest free flight:** a Dijkstra optimiser over a thinned 256-point trace, up to 4 legs (3 turnpoints), 1.0 pt/km; DHV-XC scores 1.5 pt/km (`src/Engine/Contest/Solvers/XContestFree.cpp:L8`; `TraceComputer.cpp:L14`). **Triangle:** the closing gap is subtracted, and a gap over 20 % of the triangle scores 0. Factors: XContest 1.4 (FAI) / 1.2; DHV-XC 2.0 / 1.75. FAI is currently hard-coded to true (`XContestTriangle.cpp:L23`). |

---

## 2. Wind estimation

### 2.1 Pipeline

`WindComputer::Compute` runs only while flying (`src/Computer/Wind/Computer.cpp:L29-74`):
- **Circling wind** runs when enabled (the default) and sends each valid result, with its quality, into the WindStore.
- **The zig-zag EKF** runs **only if `airspeed_available && airspeed_real`** and TAS > V_takeoff. An estimated TAS (GS+wind) is not "real", so the EKF never runs without a pitot.
- **When the EKF runs**, its wind is used **directly**, bypassing the WindStore. It is still written to the store for the analysis dialog.

`Select` (L93-123) picks a wind in this order: an auto estimate newer than the manual one; then external wind (from the device); then manual wind. All three methods default to on (`Wind/Settings.cpp`).

### 2.2 CirclingWind (current algorithm)

History:
- **Jan 2026:** rewritten (commit ea6f9a12c9) to fit **all** samples of a circle, with optional TAS compensation.
- **Feb 2026:** gyroscope support added.
- **Aug 2026:** the rewrite's roundness gate threw away every paraglider circle, because GPS track rate is not constant when W/V is large. Commit 22d9e17 ("Restore wind without TAS or gyro", issue #2905) skips that gate when there is neither TAS nor a gyro. The fix is in **v7.45.1** and later (GitHub compare: the commit is behind the v7.45.1 tag and ahead of v7.45).

Source: `src/Computer/Wind/CirclingWind.cpp`, `.hpp`.

**1. Gating and sampling** (L85-135)
- Runs only while `circling` is true (the CirclingComputer state, §4); otherwise it resets.
- On entering circling it records whether TAS and a gyro are usable, and keeps that choice for the whole thermal.
- One sample per new GPS fix: time, track, ground speed, TAS (0 when not usable), and angular rate. The angular rate is track(i) − track(i−1) **in degrees per sample**, or the gyro rate.
- Samples go into a circular buffer of **80** (`.hpp:L53`).
- A time warp of more than 30 s resets everything.

**2. Full-circle window** (L179-189)
- Walking back from the newest sample, it sums track deltas until \|sum\| > 360°.
- It needs `n_samples > 8`, so at 1 Hz a circle must take at least about 9 s.
- At 1 Hz, circles longer than 80 s never close.

**3. Roundness metric** (L192-224)
- (Largest deviation of the per-sample turn from the mean turn) / mean turn.
- With TAS or a gyro, the circle is accepted if this is below 1.0.
- **Without TAS and gyro (our case) the gate is skipped.**

**4. `CalcWind`** (L230-363)
- Rejects the circle if the average step is ≤ 0 or > 4 s.
- With TAS or gyro, it also rejects uneven spacing (any step off by more than max(½ step, 0.5 s)). This check is skipped in our case.
- `offset` = mean(GS − TAS). The extra fraction of the last step beyond exactly 360° is removed from the sums.
- `amplitude` = mean\|GS − TAS − offset\| × π/2 (for a sine, mean absolute deviation = 2A/π). This amplitude is the **wind speed**. It must be under 30 m/s, otherwise the circle is rejected.
- **Direction:** a coarse-to-fine search for the phase φ that minimises Σ[−cos(track − φ) − (GS − TAS − offset)/A]², with the division by A applied only when A > 1 (`FitCosine`, L415-436).
  - First pass: 8 probes spaced circle/6 apart around 180°.
  - Then repeated passes of 4 probes, halving the step each pass, while the step is above 2°.
  - That is 24 cosine-fit evaluations in total, each over n samples.
- φ is the track at which ground speed is **lowest**, so it is the direction the wind comes **from**.
- φ is then turned back by the angle flown in an assumed 0.25-s GPS latency (L338-345). The code itself calls 0.25 s a guess.

**5. Quality, 0 to 5** (L365-413)
- *No TAS or gyro:* 3 if the fit residual is ≤ 8, 2 if it is ≤ 20, 1 otherwise; never 0. One point is subtracted (minimum 1) if the mean GS is outside [Vmin/2, 2·Vmin] of the polar (L356-360).
- *With TAS or gyro:* graded thresholds on the roundness metric (0.2 / 0.3 / 0.4 / 0.5 / 0.7, each plus 0.02×W for track-based rate or 0.01×W for gyro), then −1 for a poor fit (> 10), +1 for a fit < 5, and a further +1 for a fit < 1.

**6. Suspend.** After a successful estimate, the next n/4 samples are skipped, so the last full circle is re-fitted roughly every quarter circle (L218-223).

**Previous algorithm.** Before 2026, the algorithm inherited from Cumulus (still in older installations) worked once per completed circle, compared the peak and minimum ground speed to get the wind, and graded quality by RMS error and number of circles (≥ 3 circles for full quality). Fetched at `94aec80af9`.

### 2.3 WindStore: averaging by quality, altitude and age

Sources: `src/Computer/Wind/Store.cpp`, `MeasurementList.cpp`.

- **Storage:** up to 200 measurements of {wind vector x/y, quality, time, altitude}. When full, the entry with the highest score 600·(6 − quality) + age in seconds is replaced (one quality point is worth 10 min).
- **`getWind(now, alt)`** (MeasurementList.cpp:L17-109) skips entries older than 1 h or more than 1000 m away in altitude. Each remaining entry gets weight q·a·t:
  - q = min(5, quality) × 20
  - a = round((2 / (Δh/1000)² + 1) − 1) × 100)
  - t = round(0.0025·(1 − τ) / (τ² + 0.0025) × 200), with τ = age / 3600
  - The **vector components** are averaged with these weights.
  - Quality 6 marks an override entry, which resets the accumulator.
- **Example weights** (my arithmetic from these formulas):
  - Age 0 / 1 / 3 / 6 / 12 / 30 min → t = 200 / 177 / 95 / 36 / 9 / 1. The weight halves after about 3 min.
  - Δh = 0 / 300 / 500 / 900 m → a = 100 / 83 / 60 / 10.
- **Recalculation** happens only when a new measurement arrived or the altitude changed by more than 100 m, and the result must be under 30 m/s (`Store.cpp:L31-77`). The displayed wind is therefore **altitude-dependent**.

### 2.4 WindEKF ("zig-zag")

Sources: `WindEKF.cpp`, `WindEKFGlue.cpp`.

- **State:** wind_x, wind_y, and an airspeed scale factor s.
- **Measurement model:** TAS = s·\|v_gps − wind\|. Each update:
  - error = TAS − s·mag
  - K = [−s·dx/mag·k, −s·dy/mag·k, mag·1e-5]
  - k starts at 0.04 and relaxes toward 0.01 by 1 % per update
  - s is clamped to [0.5, 1.5]
- **Glue:** samples are dropped while circling (the counter resets), and a 3-s blackout follows any turn rate above 20°/s or \|g − 1\| > 0.3.
- **Output** every 10 samples, quality 1 / 2 / 3 / 4 at fewer than 30 / ≥ 30 / ≥ 120 / ≥ 600 samples. The output vector is the negated state.
- **It needs real measured TAS. It cannot run on our hardware** (the UltraBip IAS field is empty).

[inference] Feeding a constant assumed trim speed (for example 10.3 m/s) as "TAS" would make it a constant-airspeed estimator for straight glides with heading changes. It would be corrupted by speed-bar use, and it is not something XCSoar does.

### 2.5 Which methods need airspeed

| Method | Needs TAS? | Usable on watch + UltraBip? |
|---|---|---|
| CirclingWind | No. TAS is optional and only compensates speed changes; the no-TAS path exists precisely for paragliders (L39-46). | **Yes** (with GPS) |
| WindEKF / zig-zag | **Yes, real TAS** (`Computer.cpp:L50-69`) | No |
| "Compass algorithm" (manual `ch06:L198-204`) | Heading + TAS; described as still being developed | No |
| WindStore | Not a method; it averages the others | Yes |

### 2.6 Re-implementing in ES5 with tiny memory [inference, supported by sim]

**A faithful port of the no-TAS XCSoar path is cheap.**

Memory:

| Item | Size |
|---|---|
| Ring of (track, GS) as `Float32Array(80)` (40 fixes) | 320 B |
| ~6 scalars (sum, suspend counter, …) | — |
| WindStore cut to 12 entries × {vx, vy, q, t, alt} as `Float32Array(60)` | 240 B |

Compute cost: 24 fit passes × about 20 samples ≈ 480 `Math.cos` calls, about once every 5 s. That is fine at 1 Hz.

Simplifications: drop the excess-fraction correction and the 0.25-s latency term. A shared lag on GS and track does not rotate the fitted direction; the sim confirms this.

**Better for paragliders (not XCSoar): velocity-space circle fit (Kåsa).**

During circling at roughly constant airspeed, the ground-velocity vectors (ve, vn) lie on a circle. Its **centre is the wind vector** (direction the wind blows *to*) and its **radius is the TAS**.

Algorithm:
1. Keep running sums of x², xy, x, y², y, n, z·x, z·y, z, where z = x² + y².
2. Solve the 3×3 linear system for D, E, F in x² + y² + Dx + Ey + F = 0.
3. Centre = (−D/2, −E/2); TAS = √(D²/4 + E²/4 − F).

```js
// ring r = Float32Array(2*N) of (ve, vn), newest at index h
var sxx=0,sxy=0,sx=0,syy=0,sy=0,sn=0,bx=0,by=0,bz=0;
for (i=0;i<n;i++){k=((h-i+N)%N)*2;x=r[k];y=r[k+1];z=x*x+y*y;
 sxx+=x*x;sxy+=x*y;sx+=x;syy+=y*y;sy+=y;sn++;bx-=z*x;by-=z*y;bz-=z;}
// Cramer on [[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,sn]]·[D,E,F] = [bx,by,bz]
// windTo = (-D/2, -E/2); windFromDeg = atan2(-D/2,-E/2)*180/PI + 180; tas = sqrt(D*D/4+E*E/4-F)
```

The fitted TAS is a free plausibility gate (paragliders fly at roughly 6-15 m/s) and could feed a netto estimate.

**[sim] results.** 50 runs each; V = 10 m/s; 1 Hz; GS noise 0.3 m/s; track noise 2°; circle period 20 s; true wind from 250°. Values are mean bias ± SD.

| W (W/V) | XCSoar search dir / speed | Closed-form LSQ dir / speed | Kåsa dir / speed |
|---|---|---|---|
| 2 m/s (0.2) | +1.1±2.6° / −0.1 | +0.4±2.6° / 0.0 | 0.0±2.6° / 0.0 |
| 5 m/s (0.5) | +2.4±1.9° / −0.4 | +0.6±1.2° / +0.2 | 0.0±1.1° / 0.0 |
| 8 m/s (0.8) | +3.7±1.9° / **−1.1** | +0.2±0.8° / **+1.2** | −0.1±0.7° / 0.0 |
| 12 m/s (1.2, wind stronger than airspeed) | **fails** (track never sweeps 360°) | +0.3° / **+6.2** | −0.2±0.6° / 0.0 |

- Kåsa over half a circle stays unbiased (−0.2±1.5°); over a quarter circle it scatters to ±10°.
- "Closed-form LSQ" fits GS = c + a·cos(trk) + b·sin(trk); wind from = atan2(−b, −a), W = √(a² + b²). It is the closed-form relative of XCSoar's phase search; I do not claim it is the same estimator.

**Critical input rule [sim].** Use raw per-fix ground velocity: the difference between consecutive coordinates, or RMC speed and course. Do not use a smoothed speed.
- Pairing a 5-s trailing-mean GS with the instantaneous track biased direction by **+32° (Kåsa) and +40° (XCSoar method)**, and underestimated speed by about 0.6 m/s.
- [inference] Whether `/Activity/Current/Speed` is smoothed is unknown and must be tested on the watch.

**Circling detection when wind exceeds airspeed [inference, geometry].** If W > V the ground track oscillates instead of rotating, so XCSoar's track-rate circling detection (§4) never triggers. An alternative that does not depend on the wind: track the angle of (v − wind estimate), which is the air heading, and count 360° of that.

---

## 3. Thermal locator, thermal assistant, thermal band, snail trail

### 3.1 Thermal locator

Sources: `src/Computer/ThermalLocator.cpp`, `ThermalRecency.hpp`, `GlideComputerAirData.cpp:L95-100`.

**Input**
- One point per GPS fix, only while circling and turning: position, time, w = netto vario clamped to at least −0.1 (L41-54).
- 60-point ring; at least 5 points are needed.

**Each fix** (L56-94)
1. Drift every stored point **downwind** by wind × age, so all points sit in the current air-mass frame (L18-32, L67-72).
2. Recency weight r = exp(−(0.2/60)·age^1.5), and 0 at 60 s or older. Example values: 5 s → 0.96, 10 s → 0.90, 20 s → 0.74, 30 s → 0.58, 45 s → 0.37.
3. Glider centre = Σ r·p / Σ r.
4. Lift weight L = w·r.
5. Thermal centre = glider centre + Σ L·(p − glider centre) / Σ L. In other words, it is the lift-weighted centroid of the circle points. It is invalid if Σ L ≤ 0.

**Thermal sources**
- On leaving a thermal that qualifies as a "last thermal" (≥ 45 s, positive gain), the centre is projected **upwind and down to the ground** at the last thermal's climb rate.
- Without terrain this is a straight line: altitude / climb × wind (`ThermalBase.cpp:L17-84`). With terrain it steps down in 10 height slices and interpolates where the column meets the ground.
- It is skipped when wind / lift > 10 (`GlideComputerAirData.cpp:L304-338`).
- Up to 20 sources are kept (`NMEA/ThermalLocator.hpp:L30`). Each is later drawn at the pilot's current altitude, shifted downwind by wind × (Δh / lift) (`NMEA/ThermalLocator.cpp`).

[inference] A port is about 30 points × {x, y, w, t} in a `Float32Array(120)` (480 B) plus about 10 lines of arithmetic.

### 3.2 Thermal assistant

Sources: `LiftDatabaseComputer.cpp:L45-115`; `src/Gauge/ThermalAssistantRenderer.cpp`.

**The lift database**
- 36 buckets of 10° each, indexed by **heading**. Without a compass, heading is the track corrected by the wind, i.e. the air heading.
- Each fix writes the current **filtered netto vario** (or filtered brutto) into **every bucket swept** since the previous heading, so 1 Hz fixes still fill the ring.
- Buckets hold the *latest* value; they are not averaged.
- The database is cleared when circling ends.
- On each crossing of north, the mean of the 36 buckets is pushed to the per-circle "TC Trace".

**Rendering**
- Heading-up polygon; mirrored for right-hand turns.
- Radius = R·(lift + max) / (2·max), clamped to [0, 1], with max = ceil(max(1, largest bucket)). Zero lift therefore sits at R/2 (L43-79).
- The glider marker is placed at the 30-s average.
- The "advisor" line runs from the centre to the **centroid of the polygon vertices**, pointing toward the stronger side (L166-168).
- Manual advice: open the circle when the peak passes the top of the display; tighten when it passes the glider (`ch06:L282-317`).

[inference] Use 12-18 buckets so the polygon stays within the ≤ 24 lineTo per path budget.

### 3.3 Thermal band

Sources: `src/Engine/ThermalBand/*`; `ThermalBandComputer.cpp`.

- While circling, each vario update adds (time, nav altitude) to the current encounter band.
- The band is made of height slices: 10 m to start, at most 64 slices. When full, slices are merged pairwise and the slice height doubles.
- For each slice it keeps time-weighted and encounter-weighted climb rates.
- A band counts once it is valid (at least 2 slices and more than 30 s). On leaving circling it is merged into the flight-wide collection.
- Display: climb rate (x) against height (y) (manual `ch06:L229-253`).

### 3.4 Snail trail colour by lift

**What is stored:** trace points store the **netto** vario (`src/Engine/Trace/Point.cpp:L13`). Extra sub-second "merge-vario" samples are kept when they differ by at least 0.05 m/s or cross zero, so colours stay smooth between fixes (`TraceComputer.cpp:L19-63`).

**Colour scale** (`src/Renderer/TrailRenderer.cpp:L605-677`)
- vmin = max(−5, min(−2, lowest value in the trace)); vmax = min(7.5, max(0.75, highest value in the trace)). The scale **adapts to the flight**.
- Normalise: c = v / \|vmin\| when v < 0, otherwise v / vmax.
- Index = floor((c + 1)·7.5), clamped to 0-14. 15 colours; zero lift = index 7.

**Ramps** (`src/Look/TrailLook.cpp:L12-41, L99-124`), recomputed from the ramp tables:
- **VARIO_2, the default** (`MapSettings.cpp:L14-19`), "SeeYou" style: sink blue `#0000ff` → cyan `#00d7ff`; zero `#ffff00`; lift yellow → orange → red `#ff0000`. Full list: `#0000ff #0023ff #0047ff #006bff #008fff #00b3ff #00d7ff #ffff00 #ffdf00 #ffbb00 #ff9700 #ff6f00 #ff4b00 #ff2700 #ff0000`.
- **VARIO_1:** brown `#c4801e` → grey `#a0a0a0` → green `#1ef173`.
- **Line width:** sink and zero use the minimum width (2 px, scaled). Lift indices 8-14 widen up to about 7 px when scaling is on.
- **Dots-only modes** draw only index 7 and above.

**Other trail settings**
- Length: Short = 10 min, Long = 1 h (default), Full (`GlueMapWindowOverlays.cpp:L716-723`).
- Optional wind-drift compensation, applied only in circling mode at close zoom: points are shifted by wind × age, scaled by sigmoid(altitude / 100) (`GlueMapWindowOverlays.cpp:L725-737`; `TrailRenderer.cpp:L383-394, L1122-1131`).

**Draw efficiency:** consecutive same-colour segments are merged into **colour runs**, and runs of one colour are drawn as one polyline (`TrailRenderer.cpp:L398-425, L750-800`). The trace store thins points online in the style of Douglas-Peucker (`src/Engine/Trace/Trace.hpp` class comment).

[inference] For the watch:
- Quantise to 5-7 colour classes and merge runs, so that 2·strokes + lineTo ≤ 200.
- Store points as Int16 x/y metres relative to take-off plus Int8 vario (0.1 m/s): about 5 B per point, at most about 700 points per array.
- Colour by netto ≈ vario + assumed trim sink, or by brutto shifted.

---

## 4. Circling detection

Sources: `src/Computer/CirclingComputer.cpp`; `Settings.hpp:L199-209`.

**Turn rate** (L32-91)
- (track − last track) / dt, where dt comes from a DeltaTime with a 1/3-s minimum step and 10-s warp tolerance.
- Clamped to ±50°/s ("a spike would lock circling").
- Smoothed with EMA α = 0.3: `y = 0.7·y + 0.3·x` (`Math/LowPassFilter.hpp`).
- A heading-based turn rate is computed the same way.

**Turning:** \|smoothed turn rate\| ≥ **4°/s** (L14, L107-108).

**State machine** (L128-212)
- CRUISE → POSSIBLE_CLIMB on turning. Start time, location, altitude and TE are recorded at this moment.
- POSSIBLE_CLIMB → **CLIMB** (`circling = true`) once turning has lasted more than **15 s**. If turning stops first, it falls back to CRUISE.
- CLIMB → POSSIBLE_CRUISE when turning stops. The end time and location are recorded at this moment.
- POSSIBLE_CRUISE → **CRUISE** (`circling = false`) after more than **10 s** without turning. If turning resumes, it returns to CLIMB.
- Both thresholds can be set from 2 to 30 s in 1-s steps (`GlideComputerConfigPanel.cpp:L115-125`).
- An external flap/switch can force either state.

[inference] The port needs about 6 scalars. It inherits the W > V blind spot (§2.6), and at 1 Hz the EMA time constant is about 3 s.

---

## 5. Implications for this app [inference]

- **Already within reach:** vario, a 30-s window average, current/last thermal gain and average (with XCSoar's 45-s and positive-gain rule for "last"), height above take-off, ground speed and track from consecutive fixes, GR Inst with the angle-EMA trick, flight time, distance from take-off.
- **AGL:** XCSoar needs a DEM. The SuuntoPlus reference has no terrain or elevation resource (a search of `suuntoplus_reference_docs.md` found none). Show H T/O instead.
- **Wind:** port the no-TAS circling path, or preferably the Kåsa fit, feeding a small altitude- and age-weighted store. Gate it on circling plus plausibility: swept angle ≥ 300°, fitted TAS 6-15 m/s, W < 25 m/s.
- **Netto, thermal assistant and thermal locator** all become possible once a wind and an air heading exist.


## Sources
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/Wind/CirclingWind.cpp — Current circling wind algorithm: sampling, full-circle window, roundness gate and its no-TAS relaxation, cosine fit, phase search, quality, suspend
- https://github.com/XCSoar/XCSoar/commit/22d9e17a01 — Aug 2026: 'Restore wind without TAS or gyro' (#2905); the paraglider fix, included from v7.45.1
- https://github.com/XCSoar/XCSoar/commit/ea6f9a12c9 — Jan 2026 rewrite of CirclingWind (fits all samples, optional TAS compensation)
- https://raw.githubusercontent.com/XCSoar/XCSoar/94aec80af9/src/Computer/Wind/CirclingWind.cpp — Pre-2026 algorithm inherited from Cumulus (per-circle peak/minimum ground speed, quality by circle count)
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/Wind/Computer.cpp — Wind pipeline: EKF only with real airspeed, EKF bypasses the store, source selection order, head wind
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/Wind/MeasurementList.cpp — WindStore weighting by quality, altitude and time; eviction score
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/Wind/Store.cpp — Store recalculation on update or more than 100 m altitude change; 30 m/s limit
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/Wind/WindEKF.cpp — 3-state wind EKF (wind x, wind y, airspeed scale), gains
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/Wind/WindEKFGlue.cpp — EKF gating: blackout, circling reset, quality by sample count, output every 10 samples
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/CirclingComputer.cpp — Turn rate, EMA 0.3, 4 deg/s threshold, cruise/climb state machine, circling statistics
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/Settings.hpp — CirclingSettings defaults: 15 s to enter circling, 10 s to leave
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/ThermalLocator.cpp — Thermal centre estimate: drifted, recency- and lift-weighted centroid
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/ThermalRecency.hpp — Recency weight function, 60-point window
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/ThermalBase.cpp — Projecting a thermal back to its ground source along the wind
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/GlideComputerAirData.cpp — Terrain height and AGL, last-thermal rules (45 s), current thermal, cruise GR, thermal sources, thermal locator call
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/LiftDatabaseComputer.cpp — Thermal assistant data: 36 heading buckets, swept-bucket filling
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Gauge/ThermalAssistantRenderer.cpp — Thermal assistant drawing: normalisation, advisor centroid, glider marker
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Engine/ThermalBand/ThermalEncounterBand.cpp — Thermal band slices, decimation, encounter merging (with ThermalBand.cpp, ThermalSlice.cpp, ThermalEncounterCollection.cpp)
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Renderer/TrailRenderer.cpp — Snail trail colour scale and range clamps, drift, colour-run merging and batched drawing
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Look/TrailLook.cpp — Trail colour ramps (VARIO_1, VARIO_2, altitude) and widths
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Engine/Trace/Point.cpp — Trace points store netto vario; drift factor
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/BasicComputer.cpp — Vario source order, netto, estimated TAS from GS + wind, track from consecutive fixes, heading from track + wind
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/FlyingComputer.cpp — Take-off and landing detection, take-off altitude used for H T/O
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/AverageVarioComputer.cpp — 30 s window average, reset on circling/cruise change
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/GlideRatioCalculator.cpp — GR Avg ring buffer and UpdateGR angle filter (with GlideRatioComputer.cpp)
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Engine/GlideSolvers/GlidePolar.cpp — Take-off speed = Vmin/2; crosswind L/D over ground formula
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/InfoBoxes/Content/Factory.cpp — InfoBox catalogue: names, captions, descriptions
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/InfoBoxes/Content/Thermal.cpp — TC 30s, T Avg, circle diameter, thermal assistant InfoBox
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/InfoBoxes/Content/Altitude.cpp — Height above take-off
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Engine/Contest/Solvers/XContestFree.cpp — XContest / DHV-XC free distance: 4 legs, scoring factors
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Engine/Contest/Solvers/XContestTriangle.cpp — XContest triangle: closing gap rule, scoring factors
- https://github.com/XCSoar/XCSoar/blob/master/src/Device/Parser.cpp — LK8EX1 parser: vario goes in as the non-compensated vario
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/doc/manual/en/ch06_atmosphere_and_instruments.tex — Manual: wind estimation, thermal profile, thermal locator, thermal assistant (L92-317)
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/doc/manual/en/ch05_glide_computer.tex — Manual: flight modes ('about 30 s', stale vs code), Auto MacCready, safety heights
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/doc/manual/en/ch03_navigation.tex — Manual: snail trail and drift compensation (L381+)
- https://download.xcsoar.org/releases/7.45/XCSoar-manual.pdf — Published 7.45 manual PDF (built from the LaTeX above; not downloaded)
- https://www.xcsoar.org/docs/ — XCSoar documentation index
