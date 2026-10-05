# Deep dive: limits (verified)

## Conclusion
I re-checked the report's three main claims against the original sources. Two hold as written, one needs re-scoping, and I found new evidence along the way.

(1) Race S runs 2 SuuntoPlus apps per sport mode, and a guide counts as one of them. Confirmed. I re-fetched Suunto's Race S release notes today: the newest version is still 2.53.42, and the "two to three apps" change appears only in the Race 2 and Vertical 2 notes. Two of the cited sources are weaker than presented. The apizone page says "up to two" for every watch, including the Vertical 2, which now runs 3, so it is generic and out of date. isazi is a volunteer forum moderator, not Suunto staff.

(2) The ~4 KB limit on a single memory allocation. Strong evidence, and stronger than the report showed, but the report's own proof was thin and I re-scoped it. The 55 'oversize' log lines it counted come from just five file loads in one 13-minute test session, plus one GitHub issue. That pattern alone cannot tell a hard size cap apart from 'the request is bigger than all free memory'. New evidence settles it in favour of a cap. In 815 of 818 normal allocation failures, the watch first tries to free memory by unloading other apps. In 0 of 55 'oversize' failures does it try. That is how a fixed maximum block size behaves.
- "No larger than 4,000 elements" over-reads matram: he never says a larger array failed.
- "All settings plus stored data must stay under ~4 KB" is my inference, not a measurement.
- SuuntoPo: the 100,000-byte maxLength in its settings is only the limit on what can be typed in. What breaks is the topo text users actually store. Under the cap, all topos together get only about 2 KB, because data.jsn is already 1,727 B.

(3) A total JS memory of 133,120 B. Confirmed on the 9 Peak Pro, the Vertical 2 (FW 2.53.42) and the Race 2 (FW 2.56.18). For the Race S it is still inferred, and the report's "very likely" is too strong. Race S-specific reports show it is tighter than the Race 2. One app works on a Race 2 but cannot be turned on on a Race S. A Race S crashed with only two apps running. The moderator blames Race S hardware. Firmware differences could also explain this, since the Race S is stuck on 2.53.42.

A simpler explanation the report missed: most 2-3 KB allocation failures happen when total memory is not nearly full, even after other apps were unloaded. That fits heavy fragmentation or a pool-style allocator. If it is a pool, matram's "7 × 4,000 B" counts free large blocks, not 28 KB of free memory. One cheap watch test tells these apart.

Confidence: claim 1 confirmed; claim 2 strong evidence (Vertical 2, consistent with Race S); claim 3 confirmed on three other watches, inferred for Race S.

## Design rules
- Design for 2 SuuntoPlus slots on Race S. Assume a guide, and very likely a Suunto-app structured workout, takes the second slot. Never assume a third app.
- The BLE (device-type) app uses an ordinary slot. Never ask users to toggle a single app off and on mid-exercise without leaving the menu: a single-app disable leaks the app's whole JS module scope.
- No single allocation above ~4,000 B, whether a typed-array buffer, string, plain Array (about 500 elements max) or compiled function. An oversize request is rejected outright and does not trigger eviction, so it cannot succeed later. Suunto's advice to use 'one single large buffer' applies only up to this size; beyond it, split into several buffers of 4,000 B or less.
- Under memory pressure, treat ~2 KB as the dependable single-allocation size. Most observed failures were 1.96-3.1 KB requests on a heap that was not nearly full, even after other apps had been unloaded. Keep every buffer, string and function that must be (re)created during an exercise under 2 KB.
- Keep data.jsn (settings + localStorage, one file) under 2 KB, and never above ~3.5 KB. Every getItem/getObject/setItem/setObject allocates a contiguous buffer the size of the whole file (measured on Vertical 2). The ~4 KB hard ceiling is an inference.
- For SuuntoPo, the settings maxLength must be set from that budget: all topo strings combined must fit in about 4 KB minus the rest of data.jsn (about 2 KB with today's 1,727 B seed). Shrink the seed, or move topo data elsewhere.
- Call localStorage only in onLoad, on a rare user action, or at exercise end. Never call it in evaluate(), in a BLE handler, in a per-frame canvas path, or right next to a template mount. Never grow the store during exercise end.
- Do not rely on try/catch to contain allocation failures. The firmware retries 11 times and can end in an ASSERT or bootloop (climb-logger #66, synthesis verdict 4). Prevent oversize allocations at build time instead.
- Minified main.js: 4 KB or less for a BLE app, 2 KB or less for SuuntoPo. Stay well below the ~7.1 KB clean threshold measured with 3 apps on Vertical 2. The Race S may be tighter than the Race 2 or Vertical 2, so do not use their numbers as Race S allowances.
- Keep module-level function objects to 8 or fewer (they set the size of the leaked context). Put logic inside lifecycle hooks, which fold into one dispatcher. Keep the dispatcher and every other function under ~1.5 KB of minified source.
- No regex, and no literal data arrays or objects in main.js or template code. A failure shows up as 'Maximum amount of SuuntoPlus apps enabled', not as a syntax error.
- ext*.js files loaded with evalFile: 1.6 KB or less each, loaded only at rare moments and released (ref = undefined) before the next one is loaded.
- Mounted template (.xml in the .fea): 5 KB or less for a BLE display, 8-10 KB or less for the topo app (SuuntoPo t.xml is 18,765 B now). Measure with unzip -p app-q.fea t.xml | wc -c after every build.
- Allocate all buffers once at load. Allocate nothing per BLE notification, per evaluate tick or per 10 Hz callback, and replace the BLE template's per-event new Uint8Array/new DataView with a preallocated parser.
- Use only Int8Array, Uint8Array and Float32Array (documented), plus DataView (used in Suunto's own template). Do not use Int16Array until a watch test shows it exists.
- Canvas: at most ~20 lineTo per path and at most ~200 units (2 per stroke + 1 per lineTo) per canvas per frame. Redraw only when the content changed, and spread multiple canvases over different ticks.
- Keep always-subscribed <eval> bindings and $.subscribe calls to about 25 or fewer per app (WBMAIN pool 0 is 120 slots on Race S and Vertical 2 FW 2.53.x). Put $.subscribe in template onActivate.
- BLE: one appConn link per app, one operation in flight, writes of 20 B or less. Never connect via appConn to a peripheral that is also paired as a native sensor.
- Treat eviction as terminal: the app is not re-enabled within the exercise and its BLE link is gone. Show an explicit connection-lost state.
- Read memory problems with the Editor's 'View system events' (a live SDS read from the watch), not 'Open Log Files' (host-side only). Search for relMemCb/releaseMemoryCb, JSalloc (and whether 'oversize' is present), 'None avail', 'Compiling js failed', 'failed to eval' and 'pool id:0 full'.

## Hardware tests
- T1 Memory-pool resources: a minimal app whose template onActivate runs $.get on /Ui/Script/MemoryPool/Size, /Reserved, /Allocated, /Peak and /Ui/MemoryPool/Size, /Reserved, logging each with systemEvent('MP <name> ' + value). Run alone, then with a second app, and read 'View system events'. Expected: Script Size = 133120 if the Race S matches the other watches, with Allocated rising when the second app is added. 404 or undefined means the firmware does not serve them to apps; fall back to T3.
- T2 Allocation cap, one size per run (safety: the 11-retry storm may not be catchable and #66 ended in a bootloop; run with nothing important recording, accept a possible reboot). In onLoad, call systemEvent('T2 try ' + n) first, then new Uint8Array(n). Rebuild and rerun for n = 4000, 4064, 4096, 4128, 4200. Expected: passes up to the cap, then 'ERR DUKTAPE : JSalloc:<n+header> oversize' with NO relMemCb line before it. If a failure is preceded by relMemCb/None avail instead, it was a memory-availability failure, not the cap.
- T3 Allocator type and the Race S heap total in one run (alone, fresh reboot, throwaway exercise). Phase A: allocate Uint8Array(4000) into a preallocated holder array until failure; log the count cA. Phase B (next run): the same with Uint8Array(2100); log the count cB. Phase C: after the big chunks fail, keep allocating Uint8Array(200) until failure. Expected: if cB is about cA (~7), it is a size-class/pool allocator with ~4 KB blocks and '28 KB' was a block count; if cB is about 2×cA, it is a contiguous heap. Phase C should push usage over 96% and print 'JsTotMem used/TOTAL': the denominator is the Race S heap total, even if T1's resources are not served.
- T4 data.jsn ceiling: build variants whose data.json holds a padding string so data.jsn is 2.0, 3.0, 3.8, 4.1 and 4.5 KB. In onLoad, call systemEvent first, then localStorage.getItem('k') on a tiny key, and log the result. One variant per run, with the same safety caveats as T2. Expected: works up to about 4.0 KB; above that every localStorage call fails, with JSalloc approximately equal to the file size plus 'oversize' and no relMemCb. This sets SuuntoPo's settings budget.
- T5 BLE connection count: device app A connects to peripheral 1 and app B (or a second connect in A) to peripheral 2. Use two phones running nRF Connect advertising distinct 128-bit UUIDs, or ESP32s. Run four configurations: (i) no native sensors; (ii) HR belt + foot pod native and the phone connected; (iii) as (ii) plus 'Broadcast heart rate' on; (iv) a third connect attempt. Grep for 'Duktape BLE API err 2' (connection limit reached). Expected: (i) both connect; (iv) error 2. (ii) and (iii) decide whether native and phone links count against the 2.
- T6 Slot accounting: with the BLE .dev enabled, try to enable a second feature app, then a Suunto-app structured workout, then a third-party guide, then a third item. Expected: the third item is refused with 'Maximum amount of SuuntoPlus apps enabled' and a second guide with 'Only one SuuntoPlus guides app can be enabled at a time'. This also settles whether a structured workout counts as a guide slot.
- T7 Template size threshold for SuuntoPo on the Race S: build t.xml variants at about 8, 12 and 18.8 KB with identical logic. Run each with a second app enabled, then open and close the map and cycle screens 20 times. Expected: the 18.8 KB build logs relMemCb (exec:ui) or JsTotMem at 96% or more, or evicts the co-app; the 8 KB build stays clean.
- T8 Canvas costs: one canvas with 180 units of chunked lineTo, then add k fillText calls (k = 1..20), then k arc calls, and find the k at which the canvas goes black. Expected per matram: blank at about 200 units; the test shows whether fillText and arc consume units.
- T9 Typed-array availability: in onLoad, systemEvent(typeof Int16Array + ' ' + typeof Uint16Array + ' ' + typeof DataView). Expected: DataView is 'function'; the Int16 types are unknown.
- T10 Race S versus Race 2 with the same build: install one identical .fea on both watches, enable it alone, and record whether it enables and its T1/T3 numbers. Expected: if the Race S fails or reports a smaller total while the Race 2 does not, the difference is hardware or firmware (2.53.42 versus 2.56.x) and Race S budgets must be set separately.

## Report
# Adversarial re-check of the "limits" report (2026-10-03)

**What I did**
- Re-opened the primary sources for the three claims everything else rests on: slot count, the ~4 KB allocation cap, and the heap total / 28 KB reading.
- Re-fetched the following live:
  - forum topics 15817, 14940, 15279 and 15692;
  - the Race S release notes;
  - the apizone sports-apps page;
  - climb-logger issues #43, #66, #87, #121, #140 and #181;
  - two Suunto FAQ pages;
  - four forum topics the investigator had not fetched: 14768, 15761, 15788 and 15942.
- Re-ran the log analysis myself on the 53 climb-logger Vertical 2 syslogs.

Scratch files are in the session scratchpad: `.../scratchpad/verify-limits/`, plus the existing `.../scratchpad/deep-limits/`. Nothing in either project repo was modified.

Marks used: **[kept]** = re-verified as stated; **[corrected]** = changed; **[unverified]** = claim stated as fact that the sources do not support; **[new]** = evidence the report did not have.

---

## Claim 1: Race S runs 2 SuuntoPlus apps per sport mode, and a guide uses one slot

**Verdict: holds, confirmed.** Two of the cited sources carry less weight than the report gave them.

1. **Race S release notes [kept].**
   - Re-fetched `suunto.com/Support/Software-updates/Release-notes/suunto-race-s-software-updates/` today. Version list: 2.53.42 (Apr 7 2026), 2.50.28, 2.50.26, 2.48.16, ... There is no 2.56.x.
   - The phrase "increased from two to three" does not appear on the page.
   - The cached Race 2 and Vertical 2 notes both carry "Number of SuuntoPlus apps in sport mode increased from two to three" (line 84, under 2.50.26). The original Race notes lack it.
2. **DC Rainmaker [kept].**
   - January 2026 post: "(ONLY RACE 2 and VERTICAL 2)".
   - Race S review: "2 apps per sport profile at a time, or 1 app and 1 guide". Both verified in the cached text.
3. **apizone page [corrected].**
   - The live page does say "Each sport mode can include up to two apps" and "Up to 2 apps can be active per sport mode".
   - But it lists the Vertical 2 among supported watches, and the Vertical 2 now runs 3. The page is generic and out of date. It is not Race S-specific evidence and should not be counted as an independent confirmation.
4. **isazi (15817 #2, pid 197062) [corrected].**
   - The quote is accurate.
   - His group is "Moderators", a forum role, not Suunto staff.
   - The question he answered did not name a watch, so his Race S statement is his own claim. It is consistent with the release notes.
5. **Firmware strings [kept].** `TXT_MAX_ZAPPS_ENABLED_NOTE` and `TXT_MAX_ZAPPS_GUIDES_ENABLED_NOTE` are present in `webview-resources/main.js`.
6. **"A structured workout uses the Race S's second slot" [corrected: strong evidence, not confirmed].**
   - Suunto's FAQ says structured workouts are synced "so that you can later use them as a guide".
   - Szmigiel counts a workout guide as an app (15176 #12).
   - The same Suunto FAQ page still says "you can either use a SuuntoPlus sports app or a SuuntoPlus guide or a structured workout. You cannot use any simultaneously". That note is from the 9 Peak Pro era and is obsolete.
   - No one has shown, on a Race S running current firmware, that a Suunto-app structured workout fills a slot. Hardware test T6 settles it.
7. **"15 apps per watch" [corrected: documented, no longer unverified].**
   - Suunto's FAQ (`us.suunto.com/pages/how-to-get-started-with-suuntoplus-sports-apps`) says "There is a 15 sports apps limitation in the watch capacity".
   - The FAQ is undated and partly out of date. It conflicts with the `feat_zappcount_100` capability string, so treat 15 as the documented figure and 100 as unexplained.
8. **Device (.dev) app uses an ordinary slot [kept as S on Race 2, I on Race S].** Verified in 15692 #0: Race 2, FW 2.56.18, "3 (the documented maximum)" including omunoz's `type:"device"` app.

## Claim 2: a hard cap of about 4 KB per allocation, and its consequences

**Verdict: the cap itself is strong evidence, and stronger than the report showed. The report's stated evidence was weaker than presented, and some consequences were overstated.**

1. **Histogram [kept].** My own count over the 53 logs:
   - unflagged failures at every logged size from 1,964 to 3,124 B;
   - `JSalloc:4381 oversize` × 55;
   - nothing in between.
   - Issue #66 (re-fetched) shows `JSalloc:4226 oversize (x11 cascading)` after `evalFile: ... ext10.js`, followed by `Zapp climbl01:Disable`, `ASSERT in file.cpp:143` and `BOOTLOOP`.
2. **How strong the evidence is [corrected].**
   - The 55 lines are not 55 independent observations. They are **5 evalFile attempts of 11 retries each**, of two probe files (ext21 and ext22).
   - All 5 come from one test session on 2026-07-02 (16:00 to 16:13), in `probeA-flat.log` and `probeB-nested.log`.
   - In both logs the heap had just logged `JsTotMem 132352/133120` (99.4%) and `131292/133120` (98.6%).
   - Together with #66 (2026-05-16), that is only **two distinct oversize sizes from about 3 incidents**.
   - On its own, the histogram cannot rule out a different meaning: "oversize = request larger than the total free heap", since every oversize incident happened on a nearly full heap.
3. **Discriminating evidence [new; raises confidence in a fixed cap].**
   - **815 of 818** non-oversize `JSalloc` failures are immediately preceded by `Zapp:relMemCb ... RelMem->None avail`. In other words, the firmware first tries to free memory by unloading other zapps, and logs the failure only when nothing is left to unload.
   - The 3 exceptions are log interleaving or truncation.
   - **0 of 55** oversize lines are preceded by a release attempt.
   - In the 16:00:45 and 16:13:37 events, all 11 oversize retries run with no `relMemCb` at all.
   - In the 16:00:29 event, the `relMemCb` lines and app unloads belong to a separate, nested `JSalloc:1964` request. That request appears between the 3rd and 4th 4381 retry and follows the normal relMemCb → None avail → JSalloc pattern.
   - So oversize requests are rejected outright, without trying eviction. That is the behaviour of a fixed maximum block size, where freeing memory cannot help. A "bigger than current free memory" condition would not behave that way.
   - Practical consequence: an oversize request never evicts co-apps. It just fails, with 11 retries.
4. **Bounds [corrected].**
   - The upper bound is 4,225 B (Vertical 2; #66's watch is not stated in the issue).
   - matram (15279 #0, pid 192003): "I could allocate a single Uint8Array of 4000 elements and a total of seven such arrays". In 14940 #8 he wrote "arrays with up to 4000 elements".
   - **He never reports that a larger size failed.** The report's "but no larger" is an over-reading [unverified].
   - The lower bound on the Race S is therefore about 4,000 B plus the buffer header. That the Race S cap equals the Vertical 2 cap is inferred.
   - 4,096 B remains the likeliest value [I].
5. **Cross-watch support [new].**
   - climb-logger #43 (2026-05-15) reports `JSalloc oversize` at app launch on a "Suunto 9 Pro" (presumably the 9 Peak Pro).
   - It was fixed by a `loadExt(n)` helper that "deduplicates ext-path strings out of large function constant pools".
   - This supports the report's inference that one compiled function's data block is subject to the cap, and suggests the cap exists on the 9 Peak Pro too.
6. **Per-type consequences [kept as I].** These follow from how Duktape stores values: strings over ~4 KB, plain Arrays over ~500 elements, and single functions with bytecode plus constants over ~4 KB would all fail.
   - Suunto's reference (L949-951) advises defining "one single large buffer" instead of many small typed arrays. That advice only holds up to about 4,000 B.
7. **data.jsn ceiling [corrected: inference, not finding].**
   - The store-buffer rule is climb-logger's own forensics, stated in `docs/plans/2026-07-08-ext-placement-synthesis.md` verdict 1 and in #181: over 10 storm events, the failing request size tracked the `data.jsn` size plus 17-25 B, including on pure `getObject` reads. That is one developer's measurement on a Vertical 2.
   - Combining it with the cap gives "data.jsn over ~4 KB makes every localStorage call fail". That is **[I]**, never tested.
   - Circumstantial support: #66's 4226 oversize happened in the route-commit path while a persisted `climbRoutes` array grew, and was fixed by dropping that write.
   - The report's conclusion presented this as a finding. It is an inference.
8. **Settings share the file [kept].**
   - `constant.js` sets `SETTINGS_FILE_NAME="data.json"` and `SETTINGS_FILE_NAME_OUT="data.jsn"`.
   - The reference (L2157-2236) says settings and variables are `path`s into `data.jsn`, read through `localStorage.getItem/getObject`.
9. **SuuntoPo [corrected wording, numbers kept].**
   - Re-measured `src/suuntopo_canvas/suunto01-q.fea`, rebuilt today at 19:10: main.js 678 B, data.jsn 1,727 B, t.xml 18,765 B, manifest.jsn 576 B. The manifest has `maxLength: 100000` on topo0, topo1 and topo2.
   - `maxLength` only limits what the phone lets the user type. What breaks is the content actually stored.
   - Under the cap, `data.jsn` (1,727 B today) plus all topo strings entered must stay under about 4 KB. That leaves **about 2 KB for all topos combined**, unless the 1,727 B seed shrinks.
   - The statement "3 × 100,000-byte settings cannot work" is true, but it understates the problem: even a single 3 KB topo would break storage.
10. **A different explanation the report missed [new, I].**
    - Of 89 distinct non-oversize failure events, **82 had no `JsTotMem` warning (≥96% used) in the preceding 2 minutes**.
    - Many 2-3 KB requests failed after other zapps had already been unloaded.
    - So large blocks run out long before the heap is full. Two explanations fit:
      - (a) heavy fragmentation of one contiguous heap;
      - (b) a size-class or pool allocator. The resources are literally named `/Ui/Script/MemoryPool/*`, and climb-logger guessed a "slab limit".
    - Under (b), matram's "7 × 4,000 B" counts free largest-class blocks, not 28 KB of free heap.
    - Caveat: the `JsTotMem` warning may be edge-triggered, so its absence does not prove usage was below 96%.
    - Test T3 tells (a) and (b) apart.
    - Design consequence either way: under memory pressure, treat **2 KB, not 4 KB**, as the dependable single-allocation size.
11. **Related note [I].** In the 07-02 storms, the most frequent "loader" size, 1,964 B, appears nested inside a different request's retry loop. climb-logger's label "compile buffer 1964" may therefore be an internal allocation made during garbage-collection retries, not the loader's own request. This does not change any rule.

## Claim 3: JS heap total of 133,120 B, and the 28 KB figure

1. **Measured totals [kept, all re-read].**
   - Szmigiel 14783 #135: "the Duktape JS heap is 133,120 bytes ... At last in S9PP that is", with `JsTotMem 132296/133120`. Firmware not stated.
   - skyfi 15490 #0: "Suunto Vertical 2, FW 2.53.42 (HW 1424B3)", with `JsTotMem 132180/133120`.
   - omunoz 15692 #1: Race 2, FW 2.56.18, with `JsTotMem 129980/133120` and `132412/133120`.
2. **JsTotMem appears only at ≥96% [kept].** Re-counted: 35 lines, 27 distinct values, minimum 128,204 (96.3%), maximum 132,392, all over 133,120.
3. **Race S total [corrected: lower confidence].**
   - Still no Race S `JsTotMem` line. The forum search API needs a login, so I could not search beyond the fetched topics.
   - The report argued "very likely the same". The 9 Peak Pro (2 slots) and the Vertical 2 / Race 2 (3 slots) do share 133,120, which shows the heap is not what sets the slot count.
   - But **Race S-specific reports point to tighter limits than the Race 2**:
     - rémiP's PumpFoil works on a Race 2 but cannot be enabled on a Race S (15761 #0, 2026-08-27; not fetched by the investigator);
     - a Race S crashed with only Constantin plus one other app running (15176 #5);
     - matram's Race S ran out of heap completely (`JSalloc:16`, 14783 #134);
     - isazi blames Race S "hardware".
   - Firmware differences are an alternative explanation: the Race S is stuck on 2.53.42 while the Race 2 runs 2.56.x.
   - Treat 133,120 on the Race S as **[I], plausible, unmeasured**. T3 can read it directly from the `JsTotMem` denominator.
4. **The 28 KB reinterpretation [kept, with additions].**
   - Reading "≈28 KB" as "allocatable by one app at that moment", not the heap size, is sound.
   - "Measured with his own canvas app loaded" is **[unverified]**. matram only says "I did separately try to determine the available heap". The test configuration, co-apps and firmware are not stated.
   - Add alternative (b) from 2.10: under a pool allocator, 7 is a count of free large blocks.
   - climb-logger's "Per-app RelMem ceiling ≈ 28 KB" (UI_PLATFORM_KNOWLEDGE §1) has no derivation anywhere in the fetched docs. It is probably borrowed from matram.

## Other items spot-checked

- **"View system events" versus "Open Log Files" [kept].** Verified in the deobfuscated extension:
  - `Mr()` sends a GET to `suunto://SDS/SystemEvents/<serial>`.
  - `suuntoplus.openLogFiles` opens two host-side files, one of them `suuntoapp.log`.
- **`/Ui/Script/MemoryPool/{Size,Reserved,Allocated,Peak}` and `/Ui/MemoryPool/{Size,Reserved}` [kept].**
  - Present in `resource-common.js`, `schema/html-data.json` and the simulator's whitelist. The simulator has no values for them.
  - GitHub code search for "Ui/Script/MemoryPool" returns 0 hits.
  - `$.get(path, cb)` exists (reference L1506), so T1 is a valid design.
- **Reference wording on exec. ui [kept, with a note].**
  - The reference (L3333-3339) says `(exec. ui)` = "too much HTML UI memory".
  - The report's reading (exec:ui names the running context, and template JS shares the Duktape heap) does not contradict Suunto's wording.
  - On the Race 2, `relMemCb (exec:ui)` occurred during `templ load` (15692 #0).
- **BLE [kept].** Reference L2462-2472: the Race S is in the "two connections at a time, MTU 127" group.
- **Templates [corrected].**
  - "18.7 KB is larger than any template seen running cleanly next to another app" needs a qualifier.
  - Szmigiel's Constantin used "~30-45 KB" templates; the unit is unclear (source or compiled). Mounted one at a time, they ran next to ZoneSense and Weather on his 9 Peak Pro: "on S9PP when I'm using navigation and 2 S+ apps, current version doesn't hit the limit", 15176 #12.
  - The same templates drew repeated crash and unload reports: on the Vertical 2, on a Race 2 (3 apps), and on a Race S with only 2 apps (15176 #5).
  - The comparison should be against compiled sizes measured with a clean multi-app run: climb-logger `active.xml` 12,289 B on a Vertical 2 with 3 apps, and omunoz's 6,379 B on a Race 2 with 2 apps.
  - SuuntoPo's 18,765 B is above both. The design target (8-10 KB) stands.
- **Hardware-test safety [corrected].**
  - climb-logger verdict 4: "try/catch fängt den Sturm nicht; ×11-Retry = ASSERT/Bootloop" (try/catch does not catch the retry storm; the 11 retries can end in an ASSERT or bootloop).
  - #66 shows an oversize storm ending in `ASSERT in file.cpp:143` and a bootloop.
  - The report's T2 and T4 assumed a clean, catchable failure. They are redesigned below: one size per run, a marker logged before each attempt, no valuable exercise running, and an expected reboot.

## Corrected limits table (only rows that changed)

| Limit | Value | Watch | Source | Confidence |
|---|---|---|---|---|
| Apps per sport mode | 2 (or 1 app + 1 guide) | Race S | Race S release notes (re-fetched, latest 2.53.42); DC Rainmaker; 15817 #2 (forum moderator). apizone is generic only. | C |
| Structured workout uses a slot | likely, acting as a guide | Race S | Suunto FAQ "use them as a guide"; DC Rainmaker; 15176 #12 | S [corrected] |
| Installed apps per watch | 15 (Suunto FAQ, undated); capability string says 100 | all | us.suunto.com FAQ; `feat_zappcount_100` | documented / conflicting [corrected] |
| Largest single allocation | >~4,000 (Race S success) and ≤4,225 B (Vertical 2 oversize); rejected without an eviction attempt | Vertical 2; Race S lower bound | 53 syslogs (5 oversize events in one session); #66; #43 (9 Pro); 15279 #0 | S [corrected basis] |
| Dependable single allocation under pressure | about 2 KB (most failures are 1.96-3.1 KB requests on a heap that is not full) | Vertical 2 | 82/89 failure events without a ≥96% warning | S [new] |
| data.jsn ceiling | about 4 KB minus overhead (whole-file buffer on every operation) | Vertical 2 (rule); ceiling inferred | climb-logger #181 / synthesis; #66 circumstantial | I [corrected] |
| JS heap total | 133,120 B | 9 Peak Pro, Vertical 2 2.53.42, Race 2 2.56.18; **Race S unmeasured, Race S reports suggest tighter limits** | 14783 #135; 15490; 15692 #1; 15761; 15176 #5 | C there; I (plausible) for Race S [corrected] |
| "28 KB" | 7 × 4,000 B allocatable in one configuration (not stated); may be a count of free large blocks | Race S | 15279 #0; 14940 #8 | C (single measurement), meaning I [corrected] |

All other rows of the original table were either spot-checked and found accurate (canvas budget, WBMAIN 120/140 slots, Race 2 5,986 + 6,379 B fine with 2 apps, leak per re-enable, inputs/outputs) or not re-opened (zappctl lag, ring size). They are unchanged.

## Still unknown (narrowed)
- The Race S heap total, and whether the Race S is genuinely tighter than the Race 2 or only on older firmware (T1, T3).
- Pool allocator versus fragmented contiguous heap (T3).
- The exact cap, and whether it is the same on the Race S (T2).
- Whether a data.jsn over ~4 KB kills localStorage (T4).
- Whether a structured workout takes a slot (T6).
- Native-sensor / phone / HR-broadcast effect on BLE links (T5).
- Canvas costs of `arc` and `fillText` (T8).
- Whether Int16Array exists (T9).
