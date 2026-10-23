# 11. Quản trị

## 1. Mục tiêu

Một người (hoặc vài người) quản lý tài khoản của team, xem ai đã làm gì và nắm số liệu chung, mà không phải vào thẳng cơ sở dữ liệu.

## 2. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Ai xem được | **Mọi thành viên** đều thấy mục **Quản trị** và xem được cả ba tab (tổng quan, danh sách thành viên, nhật ký) |
| Vai trò | Hai vai trò: `admin` (quản trị viên) và `member` (thành viên). Chỉ admin thấy và dùng được các nút thay đổi tài khoản: thêm, sửa, đặt mật khẩu, đăng xuất mọi nơi, khoá, xoá |
| Admin đầu tiên | Tài khoản đầu tiên đăng ký là admin. Với hệ thống đã có người dùng: chạy `npm run make-admin -- <tên>` hoặc đặt `ADMIN_USERNAMES` (tài khoản trong danh sách thành admin ở lần mở app kế tiếp) |
| Luôn còn admin | Không bỏ quyền, khoá hay xoá được admin cuối cùng còn hoạt động; không tự khoá, tự bỏ quyền, tự xoá chính mình |
| Khoá tài khoản | Người bị khoá bị đăng xuất ngay trên mọi thiết bị và không đăng nhập lại được. Dữ liệu giữ nguyên |
| Đặt lại mật khẩu | Admin đặt mật khẩu mới; người đó bị đăng xuất mọi nơi |
| Xoá tài khoản | Chỉ xoá tài khoản; sản phẩm, prompt, kế hoạch vẫn ở lại cho team, hiện "(tài khoản đã xoá)" |
| Nhật ký | Máy chủ tự ghi mọi thao tác thành công làm thay đổi dữ liệu, đăng nhập, đăng nhập sai, đăng xuất, xuất/nhập dữ liệu. Không ghi lượt xem, không bao giờ ghi mật khẩu hay nội dung prompt. Giữ **180 ngày** rồi tự xoá |

## 3. Cách đăng xuất mọi nơi hoạt động

Mỗi tài khoản có `sessionVersion`, được ghi vào cookie đăng nhập. Mỗi request, máy chủ đọc nhanh tài khoản (vai trò, khoá, `sessionVersion`); cookie mang số cũ thì bị từ chối (401). Khoá, đặt lại mật khẩu hay bấm "Đăng xuất mọi nơi" đều tăng số này lên 1.

## 4. Màn hình `/admin`

Ba tab, tab đang mở và bộ lọc nằm trên URL.

- **Tổng quan:**
  - Ô số liệu: thành viên (hoạt động 7 ngày, số admin, số bị khoá), prompt đã lưu (+30 ngày), sản phẩm và tài nguyên, % video đã làm theo kế hoạch (quá hạn), đăng nhập sai 7 ngày (viền vàng khi từ 10 lần).
  - Biểu đồ cột số thao tác mỗi ngày (14/30/90 ngày, theo giờ Việt Nam). Rê chuột hoặc Tab vào cột để xem số.
  - Tích cực nhất và thao tác hay dùng trong 30 ngày.
- **Thành viên:** bảng tài khoản với lần đăng nhập gần nhất, số thao tác 30 ngày (bấm để xem nhật ký người đó), số prompt, kế hoạch được giao. Nút: Sửa (tên hiển thị, vai trò), Đặt mật khẩu, Đăng xuất mọi nơi, Khoá/Mở khoá (bấm hai lần), Xoá (hỏi Có/Không). Nút "+ Thêm thành viên" tạo tài khoản kể cả khi đã tắt đăng ký.
- **Nhật ký:** lọc theo thành viên, nhóm thao tác, từ ngày đến ngày, tìm theo tên đối tượng. Mỗi dòng: thời gian, người, thao tác, đối tượng (kèm trường đã đổi, số mục), IP (rê chuột thấy trình duyệt). Đăng nhập sai có nền vàng. 50 dòng mỗi trang.

## 5. Dữ liệu

- `users` thêm: `role` (`member`/`admin`), `disabled`, `sessionVersion`.
- Collection `activitylogs`: `user`, `action` (vd. `product.update`), `targetId`, `label` (tên đối tượng, giữ lại cả khi đối tượng bị xoá), `meta` (trường đã đổi, số mục), `ip`, `ua`, `createdAt`. Chỉ mục TTL 180 ngày trên `createdAt`, thêm `{ user, createdAt }` và `{ action, createdAt }`.
- Danh sách thao tác và tên tiếng Việt nằm ở `server/src/lib/audit.js`. Thêm route mới làm đổi dữ liệu thì thêm một dòng vào đó.

## 6. API (`/api/admin`: GET cho mọi thành viên, còn lại chỉ admin)

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/stats?days=14` | Số liệu tổng quan, thao tác theo ngày, xếp hạng |
| GET | `/users` | Mọi tài khoản kèm số liệu từng người; `canManage` cho biết người xem có phải admin |
| POST | `/users` | `{ username, displayName?, password, role? }` tạo tài khoản |
| PATCH | `/users/:id` | `{ displayName?, role?, disabled? }` |
| POST | `/users/:id/password` | `{ password }` đặt mật khẩu mới, đăng xuất mọi nơi |
| POST | `/users/:id/logout` | Đăng xuất mọi nơi |
| DELETE | `/users/:id` | Xoá tài khoản |
| GET | `/logs` | Lọc `user`, `group`, `action`, `from`, `to`, `q`, `page`; kèm danh sách nhóm và thao tác |

## 7. Để sau

- Xuất nhật ký ra CSV.
- Cảnh báo khi một tài khoản đăng nhập sai nhiều lần liên tiếp.
