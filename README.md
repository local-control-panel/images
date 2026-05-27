# images

Custom Docker images for the ScreenLoom / WCP hosting stack.

## Images

| Image | Base | Description |
|---|---|---|
| `frankenphp` | `dunglas/frankenphp` | PHP runtime + Caddy web server (WordPress-tuned) |
| `mariadb` | `mariadb` | MariaDB with performance-tuned `conf.d` |
| `valkey` | `valkey/valkey` | Redis-compatible object cache |
| `postgres` | `postgres` | PostgreSQL (official image, no custom build) |

Built for `linux/amd64` and `linux/arm64` (Apple Silicon, AWS Graviton).

## Quick start

```bash
cp .env.example .env
# edit .env — set passwords and adjust versions if needed
node build.mjs            # build all images locally
node build.mjs frankenphp # build one image
node build.mjs --list     # print what would be built
```

## Running services

Each subdirectory has a `docker-compose.yml` for running the service standalone:

```bash
docker compose -f frankenphp/docker-compose.yml up -d
docker compose -f mariadb/docker-compose.yml up -d
docker compose -f valkey/docker-compose.yml up -d
docker compose -f postgres/docker-compose.yml up -d
```

Full stack (all services together):

```bash
docker compose -f stack/docker-compose.yml up -d
```

Local mode (uses locally-built `wcp/*` images):

```bash
docker compose -f stack/docker-compose.yml -f stack/docker-compose.local.yml up -d
```

## GHCR images

Images are automatically built and pushed to `ghcr.io/local-control-panel/*` on every push to `main` that touches relevant files.

```bash
docker pull ghcr.io/local-control-panel/frankenphp:1-php8.3
docker pull ghcr.io/local-control-panel/mariadb:11.4
docker pull ghcr.io/local-control-panel/valkey:8
```

## Version management

Versions are tracked in `versions.json`. A weekly GitHub Actions workflow checks Docker Hub for new releases and opens a PR when updates are found.

To check manually:

```bash
node .github/scripts/check-docker-versions.mjs
```
