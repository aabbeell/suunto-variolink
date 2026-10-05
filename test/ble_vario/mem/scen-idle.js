// ABOUTME: sp-mem scenario for ble_vario with no vario in range: one connect, SEARCHING, hints after 30 s.
// ABOUTME: Param retry=1 emits 112 (connect failed) after each connect, so the app retries (the stub allows 3 connects); pg, um.
scenario({
	name: 'vario-idle',
	ticks: 180,
	setup: function (sp) {
		sp.ble.setAutoConnect(false);
		if (sp.param('pg', '') !== '') sp.storage.setItem('pg', sp.param('pg', '')); // pages (default: data.json's, the classic page)
		sp.input('walt', function (t) { return 300 + t * 0.01; });
		sp.input('wvs', 0);
		sp.input('slp', 101325);
		sp.input('spd', 0);
		sp.input('um', +sp.param('um', '0'));
	},
	onTick: function (sp, t) {
		if (sp.param('retry', '0') === '1' && (t === 3 || t === 16 || t === 29)) { sp.ble.emit(0, 112, null, t === 3 ? 1 : (t === 16 ? 2 : 3)); }
	}
});
