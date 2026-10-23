# 10. Kho tài nguyên

## 1. Mục tiêu

Một chỗ chung để cả nhóm cất **skill cho AI** (nội dung SKILL.md, hướng dẫn cho Claude/ChatGPT) và **prompt tạo ảnh** đã cho ra ảnh đẹp, để lần sau tìm lại, copy dùng ngay.

## 2. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Loại | Hai loại: `image` (prompt tạo ảnh, có thêm negative) và `skill` |
| Quyền | Dùng chung cả nhóm như sản phẩm và kế hoạch: ai cũng thêm, sửa, xoá |
| Mục có sẵn | App kèm sẵn vài prompt ảnh thời trang và 2 skill mẫu (trong `client/src/lib/resources.js`), chỉ đọc; bấm "Chép vào kho team để sửa" để có bản sửa được |
| Tải dữ liệu | Tải cả kho một lần (tối đa 1000 mục), lọc ngay trên trình duyệt |

## 3. Màn hình `/resources`

- Mục **Tài nguyên** (chữ 源) trên thanh điều hướng; trên điện thoại nằm trong "Thêm".
- Bộ lọc: tìm theo tên, nội dung, thẻ, công cụ · Loại (Tất cả / Prompt ảnh / Skill) · Thẻ · Nguồn (Của team / Có sẵn). Loại, thẻ, nguồn nằm trên URL.
- Mỗi thẻ: loại, tên, người thêm, công cụ, thẻ (bấm để lọc), ghi chú, nội dung thu gọn. Nút: Copy, Copy + negative (prompt ảnh), Tải `.md` (skill, tên file lấy từ `name:` trong front matter), Mở liên kết, Sửa, Xoá (hỏi Có/Không).
- Thêm/sửa trong hộp thoại: loại, tên, nội dung, negative, công cụ, thẻ (cách nhau dấu phẩy, tối đa 10), liên kết, ghi chú.

## 4. Dữ liệu và API

Collection `resources`: `kind`, `title` (≤200), `content` (≤20000), `negative` (≤5000), `tool` (≤60), `tags` (≤10 thẻ, mỗi thẻ ≤40), `note` (≤1000), `link` (http/https, ≤500), `createdBy`, `createdAt`, `updatedAt`. Chỉ mục `{ kind: 1, updatedAt: -1 }`.

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/resources` | Cả kho, mới sửa trước; `createdBy` là `{ id, displayName }` |
| POST | `/api/resources` | Thêm mục mới, trả `{ item }` |
| PATCH | `/api/resources/:id` | Sửa một phần, trả `{ item }` |
| DELETE | `/api/resources/:id` | Xoá |

## 5. Để sau

- Ảnh mẫu kết quả cho prompt ảnh (tải lên Cloudinary như ảnh sản phẩm).
- Đưa kho vào file xuất/nhập dữ liệu.
