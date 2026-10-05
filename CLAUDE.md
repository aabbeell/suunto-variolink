# CLAUDE.md

SuuntoPlus sports apps that read external Bluetooth LE sensors on Suunto watches, built for the public SuuntoPlus store.

## Apps

| Folder | App |
|---|---|
| `src/ble_vario/` | Paragliding vario display for the Stodeus UltraBip / BlueBip (NMEA over BLE, service FFE0 / characteristic FFE1) |

Each app has its spec in `docs/<app>/SPEC.md`, parser tests in `test/<app>/`, store assets and listing text in `store/<app>/`, and versioned builds in `builds/<app>/v<version>/`.

## Key references

- `docs/research/` — research behind the apps: BLE API and pitfalls (`forum-ble.md`), UltraBip protocol (`ultrabip.md`), store rules (`store.md`), community landscape (`forum-projects.md`).
- SuuntoPlus API reference (authoritative): `../SUUNTOPO/reference/suuntoplus_reference_docs.md`; official examples in `../SUUNTOPO/reference/suunto_plus_examples/`.
- SuuntoPlus Editor extension (templates, schema, build library): `~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/`.

## Build, test, preview

- Build and validate offline: `node tools/sp-build.js src/<app> [outDir]` (uses the SuuntoPlus Editor's own build library; non-zero exit on failure).
- Parser tests: `node test/<app>/run.js` (plain Node, no dependencies).
- Simulator screenshot (needs VS Code open with the SuuntoPlus MCP Bridge extension): `node tools/bridge-call.js screenshot '{"app":"<absolute app dir>","display":"q"}' out.png`. The simulator stubs all BLE calls, so apps feed demo data when `appConn.connect` returns nothing.
- Round-edge check for screenshots: `node tools/safe-area.js [--annotate out.png] shot.png ...` flags text that is clipped by, or (after widening each element x1.15 for the real watch's wider glyphs) within 6% of the radius of, the round edge; exit 1 on a violation, `--selftest` checks the checker.
- BLE behaviour can only be verified on a real watch with the real sensor.

## Platform rules (from the reference docs, the build validator and the forum)

- ES5 only (Duktape): no arrow functions, `let`/`const`, template literals, classes, regex literals in main.js, or `Date`. Helpers must be `var name = function () {}`; top-level function declarations only for lifecycle callbacks.
- Use `setText()` / `setStyle()`; never assign `output.x = "text"` for display text.
- Watch CSS: width, height, color, background-color, opacity, border, visibility; px and % only.
- Memory: all enabled apps share about 133 KB of JS heap; aim for 30-40 KB per app. Large literal arrays and regex can trigger "Maximum SuuntoPlus apps reached".
- BLE: manifest `"type": "device"` with a `con` output (Searching view closes when `con != 0`); re-enable notifications after every reconnect (event 100); one `writeChar` in flight at a time; no pairing/PIN, no device picker (first matching device wins).
- Display `q` (466 px: Race, Race S, Race 2, Vertical 2, Ocean) is the primary target; the store cannot restrict watch models, so `n` (240 px) and `o` (280 px) must not break.
- Every code file starts with a two-line `ABOUTME:` comment.
