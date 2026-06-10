#!/usr/bin/env bash
# Pre-flight health check for the WCP hosting stack.
# Run before docker compose up to catch common misconfigurations.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE="$SCRIPT_DIR/docker-compose.yml"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; ERRORS=$((ERRORS+1)); }
ERRORS=0

echo "WCP Stack — pre-flight check"
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
    ok "docker-compose.yml found"
else
    fail "docker-compose.yml not found at $COMPOSE"
fi

# 5. Container status (if stack is running)
echo ""
echo "Service status:"
docker compose -f "$COMPOSE" ps 2>/dev/null || warn "Stack is not running"

# 6. Validate compose syntax
if docker compose -f "$COMPOSE" config -q 2>/dev/null; then
    ok "Compose file syntax is valid"
else
    fail "Compose file has syntax errors — run: docker compose -f stack/docker-compose.yml config"
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
    printf '\033[31m%d error(s) found. Fix them before starting the stack.\033[0m\n' "$ERRORS"
    exit 1
else
    printf '\033[32mAll checks passed.\033[0m\n'
fi
