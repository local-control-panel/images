ARG VALKEY_VERSION=8
FROM valkey/valkey:${VALKEY_VERSION}-alpine

# Bake in default config — can still be overridden with a volume mount
COPY valkey.conf /etc/valkey/valkey.conf

CMD ["valkey-server", "/etc/valkey/valkey.conf"]
