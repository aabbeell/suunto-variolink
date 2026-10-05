// ABOUTME: sp-mem scenario for ble_vario: replays the recorded UltraBip lines (LK8EX1 + LXWP0, about 20 per second) on characteristic 1.
// ABOUTME: One disconnect at tick 100 and a reconnect at tick 104; exercise runs throughout. Params: type, pg (pages).
scenario({
	name: 'vario-capture',
	ticks: 240,
	setup: function (sp) {
		var rec = sp.ble.open(sp.file('../../../docs/research/ultrabip-capture/lines-2026-10-03.txt'));
		sp.ble.setDataType(sp.param('type', 'array'));
		sp.ble.feed(1, rec, { lines: true, maxLen: 127, perTick: 20, loop: true });
		if (sp.param('pg', '') !== '') sp.storage.setItem('pg', sp.param('pg', '')); // pages (default: data.json's, the classic page)
		sp.input('walt', function (t) { return 300 + t * 0.1; });
		sp.input('wvs', 0.1);
		sp.input('slp', 101325);
		sp.input('spd', 0);
		sp.input('um', 0);
	},
	onTick: function (sp, t) {
		if (t === 100) { sp.ble.emit(1, 101, null); }
		if (t === 104) { sp.ble.emit(1, 100, null); }
	}
});
