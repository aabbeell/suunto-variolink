# Deep dive: ble-discovery (verified)

## Conclusion
Two of the three load-bearing claims hold against primary sources. The third is narrower than the report says, and the report missed two problems.

**Held (confirmed from source):**
- **Bosch bridge on a Race S.** While serving the watch, the ESP32 advertises flags plus AD 0x07 with the LDI UUID. Its name sits in the scan response, and it never sends AD 0x06. The watch app's [7,uuid]+[6,uuid] (17-element arrays) connected on the author's Race S (forum 15217 #0).
- **FORM.** A [255,125,6] filter connects on a Vertical 2, not a Race S.

**[corrected] The Nuki failure is not evidence about filters.** The app eagerly loaded a 26.7 KB crypto module in onLoad from commit e7da13d on, before all three hardware tests. A third filter, [8,'Nuki'], also failed. The author's final commit concludes that connect() probably never ran.

**[corrected] "sp1 and sp2 are OR alternatives" is not established.** Bosch rules out strict per-type AND and nothing more. Every observed success is equally consistent with the watch ignoring sp2 entirely.


Confidence: confirmed for what each device advertises, inferred for how the two parameters combine and what the matching semantics are. Hardware tests can settle both.

## Design rules
- Pass each search parameter as a plain JS Array of integers 0-255: one AD-type byte followed by at most 16 value bytes. 17 elements is the vendor template's own shape and works on a Race S (Bosch). Arrays built at runtime are fine. Strings and Uint8Array are untested: do not use them.
- Put the filter most likely to match in sp1. Until a test proves the watch reads sp2 at all, treat sp2 as a possibly ignored extra, never as the only path to a match (Tymewear's sp2 'backup' and its unreachable UUID fallback are the anti-pattern).
- For 128-bit UUIDs send [7,uuidLE16] and [6,uuidLE16]; for 16-bit UUIDs send [3,lo,hi] and [2,lo,hi]. After T0 shows which AD type the device actually uses, put that one in sp1.
- Until prefix matching is proven, name filters carry the complete advertised name, encoded as UTF-8 bytes (not charCodeAt&0xFF). Get it from a per-device setting; for sideloaded tests put it in data.json.
- Keep onLoad small and lazy-load large ext files with evalFile right before first use. A failed or out-of-memory onLoad means connect() is never called, and the watch then shows the same 'Cannot find device' Searching view as a filter miss. Log a 'connect called' systemEvent so the two can be told apart.
- Discovery cannot be tested in the simulator: every appConn method there is an empty no-op, so connect returns undefined and no events fire.

## Hardware tests
- T1, matching rules with a controlled advertiser (nRF Connect for Android, Advertiser tab, connectable legacy advertising). Use one .dev that logs systemEvent on every event plus a 'connect called' marker, and steps a variant index kept in localStorage on each onLoad. Config A: ADV = flags + 16-bit UUID 0xFFF5 (complete list) + manufacturer data FF FF 01 02 03 04 05 06 + 128-bit UUID U; SCAN_RSP = complete local name SPTEST01. Single-parameter variants: V1 [3,0xF5,0xFF] (event 100 means 16-bit filters work); V2 [255,0xFF,0xFF] and V4 [255,0xFF,0xFF,1,2,3,4,5,6] (both connect: prefix or full match); V3 [255,0x03,0x04] (connects: contains matching); V5 [9,'SPTEST01'] (connects on A: active scanning, provided name matching works); V6 [9,'SPTE'] (prefix names); V7 [8,'SPTEST01'] (whether 8 and 9 are treated alike); V8 [0x16,0xF5,0xFF] (event 112 or BLE API err 5 means type 0x16 is rejected). New two-parameter variants: V9 sp1=[3,0xF5,0xFF], sp2=[3,0x34,0x12]; V10 sp1=[3,0x34,0x12], sp2=[3,0xF5,0xFF]. Reading V9/V10: OR means both connect; sp2-ignored means V9 only; strict AND means neither. New 17th-byte check: V11 [7, U with its last byte changed]; connecting means the 17th element is not compared. New Config C: the 128-bit UUID U only in SCAN_RSP, the ADV packet carrying only flags + manufacturer data; run [7,U]. Event 100 proves active scanning using the one filter type already proven on a Race S. Repeat V5 and V6 with the name moved into the ADV packet (Config B) to separate name semantics from scan mode.
- T2, UltraBip on the Race S (within 5 min of power-on, XCTrack and BipLink closed; sp1 only unless V9/V10 showed OR). U1 [9, exact full-name UTF-8 bytes from T0]. U2 [9, 'UltraBip' as 8 ASCII bytes]: connects only if names prefix-match. U3 [3,0xE0,0xFF]: connects only if FFE0 is advertised in a packet the watch sees. U4 [8, full name]. After event 100: regUuid FFE0/FFE1 and enaCharNotf should yield event 106 with LK8EX1 bytes.
- T5, active-scanning check on the user's own watch if no Android advertiser is available: [9,'ATC_xxxxxx'] against a pvvx LYWSD03MMC, whose firmware source puts the name only in SCAN_RSP. Event 100 means the watch scans actively. 'Cannot find device' together with a logged 'connect called' marker means passive scanning or broken name matching; T1 Config B/C separates the two.

## Report
# Adversarial re-check of the "ble-discovery" report

**Scope.** I re-opened the primary sources for the three most load-bearing claims, plus the Nuki and Tymewear evidence the report leans on:
1. Bosch / Race S / parameter semantics

**Where things are.**
- My scratch copies are in `/tmp/deep-ble-discovery-verify/`: fresh fetches of every cited file, at pinned commits.
- I edited nothing in either project repo.

**Labels.**
- [confirmed]: primary source read by me
- [inferred]: my reasoning
- [corrected]: a claim in the original report that was wrong or overstated
- [unverified]: carried over and not re-checked, or not checkable

**Limit on forum coverage.** The forum search API returns `not-authorised` without a login. Forum coverage is therefore limited to topics fetched directly by id (15217) and the threads already cached in `/tmp/deep-ble-discovery/forum/`.

---

## Claim 1: Bosch bridge proves 128-bit filters, 17-element arrays and OR semantics on a Race S

### What I checked
- **Watch app.** `SellA/BoschEBikeSuunto` `ext1.js`. The arrays are unchanged since the initial commit 56a12ff (2026-05-11):
  - `[7, 228,204,219,226,42,42,180,129,233,17,162,234,32,235,0,0]`
  - `[6, same 16 bytes]`
  - That is 17 elements each.
  - The file's comment calls type 6 "solicitation". That is wrong: 0x06 is the incomplete 128-bit UUID list and 0x15 is 128-bit solicitation.
  - The author expects it to find "either the real bike or the bridge". That shows the author thinks of the two parameters as OR. But the bike is the central (it scans for solicitation), so it never advertises LDI, and [6] could never have matched anything.
- **Bridge firmware.** `SellA/BoschEBikeESP32` `src/main.cpp` at 23dc07d, committed 2026-05-14 19:02Z, 11 minutes before the forum post.
  - `startAdvertisingForSuunto` (around L466-488):
    - advertising payload `02 01 06 | 11 07 e4 cc db e2 2a 2a b4 81 e9 11 a2 ea 20 eb 00 00` (21 bytes)
    - `scanData.setName("BoschEBike")`
    - `setScanResponse(true)`, which gives a connectable, scannable ADV_IND
  - The header comment (L38-47) says the same.
  - After whitespace normalisation the function is byte-identical at 6de477c, efbbc3e, 23dc07d and 7dcc37a.
  - On master, `startAdvertisingForClient` uses the same payload when `MODE_SUUNTO_BRIDGE` is set (L789-806).
  - **No AD 0x06 exists in any version. [confirmed]**
- **Hardware report.** Forum 15217 #0 (pid 191370, 2026-05-14T19:13Z): the title says "on Suunto Race S", and the body says the author tested only on his own Race S. **[confirmed]**
  - The repository README instead lists "Suunto Vertical | Tested" and "Race / Race S | Compatible". The forum post is the primary source; the README is inconsistent with it.
  - `Knowledge.md` "Known Working Clients" lists "Suunto watch | 1 (Suunto Bridge) | Requires LDI UUID in AD". That is the author's own summary and does not by itself prove anything about advertising packet vs scan response.
- **Vendor template.** `templates/New-SuuntoPlus-BLE-Sport-App/ext1.js` (Editor 1.42.0):
  - It uses `[6, 0,15,…,1]` and `[7, 0,15,…,1]`, 17 elements each.
  - Its comment says it searches the UUID "from partial and complete lists (128 bit)".
  - The comment's list of types names 2-7 and 255 only.
- **Reference doc.** L2494-2495 says "max length 16 bytes". L2521 and L2640-2643 give the 0xFDF3 example: `[3,…]` "and also from partial list" `[2,…]`.

### Verdict
- **AD 0x07 in the advertising packet matches on a Race S: holds [confirmed].**
- **17 elements (type byte + 16) are accepted: holds [confirmed].** The vendor's own template uses that shape.
  - Not excluded: the firmware might truncate to 16 elements and prefix-match, which would also succeed. Test V11 below settles it.
- **[corrected] "The two parameters are alternatives (OR), strong evidence".** The Bosch result rules out only strict per-type AND. It is equally consistent with:
  - (a) OR;
  - (b) AND where 6/7 (and 2/3, 8/9) are treated as one family;
  - (c) the firmware ignoring sp2 entirely.
- Every public success has the matching filter in sp1: Bosch [7], FORM (sp1 only), Tymewear (name in sp1), and the doc example ([3] first). So **nothing observed distinguishes OR from "sp2 ignored"**.
- The vendor wording ("and also from partial list", "from partial and complete lists") makes OR the intended design [inferred], but it is untested.
- **What follows for design:** put the most likely matching filter in **sp1**, and make sp1 and sp2 equally specific. That is correct under all three readings. A fallback placed only in sp2 (Tymewear's UUID fallback, or any "backup" filter) may be dead code.

---

## Claim 3: manufacturer-data filters match on the company ID

### FORM
- `zestuart/suunto-form` (one commit, b485512, 2026-07-21):
  - `ext1.js` is `appConn.connect(enabledZappId,evHandler,[255,125,6])`, sp1 only.
  - The README says "Status: Verified in open water on a **Suunto Vertical 2**".
- 0x067D is "Form Athletica Inc." in the SIG company list (cached `company_ids.yaml` L7491-7492).
- **[confirmed on a Vertical 2, not a Race S].**
- **[unverified] prefix matching.** I looked for FORM's actual advertisement and found nothing public:
  - `gh search code` for the FORM GATT base `8589-4d81-9803-a7a8ab3b0c06` finds only `garrickgan/formgoggles-py`.
  - That project finds the goggles by name or service-UUID prefix, never by manufacturer data (`form_sync.py` around L2191-2198).
- So it remains unknown how long FORM's manufacturer data is and whether it sits in the advertising packet or the scan response. FORM therefore proves company-ID matching but **not** prefix semantics, and **not** active or passive scanning.

## Things the investigator missed

### 1. [corrected] The Nuki failure says nothing about filter semantics
The commit timeline, from `gh api repos/slavikpi/nuki_suunto/commits`, all on 2026-06-20:

| Commit | Time (UTC) | Change |
|---|---|---|
| e7da13d | 19:54 | Adds on-watch crypto. `main.js` `onLoad` L597-598 calls `loadExt(3)()` and then `loadExt(4)()`. The `ext4.js` source is 26,735 B; the commit message gives 16.7 KB minified. |
| bca50c8 | 20:29 | First reported hardware failure, filter `[9,'Nuki']`+`[255, iBeacon prefix]`. Switches to the 255 filter alone. |
| eb95016 | 20:47 | The 255 filter alone also failed. Switches to `[8,'Nuki']`. |
| 7d56e26 | 20:59 | Reports that "Cannot find device" persisted across three structurally different filter attempts. |

- **The original report was wrong to say the `[8,'Nuki']` result was never reported.** The 7d56e26 message reports it as failing too.
- **The author's own diagnosis in 7d56e26:** the eager crypto load probably kept `onLoad` from completing, so `appConn.connect()` was never called.
- **The code supports that diagnosis:**
  - `state` is declared without an initializer (L67), so if `onLoad` throws, `evaluate`'s switch matches nothing.
  - `output.con` becomes non-zero only after event 100 (L449, L462).
  - The reference doc (L2485) says the Searching view closes only when `output.con` is non-zero.
- No later commit reports an outcome.
- **Separately,** `[8,'Nuki']` (short name) against a lock that advertises the complete name `Nuki_44793FEC` would fail under strict type matching anyway.
- **Consequences:**
  - Remove Nuki from every inference: name exact vs prefix, the manufacturer-data length rule, and the iBeacon hypothesis.
  - Design rule 7's "likely cause of the Nuki failure" is unsupported. The general caution against beacon-only payloads can stay, unattributed.
  - The real lesson for these apps is memory: lazy-load large ext files, as the reference recommends.

### 2. [corrected] Tymewear never had a working fallback
- Every version's `connect` uses the name filters whenever `expectedDeviceId` is truthy.
  - v1.0 (3a369ce, `Tymewear/Tymewear_Unofficial/main.js` L17) defaulted to `'87B4'`, apparently the author's own strap.
  - c305b4c changed the default to `'XXXX'`, with the commit message "Adjusted sensor ID to try to fix issue in Suunto app".
  - Current 7f9bab5 still has L17 `'XXXX'`, and `data.json` holds `device_id: "XXXX"`.
- Both defaults are truthy, so the 128-bit fallback (L170-187) is unreachable. The shipped app depends entirely on `[9,'TYME-'+id]`+`[8,…]` and the user's "Sensor ID" setting.
- Evidence that the name filter works stays circumstantial:
  - c305b4c added smoothed outputs "for use in Suunto app";
  - on 2026-09-15 the author added disconnect handling;
  - forum 13522 #5 says the app is installable.
- **[inferred], unchanged.** The `charCodeAt(i) & 0xFF` helper (L153-156) is confirmed. It is harmless for ASCII names.

### 3. Hardware tests had no way to settle the OR question
T1 tested only one parameter at a time. The test list below adds the missing variants:
- the sp1-match / sp2-garbage and sp1-garbage / sp2-match pair;
- a 17th-byte check;
- an active-scan check that uses a 128-bit UUID placed only in the scan response. The 128-bit type is the only one already proven on a Race S, so the name-matching unknown does not confound it.

### 4. Other filters that are broad in practice
- `[0x16,0x1A,0x18]` matches every ATC/pvvx-style sensor.
- Under OR, using either as sp2 next to an exact name defeats the name. Put them in separate diagnostic builds, never in sp2.

---

## Claims I checked that still hold
- The simulator's `appConn` methods are empty no-ops (`webview-resources/main.js` L1030).
- `types.d.ts` L41 declares the parameters as `number[]` and the return type as `void`. The doc says connect returns a connectionId; that inconsistency is minor.
- 0xFDF3 is "Amersports" (SIG `member_uuids.yaml` L561-562, fresh from bitbucket).
- `thezenox/ble_fanet_sender` `src/main.cpp`:
  - L309 has the FFE0 `filterUuid` commented out as "not working, maybe service is not advertised";
  - L310 sets `useActiveScan(false)`;
  - L178-181 filters by address.
- pvvx `ATC_MiThermometer` `src/ble.c` (master, pushed 2026-09-23):
  - the advertising type is `ADV_TYPE_CONNECTABLE_UNDIRECTED` (L373-375);
  - `bls_ll_setScanRspData(ble_name)` (L368/L376);
  - `load_adv_data` (L602-623) copies the name into the advertising packet only when there is no beacon data or in Coded PHY mode.

## Not re-checked [unverified], carried over unchanged
- UltraBip name bytes and the vendor manuals.
- Whether closed-source FTMS or CORE apps use 16-bit filters.
- The Nuki iBeacon and HomeKit advertisement details (developer.nuki.io/t/1109).
- Forum 14766, 14783, 5967, 15787 and 11994 content.
- LK8000 and XCTrack behaviour.

---

## Corrected per-device recommendations

| Device | sp1 | sp2 | Confidence | Pre-check |
|---|---|---|---|---|
| UltraBip / BlueBip | `[9, exact full UTF-8 name, 16 bytes]` | `[8, same]` | Low (unchanged) | T0 dump |
| pvvx LYWSD03MMC | `[9,'ATC_xxxxxx']` | none. **[corrected]** `[0x16,…]` only in a separate diagnostic build. | Low; depends on active scanning | — |
| Stock LYWSD03MMC | unknown | — | Unknown. **[corrected]** `[0x16,0x95,0xFE]` matches all MiBeacon devices, so diagnostic only. | — |

## Remaining unknowns, all needing hardware
- OR vs same-family AND vs sp2-ignored.
- Whether the 17th element is compared.
- Active vs passive scanning.
- Exact vs prefix vs contains matching for names and for manufacturer data beyond the company ID.
- Whether type 0x16 is accepted.
- The UltraBip's split between advertising packet and scan response.
- Scan timeout, and which device wins when several match.

## Sources
- **Local:**
  - `…/SUUNTOPO/reference/suuntoplus_reference_docs.md` L2485, L2488-2521, L2638-2645
  - `~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/templates/New-SuuntoPlus-BLE-Sport-App/ext1.js`
  - `webview-resources/main.js` L1030
  - `node_modules/@suunto-internal/suuntoplus-tools/lib/type/types.d.ts` L41-45
  - `…/SUUNTOPLUS-SENSORS/docs/research/critique.md` L158-174
- **GitHub, Bosch:**
  - SellA/BoschEBikeSuunto `ext1.js` (56a12ff, fcb4d40), README
  - SellA/BoschEBikeESP32 `src/main.cpp` @6de477c/efbbc3e/23dc07d/7dcc37a/master, `Knowledge.md`
- **GitHub, other apps and firmware:**
  - zestuart/suunto-form `ext1.js`, `README.md`, `test.js`
  - garrickgan/formgoggles-py
  - slavikpi/nuki_suunto commits e7da13d, bca50c8, eb95016, 7d56e26 and `main.js` @eb95016
  - thekrisjones/Tymewear_Suunto `main.js` @3a369ce/c305b4c/7f9bab5, `manifest.json`, `data.json`
  - thezenox/ble_fanet_sender `src/main.cpp`
  - pvvx/ATC_MiThermometer `src/ble.c`
- **Web:**
  - Bluetooth SIG `member_uuids.yaml` (bitbucket)
- **Forum:** 15217 #0-#3 via `api/topic/15217`; 13522 #5 (cache)
