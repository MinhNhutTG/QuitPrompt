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
| Tiến độ | **Tự cập nhật** theo số mục đã có (4 file + 2 đoạn text), mỗi khi tải lên, xoá file hoặc sửa text: 0 mục là Chưa thực hiện, có một phần là Còn thiếu, đủ 6/6 là Đã hoàn thành. Thành viên nào cũng tự chọn được trạng thái, kể cả xác nhận Đã hoàn thành khi chưa đủ mục (giữ nguyên cho tới khi có người đổi). **Đã đăng bài** chỉ chọn tay, sau đó tải/xoá file hay sửa text không làm đổi trạng thái nữa. Bảng hiện thêm "Đã có x/6 mục" |
| Hiển thị | Luôn hiện kế hoạch của **cả team**; bộ lọc chỉ để thu hẹp, nút "Xem cả team" bỏ lọc |
| Quyền | `plan.edit`: thêm, sao chép, sửa sản phẩm, người thực hiện, hạn, ghi chú. `plan.delete`: xoá. **Mọi thành viên** làm việc được trên kế hoạch của bất kỳ ai: đổi trạng thái, tải lên/xoá file, sửa lời đọc và mô tả, mở QuickEdit. Ai cũng xem và tải file về được |
| Thứ tự | Kế hoạch chưa xong lên trước (hạn gần nhất trước, không có hạn ở cuối), **đã hoàn thành xuống cuối, đã đăng bài ở cuối cùng** |

## 3. Trạng thái

| Trạng thái | Mã |
|---|---|
| Chưa thực hiện | `todo` |
| Còn thiếu | `partial` |
| Đã hoàn thành | `done` |
| Đã đăng bài | `posted` |

Kế hoạch đang Đã hoàn thành nhờ đủ 6/6 mục mà bị xoá bớt mục thì lùi về Còn thiếu (hoặc Chưa thực hiện nếu không còn mục nào). Đã đăng bài là bước sau Đã hoàn thành: chọn tay khi video đã đăng, được tính là xong (tổng hợp % hoàn thành, không bao giờ quá hạn), có số đếm và bộ lọc riêng.

**Quá hạn** không phải trạng thái riêng: là nhãn đỏ hiện thêm khi hạn đã qua mà chưa hoàn thành.

Kế hoạch cũ có trường mục tiêu (số video); trường này không còn hiện và kế hoạch mới luôn lưu mục tiêu 1.

## 4. Màn hình `/plans`

- Mục **Kế hoạch** trên thanh điều hướng (máy tính) và là tab thứ 4 trên điện thoại.
- **Mỗi kế hoạch là một tờ giấy note** (kiểu giấy dán tường: màu pastel, giấy kẻ dòng, một miếng băng dính ở mép trên, hơi nghiêng, thẳng lại khi rê chuột). Màu giấy và băng dính cố định theo từng kế hoạch. Các thẻ xếp thành lưới, thẻ nhỏ gọn (khoảng 4 cột trên máy tính, 1 cột trên điện thoại, không cuộn ngang).
- **Sửa trực tiếp trên thẻ**, không mở hộp thoại. Mỗi thẻ gồm: ảnh nhỏ và tên sản phẩm (bấm để mở chi tiết), "Đã có x/6 mục" · Người làm · Hạn (chữ đỏ "Quá hạn" dưới nhãn) · Trạng thái · các nút.
- **Ghim:** nút ghim ở góc phải trên của thẻ, mọi thành viên bấm được. Thẻ đã ghim hiện đinh ghim đỏ thay cho băng dính, không nghiêng, và **luôn nằm đầu danh sách** cho cả team (ghim sau cùng đứng trước), trước cả thứ tự hạn và trạng thái. Bấm lần nữa để bỏ ghim.
- **Thêm kế hoạch:** bấm "+ Thêm kế hoạch" thì một thẻ trống (viền nét đứt) hiện ở đầu lưới, người thực hiện mặc định là mình, hạn mặc định là hôm nay. Điền xong bấm Lưu; máy chủ tạo luôn thư mục trên Drive. Không tạo được thư mục thì vẫn lưu kế hoạch và báo lý do. Bấm Xoá thì bỏ thẻ chưa lưu.
- **Thẻ đã lưu:** sửa ô nào thì thẻ có viền xanh và hiện nút Lưu, Huỷ sửa; không sửa gì thì hiện **Chi tiết**, **Tải video** (khi đã có video thành phẩm), **Prompt** (tạo prompt cho sản phẩm), biểu tượng **Sao chép** và **Xoá**.
- **Sao chép** (cần `plan.edit`, có ở cả trang danh sách và trang chi tiết): hộp thoại tạo kế hoạch mới cùng sản phẩm, người thực hiện, hạn nộp, ghi chú; trạng thái "Chưa thực hiện", ngày tạo là hôm nay, thư mục Drive riêng. Tick để chép thêm lời đọc và mô tả (mặc định có) và từng file đã có (mặc định không; file được nhân bản trên Drive vào thư mục mới). Xong thì mở luôn kế hoạch mới. Xoá kế hoạch hỏi Có/Không.
- **Xoá nhiều:** tick ô ở góc trái trên mỗi thẻ ("Chọn mọi kế hoạch trên trang này" phía trên lưới chọn cả trang). Lựa chọn giữ khi sang trang khác, đổi bộ lọc thì bỏ chọn. Thanh "Đã chọn N kế hoạch" hiện nút Xoá N kế hoạch, hỏi Có/Không kèm danh sách rồi xoá một lượt (`POST /api/plans/bulk-delete` với `{ ids }`, tối đa 500).
- Kế hoạch đã hoàn thành và đã đăng bài nằm cuối (sau các thẻ ghim và thẻ chưa xong), nội dung mờ đi.
- **Bộ lọc:** tìm theo tên/mã sản phẩm, Người thực hiện (mặc định "Cả team"), Trạng thái (thêm "Chưa xong"), Hạn (Quá hạn, Hôm nay, 7 ngày tới, Tháng này), Loại sản phẩm. Bộ lọc và trang nằm trên URL.
- **Tổng hợp** theo bộ lọc: số kế hoạch, số đã hoàn thành (%), số kế hoạch theo từng trạng thái, số quá hạn.
- Phân trang đánh số, 20 thẻ mỗi trang.

## 5. Màn hình chi tiết `/plans/:id`

- Đầu trang: ảnh và tên sản phẩm (bấm để mở sản phẩm), "Đã có x/6 mục", nút Tạo prompt.
- **Lấy file và text** (hiện khi đã có ít nhất một file hoặc text; viền xanh và tiêu đề "Thành phẩm đã xong" khi kế hoạch hoàn thành): nút tải từng file (video thành phẩm nổi bật), **Tải tất cả** (tải lần lượt từng file, trình duyệt có thể hỏi cho phép tải nhiều file), **Copy lời đọc**, **Copy mô tả khi đăng**. Mọi thành viên dùng được, kể cả khi kế hoạch đã hoàn thành.
- **Thông tin:** người thực hiện, hạn nộp (kèm "Quá hạn"), trạng thái (thành viên nào cũng đổi ngay tại đây), người tạo, ngày tạo, thư mục Drive (bấm để mở trong trang Google Drive của app).
- **File:** 4 mục Video 10s 1, Video 10s 2, Lời đọc (mp3), Video thành phẩm. Mỗi mục hiện tên file và dung lượng, nút **Tải về**, **Tải lên** (chưa có) hoặc **Thay** (đã có), **Xoá** (bấm hai lần). Tải lên có thanh phần trăm; file đi thẳng từ trình duyệt lên Google như trang Drive.
- **Lời đọc** và **Mô tả khi đăng:** ô nhập nhiều dòng (tối đa 5000 ký tự), nút Lưu và Huỷ sửa khi có thay đổi, nút Copy khi đã lưu.
- Drive chưa kết nối: hiện thông báo, nút tải lên bị khoá; vẫn xem và sửa text được.

## 6. Dữ liệu và API

- Collection `videoplans`: xem [tài liệu 03, mục 2.4](03-thiet-ke-co-so-du-lieu.md).
- API `/api/plans`: xem [tài liệu 04, mục 7](04-dac-ta-api.md).

## 7. Dựng video bằng QuickEdit

- Trang chi tiết có nút **Tạo video** khi kế hoạch đã có Video 10s 1, Video 10s 2 và **Lời đọc (file mp3 hoặc đoạn text lời đọc)**, cho mọi thành viên.
- Bấm nút: máy chủ cấp một mã cho riêng kế hoạch đó (`POST /api/plans/:id/quickedit` → `{ token, expiresAt }`), trình duyệt mở `quickedit://open?site=<địa chỉ app>&token=<mã>`, tức app QuickEdit trên máy (app desktop, cài riêng). Máy chưa có QuickEdit thì không có gì xảy ra.
- Mã sống 12 giờ, chỉ dùng được với kế hoạch đó, mất hiệu lực khi người dùng đổi mật khẩu, bị khoá hoặc đăng xuất mọi nơi; không dùng thay cookie đăng nhập được.
- QuickEdit dùng mã ở header `Authorization: Bearer` với `/api/quickedit`: `GET /plan` (tên sản phẩm, ngày, lời đọc, mô tả, danh sách file, `accepts`: các mục QuickEdit được gửi lên), `GET /files/:slot` (tải file từ Drive), `POST /uploads` `{ slot, size }` (mở phiên tải lên vào thư mục kế hoạch: `slot` là `final` cho “Video thành phẩm.mp4”, mặc định, hoặc `audio` cho “Lời đọc.mp3”), `POST /files` `{ slot, fileId }` (đặt file vào mục đó, file cũ vào thùng rác, tiến độ tự cập nhật). Mỗi lần gọi đều kiểm tra người dùng vẫn được làm kế hoạch đó.
- **Giọng đọc (text to speech):** kế hoạch chỉ có text lời đọc thì QuickEdit mở ở tab **Giọng**, đọc text thành mp3 ngay trên máy (VieNeu-TTS, giọng clone từ ghi âm mẫu hoặc giọng có sẵn), nút “Gửi lên kế hoạch” đưa mp3 vào mục Lời đọc. Không tốn phí và không qua máy chủ QuickPrompt.
- Nhật ký ghi “Mở kế hoạch trong QuickEdit” và “Gửi file từ QuickEdit” (kèm tên mục: Video thành phẩm hoặc Lời đọc).

## 8. Lời đọc và mô tả video đã lưu

Mỗi lần viết lời đọc thường ra nhiều bản nhưng chỉ dùng một. Các bản còn lại được lưu ở sản phẩm để kế hoạch sau chọn lại, không phải viết lại.

- **Trang chi tiết sản phẩm**, mục **Lời đọc & mô tả video**: mỗi mục là một cặp *lời đọc + mô tả video*, hoặc *chỉ mô tả video* (mô tả bắt buộc, lời đọc để trống được). Nút **+ Thêm lời đọc** mở form; lưu xong form vẫn mở để nhập tiếp bản khác.
- Trạng thái **Chưa dùng** / **Đã dùng**, lọc theo trạng thái (mặc định Chưa dùng). Mỗi thẻ: Copy lời đọc, Copy mô tả, Đánh dấu đã dùng/chưa dùng, Sửa, Xoá (bấm hai lần). Thẻ đã dùng ghi ngày dùng và link tới kế hoạch đã dùng nó.
- **Tạo kế hoạch:** chọn sản phẩm xong, tờ ghi chú có thêm ô **Lời đọc** liệt kê các cặp của sản phẩm (Chưa dùng trước). Chọn một cặp thì kế hoạch mới có sẵn lời đọc và mô tả khi đăng (trạng thái chuyển "Còn thiếu" nếu để "Chưa thực hiện"), cặp đó tự chuyển **Đã dùng**.
- **Chi tiết kế hoạch:** nút **Chọn từ lời đọc đã lưu** thay cả hai text của kế hoạch bằng một cặp đã lưu, và đánh dấu cặp đó đã dùng.
- Thêm, sửa, đánh dấu, xoá cần quyền "Thêm, sửa sản phẩm và ảnh"; ai cũng xem được. Xoá sản phẩm thì xoá luôn các lời đọc của nó.
- Dữ liệu: collection `scripts` `{ product, voiceText, caption, used, usedAt, usedPlan, createdBy }`. API: `GET/POST /api/products/:id/scripts`, `PATCH/DELETE /api/products/:id/scripts/:sid` (`PATCH` nhận `voiceText`, `caption`, `used`); `POST /api/plans` và `PATCH /api/plans/:id` nhận thêm `script` (id cặp của đúng sản phẩm đó).

## 9. Để sau

- Hiện kế hoạch đang chạy ngay trong trang chi tiết sản phẩm.
- Lịch sử ai đổi trạng thái lúc nào; thống kê theo người, theo tuần.
- Đưa kế hoạch vào file xuất dữ liệu.
- Thêm mục ảnh (nhiều ảnh) cho mỗi kế hoạch.
