# Prompt sinh file CSV từ vựng (dùng với Codex / LLM khác)

Dùng khi cần bổ sung một chặng từ vựng mới cho WordDefender. Mỗi lần chạy sinh **một chặng**
(một `topicSlug`), rồi nạp vào CMS qua plugin **Import / Export** trong admin với *khóa đối chiếu*
= `headword`.

File mẫu gửi kèm cho LLM: `~/Documents/MyDocs/WordDefender/mau-tu-vung.csv`.

## Chỗ cần thay mỗi lần dùng

| Biến | Ví dụ (chặng văn phòng) |
|---|---|
| `{{CHU_DE}}` | tiếng Anh văn phòng và giao tiếp công việc — email, họp hành, báo cáo, quản lý dự án, trao đổi với khách hàng, ước lượng công việc, xử lý vấn đề |
| `{{DOI_TUONG}}` | dân văn phòng / kỹ sư người Việt đi làm công ty có yếu tố nước ngoài |
| `{{TOPIC_SLUG}}` | `van-phong-giao-tiep` |
| `{{CATEGORIES}}` | "Email", "Họp hành", "Báo cáo", "Quản lý dự án", "Khách hàng", "Ước lượng", "Xử lý vấn đề", "Hành chính" |
| `{{VI_DU_TU_DE}}` | meeting, email, report, task |
| `{{VI_DU_TU_KHO}}` | deliverable, stakeholder, escalate, mitigate |
| `{{TEN_FILE}}` | `tu-vung-van-phong-giao-tiep.csv` |

Các chặng đã định:

| topicSlug | Chủ đề | category gợi ý |
|---|---|---|
| `van-phong-giao-tiep` | Email, họp hành, báo cáo, quản lý dự án, khách hàng, ước lượng, xử lý vấn đề | Email · Họp hành · Báo cáo · Quản lý dự án · Khách hàng · Ước lượng · Xử lý vấn đề · Hành chính |
| `it-phat-trien-phan-mem` | Lập trình, code review, kiểm thử, triển khai, hạ tầng, Agile/Scrum, sự cố | Lập trình · Kiểm thử · Triển khai · Hạ tầng · Quy trình · Sự cố · Dữ liệu · Bảo mật |
| `may-mac-det-may` | Vải sợi, công đoạn may, mẫu rập, đơn hàng, kiểm hàng QC, xuất nhập khẩu | Vải sợi · Phụ liệu · Công đoạn may · Mẫu rập · Đơn hàng · Kiểm hàng · Xuất nhập khẩu · Máy móc |

Danh sách này phải khớp hằng số `TOPICS` trong `worddefender-cms/scripts/assign-stages.js`.

## Prompt

```
Sinh cho tôi một file CSV từ vựng tiếng Anh để nạp vào CMS của game học từ vựng
(người chơi nhìn nghĩa tiếng Việt rồi gõ lại từ tiếng Anh).

CHỦ ĐỀ LẦN NÀY: {{CHU_DE}}.
Đối tượng học là {{DOI_TUONG}}. Ưu tiên từ thực sự dùng hằng ngày trong công việc,
không phải từ học thuật.

ĐỊNH DẠNG
- File CSV UTF-8, dòng đầu là tiêu đề, đúng 12 cột theo thứ tự:
  headword,displayForm,kind,ownerKey,topicSlug,levelNumber,category,meaningVi,phonetic,partOfSpeech,example,cefr
- Ô chứa dấu phẩy hoặc dấu nháy kép phải bọc trong "..." và nháy kép bên trong nhân đôi (RFC 4180).
- Không thêm cột nào khác. Không có cột id.
- Xem file mẫu đính kèm để biết chính xác kiểu dữ liệu từng cột.

Ý NGHĨA VÀ RÀNG BUỘC TỪNG CỘT
- headword (bắt buộc): chuỗi người chơi phải gõ. CHỈ chữ cái a-z thường, độ dài 2-24,
  không dấu, không khoảng trắng, không gạch nối, không số.
  Cụm từ thì viết dính và bỏ dấu cách: "follow up" -> "followup", "stand-up" -> "standup".
  Cụm nào viết dính mà vượt 24 ký tự thì BỎ, đừng cắt ngắn.
  Từ dài và cụm từ ghép là từ khó, nên xếp vào các màn cuối (levelNumber lớn).
- displayForm: dạng hiển thị đúng chính tả khi khác headword
  (headword "followup" -> displayForm "follow up"). Giống headword thì ghi lại y hệt.
- kind (bắt buộc): luôn là "word".
- ownerKey (bắt buộc): luôn là "official".
- topicSlug (bắt buộc): luôn là "{{TOPIC_SLUG}}" cho toàn bộ file này.
- levelNumber (bắt buộc): số nguyên 1-15, màn mà từ xuất hiện lần đầu.
- category: nhãn nhóm nhỏ bằng tiếng Việt, dùng đúng trong tập sau:
  {{CATEGORIES}}.
- meaningVi (bắt buộc): nghĩa tiếng Việt ngắn gọn, viết thường, một nghĩa phổ biến nhất
  trong ngữ cảnh công việc, không liệt kê nhiều nghĩa.
- phonetic (bắt buộc): phiên âm IPA kiểu Mỹ, có hai dấu gạch chéo, vd /ˈdedlaɪn/.
- partOfSpeech (bắt buộc): đúng một trong: noun, verb, adjective, adverb, pronoun,
  preposition, conjunction, auxiliary, particle, determiner, interjection, phrase.
- example (bắt buộc): một câu tiếng Anh ngắn (6-14 từ) trong ngữ cảnh công việc thật,
  có chứa từ đó, viết hoa đầu câu, kết thúc bằng dấu chấm.
- cefr (bắt buộc): đúng một trong A1, A2, B1, B2, C1, C2.

SỐ LƯỢNG VÀ PHÂN BỔ
- Tổng 250 từ cho chặng này.
- Chia theo levelNumber 1 đến 15, số từ mỗi màn lần lượt đúng bằng:
  10, 7, 9, 11, 12, 13, 15, 17, 18, 19, 22, 24, 26, 29, 18   (cộng lại = 250)
- Độ khó tăng dần theo levelNumber: màn 1-4 là từ A1-A2 ngắn và cực kỳ thông dụng
  ({{VI_DU_TU_DE}}), màn 5-9 mức A2-B1, màn 10-15 mức B1-B2 ({{VI_DU_TU_KHO}}).
  Từ càng về sau càng dài hơn.
- headword KHÔNG ĐƯỢC TRÙNG trên toàn file.
- Mỗi từ phải thật sự thuộc chủ đề; không nhét từ chung chung (cat, tree, apple...) cho đủ số.

ĐẦU RA
- Chỉ xuất file CSV, tên file: {{TEN_FILE}}
- Không giải thích gì thêm.
- Trước khi trả kết quả, tự kiểm: đúng 12 cột; headword khớp ^[a-z]{2,16}$;
  không trùng headword; partOfSpeech và cefr đúng enum; đếm số dòng theo từng
  levelNumber khớp đúng dãy phân bổ ở trên; tổng 250 dòng.
```

## Sau khi có file

1. Admin → **Import / Export** → chọn `api::vocabulary.vocabulary`, định dạng **CSV**,
   khóa đối chiếu **headword** → *Kiểm tra trước* → *Nạp vào CMS*.
   Nạp lại cùng file là cập nhật, không tạo trùng (lifecycle chặn trùng `ownerKey` + `headword`).
2. `node scripts/assign-stages.js` (xem kế hoạch) rồi `--apply` để dựng chặng/màn và rải từ.
3. `cd ../worddefender && npx tsx scripts/cms-to-stages.ts <url CMS>` để sinh lại
   `src/data/stages.ts` (dữ liệu dự phòng trong code).

## Giới hạn đã biết

`headword` tối đa 24 ký tự (đủ cho `continuousintegration`, `requirementsgathering`).
Trên màn hình hẹp, ô chữ của gạch tự co lại (tối thiểu 10px/ký tự) để từ dài vẫn nằm trong sân.
Cần dài hơn 24 thì phải nới `maxLength` trong
`src/api/vocabulary/content-types/vocabulary/schema.json` **và** kiểm tra lại bề rộng gạch.
