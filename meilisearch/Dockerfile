ARG MEILISEARCH_VERSION=1.13
FROM getmeili/meilisearch:v${MEILISEARCH_VERSION}

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD curl -sf http://localhost:7700/health | grep -q '"status":"available"'
