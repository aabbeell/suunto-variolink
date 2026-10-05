# Deep dive: suuntopo-crash (verified)

## Conclusion
There is still no single proven root cause. All three main claims were re-checked against their sources; each holds in part and needs correction. Confidence is given per claim.

1. **Canvas overflow** (strong evidence for the overflow; the black screen is a conditional prediction). I counted v0.3's draw calls again in my own harness and got the same numbers: the hardcoded map costs 123 units under matram's formula and the data.json map costs 261, against matram's Race S limit of about 201 (topic 15279, posts #0 and #3).
   - [corrected] "Black at every zoom and waypoint" assumes the watch also counts drawing that falls outside the canvas. If the watch discards it first, the data.json topo costs 80 to 197 units at the default zoom of 1.2. It would then render and go black only when zoomed out (zoom 0.4 to 0.6 costs 198 to 261).
   - [corrected] Reaching selector entry 2 also needs JSON.parse to work in main.js, because main.js sets the selector bound (main.js:28, :60). The template parse alone is not enough.

2. **Memory and compile chain** (inferred). My Duktape 2.7.0 numbers reproduce the report's exactly: 79,909 B compile peak, 17,082 B largest allocation, 42,895 B retained.
   - [corrected] These numbers depend on how Duktape is configured. With line-number tables (PC2LINE) turned off, as Duktape's own low-memory profile does, the largest block is 16.6 KB (the source string) or 9.4 KB (if the watch never stores the source as a JS string). The peak is 53 to 80 KB.
   - Only the relative gap to the hardware-test builds is robust: 2.9 to 5.8 KB largest block, 20 to 29 KB peak.
   - [unverified] Two alternatives the report missed fit the reported crashes at least as well:
     - **C stack.** The reference itself (L3303) says a watch crash during app load is most likely stack exhaustion. v0.3 is the only build with a 22-branch else-if chain: compile recursion depth 31 against 17 for every other build, and 12.5 KB of native stack against 9.7 KB on arm64.
     - **Settings.** v0.3 is the only build with phone settings (three 100,000-character string settings). Topic 14940 #0 (a Race S owner) ties "Maximum SuuntoPlus apps reached" to apps that have settings, after a settings sync.

3. **Text position mismatch** (strong evidence for a size mismatch; the mechanism is corrected).
   - [corrected] Treating fillText's y as the top of the text is not a simulator-versus-watch difference. Suunto's simulator wrapper copies the watch, the reference's own example puts y at the top, and matram's photos show text sitting below its y on both.
   - [corrected] fonts-q.js is the metrics table for the HTML font classes, not a documented canvas font list.
   - matram's Race S photo (15262 #1) does show snapping. 10 px and 14 px canvas text render at the same size, about a 27 px font; 16 px renders at about 29 px. That is consistent with snapping up to the q font sizes (photo-based, weak).

4. **Uncaught exceptions with pasted topos**: not re-checked beyond reading the code. The "only topo1 filled" case does throw outside any try/catch in drawMap.

## Design rules
- Budget every canvas frame in code and keep 2 x (strokes + fills) + lineTo at or below about 150 per canvas. Count units inside the renderer and stop drawing at the cap. Do not rely on off-canvas geometry being free until a hardware test proves it.
- Draw in priority order: background, route, current anchor and HUD first, then features nearest the focus point. Running over the cap then drops detail instead of blacking out the canvas.
- Keep each path at 20 lineTo or fewer. Batch same-style ticks into one path only after the moveTo test confirms how moveTo is counted.
- Cull features to the viewport and split the scene across stacked canvases with separate budgets: features, route plus anchors, HUD.
- Use only the canvas calls in the reference list (L1631-1655). No strokeRect.
- Replace long if/else-if chains with a lookup table of small per-type functions (for example drawers[type](ctx, f)). v0.3's 22-branch chain doubles Duktape's compile recursion depth (31 vs 17) and adds about 2.75 KB of native stack. The reference says crashes at load are most likely stack exhaustion.
- Keep the template onLoad small: no single function above about 2 KB of source, and total onLoad at or below the roughly 6 KB of the hwtest builds. The largest contiguous compile block is about 2.9-5.8 KB for those builds, against 9.4-17 KB for v0.3 depending on Duktape configuration.
- Do not hardcode topo object literals in code.
- Use JSON.parse only after a typeof JSON check, in both main.js and the template, and report the result on screen. Main.js and the template must agree on the topo count, so compute it once (in main.js) and output it, rather than parsing in both places.
- Prefer a compact string encoding parsed with split and parseInt (the pattern used by Isotop7's interval-chart.html) over JSON, so the app works whether or not JSON exists and parses into far less heap.
- Cap each settings string at a few KB, not 100,000. Treat the settings/sync path itself as a risk: 14940 reports 'Maximum SuuntoPlus apps reached' on a Race S for apps with settings after a phone sync.
- Validate topo data with one shared rule in one place, index topos by a stable slot id, and bounds-check every topos, anchors and route access. drawMap currently dereferences topos[currentTopo] with no guard (t.html:223-232).
- Lay out canvas text assuming the watch snaps small sizes up (10 and 14 px render alike, about 27 px) and that y is the top of the line box with the baseline about 30 px lower. Keep the bottom-most text above about h - 45. Prefer HTML text with the sp-*/f-* classes for the HUD.
- Never compute canvas font size from zoom. Use a fixed set of sizes checked on hardware.
- Coalesce redraws: one dirty flag gives one REFRESH per event, and refreshes of several canvases are staggered.
- Design for eviction: assume a failed compile or out-of-memory disables the app for the rest of the exercise, and test with 2-3 apps enabled.

## Hardware tests
- Test 1, JSON in each context. Add systemEvent('JSON main '+typeof JSON) in main.js onLoad and systemEvent('JSON ui '+typeof JSON) in the template onLoad of the unmodified v0.3, then read the system events. 'object' in both means sync can work. 'undefined' in main.js means selector entry 2 can never be selected, whatever the template shows.
- Test 2, is off-canvas drawing counted? One full-screen canvas draws 150 units on screen (matram-style 20-lineTo chunks), plus 100 units of identical paths placed entirely at x < -500. A black canvas means off-canvas drawing counts (the report's 'black at every zoom' holds). A rendered canvas means the firmware culls. Then v0.3's data.json topo should render at zoom 1.2 and go black at zoom 0.4-0.6, so check both on v0.3.
- Test 3, cost of the other calls. Draw 150 units of strokes, then N extra arcs, binary-searching N until black. Repeat with fill, fillRect and fillText. A 1-unit call goes black at N of about 51.
- Test 4, stack versus everything else. Build two variants of v0.3 that differ only in drawFeature: the original 22-branch else-if chain, and a lookup table of per-type functions (compiler depth 31 vs 17). Remove settings/data.json from both. Install each on a freshly rebooted Race S with 2 other apps enabled and open the app 5 times. Crashes or reboots only with the chain mean stack exhaustion at load.
- Test 5, the settings path. Install v0.3 with its settings and data.json, change topo0 in the phone app and sync. Then install the same build with the settings block and data.json removed. 'Maximum SuuntoPlus apps reached', or an app that cannot be selected, only with settings reproduces 14940 and explains the 'clear the watch fully' remedy without any memory model.
- Test 6, UI heap. In a template onLoad, allocate one Uint8Array of 4k, 8k, 12k and 20k, each in its own build, and log success with systemEvent. Read JsTotMem, relMemCb (exec:ui) or JSalloc lines with 1 app and with 3 apps enabled. A failure at 8-12k makes v0.3's 9.4-17 KB compile block alone sufficient to fail.
- Test 7, font snapping and baseline. Draw a 1 px rule at y = 100, 160, 220... and fillText at the same y for sizes 8, 10, 12, 14, 16, 18, 20, 22, 24, 27, 29, 33, 41 px in both plain and monospace. Photograph it. Expect 8-14 px to render identically (about 27 px) with glyph tops about 10 px below the rule, and confirm the full snap table.
- Test 8, pasted-topo crash. Use a data.json with only topo1 filled, select the last selector entry and press CROWN. Expect a black canvas or an 'Exec ... failed' system event (an uncaught TypeError in drawMap, t.html:226).

## Report
# Adversarial re-check of "suuntopo-crash"

Scratch work is in `/tmp/deep-suuntopo-crash-verify/`. Measurements are logged in `results.txt`, harnesses in `h/`, Duktape builds in `duk/`, fresh forum JSON in `forum/` and GitHub sources in `gh2/` and `gh3/`. The repos were only read.

## Claim 1: the canvas overflows the render budget

### What I checked
**matram's limit (primary source, fetched fresh):**
- 15279 #0 (Race S) gives the formula "2 × numStrokes + numLineTo ≤ ~200". Past that, everything on the canvas is silently dropped, fillRect and fillText included. There is no exception and no log entry.
- 15279 #3 says 181 segments drawn in chunks of 20 work, and 182 always give a black canvas.
- Arithmetic: 9 × 20 + 1 = 181 is 10 strokes, so 2 × 10 + 181 = **201 passes**. 182 segments is 2 × 10 + 182 = **202, which fails**. **Confirmed.**
- Caveat: his canvas also had a fillRect and style setters every frame, and their cost is unknown.

**The built template matches the source.**
- I extracted `suunto01-q.fea` (all entries dated 03-17 16:45). Its `t.xml` onLoad is identical to `duk/tpl_suunto01-q.js`, and its `data.jsn` equals `src/suuntopo_canvas/data.json`.
- All distinctive tokens are present (strokeRect, contour_poly, `Math.round(ss(20))`, `itemH=60`).
- "Byte-identical" really means identical after minification.

**Independent count** (`h/count.js`: source t.html in a Node vm, localStorage returning the data.json strings, JSON present):

| Frame | Paths | Strokes | lineTo | Fills | Arcs | Model A (2 × stroke + lineTo) |
|---|---|---|---|---|---|---|
| Hardcoded map | 53 | 32 | 59 | 21 | 16 | **123** |
| data.json map (25 features) | 104 | 78 | 105 | 26 | 22 | **261** |

- Under model B, 2 × (stroke + fill) + lineTo, the two maps cost 165 and 313.
- Counting moveTo + lineTo + stroke + fill gives 153 and 295.
- Counting only stroked paths, the data.json map still costs about 237.
- These match the report exactly. The longest path has 6 lineTo. TOPO_COUNT is 2 when JSON works.
- **The overflow holds under every cost model consistent with matram's data.**

### [corrected] "Black at every zoom and waypoint"
That conclusion assumes the watch's render queue also counts drawing outside the canvas. matram only ever drew on screen, so whether it does is **unknown**.

My count of on-screen paths only (`h/cull2.js`, model A):

| Zoom | Cost per waypoint |
|---|---|
| 0.4 | 259–261 |
| 0.6 | 198–261 |
| **1.2 (the default)** | **80–197** |
| 2.0 | 54–164 |

The report's own cull.js gives 83–209 at zoom 1.2. If the firmware culls, the data.json topo probably renders at the starting view and goes black only when zoomed out. A hardware test must try several zoom levels.

### [corrected] Selector entry 2 needs JSON in both contexts
- The template's list comes from its own parse (t.html:42–65).
- The selector's DOWN bound comes from main.js: `TOPO_COUNT` is raised only via `JSON.parse` (main.js:28, :34–35), and DOWN only moves while `selectorIdx < TOPO_COUNT - 1` (main.js:60). The `getObject` fallback returns null for string values (reference "JavaScript interface").
- So if the template has JSON and main.js does not, two "Salathe" entries show but entry 2 cannot be selected. The overflow would then never be seen.

### [unverified] JSON on the watch: still open, weaker than implied either way
- The reference's supported list (L949) names only typed arrays. Yet Math, parseInt and String methods are clearly used by working store apps, so the list is not exhaustive and the absence of JSON proves little.
- Date is explicitly unsupported (L964), and regex reportedly breaks loading (14940 #7). So Suunto did trim builtins.
- No official example and none of the ~12 open-source SuuntoPlus repos I checked use JSON.parse:
  - SuuntoSpace indoor-climbing and lactate-power-test
  - surfboomerang
  - Isotop7
  - eeodo
  - genc-murat
  - LiftCue
  - ninkaninus
  - AnchorAlarm
  - hangboard
  - isazi
- One template does use `localStorage.getItem` (Isotop7 interval-chart.html:2) and parses it with split. Whether that works on the watch is not shown.
- 14766 #28 ("surprised it works to just have a JSON copy&paste") reacts to guderaber's **proposal** in #27 ("the sync can be the suuntoplus app text input"). guderaber never says pasted JSON worked, so it is not evidence.

## Claim 2: memory and compile chain

### Re-measured
I rebuilt Duktape 2.7.0 from source with a counting allocator, a painted thread stack and a compiler-depth counter (`duk/m3`, arm64, -O2).

| Build | Compile peak (B) | Largest allocation (B) | Retained (B) | Peak C stack (B) | Compiler recursion depth |
|---|---|---|---|---|---|
| hwtest 1 | 24,521 | 5,412 | 15,115 | 9,748 | 17 |
| hwtest 3 | 28,983 | 5,840 | 19,075 | 9,748 | 17 |
| v0.2 | 72,152 | 21,422 | 66,263 | 10,196 | 17 |
| **v0.3** | **79,909** | **17,082** | **42,895** | **12,500** | **31** |

The compile peak, largest allocation and retained columns reproduce the report exactly.

### [corrected] The 17 KB / 80 KB numbers depend on configuration
- Duktape's own `config/examples/low_memory.yaml` sets `DUK_USE_PC2LINE: false`. With that, v0.3's largest allocation is 16,587 B, which is the source string itself.
- If the firmware compiles from a C buffer (`duk_pcompile_lstring`, so the source is never a JS string), the largest allocation is **9,358 B** with PC2LINE off and 17,082 B with it on. The 64-bit compile peak ranges from 52,678 to 79,909 B.
- The hwtest builds stay at 2.9–5.8 KB largest and 20–29 KB peak under every configuration. **Only the relative gap is robust.**

### The 28 KB Race S figure: [unverified] context
- matram's wording is hedged: "heap memory may be around 28k" (14940 #8), and "7 such arrays" of 4,000 elements (15279 #0).
- He does not say whether this was main.js or the template, and it measured free space at that moment with his own app loaded, not capacity.
- The only firmware-reported totals are 133,120 B: Vertical 2 (15490) and Race 2 (15692 #1, `JsTotMem 132412/133120`, verified). The report's "open contradiction" therefore stands.

### Weak links
- [unverified] JSalloc:2636 ↔ the 2,632 B emit step: 2,632 B is a generic early growth step of Duktape's buffer writer. My synthetic 40-branch chain hits it too. "Consistent with" is the most it supports.
- [unverified] Linking guderaber's full clear to the context leak in 15490: that leak needs repeated single-app toggles in the in-exercise menu on a Vertical 2, and guderaber never describes toggling.
- Confirmed: SuuntoPartnerTeam, 14765 #26: "A heap allocation failure leads to a black screen for that application, but the activity continues."

### Missed alternative A [unverified]: C stack at load
- The reference's Errors section (L3303) says a watch crash during sports app load "most likely happens due to running out of stack memory". Heap problems are listed under "black screen". The report never cites this.
- v0.3 is the only build with a long else-if chain: 22 `else if`, almost all in drawFeature (t.html:491–830). Every other build has 6–7.
- Duktape parses each `else if` recursively. Synthetic chains cost about 192 B of native stack per level (chain_1: 8,088 B; chain_80: 23,256 B). v0.3 needs depth 31 against 17 and about 2.75 KB more stack on arm64.
- Duktape's `shallow_c_stack.yaml` sets COMPILER_RECLIMIT to 50, so a recursion-limit error is unlikely. A raw stack overflow on a small UI task stack is plausible but unmeasured.

### Missed alternative B [unverified]: phone settings
- v0.3 is the only build with phone settings: three `string` settings with `maxLength` 100000, plus data.json. The hwtests, v0.2 and the image build have none (their manifests were checked).
- 14940 #0 (Thibault B., **Race S**) gets "Maximum SuuntoPlus Apps reached" after editing settings in the phone app and syncing. It also happens with the community Notes app and disappears when settings are removed. #6 says the state "righted itself".
- This fits "crashing … have to clear the watch fully/reinstall" (14766 #27) without any memory model.
- Nikolai (14766 #17) also warns that JSON in settings will run out of memory.

## Claim 3: text and font mismatch

### Confirmed
- 15262 #1, matram on a Race S: "watch renders at least twice the size", and "monospace font is much too wide".
- The simulator wrapper (`webview-resources/main.js`, class `rv`): `fillText(e,t,i){i+=this.fontSize??0,…}`. It has no `strokeRect`. Its `arc` ignores the anticlockwise flag and uses `start>end` instead.

### [corrected] The y = top convention is not the mismatch
- Suunto wrote the simulator wrapper to mimic the watch.
- The reference canvas example draws the first row at `y = 0` with a 25 px font (L1668–1680), which only works if y is the top.
- In matram's two photos (`watch.jpg`, `sim.jpg`, which I measured), text sits below its y in both.

### [corrected] fonts-q.js is not a canvas font list
- It is the metrics table that `ng/font.js` maps the HTML classes (f-*, sp-*) onto.
- The reference's "squares" warning (L1892) is about "older watches".

### Photo measurement (rough)
I assumed matram's rows have the same logical spacing in both photos (sim at 2.0 px per logical px, watch at about 1.22).

| Nominal size | Glyph span on watch | Font this implies | Ratio to simulator |
|---|---|---|---|
| 10 px | ≈ 25 | ≈ 27 px | ≈ 2.5× |
| 14 px | ≈ 25 | ≈ 27 px | ≈ 1.9× |
| 16 px | ≈ 28 | ≈ 29 px | ≈ 1.8× |

- 10 px and 14 px render identically, and glyph tops are about 7–9 logical px lower than in the simulator.
- That is what snapping to the q sizes 27 and 29 would produce (baseline at y + 30 instead of y + size). It is consistent, not proven.

### Consequence for v0.3 (prediction)
- The bottom HUD pitch line at `y = h − 28 = 438` (t.html:289) would have its baseline near 468, past the 466 px canvas edge.
- In the selector, the 22 px name and the 16 px detail at y + 22 (t.html:190–197) would overlap.

## What remains unknown
- Whether JSON exists in the template context and in the main.js context.
- Whether off-canvas drawing counts against the render queue.
- The cost of arc, fill and fillText.
- The Race S heap size per context, and the largest contiguous block.
- The watch's Duktape configuration (PC2LINE, compiler recursion limit) and its UI task stack size.
- Whether the settings-sync bug hits this app.
- Which build guderaber actually ran.
- Supporting facts on the last point:
  - The hwtest builds were made 7–44 minutes after v0.3 (zip times: 16:52, 16:58, 17:29 against 16:45 on 03-17). The READMEs written on 05-06 call them steps "on the path to" v0.3, which contradicts the timestamps.
  - v0.2 → v0.3 cut retained heap from 66 to 43 KB and added the per-feature try/catch, but also added settings.
