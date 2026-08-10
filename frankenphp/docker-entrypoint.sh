#!/bin/sh
set -eu

for script in /docker-entrypoint.d/*.sh; do
    [ -f "$script" ] || continue
    [ -x "$script" ] || continue
    "$script"
done

exec "$@"
