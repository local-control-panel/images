#!/usr/bin/env bash
# WP-CLI shortcut — runs wp inside a running runtime container.
#
# Usage:
#   ./stack/wp.sh core version
#   ./stack/wp.sh plugin list
#   ./stack/wp.sh post list --post_type=page
#
# Targets docker-compose.v2.yml; override with WCP_COMPOSE_FILE.
# Targets the default runtime pool (runtime-fp1-php83) since /var/www is a
# shared bind mount across every pool; override with WCP_RUNTIME_SERVICE if
# a secondary pool (e.g. runtime-fp1-php84) is the one running instead.
#
# The stack must already be running, e.g.:
#   docker compose -f stack/docker-compose.v2.yml up -d

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# `${VAR:?required}` interpolation (MARIADB_ROOT_PASSWORD etc.) needs the
# top-level .env; docker compose only auto-discovers .env in its own CWD,
# not one directory up, so it must be passed explicitly here - mirrors how
# the real remote deploy invokes compose (system2.rs's
# `stack_compose_command`, always `--env-file <path>`).
COMPOSE_ARGS=()
if [ -f "$ROOT/.env" ]; then
    COMPOSE_ARGS+=(--env-file "$ROOT/.env")
fi

COMPOSE="${WCP_COMPOSE_FILE:-$SCRIPT_DIR/docker-compose.v2.yml}"
SERVICE="${WCP_RUNTIME_SERVICE:-runtime-fp1-php83}"

if [ -z "$(docker compose "${COMPOSE_ARGS[@]}" -f "$COMPOSE" ps "$SERVICE" --status running -q 2>/dev/null)" ]; then
    echo "Error: $SERVICE container is not running." >&2
    echo "Start the stack first: docker compose -f $COMPOSE up -d" >&2
    exit 1
fi

exec docker compose "${COMPOSE_ARGS[@]}" -f "$COMPOSE" exec "$SERVICE" wp "$@"
