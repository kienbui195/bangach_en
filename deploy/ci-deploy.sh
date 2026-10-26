#!/usr/bin/env bash
# Chạy trên VPS bởi GitHub Actions qua khóa SSH bị giới hạn (authorized_keys: command="/srv/bin/ci-deploy",restrict).
# Kéo code mới nhất của nhánh master về /srv/projects/worddefender, rồi build + chạy lại các dịch vụ có thư mục bị đổi.
# Dùng:  ci-deploy            (chỉ dịch vụ có thay đổi)
#        ci-deploy all        (mọi dịch vụ)
#        ci-deploy rollback   (về commit đã triển khai thành công trước đó)
set -euo pipefail

REPO=/srv/projects/worddefender
STATE=/srv/projects/.worddefender-deployed   # commit đã triển khai thành công gần nhất, và commit trước nó
LOG=/srv/projects/ci-deploy.log
BRANCH=master

# thư mục trong repo -> dịch vụ trong /srv/apps -> cổng kiểm sức khỏe (đường kiểm)
declare -A SERVICE=( [worddefender-api]=worddefender [admin-hub]=admin-hub [worddefender]=worddefender-web )
declare -A CHECK=( [worddefender]="http://127.0.0.1:3101/api/content" [admin-hub]="http://127.0.0.1:3201/api/auth/status" [worddefender-web]="http://127.0.0.1:3102/" )
EXCLUDES=(--exclude node_modules --exclude dist --exclude web-dist --exclude src/generated --exclude '*.tsbuildinfo' --exclude uploads --exclude 'backups' --exclude '.env*' --exclude _tools --exclude '*.log')

exec 9>/srv/projects/.ci-deploy.lock
flock -n 9 || { echo "Đang có một lần triển khai khác, thử lại sau"; exit 1; }
exec > >(tee -a "$LOG") 2>&1
echo "=== $(date -Is) ci-deploy ${1:-} ==="

mode=${SSH_ORIGINAL_COMMAND:-${1:-changed}}
mode=${mode#ci-deploy }
cd "$REPO"
old=$(git rev-parse HEAD 2>/dev/null || echo "")

case "$mode" in
  rollback)
    [ -f "$STATE" ] && prev=$(sed -n 2p "$STATE") && [ -n "$prev" ] || { echo "Chưa có bản trước để quay lại"; exit 1; }
    git reset --hard "$prev"; mode=all ;;
  changed|all|"")
    git fetch --quiet origin "$BRANCH"
    git reset --hard "origin/$BRANCH" ;;
  *) echo "Lệnh không hợp lệ: $mode"; exit 2 ;;
esac
new=$(git rev-parse HEAD)
echo "commit: ${old:0:8} -> ${new:0:8}"

changed_dir() {
  [ "$mode" = all ] || [ -z "$old" ] && return 0
  git diff --name-only "$old" "$new" | grep -q "^$1/"
}

deployed=()
for dir in "${!SERVICE[@]}"; do
  svc=${SERVICE[$dir]}
  if changed_dir "$dir"; then
    echo "--- $dir -> $svc"
    rsync -a --delete "${EXCLUDES[@]}" "$REPO/$dir/" "/srv/apps/$svc/"
    /srv/bin/svc deploy "$svc"
    deployed+=("$svc")
  fi
done

fail=0
for svc in "${deployed[@]}"; do
  ok=0
  for _ in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 3 "${CHECK[$svc]}" || true)
    [ "$code" = 200 ] && { ok=1; break; }
    sleep 2
  done
  if [ "$ok" = 1 ]; then echo "OK   $svc"; else echo "LỖI $svc không khỏe sau khi deploy (${CHECK[$svc]})"; fail=1; fi
done

if [ "$fail" = 0 ]; then
  [ "$old" != "$new" ] && printf '%s\n%s\n' "$new" "$old" > "$STATE"
  echo "Xong: ${#deployed[@]} dịch vụ (${deployed[*]:-không có thay đổi})"
else
  echo "Có dịch vụ lỗi. Quay lại bản trước: ssh ... ci-deploy rollback"
  exit 1
fi
