<!-- ABOUTME: Step-by-step hardware test of VarioLink (v1.0 steps 1-14, v1.1 XC-page steps X1-X8) on the user's Suunto Race S. -->
<!-- ABOUTME: Procedure and report-back list only; the H-numbers point to SPEC §16c, the W/P/G gates to XC_FEATURES.md Appendix B. -->

# VarioLink: hardware test on the Race S

## v1.1 (XC pages): run these first

The v1.1 source (SPEC §0.1.9) adds three manifest inputs that have **never run on a watch**: `Fusion/Location/GeoCoordinates.latitude`, `.longitude` and `Outdoor/Sunset/ETE`. A wrong input path stops a SuuntoPlus app from loading at all (reference L133), so step X1 comes before everything else, and the v1.0 steps below are then repeated with a v1.1 debug build. Since the XC review round (SPEC §0.1.10) the store default is the classic page; the XC pages are the setting "Pages", so the automatic-page build sets `pg=0` explicitly. Build the debug variants from the repository root (the same rules as below: any sync deletes the sideloaded app):

```
node test/ble_vario/variant.js dbg /tmp/lv11-abel-dbg sn=Abel pg=0 && node tools/sp-build.js /tmp/lv11-abel-dbg builds/ble_vario/v1.1-abel-dbg
node test/ble_vario/variant.js dbg /tmp/lv11-classic-dbg sn=Abel pg=1 && node tools/sp-build.js /tmp/lv11-classic-dbg builds/ble_vario/v1.1-classic-dbg
node test/ble_vario/variant.js dbg,neg /tmp/lv11-neg-dbg sn=Abel pg=0 && node tools/sp-build.js /tmp/lv11-neg-dbg builds/ble_vario/v1.1-neg-dbg
```

- **X1 Loads at all (W1, part 1).** Install `v1.1-abel-dbg`, add it to the Paragliding sport mode, select it. **Pass:** the app appears (SEARCHING or VARIO) as in v1.0 step 2. **If the app does not load or the watch says the app cannot be used:** stop and report; one of the three new input paths is wrong and v1.1 cannot ship as built. As a check, install `v1.1-classic-dbg`: it has the same inputs, so it fails the same way.
- **X2 GPS input (W1, part 2).** Outdoors, start an exercise with full GPS and wait for the watch's fix. Stand still for 10 minutes, then walk straight for 10 minutes. **Pass:** after the start the app shows the HIKE page (UP, ST, AVG, ALT, and the bottom line `SUNSET IN 2h15` or `SUNSET IN 45 min`); the A1 UP number moves while you climb stairs or a slope. Copy the system events: they show no new lines for GPS (the inputs are not logged), so record in words whether anything looked wrong. Note the exercise's start and end times, so the FIT file's GPS track can be used to re-fit the GPS noise model of the wind tests.
- **X3 Pages (P1).** In the same exercise, ride as a passenger (car or bike) above 16 km/h for at least 10 s: the app must take off (FLT starts) and switch to GLIDE (GS km/h, TO, L/D); then ride 3-4 circles of 30-50 m diameter at a steady 25-30 km/h (an empty car park as a passenger, or a bike; the circling detector ignores velocity changes below 4.5 m/s around the recent mean and the wind fit wants 25-58 km/h since the XC review): THERMAL appears after about one circle only if the 30-s average climb is at least -0.5 m/s (on flat ground it is about 0, so it should), and after the circles stop GLIDE returns after 10-20 s. **Pass:** the pages switch within a second, no element of the previous page stays visible, labels and values match the page, and lap / pause / the middle button behave as in v1.0 (step 10). A WIND line may appear: on the ground it means nothing, only that the path works.
- **X4 Memory with a second app (G1/H10b).** As v1.0 step 6 with `v1.1-abel-dbg`, but **start the exercise** (the XC engine is compiled at the exercise start: that is the highest memory point, 38.6 KB in the harness against about 32 KB estimated usable, and about 4 KB of it is compile garbage only a full garbage collection frees). **Pass:** as step 6. Repeat with `v1.1-classic-dbg` (21.6 KB steady, 27.7 KB load peak, no XC engine; the store default) and report both results: they decide whether the XC pages stay an option, become the default again, or go (SPEC §0.1.10). The hardware results in SPEC already logged `JsTotMem 131072/133120` with LiftLink Vario v1.0 and Air Temperature v1.0 enabled together.
- **X5 Summary and graphs (H12, W9).** After X3, end and save the exercise and sync (this deletes the app). **Pass:** the summary shows Flight time, Max altitude, Max above take-off, Best avg climb, Total climb, Best thermal gain and Vario link (record which ones appear; the watch may show only the first 4-5); the graphs Vario, Avg climb, Vario source, Wind speed and Wind from (the last two only after circling).
- **X6 Sunset.** On the HIKE page the bottom line reads `SUNSET IN 2h15` (or `SUNSET IN 45 min` in the last hour, `SUNSET --` after sunset or without a sunset time). **Pass:** it matches the watch's own sunset time minus now (within a minute) and is not clipped by the bezel.
- **X7 First flight (F1).** Fly with the app on the GLIDE/THERMAL pages and the UltraBip logging an IGC. Afterwards replay the IGC in XCSoar 7.45.1 or later and compare its wind with the FIT Wind speed / Wind from graphs. **Pass (design):** within 20° and 5 km/h during steady circling in steady wind.

- **X8 Heights below -500 m (XC review, product P1-2).** Install `v1.1-neg-dbg`: its XC pages show -600 m in the A2 height slot (ST on HIKE, TO on GLIDE) whatever the real height. Start an exercise and look at the HIKE page. **Pass:** the slot reads `-600m` (about `-1968ft` in imperial). **If it reads `--m`:** the watch's Altitude formatter stops at -500 m like the editor's, and the height slot must become app text before a flight from a launch more than 500 m above the landing shows TO there (SPEC §0.1.10 has the planned fix). Do not fly with this build.

Report X1-X8 like the v1.0 steps (pass / fail / not run, one line each), plus any `relMemCb`, `JSalloc` or `JsTotMem` line from X4.

## v1.0

About 1 hour of steps plus a 2-hour memory run (step 6) and the optional ground test (step 14). The H-numbers point to SPEC §16c. Nothing here is a flight test: until step 14 and a real flight are done, the vario's own beeps and screen stay your instruments.

**Three rules for the whole test:**
- **Any sync with the Suunto app deletes the sideloaded app.** Force-quit the Suunto app on the phone (or switch the phone's Bluetooth off) until step 13, which syncs on purpose.
- **The UltraBip accepts one connection.** Force-quit BipLink, XCTrack and FlySkyHy unless a step asks for them. Its Bluetooth switches off if nothing connects within 5 minutes of power-on, so power-cycle it right before each step.
- **Settings cannot be changed on a sideloaded app.** Each settings variant is its own build. All builds have the same app id, so installing one replaces the other.

## Builds

| Build | File | Settings | Use |
|---|---|---|---|
| Debug, store settings | `builds/ble_vario/v1.0-dbg/liftli01-q-en.dev` | no vario name, log on | steps 2, 4-10 |
| Debug, name | `builds/ble_vario/v1.0-abel-dbg/liftli01-q-en.dev` | Vario name "Abel", log on | step 3; steps 4-10 if step 2 failed |
| Debug, GPS line | `builds/ble_vario/v1.0-abel-gps-dbg/liftli01-q-en.dev` | Vario name "Abel", bottom line "Vario GPS speed and course", log on | step 11 |
| Release | `builds/ble_vario/v1.0/liftli01-q-en.dev` | store defaults, no log | step 12: exactly what the store builds from the zip |

**Builds of the current source (after the 2026-10-04 memory round, SPEC §0.1.8).** The packages above were built from the v1.0 code. The current source behaves the same (test D1) but needs about 2.4 KB less memory, and the debug builds are no longer made by setting `dbg` in `data.json`. Make fresh builds before step 6 (memory) and use them for every step; from the repository root:

```
node test/ble_vario/variant.js dbg /tmp/lv-dbg                    && node tools/sp-build.js /tmp/lv-dbg builds/ble_vario/<ver>-dbg
node test/ble_vario/variant.js dbg /tmp/lv-abel-dbg sn=Abel       && node tools/sp-build.js /tmp/lv-abel-dbg builds/ble_vario/<ver>-abel-dbg
node test/ble_vario/variant.js dbg /tmp/lv-abel-gps-dbg sn=Abel gp=1 && node tools/sp-build.js /tmp/lv-abel-gps-dbg builds/ble_vario/<ver>-abel-gps-dbg
node tools/sp-build.js src/ble_vario builds/ble_vario/<ver>
```

The `.dev` to install is `liftli01-q-en.dev` in each output folder. The log lines below are the same in both generations of debug build.

**Reading the log:** VS Code with the SuuntoPlus Editor, watch on USB, Explorer → "Suunto Watch" → "View system events". Debug builds write `[vl] ev <event> ch <id>` for every Bluetooth event, `[vl] connect` for every connect attempt, `[vl] onEvent 1` when the screen is rebuilt, and every 10 s `[vl] <state> <ok> <bad> <maxlen> <phase> <step> <rg> <fm>`: state 0 searching, 1 connecting, 2 live, 3 no data, 4 link lost, 5 bad data, 6 BLE error; ok/bad = lines read; maxlen = largest notification in bytes.

## Steps

1. **Prepare.** Note the watch firmware (the watch's About screen) and the UltraBip firmware and pilot name from BipLink (the vario should advertise as `UltraBip🪂Abel`), then force-quit BipLink. Charge the vario. In the Paragliding sport mode set the display to always-on.
2. **Sideload and first connect, store settings (H1).** Connect the watch by USB, open VS Code, run "SuuntoPlus: Add SuuntoPlus Binary to Watch" and pick the "Debug, store settings" `.dev`. On the watch, add VarioLink as a SuuntoPlus app of the Paragliding sport mode. Power-cycle the vario, keep it 1 m away, and select the app in the sport mode's start view. Expect the watch's Searching screen, then the app with `VARIO` (green) at the top within 30 s. Lift watch and vario together by 1-2 m: the climb number must go positive, then back. Record the seconds from selecting the app to `VARIO`, and copy the `[vl]` lines. **Pass:** `VARIO` within 30 s, numbers follow the movement, **DEMO never appears** (if it ever does on the watch: stop and report, do not fly with it). If it stays SEARCHING for 2 minutes, record that and go on: it means the watch does not match name prefixes.
3. **Vario name (H2).** Install the "Debug, name" build, power-cycle the vario and repeat step 2. **Pass:** `VARIO` within 30 s. If neither step 2 nor 3 connects, run the three probes in `docs/probe/README.md` and report their stages. Optional: set a pilot name longer than 4 characters in BipLink (for example "Abelxyzab"), power-cycle, retry both builds, then set "Abel" back.
4. **Live data (H5, H9).** With the build that connected, start an exercise, leave watch and vario still for 5 minutes, then compare ALT with the watch's own altitude (another display of the sport mode). **Pass:** the `[vl]` lines show state 2 and about 85-100 more ok lines every 10 s, bad stays near 0; ALT within 5 m of the watch altitude after 2 minutes. Note maxlen.
5. **Phone holds the vario (H3).** End the exercise. Connect BipLink (or XCTrack) to the vario, then select the app: expect SEARCHING. After 30 s the hint lines appear ("Restart vario, check name", "Close phone vario apps"). Force-quit the phone app. Record whether the watch then connects by itself and how long it takes. Repeat once with BipLink remote-control mode on.
6. **Memory with a second app (H10).** Add a second SuuntoPlus app (any small one) to the same sport mode. Power-cycle the vario, select VarioLink and record a 2-hour exercise with the watch and vario on the desk. **Pass:** LIVE the whole time; no "Maximum SuuntoPlus apps reached"; no `relMemCb`, `releaseMemoryCb` or `JSalloc` in the system events. Copy any `JsTotMem` line. If it fails in the first 10 minutes, stop and report: this decides whether v1.0 ships at all. Remove the second app afterwards.
7. **Vario off at start (H7).** With the vario switched off, select the app. Record: can the watch's Searching screen be closed (which button), can the exercise be started, does the screen close by itself (after how many seconds), and what the app screen shows. Then switch the vario on and record whether and when it connects.
8. **Vario asleep (H4).** Power the vario on, wait 6 minutes, then select the app. Expect SEARCHING and, after 30 s, the hint lines. Power-cycle the vario and record whether the app connects by itself and how long it takes. Copy the `[vl] ev 112` lines (note their spacing) and any `BLE API err` line.
9. **Dropout in an exercise (H8).** Start an exercise LIVE. Put the vario in a closed metal tin (or 30 m away) for 30 s, then bring it back; then repeat with a vario power-cycle instead. **Pass:** `WATCH BARO` (orange) with NO DATA or LINK LOST within about 3 s of losing the vario; BLE ERROR never shows while data flows. Record the seconds until `VARIO` returns, or that it never returned (the reported Race S reconnect problem).
10. **Screen and buttons (H11).** In a LIVE exercise:
    - Colour: is the climb number green when climbing (step 2's lift) and in the normal text colour near zero? Red needs a fast descent below -3.0 m/s (a lift going down, or skip it).
    - Laps: press lap 3 times. After each, ALT, GAIN/LAST and FLT must keep changing, and the log must show `[vl] onEvent 1`.
    - Buttons from the app screen: pause, resume, lap, end, once with the display awake and once in always-on.
    - Readability in sunlight, and with the watch switched to the light theme (is the screen white; are VARIO, WATCH BARO and the climb number readable?). Switch back.
    - Latency: switch the vario off and on; seconds until `WATCH BARO`, then `VARIO`.
11. **GPS line (H6).** Install the "Debug, GPS line" build. Outdoors with a clear sky, wait for the vario's GPS fix, then walk or ride as a passenger for 10 minutes with an exercise running. **Record:** roughly what share of the time the bottom row shows speed and course (for example "41 km/h 48°"), NO GPS FIX, or FLT, and whether the speed looks right.
12. **Release build.** Install the "Release" build and repeat step 2 without the log part, then a 10-minute LIVE exercise with 2 laps; end and save it. **Pass:** same behaviour as the debug build. If step 2 only worked with the name, this build will not connect: record that (it changes the listing: the vario name becomes required), it is not a build fault.
13. **Sync (H12).** Open the Suunto app and sync; this deletes the sideloaded app. **Pass:** the step 12 exercise shows the graphs Vario, Avg climb, Vario altitude, Vario source and Vario battery, and its summary shows only "Vario link" (no take-off was detected; all five values appear after a detected take-off, step 14).
14. **Optional ground test (H13).** Re-install the debug build (step 13 removed it) and keep the phone away from the watch again. Ride a cable car up, or drive a mountain road as a passenger, with an exercise running: FLT should start, GAIN should count the ascent, and the summary should show Max altitude and Flight time. After the first real flight, compare gain and max altitude with the UltraBip's own log.

## What to report back

- Header: watch firmware, UltraBip firmware, pilot name, date.
- For every step: pass, fail or not run, plus a one-line note.
- Timings: step 2/3 (selecting the app to `VARIO`), step 5, step 7, step 8, step 9 (back to `VARIO`), step 10 latency.
- From "View system events": every `[vl]` line of steps 2, 3, 8 and 9, and any line containing `BLE`, `Zapp`, `relMemCb`, `releaseMemoryCb`, `JSalloc`, `JsTotMem`, `err` or `failed` from any step.
- For anything that failed: the step, a photo of the watch screen and what you did just before.
- Whether DEMO ever appeared on the watch (it must not).
- The answers the store listing is waiting for (`store/ble_vario/listing.md`, "Before submitting"):
  1. Does the store build connect without a vario name (step 2), and with "Abel" (step 3)?
  2. Did the 2-hour run with a second app stay LIVE with no memory errors (step 6)?
  3. What does the watch's Searching screen do when the vario is off (step 7)?
  4. Did the Race S reconnect by itself after a dropout (steps 8, 9)?
  5. Does the climb number change colour; are the screen texts readable in the light theme; do ALT, GAIN and FLT survive laps (step 10)?
  6. How often does the GPS line show speed and course (step 11)?
