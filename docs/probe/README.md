# UltraBip discovery probes: conclusions

Three throwaway watch apps (ProbeS, ProbeN, ProbeF; app ids `probes01`, `proben01`, `probef01`) answered one question before VarioLink depended on it: **how can a SuuntoPlus app find the UltraBip?** They were removed on 2026-10-04 after their results were folded into `docs/ble_vario/SPEC.md` (hardware results at the top). Their source, test and builds are in git history: `git show 4165332s `src/probe_{service,name,fullname}`, `test/probe`, `builds/probe_*`).

## What they showed (Race S, firmware 2.53.42, 2026-10-04)

| Probe | Search filter | Result |
|---|---|---|
| ProbeS | 16-bit service UUID 0xFFE0 | never finds the vario: the UltraBip advertises only its name (Mac capture 2026-10-03, `docs/research/ultrabip-capture/`) |
| ProbeN | local name starting with `UltraBip` | ran 8 minutes alongside ProbeS, **result never recorded**: whether the watch matches a name prefix is still open |
| ProbeF | exact full name `UltraBip🪂Abel` | connects; data flows (stage 6) |

Also found with them: the plain 2-byte UUID form (`[0xE0,0xFF]`/`[0xE1,0xFF]`) works and the base-expanded 16-byte form gets event 110; the NMEA stream arrives in 20-byte notifications.

## Still open

Prefix matching. VarioLink's store default (no vario name set) depends on it. Test it with VarioLink itself: a build with an empty "Vario name" (`node test/ble_vario/variant.js dbg <dir>`, no `sn`) either connects or stays SEARCHING.
