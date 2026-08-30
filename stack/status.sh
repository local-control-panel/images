#!/usr/bin/env bash
# Pre-flight health check for the WCP hosting stack.
# Run before docker compose up to catch common misconfigurations.
#
# Targets docker-compose.v2.yml by default, or docker-compose.yml (v1) if
# that's the stack actually running; override with WCP_COMPOSE_FILE.

set -euo pipefail
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
COMPOSE_NAME="$(basename "$COMPOSE")"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; ERRORS=$((ERRORS+1)); }
ERRORS=0

echo "WCP Stack — pre-flight check ($COMPOSE_NAME)"
echo "────────────────────────────"

# 1. Docker available
if docker info &>/dev/null; then
    ok "Docker is running"
else
    fail "Docker is not running or not installed"
fi

# 2. .env file present
if [ -f "$ROOT/.env" ]; then
    ok ".env file found"
else
    warn ".env file not found — using defaults from .env.example"
fi

# 3. Required .env variables
if [ -f "$ROOT/.env" ]; then
    for var in MARIADB_ROOT_PASSWORD MARIADB_PASSWORD; do
        if grep -q "^${var}=" "$ROOT/.env" 2>/dev/null; then
            ok "$var is set"
        else
            fail "$var is not set in .env"
        fi
    done
fi

# 4. Compose file present
if [ -f "$COMPOSE" ]; then
    ok "$COMPOSE_NAME found"
else
    fail "$COMPOSE_NAME not found at $COMPOSE"
fi

# 5. Container status (if stack is running)
echo ""
echo "Service status:"
docker compose "${COMPOSE_ARGS[@]}" -f "$COMPOSE" ps 2>/dev/null || warn "Stack is not running"

# 6. Validate compose syntax
if docker compose "${COMPOSE_ARGS[@]}" -f "$COMPOSE" config -q 2>/dev/null; then
    ok "Compose file syntax is valid"
else
    fail "Compose file has syntax errors — run: docker compose -f $COMPOSE config"
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
    printf '\033[31m%d error(s) found. Fix them before starting the stack.\033[0m\n' "$ERRORS"
    exit 1
else
    printf '\033[32mAll checks passed.\033[0m\n'
fi
