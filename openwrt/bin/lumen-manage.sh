#!/bin/sh
# Lumen manager: install, update and uninstall. Works straight from a pipe:
#
#     wget -qO- https://raw.githubusercontent.com/ENDE25/lumen-wrt/main/release/install.sh | sh
#
# After installing it lives at /usr/libexec/lumen/manage.sh and is available as `lumen`:
#     lumen status | check | update [--force] | uninstall [--purge]
#
# Every release is a .tar.gz with a SHA-256 in latest.json and an Ed25519 signature checked with the
# `usign` that ships with OpenWrt. An update that fails its health check is rolled back automatically.

# --- filled in by scripts/release.mjs ------------------------------------------------------------
LUMEN_PUBKEY='__LUMEN_PUBKEY__'
LUMEN_DEFAULT_BASE='__LUMEN_BASE__'
# -------------------------------------------------------------------------------------------------

STATE=/usr/share/lumen
TMP=                             # private work directory, created by new_tmp
JOBDIR=/tmp/lumen-self           # outside /tmp/lumen so it survives an uninstall
SELF="$0"

say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# A fresh private directory for downloads and unpacking (never a fixed /tmp path).
new_tmp() {
	TMP=$(mktemp -d /tmp/lumen-install.XXXXXX) || die "cannot create a temporary directory"
	trap cleanup EXIT   # set here too: `job` runs commands in a subshell, which does not inherit traps
}
cleanup() { [ -n "${LUMEN_RUN:-}" ] && rm -f "$LUMEN_RUN"; [ -n "${TMP:-}" ] && rm -rf "$TMP"; }

# When started from a file, run from a private copy: the update/uninstall replaces or deletes this very script.
if [ "${LUMEN_REEXEC:-}" != 1 ] && [ -f "$0" ]; then
	# mktemp: a fresh file only root can have created (a fixed /tmp name could be a planted symlink)
	RUN=$(mktemp /tmp/lumen-manage.XXXXXX 2>/dev/null) && cp "$0" "$RUN" 2>/dev/null && LUMEN_REEXEC=1 LUMEN_RUN="$RUN" exec sh "$RUN" "$@"
fi
# on exit (also after an error) remove the private copy and the work directory
trap cleanup EXIT

base_url() {
	if [ -n "${LUMEN_BASE:-}" ]; then echo "$LUMEN_BASE"; return; fi
	b=$(uci -q get lumen.update.url 2>/dev/null)
	echo "${b:-$LUMEN_DEFAULT_BASE}"
}

fetch() { # url dest
	uclient-fetch -q -T 30 -O "$2" "$1" 2>/dev/null || wget -q -T 30 -O "$2" "$1" 2>/dev/null
}

json() { jsonfilter -i "$1" -e "@.$2" 2>/dev/null; }

installed_version() { [ -f "$STATE/version.json" ] && json "$STATE/version.json" version; }

# true when $1 is a newer version than $2 (numeric, dot separated)
ver_gt() {
	awk -v a="$1" -v b="$2" 'BEGIN {
		na = split(a, x, /[.-]/); nb = split(b, y, /[.-]/); n = (na > nb ? na : nb)
		for (i = 1; i <= n; i++) { if ((x[i] + 0) > (y[i] + 0)) exit 0; if ((x[i] + 0) < (y[i] + 0)) exit 1 }
		exit 1 }'
}

restart_services() { # $1 = also restart rpcd (1/0)
	[ "$1" = 1 ] && /etc/init.d/rpcd restart >/dev/null 2>&1
	/etc/init.d/lumen-history enable >/dev/null 2>&1
	/etc/init.d/lumen-history restart >/dev/null 2>&1
}

# The panel answers on this router. The web server may be uhttpd or nginx (luci-nginx, pulled in by
# some apps such as Speedify), and may redirect HTTP to HTTPS with a self-signed certificate.
serves_panel() { uclient-fetch -q -T 5 --no-check-certificate -O - "$1" 2>/dev/null | grep -q '<title>Lumen'; }

healthy() {
	i=0
	while [ $i -lt 15 ]; do
		if ubus call lumen stats >/dev/null 2>&1 && [ -f /www/lumen/index.html ] &&
			{ serves_panel http://127.0.0.1/lumen/ || serves_panel https://127.0.0.1/lumen/; }; then
			return 0
		fi
		i=$((i + 1)); sleep 1
	done
	return 1
}

# ---------------------------------------------------------------------------------------------------
cmd_check() {
	new_tmp
	fetch "$(base_url)/latest.json" "$TMP/latest.json" || { rm -rf "$TMP"; die "could not download $(base_url)/latest.json (no Internet or DNS?)"; }
	latest=$(json "$TMP/latest.json" version); cur=$(installed_version); rm -rf "$TMP"
	say "installed: ${cur:-none}"; say "latest:    $latest"
	if [ -z "$cur" ] || ver_gt "$latest" "$cur"; then say "an update is available"; else say "up to date"; fi
}

cmd_status() {
	cur=$(installed_version)
	[ -n "$cur" ] || { say "Lumen is not installed through the installer (no $STATE/version.json)."; return 1; }
	say "Lumen $cur"; say "update source: $(base_url)"
	say "files: $(wc -l < "$STATE/files.list") | collector: $(/etc/init.d/lumen-history running >/dev/null 2>&1 && echo running || echo stopped)"
}

do_rollback() {
	say "Rolling back to the previous version..."
	if [ "$HAD_PREV" = 1 ] && [ -f "$STATE/backup.tar.gz" ]; then
		rm -rf /www/lumen; [ -d /www/lumen.old ] && mv /www/lumen.old /www/lumen
		# files the new release added that the old one did not have
		grep -vxFf "$STATE/files.list" "$TMP/stage/MANIFEST" 2>/dev/null | while read -r p; do rm -f "/$p"; done
		tar -xzf "$STATE/backup.tar.gz" -C / 2>/dev/null
		restart_services 1
		say "Previous version restored."
	else
		say "No backup available (first installation): removing the partial installation."
		cmd_uninstall_files keep
	fi
}

cmd_install() { # [--force] ; used for both install and update
	force=0; [ "$1" = --force ] && force=1
	[ "$(id -u)" = 0 ] || die "run as root"
	command -v ubus >/dev/null && [ -x /etc/init.d/rpcd ] && { [ -x /etc/init.d/uhttpd ] || [ -x /etc/init.d/nginx ]; } || die "this does not look like OpenWrt (ubus, rpcd or a web server missing)"
	command -v usign >/dev/null || die "usign is required to verify the download (it ships with OpenWrt)"
	BASE=$(base_url)
	new_tmp; mkdir "$TMP/stage" || die "cannot create $TMP/stage"
	# handed over by an older installer: remove its work directory (only ever one of ours)
	case "${LUMEN_HANDOVER:-}" in /tmp/lumen-install.??????) rm -rf "$LUMEN_HANDOVER" ;; esac

	say "Looking for the latest release at $BASE ..."
	fetch "$BASE/latest.json" "$TMP/latest.json" || die "could not download $BASE/latest.json (no Internet or DNS?)"
	NEW=$(json "$TMP/latest.json" version); FILE=$(json "$TMP/latest.json" tarball); SUM=$(json "$TMP/latest.json" sha256)
	[ -n "$NEW" ] && [ -n "$FILE" ] && [ -n "$SUM" ] || die "release metadata is incomplete"
	case "$FILE" in */* | *..*) die "unexpected tarball name: $FILE" ;; esac

	CUR=$(installed_version)
	if [ -n "$CUR" ] && [ $force = 0 ] && ! ver_gt "$NEW" "$CUR"; then say "Lumen $CUR is already up to date."; rm -rf "$TMP"; return 0; fi
	say "Downloading Lumen $NEW ..."
	fetch "$BASE/$FILE" "$TMP/$FILE" && fetch "$BASE/$FILE.sig" "$TMP/$FILE.sig" || die "download failed"

	[ "$(sha256sum "$TMP/$FILE" | cut -d' ' -f1)" = "$SUM" ] || die "checksum mismatch: the download is corrupt or has been tampered with"
	# After the first install the key we pinned then is the one that must sign updates.
	if [ -f "$STATE/release-key.pub" ]; then KEY="$STATE/release-key.pub"; else KEY="$TMP/release-key.pub"; printf '%s\n' "$LUMEN_PUBKEY" > "$KEY"; fi
	usign -V -m "$TMP/$FILE" -p "$KEY" >/dev/null 2>&1 || die "signature check failed: this release is not signed by the Lumen release key"
	say "Checksum and signature verified."

	tar -xzf "$TMP/$FILE" -C "$TMP/stage" 2>/dev/null || die "could not unpack the release"
	[ -f "$TMP/stage/MANIFEST" ] && [ -d "$TMP/stage/root" ] || die "the release has an unexpected layout"
	while read -r p; do
		case "$p" in
			www/lumen/* | usr/share/rpcd/ucode/lumen | usr/share/rpcd/acl.d/lumen.json | usr/libexec/lumen/* | etc/init.d/lumen-history | etc/config/lumen | usr/bin/lumen) ;;
			*) die "release wants to write outside Lumen's own paths: $p" ;;
		esac
		case "$p" in *..*) die "bad path in release: $p" ;; esac
	done < "$TMP/stage/MANIFEST"

	# Hand over to the installer shipped in this (verified) release, so that fixes to the install steps
	# themselves (the health check, for example) already apply to this update and not only to the next.
	nm="$TMP/stage/root/usr/libexec/lumen/manage.sh"
	if [ -z "$LUMEN_HANDOVER" ] && [ -f "$nm" ] && ! cmp -s "$nm" "$SELF" 2>/dev/null; then
		cp "$nm" "$TMP/manage-next.sh" || die "could not stage the new installer"
		say "Continuing with the installer of Lumen $NEW ..."
		if [ $force = 1 ]; then LUMEN_HANDOVER="$TMP" LUMEN_REEXEC=1 exec sh "$TMP/manage-next.sh" install --force; fi
		LUMEN_HANDOVER="$TMP" LUMEN_REEXEC=1 exec sh "$TMP/manage-next.sh" install
	fi

	avail=$(df -k /usr 2>/dev/null | awk 'NR==2 {print $4}'); [ "${avail:-99999}" -gt 4096 ] || die "not enough free space on /usr (need ~4 MB)"

	# --- back up what is installed now, then swap in the new files
	mkdir -p "$STATE"; rm -f "$STATE/backup.tar.gz"
	[ -f "$STATE/files.list" ] && HAD_PREV=1 || HAD_PREV=0
	[ -f "$STATE/files.list" ] && tar -czf "$STATE/backup.tar.gz" -C / -T "$STATE/files.list" 2>/dev/null
	pl_old=$(md5sum /usr/share/rpcd/ucode/lumen /usr/share/rpcd/acl.d/lumen.json 2>/dev/null | cut -d' ' -f1 | tr -d '\n')
	say "Installing Lumen $NEW ..."
	rm -rf /www/lumen.old; [ -d /www/lumen ] && mv /www/lumen /www/lumen.old
	mkdir -p /www && cp -a "$TMP/stage/root/www/lumen" /www/lumen || { do_rollback; die "could not copy the web files"; }
	while read -r p; do
		case "$p" in www/lumen/*) continue ;; etc/config/lumen) [ -e /etc/config/lumen ] && continue ;; esac
		mkdir -p "/$(dirname "$p")"
		rm -f "/$p.new"; cp -a "$TMP/stage/root/$p" "/$p.new" && mv "/$p.new" "/$p" || { do_rollback; die "could not install /$p"; }
	done < "$TMP/stage/MANIFEST"
	# first install: record the files now so a failed health check can clean them up
	[ $HAD_PREV = 0 ] && cp "$TMP/stage/MANIFEST" "$STATE/files.list"

	pl_new=$(md5sum /usr/share/rpcd/ucode/lumen /usr/share/rpcd/acl.d/lumen.json 2>/dev/null | cut -d' ' -f1 | tr -d '\n')
	[ "$pl_old" != "$pl_new" ] && rp=1 || rp=0
	restart_services $rp
	if ! healthy; then do_rollback; die "the new version failed its health check and was rolled back"; fi

	# success: only now does the install record change (a rollback must leave it untouched)
	if [ $HAD_PREV = 1 ]; then grep -vxFf "$TMP/stage/MANIFEST" "$STATE/files.list" | while read -r p; do rm -f "/$p"; done; fi
	cp "$TMP/stage/MANIFEST" "$STATE/files.list"
	[ -f "$STATE/release-key.pub" ] || cp "$KEY" "$STATE/release-key.pub"
	printf '{"version":"%s","installed":%s,"base":"%s"}\n' "$NEW" "$(date +%s)" "$BASE" > "$STATE/version.json"

	rm -rf /www/lumen.old "$TMP" /tmp/lumen-manage-next.sh  # (the last one: left by 0.20.1)
	ip=$(ubus call network.interface.lan status 2>/dev/null | jsonfilter -e '@["ipv4-address"][0].address' 2>/dev/null)
	say "Lumen $NEW is installed.  Open http://${ip:-<router-ip>}/lumen/"
	[ $rp = 1 ] && say "(rpcd was restarted: sign in again if the page was open.)"
	return 0
}

# remove everything listed in files.list; $1 = keep|purge (settings)
cmd_uninstall_files() {
	/etc/init.d/lumen-history stop >/dev/null 2>&1; /etc/init.d/lumen-history disable >/dev/null 2>&1
	nft delete table inet lumen >/dev/null 2>&1
	if [ -f "$STATE/files.list" ]; then
		while read -r p; do case "$p" in etc/config/lumen | www/lumen/*) continue ;; esac; rm -f "/$p"; done < "$STATE/files.list"
	fi
	rm -rf /www/lumen /www/lumen.old /usr/libexec/lumen /tmp/lumen /usr/bin/lumen
	if [ "$1" = purge ]; then rm -f /etc/config/lumen; rm -rf "$STATE"
	else rm -f "$STATE/files.list" "$STATE/version.json" "$STATE/backup.tar.gz" "$STATE/release-key.pub"; rmdir "$STATE" 2>/dev/null; fi
}

# The web terminal is the user's own choice and stays installed, but it must not keep pointing at
# Lumen's login script: back to the stock login. If Lumen had it behind nginx (no TCP port open),
# turn it off rather than opening a port the user never had.
terminal_unhook() {
	rm -f /etc/nginx/conf.d/lumen-terminal.locations 2>/dev/null && [ -x /etc/init.d/nginx ] && /etc/init.d/nginx reload >/dev/null 2>&1
	if [ -f /etc/lumen/ttyd.crt ]; then   # Lumen's PEM copy of the certificate: the terminal goes back to plain HTTP
		for s in $(uci -q show ttyd | sed -n "s/^ttyd\.\([^.=]*\)=ttyd$/\1/p"); do
			[ "$(uci -q get ttyd.$s.ssl_cert)" = /etc/lumen/ttyd.crt ] && { uci -q delete ttyd.$s.ssl; uci -q delete ttyd.$s.ssl_cert; uci -q delete ttyd.$s.ssl_key; }
		done
		rm -f /etc/lumen/ttyd.crt /etc/lumen/ttyd.key; rmdir /etc/lumen 2>/dev/null
	fi
	for s in $(uci -q show ttyd | sed -n "s/^ttyd\.\([^.=]*\)=ttyd$/\1/p"); do
		[ "$(uci -q get ttyd.$s.command)" = /usr/libexec/lumen/term-login.sh ] || continue
		uci set ttyd.$s.command=/bin/login; uci -q delete ttyd.$s.url_arg
		if [ "$(uci -q get ttyd.$s.interface)" = /var/run/lumen-ttyd.sock ]; then
			uci set ttyd.$s.enable=0; say "The web terminal was turned off (it was only reachable through Lumen)."
		fi
		uci commit ttyd; /etc/init.d/ttyd restart >/dev/null 2>&1
	done
}

cmd_uninstall() { # [--purge]
	[ "$(id -u)" = 0 ] || die "run as root"
	[ -f "$STATE/files.list" ] || die "no installation record found ($STATE/files.list): Lumen was not installed with this tool"
	purge=keep; [ "$1" = --purge ] && purge=purge
	say "Removing Lumen ..."
	terminal_unhook
	cmd_uninstall_files $purge
	/etc/init.d/rpcd restart >/dev/null 2>&1
	if [ $purge = purge ]; then say "Lumen and all its settings were removed."
	else say "Lumen was removed. Your settings were kept in /etc/config/lumen (use --purge to delete them)."; fi
	say "LuCI, if installed, is untouched."
}

# Run another command as a background job whose progress the web UI can follow (used by the rpcd plugin).
cmd_job() {
	mkdir -p "$JOBDIR"; echo running > "$JOBDIR/state"; echo "lumen $*" > "$JOBDIR/cmd"; date +%s > "$JOBDIR/started"
	: > "$JOBDIR/log"; rm -f "$JOBDIR/code" "$JOBDIR/ended"
	( dispatch "$@" ) >> "$JOBDIR/log" 2>&1
	code=$?
	echo $code > "$JOBDIR/code"; date +%s > "$JOBDIR/ended"; echo done > "$JOBDIR/state"
	return $code
}

dispatch() {
	action=${1:-install}; [ $# -gt 0 ] && shift
	case "$action" in
		install | update) cmd_install "$@" ;;
		check)     cmd_check ;;
		status)    cmd_status ;;
		uninstall) cmd_uninstall "$@" ;;
		job)       cmd_job "$@" ;;
		*) say "usage: lumen status | check | update [--force] | uninstall [--purge]"; exit 2 ;;
	esac
}

dispatch "$@"
