# FrankenPHP application platform

The platform image is built from this directory and published to GHCR (GitHub
Container Registry) by `.github/workflows/build-push.yml`. Production Compose
uses that image so the configured PHP extensions, WP-CLI and entrypoint helpers
are actually present at runtime.

## Add an application

1. Choose the closest template in `Caddyfile.d/`.
2. Copy it on the host as `/etc/frankenphp/Caddyfile.d/<domain>.caddyfile`.
3. Set the application hostname and its document root under `/var/www`.
4. Add only application-specific CSP, authentication, redirects, cache rules
   and readiness endpoints to that file.
5. Validate and reload the Caddy configuration through the control plane before
   making the site live.

`php-site.caddyfile.example` is the default for normal PHP applications.
`example-site.caddyfile.example` adds the opt-in WordPress safeguards.

## Workers

The global platform configuration intentionally starts no workers. A worker is
enabled only in a particular application's `php_server` block, using the
`worker-site.caddyfile.example` pattern. Its worker script must own the request
loop (`frankenphp_handle_request()`), reset request-scoped state and have a
measured memory/CPU budget. A regular WordPress or framework `index.php` is not
a worker script.

## TLS and real client IPs

Caddy obtains certificates for public domain site blocks by default. Choose the
container-wide `CADDY_TRUSTED_PROXIES` setting according to the network path:

- `off` — direct traffic; never trust forwarded client-IP headers.
- `cloudflare` — trust only Cloudflare's published ranges and prefer
  `CF-Connecting-IP`.
- `private` — only when every direct peer is a trusted private reverse proxy.

The Cloudflare ranges are a build-time snapshot in
`caddy-global/trusted-proxies/cloudflare.caddyfile`; refresh them before
releasing a new platform image.

`/healthcheck` is a container liveness endpoint. It proves that Caddy responds;
it deliberately does not prove that a given application or database is ready.
Define a separate readiness endpoint per application when orchestration needs
that signal.
