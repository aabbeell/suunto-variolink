# What SuuntoPlus developers are building and asking for (survey, 2026-10-03)

Scope: I read all 59 topics in forum category 62 (Suunto Plus Development) through the NodeBB JSON API. That includes "Share your projects" (14766, 97 posts), "Share your app ideas" (14765, 49), "No stupid questions" (14783, 155), "Simulator vs watch" (14767) and every bug/lesson thread. I also read every 2026 topic in category 46 (SuuntoPlus Sports Apps) plus older threads there on vario, topo and climbing. I title-scanned 2026 topics in Feature Suggestions and the per-watch categories. Outside the forum: Suunto's own "community-built apps" page (published 2026-07-09), Suunto's Open SuuntoPlus announcement (2026-03-11), two the5krunner articles (2026-03-11 and 2026-07-09), and GitHub (repo search, code search, READMEs). I checked the watch API against the local reference `PROJECTS/SUUNTOPO/reference/suuntoplus_reference_docs.md` and the editor extension `~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0`.

Timeline: Suunto opened SuuntoPlus to all developers on **2026-03-11**. Before that there was a closed partner beta; Live.τ and Indoor Climbing date from 2024–25. Anyone can develop and sideload for free. Publishing requires the Suunto Partner Program, an API Zone account and Suunto review.

---

## 1. Catalogue of implemented community projects

### 1a. In the SuuntoPlus Store per Suunto's own list (us.suunto.com page, datePublished 2026-07-09, 34 apps)
Authors are attributed only where the forum shows it. "(inferred)" marks a guess.

| Category | App | What it does | Author (forum/GitHub) |
|---|---|---|---|
| Running/trail | Sunmaxxi Pacer | live running power and split time | Woodster |
| | HR-Zone Tracker | high-contrast HR-zone view with automatic HR-based interval timers; 466×466 only, breaks on Vertical 1 | DonTomGot |
| | RunWarden Pacer / RunWarden Backyard | pace against target; backyard-ultra loop tracking | RunWarden |
| | Race Surgeon | segment-based race pacing: segment distances and paces typed as strings in phone settings; ahead/behind; big numbers | DonTomGot |
| | Constantin | pace and HR drift against the session average, canvas trend charts; went through many crash-fix releases | Łukasz Szmigiel |
| | Parkrun | QR barcode on the watch | ? |
| | Manual Interval+ | lap-driven intervals with a previous-interval panel; INT-INT, INT-REST and INT-FOCUS modes; ZoneSense zone shown | Thibault B. |
| | Live KME, Gap Mate, Biggies, Crowd Counter, Hexhunter | km-effort; GAP and delta; big numbers; event counter; hex territory game | Biggies by Markus Hornof; Hexhunter a student project (aaroM2303/HexHunterForSuunto) |
| Outdoor | GWE, Checkpoints, Gear Tracker, aLOOP, Duration Estimator, **Climb Log** | grade-adjusted hiking; 3 time checkpoints; gear wear; auto-lap at a point; terrain-aware ETA; **per-route climbing send/fail log by grade** | Checkpoints by harry08; Climb Log by skyfi (the published listing) and very likely the source repo `wylandplex/suuntoplus-climb-logger` v3.03 (inferred); Duration Estimator possibly isazi/TrailPredictor (inferred) |
| Water | VMG/VMC, Anchor Alarm, Wing Foil, Pump Foil | sailing VMG; anchor drag alarm (store id zzanch01); foiling stats | VMC by surfboomerang (inferred); Anchor Alarm by AYamshanov (github.com/ayamshanov/AnchorAlarm-for-Suunto); Pump Foil by rémiP |
| Indoor | Rest Timer, Treadmill Link (FTMS), ErgSynch (Concept2 PM5 over BLE), Strength Tracker (accelerometer rep counting) | | Rest Timer by Markus Hornof; ErgSynch by Martin Lillepuu; Strength Tracker by Joaquin |
| Community sport | Basketball Score, Hockey Timer, Beer Mile, Table Tennis Score, Tennis Score | | Basketball probably GhDero/Basket-ball-score (inferred); Beer Mile and Tennis are student launch apps |
| Cycling | Cycling Power Estimator | power from speed, grade and weight, no power meter; one user measured 3.2% off a real power meter | mickywickyftw |
| | Varia Radar | Garmin Varia rear radar over BLE | unknown |

### 1b. Published or announced after the July list (forum)
- **Gustin** (Łukasz Szmigiel, store 2026-08-08): weather. Current conditions plus a 7-hour forecast, with a wind arrow relative to fused heading. Site: gustin.szmigiel.design.
- **Paratio / parat.io** (JochenParat, store id zzpara01, live early August): a race app. Stuck at v1.3 during the store outage.
- **oSpotter** (gym sets, reps and rest, 20 exercise slots) and **oCycler** (FTMS indoor bike link): both by oleksandr, published 2026-09-01. **oTicker** (checklist for long activities) was submitted 2026-10-02.
- **StageQuest** (Joaquin, August): stitches several activities into one journey, a workaround for the missing "resume later".
- **Stifa** (climb pacing, uphill speed against HR), **Tymewear** (unofficial VitalPro breathing sensor), **S+ Breath** (breathing patterns), **Fat & Carbs**, **Aerobic Decoupling**: seen in user threads; authors not shown.
- **Hydra Nutri Tracker** froze the Race 2 and was **removed** from the store (August). Users complain about "AI-built apps" with no QA.
- **Notes** (surfboomerang): approved 2026-03-30; up to 10 notes of about 150–180 chars, entered as phone-settings strings. It is absent from the July list.
- Older partner-era apps still active: **Live.τ / LiveTracking** (Nikolai Simonov). It does live tracking, groups, push-to-talk and field notes through its own phone companion app over BLE, has an optional subscription, and is plagued by BLE disconnects. Also **Indoor Climbing** (omunoz / SuuntoSpace, ten stars on GitHub).

### 1c. Open source or sideload only (no store evidence)
- SportPet, a tamagotchi driven by HR zone (Maurice B. Madoff and friends)
- Aerobic Guide with short-term decoupling, a structured interval guide, and a Python FIT-replay model (matram; explicitly not publishing)
- Swim Drills (github.com/nousmc/Swim-Drills)
- Bosch eBike LDI live data: an ESP32 bridge plus a SuuntoPlus app (github.com/SellA/BoschEBikeESP32, github.com/SellA/BoschEBikeSuunto)
- FORM Smart Swim goggles HUD (zestuart/suunto-form, verified in water on Vertical 2)
- CGM / glucose: aenzed (Nightscout → phone BLE bridge → watch), Vadim Frolov (Android bridge to the pump), fralik/GlucoStride (MiniMed)
- VeloClimb: gradient, VAM, climb category (github.com/panoskrt/SuuntoPlusVeloClimb)
- Ski touring (clementchatelai/Suuntoplus; isazi/skitouring), Nuki lock (slavikpi/nuki_suunto)
- Badminton 3×15 (seb49/suunto-badminton-3x15; also ninkaninus)
- Hangboard (dominicegginton/hangboard), LiftCue strength (michaels19802/LiftCue), dual-threshold test (SuuntoSpace/lactate-power-test)
- Workout chart (Isotop7), trail-run climb-advisor guide generator (NikBrownTRP), MTB trail score / jump prototype (Ecki D., simulator only)
- Rucking with Pandolf (Hursty), Meshtastic receiver proposal (AYamshanov), speedsurfing Alpha 500 (surfboomerang), Woo kite idea (Egika)
- Indoor rower clone for Merach R50 (Josef Nilsson), GoPro status (alberto.munoz, exploring)

**Tooling projects:**
- **SyncFix** (SyncBypass): Android APK that re-pushes sideloaded apps after a phone sync wipes them, via a reverse-engineered BLE protocol. codeberg.org/haavist/SyncFix, git.sr.ht/~eppuh/SyncFix.
- **zappctl** (wylandplex): Linux BLE install, list and pull plus syslog download, with offline template rendering.
- **wfhub.net/flasher** (AYamshanov): browser USB filesystem viewer, research stage.
- A "suuntoplus skill" knowledge base (Łukasz Szmigiel, not yet published).

## 2. Recurring ideas and unmet demand
- **Internet data through the phone.** There is no HTTP or fetch. Asked for in March (hitriy, orienteerdev) and formally on 2026-10-01 (topic 15935), modelled on Connect IQ makeWebRequest. Suunto has not replied. It blocks weather stations, tides, avalanche reports and live segments. The only workaround is your own phone app acting as a BLE peripheral.
- **Sideloaded apps that survive a phone sync**, a personal developer mode, and a beta or hidden store listing. Raised many times; Suunto says it is aware, no ETA.
- **Route and waypoint access.** Users want Garmin's "Up Ahead" (scrollable waypoint list with distance and ascent), next-waypoint coordinates, and bearing to a POI. Not exposed; see section 4.
- **Watch faces and widgets.** Visual watch-face editor "in development"; manifest `usage` is fixed to "workout"; no app that runs outside an exercise. Widget asks: tides, fasting, date/time hub, alarms with labels.
- **Native live tracking.** Live.τ is unreliable because of BLE conflicts with the Suunto app; rumours of a native version.
- **Strength / gym.** Several competing apps (oSpotter, Strength Tracker, LiftCue, gym timer).
- **Race pacing by segment or aid station.** RunWarden, Race Surgeon, Sunmaxxi, plus kaibrownie's GPX-segment idea.
- **Bigger, high-contrast numbers** for older eyes (Biggies, Big Number proposal, HR-ZoneTracker, Manual Interval+).
- **Sensor bridges.** FTMS trainer and ERG control, Bosch / Shimano eBike, CGM, Varia radar, Woo, GoPro. Also more than 2 BLE sensors, HR broadcast, writing into standard FIT fields (power or cadence counting toward TSS — not allowed).
- **Other asks:** HRV / RMSSD from belts, NGP and HR Slope resources (not available), MTB jump airtime (accelerometer rate doubted), multi-sport and duathlon fixes, a referee app, games between sets, structured-workout FIT upload without partner API access.

## 3. Climbing / topo, paragliding / vario, temperature, BLE sensor apps

**Climbing / topo (the most relevant to SuuntoPo):**
- **The user's own project.** guderaber posts SuuntoPo in 14766 #11, #27, #30, #77, #83 and links github.com/aabbeell/suuntopo. `aabbeell` is also the owner of this vault's git remote, so this is inferred but strong. Reported state:
  - topo stored as JSON (metadata, pitch anchors with notes, route polyline, typed features) drawn on canvas
  - companion web editor exports the JSON
  - sync by pasting JSON into a phone-settings text field
  - three screens: selector, topo, pitch notes
  - a baked-in PNG mode works but is not viable
  - on a Race S: text-position mismatches against the simulator, crashes, and a full clear/reinstall needed
  - in guderaber's words it "needs more testing/optimisation"; not in the store as of the July list
- **Direct peer: Unpaired8373.** A parallel topo app with scaling and scrolling, planning "height in pitch" and current-pitch highlight. Moved from canvas to a **sprite-map** approach after advice; considered hybrid sprite plus canvas. Asked how to get topo data on without rebuilding.
- **Advice from Nikolai Simonov (Live.τ dev):**
  - memory is far below the browser simulator
  - use sprite maps
  - no sync API, so encode compactly into a settings string (treat it as binary)
  - canvas has about 50 draw calls and no drawImage
  - BLE phone sync is possible but painful: ~20-byte payloads, queueing, packet loss, and it breaks the Suunto app connection
- **Canvas workaround (Pottu):** split the drawing across several canvases, each with its own build function, to get past the draw limit.
- **Suunto on images:** no image sync, no image zoom on the watch, no published image limits (topic 14772).
- **Demand signals:**
  - DMytro's "S+ Topos" request (2024, topic 11084) and again in 2026: a scrollable JPEG topo uploaded through the Suunto app, rotated with the crown
  - v.sacre: Coros and Garmin are ahead on climbing
  - Francesco Pagano: select a grade per attempt
- **Adjacent apps:**
  - Climb Log in the store (grade systems, send/fail, project slots; architecture of four small templates plus many `ext*.js` lazy files, to keep a single template mounted)
  - omunoz Indoor Climbing v3 (auto climb detection, auto-lap per attempt, recovery timer) and Outdoor Climbing WIP (approach / climb / rest phases, pitch tracking, time under tension, wall inclination). Feedback: climbers keep the watch in a pocket; GPS is poor on rock faces; laps at every anchor are unwanted.
  - hangboard, VeloClimb and Stifa
  - Indoor Climbing's ascent shows only after 3 m (barometer granularity), so it is useless for bouldering.

**Paragliding / vario (mostly a negative finding):**
- No community vario app was found.
- Suunto's own SuuntoPlus Variometer (±3 m/s scale, alarm cadence varies) and Red Bull X-Alps apps exist.
- A 2024 request for pitch-varying vario beeps was answered by Raimo Järvi: pitch cannot be controlled. That matches the reference: `playIndication` only plays six named sounds ('Button', 'Confirm', 'Info', 'Interval', 'StartTimer', 'StopTimer'), with priority and stop but no frequency.
- 2026 activity:
  - Garibaldis wants a BLE variometer on a 9 Peak Pro; deploy only worked on Windows 10 after re-pairing five times (15859)
  - Michal Bryxí wants winds.mobi nearest-station wind for paragliding and kiting and filed the HTTP feature request (15935)
  - Gustin already shows forecast wind and gusts relative to heading, but on the watch `/Weather/Current` lacks windGust (only `/Weather/Future/N.windGust` works) and wind speed may ignore mixed unit settings
  - the older Variometer app's units are fixed (km/h horizontal, m/s vertical)

**Temperature:**
- The only resource is `/Device/Measurement/Temperature.Measurement`, the wrist sensor, in kelvin (reference line ~508). There are Temperature_*digits formats.
- No Tempe-style external temperature app was found. CORE body temperature has a partner app.
- Ecki D. asked Gustin to add sensor temperature and baro trend.
- The baro trend icon works with `<eval input="/Fusion/Altitude/PressureTrend" outputFormat="keyValue 1=&#xF280;…9=&#xF288;">` inside class `f-ico`, not `f-ico-l`.

**BLE sensor apps (what works and the limits):**
- App type must be `"type": "device"` with an output named `con` (firmware 2.22.32+).
- 9 Peak Pro, Vertical, Vertical 2, Race, Race S, Race 2, Ocean and Ocean Lite: 2 connections, ATT MTU 127. Older UI1 watches: 1 connection, MTU 23.
- GATT write maximum is 20 bytes. No MTU negotiation (reference ~2559).
- No pairing needed to read a service. **No PIN pairing support**; AYamshanov switched his device to NO_PIN.
- BLE does not work in the simulator.
- Working examples: ErgSynch, Treadmill Link (FTMS), oCycler (FTMS), Varia Radar, Tymewear, Bosch via ESP32, FORM goggles, CGM via a phone peripheral, Live.τ.
- Reported failure: brechtvb could not connect to a split Garmin speed + cadence sensor.
- Custom data cannot overwrite native FIT power or cadence, so no TSS from it.
- Using a trainer in the app blocks pairing it as the watch's power sensor at the same time.
- Live.τ developer's analysis (11562 #347, inferred from logs): bugs in Suunto's AURA BLE layer, namely an assertion on reconnect and a leak in the fixed write-request pool, cause mid-activity disconnects. Mitigation: lower BLE pressure and avoid aggressive retries. When the firmware unloads an app, its BLE connection drops and is not re-enabled (15692).

## 4. Practical lessons developers report

**Memory and resource budget.** The reference has a qualitative "Application memory" section (typed arrays, bitmasks, `evalFile` of `ext*.js`) but **no numbers**.
- Measured by developers: **133,120 B Duktape JS heap shared by all enabled zapps** (`JsTotMem` lines in syslog; Szmigiel on 9PP, skyfi on Vertical 2, omunoz on Race 2).
- Rule of thumb: ≤30–40 KB per app with one template mounted. Szmigiel merged three templates of 30–45 KB each, filled 99.4% of the heap, and hit a bootloop and firmware restore.
- **Leak:** disabling a single app from the in-exercise SuuntoPlus menu runs no `JS discard`. Each re-enable leaks the module scope, which scales with the number of module-level functions, not bytes. About 10 toggles freezes the UI (15490). Firmware evictions (`Zapp:relMemCb` → `RelMem->unload`) also do not release it, and the evicted app is never re-enabled for that exercise (15692).
- `WRN WBMAIN pool id:0 full (120/140)` appears under heavy canvas or UI load. Mitigation: stagger canvas REFRESH across 10 Hz ticks and redraw only when dirty.
- Concurrent apps: 3 on Vertical 2 and Race 2 (firmware 2.50.26 raised it from 2); 2 on Race S. A structured workout or guide counts as an app and is memory-hungry.
- UI1 watches (9 Baro, Vertical 1 class) have less memory; "SuuntoPlus no longer maintained for UI1".
- Large literal arrays (12 minutes of HR in a Uint8 literal) and **regex in main.js** both cause the misleading "Maximum SuuntoPlus apps reached". Bugs in one app can block selecting any app.
- Use one large typed array; avoid scratch allocations in callbacks; don't recreate arrays every tick.

**Simulator vs watch:**
- The watch runs Duktape, ES5.1 only (`let` breaks; the simulator is more permissive, reportedly QuickJS).
- Use `setText()`, not `output.textField`.
- CSS is a basic subset: px and % only, borders solid on all sides, no image zoom; `right`/`bottom` emulated with `%e` calc.
- Font metrics differ: canvas text renders about 2× larger on the watch, monospace is too wide, the "plain" font is unsupported in the simulator, and only fixed font classes exist (sp-d-*, f-d-xs…xxxl).
- Subscribed inputs go undefined → NaN → number on the watch (always valid in the simulator); guard with `isFinite`.
- Templates need a cycle or two before `setText`/`setStyle` after load.
- `<graph>` needs an explicit stroke color on the watch.
- `{zapp_uiViewSet_index}` runtime tokens are not substituted on the watch, which causes a crash; use `$.get('Zapp/{zapp_index}/Output/x', cb)`.
- `getUserInterface(input)` crashes the simulator.
- Pause/resume, settings UI, FIT GPS coordinates, BLE and Log resources are not simulated. A simulator screenshot bug exists in 1.42.0.
- **Canvas limits** (matram, Race S): about 24 `lineTo` per path; per-frame budget 2×strokes + lineTo ≤ ~200; 181 segments maximum when chunked in 20s. Failures are silent and black (and 12 of 96 points rendered on one Vertical).
- `setTransform` broken in the simulator.
- Lifecycle (15320): `onLoad` runs once; `onActivate` runs again after every lap or overlay; `$.subscribe` set in `onLoad` and the Zapp output channel are severed on the second `onActivate`, so subscribe in `onActivate`.
- `onInterval` does not fire when an interval set starts (15908).
- Touch needs the user to set Touch = On per exercise, so it is often off.
- The crown cannot be captured; it auto-scrolls content.
- No pop-ups; an app cannot take focus; only `playIndication` sound and vibration.
- Only Unix time and weekday; no Date object.
- Undocumented resources can be found by grepping `node_modules/@suunto-internal/suuntoplus-tools/lib/project/resource-common.js` and `resource.js`.
- **Debugging:** no debugger or exceptions. Use `systemEvent('[tag] …')` and read logs with "View system events" in the VS Code Suunto Watch view. matram's table of log signatures: SyntaxError, relMemCb, None avail, JSalloc, WBMAIN.

**Navigation / waypoints (15875, renard, measured):**
- `/Navigation/Poi/Active/Distance` and `/Name` give the next named route waypoint, accurate to about 1 m.
- No waypoint coordinates, no bearing, no route geometry.
- `Targetlocation/Coordinates` is the exercise start point.
- Everything goes silent about 100 m off route.
- `/Navigation/Poi/Count` and `/Navigation/Poi/<i>/Coordinates` (POI library) answer but are undocumented.
- renard solved waypoint position by trilateration from successive distances.

**Settings / data input:**
- Phone settings support `int`, `float` (min/max/slider), `boolean`, `string` (single line, `maxLength` in UTF-8 bytes) and `enum` (`values` or `valuePath`).
- Developers report `valuePath` enums crashing the Suunto app; inline `values` works.
- No arrays: emulate with N string fields.
- `null` default stays null until the user touches the field.
- iOS cannot enter "1" in some int fields; the Android keyboard covers fields.
- Settings cannot be tested without publishing.
- `localStorage.getObject` must be initialised in code. Reported unavailable on a Suunto 5 Peak.
- At most 5 logged variables become graphs in the app; `version` is at most 4 chars; `modificationTime` must change for an API Zone upload.

**Publishing and store experience:**
- Partner application through an Alchemer form. Invite to API Zone took about 7 days or less for some; others waited weeks.
- No hidden or beta listings.
- App binaries and text normally update within minutes to hours, but **binary updates were stuck from about 2026-08-16 to 2026-09-23**. Suunto said it was "working actively"; developers had to push a dummy new version afterwards. To verify what is live, download the "Sports app file" zip in API Zone.
- Store banner and screenshot images are not refreshed on phones that have already installed the app; moderation is suspected.
- No device targeting in the manifest, so 466×466-only apps install on smaller watches and break.
- Users leave 3/5 reviews for platform limits (e.g. no widget).
- No QA: crashing apps get removed (Hydra), and translations are criticised.
- **Sideloaded apps are wiped on every phone sync.** Workarounds: SyncFix APK, a second test watch, or keeping the phone disconnected.

**Tooling and connectivity:**
- Deploy over BT needs the watch unpaired from the phone ("Forget MobileApp"). On macOS a watch-serial setting and toggling auto/manual connection; Windows 11 needs "Advanced" BT discovery; Windows 10 works but is flaky.
- The charge cable is often charge-only (no data).
- Manual SDS start works around a macOS spawn bug (`SDS_MACOS_BLE_SCAN=1 …/SDSApplicationServer.bin 9801`).
- SDSApplicationServer is x86_64 only: macOS 27 needs a manual Rosetta install, and macOS 26.5.1 flagged SDS as suspect.
- No official Linux deploy (Suunto's VM guide; zappctl; SyncFix).
- Official examples: Buttons, DynamicIcons, Graph, MultiSensor, MultiView, Popup, TemplateLayout1–5. Templates include a BLE sport-app template (`~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/examples`, `templates`).

**Community mood:** enthusiasm early on, then frustration with sync wipes, undocumented limits and crash reports concentrated on Vertical 2. Many apps are openly built with Claude, Codex or Gemini. Suunto's position: the simulator is an approximation; deploy early.


## Key facts
- Open SuuntoPlus opened to all developers on 2026-03-11. Development and sideloading are free; store publishing needs the Suunto Partner Program, API Zone and Suunto review [suunto.com announcement; forum 14651, 14789]
- Suunto's own list (published 2026-07-09) shows 34 community apps in 6 categories, including Climb Log, Varia Radar, Treadmill Link, ErgSynch, Cycling Power Estimator and Anchor Alarm [us.suunto.com/blogs/blog/community-built-suuntoplus-sports-apps]
- The user is very likely forum user guderaber: the SuuntoPo post links github.com/aabbeell/suuntopo, the same owner as this vault's remote. It has a JSON topo, a web editor and paste-into-settings sync; it crashed and misrendered on a Race S; it is not in the store (inferred) [forum 14766 #11/#27/#77]
- Parallel topo app by Unpaired8373 uses sprite maps; Climb Log (skyfi, very likely wylandplex/suuntoplus-climb-logger) is the published climbing logger; omunoz is splitting Indoor and Outdoor Climbing apps [forum 14766, 15351; GitHub]
- Shared Duktape JS heap is 133,120 B across all enabled zapps; developers aim for 30-40 KB per app with one template mounted [forum 14783 #135, 15490, 15692]
- Disabling a single app in the in-exercise menu never runs JS discard, so each re-enable leaks its module scope (scales with the number of module-level functions); firmware evictions also leak and the app is not re-enabled [forum 15490, 15692]
- Canvas limits on a Race S: about 24 lineTo per path and 2*strokes + lineTo <= ~200 per frame; failures are silent and the canvas goes black. Fix: chunk paths, use several canvases, stagger REFRESH [forum 15279, 14766 #33]
- Concurrent apps: 3 on Vertical 2 and Race 2, 2 on Race S; a guide or structured workout counts as one [forum 15817, 15692]
- Regex in main.js and large literal arrays both trigger the misleading 'Maximum SuuntoPlus apps reached' error [forum 14940]
- The watch runs ES5.1 Duktape. Use setText, not output.textField; subscribed values go undefined -> NaN -> number; use only px and % [forum 14767, 15328]
- Subscriptions set in onLoad and the Zapp output channel are severed on the second onActivate (after any lap or overlay); subscribe in onActivate [forum 15320]
- No HTTP or internet API; HTTP via the phone was requested on 2026-10-01 for winds.mobi paragliding wind data, with no Suunto reply [forum 15935]
- playIndication plays only 6 named sounds with no pitch control, so a classic beeping vario is impossible; Suunto confirmed pitch is not controllable in 2024 [reference doc line ~1257; forum 10104]
- No community paragliding vario app exists; a user wants a BLE vario on a 9 Peak Pro [forum 15859]
- Temperature: only /Device/Measurement/Temperature.Measurement (wrist sensor, kelvin); no external temperature-sensor community app found [reference doc ~508; resource-common.js]
- BLE: device-type app with a 'con' output; 2 connections, MTU 127 on UI2 watches but GATT write max 20 B; no PIN pairing; not in the simulator [reference doc ~2455-2560; forum 14783 #115]
- Route waypoints: only /Navigation/Poi/Active/Distance and /Name for the next waypoint; no coordinates or bearing; all silent ~100 m off route; /Navigation/Poi/<i>/Coordinates answers but is undocumented [forum 15875]
- Phone settings are single-line strings, int, float, bool or enum with no arrays; settings cannot be tested before publishing; valuePath enums reportedly crash the Suunto app [forum 14766 #4/#29, 14768]
- Sideloaded apps are wiped on every phone sync; SyncFix (Android) and zappctl (Linux BLE) are community workarounds [forum 14897; codeberg.org/haavist/SyncFix; github.com/wylandplex/zappctl]
- Store binary updates were stuck from about Aug 16 to Sep 23, 2026; developers had to push a dummy version after the fix; store images do not refresh for existing installs [forum 15784, 15383, 15606]
- No device targeting in the manifest, so 466x466-only apps install on smaller watches and break [forum 15396, 14783 #84]
- Live.τ developer reports AURA BLE-layer bugs (reconnect assertion, write-pool leak) behind mid-activity disconnects. This is inferred from logs [forum 11562 #347]

## Open questions
- Reddit r/Suunto could not be read: every route returned 403. Reddit feedback appears only secondhand, through AYamshanov and Thibault B. on the forum
- No DC Rainmaker or gadgetsandwearables.com coverage of Open SuuntoPlus was found; the5krunner is the only press source reached
- The forum search API returned 401, so threads outside the categories I scanned (e.g. Feature Suggestions bodies) may hold more demand signals
- Suunto's 34-app list is dated 2026-07-09 and there is no public web store listing. The current full store catalogue, and whether Notes (approved 2026-03-30 but absent from the list) is still live, need checking in the Suunto app
- Authors of Varia Radar, Parkrun, Live KME, Gap Mate, GWE, aLOOP, Duration Estimator, Wing Foil, Hockey Timer and Table Tennis Score were not found; VMC (surfboomerang) and Basketball Score (GhDero) are inferred
- Climb Log = wylandplex/suuntoplus-climb-logger = forum user skyfi is inferred, not confirmed
- Whether SuuntoPo or Unpaired8373's topo app has been submitted to the store is unknown
- The heap and canvas limits were measured on specific watches (9 Peak Pro, Race S, Vertical 2, Race 2). Limits on other models and firmware versions are unverified
- Whether Suunto will add HTTP-through-phone, persistent sideloads, watch-face or widget SDKs, or route waypoint coordinates; no roadmap has been published
- Maximum length of a settings string field (relevant for pasting topo JSON) is not documented; only maxLength in bytes per field is mentioned; needs hardware testing
- Whether /Navigation/Poi/<i>/Coordinates (undocumented) is supported and stable
- Whether a community vario could work with only six fixed sounds (cadence-only beeps) has not been tested

## Sources
- https://forum.suunto.com/topic/14766 — [Discussion] Share your projects: 97 posts; SuuntoPo, topo peers, Notes, SportPet, SyncFix, CGM, Aerobic Guide
- https://forum.suunto.com/topic/14765 — [Inspiration] Share your app ideas: 49 posts of ideas and demand
- https://forum.suunto.com/topic/14783 — No stupid questions: 155 posts; API answers, heap number, touch, BLE, settings
- https://forum.suunto.com/topic/14767 — Simulator vs watch discrepancies (official) and developer follow-ups
- https://forum.suunto.com/topic/15692 — omunoz: resource budget, eviction, 133,120 B heap, pool id:0
- https://forum.suunto.com/topic/15490 — skyfi: single-app disable leaks JS context; probe-app measurements
- https://forum.suunto.com/topic/15279 — matram: canvas draw-call limits and tiling fix
- https://forum.suunto.com/topic/15320 — uiView lifecycle and subscription severing
- https://forum.suunto.com/topic/14940 — 'Maximum SuuntoPlus apps reached' caused by regex and big arrays
- https://forum.suunto.com/topic/15875 — renard: waypoint and POI resources measured on the watch
- https://forum.suunto.com/topic/15935 — HTTP-via-phone feature request for paragliding wind (winds.mobi)
- https://forum.suunto.com/topic/15859 — Paraglider wanting a BLE vario; Windows deploy problems
- https://forum.suunto.com/topic/10104 — 2024: vario pitch beeps not possible (Suunto reply)
- https://forum.suunto.com/topic/11084 — 2024 S+ Topos request (scrollable topo image)
- https://forum.suunto.com/topic/15351 — omunoz Indoor/Outdoor Climbing redesign and feedback
- https://forum.suunto.com/topic/15784 — Store update pipeline stuck Aug-Sep 2026
- https://forum.suunto.com/topic/14897 — Sideloaded apps wiped on sync; SyncFix APK
- https://forum.suunto.com/topic/11562 — Live.τ live-tracking thread; AURA BLE analysis (#347)
- https://forum.suunto.com/category/46 — SuuntoPlus Sports Apps category: Gustin, oSpotter, oCycler, Constantin, Cycling Power Estimator, Strength Tracker and others
- https://us.suunto.com/blogs/blog/community-built-suuntoplus-sports-apps — Official list of 34 community apps by category (datePublished 2026-07-09)
- https://us.suunto.com/blogs/blog/open-suuntoplus-built-by-the-community — Suunto's Open SuuntoPlus announcement (2026-03-11)
- https://the5krunner.com/2026/03/11/suunto-opens-suuntoplus-to-all-developers-a-direct-challenge-to-garmins-connect-iq/ — Press coverage of the launch
- https://the5krunner.com/2026/07/09/open-suuntoplus-three-months/ — Three-month review: 40+ apps
- https://github.com/aabbeell/suuntopo — SuuntoPo (guderaber; the user's own project, inferred)
- https://github.com/wylandplex/suuntoplus-climb-logger — Climb Log v3.03 source; template-splitting architecture
- https://github.com/wylandplex/zappctl — Linux BLE deploy client; MTU 127, one central at a time
- https://github.com/SuuntoSpace/indoor-climbing — omunoz Indoor Climbing source
- https://github.com/SellA/BoschEBikeSuunto — BLE bridge example (Bosch LDI via ESP32)
- https://github.com/panoskrt/SuuntoPlusVeloClimb — Cycling climb app source
- https://github.com/ayamshanov/AnchorAlarm-for-Suunto — Anchor Alarm source (store id zzanch01)
- https://codeberg.org/haavist/SyncFix — Android app that re-pushes sideloaded apps
- PROJECTS/SUUNTOPO/reference/suuntoplus_reference_docs.md — Local reference: playIndication, BLE limits, memory section, settings types
