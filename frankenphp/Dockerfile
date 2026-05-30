ARG FRANKENPHP_VERSION=1
ARG PHP_VERSION=8.3
FROM dunglas/frankenphp:${FRANKENPHP_VERSION}-php${PHP_VERSION}

# Bake in default configs — can still be overridden with volume mounts at runtime
COPY Caddyfile /etc/caddy/Caddyfile
COPY php.ini /usr/local/etc/php/conf.d/wp-performance.ini

# Create expected directories
RUN mkdir -p /etc/frankenphp/Caddyfile.d /var/www /var/log/caddy

# ── Composer ────────────────────────────────────────────────────────────────
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

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
# General WordPress / dev tools:
#   default-mysql-client → mysql / mysqldump (works against MariaDB too)
#   git                  → Composer VCS packages + WP-CLI internals
#   less                 → WP-CLI interactive paging
#   unzip                → WordPress plugin / theme installation
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        default-mysql-client \
        git \
        imagemagick \
        less \
        libavif-bin \
        optipng \
        unzip \
        webp \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g pnpm \
    && rm -rf /var/lib/apt/lists/*

# ── PHP extensions ───────────────────────────────────────────────────────────
# install-php-extensions (bundled in FrankenPHP) auto-handles every apt
# dependency, so no manual -dev package dance is needed.
#
#   bcmath   → arbitrary-precision math (many WP plugins / WooCommerce)
#   exif     → reads EXIF metadata from uploaded images
#   gd       → built-in WordPress image editor fallback
#   imagick  → preferred WordPress image editor (ImageMagick binding)
#   intl     → Unicode / locale support (Polylang, WPML, etc.)
#   opcache  → bytecode cache — critical for PHP performance
#   redis    → Redis / Valkey object-cache support
#   zip      → ZIP read/write (plugin & theme installs, backup plugins)
RUN install-php-extensions \
    bcmath \
    exif \
    gd \
    imagick \
    intl \
    opcache \
    redis \
    zip

# ── WP-CLI ──────────────────────────────────────────────────────────────────
# php --info verifies the phar is valid before it is moved into place.
RUN curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
        -o /tmp/wp-cli.phar \
    && php /tmp/wp-cli.phar --info \
    && mv /tmp/wp-cli.phar /usr/local/bin/wp \
    && chmod +x /usr/local/bin/wp
