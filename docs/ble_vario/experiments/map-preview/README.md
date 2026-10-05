# Thermal map preview (simulator only)

A visual preview of the map page Abel asked for on 2026-10-04: a full-screen, north-up trail centred on the glider, red for lift and blue for sink, darker for older points, with the current climb small at the bottom. Older points shift downwind (5 m/s), so the circles stack in the air mass as XCTrack's "classic" mode does.

The trail is synthetic and generated in the template from a seconds counter: a glide in from the west, then 22-s circles with the core on the east side. It is not wired to the vario or the watch GPS, has never run on a watch, and was not memory-measured. The real data path and budgets are in `../../XC_FEATURES.md` §4 and §6.3 (prototype with the XC engine: 44.5 KB steady). The open question is whether a map-first app without the XC engine fits on the watch.

Run it with the bridge `screenshot` tool on this folder (`display` q, `wait_seconds` 25 to 105).
