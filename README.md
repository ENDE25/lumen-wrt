# Lumen

A modern admin panel for **OpenWrt**, built as an alternative to LuCI. Its look and feel is inspired
by professional network consoles: a compact icon rail, cards, live charts and slide-over detail panels.

> Status: **v0.8.0**. Dashboards plus safe configuration of DHCP/DNS, the firewall and Wi-Fi, a software manager, and a signed one-line installer with self-update.
> Jump to the [installation guide](#installation-guide).

## Installation guide

### Requirements

- A router running **OpenWrt** (tested on 25.12). Lumen is architecture-independent: it only needs `ubus`, `rpcd`,
  `uhttpd` (with its ubus endpoint, enabled by default), `usign` and `jsonfilter`, all part of a standard image.
- **Root SSH** access to the router, and **working DNS + HTTPS from the router** (it downloads the release itself).
- About 4 MB free in `/usr` and `/www`.
- **LuCI's base packages** (`luci-base`, plus the usual LuCI apps). Lumen reads hosts, leases and wireless status
  through `rpcd-mod-luci` and relies on the access rules LuCI installs for `uci`, `system`, `network`, `log` and
  `service`. Default images include them. Lumen runs alongside LuCI and never modifies it.
- **OpenWrt 25.12 (apk) is the tested platform.** On releases that use `opkg` (24.10 and earlier) everything except the
  *Software* page is expected to work, but that is not yet verified; see the roadmap.

### Install

1. SSH into the router. Optionally check that it can reach the release server:

   ```sh
   uclient-fetch -qO- https://raw.githubusercontent.com/ENDE25/lumen-wrt/main/release/latest.json
   ```

   It should print a small JSON with the latest `"version"`.

2. Run the installer:

   ```sh
   wget -qO- https://raw.githubusercontent.com/ENDE25/lumen-wrt/main/release/install.sh | sh
   ```

   It downloads the latest release, checks its **SHA-256** and its **Ed25519 signature** (with OpenWrt's own `usign`),
   installs, starts the collector, checks that everything came up, and prints the address. If any step fails it stops
   or rolls back without leaving a half-installed panel.

3. Open `http://<router-ip>/lumen/` and sign in with the router's **root** user and password.

What gets installed (the list is recorded in `/usr/share/lumen/files.list`; nothing else is ever written):

| Path | What |
|---|---|
| `/www/lumen/` | the web panel |
| `/usr/share/rpcd/ucode/lumen`, `/usr/share/rpcd/acl.d/lumen.json` | rpcd plugin and its permissions |
| `/usr/libexec/lumen/` | traffic collector, package job runner, the manager (`lumen`) |
| `/etc/init.d/lumen-history` | collector service (enabled at boot) |
| `/etc/config/lumen` | your settings (created once, never overwritten) |
| `/usr/bin/lumen` | symlink to the manager |

### Update

- **From the panel:** *System → Lumen*. A blue **Update available** badge appears in the top bar when a newer version
  is published; press **Update**. You will be asked to sign in again (rpcd restarts).
- **From SSH:** `lumen update` (add `--force` to reinstall the current version).
- Before changing anything the manager backs up the installed files; if the new version does not pass its health
  check it is **rolled back automatically**. Updates are only accepted when signed with the key pinned at install time.
- `lumen check` and `lumen status` tell you what is installed and whether something newer exists.

### Uninstall

- **From the panel:** *System → Lumen → Uninstall…*. Tick *Also delete my settings* to wipe them too.
- **From SSH:** `lumen uninstall`, or `lumen uninstall --purge` to also delete `/etc/config/lumen`.

This removes the panel, the rpcd plugin, the collector service, its nftables table and the manager itself. By default
your settings (device names and types, collector options) stay in `/etc/config/lumen` and come back if you reinstall.
LuCI and the rest of OpenWrt are never touched.

### Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `could not download …/latest.json` | The router has no Internet or DNS. Try `nslookup raw.githubusercontent.com`; on a default image, `dnsmasq` must be running. |
| `checksum mismatch` | The download was corrupt or tampered with. Nothing was changed; try again. |
| `signature check failed` | The release is not signed by the Lumen key pinned on this router. Nothing was changed. |
| `usign is required` | `usign` is missing (it normally ships with OpenWrt). Install it with `apk add usign` / `opkg install usign`. |
| `not enough free space` | Free about 4 MB on `/usr`. |
| Clients / Wi-Fi / DHCP pages show errors such as "Object not found" or "Access denied" | LuCI's base packages are missing (`apk add luci-base` / `opkg install luci-base`). |
| Login fails or the page is blank | Check `ubus call lumen stats` and `uci get uhttpd.main.ubus_prefix` (should be `/ubus`); `/etc/init.d/rpcd restart` often helps. |
| System shows "deployed from source" | That copy came from `npm run deploy`, not the installer; install with the one-liner to get managed updates. |
| Traffic → Clients is empty | Per-client accounting counts traffic *routed through* the router, and under-counts with flow offloading. |
| Use a different release source | `uci set lumen.update.url=https://…/release && uci commit lumen` |

## How it works

Lumen is a static SPA (Svelte 5 + Vite + TypeScript, no runtime dependencies) that talks directly to the
router over **ubus JSON-RPC** (`/ubus`, the same channel LuCI uses). There is no backend of its own:
uhttpd serves the files and rpcd is the API, enforcing its ACLs.

- Installs into `/www/lumen/` and **coexists with LuCI**, which keeps working as a fallback.
- ~115 KB of gzipped JS (plus a 360 KB vendor table loaded on demand): fits routers with little flash.
- One batched request every 2 s feeds every page (`src/lib/live.svelte.ts`).
- `lumen-history`, a small procd service (ucode), records per-interface byte counters; the UI reads it through `lumen.history`.
- The same service does **per-client accounting**: it loads its own nftables table `inet lumen` (it survives
  firewall reloads and is removed when the service stops) whose dynamic sets carry one counter per client
  address, maps addresses to MACs through the ARP/NDP tables and keeps hourly buckets. Limits: it counts
  traffic *routed through* the router (LAN <-> Internet or between subnets), not frames switched inside a
  bridge, and it under-counts when firewall **flow offloading** is enabled (the UI warns about it).
  Custom device names and types live in the same file as `config client` sections (`mac`, `name`, `kind`).
  `/etc/config/lumen`: `interval`, `persist`, `clients` (0 disables it), `count_local` (also count traffic to the router itself).
- **Software** page: the rpcd plugin wraps `apk` (search runs on the router because the catalogue has ~11 000
  packages). Install/remove/upgrade/update run as a detached job (`openwrt/bin/lumen-pkg-job.sh`) so they survive an
  rpcd restart, and the UI follows the log. Names are validated, only four verbs are accepted, and essential
  packages (busybox, rpcd, uhttpd, procd, ...) cannot be removed. The router needs working DNS to reach the
  repositories. The firmware check is done by the browser (`downloads.openwrt.org/.versions.json`), not the router.
- A tiny rpcd ucode plugin (`openwrt/rpcd/lumen`) adds what stock ubus lacks: bridge forwarding
  table (which port a client sits behind) and container-correct host stats from `/proc`.
  It must never call rpcd's own objects (rpcd is single-threaded and would deadlock).
- Config changes go through `uci apply` with a **rollback timer**: they are confirmed automatically
  for safe areas (DHCP/DNS) and manually for anything that could lock you out.

## Pages

Dashboard · Network Map · Traffic · Network · Clients · Wi-Fi · Firewall · DHCP & DNS · Services · Software · Logs · System

## Development

```bash
npm install
npm run dev:mock                              # simulated router, no hardware needed
LUMEN_TARGET=http://192.168.1.1 npm run dev   # against a real router (proxies /ubus)
npm run check                                 # svelte-check + TypeScript
```

## Publishing a new version (maintainers)

Releases live in this repository under `release/`, so publishing is a commit. Routers see the new `latest.json`
and offer the update (GitHub's raw cache can delay that by a few minutes).

```sh
# 0. once per machine: create the signing key (it stays OUTSIDE the repo: BACK IT UP)
node scripts/release.mjs --init-key        # -> ~/.config/lumen/release-key.pem and openwrt/release-key.pub

# 1. make your changes, then check them
npm run check

# 2. bump the version, build, package and sign into release/
npm run release:patch                      # 0.8.0 -> 0.8.1   (or release:minor: 0.8.x -> 0.9.0)
#    or edit "version" in package.json and run: npm run release

# 3. publish
git add -A && git commit -m "release x.y.z" && git push
```

Notes: use the **same key** for every release (routers pin it on first install); the three newest versions are kept
in `release/`; add `--notes "what changed"` to `scripts/release.mjs` to show text in the panel's update dialog.
Never commit the private key. A test source can be used with `--out DIR --base URL`.

## Developing against a router

```bash
LUMEN_HOST=192.168.1.1 npm run deploy         # copies the build + router-side pieces directly (SSH keys, or LUMEN_PASS with sshpass)
```

This is a development shortcut: a copy deployed this way is not tracked by the installer, so the panel shows it as
"deployed from source" and offers no update/uninstall.

## Layout

```
src/lib/         ubus client, domain API, uci + safe-apply, mock, stores (live, router, theme)
src/components/  Sidebar, Topbar, AreaChart, LineChart, Donut, Drawer, Meter, Toggle, ApplyBar
src/routes/      Dashboard, NetworkMap, Traffic, Network, Clients, Wifi, Firewall, Dhcp, Services, Software, Logs, System, Login
src/styles/      design tokens (light/dark) and base styles
openwrt/         rpcd plugin, ACL, collector, init script, default config, lumen-manage.sh (installer), release-key.pub
release/         published releases: install.sh, latest.json, lumen-x.y.z.tar.gz (+ .sig)
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
- [x] One-line installer with signed releases, self-update from the panel and clean uninstall
- [ ] `opkg` backend for the Software page (OpenWrt 24.10 and earlier) and a compatibility test on 24.10
- [ ] Independence from LuCI packages (ship Lumen's own access rules and data methods)
- [ ] Optional native `apk` package / feed
- [x] Package management (apk): list/search/install/remove/upgrade with a dry-run preview and live log, detached jobs, core packages protected; firmware release check against downloads.openwrt.org
- [ ] Flashing firmware from the panel (sysupgrade)
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
