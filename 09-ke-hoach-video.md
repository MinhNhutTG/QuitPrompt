# 09. Kế hoạch tạo video

## 1. Mục tiêu

Cả nhóm nhìn chung một bảng để biết sản phẩm nào cần bao nhiêu video, ai làm, làm tới đâu. Ai cũng lập được kế hoạch; người được giao tự cập nhật trạng thái khi làm xong.

## 2. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Sản phẩm | Dùng chung cho cả nhóm, không phân biệt của ai. Thành viên nào cũng xem, sửa, xoá, tải ảnh được. Người được giao mở được sản phẩm và tạo prompt ngay |
| Tiến độ | Không tự đếm. **Người thực hiện tự chọn** trạng thái: Chưa thực hiện, Còn thiếu, Đã hoàn thành |
| Quyền | Ai cũng lập, sửa (mục tiêu, người thực hiện, hạn, ghi chú) và xoá kế hoạch. Chỉ người thực hiện đổi được trạng thái |

## 3. Trạng thái

| Trạng thái | Mã | Số đã làm |
|---|---|---|
| Chưa thực hiện | `todo` | 0 |
| Còn thiếu | `partial` | Người thực hiện gõ số đã làm (0 đến mục tiêu − 1); bảng hiện "7/10" và "Còn thiếu 3" |
| Đã hoàn thành | `done` | Bằng mục tiêu |

**Quá hạn** không phải trạng thái riêng: là nhãn đỏ hiện thêm khi hạn đã qua mà chưa hoàn thành.

## 4. Màn hình `/plans`

- Mục **Kế hoạch** trên thanh điều hướng (máy tính) và là tab thứ 4 trên điện thoại.
- **Lập kế hoạch:** chọn một hoặc nhiều sản phẩm (mỗi sản phẩm thành một dòng), mục tiêu số video, người thực hiện (danh sách thành viên), hạn (không bắt buộc), ghi chú.
- **Bảng:** Sản phẩm (ảnh, tên, loại, mã, ghi chú) · Mục tiêu · Người thực hiện · Hạn · Trạng thái · Tạo prompt / Sửa / Xoá.
  - Dòng giao cho mình: ô Trạng thái là ô chọn; khi "Còn thiếu" thì có ô số đã làm.
  - Dòng của người khác: Trạng thái chỉ hiện nhãn màu.
  - Xoá hỏi Có/Không.
  - Điện thoại: mỗi dòng thành một thẻ, không cuộn ngang.
- **Bộ lọc:** tìm theo tên/mã sản phẩm, Người thực hiện, Trạng thái (thêm "Chưa xong"), Hạn (Quá hạn, Hôm nay, 7 ngày tới, Tháng này), Loại sản phẩm, nút nhanh **"Việc của tôi chưa xong"**. Bộ lọc và trang nằm trên URL.
- **Tổng hợp** theo bộ lọc: số kế hoạch, video đã làm / mục tiêu (%), số dòng theo từng trạng thái, số quá hạn.
- Phân trang đánh số, 20 dòng mỗi trang, hạn gần nhất lên trước.

## 5. Dữ liệu và API

- Collection `videoplans`: xem [tài liệu 03, mục 2.4](03-thiet-ke-co-so-du-lieu.md).
- API `/api/plans`: xem [tài liệu 04, mục 7](04-dac-ta-api.md).

## 6. Để sau

- Hiện kế hoạch đang chạy ngay trong trang chi tiết sản phẩm.
- Lịch sử ai đổi trạng thái lúc nào; thống kê theo người, theo tuần.
- Đưa kế hoạch vào file xuất dữ liệu.
