# Developer notes

How VarioLink for Suunto is built, what the real watch allows, and how to extend it. Read this before changing `src/ble_vario/`. The full record (every decision, measurement and hardware result) is `docs/ble_vario/SPEC.md`; its top section is binding.

## Tooling

Everything runs from the command line on a Mac, through [suuntoplus-agentic-dev-env](https://github.com/aabbeell/suuntoplus-agentic-dev-env), cloned next to this repo:

- **Build, deploy, simulator screenshots**: the `suunto-mcp-bridge` VS Code extension (VS Code open on a folder that loads it) and its client, `node ../SUUNTOPLUS-AGENTIC-DEV-ENV/tools/suunto-mcp-bridge/call.js <build|deploy|screenshot|sim_log> '<json>'`. Offline build: `node tools/sp-build.js src/ble_vario <outDir>`; strict build with VarioLink's own checks: `node test/ble_vario/build.js`.
- **Watch log**: `node ../SUUNTOPLUS-AGENTIC-DEV-ENV/tools/watch-log/watch-log.js <serial> --grep "vl\]|variol|relMem|JsTot"`. Debug builds write `[vl] …` lines: every BLE event, each connect attempt, unknown NMEA sentence ids, and every 10 s `[vl] <state> <ok> <bad> <maxlen> <phase> <step> <rg> <fm> <air> <page> <circling> <fix age> <wind>`.
- **Memory**: sp-mem (real Duktape 2.7, lowmem, 32-bit estimate) via `node test/ble_vario/mem/measure.js`; test M2 runs it and holds the recorded figures.
- **Round-screen check**: `node ../SUUNTOPLUS-AGENTIC-DEV-ENV/tools/safe-area.js --inflate 1.15 <screenshots>`.
- **Vario capture**: `uv run --with bleak python tools/ultrabip_capture.py <outDir>` from Terminal (it needs the Bluetooth permission). The 2026-10-03 capture is the main test fixture.
- **Watch quirks**: `../SUUNTOPLUS-AGENTIC-DEV-ENV/docs/WATCH_QUIRKS.md`. Store submission: its `suuntoplus-store-submission` skill.

## Daily loop

```bash
node test/ble_vario/run.js                                    # 74 tests, must be 0 failures
node test/ble_vario/variant.js demo <dir> sim dp=10 pg=0      # simulator build: synthetic flight, thermal at ~40 s, glide at ~78 s
node test/ble_vario/variant.js dbg <deploy-folder> sn=Abel pg=0   # watch build with the [vl] trace (add ,map to force the map page)
```

Deploy only from one fixed folder: the Editor's deploy assigns the app ID per source folder path, and a new folder installs a second copy of the app (this happened once: `variol02`). The `golden.json` used by test D1 is recorded from the v1.0 source with only the intended behaviour changes applied (`test/ble_vario/golden.js`); re-record it only for a reviewed change of the classic page.

## Architecture

- **Minifier rules** (SPEC §0.1.1 T2): only top-level `var` and lifecycle functions survive; outputs are written only from lifecycle functions or helpers that receive `output` by name; no `{{` in JS (Handlebars). Each closure assigns its helper to the module variable and returns it, so the dispatcher holds the file's only `return function`.
- **`main.js`**: the BLE link state machine (one appConn call per tick, every call in try/catch, bounded retries), the streaming NMEA parser (allocation-free; LK8EX1 for pressure and vario, RMC for the GPS line; 20-byte notifications reassembled), the tick bins, calibration, flight and thermal detection, outputs and the screen push. 50 module names (Duktape grows the scope record above 56).
- **Only `main.js` calls `evalFile`.** `ext1.js` search filters (exact name `UltraBip🪂<name>`; the service UUID filter never finds the vario), `ext2.js` UUID registration (2-byte form first; the 16-byte form gets 110 on the Race S), `ext3.js` summary, `ext4.js` demo feed, `ext5.js` settings, texts and selectors.
- **XC engine** (only with Pages = automatic, compiled at exercise start): `ext6.js` ground velocity from watch fixes, circling detection, the map position in the air mass; `ext7.js` the circling wind (Kåsa fit, weighted store); `ext8.js` heights, glide ratio, the page machine and the climb session gain (rule: `docs/research/xc-features/thermal-gain-rules.md`); `ext9.js` the XC texts. Results go through the shared `Float32Array` `XC` (layout at the top of `main.js`).
- **Template** (`v.html`): static elements toggled by visibility (always `'#id'` and `'#id *'`, only divs), texts set only on visible elements. The thermal map is a canvas built in the template from three subscribed outputs (`tx`, `ty`, `tn` = tick·16 + map-page bit + lift bucket): a 240-s ring, round dots from round line caps (same cost as a line segment), 4-step fade, core = lift-squared-weighted centre with a ring sized by the lift area, steady centre and zoom.

## Watch limits that shaped the design

- **Memory**: the JS heap is shared by every app in the sport mode. VarioLink v1.0 plus a second app filled it (`JsTotMem 131072/133120`); the XC pages pushed a second app out (`relMemCb`). Today: classic 30.5 KB, automatic pages 46.9 KB steady in sp-mem. With the pages on, VarioLink must be the only SuuntoPlus app in its mode.
- **Allocations**: nothing above ~4 KB, no allocation per BLE notification, every compiled function ≤ ~1.9 KB, `data.json` under 2 KB.
- **Canvas**: about 2 × strokes + lineTo ≤ 200 per frame or the canvas goes black; the map draws at most ~130 units. `arc`, `fill` and `lineCap` exist; `arc`'s frame cost is unmeasured.
- **Subscriptions**: a sport mode refuses them past ~15 (`Too many sim. path-param calls`); VarioLink uses 6 inputs plus 3 template subscriptions.
- **Display**: updated once per evaluate (1 Hz). The watch's own Searching screen gives up after ~24 s unless `con` becomes 1.
- Settings cannot be edited on a sideloaded app: bake test settings into `data.json` with `variant.js … key=value`.

## Extending it

- **Another vario**: capture its advertisement and stream with `tools/ultrabip_capture.py`, add its name to `ext1.js` and its sentences to the parser (keep it allocation-free), add the capture as a fixture and a test in `run.js`, measure with M2.
- **A new field or page**: prefer the XC engine files (compiled only when used) over `main.js`, keep each function under 1.9 KB, add a test and re-measure memory. Check the simulator on displays q, n and o.
- Mark anything that has not passed a recorded watch run as beta in the listing.

## Related projects

- [suuntoplus-agentic-dev-env](https://github.com/aabbeell/suuntoplus-agentic-dev-env): the build, deploy, simulator, memory and watch-log tooling these apps use
- [Suuntopo](https://github.com/aabbeell/suuntopo): climbing topos on the watch, with its browser topo editor in the same repo
- [AirTemp for Suunto](https://github.com/aabbeell/suunto-airtemp): air temperature and humidity from a Bluetooth sensor
