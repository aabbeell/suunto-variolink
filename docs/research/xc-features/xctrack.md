# XC features research: xctrack

## Key points
- XCTrack computes wind only from GPS points after a full circle; the compass is not used (developer, issue #974). There is no straight-flight method. It fails in strong wind with fast gliders (#594, still open) and shows 0/N instead of unknown when no circle is flown (#713).
- XCTrack thermalling detection: start = heading change >= 90 deg in 30 s AND 30-s average vario >= -0.5 m/s; end = < 30 deg in 30 s AND 30-s average < -0.5 m/s. By default it auto-switches to the thermal-assistant page. Thresholds are editable in Pro since 1.0.0 RC1 (2026).
- XCTrack colours the track by lift only inside the Thermal Assistant. Colouring on ordinary maps is still an open request (#94, #1032). Drift modes: None, Classic (point + drift x age, default), Particle (point + drift x dAlt/(vs+1)). Recommended scale for paragliders is 120 m.
- XCTrack AGL = GPS altitude minus downloaded terrain tiles (zero without them). The DEM source is not documented. The SuuntoPlus reference has no terrain resource, so on the watch use height above take-off and label it honestly (inferred).
- XCTrack thermal gain = altitude now minus altitude at detected thermal start. There is no thermal-average-climb widget (#198 open). Glide-ratio averaging is capped at 1 min (#764). The acoustic strength average is 10 s, altitude statistics use 20 s, thermalling detection uses 30 s.
- Best implementable watch reference: My Vario (Garmin, GPL). It has 8-sector wind (speed = (max-min)/2, direction = heading at max + 180, accepted only for roughly opposite sectors), a 180-sample integer ring, a 9-colour lift-coloured varioplot, a climb-weighted thermal core over 60 s with wind drift, and a circling auto-switch.
- Other watch precedents: Flightmeter (last-minute lift circles, auto-show when lift > 1 m/s), VarioTracker (climb-coloured ~250 m trail, glove-safe long-press exit), XCTracey (wind from a full or half circle, green/red height above launch, glide shown only when sinking), TracerLink (UltraBip on Apple Watch, Focus Mode, haptics; no wind or thermal map listed).
- SuuntoPlus budget (inferred): capping the trail at about 60 drawn points keeps the worst case (colour change every point) at about 180 canvas ops; 5 B/sample means 120 samples is about 600 B. Course must be derived from successive positions or from UltraBip RMC.
- Developers report that Garmin does not allow paragliding-labelled apps, so they market them for 'sailplanes'. This is not sourced to a Garmin policy page. Check Suunto's partner rules before the store listing says paragliding (inferred).

# XCTrack and paragliding watch apps: fields, algorithms and wrist UX (research for the SuuntoPlus UltraBip app)

Tags used below: **[confirmed]** = stated in a primary source I read. **[inferred]** = my reasoning or design suggestion. **[not found]** = I searched and found nothing. All sources are listed at the end; GitLab issue numbers refer to `gitlab.com/xcontest-public/xctrack-public/-/issues/<n>`.

---

## 1. Fields pilots use most, and typical thermalling and gliding pages

### 1.1 XCTrack widget set (AIR³ "XCTrack Pro widgets" manual) [confirmed]
- **Flying widgets** ([AIR³ flying]):
  - Ground speed. Airspeed (= ground speed corrected by computed wind, so it needs a full circle first). Bearing.
  - GPS altitude, Baro altitude (QNH or QNE), AMSL, Flight level.
  - **AGL** ("current GPS altitude above ground", needs installed terrain). **Altitude above take-off**.
  - **Vertical speed**: the text vario, with a user-set averaging interval. The manual says a longer interval shows "how effective the climb is".
  - **Vario bar**: coloured column, lift half on top, marks at 1, 2, 3 and 4 m/s, with its own averaging.
  - **Glide ratio**: averaged. There are variants for sinking (with or without the "1:" prefix) and for climbing, where it can show the vario instead.
  - Air time, Sunset and Civil twilight, Vertical graph (altitude history over 5 s to 15 min).
- **Air widgets** ([AIR³ air]):
  - Wind speed and Wind direction, both "computed ... after completion of a full circle". Either can be replaced by an external sensor or a weather station.
  - **Thermal assistant**, **Thermal gain**.
  - **Altitude statistics** (Pro): a per-100 m altitude-slice graph of thermal strength, wind or ground speed.
  - QNH, air temperature and humidity.
- Since 0.9.6 (2021-06-08), the vario and glide widgets show their averaging interval in the widget title [changelog].
- Since 1.0.0 RC1 (2026-06-02):
  - a windsock style for the compass wind indicator;
  - pilot-editable thermalling thresholds (Pro);
  - an optional competition-task overlay on the thermal assistant (Pro) [changelog].
- The JavaScript interface exposes only these fields: lon, lat, time, altGps, isValid, stdBaroAlt, pressure, speedGps, speedComputed, bearingGps, heading, airspeed [xctrack JSI]. This list suggests what XCTrack treats as its core state.

### 1.2 Default page layouts
**Stock XCTrack page content: not retrieved [not found].**
- I checked the AIR³ Customize page, both Navigation pages and the Action-widgets page. None of them lists the preconfigured pages.
- What is confirmed is the automatic switching behaviour:
  - By default XCTrack switches to the **thermal-assistant page** when circling is detected, and switches back when circling ends [xctrack Manual; AIR³ preferences3].
  - On AIR³ hardware, the volume buttons can change page or zoom [AIR³ action].

Layouts documented by comparable instruments [confirmed per source]:
| Instrument | Thermalling page | Gliding / general page | "Big numbers" page |
|---|---|---|---|
| Skytraxx 2.1 (manual v1.0, 2018) | Thermal Assistant + 4 custom fields. It draws the computed thermal centre as a circle, wind-offset aware, and shows **a square or nothing when the data is not reasonable**. A wind arrow shows direction and strength. | "Classic": a compass aligned to the flight direction, a grey arrow for where the wind comes from, a vario bar with an average marker, and 3 custom fields. Map page with 4 fields. | "XXL": 3 freely chosen fields, very large |
| SeeYou Navigator / Oudie | The map auto-zooms in while circling and colours the tracklog by climb/sink. It zooms back out on exit. | Factory navboxes: altitude, AGL, ground speed, flight-phase indicator, time | - |
| My Vario (Garmin, round) | Varioplot: coloured track filling the screen. Corners: altitude (coloured by 20 s gain; while circling it adds thermal time and gain), vario, ground speed + scale, glide ratio, wind at left-centre. | General view: wind direction, wind speed, altitude, glide ratio (centre), heading, vario, ground speed | Vario view "Ring" (default) or "Large" |
| XCTrack on ActiveLook glasses (~320x200, 1 Hz) | Simple map that auto-switches to the thermal assistant | Default layout overlaps widgets: **Thermal gain disappears when not thermalling, and Vertical speed underneath becomes visible** | - |

**Summary of the most-used fields** [inferred from the overlap above, from XCTrack's widget list, and from the UltraBip voice set in `docs/research/ultrabip.md` §9]:
- **Thermalling:** instant vario (large), short average (about 10 s), thermal gain, time in thermal, altitude, wind (for drift), and the coloured track / thermal assistant.
- **Gliding:** altitude, height above take-off or AGL, average vario/sink, ground speed, glide ratio (only while sinking), wind arrow relative to the course.
- **Always:** flight time, link/battery state.

---

## 2. How XCTrack computes the key metrics

### 2.1 Wind [confirmed unless tagged]
- **Circling only, from GPS points only.**
  - Wind is computed "after completion of a full circle" [AIR³ air].
  - XCTrack developer jarda-manana (2023-04-04, #974): wind detection uses only GPS points; the compass is used only for the "being blown back" warning.
  - In #594 the same developer says the algorithm assumes "you're making perfect circle and you're blown by the wind".
  - **No straight-flight wind method exists in XCTrack.**
- **Known weaknesses:**
  - Strong wind with a fast glider gives wrong wind or no update (#594, opened 2020, still open, with a 2025 report: 70 km/h airspeed in 20 km/h wind).
  - Ridge soaring with only 180° turns gives no wind at all, yet the widget shows 0 and North instead of "unknown" (#713, open). The reporter calls this a safety risk.
- **Algorithm history** [changelog]:
  - 0.4.5 (2013): "reflect more immediate wind (as opposed to long term average)".
  - 0.4.8 (2014): fixed wind computing.
  - 0.5.1 (2014-11): improved algorithm.
  - 0.5.1.4 (2016): wind reset at take-off detection.
  - A new algorithm was tested in 2018 (#148). Testers reported it was better but slower to detect.
  - 0.9.5 (2021-02): external wind accepted from Digifly and XCTracer (LXWP0, LXWPW, PDGFTL1). 0.9.5.1 added a reverse-direction toggle, because XCTracer II and Maxx used opposite conventions (#667).
- **Uses of wind elsewhere in XCTrack:**
  - Airspeed widget.
  - Map orientation "downwind at top".
  - Thermal-assistant drift.
  - Altitude-statistics wind per 100 m slice.
  - The wind-speed widget changes colour by value (0.6.0, 2017).
- **Other apps' methods, not XCTrack:**
  - **My Vario** (`source/MyProcessing.mc` L639-712, credited to fiala's SkyDrop `wind.cpp`): 8 heading sectors of 45°. Within each sector it keeps the maximum ground speed and the heading where it occurred. Once the pilot has passed through ≥8 consecutive sectors in one rotation direction, it takes the max-speed and min-speed sectors. **It accepts the result only if they are 3-5 sectors apart (roughly opposite).** Wind speed = (max − min)/2; wind-from = heading at max + 180°.
  - **XCTracey** (Garmin): wind "based on the last full circle, or a half circle with return to the previous course", labelled experimental [XCTracey PDF].
  - **VarioTracker** (Garmin): "auto-derived from GPS speed and heading variation while turning".
  - The XCSoar description posted in #974 (heading at maximum speed; speed = half of max − min) is a forum paraphrase by a user, not XCSoar documentation. It omits the +180° needed for a wind-from direction.

### 2.2 Thermalling detection, thermal assistant and the "thermal map" [confirmed]
- **Detection rule** (defaults, editable in Pro since 1.0.0 RC1) [xctrack Manual; AIR³ preferences3]:
  - Start: heading change ≥ 90° in the last 30 s AND 30-s average vario ≥ −0.5 m/s.
  - End: heading change < 30° in 30 s AND 30-s average vario < −0.5 m/s.
- **The track is coloured by lift only inside the Thermal Assistant widget.**
  - Lift is shown by colour in the black/white themes, or by circle size in the e-ink theme [AIR³ air].
  - Colouring the track on the ordinary map widgets is still an open request (#94 from 2017, #1032 from 2023).
  - The only workaround was laying a transparent thermal assistant over a map widget at a fixed scale (#94, 2018). It broke when the map started re-centring the pilot.
- **Thermal-assistant options** [AIR³ air]:
  - Orientation: north, target, bearing, heading, downwind (needs wind), or travel direction.
  - Map scale: **120 m recommended for paragliders and hang gliders**, 250-400 m for faster gliders.
  - Adjustable track length.
  - Optional "show circle around nearest thermal".
  - Optional airspace, task and sun overlays.
- **Wind-drift modes for the drawn track** [AIR³ air]:
  - **None**: the track is drawn as flown (a corkscrew).
  - **Classic** (default): displayed point = original point + drift × point age.
  - **Particle drift**: displayed point = original point + drift × (current altitude difference / (vertical speed + 1)).
  - The drift modes were added in 0.5.1.5 (2016).
  - #1075 (open): with XCTracer external wind, the track drifts at roughly full wind speed, which a user doubts is realistic.
- **Thermal-core detection** exists. Its algorithm was changed in 0.4 (2013), and detected thermals can be drawn on maps, marked "experimental" [changelog]. **The algorithm itself is not documented [not found].**
- **Altitude statistics** (Pro, 0.9.6):
  - Vario averaged over 20 s per 100 m slice.
  - The maximum is kept for 40 min, then linearly aged to zero by 80 min.
  - Ground speed per slice is recorded only when the bearing standard deviation over the last 5 s is below 8 [AIR³ air].

### 2.3 Averages, gain, glide ratio and AGL [confirmed unless tagged]
- **Averages:**
  - Vertical speed and the vario bar: user-defined interval [AIR³ flying].
  - Acoustic "strength indication": 10 s (default) [AIR³ preferences2; Manual].
  - Thermalling detection: 30 s.
  - Altitude statistics: 20 s.
  - The glide-ratio averaging is capped at 1 min; requests for glide since the last thermal and longer windows are open (#764).
  - An average-climb-of-current-thermal widget is requested but not implemented (#198, open). The requester says LK8000 has it.
- **Thermal gain** = current altitude − altitude when thermalling start was detected [AIR³ air]. Time-in-thermal is an open request (#920).
- **Glide ratio**: "current glide ratio", with averaging. Values below 15 show one decimal. A "show vario in lift" option replaces the ratio with the vario while climbing [AIR³ flying; changelog 0.5.x]. A whole-flight average glide ratio was rejected as not useful (#820).
- **AGL**:
  - It is **GPS altitude minus downloaded terrain tiles** (Preferences > Maps > Terrain) and reads zero without them (#334, #365).
  - The developers declined to auto-zero AGL at launch, saying "we have to record what we get from GPS" (#587).
  - **The DEM source and resolution are not stated anywhere I could find [not found].** I am not asserting SRTM.

---

## 3. Watch apps for paragliding

### Apple Watch / Wear OS
- **TracerLink** (Vojtech Vondra, USD 9.99, watchOS 11+) [App Store]:
  - BLE from UltraBip, BlueBip or XC Tracer.
  - Shows vario battery, altitude with a source indicator, climb/sink, flight duration, and ground speed, course and glide ratio "where supported".
  - **Focus Mode**: one value larger.
  - **Haptic climb taps** with adjustable sensitivity.
  - Workout integration keeps the display active.
  - v2.1 added manual, QNH and GNSS-assisted altitude calibration.
  - **No wind and no thermal map are listed [not found].**
- **Vario One**: a standalone Apple Watch baro vario aimed at hike-and-fly; the thermal assistant is on the phone side. **Variometer+**: a standalone watch app with sound/haptic climb, optional ground speed and heart rate.
- **Flyskyhy**: lists Watch as a platform, but **the watch-side features are not documented [not found]**. Its phone app computes wind and shows lift spots on the map.
- **Riser** (Wear OS): two swipeable flight screens (vertical speed, altitude, ground speed, glide ratio; then distance, max altitude, time, battery), always-on ambient mode, power save below 30 %, volume on the crown, and a demo simulator.

### Garmin Connect IQ (round screens; store API read 2026-10-03)
- **My Vario** (open source, GPL-3, fork of GliderSK; v6.27, 4.9★) is **the most complete watch "thermal map"**:
  - **Varioplot data** (`MyProcessing.mc`, `MyViewVarioplot.mc`):
    - a 180-entry ring at 1 Hz holding integers: epoch, lat/lon in milliarcseconds, vario in mm/s, altitude;
    - drawn as **one `drawLine` per segment** with pen width 3, coloured from **9 buckets** (4 greens, grey for ±0.05 m/s, 4 reds);
    - thresholds at ±0.05/1/2/3 m/s, scaled ×2 or ×3 for the 6 or 9 m/s range setting;
    - the line breaks on gaps over 4 s;
    - a dot marks the current position.
  - **Plot settings**:
    - default plot range 2 min (`properties.xml`; 1-3 min);
    - default zoom 1 m/px (zoom table from 1000 down to 0.25 m/px, `MySettings.mc` L359-379);
    - North-up or heading-up;
    - pan/zoom with buttons.
  - **Thermal core** (`MyProcessing.mc` ~L477-535):
    - uses the last 60 s, keeping only points with climb > minimum climb (default 0.2 m/s);
    - weight = vario(mm/s) − 40·|Δalt m| − 10·age(s), floored at 0;
    - centre = weighted mean position; radius = weighted standard deviation;
    - drift offset = (alt − mean alt) × wind / mean climb, applied downwind;
    - drawn as a blue circle.
  - **Circling auto-switch** to the varioplot happens after 5 circling ticks, and back after 20 non-circling ticks (L355-372).
  - **Glide ratio** = −ground speed / vario. It is hidden when vario ≥ −0.005 × ground speed (glide > 200) (L597+).
  - **Kalman-filtered vario**, with vibration "tones" as an alternative to sound.
  - **Custom pages** with 2, 4 or 7 fields.
- **My Vario Lite / GlideApp**: forks. Lite runs on older watches with no zoom or pan. GlideApp adds SpO2 and a page-position indicator.
- **Flightmeter** (2019):
  - heading at top, speed, glide over the last 20 s, altitude;
  - a wind compass needle (changed red→blue);
  - a **"thermal tracker"**: the last minute of track with **lift circles sized by lift**. It auto-shows when lift > 1 m/s and returns after 30 s;
  - optional vibration per metre gained.
- **VarioTracker** (Fenix 8):
  - wind from turning; automatic QNH back-calculated from GPS;
  - a **track-up trail coloured by climb rate covering the last ~250 m**, with values around the edges;
  - **a long-press BACK is needed to exit, "so accidental glove presses can't kick you out"**;
  - no audio tone.
- **XCTracey** (German PDF manual):
  - 1 Hz display.
  - Altitude digits stay grey or red until calibrated. Height above take-off is **green above launch and red below**. Climb is green and sink red. The battery icon is colour-banded.
  - A 19-s mini barogram.
  - Vario integration defaults to 5 s and also drives the glide ratio.
  - **Glide ratio is shown only while sinking.**
  - A GPS compass rose appears only when moving, with a **green arrow to launch once more than 100 m away** (the manual's tip for "cloud suck").
  - On round watches, compass and speed sit in the centre and the vario at the bottom.
- **Others**:
  - "Variometer" (Hemera): vario text coloured by value, an "easythermic" centring aid, and a hard-deck alarm.
  - Cubio Vario Pro/Free (sailplane): a segmented tape, a **20-s average**, and Fast/Medium/Slow response.
  - GliderSK: supports only 240x240 round screens and needs about 150 KiB.
- **Store-policy signal [confirmed as developer statements; Garmin's own policy page not found]:**
  - My Vario and My Vario Lite state that paragliding apps are not allowed by Garmin, and market themselves for "sailplanes".
  - In Garmin forum thread 220549, a developer says Garmin discontinued paragliding apps as "high risk".
  - [inferred] Before the listing says "paragliding", check Suunto's partner rules. `docs/research/store.md` found no category or policy text.

---

## 4. Wrist UX lessons
1. **Switch pages automatically on circling.** XCTrack (90°/30 s rule), My Vario (5/20 tick hysteresis) and Flightmeter (lift > 1 m/s, back after 30 s) all do it. Gloved pilots should not have to press buttons in a thermal.
2. **Show context-dependent fields in the same slot.** On ActiveLook, thermal gain covers vertical speed only while thermalling. Glide ratio appears only when sinking (XCTracey, My Vario, XCTrack's "vario in lift").
3. **Encode state in colour as well as digits:**
   - green climb / red sink everywhere;
   - My Vario colours the altitude digit by 20-s gain ("very useful in weak thermals");
   - XCTracey colours height-above-launch green/red;
   - XCTrack and My Vario colour wind speed by value.
4. **Show "unknown" as a dash, never 0/N** (#713). Skytraxx changes its thermal circle to a square, or drops it, when data are poor.
5. **Have one big-value mode.** Examples: TracerLink Focus Mode, Skytraxx XXL, My Vario "Large".
6. **Use haptics on the wrist.** TracerLink, My Vario and Variometer+ use them. The UltraBip keeps the audio in this project.
7. **Protect against glove presses.** VarioTracker ignores a short BACK on the flight views.
8. **Mounting and battery tips from XCTracey:**
   - Turn the watch to the inside of the wrist, or strap it around a main carabiner.
   - Always-on backlight costs a lot of battery.
   - Pair the watch with a GPS mini-vario for sound and logging.
   - Riser uses an ambient always-on mode and a low-battery power-save mode.
9. **Update at 1 Hz and keep the text simple.** XCTrack drives ActiveLook at 1 Hz (vario up to 4 Hz with sub-1 s averaging), ASCII only, maximum brightness, auto-brightness off.
10. **Use about 120 m of map scale for paragliders** on any thermal map (XCTrack). Keep a short history: My Vario defaults to 2 min, Flightmeter shows 1 min, VarioTracker about 250 m.

---

## 5. Mapping this to the SuuntoPlus app [all inferred]
- **Wind:**
  - Start with the My Vario/SkyDrop 8-sector method. It needs 16 numbers of state and O(1) work per 1 Hz tick.
  - Inputs: ground speed (`/Activity/Current/Speed`) and a course computed from consecutive `/Fusion/Location/GeoCoordinates` fixes. Use the course only above about 1-2 m/s; My Vario's threshold is 1.0 m/s. The UltraBip `$GPRMC` course is an alternative when it has a fix.
  - The documented API has no course resource; the reference has only compass-heading formatters.
  - Show "--" until the first valid circle. Show the age of the estimate, or fade it.
  - **A least-squares circle fit** to the last 20-40 s of ground-velocity vectors would also handle partial circles. The fitted radius gives an airspeed sanity check: reject fits outside about 6-16 m/s for a paraglider.
  - **True straight-flight wind is not possible on a wrist.** The watch compass measures the arm, not the wing, and XCTrack does not attempt it either. The best a watch can do is a half circle with return to course (XCTracey).
  - Ignore LXWP0 wind fields: `ultrabip.md` notes they are not documented as sent.
- **AGL:**
  - The SuuntoPlus reference I grepped has no terrain or elevation resource, so true AGL is **not available from the documented API**.
  - Show **height above take-off**, zeroed at take-off detection, and call it "above TO", not AGL.
  - Optionally add a height above a user-entered landing elevation.
  - XCTrack's own AGL is GPS-based and needs a DEM, which a watch app cannot ship within the stated memory limits.
- **Thermal map within the canvas budget:**
  - Store per 1 Hz sample: Int16 dx and dy in metres, from equirectangular projection with cos(lat), plus Int8 vario in 0.1 m/s. That is 5 B per sample, so 120 samples ≈ 600 B, well under the 4 KB allocation cap.
  - Draw one stroke per run of same-colour samples, with 5 bins (strong sink / sink / neutral / lift / strong lift).
  - Worst case, the colour changes every point, so n points cost about 3n operations. **Capping the trail at 60 drawn points (2 s decimation over 2 min, or 1 Hz over 1 min) keeps the worst case at 180 ≤ 200.**
  - Split any run longer than 24 points.
  - Apply XCTrack "Classic" drift: shift each point by wind × age.
  - Scale about 0.7-1 m/px so the 466 px screen covers 300-450 m. Offer north-up first.
  - Cheaper fallback: Flightmeter-style lift markers. Check that the canvas has arcs first.
- **Fields to add next to the existing spec:**
  - thermal-average climb since entry, with time in thermal (XCTrack #198; LK8000);
  - glide ratio only while sinking;
  - ground speed;
  - wind arrow and speed;
  - a launch-direction arrow for hike-and-fly (XCTracey).
  - The spec already has the 10/15/20/30 s average choice, which matches common practice: XCTrack 10 s strength indication, Cubio 20 s, XCTracey 5 s, UltraBip voice 10 s.

## 6. Gaps and corrections
- The Skytraxx manual I found and read is for the **Skytraxx 2.1** (v1.0, 2018), not the Skytraxx 5. The Skytraxx 5 manual was not retrieved.
- **Not covered [not found]:** Syride and BurnAir field documentation; Oudie wind method; Flyskyhy watch-side features; XCTrack DEM source; XCTrack stock page layouts.
- The XCTracey manual describes the landing-wind tip as "half the sum" of the extreme speeds. Physically, wind is half the *difference*; half the sum is airspeed.


## Sources
- https://xctrack.org/Manual.html — Thermalling detection rule, auto page switch, acoustic vario 10 s averaging, weak-lift and disconnection alarms
- https://xctrack.org/Change_Log.html — Version history: wind algorithm changes 0.4.5/0.4.8/0.5.1, drift modes 0.5.1.5, external wind 0.9.5, altitude statistics 0.9.6, editable thermalling thresholds 1.0.0 RC1
- https://xctrack.org/ActiveLook.html — Small-display analogue: 1 Hz updates, vario up to 4 Hz, thermal gain overlapping vertical speed only while thermalling
- https://xctrack.org/JavaScriptInterface.html — Core state fields exposed to web widgets
- https://www.fly-air3.com/en/support/air3-xctrack-manual/xctrack-manual/xctrack-widgets-manual/xctrack-pro-widgets-air/ — Wind after full circle, thermal assistant options, drift formulas, 120 m scale, thermal gain, altitude statistics
- https://www.fly-air3.com/en/support/air3-xctrack-manual/xctrack-manual/xctrack-widgets-manual/xctrack-pro-widgets-flying/ — Flying widgets: AGL (GPS minus terrain), altitude above take-off, vertical speed, vario bar, glide ratio, vertical graph
- https://www.fly-air3.com/en/support/air3-xctrack-manual/xctrack-manual/preferences3/ — Automatic actions: thermalling detection window and thresholds, page switching
- https://www.fly-air3.com/en/support/air3-xctrack-manual/xctrack-manual/preferences2/ — Vario settings: 10 s averaging for strength indication
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/974 — Developer: wind from GPS points only; compass only for blown-back warning
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/594 — Wind algorithm assumes perfect circles; fails in strong wind with fast gliders (open)
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/713 — No wind without full circles; shows 0/N instead of a dash (open)
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/148 — 2018 wind algorithm rework, slower but better
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/94 — Coloured track on map widgets requested since 2017 (open); overlay workaround
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/1032 — Colour track by climb rate on XC/task map (open)
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/334 — AGL requires downloaded terrain data
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/587 — Developers decline auto-zeroing AGL at launch
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/198 — Average climb of current thermal requested (open)
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/764 — Glide since last thermal; glide averaging limited to 1 min
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/667 — External wind direction convention reversed between XCTracer models
- https://github.com/ydutertre/myvario — My Vario source: MyProcessing.mc (wind L639-712, thermal core ~L477-535, auto-switch L355-372, glide L597+), MyViewVarioplot.mc (drawPlot L190-279, colour scale L88-125/L326+), MySettings.mc (zoom table L359-379), resources/properties.xml (plot range default 2), USAGE.md
- https://apps.garmin.com/en-US/apps/28768354-927a-407e-8803-75af980bed6e — My Vario store listing: features; 'NOT for paragliding' statement
- https://apps.garmin.com/en-US/apps/4f901e19-29c8-4db1-9b22-af99ec310b97 — My Vario Lite: 'paragliding apps not allowed by Garmin' statement
- https://apps.garmin.com/en-US/apps/ce675556-d0dd-44b9-81d0-08120b5a8324 — Flightmeter: lift circles sized by lift over the last minute, wind needle, 20 s glide
- https://apps.garmin.com/en-US/apps/4393e3a3-56a6-40a6-a345-18fe60f4fc7a — VarioTracker: climb-coloured ~250 m trail, wind while turning, glove-safe exit
- https://apps.garmin.com/en-US/apps/f1aaa6b1-a3ab-49af-bd18-5c9b237cdff7 — XCTracey store listing (large wind widget mode)
- https://www.paraflightbook.de/downloads/XCTracey.pdf — XCTracey manual (German): colour coding, wind from full or half circle, wrist-mounting tips, glide shown only when sinking
- https://apps.garmin.com/en-US/apps/b26541c6-690c-4a3d-a649-316e666a35e1 — Variometer (Hemera): coloured vario text, easythermic, hard-deck alarm
- https://apps.garmin.com/en-US/apps/7afe3196-0b5c-45fc-a052-ffbcc5502fb7 — Cubio Vario Pro: 20 s average, segmented tape, response setting
- https://apps.garmin.com/en-US/apps/7cf7a0cc-dcde-482f-8667-eb4456526adb — GliderSK: original varioplot app, 240x240 round only, ~150 KiB
- https://forums.garmin.com/developer/connect-iq/f/discussion/220549/use-forerunner-fenix-for-paragliding — Developer report that Garmin discontinued paragliding apps as high risk
- https://apps.apple.com/app/id6480346155 — TracerLink: UltraBip on Apple Watch, fields, Focus Mode, haptics, calibration (v2.1)
- https://apps.apple.com/app/id1605797423 — Vario One: standalone Apple Watch baro vario for hike-and-fly
- https://apps.apple.com/app/id1636307202 — Variometer+: standalone Apple Watch vario with haptics
- https://apps.apple.com/app/id516879039 — Flyskyhy: wind, lift spots on the map; Watch listed but undocumented
- https://xcmag.com/paraglider-reviews/technology-reviews/naviter-seeyou-navigator-app-review/ — SeeYou Navigator: auto-zoom thermal assistant with coloured track, factory navboxes
- https://www.paradrive.ru/upload/iblock/ded/ded339a8d3ce858edb927ce0b7692e7f.pdf — Skytraxx 2.1 manual v1.0 (2018): Classic/Map/Thermal Assistant/XXL pages; circle becomes a square when data are poor
- PROJECTS/SUUNTOPO/reference/suuntoplus_reference_docs.md — SuuntoPlus API: /Fusion/Location/GeoCoordinates (L655-664); no terrain or course resource found; compass heading formatters only (L5935-5941)
