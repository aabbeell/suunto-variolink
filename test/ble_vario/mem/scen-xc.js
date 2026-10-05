// ABOUTME: sp-mem scenario for the ble_vario XC engine: synthetic flight with watch GPS fixes (circling in wind, then glide)
// ABOUTME: and the vario stream, so the circling detector, the wind fit and the store run. Params: recfile, type, pg, ticks.
// Track (analytic, so the scenario keeps no state): a 128-s loop, 60 s of 22-s circles at 9.5 m/s airspeed in a 5 m/s
// wind from 270 deg, then 68 s of straight glide on 245 deg; int32 degrees x 1e7 around 46 N 8 E like the watch input.
// The jump at each loop start is above 60 m/s, so the app drops that step as a glitch. Take-off comes from spd.
scenario({
	name: 'vario-xc',
	ticks: 600,
	setup: function (sp) {
		var h = sp.ble.open(sp.param('recfile', ''));
		sp.ble.setDataType(sp.param('type', 'uint8array'));
		sp.ble.feed(1, h, { lines: true, maxLen: 127, perTick: +sp.param('per', 21), loop: true });
		sp.storage.setItem('pg', sp.param('pg', '0'));
		sp.input('walt', function (t) { var s = t % 128; return 1520 + (s < 60 ? 2.5 * s : 150 - 1.2 * (s - 60)); });
		sp.input('wvs', function (t) { return (t % 128) < 60 ? 2.5 : -1.2; });
		sp.input('slp', 101800);
		sp.input('spd', 10);
		sp.input('um', 0);
		// position in metres east (x) and north (y) at tick t
		var pos = function (t, east) {
			var c = Math.floor(t / 128), s = t % 128, w = 2 * Math.PI / 22, x, y;
			if (s < 60) { x = 5 * s + 9.5 / w * (1 - Math.cos(w * s)); y = 9.5 / w * Math.sin(w * s); }
			else { x = 300 + 5 * 60 + 9.5 * Math.sin(4.276) * (s - 60) + 5 * (s - 60); y = 9.5 * Math.cos(4.276) * (s - 60); }
			return east ? x + 400 * c : y;
		};
		sp.input('la', function (t) { return Math.round(460000000 + pos(t, 0) / 0.0111195); });
		sp.input('lo', function (t) { return Math.round(80000000 + pos(t, 1) / (0.0111195 * 0.694658)); });
	}
});
