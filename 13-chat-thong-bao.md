# 13. Chat và thông báo realtime

## 1. Mục tiêu

Cả team thấy ngay việc của nhau mà không cần tải lại trang: nhắn tin trong **một phòng chat chung**, và nhận **thông báo mọi hành động** của thành viên khác (thêm kế hoạch, đổi trạng thái, tải file, đăng nhập...) ngay khi nó xảy ra.

## 2. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Chat | Một phòng chung cho cả team (không có nhắn riêng). Tin nhắn tối đa 2000 ký tự, **giữ 4 ngày rồi tự xoá** (MongoDB tự dọn, khoảng mỗi phút một lần). Mỗi tài khoản gửi tối đa 15 tin trong 10 giây |
| Thu hồi | Chỉ **người gửi** thu hồi được tin của mình, lúc nào cũng được khi tin còn. Nội dung bị xoá hẳn khỏi cơ sở dữ liệu (không chỉ ẩn); tin vẫn giữ chỗ, hiện "Tin nhắn đã được thu hồi" (người gửi thấy "Bạn đã thu hồi tin nhắn") trên mọi máy ngay lập tức |
| Thông báo | **Mọi hành động** có trong nhật ký thao tác ([tài liệu 11](11-quan-tri.md)), trừ "Đăng nhập sai" (không gắn với tài khoản nào, có thể lộ tên đăng nhập người khác gõ thử). Không bao giờ gửi IP hay trình duyệt |
| Danh sách thông báo | Theo nhật ký, nên chỉ có **2 ngày gần nhất** (`LOG_RETENTION_DAYS`), 50 mục mới nhất |
| Đã xem | Thông báo: lưu trên máy chủ (`users.notifSeenAt`), mở chuông là coi như đã xem, giữ được khi tải lại trang hay đổi máy. Chat: lưu trên trình duyệt (lần cuối mở phòng chat) |
| Online | Ai đang mở app (ít nhất một tab) là online; đóng hết tab thì rời danh sách sau vài giây |
| Công nghệ | **Server-Sent Events** (`GET /api/live`): một kết nối mở cho mỗi tab, máy chủ ghi sự kiện vào đó. Không cần thư viện thêm, chạy được trên Render. Rớt kết nối (mạng, máy chủ ngủ hay khởi động lại) thì trình duyệt tự nối lại sau 3 giây và tải lại phần đã lỡ |
| Bảo mật | Cần đăng nhập. Cứ 25 giây máy chủ kiểm tra lại tài khoản: bị khoá, bị xoá hay bị "đăng xuất mọi nơi" thì ngắt kết nối |

## 3. Giao diện

- **Chuông** ở thanh bên (máy tính, cạnh tên app) và thanh trên (điện thoại, cạnh avatar). Chấm đỏ đếm số hành động của người khác chưa xem. Bấm mở danh sách "Hoạt động của team": mới nhất trước, "Bạn" cho việc của mình, mục chưa xem có nền nhấn, bấm mục có liên kết (kế hoạch, sản phẩm, prompt, tài nguyên, Drive) để mở.
- **Thông báo nổi**: hành động của người khác hiện một dòng như "Ngọc Lan · Thêm sản phẩm: Áo sơ mi linen" kèm nút Xem. Việc của chính mình không hiện. Cùng lúc, phần dữ liệu đó tự tải lại (ví dụ ai đó đổi trạng thái kế hoạch thì danh sách kế hoạch của mọi người cập nhật).
- **Chat**: nút tròn ở góc phải dưới (trên thanh tab ở điện thoại), chấm đỏ đếm tin mới. Mở ra là phòng chat: ai đang online ở đầu, tin của mình bên phải, của người khác bên trái có tên, "Xem tin cũ hơn" để tải thêm. Enter để gửi, Shift+Enter xuống dòng. Rê chuột lên tin của mình (điện thoại: luôn hiện) có nút **Thu hồi**: bấm một lần hiện "Thu hồi?", bấm lần nữa trong 4 giây để thu hồi. Đầu phòng ghi "Tin nhắn tự xoá sau 4 ngày". Tin mới khi phòng đang đóng hiện thông báo nổi có nút "Mở chat". Khi phòng mở, thông báo nổi dời sang bên trái (máy tính) hoặc lên trên (điện thoại) để không che ô nhập.

## 4. API

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/live` | Luồng sự kiện (`text/event-stream`, không nén): `hello` và `presence` `{ online: [{ id, displayName }] }`, `chat` (một tin nhắn), `chat-recall` (tin bị thu hồi), `activity` (một hành động) |
| GET | `/api/chat?before=<id>` | 50 tin mới nhất (cũ trước), hoặc 50 tin trước tin `before` → `{ items: [{ id, user: { id, displayName }, text, recalled, at }], more }` |
| POST | `/api/chat` | `{ text }` → `201 { item }`, rồi gửi `chat` tới mọi tab đang mở |
| DELETE | `/api/chat/:id` | Thu hồi, chỉ người gửi (người khác → 403) → `{ item }` với `text: ""`, `recalled: true`, rồi gửi `chat-recall` tới mọi tab |
| GET | `/api/notifications` | 50 hành động mới nhất → `{ items: [{ id, action, label, group, target, targetId, count, user, at }], seenAt }` |
| POST | `/api/notifications/seen` | Đánh dấu đã xem tới bây giờ → `{ seenAt }` |

Hành động được gửi đi ngay khi ghi vào nhật ký (`lib/audit.js` → `lib/live.js`).

## 5. Giới hạn

- Một máy chủ (Render free): danh sách kết nối giữ trong bộ nhớ. Chạy nhiều máy chủ cùng lúc thì cần một kênh chung (ví dụ Redis) để chuyển sự kiện giữa chúng.
- Máy chủ Render free ngủ sau 15 phút không có ai: lúc đó không ai online nên không có gì để báo; người mở app đầu tiên đánh thức nó.
- Chưa có thông báo đẩy khi đã đóng app (Web Push).
