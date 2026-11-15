# Lumen

A modern admin panel for **OpenWrt**, built as an alternative to LuCI. Its look and feel is inspired
by professional network consoles: a compact icon rail, cards, live charts and slide-over detail panels.

> Status: **v0.3 (in development)**. Dashboards plus safe configuration of DHCP/DNS and the firewall.

## How it works

Lumen is a static SPA (Svelte 5 + Vite + TypeScript, no runtime dependencies) that talks directly to the
router over **ubus JSON-RPC** (`/ubus`, the same channel LuCI uses). There is no backend of its own:
uhttpd serves the files and rpcd is the API, enforcing its ACLs.

- Installs into `/www/lumen/` and **coexists with LuCI**, which keeps working as a fallback.
- ~45 KB of gzipped JS: fits routers with little flash.
- One batched request every 2 s feeds every page (`src/lib/live.svelte.ts`).
- A tiny rpcd ucode plugin (`openwrt/rpcd/lumen`) adds what stock ubus lacks: bridge forwarding
  table (which port a client sits behind) and container-correct host stats from `/proc`.
  It must never call rpcd's own objects (rpcd is single-threaded and would deadlock).
- Config changes go through `uci apply` with a **rollback timer**: they are confirmed automatically
  for safe areas (DHCP/DNS) and manually for anything that could lock you out.

## Pages

Dashboard · Network Map · Network · Clients · Firewall · DHCP & DNS · Logs · System

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
openwrt/         rpcd plugin + ACL installed on the router
scripts/         deploy.sh
```

## Roadmap

- [x] Safe UCI apply with confirm / automatic rollback
- [x] DHCP/DNS and static reservations
- [x] Firewall: port forwards, traffic rules (with ordering), zones and forwardings (always manual-confirm)
- [ ] Wi-Fi (radios, SSIDs, associated clients)
- [ ] Traffic history (lightweight time-series daemon) and per-client traffic
- [ ] Installable package (`apk`/`opkg`) with its own rpcd ACL
- [ ] Package management and firmware upgrades
- [ ] Internationalisation (English only for now)

## Security notes

Lumen never stores credentials: the ubus session lives in `sessionStorage` and expires with rpcd.
Any change that could cut access must go through `uci apply` with confirmation.
