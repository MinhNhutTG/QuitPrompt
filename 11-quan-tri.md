# 11. Quản trị

## 1. Mục tiêu

Một người (hoặc vài người) quản lý tài khoản của team, xem ai đã làm gì và nắm số liệu chung, mà không phải vào thẳng cơ sở dữ liệu.

## 2. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Ai xem được | Vai trò có quyền **Xem trang Quản trị** thấy mục **Quản trị** và cả bốn tab (tổng quan, thành viên, phân quyền, nhật ký). Vai trò khác không thấy mục này |
| Vai trò | `admin` (Quản trị viên) luôn có mọi quyền, không sửa được. Các vai trò khác do admin tạo và tick quyền ở tab **Phân quyền** (mục 3). Chỉ admin thêm, sửa, đặt mật khẩu, đăng xuất mọi nơi, khoá, xoá tài khoản và sửa vai trò |
| Tự đăng ký | Khi `ALLOW_REGISTER` bật, tài khoản tự tạo ở màn hình đăng nhập **chờ admin duyệt**: bị khoá, nhãn "Chờ duyệt" ở tab Thành viên, admin bấm **Duyệt** (bấm hai lần) mới đăng nhập được. Trừ tài khoản đầu tiên |
| Admin đầu tiên | Tài khoản đầu tiên đăng ký là admin. Với hệ thống đã có người dùng: chạy `npm run make-admin -- <tên>` hoặc đặt `ADMIN_USERNAMES` (tài khoản trong danh sách thành admin ở lần mở app kế tiếp) |
| Luôn còn admin | Không bỏ quyền, khoá hay xoá được admin cuối cùng còn hoạt động; không tự khoá, tự bỏ quyền, tự xoá chính mình |
| Khoá tài khoản | Người bị khoá bị đăng xuất ngay trên mọi thiết bị và không đăng nhập lại được. Dữ liệu giữ nguyên |
| Đặt lại mật khẩu | Admin đặt mật khẩu mới; người đó bị đăng xuất mọi nơi |
| Xoá tài khoản | Chỉ xoá tài khoản; sản phẩm, prompt, kế hoạch vẫn ở lại cho team, hiện "(tài khoản đã xoá)" |
| Nhật ký | Máy chủ tự ghi mọi thao tác thành công làm thay đổi dữ liệu, đăng nhập, đăng nhập sai, đăng xuất, xuất/nhập dữ liệu. Không ghi lượt xem, không bao giờ ghi mật khẩu hay nội dung prompt. Giữ **2 ngày** rồi MongoDB tự xoá (đổi bằng biến `LOG_RETENTION_DAYS`, 1–365) |

## 3. Phân quyền

Ai cũng xem được sản phẩm, prompt đã lưu, kế hoạch, tài nguyên, thư viện, và dùng được bộ tạo prompt và cài đặt riêng của mình. Mọi thay đổi dữ liệu chung cần quyền:

| Quyền | Mã | Biên tập | Thành viên | Chỉ xem |
|---|---|---|---|---|
| Thêm, sửa sản phẩm và ảnh | `product.edit` | ✓ | ✓ | |
| Xoá sản phẩm | `product.delete` | ✓ | | |
| Lưu, sửa, xoá prompt của mình | `prompt.save` | ✓ | ✓ | |
| Xoá prompt của người khác | `prompt.delete` | ✓ | | |
| Tạo, sửa kế hoạch | `plan.edit` | ✓ | | |
| Xoá kế hoạch | `plan.delete` | ✓ | | |
| Thêm, sửa tài nguyên | `resource.edit` | ✓ | ✓ | |
| Xoá tài nguyên | `resource.delete` | ✓ | | |
| Nhập dữ liệu từ file | `data.import` | | | |
| Xuất dữ liệu ra file | `data.export` | | | |
| Xem trang Quản trị | `admin.view` | ✓ | | |

- Ba vai trò trên được tạo ở lần khởi động đầu tiên khi chưa có vai trò nào; sau đó admin đổi tên, đổi quyền, thêm hay xoá tuỳ ý.
- `member` (Thành viên) là vai trò của tài khoản tự đăng ký nên không xoá được. Không xoá được vai trò còn người dùng.
- Người được giao kế hoạch luôn cập nhật được trạng thái của nó, kể cả khi không có `plan.edit`.
- Lưu prompt cho một sản phẩm chưa có (gõ tên mới) cần thêm `product.edit`.
- Máy chủ kiểm tra quyền ở mọi API (403 kèm tên quyền còn thiếu); giao diện chỉ ẩn nút. Quyền đổi có hiệu lực từ request kế tiếp (máy chủ nhớ vai trò tối đa 30 giây, đổi trên chính máy chủ đó thì xoá ngay). Khi nhận 403, app tải lại quyền của người dùng.
- Danh sách quyền nằm ở `server/src/lib/permissions.js`. Thêm route mới làm đổi dữ liệu thì gắn `can("...")` cho nó.

### Hạng tài khoản: Thường và Premium

Hạng nằm cạnh vai trò, không thay vai trò. Quyền của một người = quyền của vai trò + **quyền cộng thêm** của hạng. Hạng còn đặt **giới hạn**; ô để trống là không giới hạn. Quản trị viên có mọi quyền và không bị giới hạn.

| | Thường | Premium |
|---|---|---|
| Prompt lưu mỗi ngày | 10 | không giới hạn |
| Sản phẩm tạo mỗi ngày (kể cả tạo khi lưu prompt bằng tên mới) | 5 | không giới hạn |
| Ảnh mỗi sản phẩm (tối đa 12) | 4 | 12 |
| Quyền cộng thêm | không | xoá sản phẩm, tạo/sửa kế hoạch, thêm/sửa tài nguyên, xuất dữ liệu |

- Số trên là mặc định lúc tạo; admin sửa ở tab **Phân quyền & hạng**. Ngày tính theo giờ Việt Nam.
- Admin đặt Premium cho từng người ở tab Thành viên (Sửa), kèm ngày hết hạn (+30 ngày, +1 năm, hoặc để trống là không hết hạn). Qua hết ngày đó, tài khoản tự về Thường; không cần chạy gì thêm.
- Người dùng xem hạng, ngày hết hạn và giới hạn của mình ở **Cài đặt → Tài khoản**.

### Bảo mật

- **Máy chủ quyết định mọi quyền**; giao diện chỉ ẩn nút. Quyền thiếu thì API trả 403, không có quyền nào mặc định được cho.
- **Giới hạn mỗi ngày** đếm bằng collection `usages` (một dòng cho mỗi người, ngày, loại), tăng nguyên tử: gửi nhiều request cùng lúc cũng không vượt được. Xoá prompt hay sản phẩm không trả lại lượt. Nhập dữ liệu từ file (quyền `data.import`) không tính vào giới hạn.
- **Chống CSRF:** mọi request thay đổi dữ liệu phải có header `X-Requested-With: fetch` (app tự gửi); trang web khác không gửi được header này. Cookie đăng nhập là `httpOnly`, `SameSite=Lax`, `Secure` khi chạy thật.
- **Phiên đăng nhập:** JWT chỉ nhận thuật toán HS256. Đổi mật khẩu thì đăng xuất mọi thiết bị khác.
- **Chặn dò:** đăng nhập sai và đăng ký tối đa 30 lần mỗi 15 phút; đổi mật khẩu sai tối đa 10 lần; toàn bộ API tối đa 300 request mỗi phút cho mỗi IP.
- Câu trả lời API có `Cache-Control: no-store`; dữ liệu gửi lên được kiểm tra bằng zod và bỏ trường lạ.

## 4. Cách đăng xuất mọi nơi hoạt động

Mỗi tài khoản có `sessionVersion`, được ghi vào cookie đăng nhập. Mỗi request, máy chủ đọc nhanh tài khoản (vai trò, khoá, `sessionVersion`); cookie mang số cũ thì bị từ chối (401). Khoá, đặt lại mật khẩu hay bấm "Đăng xuất mọi nơi" đều tăng số này lên 1.

## 5. Màn hình `/admin`

Bốn tab, tab đang mở và bộ lọc nằm trên URL.

- **Tổng quan:**
  - Ô số liệu: thành viên (đăng nhập 7 ngày qua, số admin, số bị khoá), prompt đã lưu (+30 ngày), sản phẩm và tài nguyên, % video đã làm theo kế hoạch (quá hạn), đăng nhập sai trong thời gian nhật ký còn giữ (viền vàng khi từ 10 lần).
  - Biểu đồ cột số thao tác: theo **giờ** khi nhật ký giữ từ 3 ngày trở xuống (mặc định 48 cột cho 2 ngày), theo ngày khi giữ lâu hơn. Giờ Việt Nam. Rê chuột hoặc Tab vào cột để xem số.
  - Tích cực nhất và thao tác hay dùng, trong thời gian nhật ký còn giữ.
- **Thành viên:** bảng tài khoản với lần đăng nhập gần nhất, số thao tác trong thời gian nhật ký còn giữ (bấm để xem nhật ký người đó), số prompt, kế hoạch được giao. Nút: Sửa (tên hiển thị, chọn vai trò), Đặt mật khẩu, Đăng xuất mọi nơi, Khoá/Mở khoá (bấm hai lần), Xoá (hỏi Có/Không). Nút "+ Thêm thành viên" tạo tài khoản kể cả khi đã tắt đăng ký.
- **Phân quyền:** bảng quyền × vai trò, mỗi ô một ô tick, lưu ngay khi bấm. Cột Quản trị viên tick sẵn và khoá. Đầu mỗi cột: số tài khoản, Đổi tên, Xoá. Nút "+ Vai trò mới".
- **Nhật ký:** lọc theo thành viên, nhóm thao tác, từ ngày đến ngày, tìm theo tên đối tượng. Mỗi dòng: thời gian, người, thao tác, đối tượng (kèm trường đã đổi, số mục), IP (rê chuột thấy trình duyệt). Đăng nhập sai có nền vàng. 50 dòng mỗi trang.

## 6. Dữ liệu

- `users` thêm: `role` (`admin` hoặc `key` của một vai trò), `disabled`, `sessionVersion`.
- `users` thêm: `premium` (true/false), `premiumUntil` (hết ngày đó theo giờ Việt Nam; null = không hết hạn).
- Collection `tiers`: hai dòng `normal`, `premium`, mỗi dòng có `permissions` và `limits` (`promptsPerDay`, `productsPerDay`, `imagesPerProduct`; null = không giới hạn).
- Collection `roles`: `key` (không đổi, vd. `member`, `editor`, `r3f9a…`), `name`, `permissions` (mảng mã quyền).
- Collection `activitylogs`: `user`, `action` (vd. `product.update`), `targetId`, `label` (tên đối tượng, giữ lại cả khi đối tượng bị xoá), `meta` (trường đã đổi, số mục), `ip`, `ua`, `createdAt`. Chỉ mục TTL `LOG_RETENTION_DAYS` ngày (mặc định 2) trên `createdAt`; mỗi lần khởi động, máy chủ chạy `syncIndexes()` để chỉ mục cũ nhận thời hạn mới, thêm `{ user, createdAt }` và `{ action, createdAt }`.
- Danh sách thao tác và tên tiếng Việt nằm ở `server/src/lib/audit.js`. Thêm route mới làm đổi dữ liệu thì thêm một dòng vào đó.

## 7. API (`/api/admin`: GET cần `admin.view`, còn lại chỉ admin)

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/stats` | Số liệu tổng quan, thao tác theo giờ hoặc ngày (`activity.bucket`), xếp hạng, `retentionDays` |
| GET | `/users` | Mọi tài khoản kèm số liệu từng người; `canManage` cho biết người xem có phải admin |
| POST | `/users` | `{ username, displayName?, password, role? }` tạo tài khoản |
| PATCH | `/users/:id` | `{ displayName?, role?, disabled?, premium?, premiumUntil? ("YYYY-MM-DD" hoặc "") }` |
| POST | `/users/:id/password` | `{ password }` đặt mật khẩu mới, đăng xuất mọi nơi |
| POST | `/users/:id/logout` | Đăng xuất mọi nơi |
| DELETE | `/users/:id` | Xoá tài khoản |
| GET | `/roles` | Mọi vai trò (kèm số tài khoản), danh sách quyền, `canManage` |
| POST | `/roles` | `{ name, permissions? }` tạo vai trò |
| PATCH | `/roles/:key` | `{ name?, permissions? }` |
| DELETE | `/roles/:key` | Xoá vai trò không còn ai dùng (trừ `member`) |
| GET | `/tiers` | Hai hạng với quyền cộng thêm, giới hạn, số tài khoản |
| PATCH | `/tiers/:key` | `{ permissions?, limits? }` |
| GET | `/logs` | Lọc `user`, `group`, `action`, `from`, `to`, `q`, `page`; kèm danh sách nhóm và thao tác |

`/api/auth/login`, `/register`, `/me` trả `user` kèm `roleName`, `permissions` (vai trò + hạng) và `tier { key, name, until, limits }`.

## 8. Để sau

- Xuất nhật ký ra CSV.
- Cảnh báo khi một tài khoản đăng nhập sai nhiều lần liên tiếp.
