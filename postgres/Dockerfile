ARG POSTGRES_VERSION=17
FROM postgres:${POSTGRES_VERSION}-alpine

COPY postgresql.conf /etc/postgresql/postgresql.conf

CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
