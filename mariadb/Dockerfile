ARG MARIADB_VERSION=11.4
FROM mariadb:${MARIADB_VERSION}

# Bake in performance tuning — can still be overridden with volume mounts
COPY conf.d/ /etc/mysql/conf.d/

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=30s \
    CMD healthcheck.sh --connect --innodb_initialized
