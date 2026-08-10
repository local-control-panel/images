# images

Custom Docker images for the WCP hosting stack — each one is a thin wrapper around an official base image with performance-tuned configuration baked in.

## Images

| Image | Base | Description |
|---|---|---|
| `frankenphp` | `dunglas/frankenphp` | PHP runtime + Caddy web server, WordPress-tuned |
| `mariadb` | `mariadb` | MariaDB with performance-tuned `conf.d` |
| `valkey` | `valkey/valkey` | Redis-compatible object cache |
| `postgres` | `postgres` | PostgreSQL (official image, no custom build) |
| `meilisearch` | `getmeili/meilisearch` | Lightweight full-text search engine (Elasticsearch alternative) |

All images are built for `linux/amd64` and `linux/arm64` (Apple Silicon, AWS Graviton, Raspberry Pi).

## Quick start

```bash
cp .env.example .env
# Edit .env — set passwords, adjust versions if needed

node build.mjs            # build all images locally
node build.mjs frankenphp # build one image
node build.mjs --list     # print what would be built, without building
```

## Running services

Each subdirectory has a `docker-compose.yml` for running a service standalone:

```bash
docker compose -f frankenphp/docker-compose.yml up -d
docker compose -f mariadb/docker-compose.yml up -d
docker compose -f valkey/docker-compose.yml up -d
docker compose -f postgres/docker-compose.yml up -d
```

Full stack:

```bash
docker compose -f stack/docker-compose.yml up -d
```

For the per-application FrankenPHP model, Caddy templates, worker policy and
Cloudflare/direct-origin setup, see [frankenphp/README.md](frankenphp/README.md).

Local mode (uses locally-built `wcp/*` images with configs baked in):

```bash
docker compose -f stack/docker-compose.yml -f stack/docker-compose.local.yml up -d
```

## Pre-built images (GHCR)

Images are automatically built and pushed to GitHub Container Registry on every push to `main`:

```bash
docker pull ghcr.io/local-control-panel/frankenphp:1-php8.3
docker pull ghcr.io/local-control-panel/mariadb:11.4
docker pull ghcr.io/local-control-panel/valkey:8
docker pull ghcr.io/local-control-panel/meilisearch:1.13
```

## Version management

All image versions live in `versions.json`. A GitHub Actions workflow runs every Monday, checks Docker Hub for new releases, and opens a PR automatically when updates are found.

To check manually:

```bash
node .github/scripts/check-docker-versions.mjs
```

---

## Contributing

We welcome pull requests. Before opening one, please read the guidelines below — they exist to protect the stability of a production system.

### What we accept

- Bug fixes (misconfiguration, broken healthchecks, incorrect defaults)
- Security improvements (hardening, reducing attack surface)
- Performance tuning backed by benchmarks or clear reasoning
- Support for new PHP versions or updated base image tags

### What we do not accept

- Changes that alter the external API of an image (ports, environment variable names, volume paths) — these are consumed by production services and breaking changes cascade
- Restructuring the repo layout or renaming files — this repo is a submodule and path changes break upstream consumers
- Experimental or "nice to have" features without a clear production use case

### How to open a PR

1. Fork the repo and create a branch from `main`
2. Make the smallest change that solves the problem — one concern per PR
3. Test locally with `node build.mjs` before pushing
4. Describe in the PR body: what the problem is, what you changed, and how you tested it

PRs that touch production-critical configs (Caddyfile, php.ini, MariaDB tuning) will be reviewed carefully and may take longer. We may ask for evidence (benchmarks, logs) before merging.

If you are unsure whether a change is in scope, open an issue first.
