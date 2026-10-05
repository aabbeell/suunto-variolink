## SuuntoPlus BLE device apps (appConn): research report

The local reference docs (`suuntoplus_reference_docs.md` lines 2459-3185) and the reference HTML bundled with Editor 1.42.0 have the same BLE text. I checked the BLE template, the simulator bundle and the build tool. I read about 60 forum threads through the NodeBB JSON API. Forum search needs a login, so I listed categories 62 and 46 page by page and fetched their topics. I also read 6 open-source BLE apps on GitHub. Anything marked **[inferred]** is my own reasoning and was not checked against a source.

---

### 1. appConn API reference

**Manifest (required from FW 2.22.32):**
- `"type": "device"`.
- An out variable named `"con"`, for example `"out":[{"name":"con"}, ...]`.
- When the user selects the app, the watch shows a "Searching" popup. It closes once `output.con` is non-zero.
- The build produces a `.dev` package instead of `.fea`. This is in `suuntoplus-tools/lib/project/build.js`: `device→dev`, `feature→fea`.
- FW 2.39.20 on Race S added "SuuntoPlus sport Apps display device connection status". The template sets `con` back to 0 on disconnect.

**Globals:**
- `appConn` is the system object.
- `enabledZappId` is set by the system. The docs say any integer works, but you should pass `enabledZappId`.
- The build tool's global table (`lib/javascript/variable.js`) lists only 5 appConn methods: `connect, regUuid, readChar, writeChar, enaCharNotf`. The API has **no disconnect, no scan or advertisement listener, no RSSI, no MAC address, no MTU request and no pairing/bonding call**.

**Functions:**

| Call | Args | Returns / events |
|---|---|---|
| `appConn.connect(enabledZappId, handler, searchParam1[, searchParam2])` | `searchParam` is a byte array, documented as max 16 bytes (see the note below) | Returns a `connectionId`. Fires 111 CONNECT_DONE (the call was accepted), then later 100 CONNECTED, or 101 if it failed. Fires 112 CONNECT_FAILED if the call itself failed. The system disconnects automatically when the app unloads. |
| `appConn.regUuid(connId, charId, serviceUuidLE[16], charUuidLE[16])` | `charId` is your own integer | 107 UUID_REGISTERED / 108 failed |
| `appConn.readChar(connId, charId)` | | 102 READ_DONE (data = bytes) / 103 |
| `appConn.writeChar(connId, charId, bytes)` | max **20 bytes**. The docs add "MTU negotiation is not supported". | 104 WRITE_DONE / 105 |
| `appConn.enaCharNotf(connId, charId)` | writes the CCCD | 109 CONFIG_DONE / 110. After that, 106 NOTIFICATION arrives whenever the device sends data. |

**Handler:** `function(characteristicId, eventId, data)`.
- The handler does **not** receive a connectionId.
- For connection-level events (100, 101, 111, 112) `characteristicId` carries no meaning.
- Event ids: 100 CONNECTED; 101 DISCONNECTED ("Automatic reconnection is attempted by the system"); 102-112 as in the table above.
- The template's comments also list 113 DISCONNECT_DONE, 114 DISCONNECT_FAILED and 115 INDICATION. These are undocumented. The Nuki app handles 115 the same way as 106.

**Error codes** appear in the system log as `ERR BLE : Duktape BLE API err N`:
- 0 no error
- 1 connection already exists
- 2 connection limit reached
- 3 connection not found
- 4 connection init failed
- 5 invalid parameters
- 6 characteristic map failed
- 7 characteristic not mapped
- 8 not connected
- 9 request allocation failed
- 10 request queue failed
- 11 interrupted
- 12 send failed
- 13 exec failed
- 14 remote error

**How data arrives in JS:**
- Both the docs and the template describe `data` as a "byte array".
- Every example indexes `data[i]` and checks `data.length`. To decode, the docs copy bytes into `new Uint8Array(n)` and then use `new DataView(u8.buffer).getFloat32/getInt16/getUint16(off, true)`. Little-endian is the norm.
- The Bosch app runs bitwise operations directly on `data[pos]`. GlucoStride checks that each element is a number from 0 to 255.
- **[inferred]** Treat `data` as an array-like of unsigned byte numbers. It is unverified whether it is a real Array, a Uint8Array or a Duktape buffer. Copy it into a Uint8Array before using DataView, and do not rely on Array methods such as slice or concat working on it directly.
- Data is not a string. Varios that send NMEA text (LK8EX1, LXWP0, XCTRC) must be decoded from ASCII bytes and the lines reassembled across notifications **[inferred]**.

**Search parameters:** the first byte selects which advertised field is matched:
- 2 / 3 = partial / complete list of 16-bit service UUIDs
- 4 / 5 = partial / complete list of 32-bit service UUIDs
- 6 / 7 = partial / complete list of 128-bit service UUIDs
- 8 = short local name
- 9 = complete local name
- 255 = manufacturer specific data

Examples:
- Docs: 16-bit UUID 0xFDF3 → `[3,0xF3,0xFD]` and `[2,0xF3,0xFD]`.
- Official template, 128-bit UUID 01020304-0506-0708-090A-0B0C0D0E0F00 → `[6, 0,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1]`. That array is **17 bytes**, so the documented "max 16 bytes" most likely means the bytes after the type byte **[inferred]**.
- The FORM goggles app (verified on hardware, Vertical 2) passes a single parameter `[255, 0x7D, 0x06]`: manufacturer company ID 0x067D in little-endian. So `searchParam2` is optional.
- Name matching (exact or prefix) is undocumented. The Nuki author believed a complete-name filter of "Nuki" never matched locks that advertise "Nuki_44793FEC". This was not validated on a watch.
- The Bosch repo has a comment calling type 6 "solicitation". That is wrong: 6 is the partial list of 128-bit UUIDs.

**UUID encoding for regUuid:**
- Full 16-byte arrays with the bytes reversed from the canonical string. For example Bosch LDI `0000eb20-eaa2-11e9-81b4-2a2ae2dbcce4` → `[0xe4,0xcc,0xdb,0xe2,0x2a,0x2a,0xb4,0x81,0xe9,0x11,0xa2,0xea,0x20,0xeb,0x00,0x00]`.
- Helper: strip the dashes, split into hex byte pairs, reverse.
- **[inferred]** For SIG 16-bit UUIDs, expand onto the base UUID `0000xxxx-0000-1000-8000-00805F9B34FB`, giving LE bytes `[0xFB,0x34,0x9B,0x5F,0x80,0x00,0x00,0x80,0x00,0x10,0x00,0x00, lo, hi, 0x00,0x00]`. Every example uses 16-byte arrays, and nothing shows whether 2-byte arrays are accepted.

**Canonical flow** (docs, template, Bosch, FORM). `evaluate()` runs about once a second as soon as the app is selected, before the exercise starts.
1. `connect` → wait for 100.
2. `regUuid` once per characteristic → wait for 107 each time. Registration **persists across reconnects**, so keep a `registered` flag.
3. `enaCharNotf` → wait for 109.
4. Set `output.con = 1`.
5. Handle 106 notifications.
6. On 101, set `con = 0`, clear the values and wait. The system reconnects, which delivers 100 again, and you must **re-enable notifications** without registering again.
7. The template ignores data until `onExerciseStart`.
8. `onExerciseEnd` exists. The framework disconnects right after it, so FORM sends a final best-effort `writeChar` inside try/catch.

Template conventions:
- Each connect or regUuid call goes in its own `extN.js` file, loaded with `evalFile('{file_path}/extN.js')` to save memory. The file name must start with "ext", and the file must be a single function expression.
- Characteristic ids start at 0 in the template and at 1 in the docs. Both work.

### 2. Two devices from one app

**What the docs say:**
- Under "Current watch firmwares", Suunto 3/5/5 Peak/9/9 Baro/9 Peak support one connection with MTU 23.
- 9 Peak Pro, Vertical, Vertical 2, Race, **Race S**, Race 2, Ocean and Ocean Lite support **two connections at a time**, with MTU fixed at 127.
- The docs do not say whether that is per app or per watch, or whether native sensors count against it. Forum users read it as per watch.

**The API is shaped for more than one connection:**
- `connect` returns an id that every later call takes.
- Error codes 1 (connection already exists) and 2 (connection limit reached) exist.

**No example or confirmation found:**
- I found no example and no forum report of a single app calling connect twice.
- In 2024 (Vertical/Race FW 2.35-2.37), with Stryd and an HRM connected natively, a user could keep only one SuuntoPlus BLE device connected at a time across two SuuntoPlus apps (CORE, Train.Red, ENGO). 2.37.34 partly improved this, then problems came back.
- In the Shimano Di2 thread, HR, power and speed/cadence connect natively and Di2 additionally connects through SuuntoPlus. So native sensors are managed separately, but they share the same BLE layer.
- A Garmin speed + cadence attempt by a forum user failed (no code was posted).

**[inferred] Design if you try it:**
- Make two `connect` calls with different search filters and **separate handler closures**, because the handler gets no connectionId.
- Use characteristic ids that are unique across both connections.
- Start the second connect only after the first reaches 100 or fails.
- Keep two independent state machines.
- Treat error 2 or a missing 100 as "not supported" and fall back.
- If both devices advertise the same UUID, filter on name or manufacturer data. Otherwise the second connect may hit the device you are already connected to.
- Hardware fallback: the Bosch pattern, where an ESP32 aggregates both devices and exposes one peripheral.
- This must be tested on a real Race S.

### 3. Pitfalls and bugs reported on the forum

**Request queue:**
- Several `writeChar` calls in one tick throw `Duktape BLE API 9` and the firmware disables the app (FORM README).
- Keep one write in flight and send the next one on 104 or 105. Two writes plus one read in the same tick worked.

**Write and packet sizes:**
- Writes are capped at 20 bytes (docs, and FORM's mock enforces it). Larger payloads have to be chunked. There is no MTU negotiation.
- Bosch LDI protobuf notifications decode fine on Race S, which fits MTU 127 for incoming data **[inferred]**.

**Security:**
- No PIN or passkey pairing, and no bonding API. A device that requires a PIN cannot be used. The forum workaround was to switch the device to a no-PIN mode.
- Application-level crypto is possible (Nuki port of tweetnacl), but the runtime has no random number source.

**Device selection:**
- There is no device picker. The watch connects to the first device that matches.
- Users raised the risk of connecting to someone else's Di2, or to the wrong Concept2 PM5 in a busy gym.
- Put a serial number or name into the filter, for example through a setting **[inferred]**.

**Peripherals that accept one connection:**
- A device already connected to its phone app (Shimano, PM5, Bosch) will not connect to the watch.
- When a SuuntoPlus app holds the link to a trainer, the watch cannot also pair it as a native power meter (oCycler with a Kickr Bike).
- Custom outputs cannot overwrite native FIT power or cadence, so TSS stays HR-based.

**Phone as peripheral** (Live.τ, the glucose BLE bridges, GlucoStride):
- On Android, the Suunto app takes back the watch's single link to the phone every 60-90 s. The SuuntoPlus app then drops and reconnects within about a second. iOS is not affected.
- Phone notifications stop reaching the watch while this is active.
- An "only one live link to the phone" limit is described.

**Reconnection and firmware bugs:**
- The system reconnects automatically, but apps cannot control it. Live.τ reports cases where the watch stays in "reconnecting" until the app or watch is restarted.
- Shimano devices looped between connect and disconnect. This was fixed in FW 2.37.34 (Sept 2024).
- Race S (latest FW 2.53.42, April 2026): users report that external sensors are not reconnected after a dropout. The fix shipped to Race 2, Vertical 2 and Run 2 ("Renesas BT firmware" update). Race S has not received it as of late Sept 2026.
- The Live.τ developer (Aug 2026) suspects AURA, Suunto's BLE layer between Duktape and Zephyr. AURA appears to hit an assertion when it reconnects while Zephyr still holds a stale connection, and to leak its fixed write-request pool. This comes from log analysis and has not been confirmed.

**Memory and eviction:**
- The shared JS heap is 133,120 B. FW 2.50.26 allows 3 SuuntoPlus apps per sport mode.
- Under pressure the firmware unloads an app (`RelMem->unload`), the BLE connection dies (`Ble:conn id not found`), and the app is never re-enabled during that exercise.
- Re-enabling a single app from the in-exercise menu leaks its module scope. About 10 toggles froze a Vertical 2. The leak scales with the number of module-level functions.
- Mitigation: few top-level functions, logic moved into ext files, small templates.

**Build and runtime rules:**
- ES5 / Duktape only: no `let`.
- The build checker rejects global `function x(){}` declarations unless they are lifecycle names ("Defining global function 'X' is not allowed"). Helpers must be `var x = function(){}`. Verified in `lib/javascript/check.js`.
- On the watch, subscribed inputs go undefined → NaN → number, so guard them with `isFinite`.
- Use `setText`, not text outputs.
- At most 5 logged outputs (docs), 10 inputs and 25 outputs (schema).

**Template comment bugs:**
- The comment saying state is changed by event 111 is wrong. Only 100 means connected.

**Battery:**
- No measurements exist for BLE apps. The forum has only anecdotes (S+ apps cost "some" battery, Live.τ says the impact is low).
- **[inferred]** Prefer notifications over polling reads, and avoid writing every tick when nothing changed.

### 4. Testing and deployment

**Simulator: no BLE.**
- Verified in `webview-resources/main.js` of Editor 1.42.0: `appConn = {connect(){}, regUuid(){}, readChar(){}, writeChar(){}, enaCharNotf(){}}` and `enabledZappId = () => {}`.
- So `connect` returns `undefined`, no events ever fire, and `con` stays 0.
- The forum confirms that BLE works only on the physical watch.

**Ways to mock:**
- **In-app flag.** Bosch uses `SIMULATE_SWEEP` and Nuki uses a `Simulator mode` setting, both of which bypass BLE and generate data. **[inferred]** You can also detect the simulator because `connect()` returns undefined there, then call your handler with fake events and byte arrays from `evaluate`.
- **Node harness.** zestuart/suunto-form `test.js` loads the real `main.js` and `ext*.js` through `new Function` with a mocked appConn. The mock captures writes, auto-acknowledges with 104, enforces the 20-byte limit, and drives 100, 107, 109, 102 and 106. It runs 43 byte-level assertions. nuki_suunto uses Node `vm` the same way.
- **Hardware emulation.** The ESP32 bridge has a simulation mode. A phone GATT server works too (Live.τ and GlucoStride pattern; nRF Connect's server is **[inferred]**).

**Debugging:**
- Call `systemEvent('[TAG] ...')`.
- Read the logs in VS Code under Explorer → Suunto Watch → View system events. BLE API errors show there with the codes listed above.
- The "Enable BLE Debug Logging" command is for the watch-to-PC link.

**Deploying:**
- Use "SuuntoPlus: Deploy to Watch" or "Add SuuntoPlus Binary to Watch" with the `.dev` file, over USB or Bluetooth.
- For Bluetooth: forget the MobileApp pairing on the watch, and on macOS set the watch serial in "macOS Bluetooth Serial".
- `SDSApplicationServer` is x86_64 only (verified with `file`), so Apple Silicon needs Rosetta. macOS 27 no longer installs Rosetta automatically, but it can still be installed manually. On this Mac (macOS 27.0) Rosetta is present and `oahd` is running.
- **Every sync with the Suunto app deletes sideloaded apps.** Use a test watch that is not paired to the phone. Unofficial helpers: SyncFix, an Android app that re-sends the packages, and zappctl, a Linux deploy tool.
- Settings for sideloaded apps cannot be changed from the Suunto app, so test settings through `data.json` defaults.
- There is no beta channel. Publishing goes through Partner Program approval (up to about 2 weeks), an uploaded source package and a manual review. In Aug-Sep 2026 store updates stopped propagating because of a backend bug.

### 5. Existing apps with temperature sensors or varios, and other BLE apps

**Temperature:**
- Official **SuuntoPlus CORE** (CORE body-temperature sensor over BLE; records and displays core temperature).
- Train.Red is another official sensor app. It had connection problems in 2024 alongside CORE.
- I found no app for ambient-temperature sensors.
- **[inferred]** Standard targets would be Environmental Sensing 0x181A / Temperature 0x2A6E (sint16, 0.01 °C, LE, notify), or Health Thermometer 0x1809 / 0x2A1C. The latter is indicate-only, and whether `enaCharNotf` enables indications (event 115) is unverified.
- **[inferred]** Sensors that only broadcast in advertisements cannot be read at all, because the API has no observer or scan mode.

**Varios:**
- The built-in Suunto "Variometer" uses the watch's own barometer. Sound pitch cannot be controlled from SuuntoPlus.
- I found **no published BLE-vario app**. One user started building one in Sept 2026 (topic 15859, 9 Peak Pro).

**Other BLE apps, for reference:**
- Official: ActiveLook/ENGO glasses, FORM goggles, Shimano Di2 and e-bike, Stryd, ErgSync (Concept2), Tymewear (unofficial).
- Community: oCycler (FTMS), Bosch LDI via an ESP32 bridge (open source), suunto-form (open source), ErgInfo (repo empty), Live.τ (phone link), GlucoStride (phone link), and Nuki (not yet validated on hardware).

## Key facts
- Device BLE apps need manifest "type":"device" plus an out variable "con". The Searching view closes when output.con != 0. The build produces a .dev package. [reference_docs.md ~L2474; suuntoplus-tools build.js]
- appConn has exactly 5 methods: connect(enabledZappId, handler, sp1[, sp2]) returns connectionId; regUuid(conn, charId, svcLE16, chrLE16); readChar; writeChar(conn, charId, bytes<=20); enaCharNotf. There is no disconnect, scan, RSSI, MTU or pairing call. [reference_docs.md L2488-2572; lib/javascript/variable.js]
- Handler is (characteristicId, eventId, data). Events: 100 connected, 101 disconnected (system auto-reconnects), 102/103 read, 104/105 write, 106 notification, 107/108 regUuid, 109/110 notify config, 111 connect call done, 112 connect failed. The template also lists undocumented 113/114 disconnect and 115 indication. [reference_docs.md L2594-2609; template main.js]
- Notification data is an array-like of byte numbers (data[i], data.length). The docs copy it into a Uint8Array and decode with DataView getX(offset, true), i.e. little-endian. Exact JS type is unverified. [reference_docs.md L2840-2855; template main.js]
- Search param byte 0 selects the advertised field: 2/3 16-bit UUID list (partial/complete), 4/5 32-bit, 6/7 128-bit, 8 short name, 9 complete name, 255 manufacturer data. The rest are LE bytes, e.g. [3,0xF3,0xFD]. The official template uses 17-byte 128-bit filters. FORM uses a single [255,0x7D,0x06] filter. [reference_docs.md L2508-2520; template ext1.js; zestuart/suunto-form]
- regUuid UUIDs are full 16-byte arrays with the bytes reversed from the canonical string. [reference_docs.md examples; BoschEBikeSuunto ext2.js; suunto-form validate.js]
- Race S is in the 'two connections, MTU fixed at 127' group. Older S3/5/9 have one connection and MTU 23. writeChar is still capped at 20 bytes with no MTU negotiation. [reference_docs.md L2462-2471, L2559]
- Registration survives reconnect, but notifications must be re-enabled after each 100 CONNECTED. [template main.js; BoschEBikeSuunto; suunto-form]
- Several writeChar calls in one evaluate tick throw 'Duktape BLE API 9' and the firmware disables the app. Keep one write in flight and drain on 104/105. [zestuart/suunto-form README]
- The simulator stubs every appConn method as a no-op, so connect returns undefined and no events fire. BLE works only on hardware. [webview-resources/main.js in Editor 1.42.0; forum 14783 pid 188090]
- Sideloaded apps are deleted on every Suunto app sync. Use an unpaired test watch, or SyncFix/zappctl (unofficial). [forum 14897, 15217/15588, 15618]
- There is no PIN or passkey pairing and no bonding. The workaround is the device's no-PIN mode. [forum 14783 pid 188604/189870]
- There is no device picker: the watch connects to the first device matching the filter. [forum 10693 Di2; 5967 Concept2; suunto-form README]
- Shared JS heap is 133,120 B. When the firmware evicts an app, its BLE connection dies and the app is not re-enabled. Toggling an app in the exercise menu leaks memory. [forum 15692, 15490]
- Race S external-sensor reconnection bug is unfixed as of FW 2.53.42 (Sept 2026). Fixes shipped for Race 2, Vertical 2 and Run 2. [forum 15754, 15629; Suunto Race S release notes]
- The build checker rejects global function declarations other than lifecycle hooks; helpers must be var function expressions. ext files must be single function expressions named ext*. [suuntoplus-tools lib/javascript/check.js; nuki_suunto CLAUDE.md]
- SDSApplicationServer (used for deploys) is x86_64 only. This Mac runs macOS 27.0 and has Rosetta installed (oahd running). [file command; forum 15331]
- Existing BLE apps: official SuuntoPlus CORE (body temperature), Train.Red, ENGO/ActiveLook, FORM, Shimano Di2/e-bike, Stryd, ErgSync, Tymewear (unofficial), oCycler FTMS. No BLE vario app is published. The built-in Variometer uses the watch's own barometer. [forum 11480, 15787, 11215, 15859; corebodytemp.com]

## Open questions
- Can one Race S sports app hold two appConn connections at once? Do native sensors or the phone link count against the 'two connections' limit, and are characteristicIds scoped per connection? Needs a hardware test.
- Exact JS type of the 'data' argument (Array, Uint8Array or Duktape buffer), and whether writes over 20 bytes work on MTU-127 watches despite the docs.
- Does searchParam name matching (types 8/9) compare exactly or by prefix? How are two search params combined (assumed OR)?
- Does enaCharNotf enable indications on indicate-only characteristics (e.g. Health Thermometer 0x2A1C), and does that fire event 115 instead of 106?
- Does regUuid accept 2-byte arrays for SIG 16-bit UUIDs, or must they be expanded to 128-bit?
- Is it safe to call appConn functions from inside the event handler, or must calls be deferred to evaluate() as all examples do?
- Do undocumented events 113/114 imply a hidden disconnect method on firmware? The build tool knows only 5 methods.
- Real battery cost of a BLE device app on Race S. No measurements were found.
- Will the Race S BLE reconnection fix (shipped to Race 2 / Vertical 2 / Run 2) arrive, and in which firmware?
- Which BLE service and characteristics the target vario or temperature sensor exposes, and whether it supports connectable GATT without a PIN. Many cheap sensors only advertise.

## Sources
- file://PROJECTS/SUUNTOPO/reference/suuntoplus_reference_docs.md — BLE Device Connection section L2459-3185: limits, manifest, functions, events, step-by-step examples, BLE error codes
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/templates/New-SuuntoPlus-BLE-Sport-App — Official template: main.js state machine, ext1-4 connect/regUuid, extra event ids 113-115
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/webview-resources/main.js — Simulator: appConn methods are empty no-op stubs
- ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/lib — build.js (device to .dev), variable.js (5 appConn methods), check.js (global function rule), function.js (lifecycle names)
- https://forum.suunto.com/topic/14783 — No-stupid-questions thread: BLE needs no pairing, no BLE in the simulator, PIN workaround, 2-connection concerns, deploy tips
- https://forum.suunto.com/topic/14766 — Share-your-projects thread: phone as peripheral, 20 B MTU drawbacks, glucose BLE bridge
- https://forum.suunto.com/topic/15217 — Bosch eBike LDI on Race S through an ESP32 bridge
- https://forum.suunto.com/topic/15588 — Sideloaded apps erased on sync; native power/cadence mode is the alternative
- https://forum.suunto.com/topic/15534 — GoPro BLE question; flash-only testing, systemEvent logging
- https://forum.suunto.com/topic/15787 — oCycler FTMS app: cannot pair the same trainer natively, custom fields cannot replace FIT power
- https://forum.suunto.com/topic/11480 — CORE/Train.Red: only one SuuntoPlus BLE device at a time in 2024 firmware
- https://forum.suunto.com/topic/11562 — Live.tau: link conflict with Suunto app on Android, reconnection limits, AURA BLE layer analysis (Aug 2026)
- https://forum.suunto.com/topic/15692 — Device app evicted under memory pressure loses its BLE connection; 133,120 B JS heap
- https://forum.suunto.com/topic/15490 — Vertical 2 freeze from leaked module scope when toggling apps
- https://forum.suunto.com/topic/15754 — Race S Bluetooth reconnection issue as of Sept 2026
- https://forum.suunto.com/topic/15629 — HR strap not reconnecting; fix in Q2 firmware for Race 2 / Vertical 2
- https://forum.suunto.com/topic/10702 — Shimano e-bike app connect/disconnect loop; reconnection behaviour; fixed in 2.37.34
- https://forum.suunto.com/topic/10693 — Di2 app: native sensors plus SuuntoPlus BLE; first-match device selection risk
- https://forum.suunto.com/topic/5967 — Concept2 PM5 / ErgSync: peripheral accepts one connection
- https://forum.suunto.com/topic/14767 — Simulator vs watch discrepancies; systemEvent debugging; NaN inputs on watch
- https://forum.suunto.com/topic/14897 — Sideloaded apps deleted on sync; SyncFix Android re-push tool
- https://forum.suunto.com/topic/15331 — SDSApplicationServer is x86_64 only; macOS 27 Rosetta caveat
- https://forum.suunto.com/topic/15859 — User starting a BLE vario app on 9 Peak Pro; Windows deploy difficulties
- https://forum.suunto.com/topic/11215 — Built-in Variometer uses the watch barometer
- https://forum.suunto.com/topic/10104 — Sound pitch cannot be controlled from SuuntoPlus (vario beeps)
- https://forum.suunto.com/topic/15784 — Store update propagation bug, Aug-Sep 2026
- https://github.com/SellA/BoschEBikeSuunto — Open-source Race S BLE app: protobuf notification parsing, SIMULATE flags
- https://github.com/zestuart/suunto-form — Open-source device app verified on Vertical 2: manufacturer-data filter, 6 characteristics, write queue (BLE API 9), Node mock harness
- https://github.com/slavikpi/nuki_suunto — BLE app with app-level crypto, vm-based mocked BLE tests, build-checker rule; not validated on a watch
- https://github.com/fralik/GlucoStride — Phone-as-GATT-server pattern; 20-byte LE packet protocol; watch connects with AD 6/7 filter
- https://github.com/wylandplex/zappctl — Unofficial Linux BLE deploy tool; watch MTU 127; watch accepts one central
- https://apizone.suunto.com/suuntoplusEditor — Official: .dev for BLE device apps, deploy commands, simulator scope
- https://apizone.suunto.com/suuntoplus-sports-apps — Official overview: external BLE devices, output fields in FIT
- https://www.suunto.com/Support/Software-updates/Release-notes/suunto-race-s-software-updates/ — Race S firmware history: 2.53.42 latest, 2.39.20 device connection status, 2.50.26 sensor changes
- https://help.corebodytemp.com/hc/en-us/articles/35118075812498-Suunto — CORE body-temperature sensor uses the SuuntoPlus CORE app over BLE
