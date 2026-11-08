# 16. Người mẫu và phông nền

## 1. Mục tiêu

Một kho chung cho cả team để cất **người mẫu** (mỗi người nhiều ảnh: mặt chính diện, toàn thân, các góc) và **phông nền** (bối cảnh). Ở trang **Ảnh AI**, người dùng chọn ngay từ kho thay vì chọn file trên máy mỗi lần, và mô tả của người mẫu / phông nền được tự đưa vào prompt.

## 2. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Phông nền | Kho chung, người mẫu nào cũng dùng được (không gắn theo từng người mẫu) |
| Quyền | Dùng chung cả team. Thêm/sửa/tải ảnh dùng quyền `resource.edit`, xoá dùng `resource.delete` (cùng quyền với Kho tài nguyên, không cần sửa lại vai trò) |
| Ảnh | Lưu trên Cloudinary như ảnh sản phẩm, thư mục `prompt-studio/assets/<kind>/<id>`, tối đa 12 ảnh mỗi mục, nén trên trình duyệt trước khi tải. Ảnh đầu tiên là ảnh đại diện và là ảnh mặc định gửi cho AI |
| Dùng ở đâu | Trang Ảnh AI: ảnh 1 (người mẫu) và ảnh 3 (phông nền, không bắt buộc) chọn từ kho hoặc từ máy. Lựa chọn từ kho được nhớ trên trình duyệt |
| Tải dữ liệu | Tải cả kho một lần (tối đa 1000 mục), lọc ngay trên trình duyệt |

## 3. Màn hình

### `/models` (mục **Người mẫu** trên thanh điều hướng)
- Chuyển giữa **Người mẫu** / **Phông nền** (`?kind=background` trên URL), tìm theo tên, mô tả, thẻ; lọc theo thẻ.
- Lưới thẻ: ảnh đại diện, tên, số ảnh, thẻ. Bấm để mở hộp thoại: bên trái ảnh (xem, tải về, đặt làm đại diện, xoá, kéo thả thêm ảnh), bên phải tên, **mô tả cho AI** (tiếng Anh), thẻ, ghi chú, nút xoá cả mục.
- Thêm mới: nhập tên và mô tả → tạo → hộp thoại chuyển sang phần tải ảnh.

### `/image-prompt` (Ảnh AI)
- Ảnh 1 người mẫu, ảnh 2 sản phẩm, ảnh 3 phông nền (không bắt buộc). Ảnh 1 và 3 có nút **Chọn từ kho** (chọn mục, rồi chọn ảnh nếu mục có nhiều ảnh) và **Tải ảnh về** để có file đính kèm vào ChatGPT/Gemini.
- Prompt thêm `About her: <mô tả người mẫu>`; khi có ảnh 3 thì đổi thành 3 ảnh tham chiếu và đặt người mẫu vào đúng bối cảnh của ảnh 3 (kèm mô tả phông nền và ghi chú thêm).

## 4. Dữ liệu và API

Collection `assets`: `kind` (`model` | `background`), `name` (≤80), `description` (≤1500), `tags` (≤10 thẻ, mỗi thẻ ≤40), `note` (≤1000), `images` (≤12, `{ url, publicId, width, height }`, ảnh đầu là đại diện), `createdBy`, `createdAt`, `updatedAt`. Chỉ mục `{ kind: 1, updatedAt: -1 }`.

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/assets` (`?kind=` tuỳ chọn) | Cả kho, mới sửa trước; `createdBy` là `{ id, displayName }` |
| POST | `/api/assets` | Thêm mục `{ kind, name, description?, tags?, note? }`, trả `{ item }` |
| PATCH | `/api/assets/:id` | Sửa tên, mô tả, thẻ, ghi chú (không đổi loại), trả `{ item }` |
| DELETE | `/api/assets/:id` | Xoá mục và mọi ảnh trên Cloudinary |
| POST | `/api/assets/:id/images` | Tải ảnh (multipart `images`, tối đa 8 ảnh/lần, 10 MB/ảnh), trả `{ item }` |
| DELETE | `/api/assets/:id/images?publicId=` | Xoá một ảnh |
| POST | `/api/assets/:id/cover` | Đặt ảnh làm đại diện `{ publicId }` |

Mọi thao tác ghi đều có trong nhật ký hoạt động, nhóm "Tài nguyên".

## 5. Để sau

- Chọn người mẫu / phông nền ở bước tham chiếu của kế hoạch (Ảnh & video AI) và Video Dola.
- Đưa kho vào file xuất/nhập dữ liệu.
