// ABOUTME: sp-mem scenario for ble_vario in flight: synthetic thermal/glide/sink loop with GPRMC fixes, GPS bottom line on.
// ABOUTME: Params: recfile (path from gen-rec.js), type (array|uint8array), mode (lines|mtu23), per, gp, um, ar, drops, pg.
scenario({
	name: 'vario-flight',
	ticks: 600,
	setup: function (sp) {
		var h = sp.ble.open(sp.param('recfile', ''));
		var mtu = sp.param('mode', 'lines') === 'mtu23';
		var sparse = sp.param('recfile', '').indexOf('sparse') >= 0;
		sp.ble.setDataType(sp.param('type', 'array'));
		sp.ble.feed(1, h, { lines: !mtu, maxLen: mtu ? 20 : 127, perTick: +sp.param('per', mtu ? 37 : (sparse ? 2 : 21)), loop: true });
		sp.storage.setItem('gp', sp.param('gp', '1'));
		sp.storage.setItem('ar', sp.param('ar', '0'));
		if (sp.param('pg', '') !== '') sp.storage.setItem('pg', sp.param('pg', '')); // pages (default: data.json's, the classic page)
		sp.input('walt', function (t) { var s = t % 128; return 1520 + (s < 60 ? 2.5 * s : 150 - 1.2 * (s - 60)); });
		sp.input('wvs', function (t) { return (t % 128) < 60 ? 2.5 : -1.2; });
		sp.input('slp', 101800);
		sp.input('spd', 10);
		sp.input('um', +sp.param('um', '0'));
	},
	onTick: function (sp, t) {
		var d = +sp.param('drops', '1');
		if (d && t % 300 === 0) { sp.ble.emit(1, 101, null); }
		if (d && t % 300 === 4) { sp.ble.emit(1, 100, null); }
	}
});
