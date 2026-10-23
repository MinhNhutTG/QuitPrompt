# 09. Kế hoạch tạo video

## 1. Mục tiêu

Cả nhóm nhìn chung một bảng để biết sản phẩm nào cần bao nhiêu video, ai làm, làm tới đâu. Ai cũng lập được kế hoạch; người được giao tự cập nhật trạng thái khi làm xong.

## 2. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Sản phẩm | Dùng chung cho cả nhóm, không phân biệt của ai. Thành viên nào cũng xem, sửa, xoá, tải ảnh được. Người được giao mở được sản phẩm và tạo prompt ngay |
| Tiến độ | Không tự đếm. **Người thực hiện tự chọn** trạng thái: Chưa thực hiện, Còn thiếu, Đã hoàn thành |
| Hiển thị | Luôn hiện kế hoạch của **cả team**; bộ lọc chỉ để thu hẹp, nút "Xem cả team" bỏ lọc |
| Quyền | Ai cũng thêm, sửa (sản phẩm, mục tiêu, người thực hiện, hạn) và xoá kế hoạch. Người thêm dòng chọn trạng thái ban đầu; sau khi lưu thì chỉ người thực hiện đổi được trạng thái |
| Thứ tự | Kế hoạch chưa xong lên trước (hạn gần nhất trước, không có hạn ở cuối), **đã hoàn thành xuống cuối** |

## 3. Trạng thái

| Trạng thái | Mã | Số đã làm |
|---|---|---|
| Chưa thực hiện | `todo` | 0 |
| Còn thiếu | `partial` | Người thực hiện gõ số đã làm (0 đến mục tiêu − 1); bảng hiện "7/10" và "Còn thiếu 3" |
| Đã hoàn thành | `done` | Bằng mục tiêu |

**Quá hạn** không phải trạng thái riêng: là nhãn đỏ hiện thêm khi hạn đã qua mà chưa hoàn thành.

## 4. Màn hình `/plans`

- Mục **Kế hoạch** trên thanh điều hướng (máy tính) và là tab thứ 4 trên điện thoại.
- **Sửa trực tiếp trên bảng**, không mở hộp thoại. Mỗi dòng gồm: ô chọn sản phẩm (có ảnh, tìm được) · ô nhập mục tiêu · ô chọn người thực hiện · ô chọn ngày hạn · ô chọn trạng thái (khi "Còn thiếu" có thêm ô số đã làm) · nút **Lưu** · nút **Xoá**.
- **Thêm kế hoạch:** bấm "+ Thêm kế hoạch" thì một dòng trống (nền nhấn nhẹ) hiện ở đầu bảng, người thực hiện mặc định là mình, hạn mặc định là hôm nay. Điền xong bấm Lưu; bấm Xoá thì bỏ dòng chưa lưu.
- **Dòng đã lưu:** sửa ô nào thì dòng đổi nền và hiện nút Lưu, Huỷ sửa; không sửa gì thì hiện Xoá và Tạo prompt. Ô trạng thái bị khoá với người không phải người thực hiện (rê chuột thấy lý do). Xoá dòng đã lưu hỏi Có/Không.
- **Xoá nhiều:** tick ô đầu mỗi dòng (ô ở tiêu đề chọn cả trang). Lựa chọn giữ khi sang trang khác, đổi bộ lọc thì bỏ chọn. Thanh "Đã chọn N kế hoạch" hiện nút Xoá N kế hoạch, hỏi Có/Không kèm danh sách rồi xoá một lượt (`POST /api/plans/bulk-delete` với `{ ids }`, tối đa 500).
- Kế hoạch đã hoàn thành nằm cuối bảng và mờ đi; quá hạn hiện chữ đỏ dưới ngày hạn.
- Màn hình hẹp hơn 980px (điện thoại, máy tính bảng): mỗi dòng thành một thẻ, các ô xếp dọc có nhãn, không cuộn ngang.
- **Bộ lọc:** tìm theo tên/mã sản phẩm, Người thực hiện (mặc định "Cả team"), Trạng thái (thêm "Chưa xong"), Hạn (Quá hạn, Hôm nay, 7 ngày tới, Tháng này), Loại sản phẩm. Bộ lọc và trang nằm trên URL.
- **Tổng hợp** theo bộ lọc: số kế hoạch, video đã làm / mục tiêu (%), số dòng theo từng trạng thái, số quá hạn.
- Phân trang đánh số, 20 dòng mỗi trang.

## 5. Dữ liệu và API

- Collection `videoplans`: xem [tài liệu 03, mục 2.4](03-thiet-ke-co-so-du-lieu.md).
- API `/api/plans`: xem [tài liệu 04, mục 7](04-dac-ta-api.md).

## 6. Để sau

- Hiện kế hoạch đang chạy ngay trong trang chi tiết sản phẩm.
- Lịch sử ai đổi trạng thái lúc nào; thống kê theo người, theo tuần.
- Đưa kế hoạch vào file xuất dữ liệu.
