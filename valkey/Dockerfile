ARG VALKEY_VERSION=8
FROM valkey/valkey:${VALKEY_VERSION}-alpine

# Bake in default config — can still be overridden with a volume mount
COPY valkey.conf /etc/valkey/valkey.conf

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
    CMD valkey-cli ping | grep -q PONG

CMD ["valkey-server", "/etc/valkey/valkey.conf"]
