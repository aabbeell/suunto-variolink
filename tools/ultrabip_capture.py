# ABOUTME: Mac-side BLE capture of a Stodeus UltraBip: advertising data, GATT table and 40 s of FFE1 NMEA notifications.
# ABOUTME: Run in Terminal (needs Bluetooth permission): uv run --with bleak python tools/ultrabip_capture.py <outDir>
# Scan for the UltraBip, record its advertising data, GATT table and 40 s of FFE1 notifications.
import asyncio, json, sys, time
from bleak import BleakScanner, BleakClient
OUT = sys.argv[1]
log = open(OUT + '/capture.txt', 'w')
def p(*a):
    s = ' '.join(str(x) for x in a); print(s, flush=True); log.write(s + '\n'); log.flush()
async def main():
    seen = {}
    def cb(dev, adv):
        r = seen.setdefault(dev.address, {'names': [], 'uuids': [], 'mfg': {}, 'sd': {}, 'rssi': adv.rssi, 'tx': adv.tx_power, 'dev': dev})
        n = adv.local_name or dev.name
        if n and n not in r['names']: r['names'].append(n)
        for u in adv.service_uuids or []:
            if u not in r['uuids']: r['uuids'].append(u)
        for k, v in (adv.manufacturer_data or {}).items(): r['mfg'][hex(k)] = v.hex()
        for k, v in (adv.service_data or {}).items(): r['sd'][k] = v.hex()
        r['rssi'] = max(r['rssi'], adv.rssi)
    p('Scanning up to 4 minutes; stops 10 s after an UltraBip/BlueBip appears...')
    s = BleakScanner(detection_callback=cb); await s.start()
    t_found = None
    for i in range(240):
        await asyncio.sleep(1)
        hit = any(('bip' in ' '.join(r['names']).lower()) or any('ffe0' in u for u in r['uuids']) for r in seen.values())
        if hit and t_found is None:
            t_found = i; p('found a candidate after', i, 's')
        if t_found is not None and i - t_found >= 10: break
    await s.stop()
    target = None
    for addr, r in sorted(seen.items(), key=lambda kv: -kv[1]['rssi']):
        line = '%s rssi=%s names=%s uuids=%s mfg=%s sd=%s' % (addr, r['rssi'], r['names'], r['uuids'], r['mfg'], r['sd'])
        p(line)
        txt = ' '.join(r['names']).lower()
        if target is None and ('bip' in txt or any('ffe0' in u for u in r['uuids'])): target = r
    if not target:
        p('NO ULTRABIP FOUND'); return
    p('\nTARGET', target['dev'].address, target['names'], 'name bytes:', [n.encode('utf-8').hex() for n in target['names']])
    async with BleakClient(target['dev']) as c:
        p('connected, mtu', c.mtu_size)
        for svc in c.services:
            p('service', svc.uuid)
            for ch in svc.characteristics:
                p('   char', ch.uuid, ch.properties, 'handle', ch.handle)
        chunks = []; t0 = time.time()
        def on(_, data):
            chunks.append({'t': round(time.time() - t0, 3), 'len': len(data), 'hex': data.hex()})
        ch = next((ch for svc in c.services for ch in svc.characteristics if ch.uuid.startswith('0000ffe1')), None)
        if not ch: p('no FFE1'); return
        await c.start_notify(ch, on); await asyncio.sleep(40); await c.stop_notify(ch)
        raw = b''.join(bytes.fromhex(x['hex']) for x in chunks)
        p('\nnotifications', len(chunks), 'bytes', len(raw), 'chunk sizes', sorted(set(x['len'] for x in chunks)))
        text = raw.decode('ascii', 'replace')
        lines = [l for l in text.replace('\r', '').split('\n') if l]
        kinds = {}
        for l in lines: kinds[l.split(',')[0]] = kinds.get(l.split(',')[0], 0) + 1
        p('sentence counts', kinds)
        for k in kinds:
            ex = [l for l in lines if l.startswith(k + ',')][:3]
            for e in ex: p('  ', e)
        json.dump({'target': {'address': target['dev'].address, 'names': target['names'], 'uuids': target['uuids'], 'mfg': target['mfg'], 'sd': target['sd']}, 'chunks': chunks}, open(OUT + '/capture.json', 'w'), indent=1)
        open(OUT + '/lines.txt', 'w').write('\n'.join(lines))
asyncio.run(main())
p('DONE')
