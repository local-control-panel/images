# images

Custom Docker images for the WCP hosting stack — each one is a thin wrapper around an official base image with performance-tuned configuration baked in.

## Images

| Image         | Base                   | Description                                                     |
| ------------- | ---------------------- | --------------------------------------------------------------- |
| `frankenphp`  | `dunglas/frankenphp`   | PHP runtime + Caddy web server, WordPress-tuned                 |
| `mariadb`     | `mariadb`              | MariaDB with performance-tuned `conf.d`                         |
| `valkey`      | `valkey/valkey`        | Redis-compatible object cache                                   |
| `postgres`    | `postgres`             | PostgreSQL (official image, no custom build)                    |
| `meilisearch` | `getmeili/meilisearch` | Lightweight full-text search engine (Elasticsearch alternative) |

All images are built for `linux/amd64` and `linux/arm64` (Apple Silicon, AWS Graviton, Raspberry Pi).

## Quick start

```bash
cp .env.example .env
# Edit .env — set passwords; stack image versions come from versions.json

node build.mjs                   # all supported PHP runtimes + data services
node build.mjs frankenphp:8.3     # build one PHP runtime
node build.mjs mariadb valkey     # pull pinned official data-service images
node build.mjs --list             # inspect without building
```

## Running services

Each subdirectory has a `docker-compose.yml` for running a service standalone:

```bash
docker compose -f frankenphp/docker-compose.yml up -d
docker compose -f mariadb/docker-compose.yml up -d
docker compose -f valkey/docker-compose.yml up -d
docker compose -f postgres/docker-compose.yml up -d
```

These join an _external_ `backend` network so several of them can be started
independently and still reach each other. It defaults to `wcp_backend` — the
name `stack/docker-compose.v2.yml` creates under project `wcp` — so starting
one of these alongside an already-running v2 stack lets it join that stack.

Full stack (ingress + PHP-version runtime pools; see
docs/devdocs/runtime-platform/README.md in the control panel repo):

```bash
docker compose -p wcp -f stack/docker-compose.v2.yml up -d
```

For CMS-specific deployment checks and current automation boundaries, see
[stack/README.md](stack/README.md).

## PostgreSQL 18

PostgreSQL uses version 18, with the upstream multi-platform image
pinned in `versions.json`. The stack service is `postgres-18`; both standalone
and stack Compose use `postgres_18_data:/var/lib/postgresql` and
`PGDATA=/var/lib/postgresql/18/docker`.

`node build.mjs postgres` pulls the exact official upstream image; it does not
try to build a missing Dockerfile. The local stack overlay uses that same pin.
Production Compose uses its GHCR mirror, which the image workflow publishes
from the catalog digest rather than from a mutable upstream tag.

For the per-application FrankenPHP model, Caddy templates, worker policy and
Cloudflare/direct-origin setup, see [frankenphp/README.md](frankenphp/README.md).

## Valkey connections

In the full stack, PHP runtime containers can connect to Valkey through
`/run/valkey/valkey.sock`. The socket is shared through a dedicated volume,
mounted read-only in each runtime. Its mode is `777` because each site process
runs under a dedicated UID/GID without supplementary groups; only containers
with the socket volume mounted can reach it.
Access is controlled by ACL (Valkey 9): the `default` user is off and the only
built-in user is `wcp_admin`, whose password is `VALKEY_ADMIN_PASSWORD` (set in
`.env`; the stack deploy generates it). Each site gets its own user
`site_<domain>` from the operations engine (`valkey.provisionSite`) and its own
numbered database (the panel's DB slot, 1-255): the user can read and write only
that database, may `FLUSHDB` and `SCAN` it, and cannot `SELECT` another one, run
`FLUSHALL`, `KEYS`, `CONFIG` or other administrative commands. Users are kept in
`/data/users.acl` (hashed passwords). Point the application's client at the
socket path with the site's user, password and database number.
The control panel talks to Valkey with
`docker exec <valkey> sh /etc/valkey/wcp-valkey-cli.sh <command>`, which reads
the administrator password from the container's own environment.

Valkey also listens on port `6379` on the private `backend` network. This keeps
network clients and control-panel commands working. The standalone Valkey
Compose file uses that network connection; its socket is not shared with
separately started application containers.

Local mode uses locally built FrankenPHP and pinned official data-service
images; prepare them with `node build.mjs`. Each supported PHP runtime is built
with its own catalog tag. Ingress keeps the PHP 8.3 carrier image; its PHP
version does not select a site runtime. Existing images are reused on the same
platform; `--force` rebuilds them. No additional global builder is created.
WCP_INGRESS_D/WCP_RUNTIME_D/WCP_WWW_ROOT/WCP_CADDY_LOG must point at local
sandbox directories (these
replace the real /etc/wcp/*, /var/www, /var/log/caddy host paths a real
managed server would use). Optional PHP pools use `WCP_RUNTIME_84_D` and
`WCP_RUNTIME_85_D` (defaults: `php84`/`php85` below `WCP_RUNTIME_D`).
`WCP_SITE_SERVICES_D` and `WCP_TOOLS_D` default to `site-services` and `tools`
below that same sandbox directory:

```bash
docker compose -p wcp -f stack/docker-compose.v2.yml -f stack/docker-compose.v2.local.yml up -d
```

## Pre-built images (GHCR)

Images are automatically built and pushed to GitHub Container Registry on every push to `main`:

```bash
docker pull ghcr.io/local-control-panel/frankenphp:1-php8.3
docker pull ghcr.io/local-control-panel/mariadb:11.4
docker pull ghcr.io/local-control-panel/valkey:9
docker pull ghcr.io/local-control-panel/meilisearch:1.53.2
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
