#!/bin/sh
# Starts Valkey with access control: the `default` user is off and the only
# built-in user is `wcp_admin`, whose password comes from the container
# environment (VALKEY_ADMIN_PASSWORD). Per-site users (`site_<domain>`) are
# added by the operations engine with ACL SETUSER and kept in /data/users.acl;
# this script keeps those lines across restarts and rewrites the other two.
# The file holds SHA-256 hashes, never the plain password.
#
# Run as the container command (`sh /etc/valkey/wcp-valkey-start.sh`) so the
# image's own entrypoint is called last and still drops root privileges.
set -eu

: "${VALKEY_ADMIN_PASSWORD:?VALKEY_ADMIN_PASSWORD is required: Valkey must not run without access control}"

acl=/data/users.acl
tmp="$acl.new"
hash=$(printf '%s' "$VALKEY_ADMIN_PASSWORD" | sha256sum | cut -d' ' -f1)

{
  echo "user default off resetpass resetkeys resetchannels -@all"
  echo "user wcp_admin on #$hash ~* &* +@all"
  if [ -f "$acl" ]; then
    grep -E '^user site_' "$acl" || true
  fi
} > "$tmp"
mv "$tmp" "$acl"
chmod 600 "$acl"

exec docker-entrypoint.sh valkey-server /etc/valkey/valkey.conf
