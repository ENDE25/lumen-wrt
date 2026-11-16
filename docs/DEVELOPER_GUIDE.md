# Lumen developer guide

For anyone (human or AI agent) who has to change Lumen and ship the change to users' routers.
Read **section 1** first: it is the whole release procedure. The rest explains the why and the traps.

- [1. TL;DR: ship a change](#1-tldr-ship-a-change)
- [2. How the project is organised](#2-how-the-project-is-organised)
- [3. Setting up and running](#3-setting-up-and-running)
- [4. Making changes](#4-making-changes)
- [5. Testing](#5-testing)
- [6. Releasing in detail](#6-releasing-in-detail)
- [7. How an update reaches a router](#7-how-an-update-reaches-a-router)
- [8. Recovering from a bad release](#8-recovering-from-a-bad-release)
- [9. Never do this](#9-never-do-this)
- [10. Gotchas we already paid for](#10-gotchas-we-already-paid-for)
- [11. Command reference](#11-command-reference)

---

## 1. TL;DR: ship a change

Publishing a release **changes every router that has Lumen installed** the next time its owner presses
*Update*. Do it only when asked, or when the task says "release".

```sh
git checkout main && git pull --rebase        # 1. start from the latest main (the owner also edits README on GitHub)
# ... make your changes ...
npm run check                                  # 2. must report 0 errors, 0 warnings
npm run build                                  #    must succeed
# test (section 5): mock mode, and ideally a real router with `npm run deploy`

git add -A && git commit -m "feat: what you changed"     # 3. commit the source change on its own first
git push

npm run release:patch                          # 4. bump x.y.Z, build, package, SIGN -> release/
#   or: npm run release:minor                  #    for new features (0.8.x -> 0.9.0)
#   with release notes shown in the panel:
#   npm version patch --no-git-tag-version && node scripts/release.mjs --notes "What changed for users"

git add -A && git commit -m "release x.y.z"    # 5. publish: this commit makes it live
git push                                       #    (if rejected: git pull --rebase, then push again)

# 6. verify what GitHub is serving (section 6.4), then tell the owner what shipped
```

A change reaches users **only** if it touches something that goes into the release package (section 6.1).
Documentation-only changes (`README.md`, `docs/`) need no release.

---

## 2. How the project is organised

Lumen is a static web app plus three small pieces that run on OpenWrt. No server of its own.

```
src/                    the web app (Svelte 5 + TypeScript + Vite, zero runtime dependencies)
  lib/                  ubus client, data layer, UCI + safe-apply, vendor lookup, stores, mock router
  components/           charts, drawers, toggles, sidebar, glyphs
  routes/               one file per page (Dashboard, NetworkMap, Traffic, Clients, Wifi, Firewall,
                        Dhcp, Services, Software, Logs, System, Login)
  styles/               design tokens (light/dark) and base CSS
openwrt/                everything that runs ON the router
  rpcd/lumen            rpcd plugin (ucode): extra ubus methods the UI calls
  acl/lumen.json        rpcd access rules for those methods
  bin/lumen-history.uc  collector service (interface history + per-client nftables accounting)
  bin/lumen-pkg-job.sh  runs apk operations detached
  bin/lumen-manage.sh   the installer / updater / uninstaller (`lumen` on the router)
  init/lumen-history    procd init script for the collector
  config/lumen          default /etc/config/lumen (installed once, never overwritten)
  release-key.pub       PUBLIC signing key (the private key is never in the repo)
scripts/
  release.mjs           builds, packages and signs a release into release/
  deploy.sh             DEV shortcut: copies a build straight to a router over SSH
  build-oui.mjs         regenerates public/oui.bin (MAC vendor table) from IEEE data
  build-logos.mjs       regenerates src/lib/logos.ts from Simple Icons
release/                PUBLISHED releases: install.sh, latest.json, lumen-x.y.z.tar.gz(+.sig)
docs/                   this guide and the README screenshots
public/                 favicon and oui.bin
```

The mental model, in one paragraph: the browser loads the static app from the router's `uhttpd`, logs in through
`rpcd`, and calls ubus methods over `/ubus` (JSON-RPC). Stock ubus objects provide most data; the Lumen rpcd
plugin adds what stock OpenWrt lacks; the collector keeps history and per-client counters in RAM; the manager script
installs and updates all of it. See the README "How it works" for the full picture.

---

## 3. Setting up and running

Requirements: Node 20+ and npm. For releases also `tar` and `gzip` (GNU tar). For router tests `ssh`
and, if you use a password, `sshpass`.

```sh
npm install
npm run dev:mock      # simulated router in the browser: no hardware needed (http://localhost:5173)
npm run check         # svelte-check + TypeScript: must be clean
npm run build         # production build into dist/ (gitignored)
```

Against a real router (proxies `/ubus` so you can develop with live data):

```sh
LUMEN_TARGET=http://<router-ip> npm run dev
```

Copy the whole thing onto a router (development shortcut, see 5.2):

```sh
LUMEN_HOST=<router-ip> npm run deploy            # SSH keys
LUMEN_HOST=<router-ip> LUMEN_PASS=... npm run deploy   # password (needs sshpass)
```

`deploy` builds, uploads the web app, installs the rpcd plugin, ACL, collector, init script and manager, and restarts
rpcd/the collector only when their files changed. Env: `LUMEN_USER` (default `root`), `SKIP_BUILD=1`.
A router set up with `deploy` is **not tracked by the installer**: the panel reports it as "deployed from source".

---

## 4. Making changes

### 4.1 Conventions

- **Everything user-visible is English**: UI strings, README, mock data, code comments. (The owner chats in Spanish;
  that never goes into the repo.) Before shipping, grep for stray Spanish: this has bitten us twice.
- **Zero runtime dependencies** in the web app. Keep the bundle small (about 115 KB gzip of JS today). Prefer a small helper
  to a library. `devDependencies` are fine.
- Colours come from the tokens in `src/styles/tokens.css`. Blue is the accent; **green** (`--tx`) is "sent/upload".
  No purple. Check both light and dark themes.
- The UI runs at `html { zoom: .88 }` by design.
- Commit messages: `feat:`, `fix:`, `docs:`, `style:`, `release x.y.z`. Small, focused commits.

### 4.2 Adding or changing what the UI reads/writes

1. **Data the stock ubus objects already provide** (`system`, `network.*`, `iwinfo`, `uci`, `luci-rpc`, `service`, `log`):
   call it from `src/lib/` through `call()` / `batch()` in `src/lib/ubus.ts`.
2. **Anything new on the router** goes in the rpcd plugin `openwrt/rpcd/lumen` (ucode) as a method, **and**:
   - add the method to `openwrt/acl/lumen.json` (`read` for queries, `write` for actions that change something);
   - add a matching case to the mock in `src/lib/mock.ts`, or `npm run dev:mock` breaks for everybody;
   - remember it needs an rpcd restart on the router; the installer does that automatically when the plugin or ACL changed.
3. **Config changes** (UCI) must go through `changes.apply()` in `src/lib/changes.svelte.ts`: stage, `uci apply` with a
   rollback timer, confirm. Use mode `'auto'` only for changes that cannot cut access (DHCP/DNS); firewall, Wi-Fi and
   anything network-wide must use `'manual'`. Use `sectionOps()` (`src/lib/uci.ts`) so options Lumen does not manage are
   left alone.
4. **A new page**: add `src/routes/Foo.svelte`, register it in `src/App.svelte` (`pages`) and `src/components/Sidebar.svelte`.
5. **Persistent user data** (device names/types) lives in `/etc/config/lumen` as `config client` sections.
   History and per-client counters live in RAM (`/tmp/lumen`), never on flash.

### 4.3 Things that change how the router behaves

- `openwrt/bin/lumen-manage.sh` is special: **an update is executed by the manager that is already installed**, so a fix
  to `lumen-manage.sh` only takes effect from the update *after* the one that delivers it. Keep it backward compatible and
  test it (6.5).
- `openwrt/release-key.pub` is baked into `install.sh` at release time. Never change the signing key (section 9).
- The collector (`lumen-history.uc`) and the plugin run on tiny routers: no heavy work, no flash writes.

---

## 5. Testing

### 5.1 Always
`npm run check` and `npm run build`, then click through the pages you touched in `npm run dev:mock` in **both themes**.
Mock mode simulates a router with wired clients, Wi-Fi, firewall rules, packages and updates, so most flows can be
exercised without hardware.

### 5.2 On a real router (recommended for anything under `openwrt/` or touching ubus/UCI)
Use a disposable test router (a VM/container is fine). `npm run deploy` it and exercise the feature. Remember the
traps in section 10: a single-NIC test router cannot generate forwarded traffic, and a container reports the *host's*
memory through `system.info`.

### 5.3 Rehearsing a release without touching GitHub
Build a release that points at a source you control and serve it from the router's own web server:

```sh
node scripts/release.mjs --version 9.9.9 --out /tmp/rel-test --base http://<router-ip>/lumen-rel --notes "rehearsal"
tar -C /tmp/rel-test -cf - . | ssh root@<router-ip> 'rm -rf /www/lumen-rel && mkdir -p /www/lumen-rel && tar -xf - -C /www/lumen-rel'
ssh root@<router-ip> 'wget -qO- http://<router-ip>/lumen-rel/install.sh | sh'   # first install, exactly like a user
```

Then publish a higher version into the same folder and press *Update* in the panel, or run `lumen update` over SSH.
Use a throwaway version number and `--out` outside `release/` so nothing is committed by accident. This is how the
failure paths were verified: a tampered tarball, a wrong signature, a release writing outside Lumen's paths, and a
release with a broken plugin (it rolls back by itself). Re-run those if you change `lumen-manage.sh`.
Remove `/www/lumen-rel` from the test router afterwards.

---

## 6. Releasing in detail

### 6.1 What triggers a release

The package contains: the built web app (`dist/`), `openwrt/rpcd/lumen`, `openwrt/acl/lumen.json`,
`openwrt/bin/*` (collector, job runner, manager), `openwrt/init/lumen-history`, `openwrt/config/lumen`.
Changes to any of those, to `src/`, `public/`, or `package.json` dependencies, need a release to reach users.
`README.md`, `docs/`, `scripts/`, `.gitignore` do not.

### 6.2 Versioning

Semver `MAJOR.MINOR.PATCH`, a single source of truth in `package.json`, baked into the build as `__LUMEN_VERSION__`.

- `npm run release:patch`: fixes and small improvements (0.8.1 -> 0.8.2).
- `npm run release:minor`: new features (0.8.2 -> 0.9.0).
- Routers update **only if the published version is numerically higher** than the installed one. Never reuse or lower a number.

### 6.3 Publishing

`npm run release:patch` = `npm version patch --no-git-tag-version` + `node scripts/release.mjs`. The script:

1. builds the app with that version,
2. stages the files, substitutes the public key and default source URL into `lumen-manage.sh`,
3. makes a reproducible `lumen-<version>.tar.gz`, computes its SHA-256,
4. signs it with the private key (Ed25519, compatible with OpenWrt's `usign`) into `lumen-<version>.tar.gz.sig`,
5. writes `release/latest.json` (version, date, tarball, sha256, size, notes) and `release/install.sh`,
6. keeps only the three newest tarballs.

Useful options of `scripts/release.mjs`: `--version X.Y.Z`, `--notes "text"` (shown in the panel's update dialog),
`--out DIR`, `--base URL`, `--no-build`. The signing key is read from `~/.config/lumen/release-key.pem`
(override with `LUMEN_RELEASE_KEY`). If it is missing on this machine you cannot publish; do **not** generate a new
one (section 9), ask the owner.

Then commit **`release/`, `package.json` and `package-lock.json`** together as `release x.y.z` and `git push`.
The push is what makes the release live. If it is rejected, the owner edited something on GitHub:
`git pull --rebase` and push again.

### 6.4 Verify what GitHub is serving

GitHub's raw cache can hold old content for about five minutes; add a cache-buster to see the truth:

```sh
N=$(date +%s); U=https://raw.githubusercontent.com/ENDE25/lumen-wrt/main/release
curl -sL "$U/latest.json?nc=$N"                     # "version" must be the one you just published
curl -sL "$U/lumen-X.Y.Z.tar.gz?nc=$N" -o t.tgz
sha256sum t.tgz                                      # must equal "sha256" in latest.json
```

If you have a router with Lumen installed, also verify the signature against the key it pinned:

```sh
usign -V -m t.tgz -x t.sig -p /usr/share/lumen/release-key.pub    # prints OK
```

Optionally check that the bundle really contains your change, e.g.
`tar -xzOf release/lumen-X.Y.Z.tar.gz www/lumen/assets/<index-*.js> | grep -c "some new string"`.

### 6.5 After publishing

Tell the owner exactly what shipped (version, notes), that the panel shows an **Update available** badge once GitHub's
cache catches up, and that updating asks them to sign in again when rpcd restarts. The first update after a release is the
real test; ask them to report anything odd from the panel's log or `lumen update`.

---

## 7. How an update reaches a router

1. The owner opens the panel. The **browser** reads `release/latest.json` from GitHub (CORS is open) and compares it with
   the installed version (`/usr/share/lumen/version.json`). A newer one shows a badge in the top bar and a card in *System -> Lumen*.
2. *Update* starts `lumen update` as a detached job on the router (it survives the rpcd restart it causes).
3. The manager downloads the tarball and `.sig`, checks the **SHA-256** against `latest.json`, verifies the **Ed25519
   signature against the key pinned at first install**, checks that every path in the manifest is inside Lumen's own
   locations, backs up the current files, swaps in the new ones, restarts rpcd/collector if needed, and runs a **health check**.
4. If the health check fails it restores the backup automatically. The install record (`version.json`, `files.list`) is only
   written after the new version has proven healthy.

Uninstall (`lumen uninstall`, or *System -> Lumen -> Uninstall*) removes everything listed in `files.list`, the collector's
nftables table and the manager; settings stay unless `--purge`.

---

## 8. Recovering from a bad release

Routers compare versions numerically, so you **cannot take a release back**: lowering `latest.json` will not downgrade anyone,
and routers already updated keep the bad version.

- **Release is merely buggy**: fix it and publish a higher patch release (0.8.2 -> 0.8.3). This is the normal path.
- **Release fails to start on a router**: its own health check rolls it back automatically. Fix and publish a higher version.
- **Stop more routers from picking it up while you fix it**: restore the previous `release/latest.json` (and, if needed, delete the
  bad tarball and `.sig`) in a commit and push. New updates stop; already-updated routers are unaffected.
- **Signing key lost or leaked**: there is no rotation. Every router pinned the old key, so affected routers need a manual reinstall
  with the new key. This is why the key must be backed up and never committed.

---

## 9. Never do this

- **Never commit the private signing key**, or anything under `~/.config/lumen/`. Only `openwrt/release-key.pub` belongs in the repo.
- **Never generate a new signing key** with `--init-key` on a project that already has one: `release.mjs` refuses if the key
  exists, but a fresh machine will happily make a different one, and its releases will be rejected by every installed router.
- **Never hand-edit files in `release/`**, or reuse/lower a version number, or publish without a successful `npm run check` and build.
- **Never force-push `main`**, and do not amend or rebase commits that are already pushed. The owner also pushes to `main` from GitHub.
- **Never put credentials, router IPs from the owner's network, or personal data in the repo.** Pass secrets by environment variable.
- **Never run `npm run deploy` against a router that is not a test router** unless told to, and never restart services there
  that you cannot restore.
- **Do not publish a release unless asked.** Merging code to `main` is not a release; step 4 of section 1 is.
- Do not weaken the security model for convenience: no unsigned updates, no unvalidated package names, no paths outside Lumen's own.

---

## 10. Gotchas we already paid for

**OpenWrt / router side**
- **rpcd plugins must never call rpcd's own ubus objects** (`iwinfo`, `file`, `uci`, ...). rpcd is single-threaded and would deadlock
  on itself. Read `/proc` and `/sys` directly, or let the browser make those calls.
- **ucode quirks**: there is no `range()`; do not shadow built-ins such as `trim()`; a closure cannot reference the `let` it is being
  assigned to (declare it first); `json()` throws on `null`, so guard the result of `readfile()` before parsing it.
- **Containers report the host's memory** through `system.info` (it uses `sysinfo()`), so memory comes from `/proc/meminfo`
  via the plugin (`lumen.stats`).
- **Per-client accounting only sees forwarded traffic.** A single-NIC test router has none; the `count_local` option exists for that.
  Firewall flow offloading under-counts.
- The router's `apk` is the minimal build (no `mkpkg`); `apk` search/query output is large, so searching is done on the router.
- Package operations and Lumen's own update must run **detached** (`setsid`), because they can restart rpcd.
- `lumen-manage.sh` runs under BusyBox `ash`: POSIX sh only, no arrays, no `[[ ]]`. Check with `ash -n` on a router.
- The release tarball is GNU-tar made (reproducible: sorted, fixed mtime, owner 0). Do not switch tools casually.
- **Wi-Fi code is only verified against the mock**; the test router had no radios. Treat Wi-Fi changes with extra care.
- OpenWrt 24.10 and earlier use `opkg`; the Software page only supports `apk` today.

**Web app**
- Never spread a huge array (`Math.max(...bigArray)`): it overflows the call stack. Use `maxOf()` in `src/lib/format.ts`.
- When a list is reloaded every few seconds, wrap editors in `{#key id}` so typing is not reset.
- The vendor table is fetched lazily (`public/oui.bin`); keep it out of the main bundle.
- Browser-side update/firmware checks must tolerate being offline (they already do): never block the UI on them.

**Git / GitHub**
- The owner edits `README.md` directly on GitHub: always `git pull --rebase` before pushing.
- The GitHub token used here lacks the `workflow` scope, so pushes touching `.github/workflows/` are rejected (no CI there).
- `raw.githubusercontent.com` caches for about five minutes.

---

## 11. Command reference

| Goal | Command |
|---|---|
| Install dependencies | `npm install` |
| Run with a simulated router | `npm run dev:mock` |
| Run against a real router | `LUMEN_TARGET=http://<ip> npm run dev` |
| Type-check (must be clean) | `npm run check` |
| Production build | `npm run build` |
| Deploy a build to a test router | `LUMEN_HOST=<ip> npm run deploy` |
| Release a fix | `npm run release:patch` |
| Release a feature | `npm run release:minor` |
| Release with notes | `npm version patch --no-git-tag-version && node scripts/release.mjs --notes "..."` |
| Rehearse a release elsewhere | `node scripts/release.mjs --version 9.9.9 --out /tmp/rel --base http://<ip>/lumen-rel` |
| Publish | `git add -A && git commit -m "release x.y.z" && git push` |
| Regenerate the MAC vendor table | `node scripts/build-oui.mjs [dir-with-csvs]` |
| Regenerate brand logos | `node scripts/build-logos.mjs <path-to-simple-icons>` |
| On a router: status / check / update | `lumen status` / `lumen check` / `lumen update [--force]` |
| On a router: uninstall | `lumen uninstall [--purge]` |
