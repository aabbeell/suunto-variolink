# VarioLink handoff (2026-10-04)

Handoff from the setup thread to the VarioLink thread. First read `../../../SUUNTOPO/tools/SHARED_RESOURCES.md`, which covers the watch lock, path ownership in this repo, and the rule against restarting VS Code. Then read `SPEC.md`: the binding decisions and the 2026-10-04 hardware results are at the top.

## State

- **App:** `src/ble_vario` v1.1 source. The manifest name is still "LiftLink Vario" (appId `liftli01`) and the author is still "O. Vitya"; both renames are pending (see Decisions).
- **v1.0** is the release confirmed on Abel's Race S (firmware 2.53.42) with his UltraBip. It connected 5 s after opening, with live vario, altitude 228 m and vario battery 50 %. The layout fit the round screen. The installed copy was the v1.0 store source with `sn=Abel, dbg=1`.
- **v1.1** adds the XC features from `XC_FEATURES.md` MVP-A, behind the "Pages" setting:
  - automatic HIKE / GLIDE / THERMAL pages
  - circling wind (Kasa fit), ground speed, height above take-off or exercise start (never labelled AGL), L/D, current-thermal average
  - ascent rate and time to sunset
  - FIT wind speed and direction
  The store default is the classic v1.0 page, for memory.
- **Tests:** `node test/ble_vario/run.js` passes 74/74. This includes synthetic wind tracks: displayed wind within 0.3 m/s / 4°, and no false circling on straight glides or S-turns. `test/ble_vario/variant.js` builds the demo (simulator) and debug variants; the store build carries no demo or debug code.
- **Memory (sp-mem, lowmem est32):**
  - Classic default: 21.6 KB steady, 27.7 KB load peak.
  - Automatic pages: 33.3 KB steady, 38.6 KB peak at exercise start.
  - The budget is 10 KB steady / 12 KB peak; the estimated usable heap is ~32 KB.
  - Thermal map (MVP-B): not built. A prototype measured 44.5 KB steady (`XC_FEATURES.md` §6.3).
- **Builds:** v1.0 and v1.1 are in `builds/ble_vario/`. **Do not upload v1.1**: it still enables the 16-byte UUID form first (see next steps).

## Decisions from Abel

- Store name **"VarioLink"**. The description says "works with Stodeus UltraBip / BlueBip" and states it is not affiliated with Stodeus. Abel dropped "BipLink Vario" because BipLink is Stodeus's own app.
- Author **"O. Vitya"**.
- He asked for the XC features: altitude, height above ground, lift/sink, speed, wind, and a thermal map. He was told that true AGL is impossible (no terrain data), that wind is only available while circling, and that the map depends on memory.
- He asked whether the vario's GPS could replace the watch's GPS to save battery. Answer given: the app can show the vario's GPS, but it cannot feed positions into the watch's track. The FAQ explains this.
- Support email and the FAQ page: still open.

## Next steps

1. **Enable the 2-byte UUID form first** (hardware result: the 16-byte form gets 110 CONFIG_FAILED). Update the D1 golden recording accordingly. Then rebuild v1.1.
2. **Hardware test v1.1** (take the watch lock), following `HARDWARE_TEST.md` steps X1-X7. W1 is critical: the new manifest inputs `Fusion/Location/GeoCoordinates.*` and `Outdoor/Sunset/ETE` have never run on a watch, and a wrong path stops the app from loading. Then X4: memory with a second app, classic vs pages. Read the result with `SUUNTOPO/tools/watch-log/watch-log.js`.
3. Apply the rename and author change, re-render the store screenshots for v1.1, and rebuild the source zip.
4. Name discovery: the exact full name works. Whether a prefix like "UltraBip" works is still unknown (ProbeN ran but no result was recorded). The store version needs either the prefix or the "Vario name" setting.

## Hardware facts (2026-10-04, Race S fw 2.53.42)

- Discovery: the filter `[9, "UltraBip🪂Abel"]` (exact full name) connects. A filter on service FFE0 never finds the vario.
- UUID form: the 2-byte form works; the 16-byte form gets 110. NMEA arrives in 20-byte notifications.
- With v1.0 plus Air Temperature v1.0 enabled together, the watch logged `JsTotMem 131072/133120`.
- The probes were removed on 2026-10-04; their conclusions are in `docs/probe/README.md`. The Mac-side capture tool is `tools/ultrabip_capture.py`; run it in Terminal so it gets Bluetooth permission.
