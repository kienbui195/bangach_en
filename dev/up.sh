#!/usr/bin/env bash
# Dựng (hoặc cập nhật) môi trường chạy thử ở laptop bằng Docker, nạp sẵn dữ liệu game, tự khai báo game vào hub.
#   bash dev/up.sh            dựng/cập nhật (build lại image theo code hiện tại)
#   bash dev/up.sh down       tắt (giữ dữ liệu)
#   bash dev/up.sh reset      tắt và XÓA dữ liệu thử (database, sao lưu, tài khoản hub)
# Dữ liệu mẫu: file migrate.sql do script chuyển dữ liệu sinh ra (mặc định bản mới nhất trong MyDocs); đặt SEED_SQL=... để đổi.
set -euo pipefail
cd "$(dirname "$0")"
DC="docker compose -f compose.yaml"

case "${1:-up}" in
  down) $DC down; exit 0 ;;
  reset) $DC down -v; rm -rf .data .env hub-games; echo "Đã xóa dữ liệu thử."; exit 0 ;;
  up) ;;
  *) echo "Dùng: up.sh [up|down|reset]"; exit 1 ;;
esac

mkdir -p .data/backups .data/uploads .data/hub/games
if [ ! -f .env ]; then
  printf 'ADMIN_API_TOKEN=%s\nDEV_UID=%s\nDEV_GID=%s\n' "$(openssl rand -hex 24)" "$(id -u)" "$(id -g)" > .env
fi
set -a; . ./.env; set +a

# Game tự khai báo vào hub bằng file JSON (cách các agent khác cũng dùng).
printf '{"key":"worddefender","name":"WordDefender","baseUrl":"http://worddefender-api:3000","token":"%s"}' "$ADMIN_API_TOKEN" > .data/hub/games/worddefender.json

$DC up -d --build --wait

topics=$(docker exec wd-dev-mysql-app mysql -uroot -pdev -N -e "select count(*) from worddefender.topics" 2>/dev/null || echo 0)
if [ "${topics:-0}" = 0 ]; then
  seed=${SEED_SQL:-$(ls -t "$HOME"/Documents/MyDocs/Games/WordDefender/backup/m2-*/migrate.sql 2>/dev/null | head -1 || true)}
  if [ -n "$seed" ] && [ -f "$seed" ]; then
    docker exec -i wd-dev-mysql-app mysql -uroot -pdev --default-character-set=utf8mb4 worddefender < "$seed" 2>/dev/null
    echo "Đã nạp dữ liệu mẫu từ $seed"
  else
    echo "Chưa có dữ liệu mẫu (đặt SEED_SQL=đường-dẫn-migrate.sql). Game dùng dữ liệu có sẵn trong code."
  fi
fi

echo
echo "Giao diện game : http://127.0.0.1:3402"
echo "Máy chủ game   : http://127.0.0.1:3401/api/content"
echo "Hub quản trị   : http://127.0.0.1:3400"
if [ -f .data/hub/setup-token ]; then
  echo "Lần đầu vào hub: tạo tài khoản admin ở trang thiết lập, mã thiết lập một lần: $(cat .data/hub/setup-token)"
else
  echo "Hub đã có tài khoản admin. Quên mật khẩu thì: bash dev/up.sh reset"
fi
echo "Xem log: docker compose -f dev/compose.yaml logs -f <worddefender-api|admin-hub|worddefender-web>"
