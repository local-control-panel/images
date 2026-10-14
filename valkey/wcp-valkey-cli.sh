#!/bin/sh
# valkey-cli as the administrator, for operations run with
# `docker exec <valkey> sh /etc/valkey/wcp-valkey-cli.sh <command...>`.
# The password is read from the container's own environment, so it never
# appears in a command line, a request file or a log.
set -eu
: "${VALKEY_ADMIN_PASSWORD:?VALKEY_ADMIN_PASSWORD is not set}"
REDISCLI_AUTH="$VALKEY_ADMIN_PASSWORD"
VALKEYCLI_AUTH="$VALKEY_ADMIN_PASSWORD"
export REDISCLI_AUTH VALKEYCLI_AUTH
exec valkey-cli --user wcp_admin --no-auth-warning "$@"
