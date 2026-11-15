# Lumen

A modern admin panel for **OpenWrt**, built as an alternative to LuCI. Its look and feel is inspired
by professional network consoles: a compact icon rail, cards, live charts and slide-over detail panels.

> Status: **v0.7 (in development)**. Dashboards plus safe configuration of DHCP/DNS, the firewall and Wi-Fi.

## How it works

Lumen is a static SPA (Svelte 5 + Vite + TypeScript, no runtime dependencies) that talks directly to the
router over **ubus JSON-RPC** (`/ubus`, the same channel LuCI uses). There is no backend of its own:
uhttpd serves the files and rpcd is the API, enforcing its ACLs.

- Installs into `/www/lumen/` and **coexists with LuCI**, which keeps working as a fallback.
- ~45 KB of gzipped JS: fits routers with little flash.
- One batched request every 2 s feeds every page (`src/lib/live.svelte.ts`).
- `lumen-history`, a small procd service (ucode), records per-interface byte counters; the UI reads it through `lumen.history`.
- The same service does **per-client accounting**: it loads its own nftables table `inet lumen` (it survives
  firewall reloads and is removed when the service stops) whose dynamic sets carry one counter per client
  address, maps addresses to MACs through the ARP/NDP tables and keeps hourly buckets. Limits: it counts
  traffic *routed through* the router (LAN <-> Internet or between subnets), not frames switched inside a
  bridge, and it under-counts when firewall **flow offloading** is enabled (the UI warns about it).
  Custom device names and types live in the same file as `config client` sections (`mac`, `name`, `kind`).
  `/etc/config/lumen`: `interval`, `persist`, `clients` (0 disables it), `count_local` (also count traffic to the router itself).
- A tiny rpcd ucode plugin (`openwrt/rpcd/lumen`) adds what stock ubus lacks: bridge forwarding
  table (which port a client sits behind) and container-correct host stats from `/proc`.
  It must never call rpcd's own objects (rpcd is single-threaded and would deadlock).
- Config changes go through `uci apply` with a **rollback timer**: they are confirmed automatically
  for safe areas (DHCP/DNS) and manually for anything that could lock you out.

## Pages

Dashboard · Network Map · Traffic · Network · Clients · Wi-Fi · Firewall · DHCP & DNS · Logs · System

## Development

```bash
npm install
npm run dev:mock                              # simulated router, no hardware needed
LUMEN_TARGET=http://192.168.1.1 npm run dev   # against a real router (proxies /ubus)
npm run check                                 # svelte-check + TypeScript
```

## Deploying to a router

```bash
LUMEN_HOST=192.168.1.1 npm run deploy         # SSH keys, or LUMEN_PASS=... with sshpass
# → http://192.168.1.1/lumen/
```

The script builds, uploads to a staging directory and swaps it in atomically. It also installs the rpcd
plugin and ACL, restarting rpcd only if they changed. To uninstall: `rm -rf /www/lumen` on the router.

## Layout

```
src/lib/         ubus client, domain API, uci + safe-apply, mock, stores (live, router, theme)
src/components/  Sidebar, Topbar, AreaChart, LineChart, Donut, Drawer, Meter, Toggle, ApplyBar
src/routes/      Dashboard, NetworkMap, Network, Clients, Dhcp, Logs, System, Login
src/styles/      design tokens (light/dark) and base styles
openwrt/         rpcd plugin, ACL, history collector + init script + default config
scripts/         deploy.sh
```

## Roadmap

- [x] Safe UCI apply with confirm / automatic rollback
- [x] DHCP/DNS and static reservations
- [x] Firewall: port forwards, traffic rules (with ordering), zones and forwardings (always manual-confirm)
- [x] Wi-Fi: radios, SSIDs (WPA2/WPA3/OWE/open), connected clients, kick — *developed against the demo mock; not yet verified on hardware*
- [x] Traffic history: tiny ucode collector (procd) keeping 5-min buckets for 7 days and hourly for 90 days, in RAM by default (`/etc/config/lumen` can mirror it to a file via `persist`)
- [x] Per-client traffic: nftables per-element counters (table `inet lumen`, forward hook, IPv4+IPv6) mapped to MACs, hourly buckets kept 30 days
- [x] Vendor detection from the MAC prefix (IEEE MA-L/MA-M/MA-S, 360 KB gzipped, loaded on demand) with brand logos and better category icons; private/randomised MACs are labelled as such
- [x] Custom device names and device types tied to the MAC (stored on the router in `/etc/config/lumen`, shown everywhere)
- [ ] Installable package (`apk`/`opkg`) with its own rpcd ACL
- [ ] Package management and firmware upgrades
- [ ] Internationalisation (English only for now)

## Vendor detection and logos

`public/oui.bin` is a gzipped table built from the IEEE registries by `node scripts/build-oui.mjs` (it is committed,
so normal builds need no network; re-run it occasionally). The browser fetches it once, the first time a page needs
vendor names. Brand rules live in `src/lib/vendor.ts`. Logos come from Simple Icons (CC0 artwork, owners' trademarks)
via `scripts/build-logos.mjs`; to ship without any logos replace `src/lib/logos.ts` with
`export const LOGOS: Record<string, string> = {};` and the category icons are used instead.
Devices using randomised MAC addresses (most recent phones) cannot be identified by design.

## Security notes

Lumen never stores credentials: the ubus session lives in `sessionStorage` and expires with rpcd.
Any change that could cut access must go through `uci apply` with confirmation.
