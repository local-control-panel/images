# The exact FrankenPHP release to build on. CI passes versions.json's
# images.frankenphp.baseVersion; the published tags keep the major line
# (`1-php8.3`) so runtime pool ids do not change with a minor release.
ARG FRANKENPHP_VERSION=1.13.0
ARG PHP_VERSION=8.3
FROM dunglas/frankenphp:${FRANKENPHP_VERSION}-php${PHP_VERSION}

# ── System packages ─────────────────────────────────────────────────────────
# Grouped into a single apt run to keep layers clean and the package index
# removed at the end.
#
# Image optimisation CLIs:
#   imagemagick → convert/mogrify + Imagick PHP ext dependency
#   libavif-bin → avifenc / avifdec (AVIF encode+decode)
#   optipng     → lossless PNG optimisation
#   webp        → cwebp / dwebp / img2webp (WebP encode+decode)
#
# General WordPress tools:
#   default-mysql-client → mysql / mysqldump (works against MariaDB too)
#   git                  → Composer VCS packages + WP-CLI internals
#   less                 → WP-CLI interactive paging
#   msmtp / msmtp-mta    → sendmail drop-in; config generated at runtime
#                          by /docker-entrypoint.d/10-msmtp.sh
#   unzip                → WordPress plugin / theme installation
#
# Dev tools (Composer, Node.js, pnpm) live in Dockerfile.dev to keep
# this production image lean.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        default-mysql-client \
        git \
        imagemagick \
        less \
        libavif-bin \
        msmtp \
        msmtp-mta \
        optipng \
        s6 \
        unzip \
        util-linux \
        webp \
    && rm -rf /var/lib/apt/lists/*

# ── PHP extensions ───────────────────────────────────────────────────────────
# install-php-extensions (bundled in FrankenPHP) auto-handles every apt
# dependency, so no manual -dev package dance is needed.
#
#   apcu       → in-process user cache. Each site runs in its own FrankenPHP
#                process, so the cache is per site and never shared between
#                tenants; FrankenPHP's threads share it inside that process.
#   bcmath     → arbitrary-precision math (many WP plugins / WooCommerce)
#   excimer    → low-overhead sampling profiler (required by Query Monitor etc.)
#   exif       → reads EXIF metadata from uploaded images
#   gd         → built-in WordPress image editor fallback
#   igbinary   → compact binary serializer (WordPress Site Health optional
#                module); listed before redis so phpredis is built with its
#                igbinary serializer for object-cache plugins
#   imagick    → preferred WordPress image editor (ImageMagick binding)
#   intl       → Unicode / locale support (Polylang, WPML, etc.)
#   mysqli     → MySQL / MariaDB driver WordPress core requires (wpdb uses
#                mysqli only; without it WordPress refuses to start)
#   pcntl      → process control (used by WP-CLI, queue workers)
#   pdo_mysql  → PDO driver for MySQL / MariaDB
#   pdo_pgsql  → PDO driver for PostgreSQL
#   redis-6.3.0 → Redis / Valkey object-cache support (pinned for reproducibility;
#                 6.2.0 fails to build on PHP 8.5 — php_smart_string.h was removed)
#   sockets    → low-level socket API (required by some queue / async plugins)
#   zip        → ZIP read/write (plugin & theme installs, backup plugins)
#
# NOTE: opcache is already compiled into the FrankenPHP base image.
# NOTE: relay (high-perf Redis client) is omitted — commercial license
#       required for production; see cachewerk.com
#
# relay    # high-perf Redis client — commercial license required for production; see cachewerk.com
RUN install-php-extensions \
    apcu \
    bcmath \
    excimer \
    exif \
    gd \
    igbinary \
    imagick \
    intl \
    mysqli \
    pcntl \
    pdo_mysql \
    pdo_pgsql \
    redis-6.3.0 \
    sockets \
    zip \
    # linux-libc-dev is pulled in as a build dependency (e.g. for compiling
    # redis-6.3.0 from source) and never used at runtime. It's just kernel
    # header files, not executable code, but Trivy still flags every kernel
    # CVE against its version string — purge it to cut that noise.
    && apt-get purge -y --auto-remove linux-libc-dev 2>/dev/null || true

# ── WP-CLI ──────────────────────────────────────────────────────────────────
# php --info verifies the phar is valid before it is moved into place. The
# `wp` wrapper adds --allow-root (FrankenPHP runs as root) and prefers the
# WP-CLI managed by the Operations Engine and mounted at /opt/wcp-tools; the
# phar baked in here is the fallback until a host has installed its own.
RUN curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
        -o /tmp/wp-cli.phar \
    && php /tmp/wp-cli.phar --info \
    && mv /tmp/wp-cli.phar /usr/local/bin/wp.phar \
    && chmod +x /usr/local/bin/wp.phar
COPY --chmod=755 wcp-wp /usr/local/bin/wp
# Composer falls back to `git@github.com:` for VCS clones, which hangs/fails
# without a registered SSH key (no SSH auth for anonymous GitHub reads,
# even on public repos). Rewrite it to the anonymous HTTPS remote instead.
RUN git config --global url."https://github.com/".insteadOf git@github.com: \
    && for i in 1 2 3; do wp package install wp-cli/doctor-command:2.3.1 --allow-root && break || sleep 5; [ "$i" = 3 ] && exit 1; done

# Bake in default configs — can still be overridden with volume mounts at runtime
COPY Caddyfile /etc/caddy/Caddyfile
COPY php.ini /usr/local/etc/php/conf.d/wp-performance.ini
COPY caddy-global/ /etc/caddy/caddy-global/

# ── Entrypoint helpers ───────────────────────────────────────────────────────
COPY docker-entrypoint.d/ /docker-entrypoint.d/
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/wcp-entrypoint
RUN chmod +x /docker-entrypoint.d/10-msmtp.sh

# Create expected directories
RUN mkdir -p \
        /etc/frankenphp/Caddyfile.d \
        /etc/msmtprc.d \
        /etc/s6-top/main-caddy \
        /etc/s6-top/site-supervisor \
        /etc/wcp/site-services \
        /var/www \
        /var/log/caddy \
    && printf '#!/bin/sh\nexec frankenphp run --config /etc/caddy/Caddyfile --adapter caddyfile\n' \
        > /etc/s6-top/main-caddy/run \
    && printf '#!/bin/sh\nexec s6-svscan /etc/wcp/site-services\n' \
        > /etc/s6-top/site-supervisor/run \
    && chmod +x /etc/s6-top/main-caddy/run /etc/s6-top/site-supervisor/run

# Fail an image build immediately if its platform Caddy configuration is
# invalid. Per-application Caddyfiles are mounted at runtime and are validated
# by the control plane before activation.
RUN frankenphp validate --config /etc/caddy/Caddyfile --adapter caddyfile

# The upstream image starts FrankenPHP directly and does not execute our
# /docker-entrypoint.d helpers. Run them explicitly, then preserve the normal
# FrankenPHP command.
ENTRYPOINT ["/usr/local/bin/wcp-entrypoint"]
CMD ["s6-svscan", "/etc/s6-top"]
