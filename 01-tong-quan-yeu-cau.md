# 01. Tổng quan và yêu cầu

## 1. Bối cảnh

Người dùng làm video quảng cáo thời trang cho TikTok và TikTok Shop bằng công cụ video AI. Mỗi video cần một prompt tiếng Anh dài, phần lớn cố định (máy quay đứng yên, giữ nguyên sản phẩm, không gió, 9:16...), chỉ có **chuỗi động tác** là thay đổi giữa các video.

Phiên bản hiện tại là một trang HTML tĩnh. Nó đã giải quyết việc ghép prompt nhanh, nhưng có ba giới hạn:

1. **Dữ liệu kẹt trong một trình duyệt.** Prompt đã lưu, template, động tác tự thêm không theo người dùng sang máy khác hay điện thoại. Phải sao lưu và nhập bằng tay.
2. **Không quản lý được sản phẩm.** Sản phẩm chỉ là một cái tên gõ tay, không có ảnh, không có thông tin riêng (lỗi cần chặn, áo có mở được không).
3. **Không có tài khoản.** Không phân biệt dữ liệu của từng người nếu nhiều người cùng dùng.

## 2. Mục tiêu

| Mã | Mục tiêu | Cách đo |
|---|---|---|
| G1 | Tạo một prompt hoàn chỉnh trong dưới 30 giây | Từ lúc mở trang đến lúc bấm Copy |
| G2 | Tìm lại prompt tốt của một sản phẩm trong dưới 10 giây | Gõ tên sản phẩm, thấy prompt kèm ảnh |
| G3 | Dùng được trên mọi thiết bị với cùng dữ liệu | Đăng nhập trên điện thoại thấy đủ dữ liệu đã tạo trên máy tính |
| G4 | Đăng nhập nhanh, ít phải đăng nhập lại | Ghi nhớ đăng nhập 30 ngày; lần sau mở là vào thẳng |
| G5 | Chi phí vận hành 0 đồng ở quy mô cá nhân hoặc nhóm nhỏ | Chạy được trên các gói miễn phí (xem tài liệu 07) |

## 3. Người dùng

| Vai trò | Mô tả | Nhu cầu chính |
|---|---|---|
| Người làm nội dung (chính) | Một người hoặc nhóm nhỏ làm affiliate, tạo nhiều video mỗi ngày | Tạo prompt nhanh, đổi động tác dễ, lưu lại prompt tốt |
| Thành viên nhóm | Người được cấp tài khoản riêng | Dùng chung sản phẩm, prompt đã lưu và kế hoạch video với cả nhóm; template và động tác riêng vẫn theo từng tài khoản |

Phiên bản này **chưa** có vai trò quản trị viên hay chia sẻ dữ liệu giữa các tài khoản (xem mục 6).

## 4. Yêu cầu chức năng

Mức ưu tiên: **P1** bắt buộc cho bản đầu tiên, **P2** nên có, **P3** để sau.

### 4.1 Tài khoản và đăng nhập

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| F-AUTH-01 | Đăng nhập bằng tên đăng nhập và mật khẩu | P1 |
| F-AUTH-02 | Tạo tài khoản ngay ở màn hình đăng nhập (một màn hình, hai chế độ) | P1 |
| F-AUTH-03 | Ô "Ghi nhớ đăng nhập" bật sẵn, giữ phiên 30 ngày; tắt thì đóng trình duyệt là đăng xuất | P1 |
| F-AUTH-04 | Mở app khi phiên còn hạn thì vào thẳng màn hình Tạo prompt, không hiện màn hình đăng nhập | P1 |
| F-AUTH-05 | Nhớ tên đăng nhập gần nhất trên thiết bị, con trỏ tự nhảy vào ô mật khẩu | P1 |
| F-AUTH-06 | Nút hiện hoặc ẩn mật khẩu; nhấn Enter để đăng nhập | P1 |
| F-AUTH-07 | Đổi mật khẩu trong trang Cài đặt | P2 |
| F-AUTH-08 | Quản trị viên có thể tắt đăng ký tài khoản mới bằng biến môi trường | P1 |
| F-AUTH-09 | Khoá tạm sau nhiều lần đăng nhập sai (chống dò mật khẩu) | P1 |

### 4.2 Sản phẩm

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| F-PRD-01 | Tạo, sửa, xoá sản phẩm: tên, mã (SKU), ghi chú | P1 |
| F-PRD-02 | Tải nhiều ảnh cùng lúc (kéo thả hoặc chọn file, chụp từ điện thoại), tối đa 12 ảnh mỗi sản phẩm | P1 |
| F-PRD-03 | Chọn ảnh đại diện; xoá ảnh | P1 |
| F-PRD-04 | Lưu thông tin dùng cho prompt: "lỗi riêng cần chặn" và "áo luôn đóng" | P1 |
| F-PRD-05 | Danh sách sản phẩm dạng lưới ảnh, tìm theo tên hoặc mã, sắp theo lần dùng gần nhất | P1 |
| F-PRD-06 | Trang chi tiết sản phẩm: ảnh, thông tin, toàn bộ prompt tốt của sản phẩm | P1 |
| F-PRD-07 | Nút "Tạo prompt cho sản phẩm này" mở bộ tạo với sản phẩm đã chọn sẵn | P1 |
| F-PRD-08 | Xoá sản phẩm thì xoá luôn ảnh trên Cloudinary và các prompt của nó, có bước xác nhận | P1 |

### 4.3 Bộ tạo prompt

Giữ nguyên toàn bộ chức năng của bản tĩnh hiện tại (chi tiết ở tài liệu 06), cộng thêm:

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| F-GEN-01 | Chọn sản phẩm từ danh sách có ảnh nhỏ; hiện ảnh đại diện bên cạnh để đối chiếu | P1 |
| F-GEN-02 | Chọn sản phẩm thì tự điền "lỗi riêng cần chặn" và "áo luôn đóng" từ thông tin sản phẩm | P1 |
| F-GEN-03 | Nam hoặc nữ; thời lượng 10, 15, 20 giây; kiểu "nổi bật" hoặc "nhẹ nhàng" | P1 |
| F-GEN-04 | Chuỗi động tác: mở đầu 2 giây, đoạn giữa thêm không giới hạn (đổi thứ tự, xoá), đoạn kết tuỳ chọn | P1 |
| F-GEN-05 | Đổi ngẫu nhiên chuỗi động tác, chỉ chọn trong các động tác an toàn | P1 |
| F-GEN-06 | Prompt và negative cập nhật ngay khi đổi lựa chọn; các nút Copy | P1 |
| F-GEN-07 | Cảnh báo khi động tác có điều kiện (cần tường, cần ảnh lưng...) hoặc khi mỗi động tác dưới 2 giây | P1 |
| F-GEN-08 | Nhớ lựa chọn đang làm dở trên thiết bị, mở lại không mất | P2 |
| F-GEN-09 | Lưu prompt tốt: chọn sản phẩm (hoặc gõ tên mới để tạo luôn), ghi chú, công cụ đã dùng | P1 |

### 4.4 Prompt đã lưu

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| F-SAV-01 | Danh sách mọi prompt tốt, mới nhất lên trước, kèm ảnh đại diện sản phẩm | P1 |
| F-SAV-02 | Lọc theo sản phẩm; tìm theo tên sản phẩm, mã, ghi chú, công cụ | P1 |
| F-SAV-03 | Tải dần khi cuộn xuống (20 mục mỗi lần) | P1 |
| F-SAV-04 | Copy prompt, copy prompt kèm negative | P1 |
| F-SAV-05 | "Dùng lại và chỉnh": nạp toàn bộ lựa chọn cũ vào bộ tạo | P1 |
| F-SAV-06 | Sửa ghi chú và công cụ; xoá có xác nhận | P2 |

### 4.5 Thư viện động tác và template

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| F-LIB-01 | Xem toàn bộ 76 động tác có sẵn theo nhóm, kèm nhãn điều kiện | P1 |
| F-LIB-02 | Thêm, xoá động tác riêng; lưu theo tài khoản | P1 |
| F-TPL-01 | Sửa template prompt và negative mặc định; khôi phục mặc định | P1 |

### 4.6 Chuyển dữ liệu

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| F-MIG-01 | Nhập file sao lưu `.json` từ bản tĩnh cũ: tự tạo sản phẩm theo tên, nhập prompt và động tác riêng | P1 |
| F-MIG-02 | Xuất toàn bộ dữ liệu của tài khoản ra file `.json` | P2 |

## 5. Yêu cầu phi chức năng

### 5.1 Hiệu năng

| Mã | Yêu cầu | Chỉ tiêu |
|---|---|---|
| N-PERF-01 | Trang đầu tiên tải nhanh trên 4G | JavaScript ban đầu dưới 150 KB (gzip); hiển thị nội dung đầu tiên dưới 2 giây khi máy chủ đã chạy |
| N-PERF-02 | Tách mã theo trang (lazy loading route) | Mỗi trang là một file JS riêng, chỉ tải khi mở |
| N-PERF-03 | Ảnh tải khi cần (lazy loading ảnh) | `loading="lazy"`, ảnh thu nhỏ đúng kích thước hiển thị, tự chọn định dạng WebP/AVIF qua Cloudinary |
| N-PERF-04 | Không giật bố cục khi ảnh tải | Khung ảnh giữ sẵn tỉ lệ, hiện ảnh mờ siêu nhỏ trước |
| N-PERF-05 | Gọi API ít và có bộ nhớ đệm | Danh sách đã tải được giữ lại khi chuyển trang qua lại |
| N-PERF-06 | Truy vấn cơ sở dữ liệu có chỉ mục | Mọi truy vấn danh sách đi qua chỉ mục, phân trang bằng con trỏ |
| N-PERF-07 | Nén phản hồi, cache tài nguyên tĩnh lâu dài | gzip; file JS/CSS có hash trong tên, cache 1 năm |

### 5.2 Bảo mật

| Mã | Yêu cầu |
|---|---|
| N-SEC-01 | Mật khẩu băm bằng bcrypt, không bao giờ lưu hay trả về dạng gốc |
| N-SEC-02 | Phiên đăng nhập là cookie `httpOnly`, `SameSite=Lax`, `Secure` khi chạy https; JavaScript trên trang không đọc được |
| N-SEC-03 | Mọi dữ liệu đều gắn chủ sở hữu; API chỉ trả dữ liệu của người đang đăng nhập |
| N-SEC-04 | Kiểm tra dữ liệu đầu vào ở máy chủ (độ dài, kiểu, định dạng) |
| N-SEC-05 | Giới hạn số lần đăng nhập sai; giới hạn kích thước và loại file ảnh |
| N-SEC-06 | Khoá bí mật (MongoDB, Cloudinary, JWT) chỉ nằm ở biến môi trường máy chủ |

### 5.3 Dễ dùng

| Mã | Yêu cầu |
|---|---|
| N-UX-01 | Toàn bộ giao diện tiếng Việt, câu chữ ngắn, đặt tên theo việc người dùng làm |
| N-UX-02 | Dùng tốt trên điện thoại (từ 360px) và máy tính; trên điện thoại có thanh điều hướng dưới |
| N-UX-03 | Mọi thao tác có phản hồi: nút đang xử lý, thông báo "Đã lưu", lỗi nói rõ cách sửa |
| N-UX-04 | Màn hình trống luôn hướng dẫn bước tiếp theo |
| N-UX-05 | Hỗ trợ giao diện sáng và tối theo cài đặt máy |
| N-UX-06 | Dùng được bằng bàn phím, có viền focus rõ |

### 5.4 Vận hành

| Mã | Yêu cầu |
|---|---|
| N-OPS-01 | Một lệnh để chạy khi phát triển, một lệnh để build và chạy khi deploy |
| N-OPS-02 | Frontend và backend chạy chung một dịch vụ khi deploy (một địa chỉ, không lo CORS) |
| N-OPS-03 | Có hướng dẫn deploy miễn phí từng bước |

## 6. Ngoài phạm vi bản đầu tiên

- Gọi trực tiếp API của công cụ video AI để tạo video trong app.
- Chia sẻ sản phẩm hoặc prompt giữa các tài khoản, phân quyền nhóm.
- Đăng nhập bằng Google, Facebook; quên mật khẩu qua email (chưa có email).
- Thống kê hiệu quả video (view, đơn hàng).
- Ứng dụng di động riêng (bản web vẫn dùng tốt trên điện thoại).

## 7. Giả định

1. Quy mô: một đến vài người dùng, vài trăm sản phẩm, vài nghìn prompt. Nằm gọn trong gói miễn phí.
2. Ảnh sản phẩm dùng để nhận diện và đối chiếu trong app; ảnh đưa vào công cụ video AI vẫn do người dùng tự tải lên công cụ đó.
3. Người dùng chấp nhận lần mở đầu tiên sau một lúc không dùng có thể chờ khoảng 1 phút, do máy chủ miễn phí ngủ khi không có truy cập (xem tài liệu 07).
