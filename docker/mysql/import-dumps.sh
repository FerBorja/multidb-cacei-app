#!/usr/bin/env bash
set -euo pipefail
DUMPS_DIR="${1:-./docker/mysql/dumps}"
MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-13306}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASS="${MYSQL_PASS:-rootpass}"

echo "Importando .sql desde $DUMPS_DIR hacia $MYSQL_HOST:$MYSQL_PORT..."
for f in "$DUMPS_DIR"/*.sql; do
  [ -e "$f" ] || continue
  echo "-> $f"
  mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASS" < "$f"
done
echo "Listo."
