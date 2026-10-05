<!-- ABOUTME: Store listing for VarioLink for Suunto v1.1: the API Zone form map, store description (Markdown, with links), release notes and FAQ. -->
<!-- ABOUTME: Upload-ready files are in store/ble_vario/upload/; the owner pastes the description and attaches the files in the API Zone console. -->

# VarioLink for Suunto: store listing (v1.1)

Prepared 2026-10-05 for the API Zone form "Add new SuuntoPlus app" (playbook: the `suuntoplus-store-submission` skill in suuntoplus-agentic-dev-env). Supersedes the long v1.0/v1.1 drafts in git history.

**Not ready to submit yet.** Store gate (skill §0): the classic page has run on a Race S with the UltraBip (2026-10-04: connected within 3 s of the vario being found, no bad lines). The automatic pages with the thermal map have not yet passed a recorded watch run (memory: 46.9 KB steady in sp-mem against a heap that unloaded a second app at 32 KB). Submit after that run is recorded in `docs/ble_vario/SPEC.md` (hardware results at the top), or submit with the Pages setting removed.

## API Zone form map

| Form field | Value | File / source |
|---|---|---|
| App name (from the manifest) | VarioLink for Suunto | `manifest.json` `name`, 20 of 60 bytes (the app ID stays variol01, which a name starting with "Suunto" would not); contains "Suunto", so the description and banner say the app is independent |
| Banner image (PNG, exactly 600 × 300) | Name and four features left, the vario screen right | `upload/1-banner-600x300.png` (source `banner-600.html`) |
| Description (Markdown) | The "Store description" section below, as is | this file |
| Categories (max 3) | **Outdoor**, **Training Tools** | see "Categories" |
| Submission role | Made by Suunto Community | |
| Connection to external device/sensor | Yes | |
| App image (PNG, 466 × 466) | The classic page in a thermal | `upload/2-app-image-466.png` |
| Sports app package (.zip) | Source package v1.1 | `upload/3-package-variol-source-v1.1.zip` |
| Submit (accepts Suunto's licence agreement) | The owner's action | |

Manifest: `version` 1.1, `author` "O. Vitya", `description` "UltraBip/BlueBip vario" (22 bytes, shown under the name in the watch's app list), `type` device, `usage` workout, English only. Store default settings in `data.json`: UltraBip, no vario name, match watch altitude, 10 s average, red below -3.0 m/s, flight time at the bottom, **classic single page**.

### Categories

**Outdoor** (paragliding and hike-and-fly) and **Training Tools** (a live instrument whose data is logged to the exercise). No third category.

## Store description

Paste everything between the two rules into the Description field.

---

**VarioLink for Suunto** (an independent app, not made by or affiliated with Suunto) shows your Stodeus UltraBip or BlueBip Bluetooth vario on your Suunto watch: the climb rate in big numbers, average climb, thermal gain, altitude and flight time, logged to your exercise.

### On the screen

- The climb rate, large, in m/s or ft/min (green in lift, red in strong sink)
- Average climb over 10-30 s and the gain of the current thermal (LAST after it ends)
- Altitude matched to your watch, or QNH / QNE
- Flight time, or the UltraBip's own GPS speed and course

If the vario link drops, the numbers come from the watch's own barometer and the top line reads WATCH BARO.

### Thermal pages (setting "Pages", beta)

With "Auto: glide, thermal" the screen changes by itself during the flight:

- **GLIDE:** ground speed, climb gain (or LAST), glide ratio over the ground while sinking, altitude, and the wind measured from your circles.
- **THERMAL** (while you circle in lift): a map of your last circles, one dot per second, bigger and redder where the lift was stronger, fading with age, with a yellow ring around the estimated core. The climb rate in big numbers and the climb gain below it.

The thermal pages need much more watch memory: VarioLink for Suunto must then be the **only** SuuntoPlus app in its sport mode.

### Saved to your exercise

Graphs: vario, average climb, vario source (vario or watch barometer) and, with the thermal pages, wind speed and direction. Summary: flight time, maximum altitude, best average climb, best thermal gain and link quality.

### Watches and varios

Tested on a Suunto Race S with a Stodeus UltraBip. Built for the watches with the current SuuntoPlus interface (Race, Race S, Race 2, Vertical, Vertical 2, 9 Peak Pro, Ocean, Ocean Lite); other watches and the BlueBip are not tested yet.

### Setup

1. In the Suunto app, add VarioLink for Suunto to your paragliding sport mode and set that mode's display to always-on.
2. In the app's settings choose your vario model. Enter your vario's name (your BipLink pilot name, the part after the parachute symbol) if other pilots' varios are nearby.
3. Close BipLink, XCTrack and any other app that uses the vario, and turn off BipLink remote-control mode: the vario accepts one connection.
4. Switch the vario on, select VarioLink for Suunto in the sport mode and wait for the climb number.

### Limits

- The screen updates once a second and the app makes no sound: your vario keeps beeping.
- The wind needs circles flown with the watch GPS on; there is no wind on a straight glide.
- The app has no terrain data, so it shows no height above ground.
- A gondola or car ride counts as flight: pause the exercise.
- English only.

### Privacy

The app talks only to your vario, over Bluetooth, and has no internet access. Its data is stored in your exercise like the watch's own data.

### Support

Questions and problem reports: borosaabel@gmail.com

### Links

- Source code, FAQ and developer notes: [github.com/aabbeell/suunto-variolink](https://github.com/aabbeell/suunto-variolink)
- More SuuntoPlus apps by O. Vitya: [Suuntopo](https://github.com/aabbeell/suuntopo), climbing topos on your wrist, with its [topo editor](https://topo-editor.vercel.app); [AirTemp for Suunto](https://github.com/aabbeell/suunto-airtemp), air temperature and humidity from a Bluetooth sensor
- Developer tools used to build these apps: [suuntoplus-agentic-dev-env](https://github.com/aabbeell/suuntoplus-agentic-dev-env)

VarioLink for Suunto is an independent app. It is not affiliated with or endorsed by Stodeus or Suunto; UltraBip and BlueBip are Stodeus trademarks.

---

## Release notes (v1.1)

First release. Live climb rate, average climb over 10-30 s, thermal gain, altitude matched to the watch (or QNH / QNE) and flight time from a Stodeus UltraBip or BlueBip over Bluetooth; optional UltraBip GPS speed and course; falls back to the watch barometer when the link drops. Beta thermal pages: GLIDE with ground speed, climb gain, glide ratio and circling wind; THERMAL with a map of your circles and the estimated core. VarioLink for Suunto must be the only SuuntoPlus app in its sport mode when the thermal pages are on.

## FAQ

For the README or answering support mail (the store has no FAQ field).

**The screen says SEARCHING and never connects.**
The vario switches its Bluetooth off if nothing connects within 5 minutes of power-on: restart it. Close BipLink, XCTrack or any app that holds the vario. If other varios are around, enter your vario name.

**What do I enter in "Vario name"?**
The vario advertises "UltraBip" (or "BlueBip"), a parachute symbol and your BipLink pilot name, for example UltraBip🪂Abel. Enter the part after the parachute ("Abel"); capitals matter. Only the first 4 characters fit the watch's search filter (5 on a BlueBip).

**What do VARIO-less top line and WATCH BARO mean?**
Nothing at the top: the numbers come from the vario. WATCH BARO: no vario data, so climb, average and altitude come from the watch's barometer.

**What are GAIN and LAST?**
GAIN is the height gained since the current climb began: it starts when the 10-s climb exceeds +0.5 m/s and ends after 30 s of sink worse than 1 m/s, or 30 m below the climb's top. LAST then shows the last climb's gain (climbs of at least 45 s).

**Why no wind on a glide?**
The wind is measured from the drift of your circles (the method XCSoar uses without an airspeed sensor). On a straight glide nothing new can be measured.

**Can the app use the vario's GPS for my track?**
No. A SuuntoPlus app cannot feed positions into the watch's track. The GPS bottom line only shows the UltraBip's speed and course.
