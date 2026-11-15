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

echo "✓ Lumen deployed: http://$HOST/lumen/"
