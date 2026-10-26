#!/usr/bin/env bash
# Dùng: verify-migration.sh <report.json> <lệnh mysql, đọc SQL từ stdin>
#   VD dev: verify-migration.sh report.json "docker exec -i wd-dev-mysql mysql -uroot -pdevroot wd_m2_check"
set -euo pipefail
report=$1; mysqlcmd=$2; tmp=$(mktemp -d)
q() { echo "$1" | $mysqlcmd --default-character-set=utf8mb4 -B -N 2>/dev/null; }
q "select owner_key,headword,coalesce(display_form,''),kind,coalesce(topic_slug,''),coalesce(level_number,''),coalesce(order_index,''),coalesce(category,''),meaning_vi,coalesce(phonetic,''),coalesce(part_of_speech,''),coalesce(example,''),coalesce(cefr,'') from vocabularies" > "$tmp/v"
q "select unique_key,level_number,difficulty,target_count,coalesce(min_missing,''),coalesce(max_missing,''),coalesce(fall_speed,0),coalesce(spawn_interval,''),coalesce(max_concurrent,'') from levels" > "$tmp/l"
q "select rules from game_config" > "$tmp/r"
node "$(dirname "$0")/verify-migration.mjs" --report "$report" --vocab "$tmp/v" --levels "$tmp/l" --rules "$tmp/r"
