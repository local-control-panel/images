#!/usr/bin/env bash
# Boot the normal entrypoint and verify PHP over HTTP, not just the CLI.
set -euo pipefail
image=${1:?usage: verify-frankenphp-image.sh IMAGE PLATFORM EXPECTED_PHP_MINOR}
platform=${2:?platform required}
expected_minor=${3:?expected PHP minor required}
probe_dir=$(mktemp -d)
probe_container=""
cleanup() {
  if [ -n "$probe_container" ]; then docker rm -f "$probe_container" >/dev/null 2>&1 || true; fi
  rm -rf "$probe_dir"
}
trap cleanup EXIT
cat > "$probe_dir/probe.caddyfile" <<'CADDY'
http://localhost:8080 {
    root * /var/www/wcp-security-probe
    php_server
}
CADDY
cat > "$probe_dir/version.php" <<'PHP'
<?php
header('Content-Type: application/json');
echo json_encode(['php' => PHP_VERSION, 'minor' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION, 'zts' => PHP_ZTS]);
PHP
chmod 755 "$probe_dir"
chmod 644 "$probe_dir/"*
docker run --rm --platform "$platform" --entrypoint php "$image" /usr/local/share/wcp/check-php-security.php
docker run --rm --platform "$platform" --entrypoint frankenphp "$image" php-cli /usr/local/share/wcp/check-php-security.php
probe_container=$(docker run -d --platform "$platform" \
  --mount "type=bind,source=$probe_dir,target=/var/www/wcp-security-probe,readonly" \
  --mount "type=bind,source=$probe_dir/probe.caddyfile,target=/etc/frankenphp/Caddyfile.d/security-probe.caddyfile,readonly" \
  "$image")
ready=false
for attempt in $(seq 1 30); do
  if docker exec "$probe_container" curl --fail --silent http://localhost/healthcheck >/dev/null \
    && docker exec "$probe_container" curl --fail --silent http://localhost:8080/version.php > "$probe_dir/response.json"; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then docker logs "$probe_container"; exit 1; fi
docker exec "$probe_container" php -r '
require $argv[1];
$data = json_decode(file_get_contents($argv[2]), true, 512, JSON_THROW_ON_ERROR);
if ($data["minor"] !== $argv[3] || !wcpPhpSecurityPatched($data["php"]) || !$data["zts"]) { fwrite(STDERR, "Invalid HTTP PHP runtime\n"); exit(1); }
echo json_encode($data, JSON_UNESCAPED_SLASHES), PHP_EOL;
' /usr/local/share/wcp/check-php-security.php /var/www/wcp-security-probe/response.json "$expected_minor"
