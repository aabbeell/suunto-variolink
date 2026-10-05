# Thermal page design versions (simulator only, 2026-10-04)

Six layouts of VarioLink's THERMAL page, each a standalone simulator app (`src-<V>/`) that draws the same synthetic flight from a seconds counter: a glide in from the west, then 22-s circles in a 5 m/s west wind with the core on the east side. Screenshots `<V>.png` at 75 s (35 s into the climb). Not wired to the vario or the GPS, not memory-measured, never run on a watch.

- A: current build, colour trail fading with age, climb small at the bottom.
- B: Skytraxx-style: width/colour relative to the thermal average, core circle, predicted next circle, track line, wind arrow; climb, TC and gain at the bottom.
- C: big climb on top, small faint trail with one red core ring (Flymaster-like); TC.
- D: XCSoar-style polar lift diagram around the turn; climb, TC, gain.
- E: split, numbers on top, map below.
- F: B centred on the thermal core while circling (XCSoar circling map).

`board.html` is the brainstorm page (published as an artifact) with the competitor survey: XCTrack, XCSoar, SeeYou/Oudie, Naviter Hyper, Skytraxx 5, Flymaster, FlySkyHy, XC Guide, FlyMe, Syride, Tracerlink, Suunto Variometer. No watch product draws a thermal map; the praised big-screen designs use a core circle, the predicted turn and line width. Detailed UX notes: `docs/research/xc-features/thermal-map-ux.md`.

- I: round dots with arc + fill, core as a filled yellow dot.
- J: continuous line with round caps and joins, width by lift.
- K: round dots from round line caps (a near-zero segment per dot): looks like I at the cost of the square dots.
