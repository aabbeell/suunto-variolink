# Thermal gain: how instruments start and reset it (research 2026-10-04)

| Product | Field | Rule | Source |
|---|---|---|---|
| XCSoar | Thermal gain (TC Gain), thermal average | "Altitude gained/lost in the current thermal": TE altitude minus the climb-start altitude, can go negative. Circling = smoothed turn rate >= 4 deg/s for 15 s, ends after < 4 deg/s for 10 s. Baseline backdated to the first turning. No vario criterion. | Manual 7.45 §12.4 p.141; CirclingComputer.cpp (master b252ae6) |
| XCSoar | Last thermal gain | Stored only if the climb lasted >= 45 s and gained > 0. | GlideComputerAirData.cpp |
| LK8000 | ThermalGain, LastThermalGain | Same as XCSoar; paraglider values enter >= 5 deg/s for 15 s, leave < 10 deg/s for 15 s; last thermal > 45 s and gain > 0. | ClimbStats.cpp, Turning.cpp, LastThermalStats.cpp (master 6b9655f) |
| XCTrack | Thermal gain | "Altitude gain in current thermal". Start: >= 90 deg heading change in 30 s AND 30-s vario >= -0.5 m/s. End: < 30 deg heading change in 30 s AND 30-s vario < -0.5 m/s. | AIR3 XCTrack Pro widgets manual |
| Flymaster NAV SD | Alt.Gain | "Altitude gained in current thermal". Thermal entered when the integrated vario (10 s) > +0.5 m/s, exited when < -1.0 m/s; resets to 0 on entry. | NAV SD manual EN v3 p.18, 21, 38 |
| Flymaster NAV SD | Alt.Gain/Loss | Below the thermal's maximum shows the loss since the top; otherwise the gain. | same |
| Suunto Red Bull X-Alps | last thermal | "the total ascend during the last thermal"; rule undocumented. | suunto.com support |
| Oudie 4 | VarT | average vario since circling began; Thermals panel lists the last 4 thermals. | Oudie 4 manual p.106-107 |
| Stodeus UltraBip | voice | average climb integrated over 10 s; no gain field. | stodeus.com UltraBip manual |
| SeeYou Navigator, Hyper, Skytraxx 5, Syride | | no published definition found | |

Patterns: glider tools (XCSoar, LK8000) never end a thermal on sink, only on straight flight; paraglider tools end on averaged sink (Flymaster < -1.0 m/s over 10 s; XCTrack < -0.5 m/s over 30 s plus straight flight). Entry and exit thresholds differ so the state does not flicker. Baselines are backdated. A last gain is kept after the exit, filtered to climbs >= 45 s with gain > 0.

## VarioLink "climb session gain" (adopted 2026-10-04, owner: "x seconds of 1+ m sink resets")

1. Start when the 10-s average climb exceeds +0.5 m/s (Flymaster entry); baseline = lowest altitude of the previous 15 s (backdated like XCSoar).
2. Show altitude minus baseline, signed.
3. End when the 10-s average stays below -1.0 m/s (Flymaster exit) for 30 s (XCTrack's window), or the altitude falls 30 m below the session's peak.
4. On end, keep peak minus baseline as LAST if the session lasted >= 45 s and gained > 0 (XCSoar/LK8000 filter); show it until the next session.
5. A climb above +0.5 m/s inside the 30-s exit window continues the same session.
