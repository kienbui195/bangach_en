# AGENT.md — Nối một game vào dashboard chung (admin.baodom.xyz)

Dành cho agent làm BE của một game mới (`drinking_game_mobile`, `can_goc_toa_do`, …). Đọc hết trước khi code.
Tác giả: chungcake69. Ví dụ chạy thật: `worddefender-api/` (xem `src/admin/`).

## 1. Dashboard làm gì, game làm gì

- Dashboard (`admin-hub`) là cổng chung: đăng nhập một lần, menu liệt kê các game, bấm vào game thì thấy bảng dữ liệu của game đó (xem, thêm, sửa, xóa, nhập/xuất CSV/JSON, thao tác riêng như duyệt/từ chối) và trạng thái (sống/chết, RAM, uptime).
- Dashboard **không** đọc thẳng database của game. Mọi thứ đi qua một cổng HTTP mà **BE của game tự cung cấp**: `/admin-api` ("hợp đồng quản trị", phiên bản 1). Luật nghiệp vụ (kiểm hợp lệ, chặn trùng…) nằm ở BE game, không ở dashboard.
- Dashboard **không** bật/tắt container, không có quyền Docker.
- Dashboard **không biết sẵn** game có bảng gì: nó hỏi `GET /admin-api/meta` rồi vẽ bảng/form theo mô tả. Game mới nói đúng hợp đồng thì dashboard **không phải sửa gì**.

Việc của bạn: (A) làm BE game có `/admin-api` đúng hợp đồng, (B) cấp một token, (C) thả một file khai báo `<khóa>.json`. Xong là game hiện trong dashboard.

## 2. Ba thông số khai báo và cách lấy

File khai báo (JSON, 4 trường):

```json
{ "key": "drinkinggame", "name": "Drinking Game", "baseUrl": "http://drinkinggame-api:3000", "token": "<chuỗi ≥ 32 ký tự>" }
```

| Trường | Là gì | Lấy ở đâu / quy tắc |
|---|---|---|
| `key` | Khóa định danh game, duy nhất, không đổi sau khi đã dùng | Tự đặt. Chữ thường, số, `-` `_`; 2–50 ký tự; bắt đầu bằng chữ. Phải **trùng tên file** (`<key>.json`) |
| `name` | Tên hiện trên menu dashboard | Tự đặt, tối đa 100 ký tự |
| `baseUrl` | Địa chỉ để **dashboard gọi vào BE của bạn trong mạng Docker `appnet`** | `http://<container_name>:<cổng trong container>`, **không có đường dẫn, không có `/` cuối**. `container_name` là tên đặt trong `compose.yaml` của game; cổng là cổng app nghe **bên trong** container (VD `3000`), không phải cổng publish ra `127.0.0.1:310x`. KHÔNG dùng domain công khai |
| `token` | Chìa khóa cho phép dashboard vào `/admin-api` | Bạn tự sinh, ≥ 32 ký tự (xem mục 4). BE game đọc từ biến môi trường `ADMIN_API_TOKEN`; file khai báo chứa **cùng giá trị** |

Hub quét thư mục khai báo mỗi lần mở trang danh sách/trạng thái, nên **không cần khởi động lại hub**. File không hợp lệ, sai token hoặc game chưa chạy thì bị bỏ qua, lần quét sau thử lại. Xóa file **không** gỡ game khỏi hub (gỡ bằng nút trong dashboard).

## 3. Hợp đồng `/admin-api` (phiên bản 1)

Tham chiếu code: `worddefender-api/src/admin/contract.ts` (kiểu dữ liệu), `admin-api.controller.ts` (đường), `admin-token.guard.ts` (bảo vệ), `resources/definitions.ts` (khai báo tài nguyên). Chép cấu trúc, đổi phần nghiệp vụ.

**Bảo vệ (bắt buộc):**
- Mọi đường dưới `/admin-api` đòi `Authorization: Bearer <token>`; so sánh bằng `timingSafeEqual`; chưa cấu hình token (hoặc < 32 ký tự) thì từ chối hết.
- Từ chối yêu cầu mang header `CF-Connecting-IP` hoặc `X-Forwarded-For` (dấu vết đi qua Cloudflare/Caddy).
- Bật CORS cho `/admin-api` là **cấm**.

**Các đường** (`:resource` là `key` của tài nguyên khai ở `meta`):

| Đường | Việc |
|---|---|
| `GET /admin-api/meta` | `{ game:{key,name,version}, contractVersion:1, resources:[…] }`. Mỗi resource: `key, label, kind('collection'\|'singleton'), primaryKey, fields[], allowCreate, allowDelete, actions[], import?{formats,matchKey}`. Mỗi field: `name,label,type('string'\|'text'\|'int'\|'decimal'\|'bool'\|'enum'\|'datetime'\|'json'\|'file'),required,unique,readonly,list,filter,search,sortable,maxLength,enum,hint` |
| `GET /admin-api/health` | `{ status:'ok'\|'error', version, contractVersion, uptimeSec, rssMb, db:'up'\|'down' }`. DB hỏng thì `status:'error'`, `db:'down'` |
| `GET /admin-api/:resource` | Danh sách. Query: `page`, `pageSize` (tối đa 100), `sort=trường:asc\|desc`, `q` (tìm theo các field `search`), `filter[trường]=giá_trị` (chỉ field `filter`). Trả `{ items, total, page, pageSize }` |
| `GET /admin-api/:resource/:id` | Một bản ghi |
| `POST /admin-api/:resource` | Thêm (nếu `allowCreate`) |
| `PUT /admin-api/:resource/:id` | Sửa. Với `singleton`: `PUT /admin-api/:resource` (không id) |
| `DELETE /admin-api/:resource/:id` | Xóa (nếu `allowDelete`) |
| `POST /admin-api/:resource/import?dryRun=true\|false` | Nhập hàng loạt. Thân JSON `{format:'csv'\|'json', content, matchKey?, previewToken?}`. `dryRun=true` (mặc định) chỉ báo cáo và trả `previewToken`; ghi thật (`dryRun=false`) phải kèm token đó; ghi trong **một giao dịch**; tối đa 5000 dòng / 5MB. Báo cáo: `{ dryRun, willCreate, willUpdate, unchanged, rejected:[{row,field,message}], ignoredColumns, previewToken? }` |
| `GET /admin-api/:resource/export?format=csv\|json` | Trả `{ format, filename, count, content }` (nội dung là chuỗi, không phải file nhị phân) |
| `POST /admin-api/:resource/:id/actions/:name`, `POST /admin-api/:resource/actions/:name` | Thao tác riêng khai ở `actions[]` của resource (`target:'record'` hoặc `'resource'`) |

**Lỗi** luôn có dạng `{ "error": { "code": "…", "message": "tiếng Việt, người đọc hiểu được", "fields"?: [{name,message}] } }`. Mã: 401 sai/thiếu token, 404 không có, 409 xung đột, 413 quá lớn, 422 dữ liệu sai (`code:'validation'`, kèm `fields` để dashboard tô đỏ đúng ô).

**Quy tắc:** đừng bao giờ trả token, mật khẩu băm hay khóa bí mật ra trong `items`. Giới hạn thân yêu cầu: lệnh thường 100KB, riêng đường `import` được nới.

## 4. Các bước làm (thứ tự)

1. **Database**: `vps db-create <game>` (tạo database + user riêng, mật khẩu ở `/srv/secrets/<game>.db.env` trên VPS; BE đọc `DATABASE_*`). Mỗi game một database, dùng chung MySQL.
2. **Làm `/admin-api`** theo mục 3. Giữ `ADMIN_API_TOKEN` đọc từ môi trường.
3. **Chạy test** `/admin-api` trên MySQL thật: thiếu token → 401; có `X-Forwarded-For` → 401; `meta`/`health` đúng khuôn; validation trả 422 kèm `fields`; import không có `previewToken` thì bị từ chối.
4. **Sinh token** (chạy trên VPS, **không in ra màn hình hay chat**):
   ```bash
   ssh root@103.77.209.156 'umask 077; printf "ADMIN_API_TOKEN=%s\n" "$(openssl rand -base64 48 | tr -d "=\n")" > /srv/secrets/<game>.admin.env'
   ```
5. **compose.yaml** của game (mẫu: `worddefender-api/compose.yaml`): `container_name: <tên>`, `env_file` gồm `/srv/secrets/<game>.db.env` và `/srv/secrets/<game>.admin.env`, `networks: [appnet]` (external), `ports: ["127.0.0.1:<310x>:<cổng>"]` nếu có API công khai, `mem_limit`, `read_only`, `cap_drop: [ALL]`.
6. **Đưa code lên và chạy**: `rsync` lên `/srv/apps/<game>/` rồi `vps deploy <game>` (`vps restart` KHÔNG nhận image mới).
7. **Khai báo vào hub** (chạy trên VPS; token đọc ngay trên máy chủ, không đi qua chat):
   ```bash
   ssh root@103.77.209.156 python3 - <<'EOF'
   import json
   key, name, base = "<key>", "<Tên hiển thị>", "http://<container_name>:<cổng>"
   token = [l.split("=",1)[1].strip() for l in open(f"/srv/secrets/<game>.admin.env") if l.startswith("ADMIN_API_TOKEN=")][0]
   p = f"/srv/secrets/hub/games/{key}.json"
   json.dump({"key": key, "name": name, "baseUrl": base, "token": token}, open(p, "w"))
   import os; os.chown(p, 1000, 1000); os.chmod(p, 0o600)
   EOF
   ```
   (Thư mục `/srv/secrets/hub/games/` thuộc uid 1000, hub đọc ở `/run/hub/games`.)
8. **Kiểm**: mở https://admin.baodom.xyz, đăng nhập, game phải hiện trên menu với trạng thái xanh. Không hiện thì xem mục 6.

## 5. Điều cấm

- Không đưa `/admin-api` ra Caddy/Cloudflare tunnel. Caddy của game chỉ chuyển đúng các đường công khai (`/api/*`, `/uploads/*`). Đừng thêm route chung chung.
- Không in/ghi token, mật khẩu, khóa master ra chat, log, tài liệu hay commit.
- Không sửa code `admin-hub` để thêm game. Cần hub hỗ trợ thêm kiểu dữ liệu/thao tác thì báo user.
- Không cho dashboard đọc thẳng database của game.
- Không đổi `key` của game đã khai báo (lịch sử thao tác gắn theo khóa).

## 6. Khi game không hiện hoặc đỏ

Hub ghi cảnh báo ra log: `vps logs admin-hub`. Nguyên nhân thường gặp:

| Dấu hiệu | Nguyên nhân |
|---|---|
| `Bỏ qua file khai báo game không hợp lệ` | `key` sai khuôn, thiếu `name`, `baseUrl` có đường dẫn hoặc `/` cuối, token < 32 ký tự |
| `Chưa nhận được game khai báo… sai token` | Token trong file khác `ADMIN_API_TOKEN` của game (hoặc game chưa nạp biến mới: dùng `vps deploy`, không `restart`) |
| `không kết nối được` | `baseUrl` sai tên container/cổng; game chưa chạy; container game chưa nằm trong mạng `appnet` |
| `Phiên bản hợp đồng … chưa được dashboard hỗ trợ` | `contractVersion` khác `1` |
| Hiện nhưng trạng thái đỏ | `/admin-api/health` trả `status:'error'` (DB game hỏng) hoặc quá 3 giây không trả lời |
| 401 dù token đúng | Yêu cầu có `X-Forwarded-For`/`CF-Connecting-IP` (đi vòng qua proxy); dashboard gọi thẳng trong Docker nên không được có header này |

Đổi token: sinh token mới ở bước 4, `vps deploy <game>`, rồi chạy lại bước 7 (hub tự cập nhật khi file đổi).

## 7. Hạ tầng cần biết

- VPS `103.77.209.156` (alias `ssh_vpsgiare_server`), lệnh quản lý `vps` (`source ~/.bashrc`): `status|logs|mem|backup|db-create|db-shell|deploy`.
- Code trên VPS ở `/srv/apps/<game>`, dữ liệu `/srv/data`, bí mật `/srv/secrets`, sao lưu `/srv/backups`.
- Mỗi game: một BE riêng, một database riêng trong MySQL dùng chung, không phụ thuộc game khác.
