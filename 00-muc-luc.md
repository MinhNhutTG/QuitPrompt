# Xưởng Prompt Thời Trang: Bộ tài liệu phân tích

Bộ tài liệu này mô tả việc nâng cấp **Xưởng Prompt Thời Trang** từ một trang web tĩnh (một file HTML, dữ liệu nằm trong trình duyệt) thành một ứng dụng web đầy đủ có máy chủ, cơ sở dữ liệu, tài khoản đăng nhập và kho ảnh sản phẩm.

| # | Tài liệu | Nội dung chính | Dành cho |
|---|---|---|---|
| 01 | [Tổng quan và yêu cầu](01-tong-quan-yeu-cau.md) | Mục tiêu, người dùng, phạm vi, yêu cầu chức năng và phi chức năng | Chủ sản phẩm, mọi người |
| 02 | [Kiến trúc hệ thống](02-kien-truc-he-thong.md) | Công nghệ, sơ đồ thành phần, luồng dữ liệu, chiến lược hiệu năng và bảo mật | Lập trình viên |
| 03 | [Thiết kế cơ sở dữ liệu](03-thiet-ke-co-so-du-lieu.md) | Các collection MongoDB, trường, chỉ mục, quan hệ | Lập trình viên |
| 04 | [Đặc tả API](04-dac-ta-api.md) | Toàn bộ endpoint, dữ liệu gửi và nhận, mã lỗi | Lập trình viên |
| 05 | [Thiết kế giao diện](05-thiet-ke-giao-dien.md) | Các màn hình, luồng thao tác, thành phần, nhận diện hình ảnh | Thiết kế, lập trình viên |
| 06 | [Logic tạo prompt](06-logic-tao-prompt.md) | Template, thư viện động tác, cách chia thời gian, quy tắc an toàn | Chủ sản phẩm, lập trình viên |
| 07 | [Triển khai và vận hành](07-trien-khai-van-hanh.md) | Deploy miễn phí, biến môi trường, giới hạn gói free, sao lưu, chuyển dữ liệu cũ | Người vận hành |
| 08 | [Kế hoạch thực hiện](08-ke-hoach-thuc-hien.md) | Các giai đoạn, kiểm thử, rủi ro, câu hỏi cần chốt | Mọi người |
| 09 | [Kế hoạch tạo video](09-ke-hoach-video.md) | Bảng giao việc làm video theo sản phẩm, trạng thái do người thực hiện chọn | Mọi người |
| 10 | [Kho tài nguyên](10-kho-tai-nguyen.md) | Kho chung skill AI và prompt tạo ảnh chất lượng | Mọi người |
| 11 | [Quản trị](11-quan-tri.md) | Quản lý tài khoản, nhật ký thao tác, số liệu tổng quát | Quản trị viên, lập trình viên |
| 12 | [Google Drive của team](12-google-drive.md) | Kho file chung trên Google Drive: cài đặt, quyền, màn hình, API | Quản trị viên, mọi người |
| 13 | [Chat và thông báo realtime](13-chat-thong-bao.md) | Phòng chat chung, thông báo hành động của thành viên ngay khi xảy ra, ai đang online | Mọi người, lập trình viên |

## Tóm tắt một đoạn

Người dùng đăng nhập bằng tên đăng nhập và mật khẩu, tạo **sản phẩm** kèm ảnh (lưu trên Cloudinary), rồi dùng **bộ tạo prompt** để chọn chuỗi động tác cho video AI 10 đến 20 giây. Khi một video ra đẹp, họ **lưu prompt tốt** gắn với sản phẩm đó để tái sử dụng hoặc chỉnh tiếp. Dữ liệu nằm trên MongoDB nên dùng được trên mọi máy và điện thoại. Giao diện React tải theo từng trang và tải ảnh khi cần để mở nhanh.

## Thuật ngữ

| Thuật ngữ | Nghĩa trong tài liệu |
|---|---|
| Ảnh tham chiếu | Ảnh người mẫu mặc sản phẩm, đưa vào công cụ video AI (Meta AI, Dola AI...) cùng với prompt |
| Prompt | Đoạn mô tả tiếng Anh gửi cho công cụ video AI |
| Negative | Danh sách những thứ AI không được tạo ra |
| Nhịp (beat) | Một đoạn thời gian trong video gắn với một động tác, ví dụ `2–4.7s` |
| Prompt tốt | Prompt đã cho ra video đạt, được người dùng chủ động lưu lại |
| Động tác có điều kiện | Động tác chỉ dùng được khi ảnh tham chiếu có tường, ghế, bục, hoặc khi sản phẩm là áo, mũ |
