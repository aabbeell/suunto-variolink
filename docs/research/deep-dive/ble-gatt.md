# Deep dive: ble-gatt (verified)

## Conclusion
I re-checked the report's three most load-bearing claims and one of them changes the plan.

1. **`output.*` inside the BLE handler.** The build-side claim is confirmed: I re-ran the editor's own validator and minifier. That it throws a ReferenceError on the watch is a strong inference, not confirmed. The trap is also wider than the report says. Copying `output` into a variable, or passing it to a function loaded with `evalFile`, inside onLoad or evaluate also leaves `output` undefined after minification, and the build gives no warning at all.
2. **Typed arrays.** The docs and validator list only Int8Array, Uint8Array, Float32Array and DataView (confirmed). The claim that the earlier Int16Array advice was "wrong (confirmed)" is corrected to unverified. The validator only warns. The docs' list leaves out DataView, so it is incomplete. In stock Duktape all typed arrays are switched on together.
3. **Request pool.** writeChar issued from inside the 104 handler is confirmed on hardware (FORM, Vertical 2). The numbers are corrected. FORM's README says only "many" writes in one tick throw err 9; "4-6" was the investigator's guess. The "3 worked" case was 2 writes plus 1 read, run once at setup. The suspected AURA write-pool leak means capacity can shrink during a session.

**The finding the investigator missed** is a hardware log in forum 14783 #117: regUuid returned 107 with no connection at all. So 107 only means the UUID was registered locally. The probe chose the UUID form from 107, so its central test (T1) cannot answer the question. It is also blind for a second reason: phone GATT servers (Android, Zephyr) treat 2-byte and 16-byte UUIDs as equal, so T1 must run against the UltraBip itself. The same log shows that an uncaught appConn error inside evaluate makes the firmware disable the app.

Confidence: build-tool findings confirmed; 107-is-local strong evidence (one hardware log); ReferenceError at runtime and Int16Array availability inferred.

## Design rules
- Never use `output` as a bare value anywhere. Write only `output.<name>` inside a lifecycle function, or pass `output` as an argument to a module-level `var f = function(output){...}` helper. Do not alias it (`var o = output`, `OUT = output`), do not pass it to a function loaded with evalFile (ext*.js), and do not write it from the BLE handler or closures. The minifier leaves all of these as an undefined `output`, which most likely throws on the watch, and the aliasing and ext cases produce no build warning. The handler writes module variables; evaluate() publishes them.
- Treat 107 as 'registered locally' only. It arrives even before a connection exists (forum 14783 #117 log). Mark a characteristic usable only after 109 from enaCharNotf, 102 from readChar, or its first data event.
- Treat event 106 and event 115 the same way (`case 106: case 115:`). Treat 109 as necessary but not sufficient. If no data arrives within about 10 s after 109, fall back to readChar wherever the characteristic allows reads.
- Never issue regUuid, enaCharNotf, readChar or writeChar before event 100 (CONNECTED). Advance setup on 100, never on 111 (CONNECT_DONE). Calling enaCharNotf while not connected throws err 8, and the firmware disables the app.
- Wrap every appConn call in try/catch. An uncaught appConn error in evaluate disables the app (log: 'ERR BLE : Duktape BLE API 8' then 'run evt 1' then 'Disable'). Treat a thrown error as busy or failed, and retry on a later tick with a bounded count.
- For 16-bit UUIDs (UltraBip FFE0/FFE1, ESS, HTS, FTMS), give each array form its own characteristicId: for example id 1 for the 2-byte form and id 2 for the base-expanded 16-byte form. Run enaCharNotf (or readChar) on one id per tick. Keep the form that gets 109 or data, and save it in localStorage. Never decide the form on 107 or 108.
- For 128-bit custom UUIDs (Bosch, FORM), pass regUuid 16-byte arrays in reversed byte order, the form confirmed on hardware.
- In v1, do not depend on indicate-only characteristics (HTS 0x2A1C cannot be read). Use 0x2A1E Intermediate Temperature (notify) when the device exposes it.
- Keep exactly one GATT request in flight in steady state. Issue the next request from the completion event (102, 103, 104, 105) or on the next tick. More than one request per tick is proven only once, at setup (2 writes plus 1 read, Vertical 2). The suspected AURA write-pool leak can shrink capacity after disconnects, so never plan on bursts.
- Use Int8Array, Uint8Array, Float32Array and DataView only. Allocate one Uint8Array and one DataView over its `.buffer` at load time, and decode int16 and int32 with bit arithmetic. Other typed arrays are undocumented, not proven absent. Do not depend on them until the probe's `PRB TA` line shows they exist.
- Treat `data` as an opaque array-like. Use only `data.length` and `data[i] & 0xff`, copy into the preallocated buffer, and never keep a reference to it after the handler returns.
- A handler that fires more than once a second must allocate nothing: no `new`, no array or object literals, no string concatenation and no closures. Put systemEvent logging behind a DEBUG flag.
- Count 107 events for each characteristic and set `registered` only when all of them are done. On every 100, skip regUuid when registered (registration is local and outlives the link), and always call enaCharNotf again, one call per tick.
- On 101: set con to 0, mark values stale, drop the write queue, clear every in-flight flag without waiting for a 104 or 105, and issue no appConn calls until the next 100. Show a LOST mm:ss state, and after 60-120 s with no 100 tell the user to restart the app. Do not encourage toggling the app in the exercise menu (heap leak, forum 15490).
- For any bench test with a phone acting as the peripheral, use a phone that is not paired with the watch's Suunto app. The Suunto app takes over the watch-phone link and causes disconnects the app did not cause.

## Hardware tests
- T0, no hardware needed: ask oleksandr (forum 15787) which regUuid array form oCycler uses for FTMS 0x1826/0x2AD2, and whether he ever sees event 115. His app has streamed data on two different bikes for an hour, so his answer settles which form works on real devices.
- T-TA, zero cost, first line of any probe run: probe v2 logs `PRB TA I8=.. U8=.. F32=.. DV=.. I16=.. U16=.. I32=.. U32=.. F64=.. AB=.. U8C=..` and `PRB DV roundtrip 1.5` in onLoad. 'function' for I16 means Int16Array exists. 'undefined' confirms the documented-only set. `DV THREW` would mean even the official DataView pattern fails on this firmware.
- T1a (107 is local): probe v2 registers the custom control before event 100. Expected: `EV 107 ch 3 up=-1` and `PRE-CONNECT 107 ch3: registration is local`. This repeats the forum 14783 #117 finding on the Race S.
- T1b (UUID width, decided by notifications and not by 107), against the REAL UltraBip: use the winning probe logic with FFE0/FFE1. Register the 2-byte form as id 1 and the 16-byte form as id 2, then run enaCharNotf on each in turn. Expected: `EV 109 ch N` followed by `EV 106 ch N` with NMEA bytes for the working form. The failing form shows 110, `THREW ... err 6/7`, or 109 with no data. A phone server (probe v2 `FORM ok2byte=.. ok16byte=..`) shows only whether AURA accepts each form at all. A phone cannot show the width-mismatch failure, because Android and Zephyr servers treat 2-byte and 16-byte UUIDs as equal.
- T2 (data type): send FF 80 7F 00 01 02 on FFE1 and on FFE2. Expect `DATA ev 106 ch N typeof=.. tag=.. isArr=.. u8=.. buf=.. slice=.. len=6 : 255 128 127 0 1 2`. Values -1 or -128 mean the bytes are signed. The `RETAINED` lines show whether the buffer is reused.
- T3 (indications): 0x2A1C is set to Indicate only on the phone. Check the phone server's log for the CCCD value written (0x0002 or 0x0001). Then send an indication. The outcome is `EV 115 ch 4`, `EV 106 ch 4`, or nothing. `DATA COUNTS ... ch4=0` after a 109 means enaCharNotf wrote only the notify bit.
- T4 (calls from inside the handler, read rate): expect `reg5 ESS 2A6E from-handler called` then `EV 107 ch 5`, and `CHAIN done 21 reads in X ticks`. 21/X is reads per second for this peer. `CHAIN stalled` means a readChar issued inside 102 does not work.
- T5 (pool), two separate final runs because each can disable the app: run BURST=1 (`BURST 6 reads`) and BURST=2 (`BURST 6 writes`). The first `THREW` or `err 9/10` at call k means that pool's depth is k-1. Different k for reads and writes means separate pools. Repeat BURST=2 after several forced disconnects, to look for the pool shrinking (the leak hypothesis).
- T6 (short drop), with a phone NOT paired with the watch's Suunto app: during the idle state, turn the phone's Bluetooth off for 10 s. Expect `DISCONNECTED inFlight=..`, a possible `EV 105` or err 11, then `RECONNECTED after N ticks; not re-registering`. Before the staggered re-enables, data counts should not rise (CCCD reset). They should rise after `enaN called` and 109.
- T7 (long outage, Race S FW 2.53.42): repeat T6 with Bluetooth off for 60 s, 5 min and 15 min, using the same unpaired phone. Record whether `EV 100` returns. At 120 ticks, `connect again returned/THREW/err 1` shows whether a second connect is allowed.
- T8 (hidden API): read the `PRB appConn key <name> <type>` lines at load. Any key beyond the 5 documented methods is undocumented.
- T9 (UltraBip payload), after T1b: log `data.length` for each 106. The docs fix MTU at 127 on Race S (124-byte payload), but a forum developer reports about 20-byte payloads in practice. The measured maximum length sets the buffer size and whether NMEA lines must be reassembled across notifications.

## Report
# ble-gatt: adversarial re-check (2026-10-03)

Scratch files are in `/tmp/deep-ble-gatt/verify/`:
- `trap2/`, `trap3/`: minifier test cases
- `probe2/`: corrected probe app
- `sim2.js`: mock run of the probe
- `forum/all62.json`: every post in forum category 62 (59 topics, 543 posts)
- `brecht1.png`, `brecht2.png`: the forum 14783 #117 screenshots

I did not touch the two project repos or the original `/tmp/deep-ble-gatt/probe/`.

## Verdict on the three load-bearing claims

| # | Claim in the report | Status |
|---|---|---|
| 1 | Writing `output.*` in the BLE handler throws a ReferenceError; the build only warns | Build side **confirmed**. Runtime error **[corrected]** to strong inference. The trap is **wider** than stated. |
| 2 | Only Int8Array, Uint8Array, Float32Array and DataView exist; the Int16Array advice was "wrong (confirmed)" | What the docs and validator list: **confirmed**. "Wrong (confirmed)": **[corrected]** to undocumented, availability **[unverified]**. |
| 3 | 3 queued requests worked, about 4-6 in one tick throw err 9; writeChar from inside the 104 handler is proven | Handler-issued writeChar: **confirmed**. The numbers: **[corrected]**. |

---

## Claim 1: `output` inside the handler (Q4)

**Re-checked.** I read `suuntoplus-tools/lib/javascript/minifier.js` and ran `validateData` and `minifyFile` myself (`/tmp/deep-ble-gatt/verify/trap2`, `trap3`).

**What the minifier does**
- It inlines the lifecycle function bodies into `return function(_e,_,_d){...}`.
- It rewrites `output.x` or `output['x']` to `_[i]`, but only inside lifecycle functions, their nested closures, and module-level `var f = function` helpers that are called with `output` as an argument.
- The real build uses the same `minifyData` (`lib/project/minify.js`). `ext*.js` files go through `minifyExt`, which is escodegen only and rewrites nothing.

**Reproduced.** A module-level handler containing `output.con = 1` comes out with a free `output`. The validator prints only `WARN 'output' is not defined` and returns valid=true.

**[corrected] Confidence of "throws at runtime".** No test ever ran on a watch, so the runtime part is a strong inference, not a confirmation. It rests on two things:
- `output` is not among the validator's globals: the typed arrays, the 20 native functions in `function.js`, and `appConn`, `enabledZappId`, `$`, `localStorage`, `zPopupShown` in `variable.js`.
- The reference (L3317) gives "undefined variable" as a cause of event failure.

**[new] The trap is wider, and the build does not warn.** Inside a lifecycle function, any bare `output` that is neither a `.x` access nor an argument to a known `var` helper stays free:
- `OUT = output` in onLoad minifies to `n=output`.
- `ext(output)`, where `ext = evalFile(...)`, stays `ext(output)`.
- `var o = output; o.con = 1` becomes `output.con=1` after terser inlines it.

The validator gave **0 warnings and valid=true** for these (`trap3`), because `output` is a declared parameter in the source. Each would throw in onLoad or evaluate on the watch (inferred).

The other case is a closure defined inside a lifecycle function: its `output.x` becomes `_[i]` on that call's array. Whether ESW reads that array later is unknown, so do not rely on it.

**No counter-example.** FORM, Bosch, GlucoStride, Nuki and hangboard all publish outputs only from evaluate, onLoad or helpers called with `output`.

## Claim 2: typed arrays (Q3)

**Confirmed**
- Reference L949 lists Int8Array, Uint8Array and Float32Array as the supported built-ins.
- The ESLint globals in `validate.js` are exactly those three plus DataView.

**[corrected] The validator does not block anything else.**
- `new Int16Array`, `Uint32Array`, `Float64Array` and `ArrayBuffer` each produce only a no-undef **warning**, and valid=true.
- `typeof Int16Array` produces no warning at all.

**[corrected] The documented list is incomplete.** DataView is not in the L949 sentence, yet the official examples use it with `.buffer` (L2873, L3052, L3155; template L90).

**Duktape.** The firmware is Duktape (log tags `ERR DUKTAPE`, `Duktape BLE API`). Its `DUK_USE_BUFFEROBJECT_SUPPORT` turns all typed arrays on or off together (raw `config/config-options/DUK_USE_BUFFEROBJECT_SUPPORT.yaml`). Removing single constructors is possible only through custom `--builtin-file` metadata (`tools/configure.py` L108).
- Inference: since DataView and `.buffer` work, Int16Array most likely exists, unless Suunto removed it on purpose.
- No public app or dev-forum post uses Int16Array, Uint16Array, Int32Array, Uint32Array, Float64Array or ArrayBuffer. I checked all cloned repos and all 543 posts in category 62.
- No third-party app that has run on a watch uses DataView either. FORM, Bosch and GlucoStride decode bytes by hand. DataView rests on the official docs alone.

**Net effect.** "Avoid Int16Array" stays as a cheap, conservative rule. Critique §3a was not shown to be wrong; it is unverified. Probe v2 logs `typeof` for every typed array and a DataView round trip in onLoad, which settles this in one run.

The heap quotes hold: forum 15279 pid 192003 (matram, seven Uint8Array(4000) on a Race S) and 15350.

## Claim 3: request pool and writes from inside the handler (Q4/Q5)

**Confirmed** in `zestuart/suunto-form`. It has a single commit, b485512 (2026-07-21), shallow and also checked on GitHub.
- `pump()` (main.js L54-59) is called from the 104/105 handler (L166-174).
- The README reports about 1 Hz streaming verified in open water on a Vertical 2, including the stop write from `onExerciseEnd` (L251).

**[corrected] "About 4-6 in one tick throw err 9."** The README says only that **many** writeChar calls in a single evaluate tick throw `Duktape BLE API 9` and the app is disabled. It gives no count, and there is no git history of the burst version. The 4-6 is the current runTick frame size: GPS, timer, state, 1-2 TLV writes, and units on change.

**[corrected] "The pool holds at least 3."** The evidence is ST_SETUP (L199-208): 2 writeChar plus 1 readChar in one tick, once, at setup, on a **Vertical 2**. Two caveats:
- Nikolai's AURA analysis (11562 #347, pid 194945) describes a fixed pool of **write** requests. Reads may use a separate pool, which would make this "2 writes, 1 read".
- The same post says the pool can leak a request whenever a completion arrives after its connection is gone. Capacity measured in a fresh session therefore does not hold after reconnects.

**Error codes.** Err 9 is "Request allocation failed" and err 10 is "Request queue failed" (reference L3183-3184). This is consistent with exhausting a pool of request objects, not a fixed queue depth.

**Consequence for T5.** The original probe bursts **reads**, which may not exercise the write pool FORM hit. Probe v2 has BURST=1 (6 reads) and BURST=2 (6 writes) as separate runs.

---

## New primary evidence the investigator missed

### A. regUuid returns 107 without a connection; an uncaught appConn error disables the app

Source: forum 14783 #117, pid 189588, brechtvb, 2026-04-13. Code and log screenshots are saved as `/tmp/deep-ble-gatt/verify/brecht1.png` and `brecht2.png`.

**What the log shows**
- The app moved to registration on **111 (CONNECT_DONE)**, not on 100.
- It called regUuid with the 16-byte base-expanded CSC 0x1816/0x2A5B.
- It received `event 107 for characteristic 1` within the same second. No event 100 appears anywhere.
- The next tick, `enaCharNotf` produced `ERR BLE : Duktape BLE API 8` (8 = Not connected, L3182). Then came `ERR APPLICATION : Zapp suunto02:run evt 1`, `Zapp suunto02:Disable`, and later `Ble:conn id not found`.

**What follows**
1. **107 means the UUID was registered locally (strong evidence).** It does not mean the characteristic exists on the peer, or that the array width matches the peer's declaration. The UUID-width question (Q2) can only be answered by enaCharNotf giving 109, readChar giving 102, or data actually arriving. Failure would show as 110/103 or a thrown err 6/7 ("Characteristic map failed" / "not mapped").
2. **[corrected] The original probe's T1 logic is invalid.** It sets `form16` from which registration returned 107, then enables notifications on only that one characteristic. If both forms return 107 locally, it picks the 2-byte form and never tests the 16-byte form.
3. **[corrected] The same flaw is in design rule 4.** It falls back on 108 or "no 107"; it must decide on 109 or data instead.
4. **appConn errors are thrown into JS.** An uncaught one in evaluate shows as "run evt 1" and the firmware disables the app. This firmware writes "run evt N", not the "Exec. event x failed" wording of L3315. It strengthens the try/catch rule. Inference: catching the error prevents the disable.
5. **Never issue appConn requests before event 100.** Advancing setup on 111 is a real, observed bug.

### B. A phone GATT server cannot test the risk the report itself identified

- **Android's GATT server** (AOSP `system/stack/gatt/gatt_sr.cc` L611 and L774-776, `gatt_utils.cc` L597-614) parses the Find By Type Value UUID into a normalised `Uuid` (`From16Bit` / `From128BitLE`) and compares the objects.
- **Zephyr's server** (`subsys/bluetooth/host/att.c`, find_type_cb) uses `bt_uuid_cmp` to match UUIDs of different widths.
- So against a phone, a 16-byte filter matches a 2-byte declaration even where the UltraBip's stack might compare raw bytes. The Zephyr client side is as the report says (`gatt.c` L4011-4040 sends the filter at its declared width).
- **Result:** the 16-bit width risk is narrower than implied, since major server stacks normalise. But only a run **against the UltraBip itself** settles it for the UltraBip. Its stack is closed; STM32WB is only inferred in ultrabip.md.

### C. The Suunto app competes for the watch-phone link

- Nikolai reports that the Suunto app takes over the watch-to-phone link on Android every 60-90 s (11562 #102, pid 169252).
- He also says that holding an appConn link to the phone cuts the Suunto app off (14766 #20, pid 187577). That post also confirms Live.τ uses appConn to a phone peripheral.
- **Consequence:** a probe peer running on the phone paired with the Suunto app will see disconnects the app did not cause. T6/T7 must use a phone that is not paired with the watch.

### D. oCycler evidence is stronger than cited

- 15787 #10 (pid 198369): a full 1-hour session on a KICKR Bike V2 recorded speed, power and cadence; distance did not record.
- 15787 #12: a second KICKR user reports the same.
- So data from a 16-bit SIG service (FTMS) does flow through appConn. This is real data flow, which 107 alone would not prove.
- 14783 #118 (Merach R50 rower data) is probably FTMS too **[unverified]**.
- Side note: 15787 #3 reports the watch cannot hold a native sensor link and the app's link to the same KICKR at once.

### E. Smaller corrections

- **[unverified] T9 payload prediction.** The doc fixes MTU at 127 on Race S (L2472). But Nikolai's practical report is "payload ~20B" (14766 #20, direction unspecified), and writeChar is capped at 20 B (L2559). The "up to 124 B" prediction for UltraBip notifications is open; T9 measures it.
- **[corrected] Citation for "SuuntoPlus cannot bond".** 14783 #5 (pid 186721) answers "no afaik" to whether a device **must** be paired before reading. It does not say bonding is impossible. Related: a developer with a PIN-requiring device got no answer and worked around it with the device's NO_PIN mode (14783 #115, #121). No bonding API is documented. The rule to re-enable notifications after each reconnect still holds and costs nothing.
- **CCCD reset citation.** No local copy of the Bluetooth Core spec exists. The scratchpad `core_spec.txt` is the greenteg CORE sensor spec. Zephyr's server `disconnected_cb` (`/tmp/deep-ble-gatt/gatt.c` L3534-3540) clears the CCC for non-bonded peers on disconnect, which corroborates the spec rule (Vol 3 Part G 3.3.3.3). The claim holds.

---

## What still holds (spot-checked, unchanged)

- **Q1.** Event 115 appears only in the commented block of the template (`templates/New-SuuntoPlus-BLE-Sport-App/main.js` L105-128). Indication support is unknown. HTS 0x2A1C is indicate-only.
- **Q2.**
  - No appConn argument is checked at build time (`types.d.ts` L41-45 are untyped `number[]`).
  - Every public example uses 16-byte arrays.
  - The connect scan filter does take 2-byte 16-bit UUIDs (`[3,0xF3,0xFD]`, reference L2522-2523); that is the advertising filter, not regUuid.
- **Q3.** `data` supports `.length` and `data[i]` on hardware (FORM `parseKeys`, Bosch `readVarint`). `types.d.ts` L39 declares `data?: number[]`.
- **Q6.**
  - Short drops reconnect in about 1 s (pid 169252).
  - Long outages may never recover (pid 169312, pid 194945).
  - The Race S native-sensor reconnect bug is open.
  - The docs and template skip regUuid on reconnect.
  - **Strengthened:** registration is a local table that exists even before the link does (A.1).
- **Template bug** (`registered = 1` on the first 107) holds.

## Probe v2 (scratch, ready)

Location: `/tmp/deep-ble-gatt/verify/probe2/` (`manifest.json`, `t.html`, `main.js`).
- It passes the editor's validator with **0 warnings** and minifies to 4,876 B with no free `output`.
- `node /tmp/deep-ble-gatt/verify/sim2.js` walks every state.

Changes from v1:
1. Registers the custom control **before** 100, to repeat finding A on the Race S.
2. Registers FFE1 in 2-byte form and FFE2 in 16-byte form, then calls **enaCharNotf and readChar on both**. `form16` is decided from 109/110 (logged as `FORM ok2byte= ok16byte= okCtrl=`).
3. Logs `PRB TA ...` (the `typeof` of every typed array) and `PRB DV roundtrip 1.5`.
4. `BURST=1` bursts 6 reads; `BURST=2` bursts 6 writes. Run each separately and last.
5. Re-enables notifications after a reconnect one call per tick.
6. Counts data events per characteristic, so a 109 that delivers no data is visible.

## Still unknown (hardware only)

- Which UUID width AURA accepts **for discovery against the UltraBip**.
- Indications: whether they work and which event id they arrive on.
- Whether Int16Array and the other typed arrays exist.
- Whether `output` is really undefined at runtime (very likely).
- Read and write pool depths, and whether they are separate.
- What a thrown error inside the BLE handler does: is the app disabled?
- What happens to in-flight writes on disconnect.
- Long-outage reconnect on the Race S.
- Whether a second `connect()` is allowed.
- The real notification payload size on the Race S.
- Type and lifetime of `data`.
