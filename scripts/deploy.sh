#!/usr/bin/env bash
# Build Lumen and copy it to a router running OpenWrt (uhttpd serves /www).
#   LUMEN_HOST=192.168.1.1 LUMEN_PASS=... npm run deploy
# Prefers SSH keys; falls back to sshpass if LUMEN_PASS is set. Nothing is stored.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${LUMEN_HOST:?set LUMEN_HOST (router IP)}"
USER_="${LUMEN_USER:-root}"
DEST="/www/lumen"

SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
if [[ -n "${LUMEN_PASS:-}" ]]; then
  command -v sshpass >/dev/null || { echo "sshpass needed when using LUMEN_PASS" >&2; exit 1; }
  export SSHPASS="$LUMEN_PASS"
  SSH=(sshpass -e "${SSH[@]}")
fi

[[ "${SKIP_BUILD:-}" == 1 ]] || npm run build --silent

echo "→ uploading to $USER_@$HOST:$DEST"
# Upload to a staging dir and swap, so a failed transfer never leaves a half-written panel.
tar -C dist -cf - . | "${SSH[@]}" "$USER_@$HOST" \
  "rm -rf ${DEST}.new && mkdir -p ${DEST}.new && tar -xf - -C ${DEST}.new && rm -rf ${DEST}.old && { [ ! -d ${DEST} ] || mv ${DEST} ${DEST}.old; } && mv ${DEST}.new ${DEST} && rm -rf ${DEST}.old"

# Router-side pieces: rpcd plugin + ACL (topology/stats/history data) and the traffic-history collector.
# rpcd is restarted only when its files changed, because a restart invalidates every login session.
rpcd_changed=0; collector_changed=0
install_remote() {   # install_remote <src> <dst> <mode> <flag-var> [only-if-missing]
  local src="$1" dst="$2" mode="$3" flag="$4" keep="${5:-}" l r
  if [[ -n "$keep" ]] && "${SSH[@]}" "$USER_@$HOST" "[ -e $dst ]"; then return; fi
  l=$(md5sum < "$src" | cut -d' ' -f1)
  r=$("${SSH[@]}" "$USER_@$HOST" "md5sum < $dst 2>/dev/null | cut -d' ' -f1" || true)
  if [[ "$l" != "$r" ]]; then
    "${SSH[@]}" "$USER_@$HOST" "mkdir -p \$(dirname $dst) && cat > $dst.tmp && chmod $mode $dst.tmp && mv $dst.tmp $dst" < "$src"
    echo "→ updated $dst"; printf -v "$flag" 1
  fi
}
install_remote openwrt/rpcd/lumen            /usr/share/rpcd/ucode/lumen        644 rpcd_changed
install_remote openwrt/acl/lumen.json        /usr/share/rpcd/acl.d/lumen.json   644 rpcd_changed
install_remote openwrt/bin/lumen-history.uc  /usr/libexec/lumen/history.uc      644 collector_changed
install_remote openwrt/init/lumen-history    /etc/init.d/lumen-history          755 collector_changed
install_remote openwrt/bin/lumen-pkg-job.sh /usr/libexec/lumen/pkg-job.sh 755 _unused
install_remote openwrt/config/lumen          /etc/config/lumen                  644 _unused keep   # never overwrite user settings
if [[ $rpcd_changed == 1 ]]; then "${SSH[@]}" "$USER_@$HOST" "/etc/init.d/rpcd restart" && echo "→ rpcd restarted (log in again)"; fi
if [[ $collector_changed == 1 ]] || ! "${SSH[@]}" "$USER_@$HOST" "/etc/init.d/lumen-history running" >/dev/null 2>&1; then
  "${SSH[@]}" "$USER_@$HOST" "/etc/init.d/lumen-history enable; /etc/init.d/lumen-history restart" && echo "→ history collector (re)started"
fi

echo "✓ Lumen deployed: http://$HOST/lumen/"
