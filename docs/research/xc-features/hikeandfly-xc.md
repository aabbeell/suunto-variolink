# XC features research: hikeandfly-xc

## Key points
- Every pilot-facing source ranks the vario first, then altitude and ground speed, so these are the always-visible core. A 10-20 s averager (Farina uses 16 s, about one turn) is what pilots use for thermal decisions.
- Per-phase priorities: (1) hike: vario readiness/battery, height still to climb to launch and ETA, time to sunset, weather trend; (2) launch: altitude calibration, take-off elevation, glide needed to the LZ; (3) thermalling: averages, gain versus the last thermal, wind from circling drift, a lost-thermal map; (4) glide: sink, ground speed, glide ratio, height above landing; (5) final glide: height above, distance to and glide needed to the LZ, wind direction for landing.
- True AGL is not possible: XCSoar's H AGL needs a terrain file and SuuntoPlus exposes no terrain data. Substitutes are height above take-off (auto-zeroed, like a QFE) and height above a user-set landing elevation, clearly labelled.
- Wind can be estimated only while circling, from the swing of GPS ground speed around the circle (XCSoar fits it to a cosine; pilots use the lowest ground speed as into-wind). At 1 Hz that is about 18-20 samples per 360, workable for direction and coarse for speed. Pilots and XC mag warn GPS wind is poor on glide.
- Pilots mainly want a thermal map to get back to a lost thermal, ideally corrected for wind drift. They warn against 'dot-chasing' and against 1 Hz lag, so it should be a secondary aid.
- The build library knows undocumented resources the reference doc lacks: separate lat/lon/altitude location fields, heading, bearing to a target location, watch battery level and phone-synced weather wind. A third-party store app already uses heading. Each must pass the probe app first, because a bad manifest path stops the app loading, and only 5 of 10 input slots are left.
- Not feasible without external data: airspace proximity, terrain clearance and task/turnpoint fields (Cazaux's goal/turnpoint arrival heights). Workable substitutes: one user-set ceiling alarm, an auto-stored take-off point, one landing set in settings or a Suunto POI (distance only).
- Safety set: tiered sink alarm (thresholds are design choices; the only threshold source found was not pilot-facing), height-above-landing alert, ceiling alarm, vario battery/link-lost, distance and direction home, time to sunset, storm/pressure trend. Alarms are coarse because the watch can only play 6 named sounds.

# Hike-and-fly and XC metrics for a wrist vario (Suunto Race S + UltraBip)

Read-only research, 2026-10-03. Every rank below is my synthesis across the sources cited. No single source ranks these fields this way. Text marked **(inference)** or **(design)** is my reasoning, not something a source states. Everything quoted from sources is paraphrased.

## 0. Legend: data sources and how to read the verdicts

| Code | What it is | Where it comes from |
|---|---|---|
| **V** | UltraBip `$LK8EX1` at 10 Hz: pressure in Pa, QNE altitude, vario in cm/s, temperature, battery (1000 + %) | docs/research/ultrabip.md §5.1 |
| **VG** | UltraBip `$GPRMC`: ground speed and course. Only with a GPS fix; never on a BlueBip | ultrabip.md §5.4; SPEC B3/B4 |
| **WG** | Watch GPS: `/Activity/Current/Speed` (R L281) and `/Fusion/Location/GeoCoordinates` (R L655, an *object* in the doc) | see the note below |
| **WB** | Watch barometer: `/Fusion/Altitude` (R L515), `/VerticalSpeed` (L574), `/SeaLevelPressure` (L630), `/PressureTrend` (L529), `/Ascent` (L546) | reference |
| **WX** | Other watch resources: `/Outdoor/Sunset/ETE` (R L829), `/Outdoor/StormAlarm/Status` (L801), `/Navigation/Poi/Active/Distance` (L684), `/Navigation/Targetlocation/Distance` (L782), `/Navigation/Routes/NavigatedRoute/RemainAscent` (L740), heart rate | reference |
| **T** | The 1 Hz evaluate tick (main.js has no sub-second clock) | SPEC D7 |
| **S** | User settings: take-off elevation, landing elevation, QNH, landing coordinates, ceiling altitude, deadline | data.json must stay under ~2 KB (deep-dive limits.md) |
| **EXT** | Data a watch app cannot reasonably hold: terrain DEM, airspace, waypoint/task files | — |

**Important platform finding (needs a hardware check before anything depends on it).** The build library's known-resource table (`~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/lib/project/resource-common.js`, tools 2.1.5) lists paths that the reference doc does not document:

- scalar `/Fusion/Location/GeoCoordinates.latitude`, `.longitude` and `.altitude`
- `/Fusion/Location/GeoAccuracy`
- `/Fusion/Heading`, `/Fusion/Heading/IsCompass`, `/Fusion/Compass/Heading`
- `/Navigation/Targetlocation/Bearing`
- `/Device/Power/BatteryLevel`
- `/Weather/Current.windDeg` and `.windSpeed`

SPEC §8.3 says no heading resource exists; that is true of the reference doc only. The project's own forum research reports that the store app Gustin draws a forecast-wind arrow relative to the fused heading, and that `/Weather/Current` lacks windGust on the watch (docs/research/forum-projects.md L32, L111). So a heading resource very likely works on hardware. Two rules apply:
- A nonexistent path in manifest.json stops the app loading (R L133), so every new path must go through the probe app first.
- An app may have at most 10 inputs (R L133). ble_vario already uses 5: slp, walt, wvs, spd, um. That leaves room for exactly 5 more, for example lat, lon, heading, sunset ETE and storm or watch battery. **(design)**

Verdicts: **Yes** = computable from V/VG/WG/WB/WX/T/S. **Partial** = computable with caveats, or only with a setting the pilot must enter. **Proxy** = the real metric needs EXT, but a useful substitute exists. **No** = needs EXT.

Field names in brackets are XCSoar InfoBoxes from `src/InfoBoxes/Content/Factory.cpp` at commit b252ae6 (line numbers given as XCS Lnnn).

---

## 1. What pilots say matters (the evidence behind the ranks)

**Competition and XC.**
- Charles Cazaux's one-page comp layout, as reported in [XC160] "Competition guns":
  - vario
  - barometric and GPS altitude
  - current L/D and ground speed
  - arrival height, distance and glide required, both to goal and to the turnpoint
  - start-time items, airspace and an alarm
- Chrigel Maurer, in the same article: know exactly what you need and what each field does. Cazaux: set the page up so you never touch the instrument in flight.

**Regular XC.** [XC160] "Getting up and away":
- QNE and GPS altitude for airspace; QNE is the legal reference.
- Pilots look at ground speed as much as at the vario averager, because speed rises as you are drawn towards a climb.
- GPS-only wind is approximate, because the instrument does not know the airspeed.

[XC160] "Need to know": GPS wind comes only from drift while circling and works poorly on glide.

[XC160] "The regular XC pilot": World Cup pilot Adrian Thomas wants an audio warning before he would hit airspace on his current course or climb, plus a snail trail.

**Field by field.** [Farina21] covers these fields in order:
- Thermal mapping indicator. The "black dot" is unreliable in weak climbs; do not chase it.
- Vario averager. He sets 16 s, about one full turn.
- Ground speed. Into wind, accelerate until ground speed is near trim airspeed, about 36-37 km/h. Ground speed also feeds the wind estimate.
- Distance to goal.
- L/D needed to goal. About 8:1 in zero wind; his arrival alarm is set at 10:1.
- Current L/D. Doubling the sink halves the glide.
- Last transitional glide.
- Glide made good.
- L/D to next turnpoint. He uses it to decide whether to stay with a climb.

**Hike-and-fly and minimalist set-ups.**
- Gavin McClurg [CBM], about 2020: for hike-and-fly he carries only three devices, a phone flight app, an XC Tracer mini and an inReach (the inReach is the safety item). He credits a flight app's airspace display with keeping him out of airspace in the X-Alps. He wants an audible "you can now glide to goal" alarm rather than a raw L/D number.
- Greg Hamerton [Hamerton]:
  - flying is about ten times faster than walking, so any flyable moment is worth taking
  - only hike up when flying gives a real shortcut or a chance to soar
  - watch the weather constantly
  - carry a satellite messenger
- Robert Schaller's vol-biv guide [Schaller teaser]: altitude matters even more in vol-biv. A 1 m/s thermal is 3,600 m/h, six to nine times a hiker's pace.
- The developer of the Garmin app XCTracey (2020) designed a watch display for hike-and-fly and tandem: fields glanced at now and then, next to an audio mini-vario [PGF t=99047 #1, #16]. His fields:
  - auto-calibrated baro altitude
  - barograph
  - speed and glide ratio
  - integrated vario
  - compass rose
  - auto launch/land detection
  - airtime, local time and battery
  - a rough wind estimate and where launch was (added later)
- A forum pilot said all he needs is altitude, ground speed and an audio vario [PGF t=107791 #3].
- Another flies with a Fenix 7X watch app alone [PGF t=107791 #4, t=107728 #7]. It shows ground speed, glide ratio, vario, heading, wind and a thermal assistant. He has to twist his wrist to read it, and the 1 Hz barometer adds lag.

**Suunto's own precedent.** The SuuntoPlus Red Bull X-Alps / Variometer feature [SuuntoXA] shows:
- horizontal speed and altitude
- a ±3 m/s vertical-speed bar with sound and vibration
- total ascent in the last thermal
- a north arrow

X-Alps athletes in 2019 used the Suunto 9 Baro to pace their effort and follow planned routes [SuuntoBlog2019]. They averaged 2,500-3,500 m of ascent per day on foot.

**Existing ble_vario reference set** (ultrabip.md §9): TracerLink fields, the UltraBip voice fields (altitude, speed, 10 s average climb, heading, flight time; maximum values after landing) and XCTrack's thermal detection rule.

---

## 2. Ranked metrics per phase

### 2a. Hiking up (hike-and-fly)

The watch's own sport-mode fields already cover vertical speed, ascent, heart rate and route navigation. The app's job on the hike is the things the native fields do not do.

| # | Metric | What it is for | Inputs | Verdict | Name elsewhere / evidence |
|---|---|---|---|---|---|
| 1 | **Vario ready: link, vario battery %, vario GPS fix** | Catch a flat or unconnected vario before reaching launch. The UltraBip must be on less than 5 min before the app connects (SPEC §2) | V (LK8EX1 field 4), VG, link state | Yes | XCTrack disconnection alarm (ub §9); [XC160] photo caption checklist (screen, beep, charge, logging) |
| 2 | **Height still to climb to launch, and ETA at current pace** | Pacing; arriving inside the flying window | WB/V altitude, S launch elevation, T (5-10 min average climb, m/h) | Yes **(design; the ETA is inference)** | Suunto route RemainAscent (R L740) is native when following a route |
| 3 | **Time to sunset, or to a user deadline** | Vol-biv and races: land, or reach the bivouac, before dark or curfew | WX `/Outdoor/Sunset/ETE` (R L829), S | Yes (1 input) | X-Alps 2025 mandatory rest window (second-hand, sources disagree: 22:30-05:00 [FPXA] vs 21:00-06:00 in a search summary; redbullxalps.com would not render) |
| 4 | **Weather trend: pressure trend and storm alarm** | Over-development while you walk | WB `/Fusion/Altitude/PressureTrend` (R L529), WX `/Outdoor/StormAlarm/Status` (R L801) | Partial | [Hamerton]; [PGE] warns conditions at launch can differ completely from the start of the hike. **Inference:** during large altitude changes the trend depends on the watch's alti/baro mode, so it is less trustworthy |
| 5 | Vertical pace (m/h) | Pacing | WB VerticalSpeed (R L574) or V | Yes (native field exists) | Suunto X-Alps feature [SuuntoXA] |
| 6 | Distance to launch | Navigation | WX POI distance (R L684) or route DistanceToDestination | Yes (native) | Paul Guschlbauer follows a planned route on the watch [SuuntoBlog2019]; Skytraxx hike mode shows a GPX route on the map [Skytraxx] |
| 7 | Heart rate | Pacing and effort | native | Native (low priority for the app) | XCSoar even has a Heart Rate box (XCS L1081) |

### 2b. At launch (pre-flight)

| # | Metric | What it is for | Inputs | Verdict | Evidence |
|---|---|---|---|---|---|
| 1 | **Altitude calibrated, with its source label** (ALT/QNH/QNE) | Every "height above X" number depends on it | V + WB + S | Yes (already in v0.1, SPEC D8) | TracerLink 2.1 added a calibration workflow with source labels [TL]; QNE is the legal airspace reference [XC160] |
| 2 | **Take-off elevation captured** (auto at take-off, or the known launch elevation from S) | Zero point for height above take-off; glide check | V/WB, S | Yes | XCSoar automatic take-off reference, like a QFE [H T/O] (XCS L684) |
| 3 | **Height above landing at launch, and still-air glide needed to the landing** = distance ÷ (launch − LZ − margin) | "Can I reach the LZ if nothing works?" | S landing elevation, plus landing coordinates (S or Suunto POI) for the distance | Partial (needs the LZ position) | [Final GR] (XCS L646), [Home AltD] (L1137) |
| 4 | Vario link, battery and GPS fix; watch GPS readiness | Pre-flight check | V, VG, WX `/Fusion/Location/Readiness` (R L665) | Yes | as in 2a #1 |
| 5 | Time to sunset | Window | WX | Yes | — |
| 6 | Launch wind | Launch decision | — | **No.** Without airspeed or an anemometer, instruments cannot measure wind on the ground. Phone-synced forecast wind (`/Weather/Current.windDeg/windSpeed`, undocumented) is synoptic, not the wind at launch | **inference** |

### 2c. Thermalling

| # | Metric | What it is for | Inputs | Verdict | Evidence |
|---|---|---|---|---|---|
| 1 | **Instant vario** (audio stays on the UltraBip; the watch shows it visually at 1 Hz) | Core feedback | V | Yes | Top of every list: [XC160] at all levels, Cazaux, [SuuntoXA], [TL]. A wrist barometer at 1 Hz is too slow for audio [PGF t=107728 #9, #12] |
| 2 | **Average climb over about one turn** (10-20 s, configurable) | "Am I winning?" in broken lift; better/worse than the last core | V, T | Yes | Farina sets 16 s [Farina21]; UltraBip voice uses 10 s; Cazaux lists a 20 s average [XC160]; [TC 30s] (XCS L133) |
| 3 | **Altitude, and height above take-off/landing; distance below a user ceiling** | Cloud base and airspace margin; vertical position | V/WB, S | Yes; ceiling is a **(design)** proxy for airspace | [XC160] Thomas's airspace warning when climbing; [Alt Baro] L381, [FL] L749 |
| 4 | **Thermal gain and current-thermal average; last-thermal and all-day averages** | When to leave (compare with the previous climb or the day's average) | V, T, circling state | Yes (gain is already in v0.1) | [TC Gain] L293, [TC Avg] L285, [TL Avg] L173, [T Avg] L622; Suunto feature shows last-thermal ascent [SuuntoXA]. Leave-when-below-average is MacCready-style reasoning **(inference)** |
| 5 | **Wind direction and speed from circling drift** | Thermal drift, where the next climb is, glide planning | VG/WG ground speed + track/course, T | Partial, valid only while circling | XCSoar fits ground-speed samples over a full circle to a cosine: amplitude = wind speed, phase = direction; circle quality is judged by turn-rate steadiness [CW, CirclingWind.cpp L20-34]. Pilots accept that GPS wind comes only from circling drift [XC160]. A pilot notes a 360 takes 18-20 s and the estimate lags [PGF t=112144 #6]. **(inference)** At 1 Hz that is about 18-20 samples per circle: workable for direction, coarse for speed |
| 6 | **Thermal map: track coloured by climb, or a lost-core marker** | Return to a thermal you left or fell out of | WG lat/lon (or VG course + speed dead-reckoning), V | Partial | Pilots mainly use it to get back to a lost thermal and want it corrected for wind drift [PGF t=112144 #2, #4]. Farina warns against "dot-chasing" and says it is unreliable in weak lift [Farina21]. A long-time XCSoar user stopped using its 360° thermal assistant because of the 1 s update and lag [PGF t=112144 #3] |
| 7 | Time in thermal | Pacing | T | Yes | [TC Time] L1063 |
| 8 | Circling detection (drives the page switch and wind) | Context-sensitive page | track or heading + V | Partial | XCTrack: ≥90° heading change in 30 s and 30 s vario ≥ −0.5 m/s; ends at <30° and below −0.5 [XCTman] |

### 2d. Gliding / transition

| # | Metric | What it is for | Inputs | Verdict | Evidence |
|---|---|---|---|---|---|
| 1 | **Sink rate** (with a sink alarm) | Lee side, sinking air: speed up or turn back | V | Yes | Doubling sink halves the glide [Farina21] |
| 2 | **Ground speed** | Head/tailwind feel; speed-bar use; drawn towards a climb | VG or WG | Yes | [XC160]; Farina's rule of thumb (trim ≈ 36-37 km/h) [Farina21]; Cazaux |
| 3 | **Glide ratio over ground** (about 20 s) | Can I reach the next ridge or the LZ? | ground speed ÷ sink, over a 20 s window | Yes (show only while sinking and above a minimum speed, ub §9) | [GR Inst] L149 (20 s), [GR Avg] L693; Cazaux's "current L/D" |
| 4 | **Height above take-off and above landing** (the "AGL" proxy) | Safety margin | V/WB, S | Proxy | True [H AGL] needs a terrain file (XCS L124). See §4 |
| 5 | Glide since the top of the last thermal | Plan the next glide over similar terrain | WG positions + V | Yes (store one point) | [GR Cruise] L157; Farina's "last transitional glide" |
| 6 | Head/tailwind component | Into-wind speed-bar decision | last circling wind + track | Partial | [Head Wind] L862 |
| 7 | Distance and bearing to take-off / LZ | Way home; retrieve | WG + stored take-off point; LZ from S or POI | Partial | [Takeoff Dist] L981, [Home Dist] L598; XCTracey shows where launch was |
| 8 | Glide needed to the next point | Stay in the climb or go | target coordinates + elevation | Partial with S/POI, otherwise No | Farina's L/D to next turnpoint; [WP GR] L422 |
| 9 | Netto vario | Is the air itself rising or sinking? | needs airspeed + polar | Weak proxy: vario + a fixed trim sink **(inference)**; low value | [Netto] L470 |
| 10 | Airspace distance / terrain collision | Avoid infringement / terrain | EXT | No | [Near AS H/V] L838/L846, [Terr Coll] L870 |

### 2e. Final glide and landing

| # | Metric | What it is for | Inputs | Verdict | Evidence |
|---|---|---|---|---|---|
| 1 | **Height above landing** | Start the approach in time; outlanding decision | V/WB, S landing elevation (or take-off as QFE) | Yes with the setting | [Home AltD] L1137 |
| 2 | **Distance and direction to the LZ** | Final glide | WG + S/POI | Partial (POI gives distance natively, R L684; bearing via the undocumented Targetlocation/Bearing or computed in the app) | [Home Dist] L598 |
| 3 | **Required glide to LZ vs current glide → arrival height** | Go / stay-and-climb; arrival alarm | 2e #1 + #2 + 2d #3 | Partial | [Fin GR] L646, [Fin AltD] L237. Farina: ~8:1 zero wind, his alarm at 10:1. McClurg wants an audible "can make it" alarm |
| 4 | **Ground speed, and minimum ground speed in a slow circle = into wind** | Landing direction without a windsock | VG/WG | Yes (speed); Partial (direction) | Flybubble landing guide: at trim (~37 km/h) the lowest GPS ground speed in a slow circle points into wind [FB-land] |
| 5 | Sink alarm | Turbulence, lee rotor near the LZ | V | Yes | §3 |
| 6 | Time to sunset | Land before dark | WX | Yes | — |
| 7 | Flight time | Logging | T | Yes (v0.1) | [Flt Duration] L406 |

### 2f. Post-flight summary (short)

- maximum altitude, best climb, flight time and best thermal gain (all in v0.1)
- straight-line distance from take-off ([Takeoff Dist] L981; a free-distance proxy **(inference)**)
- average glide
- percentage of time climbing ([% Climb] L398)
- vario link quality

After landing, the UltraBip's own voice reads maximum height, speed, climb and duration [UBrev].

---

## 3. Safety items (all phases)

| Item | Computable | Notes |
|---|---|---|
| **Sink alarm** | Yes (V) | The only threshold source found is a non-pilot vario document listing presets of off/−1/−2/−3 m/s. Treat those as typical defaults, not advice. **(design)** Two tiers: a user-set sustained-sink alarm (default about −3 m/s for 3 s), plus a high-descent alarm (default about −8 m/s for 3 s) for spirals or a frontal. The watch can only play the 6 named sounds, with vibration only if the pilot enabled it (SPEC D2), so alarms are coarse |
| **Height above landing below a threshold** | Yes with S | **(design)** User-set, e.g. 300 m: "commit to the landing". No pilot source gave a number I could verify |
| **Ceiling alarm** (cloud base or airspace top) | Yes with S | The airspace proxy. Thomas's audio warning before hitting airspace [XC160]. Use QNE/FL when the limit is a flight level (QNE mode already exists) |
| **Vario battery and link lost** | Yes | LK8EX1 field 4; XCTrack's disconnection alarm; the v0.1 fallback to the watch barometer (SPEC D9) |
| Watch battery | Partial | `/Device/Power/BatteryLevel` is undocumented. A wrist vario app used 6-7 %/h on a Fenix 7X [PGF t=107791 #6] |
| **Distance and direction back to take-off / LZ** | Partial | Store take-off lat/lon at detection (2 floats); the LZ from S or Suunto POI |
| Time to sunset / deadline | Yes | WX Sunset ETE |
| Storm / pressure trend | Partial | WX/WB, mainly on the hike |
| Emergency comms | Out of scope | inReach recommended by both McClurg and Hamerton |

---

## 4. Needs data the watch cannot have, and the substitutes

**AGL altitude (asked for by name).**
- A true AGL is **not possible**. XCSoar computes [H AGL] as navigation altitude minus terrain elevation from a terrain file (XCS L124). The SuuntoPlus reference has no terrain or elevation resource, and a DEM tile cannot fit the ~2 KB data.json / ~4 KB allocation limits.
- Substitutes:
  - (a) height above take-off, auto-zeroed like a QFE ([H T/O] L684)
  - (b) height above a user-set landing elevation
- The pilot must see the label clearly, so it is never read as clearance above the terrain below. **(design)**

**Airspace.**
- [Near AS H/V] (L838/L846) and the moving map need OpenAir data. XCTracey's developer considered one tiny OpenAir file but held back because of memory [PGF t=99047 #16].
- Substitute: one user ceiling (§3).

**Waypoints and tasks.**
- Everything Cazaux lists for goal and turnpoints, plus the WP/Fin/AAT/Alternate InfoBoxes, needs a task.
- Substitutes:
  - auto take-off point
  - one LZ (latitude/longitude/elevation as short settings strings)
  - Suunto's native POI navigation, for distance only (R L684)

**Polar.** For netto, MacCready and wind-corrected arrival, 2-3 numbers in settings would be enough, but the value at 1 Hz with no airspeed is low **(inference)**.

---

## 5. Hike-and-fly vs XC: how the priorities differ

**Hike-and-fly**
- Minimal, glanceable, autonomous. The display is looked at now and then, next to an audio mini-vario.
- The open questions are "will flying save me walking, and can I get down safely to where I want to be?" [Hamerton], [Schaller].
- Priorities:
  - hike pacing toward the launch altitude
  - daylight
  - weather trend
  - battery autonomy (solar UltraBip [UBrev]; the XC Tracer rarely needs charging [CBM])
  - height above landing / take-off
  - distance back
  - simple ground speed and glide
- Scoring does not need instrument features: the Hike and Fly XC league scores hiking and flying together like an online XC contest, on foot only, with no lifts [HFXC].

**XC**
- Climb-quality comparison: average, thermal average, last thermal.
- Ground speed, current glide and glide made good.
- Wind.
- Required glide and arrival height to goal or turnpoint.
- Airspace [XC160], [Farina21].
- On a watch, the task and airspace items are out of reach. Without EXT, the realistic XC set is: averages, gain, wind, glide and distance from take-off.

## 6. Suggested wrist layout (**design**, built from the ranks above)

1. **Always visible:** large vario number, 10-20 s average, altitude with source label, and a one-line status (link, vario battery %).
2. **Context switch:**
   - **Circling** (XCTrack rule): thermal average and gain, wind, a small thermal map.
   - **Straight:** ground speed, glide ratio, height above landing, distance and direction home.
   - **On the ground** (hike/launch): height and ETA to launch, sunset ETE, vario readiness.

Wrist reading costs a wrist twist [PGF t=107728 #7], so keep at most 4 numbers per state.

## Sources (short tags)

- [XC160]: Miller & King, "Which flight instrument is right for you?", XC mag, 11 Nov 2015.
- [Farina21]: Kelly Farina, "Using technology when it matters", XC mag, 18 Jun 2021.
- [Schaller teaser]: XC mag, "The beginners' guide to vol-bivouac" (paywalled; teaser only).
- "Instruments for adventure" (Marcus King, XC mag, Dec 2025) is paywalled; only the teaser was read, and it is not relied on.
- [UBrev]: XC mag Stodeus UltraBip review.
- [Skytraxx]: XC mag Skytraxx 2.1 review, 2 Dec 2019 (hike mode = GPX route on the map, hike logging, FANET "on ground"). A search summary also claimed "altitude difference / remaining distance" fields; the article text does not confirm this, so it is not used.
- [HFXC]: XC mag news on the Hike and Fly XC league.
- [CBM]: Gavin McClurg, "The Flying Gear Post", Cloudbase Mayhem, about 2020.
- [Hamerton]: Greg Hamerton, "How to hike and fly safely", flywithgreg blog.
- [PGE]: paraglidingequipment.com, "Hiking tips for cross-country paragliding".
- [FB-land]: Flybubble, "A simple approach to paraglider landing setups", 14 Aug 2019.
- [SuuntoXA]: Suunto support page, "SuuntoPlus Red Bull X-Alps".
- [SuuntoBlog2019]: Suunto blog, "Chasing the Eagle across the Alps", 2019.
- [FPXA]: freedom-parapente, X-Alps 2025 summary.
- [TL]: TracerLink App Store listing.
- [PGF t=…]: paraglidingforum.com threads 112144 (2024), 107791 (2022), 107728 (2022-24), 99047 (2020-).
- [XCTman]: xctrack.org/Manual.html (thermalling detection).
- [XCS Lnnn] / [CW]: XCSoar at commit b252ae6, `src/InfoBoxes/Content/Factory.cpp` and `src/Computer/Wind/CirclingWind.cpp`.
- [R Lnnn]: SUUNTOPO/reference/suuntoplus_reference_docs.md.
- resource-common.js: the SuuntoPlus tools library inside editor 1.42.0.


## Sources
- https://xcmag.com/magazine-articles/which-flight-instrument-is-right-for-you-full-article-from-xc160/ — Miller & King, XC mag 11 Nov 2015: needs by pilot level; Cazaux's one-page comp list; QNE/GPS altitude; ground speed vs averager; GPS wind only while circling; Thomas's airspace audio warning
- https://xcmag.com/magazine-articles/using-technology-when-it-matters/ — Kelly Farina, XC mag 18 Jun 2021: thermal-mapping caveats, 16 s averager, ground speed rule of thumb, distance/L-D to goal, current L/D, last glide, L/D to next turnpoint
- https://xcmag.com/magazine-articles/the-beginners-guide-to-vol-bvouac/ — Robert Schaller vol-biv guide teaser: altitude matters most; 1 m/s = 3,600 m/h, 6-9x hiking pace (paywalled body not read)
- https://xcmag.com/gear-guide/paraglider-reviews/stodeus-ultrabip-review/ — UltraBip review: solar, BLE to apps, voice statistics after landing, hike-and-fly tracking profile
- https://xcmag.com/gear-guide/paraglider-reviews/skytraxx-2-1-review/ — Skytraxx 2.1 review, 2 Dec 2019: hike mode shows a GPX route, logs the hike, tells FANET you are on the ground
- https://xcmag.com/news/new-hike-and-fly-online-league-launched-by-x-alps-race-director/ — Hike and Fly XC league: scores hiking plus flying, on foot only, no mechanical help
- https://xcmag.com/gear-guide/paraglider-reviews/technology-reviews/instruments-for-adventure/ — Marcus King, Dec 2025, paywalled; only the teaser was read (simple solar beeper for adventure trips); not relied on
- https://www.cloudbasemayhem.com/the-flying-gear-post/ — Gavin McClurg (~2020): hike-and-fly carries phone app, XC Tracer mini and inReach; airspace display saved X-Alps penalties; wants an audible glide-to-goal alarm
- https://blog.flywithgreg.com/how-to-hike-and-fly-safely/ — Greg Hamerton instructor blog: flying ~10x faster than walking, only hike up for a real shortcut, monitor weather, carry a satellite tracker
- https://paraglidingequipment.com/blog/hiking-tips-for-cross-country-paragliding-2/ — Hiking tips: weather at launch can change from the start of the hike; small audio vario for hikes
- https://flybubble.com/blogs/blog/a-simple-approach-to-landing-setups — Flybubble 14 Aug 2019: lowest GPS ground speed in a slow circle (trim ~37 km/h) points into wind for landing
- https://www.suunto.com/Support/Product-support/suunto_9/suunto_9/suuntoplus-baro/suuntoplus-red-bull-x-alps/ — Suunto's SuuntoPlus X-Alps/Variometer: speed, altitude, +/-3 m/s bar with sound and vibration, last-thermal ascent, north arrow
- https://us.suunto.com/blogs/blog/chasing-the-eagle-across-the-alps/ — Suunto 2019: X-Alps athletes on Suunto 9 Baro for pacing and route following; 2,500-3,500 m ascent per day
- https://www.freedom-parapente.fr/en/blog/everything-you-need-to-know-about-x-alps-2025 — Second-hand X-Alps 2025 summary: rest 22:30-05:00, one night pass (conflicts with other summaries; official site would not render)
- https://apps.apple.com/app/id6480346155 — TracerLink (Apple Watch + UltraBip/XC Tracer): large values, Focus Mode, haptics, altitude calibration with source labels, ground speed/course/glide
- https://www.paraglidingforum.com/viewtopic.php?t=112144 — Wind and thermal info in instruments (2024): wind averaging windows, lost-thermal use case, drift correction, XCSoar thermal assistant lag at 1 Hz, 18-20 s circle for wind
- https://www.paraglidingforum.com/viewtopic.php?t=107791 — Smartwatch recommendations (2022): a pilot needs only altitude, ground speed and audio vario; Garmin My Vario fields; 1 Hz baro limit; 6-7 %/h battery
- https://www.paraglidingforum.com/viewtopic.php?t=107728 — Apple Watch Ultra as vario (2022-24): wrist ergonomics, twisting to read, 1 Hz barometer limits
- https://www.paraglidingforum.com/viewtopic.php?t=99047 — XCTracey Garmin app (2020-): hike-and-fly/tandem watch display fields; wind; where launch was; airspace held back by memory
- https://xctrack.org/Manual.html — XCTrack thermalling detection rule (90 deg in 30 s and 30 s vario thresholds); airspace proximity widget
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/InfoBoxes/Content/Factory.cpp — XCSoar InfoBox definitions (H AGL L124, TC 30s L133, GR Inst L149, GR Cruise L157, TL Avg L173, Fin AltD L237, TC Avg/Gain L285/293, Wind L317/325, Netto L470, T Avg L622, Fin GR L646, H T/O L684, GR Avg L693, Near AS L838/846, Head Wind L862, Terr Coll L870, Takeoff Dist L981, TC Time L1063, Home AltD L1137)
- https://github.com/XCSoar/XCSoar/blob/b252ae6ea412557ffc956c9c1d9681355497cab8/src/Computer/Wind/CirclingWind.cpp — XCSoar circling wind: ground-speed samples over a full circle fitted to a cosine; circle quality from turn-rate steadiness (L20-34)
- PROJECTS/SUUNTOPO/reference/suuntoplus_reference_docs.md — SuuntoPlus reference: input limit and nonexistent-path rule L133; Speed L281; Fusion/Altitude L515-630; GeoCoordinates L655; Readiness L665; POI distance L684; RemainAscent L740; Targetlocation L782; StormAlarm L801; Sunset ETE L829
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/lib/project/resource-common.js — Build library known-resource table (tools 2.1.5): undocumented location lat/lon/altitude, GeoAccuracy, Fusion/Heading, Compass/Heading, Targetlocation/Bearing, Device/Power/BatteryLevel, Weather/Current wind; unverified on hardware
- PROJECTS/SUUNTOPLUS-SENSORS/docs/research/forum-projects.md — Project research: store app Gustin draws wind relative to fused heading; /Weather/Current lacks windGust on the watch (L32, L111); Suunto Variometer/X-Alps apps exist
- PROJECTS/SUUNTOPLUS-SENSORS/docs/research/ultrabip.md — LK8EX1 field layout incl. battery (5.1), RMC (5.4), wrist display reference set incl. XCTrack and UltraBip voice fields (section 9)
- PROJECTS/SUUNTOPLUS-SENSORS/docs/ble_vario/SPEC.md — Current spec: D2 sounds only, D7 1 Hz tick, D8 altitude calibration, D9 watch-baro fallback, section 8.3 no documented heading, current 5 manifest inputs
