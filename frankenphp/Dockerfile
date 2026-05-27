ARG FRANKENPHP_VERSION=1
ARG PHP_VERSION=8.3
FROM dunglas/frankenphp:${FRANKENPHP_VERSION}-php${PHP_VERSION}-alpine

# Bake in default configs — can still be overridden with volume mounts at runtime
COPY Caddyfile /etc/caddy/Caddyfile
COPY php.ini /usr/local/etc/php/conf.d/wp-performance.ini

# Create expected directories
RUN mkdir -p /etc/frankenphp/Caddyfile.d /var/www /var/log/caddy
