#!/bin/sh
# Runs one apk operation detached from rpcd and records its progress in /tmp/lumen/pkg.
# usage: pkg-job.sh <update|upgrade|add|del> [package ...]
# Package names are validated by the rpcd plugin before this is called.
D=/tmp/lumen/pkg
mkdir -p "$D"
action=$1; shift

echo running > "$D/state"
echo "apk $action $*" > "$D/cmd"
date +%s > "$D/started"
rm -f "$D/code" "$D/ended"
: > "$D/log"

case "$action" in
	update)  apk update ;;
	upgrade) apk upgrade "$@" ;;
	add)     apk add "$@" ;;
	del)     apk del "$@" ;;
	*)       echo "unsupported action: $action"; false ;;
esac >> "$D/log" 2>&1
code=$?

echo "$code" > "$D/code"
date +%s > "$D/ended"
echo done > "$D/state"
