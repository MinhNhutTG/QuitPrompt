# 12. Google Drive của team

## 1. Mục tiêu

Một kho file chung trên Google Drive ngay trong app: xem, tìm, tải lên, tải về, tạo thư mục, đổi tên, xoá. Dùng cho video thành phẩm, ảnh gốc, file thiết kế... những thứ quá nặng hoặc không hợp để lưu trên Cloudinary.

## 2. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Drive của ai | **Một tài khoản Google cho cả team.** Quản trị viên kết nối một lần; thành viên không cần đăng nhập Google |
| Phạm vi | Quản trị viên **chọn một thư mục có sẵn** (dán link, ví dụ thư mục “Brother”) hoặc để app tạo thư mục mới (`DRIVE_FOLDER_NAME`). Thành viên chỉ thấy những gì bên trong thư mục này; máy chủ kiểm tra mọi thao tác |
| Quyền Google | `drive` (toàn bộ Drive), để dùng được thư mục có sẵn và thấy cả file thêm từ giao diện Google Drive. Đây là scope “restricted”: app chưa được Google xác minh nên màn hình đồng ý có cảnh báo, quản trị viên bấm qua một lần. Chỉ một tài khoản đăng nhập nên không vướng giới hạn 100 người dùng của app chưa xác minh |
| Thư mục trong Shared drive | Được hỗ trợ |
| File Google Docs/Sheets/Slides | Tải về thành .docx/.xlsx/.pptx |
| Tải lên | Trình duyệt gửi file thẳng lên Google (phiên resumable do máy chủ mở). File lớn không đi qua Render/Vercel. Mặc định tối đa 500 MB mỗi file (`DRIVE_MAX_UPLOAD_MB`) |
| Tải về | Đi qua máy chủ (cần token của team), trình duyệt tự hiện tiến độ |
| Xoá | Vào thùng rác của Drive, khôi phục được trong 30 ngày từ chính Google Drive |
| Quyền trong app | Xem, tìm, tải về: mọi người. `drive.edit` (tải lên, tạo thư mục, đổi tên) và `drive.delete` (xoá): tick theo vai trò ở trang Quản trị. Kết nối/ngắt: chỉ quản trị viên |
| Token | Refresh token lưu trong collection `drivelinks`, mã hoá AES-GCM bằng khoá suy từ `JWT_SECRET`. **Đổi `JWT_SECRET` thì phải kết nối Drive lại** |

## 3. Cài đặt (một lần)

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → tạo project (hoặc dùng project có sẵn).
2. **APIs & Services → Library** → bật **Google Drive API**.
3. **OAuth consent screen**: loại *External*, điền tên app và email. Ở **Data Access** thêm scope `https://www.googleapis.com/auth/drive`. Ở **Branding** điền tên app, email hỗ trợ, email liên hệ và thêm tên miền app vào **Authorized domains** (không tải logo). Rồi ở **Audience** bấm **Publish app** (chuyển sang *In production*); nếu Google gợi ý gửi xác minh thì bỏ qua. Ở chế độ *Testing* refresh token tự hết hạn sau 7 ngày.
4. **Credentials → Create credentials → OAuth client ID**, loại *Web application*. Ở **Authorized redirect URIs** thêm đúng địa chỉ mở app + `/api/drive/callback`:
   - Máy cá nhân: `http://localhost:5173/api/drive/callback`
   - Vercel + Render: `https://<tên-app>.vercel.app/api/drive/callback`
   - Chỉ Render: `https://<tên-app>.onrender.com/api/drive/callback`
5. Đặt biến môi trường trên máy chủ (Render → Environment, hoặc `server/.env`):

   ```
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://<tên-app>.vercel.app/api/drive/callback
   ```

6. Khởi động lại máy chủ, đăng nhập bằng tài khoản quản trị → mục **Google Drive** → **Kết nối Google Drive** → chọn tài khoản Google đang giữ thư mục. Gặp màn hình “Google chưa xác minh ứng dụng này” thì bấm **Nâng cao** → **Đi tới ... (không an toàn)** → Cho phép.
7. Quay về app, dán link thư mục (trong Drive: chuột phải thư mục → Chia sẻ → Sao chép đường liên kết) → **Dùng thư mục này**. Đổi thư mục sau này ở mục “Quản lý kết nối” cuối trang.

Nên dùng một tài khoản Google riêng của team (không phải tài khoản cá nhân), vì mọi file nằm trong dung lượng của tài khoản đó.

## 4. Màn hình `/drive`

- Đường dẫn thư mục (breadcrumb) ở trên; bấm thư mục để vào. Thư mục đang mở nằm trên URL (`?folder=`), gửi link cho đồng đội được.
- Ô tìm: tìm theo tên trong cả kho, kết quả kèm đường dẫn thư mục.
- **Tải file lên** hoặc kéo thả file vào khung danh sách; mỗi file một thanh tiến độ.
- Mỗi dòng: ảnh thu nhỏ (ảnh, video) hoặc biểu tượng, tên, dung lượng, ngày sửa, người tải lên. Nút: Tải về, Đổi tên, Xoá (hỏi Có/Không). Bấm ảnh để xem lớn.
- Quản trị viên: mục “Quản lý kết nối” ở cuối trang để kết nối lại, đổi tài khoản hoặc ngắt.

## 5. API

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/drive/status` | `{ configured, connected, email, folder, connectedAt, maxUploadMb }` |
| POST | `/api/drive/root` | Admin. `{ folder: "<link hoặc id>" }` hoặc `{ create: true }` → `{ folder }` |
| GET | `/api/drive/connect` | Admin. Chuyển sang màn hình đồng ý của Google |
| GET | `/api/drive/callback` | Google gọi về; lưu token (kết nối lại cùng tài khoản thì giữ thư mục đã chọn), về `/drive` |
| POST | `/api/drive/disconnect` | Admin. Thu hồi token, xoá liên kết (file vẫn còn trên Drive) |
| GET | `/api/drive/files?folder=&pageToken=` | Nội dung một thư mục (100 mục/trang), kèm `path` |
| GET | `/api/drive/files?q=` | Tìm theo tên trong cả kho (tối đa 60 kết quả) |
| POST | `/api/drive/folders` | `{ parent, name }` → `{ item }` |
| POST | `/api/drive/uploads` | `{ parent, name, mimeType, size }` → `{ uploadUrl }`; trình duyệt `PUT` file vào `uploadUrl` |
| PATCH | `/api/drive/files/:id` | `{ name }` → `{ item }` |
| DELETE | `/api/drive/files/:id` | Chuyển vào thùng rác |
| GET | `/api/drive/files/:id/download` | Tải file về |
| GET | `/api/drive/files/:id/thumb?s=` | Ảnh thu nhỏ (64–1600 px) |

Mọi thao tác theo `id` đều kiểm tra file nằm trong thư mục gốc của team, nên không ai đụng được file khác bằng cách đoán id. Các thao tác thay đổi được ghi vào nhật ký (nhóm “Google Drive”).

## 6. Để sau

- Chuyển/di chuyển file giữa các thư mục.
- Gắn file Drive vào sản phẩm. (Kế hoạch video đã có thư mục và file riêng: xem [tài liệu 09](09-ke-hoach-video.md).)
- Tải cả thư mục thành file zip.
