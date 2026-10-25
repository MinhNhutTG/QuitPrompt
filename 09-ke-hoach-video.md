# 09. Kế hoạch tạo video

## 1. Mục tiêu

Cả nhóm nhìn chung một bảng để biết sản phẩm nào đang được làm video, ai làm, làm tới đâu. Mỗi kế hoạch là **một video thành phẩm** và có **thư mục riêng trên Google Drive** chứa mọi file của nó, nên không cần mở Google Drive để tìm: vào chi tiết kế hoạch, tải file lên hoặc tải về ngay ở đó.

## 2. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Sản phẩm | Dùng chung cho cả nhóm, không phân biệt của ai. Thành viên nào cũng xem, sửa, xoá, tải ảnh được. Người được giao mở được sản phẩm và tạo prompt ngay |
| Một kế hoạch gồm | 2 video 10 giây, 1 file mp3 lời đọc, 1 video thành phẩm (đã edit), đoạn text lời đọc, đoạn text mô tả khi đăng. Kèm người tạo, ngày tạo, người thực hiện, hạn nộp, trạng thái, sản phẩm |
| Thư mục Drive | `<thư mục của team>/<DD_MM_YYYY>/<Tên sản phẩm (n)>`. Ngày là **ngày tạo kế hoạch** (giờ Việt Nam), thư mục ngày chưa có thì tự tạo, nhiều kế hoạch cùng ngày nằm chung một thư mục ngày. `n` là số thứ tự nhỏ nhất chưa dùng của sản phẩm đó trong ngày, ví dụ `25_10_2026/Mũ chống nắng 2 (1)` |
| Tên file | Đặt theo mục, giữ đuôi file: `Video 10s 1.mp4`, `Video 10s 2.mp4`, `Lời đọc.mp3`, `Video thành phẩm.mp4`. Tải file mới vào một mục thì file cũ của mục đó vào thùng rác Drive |
| Text | Lời đọc và mô tả khi đăng lưu trong app (MongoDB), không lưu thành file trên Drive |
| Drive chưa kết nối | Kế hoạch vẫn tạo được; thư mục được tạo khi tải file đầu tiên hoặc bấm "Tạo thư mục" trong trang chi tiết |
| Xoá kế hoạch | Thư mục của kế hoạch vào thùng rác Drive (khôi phục được trong 30 ngày). Xoá sản phẩm cũng vậy với mọi kế hoạch của nó |
| Tiến độ | **Tự cập nhật** theo số mục đã có (4 file + 2 đoạn text), mỗi khi tải lên, xoá file hoặc sửa text: 0 mục là Chưa thực hiện, có một phần là Còn thiếu, đủ 6/6 là Đã hoàn thành. Người thực hiện vẫn tự chọn được trạng thái, kể cả xác nhận Đã hoàn thành khi chưa đủ mục (giữ nguyên cho tới khi họ đổi). Bảng hiện thêm "Đã có x/6 mục" |
| Hiển thị | Luôn hiện kế hoạch của **cả team**; bộ lọc chỉ để thu hẹp, nút "Xem cả team" bỏ lọc |
| Quyền | `plan.edit`: thêm, sửa sản phẩm, người thực hiện, hạn. `plan.delete`: xoá. Người thêm dòng chọn trạng thái ban đầu; sau khi lưu thì chỉ người thực hiện đổi được trạng thái. Tải file, xoá file, sửa lời đọc và mô tả: người thực hiện hoặc vai trò có `plan.edit`. Ai cũng xem và tải file về được |
| Thứ tự | Kế hoạch chưa xong lên trước (hạn gần nhất trước, không có hạn ở cuối), **đã hoàn thành xuống cuối** |

## 3. Trạng thái

| Trạng thái | Mã |
|---|---|
| Chưa thực hiện | `todo` |
| Còn thiếu | `partial` |
| Đã hoàn thành | `done` |

Kế hoạch đang Đã hoàn thành nhờ đủ 6/6 mục mà bị xoá bớt mục thì lùi về Còn thiếu (hoặc Chưa thực hiện nếu không còn mục nào).

**Quá hạn** không phải trạng thái riêng: là nhãn đỏ hiện thêm khi hạn đã qua mà chưa hoàn thành.

Kế hoạch cũ có trường mục tiêu (số video); trường này không còn hiện và kế hoạch mới luôn lưu mục tiêu 1.

## 4. Màn hình `/plans`

- Mục **Kế hoạch** trên thanh điều hướng (máy tính) và là tab thứ 4 trên điện thoại.
- **Sửa trực tiếp trên bảng**, không mở hộp thoại. Mỗi dòng gồm: ô chọn sản phẩm (có ảnh, tìm được, bên dưới là "Đã có x/6 mục") · ô chọn người thực hiện · ô chọn ngày hạn · ô chọn trạng thái · nút **Lưu** · nút **Xoá**.
- **Thêm kế hoạch:** bấm "+ Thêm kế hoạch" thì một dòng trống (nền nhấn nhẹ) hiện ở đầu bảng, người thực hiện mặc định là mình, hạn mặc định là hôm nay. Điền xong bấm Lưu; máy chủ tạo luôn thư mục trên Drive. Không tạo được thư mục thì vẫn lưu kế hoạch và báo lý do. Bấm Xoá thì bỏ dòng chưa lưu.
- **Dòng đã lưu:** sửa ô nào thì dòng đổi nền và hiện nút Lưu, Huỷ sửa; không sửa gì thì hiện **Chi tiết**, **Tải video** (khi đã có video thành phẩm), **Sao chép**, Xoá và Tạo prompt.
- **Sao chép** (cần `plan.edit`, có ở cả trang danh sách và trang chi tiết): hộp thoại tạo kế hoạch mới cùng sản phẩm, người thực hiện, hạn nộp, ghi chú; trạng thái "Chưa thực hiện", ngày tạo là hôm nay, thư mục Drive riêng. Tick để chép thêm lời đọc và mô tả (mặc định có) và từng file đã có (mặc định không; file được nhân bản trên Drive vào thư mục mới). Xong thì mở luôn kế hoạch mới. Ô trạng thái bị khoá với người không phải người thực hiện (rê chuột thấy lý do). Xoá dòng đã lưu hỏi Có/Không.
- **Xoá nhiều:** tick ô đầu mỗi dòng (ô ở tiêu đề chọn cả trang). Lựa chọn giữ khi sang trang khác, đổi bộ lọc thì bỏ chọn. Thanh "Đã chọn N kế hoạch" hiện nút Xoá N kế hoạch, hỏi Có/Không kèm danh sách rồi xoá một lượt (`POST /api/plans/bulk-delete` với `{ ids }`, tối đa 500).
- Kế hoạch đã hoàn thành nằm cuối bảng và mờ đi; quá hạn hiện chữ đỏ dưới ngày hạn.
- Màn hình hẹp hơn 980px (điện thoại, máy tính bảng): mỗi dòng thành một thẻ, các ô xếp dọc có nhãn, không cuộn ngang.
- **Bộ lọc:** tìm theo tên/mã sản phẩm, Người thực hiện (mặc định "Cả team"), Trạng thái (thêm "Chưa xong"), Hạn (Quá hạn, Hôm nay, 7 ngày tới, Tháng này), Loại sản phẩm. Bộ lọc và trang nằm trên URL.
- **Tổng hợp** theo bộ lọc: số kế hoạch, số đã hoàn thành (%), số dòng theo từng trạng thái, số quá hạn.
- Phân trang đánh số, 20 dòng mỗi trang.

## 5. Màn hình chi tiết `/plans/:id`

- Đầu trang: ảnh và tên sản phẩm (bấm để mở sản phẩm), "Đã có x/6 mục", nút Tạo prompt.
- **Lấy file và text** (hiện khi đã có ít nhất một file hoặc text; viền xanh và tiêu đề "Thành phẩm đã xong" khi kế hoạch hoàn thành): nút tải từng file (video thành phẩm nổi bật), **Tải tất cả** (tải lần lượt từng file, trình duyệt có thể hỏi cho phép tải nhiều file), **Copy lời đọc**, **Copy mô tả khi đăng**. Mọi thành viên dùng được, kể cả khi kế hoạch đã hoàn thành.
- **Thông tin:** người thực hiện, hạn nộp (kèm "Quá hạn"), trạng thái (người thực hiện đổi ngay tại đây), người tạo, ngày tạo, thư mục Drive (bấm để mở trong trang Google Drive của app).
- **File:** 4 mục Video 10s 1, Video 10s 2, Lời đọc (mp3), Video thành phẩm. Mỗi mục hiện tên file và dung lượng, nút **Tải về**, **Tải lên** (chưa có) hoặc **Thay** (đã có), **Xoá** (bấm hai lần). Tải lên có thanh phần trăm; file đi thẳng từ trình duyệt lên Google như trang Drive.
- **Lời đọc** và **Mô tả khi đăng:** ô nhập nhiều dòng (tối đa 5000 ký tự), nút Lưu và Huỷ sửa khi có thay đổi, nút Copy khi đã lưu.
- Drive chưa kết nối: hiện thông báo, nút tải lên bị khoá; vẫn xem và sửa text được.

## 6. Dữ liệu và API

- Collection `videoplans`: xem [tài liệu 03, mục 2.4](03-thiet-ke-co-so-du-lieu.md).
- API `/api/plans`: xem [tài liệu 04, mục 7](04-dac-ta-api.md).

## 7. Để sau

- Hiện kế hoạch đang chạy ngay trong trang chi tiết sản phẩm.
- Lịch sử ai đổi trạng thái lúc nào; thống kê theo người, theo tuần.
- Đưa kế hoạch vào file xuất dữ liệu.
- Thêm mục ảnh (nhiều ảnh) cho mỗi kế hoạch.
