# 15. Tắt máy tính từ xa

## 1. Mục tiêu

Quản trị viên tắt **một máy tính Windows** (máy làm video) từ trang **Quản trị → Máy tính**, kể cả khi đang ở xa, bấm trên điện thoại. Ví dụ: để máy render qua đêm rồi tắt khi xong.

## 2. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Máy nào | **Một** máy. Kết nối máy khác thì máy cũ mất kết nối |
| Cách nhận lệnh | Chương trình nhỏ `tools/pc-agent/agent.mjs` (chỉ cần Node, không thư viện) chạy ẩn khi đăng nhập Windows. Nó hỏi `GET /api/agent/poll`, máy chủ giữ yêu cầu tối đa 25 giây và trả lời ngay khi có lệnh (long polling), nên lệnh đến trong khoảng 1 giây |
| Ghép máy | Quản trị viên bấm "Kết nối máy tính": máy chủ tạo mã `pc_...` (32 byte ngẫu nhiên), **chỉ hiện một lần**, chỉ lưu bản băm SHA-256. "Tạo mã mới" thay mã (chương trình cũ bị từ chối), "Ngắt kết nối" xoá hẳn |
| Ai bấm được | Xem: ai có `admin.view`. Tắt máy, huỷ, kết nối, ngắt: **chỉ quản trị viên**. Nút Tắt máy bấm hai lần |
| Tắt thế nào | `shutdown /s /t <giây>` sau 1, 5, 15, 30 phút hoặc 1 giờ. Windows hiện thông báo đếm ngược; ngồi ở máy có thể huỷ bằng `shutdown /a`. Bấm tắt khi đã có lịch thì lịch cũ được thay (đổi giờ tắt) |
| Huỷ | Nút "Huỷ tắt máy" gửi lệnh `shutdown /a` |
| An toàn | Máy **không kết nối** (tắt, ngủ, mất mạng) thì không nhận lệnh, để không có chuyện vừa bật máy đã bị tắt vì lệnh cũ. Lệnh chưa được nhận sau 2 phút thì bị bỏ; nhận mà không trả lời sau 2 phút thì báo lỗi |
| Đang bật | Máy liên lạc trong 45 giây gần nhất |
| Nhật ký | "Admin: kết nối / ngắt kết nối / tắt / huỷ tắt máy tính", kèm tên máy và thời gian chờ |
| Render | Máy luôn giữ một kết nối nên máy chủ Render free không ngủ trong lúc máy tính bật. Một dịch vụ chạy cả tháng vẫn nằm trong 750 giờ miễn phí |

## 3. Cài trên máy tính

Trong thư mục `tools/pc-agent` (chép thư mục này sang máy cần tắt nếu là máy khác):

```powershell
node agent.mjs setup https://<địa chỉ app> pc_<mã kết nối>   # lưu config.json (không đưa lên git)
node agent.mjs test                                          # kiểm tra kết nối
node agent.mjs --dry-run                                     # chạy thử: nhận lệnh nhưng không tắt máy thật
powershell -ExecutionPolicy Bypass -File install.ps1         # tự chạy ẩn mỗi khi đăng nhập, chạy luôn bây giờ
powershell -ExecutionPolicy Bypass -File uninstall.ps1       # gỡ
```

`install.ps1` chỉ thêm `XuongPrompt-PcAgent.vbs` vào thư mục Startup của tài khoản Windows (không cần quyền quản trị). Nhật ký ở `agent.log` cạnh chương trình. Mất mạng hay máy chủ đang khởi động thì chương trình tự thử lại, chờ lâu dần đến 1 phút.

## 4. Giao diện (Quản trị → Máy tính)

- Chưa kết nối: nút "Kết nối máy tính" → hộp thoại có mã, ô thư mục chương trình trên máy (điền sẵn `D:WorkSpace-ITQuickPrompt	oolspc-agent`, nhớ trên trình duyệt) và 3 lệnh setup, test, install ghi đường dẫn đầy đủ nên chạy ở thư mục nào cũng được (nút Copy cho từng lệnh, địa chỉ app điền sẵn).
- Đã kết nối: chấm xanh "Đang bật, sẵn sàng nhận lệnh" hoặc "Không kết nối. Lần cuối: …", tên máy (tên Windows). Khi có lịch tắt: "Máy sẽ tắt lúc 23:11, còn 14:59" đếm từng giây. Chọn thời gian, "Tắt máy" (hay "Đổi giờ tắt"), "Huỷ tắt máy". Lệnh không chạy được thì hiện lý do. Trang tự cập nhật mỗi 4 giây.

## 5. Dữ liệu và API

Collection `pcagents` (một bản ghi): `tokenHash`, `name`, `pairedAt`, `pairedBy`, `lastSeenAt`, `command { id, kind: shutdown|cancel, delaySec, by, at, sentAt }`, `result { id, kind, ok, message, at }`, `shutdownAt`.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/admin/pc` | `{ paired, delays, name, pairedAt, online, lastSeenAt, pending, shutdownAt, result }` |
| POST | `/api/admin/pc/pair` | Tạo mã mới, trả `{ token, ... }` một lần |
| DELETE | `/api/admin/pc` | Ngắt kết nối |
| POST | `/api/admin/pc/shutdown` | `{ minutes }` (1, 5, 15, 30, 60). 409 khi máy không kết nối |
| POST | `/api/admin/pc/cancel` | Huỷ lịch tắt |
| GET | `/api/agent/poll?name=&wait=0` | Chương trình hỏi lệnh (`Authorization: Bearer pc_...`). `{ command }` hoặc `{ command: null }` sau 25 giây; `wait=0` trả lời ngay |
| POST | `/api/agent/ack` | `{ id, ok, message }`: đã chạy lệnh hay chưa |
