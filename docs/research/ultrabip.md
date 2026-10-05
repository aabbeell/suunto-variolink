# Stodeus UltraBip / BlueBip BLE output: protocol spec for a SuuntoPlus app

Status labels used below: **[verified]** means checked against a primary source or a real device log. **[vendor]** means stated by Stodeus but not seen on the wire. **[inferred]** means my own deduction, which still needs a hardware check.

---

## 1. Which devices are relevant

| Device | BLE | GPS | Sensors | Notes |
|---|---|---|---|---|
| **UltraBip** | yes | yes (1 Hz logger) | pressure + accelerometer + gyroscope ("Instant Vario") | Sends vario, baro and GPS NMEA |
| **BlueBip** | yes | no | pressure + accelerometer + gyroscope | Sends vario and baro only, no GPS sentences |
| leGPSBip (2015-18) / leGPSBip+ (2018-22) | **no** | yes | | Retired. Connects to phones over **USB-OTG** only. Its LK8000 driver parses LK8EX1 + C-Probe. Out of scope for a watch. |
| leBipBip / leBipBip+, BipBip PRO, miniBip | no | no | | Audio-only varios |

There is no product called "Ultrabip+". The Stodeus site lists none. [verified: stodeus.com support/retired-products pages]

First-generation (pre-2026) UltraBip and BlueBip units need one last USB firmware update before they work with the BipLink app. After that, updates arrive over the air. [vendor: ultrabip-firmware page]

Hardware hint [inferred]: a real config file contains `system_serialnumber_string=0080E12700A6DC8F`. The prefix 0x0080E1 is STMicroelectronics' company ID, which points to an STM32WB-class BLE MCU. The RMC sentence includes the NMEA 4.10 navigation-status field with value `V`, which points to a u-blox-style GNSS receiver.

---

## 2. Advertising and discovery

- **Name:** the manuals give the BLE device name as `UltraBip🪂XXXX` and `BlueBip🪂XXXX`, where XXXX is the serial number. [vendor: UltraBip and BlueBip manuals]
  - UTF-8 bytes of the prefix: `UltraBip🪂` = `55 6C 74 72 61 42 69 70 F0 9F AA 82` (12 bytes). `BlueBip🪂` = `42 6C 75 65 42 69 70 F0 9F AA 82`. The parachute emoji is U+1FA82 (4 bytes). The full name is about 16 bytes, so it fits in a legacy 31-byte advertising packet.
  - **The user can change the name.** The manual says the name is customised by entering the pilot name in BipLink. The resulting format is unknown: the prefix may be replaced or kept. [vendor; the resulting format is unverified]
- **Service UUID in the advertisement:** unverified. In ble_fanet_sender, the scanner's filter on the FFE0 service UUID is commented out, with the author's note that it did not work and the service may not be advertised. The project connects by matching one byte of the MAC address instead. **Treat FFE0 as possibly absent from the advertisement** and plan to match on the name. [inferred from github.com/thezenox/ble_fanet_sender src/main.cpp]
- **No OS pairing or bonding is needed.** The apps connect directly over GATT. The exception is "remote control mode", which needs pairing from the phone's system Bluetooth menu. It behaves like an HID keyboard; on Android 12/13 the unit must be un-paired and re-paired every time. [vendor: bluetooth-connectivity page; "HID" is inferred]
- **Timers:**
  - BLE switches off if nothing connects within **5 minutes of power-on**. [vendor]
  - Default auto power-off is after 30 minutes of inactivity. [vendor: manual defaults; config key `system_autopowerofftime_int=30`]
  - Unknown: whether the unit keeps advertising after a mid-flight disconnect.
- **One central at a time** [inferred]: the ble_fanet_sender README says a phone already connected to the vario blocks other devices. That project built a "relay" mode to get around it. Expect the watch to fail to connect while XCTrack or FlySkyHy holds the link.
- **MAC address:** two observed addresses both begin with `0x57` (57:0D:35:26:2A:B1 in the XCTrack log, and the hard-coded MSB filter in ble_fanet_sender). Do not rely on the MAC.

### Proposed SuuntoPlus `appConn.connect` search parameters (must be tested on hardware)

The local SuuntoPlus reference says the search can match:
- AD type 2/3: partial or complete 16-bit service UUID list
- AD type 8/9: short or complete local name
- AD type 255: manufacturer data

It does not say whether matching is by prefix, by substring or exact.

Suggested starting points:
1. `searchParam1 = [9, 0x55,0x6C,0x74,0x72,0x61,0x42,0x69,0x70]` (complete local name starts with "UltraBip")
2. `searchParam2 = [9, 0x42,0x6C,0x75,0x65,0x42,0x69,0x70]` (complete name, "BlueBip")
3. Alternative: `[3, 0xE0, 0xFF]` and `[2, 0xE0, 0xFF]` (16-bit UUID 0xFFE0), if an advertising dump shows FFE0 is advertised.

If the watch does exact matching, a name prefix will not match. The 4-digit serial plus emoji would then have to be entered per user, which needs a setting.

Getting an nRF Connect advertising dump from a real UltraBip, plus a watch-side test, is the **blocking first step**.

---

## 3. GATT layout

**[verified]** from an XCTrack debug log of UltraBip firmware 2023-03-01 (XCTrack issue #976, log uploaded 2023-03-30):

```
SERVICE 0x1801  CHAR 0x2A05 (Service Changed)
SERVICE 0x1800  CHAR 0x2A00 (Device Name), 0x2A01 (Appearance), 0x2A04 (PPCP)
SERVICE 0xFFE0  CHAR 0xFFE1   <- NMEA stream (HM-10 style "serial")
```

- **Missing services:** there is no Battery Service (0x180F), no Environmental Sensing Service, and no Nordic UART Service. Battery and temperature exist only inside LK8EX1.
- XCTrack classified the device as "LE Generic" and logged "cannot write to characteristic". So **FFE1 is notify-only** (or at least not writable), and no handshake or command is needed to start the stream. [verified log; reading it as "notify-only" is inferred]
- **To subscribe:** enable notifications on FFE1 through its CCCD (0x2902). In SuuntoPlus, `appConn.enaCharNotf` does this.
- **Firmware caveat:** BipLink-era firmware (2025/26, with OTA updates and configuration over BLE) probably adds a private config/OTA service. The 2023 log cannot show it. FFE0/FFE1 must still exist, because XCTrack, LK8000, FlyMe ("XC trace BLE") and TracerLink all still work. [inferred]
- **Little-endian 128-bit arrays for `appConn.regUuid`** (16-byte form, as in the official examples):
  - Service 0000FFE0-0000-1000-8000-00805F9B34FB: `[0xFB,0x34,0x9B,0x5F,0x80,0x00,0x00,0x80,0x00,0x10,0x00,0x00,0xE0,0xFF,0x00,0x00]`
  - Characteristic 0000FFE1-…: `[0xFB,0x34,0x9B,0x5F,0x80,0x00,0x00,0x80,0x00,0x10,0x00,0x00,0xE1,0xFF,0x00,0x00]`
  - Whether a 2-byte form is accepted is undocumented.

---

## 4. Transport: MTU, chunking and terminators

- **MTU:** with Android XCTrack (which requests a large MTU), the negotiated MTU was **156**, so the device supports at least that. [verified log]
- **MTU on Suunto watches** (fixed, from the local SuuntoPlus reference):
  - **23** (20-byte notification payload) on Suunto 3/5/5 Peak/9/9 Baro/9 Peak, with one BLE connection.
  - **127** (124-byte payload) on 9 Peak Pro, Vertical, Vertical 2, Race, Race S, Race 2, Ocean and Ocean Lite, with two connections.
- **Line lengths** (including CRLF): LK8EX1 is 33-34 bytes, GPGGA about 72, GPRMC about 71. On MTU-127 watches every line fits in one notification. On MTU-23 watches each line must span 2-4 notifications, and whether UltraBip splits correctly at 20 bytes is unverified.
- **Multiple lines per notification** may also occur. ble_fanet_sender keeps appending notifications until a chunk ends in `\n`, then parses. That pattern implies lines are delivered in pieces and joined on the receiver. [inferred]
- **Terminator:** standard NMEA `\r\n`. XCTrack's log strips terminators. A separate XCTrack issue (#1146) shows that a vario omitting CR/LF breaks line assembly. [inferred CRLF; split on `\n`, strip `\r`]
- **Checksum:** standard NMEA XOR of all bytes between `$` and `*`, written as two upper-case hex digits. I recomputed it for 4 real lines and all matched. [verified]
- **Throughput estimate** [inferred], from the vendor rates:
  - LK8EX1: about 34 B at 10 Hz
  - LXWP0: about 35-45 B at 10 Hz
  - GGA + RMC: about 145 B at 1 Hz
  - Total: about 0.9 KB/s, which is about 45 notifications/s at 20-byte payloads. That is borderline on MTU-23 watches with long connection intervals. ble_fanet_sender reports lag "on high data rates" when relaying.

---

## 5. Sentences emitted

Stodeus's "UltraBip and BlueBip protocols" table [vendor: stodeus.com/en/bluetooth-connectivity]:

| Sentence | Rate | Content |
|---|---|---|
| `$LK8EX1` | 10 Hz | pressure (Pa), baro altitude (m), instant vario (cm/s), temperature (°C), approximate battery (%) |
| `$LXWP0` | 10 Hz | baro altitude (m), instant vario (m/s), heading (deg, **UltraBip only**) |
| NMEA (`$GPGGA`, `$GPRMC`) | 1 Hz, **UltraBip only, only with a valid GPS fix** | lat/lon, GPS altitude, ground speed, heading, UTC date/time |

No `$PRS`, `$POV`, `$XCTRC`, `$PCPROBE` or `$LXWP1/2/3` is documented. There is **no output-protocol selector** anywhere in the Stodeus web Configurator. Its only Bluetooth settings are enable, remote-control mode and "compatibility mode", so all sentences are always sent together. [verified: configurator strings; config.ultrabip keys `bluetooth_enable_bool`, `bluetooth_remoteenable_bool`, `bluetooth_compatibility_bool`]

### Observed wire traffic (firmware 2023-03-01, about 26 s, on the ground)
- 224 × `$LK8EX1` (about 8.5/s). Nominal spacing is about 97-98 ms, with occasional gaps of 150-240 ms.
- 5 × `$GPGGA` and 1 × `$GPRMC`. The fix was weak (4 satellites, HDOP 4.1), and the user reported missing external GPS on that phone.
- **0 × `$LXWP0`.**

### Discrepancy (not resolved silently)
- The 2023-03 firmware sent **no LXWP0**.
- ble_fanet_sender (May 2024) explicitly reads its climb rate from LXWP0 field 4. So LXWP0 was most likely added between 2023-03 and 2024-05. [inferred]
- The current Stodeus page says LXWP0 is sent at 10 Hz.
- **Design rule:** parse LXWP0 when present, but never require it. LK8EX1 is the backbone.

### 5.1 `$LK8EX1` [verified spec: LK8000 Docs/LK8EX1.txt; verified values: device log]

Format: `$LK8EX1,<pressure>,<altitude>,<vario>,<temperature>,<battery>,*CS` (note the comma before `*`).

| # | Field | Encoding | Sentinel | UltraBip observed |
|---|---|---|---|---|
| 0 | static pressure | integer **Pa** (hPa × 100), no padding | 999999 | `98705` (987.05 hPa) |
| 1 | altitude | metres, **QNE/ISA** (relative to 1013.25 hPa) | 99999 | `220`, an integer. ISA altitude of 98705 Pa is 220.4 m, so the field is **uncalibrated pressure altitude**. GPS MSL altitude at that moment was 269 m. |
| 2 | vario | **cm/s**, signed | 9999 | `-6`…`6` integers on the ground |
| 3 | temperature | °C | 99 | `20` (integer). Probably internal/case temperature, not true outside air temperature. [inferred] |
| 4 | battery | voltage if <1000; **1000 + percent** if ≥1000 | 999 | `1090` = 90 % |

Real lines (checksums verified):
```
$LK8EX1,98705,220,0,20,1090,*2A
$LK8EX1,98706,220,-1,20,1090,*05
```

- **Altitude from pressure:**
  - Standard: `h = 44330.77 × (1 − (p/101325)^0.190263)` m.
  - With QNH: `h = 44330.77 × (1 − (p/QNH_Pa)^0.190263)`.
  - Prefer computing altitude from field 0 over using field 1, because field 1 is an integer.
- The UltraBip's own voice altitude is GNSS-calibrated before take-off. **That calibration is not applied to the BLE altitude field.** [vendor + verified]
- Historical warning: the leGPSBip changelog lists fixes for "LK8EX1 vario sign issue" and the "Vz value". Treat old firmware with caution.

### 5.2 `$LXWP0` [layout from XCSoar LX/Parser.cpp and LK8000; UltraBip specifics unverified]

Generic layout, counting fields after the talker:

| # | Field |
|---|---|
| 0 | logger stored (`Y`/`N`) |
| 1 | IAS in km/h (empty on varios without a pitot) |
| 2 | baro altitude in m. XCSoar treats it as pressure altitude (QNE) when no PLXVF is present. |
| 3-8 | up to six vario samples in m/s from the last second. Partial emitters fill only field 3. |
| 9 | heading in degrees |
| 10 | wind direction in degrees |
| 11 | wind speed in km/h |

XCSoar's handling of the vario fields:
- If all six vario fields are present, it applies a 6-tap FIR (-0.0421, 0.1628, 0.3793, 0.3793, 0.1628, -0.0421).
- Otherwise it takes the first valid one.
- It always consumes six fields so that the later fields stay aligned.

Expected UltraBip/BlueBip form [inferred, based on the Stodeus field list and other "partial" emitters]:
`$LXWP0,N,,<alt>,<vario>,,,,,,<heading>,,*CS`
- Heading should be empty on BlueBip.
- Heading is probably the **GPS course**: no magnetometer is listed in the sensors, and the field is "UltraBip only". [inferred]
- ble_fanet_sender reads the vario from the field after the 4th comma (field 3 above), which is consistent with this layout.

### 5.3 `$GPGGA` [verified example]
`$GPGGA,171143.00,4513.6048,N,00548.5377,E,1,04,4.1,269.3,M,48.5,M,,*6D`

Fields in order: UTC hhmmss.ss, latitude ddmm.mmmm, N/S, longitude dddmm.mmmm, E/W, fix quality (1), satellites (04), HDOP (4.1), MSL altitude (269.3) M, geoid separation (48.5) M, then empty differential fields.

Decoded example: latitude 45 + 13.6048/60 = 45.22675° N; longitude 5 + 48.5377/60 = 5.80896° E.

Talker ID is `GP`.

### 5.4 `$GPRMC` [verified example]
`$GPRMC,171143.00,A,4513.6048,N,00548.5377,E,0.0,330.3,300323,,,A,V*21`

- **13 fields (NMEA 4.10).** In order: time, status `A`, latitude, N/S, longitude, E/W, **speed in knots**, course over ground (true), date ddmmyy, two empty magnetic-variation fields, mode `A`, **navigational status `V`**.
- On u-blox-style receivers the final `V` is constant. It does not mean the fix is invalid; use field 2 (`A`).
- **Speed is in knots on the wire.** Stodeus's "km/h" describes the meaning, not the encoding. Conversions: knots × 1.852 = km/h, knots × 0.514444 = m/s.
- **The date exists only in RMC**, so GGA alone cannot give a full timestamp. XCTrack logged exactly this: "GGA: no date from RMC line, bailing out".

---

## 6. Configuration a pilot must do

- **Nothing protocol-related.** Bluetooth is ON by default ("Connectivity: ON" in the defaults), and all sentences are always sent.
- The app must reach the unit within 5 minutes of power-on.
- **Remote-control mode** (BipLink → Bluetooth → Advanced): leave it **off**. It changes the unit into a system-paired button device that XCTrack binds to keys.
- **Compatibility mode** (`bluetooth_compatibility_bool`) is described in the Configurator as being "for devices with trouble maintaining a stable connection". What it actually changes (probably connection interval or other parameters) is unknown. It is worth testing if the watch link proves unstable.
- **Disabling Bluetooth entirely** is possible in the old USB Configurator (for electrosensitive users). If a unit never appears, check this setting.
- **Configuration file:** settings are stored in `config.ultrabip` on the unit's USB mass-storage volume, with up to 3 profiles chosen at power-on. Each profile has its own `bluetooth_*` keys.
- **Integration time:** the vario integration-time setting (default 50 %) affects the beeps. Whether it also smooths the BLE vario is unknown; Stodeus calls the BLE vario "instant".

---

## 7. How existing apps connect (all over FFE0/FFE1, no system pairing)

All steps below come from Stodeus's connection guide [vendor: stodeus.com/en/bluetooth-connectivity].

- **XCTrack (Android):**
  1. Preferences → Connections & Sensors → External sensors → Bluetooth sensor.
  2. Pick the unit.
  3. Tick "Use external GPS" (UltraBip) and "Use external barometer" (both units).
  - XCTrack recognises the device as "LE Generic" (FFE0/FFE1) and requests a larger MTU. [verified log]
- **LK8000:** Device Setup → Name "Generic" → Port = the unit. LK8000 also has dedicated `UltraBip`, `BlueBip` and `GPSBip` drivers, which are the generic NMEA parser plus LK8EX1 + C-Probe. Its BLE port uses HM-10 FFE0/FFE1 and requests MTU 517. [verified: LK8000 source]
- **FlyMe:** select the "XC trace BLE" sensor type. This is evidence that the unit imitates the XC Tracer HM-10-style link and LXWP0. [vendor]
- **FlySkyHy (iOS):** Settings → Vario → Bluetooth Vario Device → Model "Other Bluetooth Vario". [vendor]
- **SeeYou Navigator:** Devices → Discovered devices. The free tier allows only 3 minutes of BLE. [vendor]
- **TracerLink (Apple Watch, Vojtech Vondra, USD 9.99):**
  - This is the closest existing product to a Suunto app. UltraBip/BlueBip support came in v2.0 (2025-09-15).
  - It shows vario battery, altitude with a source label, climb/sink, flight duration, and ground speed/course/glide where GPS is available.
  - It has Focus Mode (one big metric) and haptic climb taps with adjustable sensitivity.
  - v2.1 added altitude calibration (manual, QNH or GNSS).
  - Stodeus promotes it on its connectivity page. [verified: App Store listing]

---

## 8. Parser design and edge cases

1. **Reassembly:** append each notification's bytes, split on `\n`, strip `\r`, and drop empty lines.
   - Do not assume one line per notification. A line can span notifications (MTU 23), and one notification can hold several lines.
   - Cap the buffer at about 256 bytes. On overflow, discard everything up to the next `$`.
   - If a fragment arrives without a leading `$`, resynchronise at the next `$`.
2. **Decoding:** SuuntoPlus delivers a byte array. Convert with `String.fromCharCode` (the stream is ASCII). Only the device *name* contains UTF-8 (the emoji).
3. **Checksum:** require `*hh` and validate the XOR, accepting either hex case. Drop bad lines silently and keep a counter for diagnostics.
4. **Field splitting:**
   - The comma before `*` in LK8EX1 creates an empty 6th field. Split on `,` before `*` and ignore trailing empties.
   - Parse numbers with `parseFloat` so that a future switch from integers to decimals does not break anything.
   - Accept `-0` and leading `+`.
5. **Sentinels:** LK8EX1 uses pressure 999999, altitude 99999, vario 9999, temperature 99, battery 999. XCTrack once mis-handled an all-sentinel line (issue #1059). Never feed sentinels into averages.
6. **Battery decoding:** values ≥1000 mean percent+1000. Values below 1000 are volts (other devices); show "?" or the voltage.
7. **Only one vario source:** if LXWP0 and LK8EX1 both arrive at 10 Hz, use one stream for vario and altitude (LK8EX1 has the full-resolution pressure). Otherwise averages are double-counted, at 20 samples/s.
8. **No timestamps in vario sentences:** use arrival time.
   - Notifications can arrive in bursts, and observed gaps reach about 240 ms.
   - Compute time-weighted averages, not per-sample ones.
   - Mark data **stale** after about 2-3 s without a valid line. XCTrack sounds a disconnection alarm in this case.
9. **Altitude semantics:**
   - LK8EX1 altitude and pressure are **uncalibrated QNE**.
   - Calibrate yourself: offset against GPS MSL altitude after a stable GGA (UltraBip), against the watch's own altitude, or from a user-entered QNH or take-off altitude.
   - Show the source label, as TracerLink does.
10. **GPS gating:**
    - No GGA/RMC is sent before a fix, and never on BlueBip.
    - GGA comes before the first RMC, so wait for RMC before using the date.
    - GGA and RMC may be dropped (5 GGA and 1 RMC in 26 s in the 2023 log).
    - Do not assume 1 Hz.
    - Match on the sentence *type* (`GGA`, `RMC`) whatever the talker (`GP`/`GN`), in case newer firmware switches to multi-constellation output.
11. **RMC details:** RMC can have 13 fields; the final `V` is navigational status, not validity. Convert speed from knots. Course is meaningless at low speed.
12. **LXWP0 robustness:**
    - Always consume six vario fields before reading heading and wind.
    - Allow empty IAS, heading and wind fields.
    - Treat LXWP0 heading as track, and only when the GPS speed is above about 2 m/s.
    - Expect no wind values (not documented as sent).
13. **Unknown sentences** (for example private BipLink traffic in newer firmware): ignore them.
14. **Connection lifecycle:**
    - Event 101 (DISCONNECTED) means SuuntoPlus will reconnect automatically.
    - If the user starts the watch app more than 5 minutes after switching the vario on, or while a phone app holds the link, connection will fail. Show a hint to power-cycle the vario or close the phone app.
15. **Name renamed by user:** a hard-coded "UltraBip" name filter will not match. Offer a manual name/serial setting, or service-UUID matching if the hardware shows FFE0 is advertised.
16. **Temperature** is likely case/sensor temperature (the case is in the sun, under a solar cell). Label it "device temp" or hide it.
17. **Older watches (MTU 23, single connection):** the vario then takes the only BLE slot. Throughput may be marginal; test for dropped or garbled lines.

---

## 9. What to show on the wrist (based on existing apps; no invented features)

Reference points:
- **TracerLink:** vario, altitude with source, flight time, speed, course, glide, vario battery, Focus Mode, haptics.
- **UltraBip voice:** altitude, GPS speed, **average climb over the last 10 s**, heading, time, flight duration. After landing: max altitude, max speed, max climb, duration.
- **BlueBip marketing:** "integrated Vz over 15 s" and glide ratio, both computed by the apps from the BLE data.
- **XCTrack:**
  - Long average of about 10 s.
  - Weak-lift band from -0.5 m/s to the lift threshold.
  - Thermalling detection: start = at least 90° heading change in 30 s AND 30-s average vario ≥ -0.5 m/s; end = less than 30° change in 30 s AND 30-s average below -0.5 m/s.
  - Disconnection alarm when baro data stops.

Suggested screen hierarchy:
1. **Instant vario** as the largest number (m/s with 1 decimal, or ft/min), with a colour or arrow for climb/sink and an optional bar.
2. **Average climb** (configurable 10/15/30 s; default 10 s to match the UltraBip voice).
3. **Altitude:** calibrated baro altitude, plus height above take-off (zeroed at take-off).
4. **Thermal block** (only when circling is detected using the XCTrack rule): current-thermal average climb, gain in the thermal, and time in the thermal. Optional simple centring hint when an UltraBip GPS track is available.
5. **Ground speed and glide ratio** (UltraBip GPS only): glide = ground speed ÷ sink, shown only while sinking and above a minimum speed.
6. **Flight timer** that starts automatically on take-off detection (climb or speed thresholds), plus **max climb** and **max altitude**.
7. **Status row:** vario battery %, link state (connected / stale / lost) and GPS fix state.
8. **Focus mode:** one value full screen. **Haptic climb pulses** with a threshold; this is TracerLink's key feature for wrist use.

---

## 10. Suunto developer forum check

- The NodeBB category listing for category 62 (59 topics) worked.
- The forum search API returns "not-authorised" without a login.
- No thread mentions Stodeus, UltraBip, XC Tracer or varios.
- Relevant BLE facts from the forum:
  - A Bosch eBike ESP32 bridge plus SuuntoPlus app (topic 15217) shows a custom-service BLE app working on a Race S.
  - Developers note the small write payload (about 20 B) and the two-connection limit.
  - A GoPro BLE thread (15534) confirms that generic BLE peripherals are reachable.
  - On-watch debugging is through `systemEvent()` logs only.


## Key facts
- Device scope: UltraBip (GPS) and BlueBip (no GPS) have BLE. leGPSBip/leGPSBip+ use USB-OTG only and are retired; there is no Ultrabip+ product. [stodeus.com support, gpsbip-connectivity and retired-products pages]
- GATT on firmware 2023-03-01: services 0x1801, 0x1800 and 0xFFE0 (char 0xFFE1). No Battery Service, no ESS, no Nordic UART. XCTrack logged 'cannot write to characteristic', so the char is notify-only and needs no handshake. [XCTrack issue #976 device log]
- Stream is ASCII NMEA with standard XOR checksum, notified on 0xFFE1. LK8000 and XCTrack treat it as a generic HM-10 FFE0/FFE1 serial link. [XCTrack log; LK8000 BluetoothGattClientPort.java; thezenox/ble_fanet_sender main.cpp]
- Vendor-documented sentences: $LK8EX1 at 10 Hz (pressure Pa, baro alt m, vario cm/s, temp C, battery %); $LXWP0 at 10 Hz (baro alt, vario m/s, heading on UltraBip only); NMEA GGA/RMC at 1 Hz, UltraBip only and only with a valid GPS fix. [stodeus.com/en/bluetooth-connectivity]
- Real LK8EX1 line: $LK8EX1,98705,220,0,20,1090,*2A. Pressure is in Pa; altitude 220 is ISA/QNE (98705 Pa gives 220.4 m) while GPS MSL was 269 m; vario is integer cm/s; battery 1090 means 90% (1000 + pct); note the trailing comma before '*'. [XCTrack #976 log; LK8000 Docs/LK8EX1.txt]
- Firmware 2023-03-01 sent no LXWP0 (224 LK8EX1, 5 GGA, 1 RMC in about 26 s). By May 2024, ble_fanet_sender parses climb from LXWP0, so LXWP0 was probably added later. Parse it when present, never require it. [XCTrack #976 log; ble_fanet_sender, inferred]
- GPRMC uses the NMEA 4.10 13-field form ending ',A,V*CS'; the trailing V is nav status, not invalidity. Speed is in knots. The date exists only in RMC. Talker is GP. [XCTrack #976 log]
- Advertised name is 'UltraBip🪂XXXX' or 'BlueBip🪂XXXX' (XXXX = serial; the emoji is UTF-8 F0 9F AA 82), and the pilot name entered in BipLink can change it. Whether 0xFFE0 is advertised is unverified; ble_fanet_sender could not filter on it and matched the MAC instead. [Stodeus manuals; ble_fanet_sender, inferred]
- BLE turns off if nothing connects within 5 minutes of power-on. No OS pairing is needed except for remote-control mode, which is HID-like and should stay off. There is no output-protocol selector; the only BT config keys are bluetooth_enable, bluetooth_remoteenable and bluetooth_compatibility (compatibility mode is 'for devices with trouble maintaining a stable connection'). [stodeus.com connectivity page; web Configurator strings; config.ultrabip]
- Probably only one central at a time: a phone app holding the link blocks other devices. [ble_fanet_sender README, inferred]
- The UltraBip accepted MTU 156 from Android. Suunto watches have fixed MTU: 23 (20-byte payload) on Suunto 3/5/9/9 Peak, or 127 (124-byte payload) on 9 Peak Pro, Vertical, Race and Ocean. Lines are 33-72 bytes, so reassembly across notifications is required on MTU-23 watches. [XCTrack log; local suuntoplus_reference_docs.md]
- SuuntoPlus appConn.connect matches only advertised AD fields (types 2/3 for 16-bit UUIDs, 8/9 for the name, 255 for manufacturer data); prefix vs exact matching is undocumented. regUuid little-endian arrays: FFE0 = [FB,34,9B,5F,80,00,00,80,00,10,00,00,E0,FF,00,00]; FFE1 is the same with E1. [local SuuntoPlus reference; computed]
- The baro altitude sent over BLE is uncalibrated QNE. The UltraBip's GNSS-calibrated altitude is used only for its voice and KML. The app must calibrate from GPS, QNH or take-off altitude. [stodeus.com gps-logger-track-recording; log arithmetic]
- TracerLink (Apple Watch, USD 9.99) is the closest existing product. It shows vario, altitude with source label, flight time, speed, course, glide and vario battery, with Focus Mode and haptic climb taps. UltraBip voice uses a 10-s average climb; XCTrack detects thermals when heading changes at least 90° in 30 s AND the 30-s average vario is at least -0.5 m/s. [App Store id6480346155; UltraBip manual FAQ; xctrack.org/Manual.html]

## Open questions
- BLOCKING: what does the UltraBip/BlueBip actually advertise? Is 0xFFE0 in the ADV packet or scan response, and is the local name in ADV or only in the scan response? Needs an nRF Connect advertising dump from real hardware.
- BLOCKING: SuuntoPlus appConn.connect name matching. Is it prefix, substring or exact? Does the watch active-scan, so it would see scan-response names? Test [9,'UltraBip'] and [8,...] variants on a real watch.
- What exact name results after the pilot name is set in BipLink: is the 'UltraBip🪂' prefix kept or replaced? Name-based discovery breaks if it is replaced.
- Exact current-firmware LXWP0 layout: which fields are filled, decimal places, and whether heading is GPS track or IMU-derived. Capture live lines with nRF Connect. Running `strings` on the vendor firmware file would also show the printf formats; I did not download the firmware binary.
- Does the UltraBip split lines correctly into 20-byte notifications at ATT MTU 23 (older Suunto 3/5/9/9 Peak)? Is about 0.9 KB/s (about 45 notifications/s) sustainable on those watches without dropped lines?
- Does the unit allow two simultaneous centrals (phone + watch)? ble_fanet_sender suggests only one.
- Does BipLink-era firmware (2025/26) change the GATT table, for example by adding a config/OTA service, while keeping FFE0/FFE1? The only verified GATT dump is from firmware 2023-03-01.
- What does 'Bluetooth compatibility mode' change (connection interval, notification pacing, MTU)? Could it help a watch link?
- Does the BLE vario output follow the device's integration-time setting, or is it always the instant value?
- Real GPS sentence cadence with a good fix (vendor says 1 Hz; the 2023 log showed sparse GGA/RMC with a weak fix), and whether newer firmware uses GN talker or adds VTG/GSA.
- Is the LK8EX1 temperature ambient air or case/internal temperature (likely affected by sun on the solar panel)?
- Does SuuntoPlus regUuid accept 2-byte 16-bit UUID arrays, or only full 16-byte little-endian 128-bit arrays (the examples use 16 bytes)?
- After a mid-flight disconnect, does the UltraBip resume advertising indefinitely, or does a timeout like the 5-minute power-on rule apply? This affects watch auto-reconnect.

## Sources
- https://www.stodeus.com/en/bluetooth-connectivity/ — Primary vendor source: protocol table (LK8EX1 10 Hz, LXWP0 10 Hz, NMEA 1 Hz UltraBip-only with fix), per-app setup steps (XCTrack, LK8000, FlyMe 'XC trace BLE', FlySkyHy, SeeYou), 5-minute BT shut-off, remote-control mode, TracerLink/ActiveLook mentions
- https://www.stodeus.com/en/ultrabip-user-manual/ — Device name 'UltraBip🪂XXXX', customisable via pilot name in BipLink; defaults (Connectivity ON, auto-off 30 min); 10-s average climb in voice; USB file layout; first-gen update requirement
- https://www.stodeus.com/en/bluebip-user-manual/ — Device name 'BlueBip🪂XXXX'; same connectivity rules
- https://www.stodeus.com/en/gps-logger-track-recording/ — Altitude management: no QNH entry; GNSS auto-calibration applies to voice/KML; IGC holds uncalibrated baro + GNSS altitudes
- https://www.stodeus.com/en/gpsbip-connectivity/ — leGPSBip+ connects to tablets via USB-OTG only (no BLE)
- https://www.stodeus.com/en/gpsbip-download/ — leGPSBip changelog: LK8EX1 temperature added, vario sign and Vz fixes (historical caution)
- https://www.stodeus.com/en/stodeus-app-biplink/ — BipLink companion app (BLE config, OTA, logbook); link to the legacy web Configurator
- https://www.stodeus.com/download_files/get_download_file.php/?file=stodeus-configurator.html — Web Configurator, read as text: Bluetooth options are only enable, remote-control mode and compatibility mode ('for devices with trouble maintaining a stable connection'); no protocol selector
- https://github.com/juergenschuft/rcmodelsetups/blob/master/BgdMagic/config.ultrabip — Real config.ultrabip: keys bluetooth_enable_bool, bluetooth_remoteenable_bool, bluetooth_compatibility_bool; firmware 2023-06-30; serial with ST 0080E1 prefix
- https://github.com/thezenox/ble_fanet_sender/blob/master/src/main.cpp — nRF52 central for UltraBip: service 0xFFE0 / char 0xFFE1 notify; parses LXWP0 field 4 as vario plus GPS NMEA via TinyGPS; FFE0 scan filter not working (service likely not advertised); MAC-byte filter; reassembles chunks until '\n'. Repo dated May 2024.
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/976 — UltraBip fw 2023-03-01 with XCTrack 0.9.8.4; attached log (uploads/0409fe0ad64ac7c6f46806776d99b33e/2023-03-30.log) shows the GATT table, MTU 156, 'LE Generic', and raw LK8EX1/GPGGA/GPRMC lines
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/1059 — LK8EX1 all-sentinel line mis-parsed by XCTrack; sentinel handling edge case
- https://gitlab.com/xcontest-public/xctrack-public/-/issues/1146 — Missing CR/LF in BLE NMEA breaks XCTrack line assembly
- https://xctrack.org/External_Devices.html — XCTrack supported NMEA sentences and BLE services (NUS, LeBip, XCTracer, ESS, etc.); leGPSBip listed
- https://xctrack.org/Manual.html — Acoustic vario behaviour, weak-lift band, disconnection alarm, thermalling detection rule
- https://github.com/LK8000/LK8000/blob/master/Docs/LK8EX1.txt — Authoritative LK8EX1 field definitions, units and sentinels (battery 1000 + percent)
- https://github.com/LK8000/LK8000/blob/master/Common/Source/Devices/devLKext1.cpp — LK8000 LK8EX1 parser (pressure preferred over altitude; vario /100)
- https://github.com/LK8000/LK8000/blob/master/Common/Source/Devices/devGPSBip.cpp — LK8000 Stodeus driver (GPSBip/UltraBip/BlueBip) = generic NMEA + LK8EX1 + C-Probe; GPS only when fix valid
- https://github.com/LK8000/LK8000/blob/master/android/src/org/LK8000/BluetoothGattClientPort.java — LK8000 BLE: HM-10 FFE0/FFE1, CCCD 0x2902, requests MTU 517, 20-byte default chunk
- https://github.com/XCSoar/XCSoar/blob/master/src/Device/Driver/LX/Parser.cpp — LXWP0 field layout; QNE altitude interpretation; 6-tap FIR over vario samples or first valid sample for partial emitters
- https://flygaggle.com/help/items/equipment-bluetooth-nmea/ — Gaggle accepts both NUS and FFE0/FFE1 serial profiles; field counts for LK8EX1/LXWP0/RMC/GGA
- https://apps.apple.com/app/id6480346155 — TracerLink Apple Watch app: fields, Focus Mode, haptics, UltraBip/BlueBip support since v2.0 (2025-09-15), calibration in v2.1
- https://www.xctracer.com/en/apps-and-ble-settings — XC Tracer protocol options per app (context for FlyMe's 'XC trace BLE' mode)
- https://forum.suunto.com/api/category/62 — SuuntoPlus dev category (59 topics); no vario/Stodeus threads; search API requires login
- https://forum.suunto.com/api/topic/15217 — Bosch eBike ESP32 bridge + SuuntoPlus BLE app on Race S: proof that custom-service BLE apps work
- https://forum.suunto.com/api/topic/14766 — Developer notes on small write payloads (~20 B) and the two-connection limit
- PROJECTS/SUUNTOPO/reference/suuntoplus_reference_docs.md — Local SuuntoPlus reference, BLE Device Connection section: MTU 23 vs 127 per model, connect search AD types, regUuid little-endian, notification events
