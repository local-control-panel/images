ARG POSTGRES_VERSION=17
FROM postgres:${POSTGRES_VERSION}-alpine

COPY postgresql.conf /etc/postgresql/postgresql.conf

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=20s \
    CMD pg_isready -U postgres

CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
