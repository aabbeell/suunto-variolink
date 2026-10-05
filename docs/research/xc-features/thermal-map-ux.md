# Thermal map UX: what other instruments do, and what VarioLink's map page should take (2026-10-04)

Research for Abel's request to make the THERMAL map page "more pro". Constraints: Race S canvas about 150 units per frame, at most 20 lineTo per path, no confirmed fillText/arc, 1 Hz redraw, a few KB of heap spare, no terrain, no airspeed.

## Products

- **XCSoar** (manual 7.45 §4.8, 7.8, 7.9, 13): "Vario #1" trail = lift green and thick, sink brown and thin; "Vario #2" = orange-red climb, blue sink, yellow zero; optional dotted sink and width scaled by vario. Trail shortened while circling. Drift compensation only in circling mode (corkscrew becomes a column, shows wind shear). Thermal locator keeps the last 20 thermals drift-projected. Thermal assistant: polar plot of climb by position around the circle; widen when the peak passes the top, tighten when it reaches the glider; sensor lag must be learned. North/track/heading/wind up, separately for cruise and circling, circling has its own zoom. Infoboxes: thermal average, gain, time circling, 30 s average, average per turn.
- **XCTrack** Thermal Assistant: lift as points (colour, or circle size on eInk), optional circle round the nearest thermal, pilot arrow plus track line. Drift modes None / Classic (point + wind × age, the default) / Particle. North up recommended, small north compass, about 120 m scale for paragliders. Criticised: a wrong (too strong) wind shifts lift to false places; wind only meaningful after circling.
- **Skytraxx 2.1/5**: monochrome breadcrumbs that thicken in lift; wind-compensated thermal-centre circle that becomes a square or disappears when unsure; the glider symbol projects the predicted path of the current turn; track up with a wind arrow. Flybubble: "the best I've ever used"; monochrome read faster than XCSoar colours.
- **Naviter Oudie / SeeYou Navigator / Hyper**: auto-zoom in on circling, out after; track blue-white-red or "bubbles" sized by lift, coloured relative to MacCready; arrow to the best lift of the previous turn; Hyper shows the direction to the last thermal. Praised in broken lift; criticised for no automatic re-centring.
- **Flymaster** LIVE/NAV SD: a single dot in the navigation rose marks the strongest climb.
- **Syride SYS'Nav**: current core and last thermal. **FlySkyHy**: rotating map marking lift and fast-sink spots. **LK8000**: experimental "Thermal Orbiter", "last thermal" waypoint.
- Nothing published found for Garmin, Suunto, Coros, BipLink, Skybean (a gap, not proof).

Pattern: the most praised designs draw few marks: a core marker, a projection of the next turn, line width for strength; the core marker hides when uncertain.

## Ranked improvements for VarioLink (cost in canvas units / heap)

1. Track line from the glider cross, 25-35 px along the GPS track (XCTrack, Skytraxx). ~4 units, 0 heap.
2. Thermal core marker: climb-weighted centroid of above-average samples over the last ~1.5 circles in the air mass, running sums only; 8-gon sized by average climb; square or hidden when unsure (Flymaster, Skytraxx, XCSoar). 11 units, ~6 numbers.
3. Predicted next circle: r = ground speed / turn rate, centred perpendicular to the track on the turning side, 10-12-gon (Skytraxx). 13-15 units, 3 numbers. Shows at once whether the next turn passes through the core.
4. Lift by width first, colours relative to this thermal's average (works on a 0.5 m/s day); shift samples back 1-2 s for vario lag; about 4 classes instead of 6 (Skytraxx, Oudie, XCSoar). Frees 4-8 units.
5. Thermal average and gain as the small numbers instead of the instantaneous climb (XCSoar, Oudie). 0 units, 3 numbers.
6. Auto-scale on the first full circle (circle about 40% of the screen), held until circling ends (Naviter, XCTrack). 0 units, 1-2 numbers.
7. Drift only once a circling wind exists, faded in; wind as a rim arrow instead of text (XCSoar, XCTrack criticism, Skytraxx). ~5 units.
8. Best-lift chevron on the rim while circling; after leaving, a last-core pointer (Oudie, Hyper, Syride, LK8000). ~5 units, 2 numbers. The full XCSoar polar ring (16 bins, 18-20 units) duplicates item 2.

Items 1-3, 7, 8 add about 40-45 units; item 4 gives back about 5. Keep north up: track up at 1 Hz would rotate 15-20° per frame while circling; item 1 gives most of its benefit.

## Sources
- XCSoar manual 7.45: https://download.xcsoar.org/releases/7.45/XCSoar-manual.pdf
- XCTrack Thermal Assistant (AIR³ manual): https://www.fly-air3.com/en/support/air3-xctrack-manual/xctrack-manual/xctrack-widgets-manual/xctrack-pro-widgets-air/
- XCTrack changelog: http://xctrack.org/Change_Log.html
- Ad Nubes XCTrack tips: https://adnubes.info/en/xc-track-tips-and-tricks-part-i/
- Skytraxx 2.1 review: https://flybubble.com/blog/skytraxx-2-1-flight-instrument-review
- Skytraxx manual: https://www.paradrive.ru/upload/iblock/ded/ded339a8d3ce858edb927ce0b7692e7f.pdf
- Oudie 3 review: https://flybubble.com/blog/naviter-oudie-3-review-skywings
- SeeYou Navigator review: https://xcmag.com/paraglider-reviews/technology-reviews/naviter-seeyou-navigator-app-review/
- Naviter Hyper: https://flybubble.com/naviter-hyper
- Flymaster: https://flybubble.com/flymaster-live-sd-3g and https://xcmag.com/?p=8011
- SYS'Nav tips: https://flybubble.com/blog/syride-sysnav-v3-tips
- FlySkyHy: https://flyskyhy.com/features.html
- LK8000 2.0: https://xcmag.com/news/upgrade-for-lk8000-flight-computer/
