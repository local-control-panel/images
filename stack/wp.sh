#!/usr/bin/env bash
# WP-CLI shortcut — runs wp inside the frankenphp container.
#
# Usage:
#   ./stack/wp.sh core version
#   ./stack/wp.sh plugin list
#   ./stack/wp.sh post list --post_type=page
#
# The container must be running: docker compose -f stack/docker-compose.yml up -d

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="$SCRIPT_DIR/docker-compose.yml"

if ! docker compose -f "$COMPOSE" ps frankenphp --status running &>/dev/null; then
    echo "Error: frankenphp container is not running." >&2
    echo "Start the stack first: docker compose -f stack/docker-compose.yml up -d" >&2
    exit 1
fi

exec docker compose -f "$COMPOSE" exec frankenphp wp "$@"
