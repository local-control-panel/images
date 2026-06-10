#!/bin/sh
set -e

# Generate /etc/msmtprc from environment variables if SMTP_HOST is set.
# Required env vars: SMTP_HOST, SMTP_USER, SMTP_PASS
# Optional: SMTP_PORT (default 587), SMTP_FROM (default wordpress@<host>)
if [ -z "$SMTP_HOST" ]; then
    exit 0
fi

cat > /etc/msmtprc <<EOF
defaults
tls on
tls_starttls on
auth on
logfile /proc/1/fd/1

account default
host ${SMTP_HOST}
port ${SMTP_PORT:-587}
from ${SMTP_FROM:-wordpress@${SMTP_HOST}}
user ${SMTP_USER}
password ${SMTP_PASS}
EOF

chmod 600 /etc/msmtprc
echo "[msmtp] configured relay via ${SMTP_HOST}:${SMTP_PORT:-587}"
