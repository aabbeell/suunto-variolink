# UltraBip live capture, 2026-10-03

Captured from the user's own UltraBip with a Mac (CoreBluetooth via bleak, which merges advertising and scan-response data), using `ultrabip_capture.py`. These are measured facts and supersede the inferences in `../ultrabip.md` where they differ.

## Advertising

- Local name: `UltraBip🪂Abel`. The pilot name set in BipLink **replaces** the serial: the name is `UltraBip` + U+1FA82 (UTF-8 `F0 9F AA 82`) + pilot name. Bytes: `55 6c 74 72 61 42 69 70 f0 9f aa 82 41 62 65 6c`.
- **No service UUIDs advertised** (neither in ADV nor scan response; CoreBluetooth would show both). FFE0 cannot be used as a search filter.
- No manufacturer data, no service data.
- So the **local name is the only handle** for `appConn.connect`. Open question for the watch: does a name filter match by prefix (`UltraBip`) or only exactly (`UltraBip🪂Abel`)? See `docs/probe/`.
- Advertised while not connected; nothing seen while the phone held the connection.

## GATT table

| Service | Characteristic | Properties |
|---|---|---|
| 0xFFE0 | 0xFFE1 | read, notify (NMEA stream) |
| 0x570D (custom) | 0x0200 | notify, write-without-response (probably BipLink config) |
| 0x180A Device Information | 0x2A29, 0x2A24, 0x2A25, 0x2A27, 0x2A26, 0x2A28, 0x2A50 | read |
| 0x180F Battery Service | 0x2A19 | read, notify |

Battery Service exists on this firmware (the 2023 log did not show it), so vario battery can come from 0x2A19 or from LK8EX1.

## NMEA stream on 0xFFE1 (40 s, MTU 251 on the Mac)

- 794 notifications, 25,913 bytes: **one complete line per notification** (32-34 bytes, ending `\r\n`). Median gap 31 ms, max 149 ms.
- Sentences: `$LK8EX1` 397 and `$LXWP0` 397, i.e. **both at about 10 Hz**. No GPS sentences were seen (indoors, no fix).
- Examples:
  - `$LK8EX1,100425,75,0,23,1050,*26`: pressure 100425 Pa, altitude 75 m (QNE, uncalibrated), vario 0 cm/s, temperature 23 °C, battery 1050 = 50 %. Note the trailing comma before `*`.
  - `$LXWP0,N,,75.2,0.00,,,,,,,,*6D`: logger N, IAS empty, baro altitude 75.2 m, vario 0.00 m/s, remaining fields empty.
- On the watch (MTU 127, 124-byte payload) each line still fits in one notification; on MTU-23 watches (20-byte payload) lines would be split.

Files: `capture-2026-10-03.json` (every notification with timestamp and hex), `lines-2026-10-03.txt` (decoded lines).
