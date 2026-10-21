# 08. Kế hoạch thực hiện

## 1. Các giai đoạn

| Giai đoạn | Nội dung | Kết quả bàn giao | Trạng thái |
|---|---|---|---|
| 0 | Phân tích, bộ tài liệu này | 9 file `.md` trong `docs/` | Xong, chờ duyệt |
| 1 | Backend | Model, đăng nhập, sản phẩm + ảnh, prompt, cài đặt, chuyển dữ liệu, phục vụ file build | Xong (chưa chạy kiểm thử tự động) |
| 2 | Frontend khung | Router, lazy routes, đăng nhập, layout máy tính và điện thoại, token giao diện | Xong |
| 3 | Bộ tạo prompt | Chuyển logic từ bản tĩnh; ô chọn sản phẩm có ảnh; lưu prompt tốt | Xong |
| 4 | Sản phẩm | Lưới sản phẩm, chi tiết, tải ảnh (nén trên trình duyệt), ảnh đại diện | Xong |
| 5 | Prompt đã lưu, Thư viện, Cài đặt | Tải dần khi cuộn, lọc, thư viện động tác, template, chuyển dữ liệu | Xong, chờ build thử |
| 6 | Kiểm thử và hoàn thiện | Kiểm thử theo mục 2; đo dung lượng JS; sửa giao diện trên điện thoại | Chưa làm |
| 7 | Bàn giao | Mã nguồn `.zip`, README, hướng dẫn deploy | Chưa làm |

Giai đoạn 1 đến 7 làm liên tục sau khi tài liệu được duyệt.

## 2. Kế hoạch kiểm thử

### 2.1 Tự động (chạy trong môi trường build)

| Nhóm | Ca kiểm thử |
|---|---|
| Đăng nhập | Tạo tài khoản; trùng tên → 409; sai mật khẩu → 401; ghi nhớ → cookie có `Max-Age`; `/me` khi chưa đăng nhập → 401; đăng xuất xoá cookie |
| Phân quyền | Tài khoản A không đọc, sửa, xoá được sản phẩm của B; A thấy prompt của B trong danh sách (`mine: false`) nhưng không sửa, xoá được (→ 404) |
| Sản phẩm | Tạo, sửa, xoá; xoá sản phẩm xoá luôn prompt; tìm theo tên và mã |
| Prompt | Lưu theo `product`; lưu theo `productName` mới → tạo sản phẩm; phân trang con trỏ không trùng không sót; tìm theo ghi chú và tên sản phẩm; `promptCount` tăng giảm đúng |
| Ảnh | Không có Cloudinary → 503 rõ ràng; file không phải ảnh → 400; quá 12 ảnh → 400 (Cloudinary thật được giả lập khi test) |
| Chuyển dữ liệu | Nhập file bản tĩnh mẫu; nhập lần hai không trùng |
| Ghép prompt | Kết quả giống hệt bản tĩnh với cùng lựa chọn; chia thời gian đúng ví dụ ở tài liệu 06; bỏ `back view` khi có động tác nhãn B |

### 2.2 Giao diện (trình duyệt tự động, khổ 390px và 1280px)

- Đăng nhập, vào lại bằng cookie mà không thấy màn hình đăng nhập.
- Tạo prompt, copy, lưu prompt với sản phẩm mới.
- Dùng lại và chỉnh từ prompt đã lưu ra đúng lựa chọn cũ.
- Trang không cuộn ngang trên điện thoại; giao diện tối đọc rõ.
- Kiểm tra mỗi trang là một file JS riêng sau khi build; dung lượng JS ban đầu dưới 150 KB gzip.

### 2.3 Người dùng kiểm tra trước khi dùng thật

1. Tạo tài khoản, đăng xuất, đăng nhập lại trên điện thoại.
2. Tạo 2 sản phẩm, tải ảnh chụp từ điện thoại.
3. Tạo và lưu 3 prompt, thử Dùng lại và chỉnh.
4. Nhập dữ liệu từ bản tĩnh cũ.

## 3. Rủi ro và cách xử lý

| Rủi ro | Khả năng | Ảnh hưởng | Cách xử lý |
|---|---|---|---|
| Máy chủ free ngủ, mở lần đầu chậm khoảng 1 phút | Cao | Trung bình | Màn hình chờ rõ ràng; ping giữ thức; hoặc nâng gói khi dùng nhiều |
| Hết 25 credit Cloudinary | Thấp | Ảnh không tải được tới cuối tháng | Nén ảnh trước khi tải; ảnh hiển thị luôn thu nhỏ; theo dõi Dashboard |
| Atlas free không sao lưu | Trung bình | Mất dữ liệu nếu lỡ xoá | Nút Xuất dữ liệu, nhắc sao lưu hằng tuần |
| Quên mật khẩu, chưa có email để lấy lại | Trung bình | Không vào được tài khoản | Người quản trị đặt lại mật khẩu bằng một lệnh script đi kèm |
| Template bị sửa hỏng | Thấp | Prompt sai | Nút Khôi phục mặc định; prompt đã lưu giữ nguyên văn |
| Ảnh HEIC từ iPhone không xem được trên một số trình duyệt | Trung bình | Không xem trước được | Nén và chuyển sang JPEG trên trình duyệt trước khi tải; Cloudinary trả `f_auto` |

## 4. Câu hỏi cần chốt trước khi code

Nếu không có ý kiến khác, app sẽ làm theo **mặc định** ở cột phải.

| # | Câu hỏi | Mặc định đề xuất |
|---|---|---|
| Q1 | Ai dùng app: chỉ bạn, hay cả nhóm với tài khoản riêng? | Nhiều tài khoản, dữ liệu tách riêng; tắt đăng ký sau khi tạo xong |
| Q2 | Các thành viên có cần **dùng chung** sản phẩm và prompt không? | Chưa (để giai đoạn sau) |
| Q3 | Nơi deploy | Render + Atlas + Cloudinary, đều miễn phí |
| Q4 | Có cần chọn công cụ video (Meta AI, Dola AI) để template tự đổi theo công cụ không? | Chưa; chỉ ghi tên công cụ khi lưu prompt |
| Q5 | Số ảnh tối đa mỗi sản phẩm | 12 |
| Q6 | Thời lượng video | 10, 15, 20 giây như hiện tại |
| Q7 | Giữ nhận diện màu mận và font hiện tại? | Giữ |
