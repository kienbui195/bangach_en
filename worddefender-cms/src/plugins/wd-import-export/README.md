# Import / Export (wd-import-export)

Plugin nội bộ cho Bangach Dashboard: xuất nội dung ra JSON/CSV và nạp lại từ file, ngay trong
giao diện admin.

Viết riêng vì plugin cộng đồng `strapi-import-export` không chạy được trên Strapi 5.58: nó đọc
access token ở `localStorage.jwtToken`, trong khi Strapi 5.58 giữ token của admin trong bộ nhớ
(storage chỉ còn cờ `isLoggedIn`), nên request của nó không có header `Authorization` và server
trả 401. Plugin này dùng `useFetchClient()` của chính Strapi nên luôn gửi đúng token.

## Dùng

Admin → menu **Import / Export**.

- **Xuất**: chọn content type + định dạng → tải file về. Chỉ xuất các trường phẳng (bỏ quan hệ,
  component, media) và bỏ luôn trường Strapi tự quản (`id`, `documentId`, `createdAt`…).
- **Nạp**: chọn file hoặc dán nội dung, chọn **khóa đối chiếu**, bấm *Kiểm tra trước* rồi *Nạp vào CMS*.
  - Khóa đối chiếu là trường dùng để nhận ra bản ghi đã có: trùng thì **cập nhật**, không trùng thì
    **tạo mới**. Với từ vựng nên dùng `headword`.
  - *Kiểm tra trước* chạy toàn bộ phép đối chiếu nhưng không ghi gì, cho biết trước sẽ thêm/sửa bao nhiêu.
  - Dòng hỏng không chặn các dòng khác; bảng kết quả chỉ ra số dòng trong file và lý do (kể cả lỗi
    validate theo từng trường).

Định dạng file nạp: mảng JSON `[{...}, {...}]`, object `{"1": {...}}`, hoặc CSV có dòng tiêu đề
(hỗ trợ dấu phẩy và dấu nháy kép trong ô theo RFC 4180). Ô CSV rỗng coi như không khai, không
ghi đè giá trị cũ thành rỗng.

## Cấu hình

`config/plugins.ts`:

```ts
'wd-import-export': {
  enabled: true,
  resolve: './src/plugins/wd-import-export',
  config: { allowedUids: ['api::vocabulary.vocabulary', /* … */] }, // null = mọi content type api::
},
```

## API

Route type `admin` (phải đăng nhập admin), tiền tố `/wd-import-export`:

| Method | Path | Body | Trả về |
|---|---|---|---|
| GET | `/content-types` | — | danh sách uid, trường, khóa đối chiếu dùng được |
| POST | `/export` | `{ uid, format }` | `{ filename, mime, count, content }` |
| POST | `/import` | `{ uid, format, content, keyField, dryRun }` | `{ total, created, updated, failures[] }` |

Mọi thao tác ghi đi qua Document Service nên lifecycle vẫn chạy — ví dụ lifecycle chặn trùng
`(ownerKey, headword)` của `vocabulary`.
