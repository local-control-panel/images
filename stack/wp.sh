#!/usr/bin/env bash
# WP-CLI shortcut — runs wp inside a running runtime container.
#
# Usage:
#   ./stack/wp.sh core version
#   ./stack/wp.sh plugin list
#   ./stack/wp.sh post list --post_type=page
#
# Targets docker-compose.v2.yml by default, or docker-compose.yml (v1) if
# that's the stack actually running; override the file with WCP_COMPOSE_FILE.
# On v2 it targets the default runtime pool (runtime-fp1-php83) since
# /var/www is a shared bind mount across every pool; override with
# WCP_RUNTIME_SERVICE if a secondary pool (e.g. runtime-fp1-php84) is the
# one running instead.
#
# The stack must already be running, e.g.:
#   docker compose -f stack/docker-compose.v2.yml up -d

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# Both layouts' `${VAR:?required}` interpolation (MARIADB_ROOT_PASSWORD etc.)
# needs the top-level .env; docker compose only auto-discovers .env in its
# own CWD, not one directory up, so it must be passed explicitly here -
# mirrors how the real remote deploy invokes compose (system2.rs's
# `stack_compose_command`, always `--env-file <path>`).
COMPOSE_ARGS=()
if [ -f "$ROOT/.env" ]; then
    COMPOSE_ARGS+=(--env-file "$ROOT/.env")
fi

resolve_compose_file() {
    local v2="$SCRIPT_DIR/docker-compose.v2.yml"
    local v1="$SCRIPT_DIR/docker-compose.yml"
    if [ -n "${WCP_COMPOSE_FILE:-}" ]; then
        printf '%s' "$WCP_COMPOSE_FILE"
    elif [ -n "$(docker compose "${COMPOSE_ARGS[@]}" -f "$v2" ps -q 2>/dev/null)" ]; then
        printf '%s' "$v2"
    elif [ -n "$(docker compose "${COMPOSE_ARGS[@]}" -f "$v1" ps -q 2>/dev/null)" ]; then
        printf '%s' "$v1"
    else
        printf '%s' "$v2"
    fi
}

COMPOSE="$(resolve_compose_file)"

if [ "$COMPOSE" = "$SCRIPT_DIR/docker-compose.yml" ]; then
    SERVICE="frankenphp"
else
    SERVICE="${WCP_RUNTIME_SERVICE:-runtime-fp1-php83}"
fi

if [ -z "$(docker compose "${COMPOSE_ARGS[@]}" -f "$COMPOSE" ps "$SERVICE" --status running -q 2>/dev/null)" ]; then
    echo "Error: $SERVICE container is not running." >&2
    echo "Start the stack first: docker compose -f $COMPOSE up -d" >&2
    exit 1
fi

exec docker compose "${COMPOSE_ARGS[@]}" -f "$COMPOSE" exec "$SERVICE" wp "$@"
