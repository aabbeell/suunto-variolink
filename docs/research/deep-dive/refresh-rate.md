# Deep dive: refresh-rate (verified)

## Conclusion
The core conclusion holds (strong evidence). The guaranteed rate for BLE-derived values on screen is 1 Hz, because Suunto's reference says output changes reach the firmware only after evaluate() (L1129-1130 checked word for word), and evaluate runs about once per second (L989, L1044). Whether setText, setStyle or gaugeControl called from the BLE handler repaints before the next evaluate is still UNKNOWN, and hardware test A still decides it. Three corrections to the report:
- **No `output` in the BLE handler.** Its signature is (characteristicId, eventId, data) (reference L2578-2590; official template L25). The documented path is: handler stores values, evaluate writes outputs. "Outputs written in the handler" is an undocumented pattern.
- **The ~10 Hz Tick10hz rate is Suunto's stated figure, not a measurement.** That the tick fires on hardware is confirmed (14770 #0, #3; 15279 #0).
- **The simulator's 1000 ms evaluate timeout can never fire.** It is dead code.

The investigator also missed some things that change the design but not the 1 Hz ceiling:
- **A canvas-free needle.** `gaugeControl` (rotates an SVG path, drawn by the firmware) with <svg>/<path> is in the tools library but not in the reference.
- **setStyle may only work for visibility.** It is proven only for visibility on hardware, so bars should be pre-built segments that are shown or hidden.
- **Subscribing to Zapp outputs is contested.** Forum topic 15320 advises against it for data that must survive lap overlays. Prefer <eval> bindings.

## Design rules
- Treat 1 Hz as the guaranteed display rate for BLE-derived values. The handler stores parsed values in module-scope variables, and only evaluate() writes outputs. The BLE handler signature is (characteristicId, eventId, data) and has no output parameter (reference L2578, L2586-2590; template main.js L25). Do not capture `output` in a global to write it from the handler.
- Bind outputs to the screen primarily with <eval input="Zapp/{zapp_index}/Output/x">, the official template pattern, which is framework-managed. Template $.subscribe on Zapp outputs (the Bosch pattern) is allowed only if it is made in onActivate and cleared with $.unsubscribe in onDeactivate, and treat its survival across lap overlays as unverified (15320 advises against it).
- Draw bars and colour changes as pre-built segments or colour variants toggled by setStyle(...,'visibility',...) or setVis. Runtime setStyle is proven on hardware only for visibility, and 'background' was a silent no-op (climb-logger, Vertical 2). Do not depend on runtime height, left or colour until test A shows they work.
- For a needle, prefer an SVG <path> rotated by gaugeControl(sel, angle, 'radian') over a canvas. It is drawn by the firmware, has no canvas render budget, and is a native in suuntoplus-tools (it is missing from the reference). Drive it from an <eval> script formatter at 1 Hz, and from main.js only if test A passes. Its use by Suunto's own ZoneSense is known secondhand, so confirm on the device.
- Keep the 106 handler allocation-free: a preallocated Uint8Array line buffer, byte-level LK8EX1 parsing, an Int16Array ring buffer, and no strings, split, regex, closures, new Uint8Array or new DataView per event. The official template's per-notification allocation (L81, L89) must not be copied.
- Parse only LK8EX1. Drop LXWP0, GGA and RMC after their identifying bytes.
- Ship setText, setStyle or gaugeControl calls from the BLE handler only after hardware test A shows they repaint faster than evaluate. Even then: at most 3-5 Hz, only when the quantised value changed, only while the view is active (Event 1/0 from onActivate/onDeactivate), and with every string precomputed.
- Every setText target must start with non-space text, have an id unique across templates, and be visible (reference L1296-1322).
- Make every template $.subscribe call (Tick10hz, native resources) in onActivate and $.unsubscribe it in onDeactivate.
- Keep live <eval> bindings in the mounted template few. Hidden bindings still count, and about 80 live paths across all co-apps trigger 'ERR WBMAIN: Too many sim. path-param calls' (climb-logger ADR-002).
- If a canvas is used at all, only for template-owned data: refresh it only when its content changed, stagger refreshes across Tick10hz ticks, and stay within the Race S budget (about 24 lineTo per path; 2*strokes + lineTo <= about 200 per canvas).
- Never judge refresh behaviour in the simulator. It runs one 1 Hz loop that rebuilds canvases every tick, Tick10hz is undefined, control() is a no-op, appConn is stubbed, setText is a synchronous jQuery .html(), and its 1000 ms evaluate timeout is dead code that never fires.
- Log at most 5 outputs (the reference says 5; the validator's MAX_LOGGED_OUTPUTS is 6). The manifest allows at most 20 outputs and 10 inputs (lib/ng/limit.js).
- Show a stale state when no valid sentence has arrived for more than 2-3 s, and fall back to <eval> on /Fusion/Altitude/VerticalSpeed.
- Keep evaluate() short. Watch overrun behaviour is unknown, and the simulator will not catch an overrun.
- In every long hardware run, watch system events for 'WBMAIN pool id:0 full', 'Too many sim. path-param calls', relMemCb, JSalloc and JsTotMem.

## Hardware tests
- A (amended). Latency of native calls from a callback other than evaluate, no BLE needed; this decides Tier 1.
- Template onActivate subscribes to /Dev/Time/Tick10hz. Each tick increments a template counter tk and puts $.put('/Zapp/{zapp_index}/Event', 1, null, 'int32').
- The template also subscribes to /Dev/Time. On each change it does setText('#r', String(tk - tkPrev)), giving measured Tick10hz callbacks per second, and then sets tkPrev = tk.
- main.js onEvent increments a counter n and calls setText('#a', String(n)). It also calls gaugeControl('#ndl', n*0.6, 'radian') on an SVG path, setStyle('#bar','height', H[n%10]) with a precomputed px-string table, and setStyle('#sw','visibility', n%2 ? 'VISIBLE' : 'HIDDEN').
- evaluate sets output.c = n; an <eval> shows Output/c.
- Record a slow-motion phone video.
- Expected if natives are immediate: #a counts up in steps of 1 at about #r Hz; the needle steps smoothly; #sw blinks at about 5 Hz; c jumps by about 10 once per second.
- If #a jumps by about 10 once per second, the natives are coalesced to evaluate, and 1 Hz is the ceiling for all main.js data.
- If the bar height never changes while visibility does, runtime setStyle is visibility-only on this watch.
- #r settles the real Tick10hz rate.
- Run for 10+ minutes and check system events for 'WBMAIN pool id:0 full'. A pool-full means pumping onEvent at 10 Hz is unsafe; matram saw WBMAIN errors tied to app events in 14783 #134.
- B. Template pull. In the same app, main.js onEvent also sets output.b = n, and the Tick10hz callback calls $.get('/Zapp/{zapp_index}/Output/b', function(v){ setText('#d', String(v)); }). Expected: #d changes once per second (ESW copy refreshed after evaluate). If #d tracks #a, the template can pull live main.js values faster than 1 Hz.
- C. With the UltraBip connected. The 106 handler counts notifications and the last data.length, and calls setText('#n', String(count)) on every 5th notification. evaluate outputs the count delta per second. Expected: about 20-22 notifications/s at MTU 127 and data.length of about 33-45 B. The cadence of #n repeats test A's verdict in the real BLE context. Log 30 minutes for WBMAIN, relMemCb and JSalloc.
- D. Heap probe. Add /Ui/Script/MemoryPool/Allocated and /Ui/Script/MemoryPool/Peak (undocumented) as inputs, logged via outputs. Run Tier 0 and Tier 1 for 30 minutes each, with 1 and then 2 apps enabled. Expected: a flat Allocated with the allocation-free parser. If the paths are not readable, record that.
- E. Battery cost. If /Device/Power/BatteryCurrent is readable, log it for 10 minutes per mode (no pushes / 1 Hz / 5 Hz handler pushes) with the display forced on and the vario streaming, repeated twice. Otherwise compare battery-% drop per hour (a coarse method).
- F. AOD. With Tier 1 running, let the Race S fall into always-on display. Note whether #a/#n update at sub-second rates, at 1 Hz, or not at all.
- G. Native vario fallback rate. Template $.subscribe('/Fusion/Altitude/VerticalSpeed') counts callbacks per /Dev/Time second and shows the count with setText. Expected: about 1 Hz.
- H (lap-overlay survival, from the 15320 conflict). Put Output/c on screen both through an <eval> binding and through a template $.subscribe made in onActivate (with $.unsubscribe in onDeactivate). Trigger 3 manual laps. Expected per 15320: the <eval> keeps updating. If the $.subscribe copy freezes after the second onActivate, use <eval> only.

## Report
# Refresh rate: adversarial verification of the "refresh-rate" report

I re-opened every primary source myself. On 2026-10-03 I re-fetched the forum topics through the JSON API:
- `/tmp/deep-refresh-rate-verify/t14766.txt`
- `t14767.txt`
- `t14770.txt`
- `t14783.txt`
- `t15279.txt`
- `t15320.txt`
- `t15692.txt`

I re-read the reference, the simulator runtime, the tools library and the official BLE template. I pulled the main.js files of 12 public SuuntoPlus repos and the wylandplex/suuntoplus-climb-logger docs into `/tmp/deep-refresh-rate-verify/src/`.

Tags: **[corrected]** means the original claim was wrong or misframed. **[unverified]** means the claim rests on weaker evidence than stated, or a primary source contradicts it. **[new]** means the original report missed it. Everything else was re-checked and holds.

## 0. The three load-bearing claims

### Claim 1: main.js data reaches the screen at 1 Hz, gated by evaluate

**HOLDS, with a framing correction.**

What checks out:
- Reference L1129-1130 says, word for word, "ESW is notified of the updates only after evaluate callback. This means you won't see the value updating on the screen after this callback but only after evaluate is executed the next time."
- L989 says evaluate "triggers about once per second". L1044 says "Is evaluated every 1 second (+/- 0.005 seconds error)".
- L101 says logging happens "every time the sports app updates which means once per second".
- brechtvb (14783 #43-44) reports that onAccelerometer is never called. That caveat is real: the one sentence sits in a section the community found stale.

[corrected] The BLE handler has no `output` parameter:
- Reference L2578 and L2586-2590, and the official template `templates/New-SuuntoPlus-BLE-Sport-App/main.js` L25, all give `bleEventHandler(characteristicId, eventId, data)`.
- The reference's own step-5 example puts the value handling in evaluate (`case 4: // Handle received value`, L2845-2846). The handler only parses (L2864ff).
- The official template does the same: it assigns outputs in evaluate (L225-228).
- So "an output written in the BLE handler appears up to 1 s late" describes a pattern that is not documented. You would have to keep `output` in a global from onLoad or evaluate, and whether that object stays live on the watch is untested.
- The real latency of the documented path is the time from a notification to the next evaluate (0-1 s). The ESW update then follows that evaluate, per L1129.
- The callback enumeration (L3317-3332) lists evaluate, onEvent, onAccelerometer and others, but no BLE callback. That is further evidence that the handler is outside the documented output contract.

### Claim 2: template Tick10hz + control('#cnv','REFRESH') runs at about 10 Hz, "confirmed on hardware"

**PARTLY HOLDS. [corrected]: the tick fires on hardware, but the rate is Suunto's stated figure, not a measurement.**

- Official tutorial (14770 #0, SuuntoPartnerTeam, 2026-03-09), checked word for word: the tick "will trigger the callback function approximately 10 times per second (this essentially works like setInterval in JavaScript)", and "Please note that the app does not work in the simulator."
- matram on a Race S (15279 #0) refreshes two canvases from `/Dev/Time/Tick10hz` (code checked). In 15279 #3 three canvases at 10 Hz filled WBMAIN (`pool id:0 full! (S 120/120)`).
- manuel caudera (14770 #3): FowlPlay now runs in the latest simulator, "So much slower than on my Suunto Race watch but WORKS!!!". That shows the watch ticks faster than the simulator. It is not a count.
- No post counts ticks per second. That Tick10hz fires on hardware and drives REFRESH is confirmed. "About 10 Hz" is vendor-stated. Test A, as amended in section 8, measures it.
- [new] Tick10hz is not the only timer in the template:
  - Reference L1656 shows `setTimeout(function(){control('#cnv','REFRESH')}, 1000)` in template context.
  - climb-logger's `docs/UI_PLATFORM_KNOWLEDGE.md` (secondhand, from a decompile of Suunto's ZoneSense) says ZoneSense refreshes its canvas with `setInterval(..., 2000)`.
  - Template timers do not change the main.js-to-UI ceiling.

### Claim 3: the template cannot see main.js or BLE state faster than the 1 Hz outputs, and no public app pushes BLE data faster than 1 Hz

**HOLDS as an evidence statement. The unknown stays unknown.**

- matram 14766 #92, checked word for word: "with no method of passing an array we are stuck with doing this on the UI side". That is about arrays, not rate.
- Outputs are numeric on the watch. 14767 #0 says `output.textField = "some text"` "Works in the simulator, but not on a physical watch".
- I re-surveyed the public repos found by `gh search repos suuntoplus`, by "suunto plus", and by topic.
  - The BLE apps with source are FORM, Bosch, nuki_suunto and the official template. ErgInfo's repo is empty: LICENSE and README only.
  - None calls setText, setStyle or gaugeControl from a BLE handler. FORM's handler only drives the one-write-in-flight `pump()`.
- [new] Natives called from non-evaluate callbacks do run on hardware:
  - climb-logger (a shipping app) calls `setText(EDR, …)` from paths dispatched by onEvent (`main.js` L353, L436, L441, reached from `onEvent` at L592ff).
  - Constantin calls `unload('_cm')` directly from onEvent, and "The template changes correctly" (14783 #133).
- Neither case reports timing. So it is still unknown whether a native call outside evaluate repaints before the next evaluate.

## 1. Per-technique update rate (corrected table)

| # | Technique | Rate on screen | Status | Evidence |
|---|---|---|---|---|
| 1 | Handler stores values in module globals; evaluate writes `output.x`; template `<eval input="Zapp/{zapp_index}/Output/x">` | ≤1 Hz. Latency is notification → next evaluate (0-1 s), then the ESW update | Documented | L1129-1130, L989, L1044; reference step-5 example; template L225-228. [corrected]: the handler gets no `output` (L2578, L2586-2590) |
| 1b | Same, but template `$.subscribe` on the output in onActivate (Bosch) | ≤1 Hz | [unverified] after lap overlays | 15320: the "Zapp output channel … also severed on second onActivate", and the post advises "Do not subscribe to Zapp outputs … for data that must survive lap overlays". Bosch ships the onActivate/onDeactivate pattern anyway. Its behaviour across laps is unreported. |
| 2 | setText / setStyle from evaluate | 1 Hz | Confirmed | Reference L1296-1322; 14767 #0 |
| 3 | setText / setStyle / gaugeControl from the BLE 106 handler or from onEvent | **Unknown** | Hardware test A decides | Natives execute from onEvent on hardware (climb-logger; 14783 #133), but nobody reports timing |
| 4 | Template Tick10hz + control REFRESH on template-owned data | About 10 Hz, as Suunto states | Fires on hardware: confirmed. Rate: [corrected] vendor-stated, unmeasured | 14770 #0, #3; 15279 #0 |
| 5 | Template polls `$.get('/Zapp/{zapp_index}/Output/x')` at 10 Hz | Unknown; probably the 1 Hz copy | Hardware test B decides | No source |
| 6 | Template `<eval>`/`$.subscribe` on native resources (`/Fusion/Altitude/VerticalSpeed`) | Firmware publish rate, unknown | Unknown | Hardware test G decides |
| 7 | 1 Hz tick from the template | 1 Hz via `/Dev/Time` | Forum claim | 14783 #147 (there is no Tick1hz), #148 |
| 8 | FIT logging | 1 Hz | Confirmed | L101 ("maximum of 5"). The validator allows 6: `lib/ng/limit.js` `MAX_LOGGED_OUTPUTS=6` (also `MAX_RESOURCES_OUT=20`, `MAX_RESOURCES_IN=10`) |
| 9 | `unload('_cm')` | Not an update path | Doc L1227-1260 | 14767 #0: "wait a cycle or two" |
| 10 [new] | SVG `<path>` needle rotated by `gaugeControl(sel, angle, 'radian')`, drawn by the firmware | Rate of whatever drives it: 1 Hz from an `<eval>` script formatter; unknown from main.js (test A) | Native exists (confirmed); used by Suunto's own ZoneSense (secondhand) | `suuntoplus-tools/lib/javascript/function.js` nativeFunctions: "gaugeControl: Sets SVG element path rotation". `<svg>` and `<path>` are in `lib/project/html.js`. climb-logger `docs/UI_PLATFORM_KNOWLEDGE.md` §3 (from a ZoneSense decompile). Not in the reference. No canvas render budget applies. |

## 2. Simulator: why it cannot answer the question

Everything below was checked in `~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/webview-resources/main.js`.

**The loop.**
- `Gz=1e3` is the setInterval period of `startUpdate`. `DF=200` is the guard in `triggerUpdateSecond`.
- Each tick runs, in order: `updateInputs`, then `handleSubscriptions`, then `viewStack.update`, then `runEvaluate`.
- `handleSubscriptions` calls every callback whose value `!==void 0`. Confirmed.

**Tick10hz.**
- `/Dev/Time/Tick10hz` appears only in the resource list.
- `getResource` has a `case"dev/time"` but no tick10hz case, and its switch ends `default:return`, so the value is `undefined`. The subscription therefore never fires. Confirmed.

**The natives.** All confirmed:
- `n.control=(m,k)=>{}` is a no-op.
- The `appConn` methods `{connect, regUuid, readChar, writeChar, enaCharNotf}` are all empty.
- `n.setText` uses jQuery `.html()`.
- `n.gaugeControl` is implemented.

**[new] Why FowlPlay "works but slower" in the simulator (14770 #3).** `viewStack.update` rebuilds canvases on every 1 Hz tick whatever control() or Tick10hz do. So a Tick10hz animation runs at 1 Hz in the simulator. This fits the code and the forum report.

**[corrected] The evaluate timeout is dead code.**
- `runEvaluate` builds `e=new Promise(i=>{this.mainJs.evaluate(...),i()})`. That executor runs evaluate synchronously and resolves.
- Only after that does it create the 1000 ms timeout promise `t`. `Promise.race([e,t])` is therefore already settled.
- The simulator never aborts a slow evaluate; it just blocks. Nothing is known about how the watch handles an evaluate overrun.

**[new] Evaluate before exercise start.** The simulator calls `runEvaluate` only when `status===Start`. The docs say evaluate runs before exercise start (L989). That is another simulator-versus-watch difference.

**Conclusion (unchanged):** in the simulator, setText from a handler always appears to work, and Tick10hz never runs. The simulator cannot settle any rate question.

## 3. Firmware architecture and costs

**Contexts.** Separate zapp and UI execution contexts are supported by the reference: "releaseMemoryCb (exec. zapp)" versus "(exec. ui)" under System events. State crosses only through outputs, natives and the template-to-main.js `$.put('/Zapp/{zapp_index}/Event')`.

**Heap.** The figures as reported:
- 133,120 B JsTotMem (15692 #1).
- matram's 7 × 4,000 B Uint8Arrays on Race S (15279 #0).
- climb-logger separately measures a per-app RelMem ceiling of about 28 KB on Vertical 2 (UI_PLATFORM_KNOWLEDGE §1).

**WBMAIN pool [unverified on mechanism].** The figures are confirmed:
- 120 slots on Race S (15279 #3) and 140 on Race 2 (15692 #0).
- "Removed 121 non critical" (15692 #0).

The cause is not established:
- matram explicitly speculates that it "has to do with communication between FW, app (main.js) and UI".
- The observed trigger was simultaneous refreshes of three canvases. Staggering them fixed it (15279 #3, #5).
- omunoz's pool-full happened at exercise start, cause unknown.
- matram also logged `ERR WBMAIN : *0: app 717 Event 37` on Race S while doing template switches driven by onEvent (14783 #134). That hints that app events go through WBMAIN.

"main.js-to-UI pushes fill WBMAIN" is therefore inference. Keep the warning and treat the mechanism as a hypothesis.

**[new] A second WBMAIN limit.** climb-logger ADR-002 logged `ERR WBMAIN: Too many sim. path-param calls` with about 80 simultaneous `<eval input>` bindings across all co-apps. It also reports that `visibility:HIDDEN` does not unsubscribe bindings. This caps how many output bindings a vario template can carry next to ZoneSense or other apps.

**Allocation.**
- matram's "Creating any variable inside a function called at 10 Hz causes heap exhaustion over time" (15279 #0) is confirmed as a forum claim.
- The official template's `new Uint8Array(6)` and `new DataView` per notification are confirmed (template L81, L89).

**Subscription lifetime.** The 15320 table is confirmed. Its explicit advice not to subscribe to Zapp outputs for data that must survive overlays conflicts with the original report's "Bosch pattern" recommendation (see section 6).

**[new / unverified] setStyle scope.**
- climb-logger (Vertical 2): "Runtime `setStyle()` reliably applies ONLY `visibility`", and `setStyle('#hdr','background',rgba)` "did nothing at all".
- Bosch uses setStyle only to toggle `visibility` on pre-built segments (`t.html` L11, L18, L24).
- ZoneSense reportedly uses `setStyle(...,'color',...)` on a firmware image (secondhand).
- DrewDrewBarney sets `left` and `top` via setStyle (`main.js` L363, L370, L394-395), with no hardware report.

Runtime `height`, `left` or `color` changes are therefore unverified. 14767 #0's list of supported CSS properties refers to static CSS.

**Canvas budgets and AOD.** The canvas budgets are as reported (15279; 15738 #1). AOD is unchanged and unknown.

## 4. What real apps do (re-checked)

- **Official BLE template:** the handler parses, and evaluate assigns outputs (L225-228). The template binds them with `<eval input="Zapp/{zapp_index}/Output/valueN">`. Confirmed.
- **Bosch:** `case 106: … parseLiveData(data)` (main.js L114); `writeLiveOutputs(output)` is called from evaluate. The template's onActivate `$.subscribe` on three outputs drives visibility-only setStyle; onDeactivate `$.unsubscribe`s them. Confirmed.
- **FORM:** about 1 Hz; a single write in flight, pumped from 104. Confirmed. No UI calls in the handler.
- **climb-logger [new]:** uses setText from onEvent paths and drives UI from outputs through hidden `<eval>` bindings with `script` formatters that run side effects. It notes these "do not leak on template unload — unlike `$.subscribe`".
- **Summary:** no public app was found that pushes BLE data to the screen faster than 1 Hz. This is absence of a counter-example. GitHub search indexes few of these repos, and the forum search API needs a login.

## 5. Input load from the UltraBip

Unchanged and still inferred, from `ultrabip.md`. LK8EX1 and LXWP0 each arrive at 10 Hz, so expect about 20-22 handler calls per second at MTU 127. Test C measures it.

## 6. Recommended vario pattern (corrected)

### Tier 0: ship this

- **Handler:** byte-level, allocation-free LK8EX1 parsing into module globals and an Int16Array ring buffer. LXWP0 is dropped after its first bytes. Never touch `output` in the handler (it has no `output` parameter).
- **evaluate (1 Hz):**
  - computes the damped vario, the integrated climb, altitude and the stale flag;
  - writes them as outputs, at most 5 with `log:true`.
- **Template: [corrected] primary binding is `<eval input="Zapp/{zapp_index}/Output/x">`.**
  - Use it for the numbers. This is the official template's pattern, and it is framework-managed.
  - For bars and colour, use pre-built segments or colour variants, toggled with `visibility`. Do this from an `<eval>` script formatter (climb-logger pattern) or from evaluate with setStyle visibility (Bosch-style).
  - Bosch-style template `$.subscribe` on outputs (onActivate/onDeactivate) works in a shipping app. Its behaviour after lap overlays is [unverified] and conflicts with 15320's advice.
- **[new] Needle, if wanted:** an SVG `<path>` rotated with `gaugeControl(...,'radian')` from an `<eval>` script formatter at 1 Hz. This replaces a canvas needle: it is drawn by the firmware and avoids the canvas render budget. The evidence is secondhand (the ZoneSense decompile), so check it on the device.
- **Fallback when stale:** `<eval>` on `/Fusion/Altitude/VerticalSpeed`.

### Tier 1: only if test A passes

From the handler, call `setText` and/or `gaugeControl` at 3-5 Hz, only when the quantised value changed and only while the view is active (gated by Event 1/0). Use precomputed strings. [corrected]: bars use visibility toggles, not 'NNpx' height strings, unless test A shows that setStyle height works.

### Do not

Do not build a canvas needle fed by BLE data. The ceiling is the same as for an SVG/gaugeControl needle, and canvas costs more.

## 7. Unknowns

- Whether setText, setStyle or gaugeControl called from the 106 handler or from onEvent repaints before the next evaluate.
- Whether a global-captured `output` written in the handler is even honoured.
- Whether `$.get` on an output sees values written before evaluate.
- The real Tick10hz rate on Race S.
- Which properties setStyle supports at runtime beyond visibility.
- Whether `$.subscribe` on outputs survives lap overlays when made in onActivate.
- The publish rate of `/Fusion/Altitude/VerticalSpeed`.
- AOD behaviour.
- Readability of `/Ui/Script/MemoryPool/*` and `/Device/Power/BatteryCurrent`.
- What triggers WBMAIN pool 0.
- How the firmware behaves when evaluate overruns.
- Battery cost.
