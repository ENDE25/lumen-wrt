#!/bin/sh
# Login command for the web terminal (ttyd), installed as /usr/libexec/lumen/term-login.sh.
# The Lumen panel asks the rpcd plugin for a one-time ticket (only a signed-in root session can) and
# opens ttyd with ?arg=<ticket>. A valid ticket (exists, at most 60 s old) is consumed and opens a root
# shell without a second password prompt. Anything else gets the normal login prompt.
# ttyd passes URL arguments to this script: they are only ever compared, never run or expanded.

DIR=/tmp/lumen/term
t=$1

case "$t" in
	*[!0-9a-f]* | '') t= ;;
esac
if [ ${#t} -eq 32 ] && [ -f "$DIR/$t" ] && [ ! -L "$DIR/$t" ]; then
	made=$(date -r "$DIR/$t" +%s 2>/dev/null)
	rm -f "$DIR/$t"
	now=$(date +%s)
	if [ -n "$made" ] && [ $((now - made)) -ge 0 ] && [ $((now - made)) -le 60 ]; then
		export HOME=/root USER=root LOGNAME=root SHELL=/bin/ash
		cd /root 2>/dev/null || cd /
		exec /bin/ash -l
	fi
fi
exec /bin/login
