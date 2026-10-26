#!/usr/bin/env bash
# Dựng ngăn xếp hub + game chạy bằng node trên máy (cổng 3200/3300) với database thử trong container wd-dev-mysql (127.0.0.1:33061). Cần build trước: (cd worddefender-api && npm run build) và (cd admin-hub && npm run build).
# Dựng lại môi trường thử: xóa DB, chạy migration, khởi động lại hub (cổng 3200) và game (cổng 3300).
cd "$(dirname "$0")/.."
mkdir -p /tmp/hub-dev
for f in /tmp/hub-dev/wd.pid /tmp/hub-dev/hub.pid; do [ -f $f ] && kill $(cat $f) 2>/dev/null; done; sleep 1
docker exec wd-dev-mysql mysql -uroot -pdevroot -e "DROP DATABASE IF EXISTS hub_dev; CREATE DATABASE hub_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; DROP DATABASE IF EXISTS worddefender_dev; CREATE DATABASE worddefender_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
(cd admin-hub && DATABASE_URL='mysql://root:devroot@127.0.0.1:33061/hub_dev' npx prisma migrate deploy >/dev/null 2>&1)
(cd worddefender-api && DATABASE_URL='mysql://root:devroot@127.0.0.1:33061/worddefender_dev' npx prisma migrate deploy >/dev/null 2>&1)
rm -f /tmp/hub-dev/setup-token /tmp/hub-dev/*.log
nohup env DATABASE_URL='mysql://root:devroot@127.0.0.1:33061/worddefender_dev' PORT=3300 BACKUP_DIR=/tmp/hub-dev/backups BACKUP_AUTO=off ADMIN_API_TOKEN=tttttttttttttttttttttttttttttttttttttttt node worddefender-api/dist/main.js > /tmp/hub-dev/wd.log 2>&1 &
echo $! > /tmp/hub-dev/wd.pid
nohup env DATABASE_URL='mysql://root:devroot@127.0.0.1:33061/hub_dev' PORT=3200 HUB_ORIGIN=http://127.0.0.1:3200 COOKIE_SECURE=false HUB_MASTER_KEY_FILE=/tmp/hub-dev/master.key HUB_SETUP_TOKEN_FILE=/tmp/hub-dev/setup-token WEB_DIR=$PWD/admin-hub/web-dist node admin-hub/dist/main.js > /tmp/hub-dev/hub.log 2>&1 &
echo $! > /tmp/hub-dev/hub.pid
for i in $(seq 1 20); do curl -sf http://127.0.0.1:3200/api/auth/status >/dev/null && curl -sf http://127.0.0.1:3300/healthz >/dev/null && break; sleep 1; done
curl -s http://127.0.0.1:3200/api/auth/status; echo
