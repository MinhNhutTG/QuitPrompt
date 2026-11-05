# 14. Đón sóng: theo dõi xu hướng để làm video trước

## 1. Mục tiêu

Biết **sản phẩm nào sắp lên sóng hoặc đang giữa sóng** để làm video bán hàng ngay, trước khi đông người cùng làm. Có hai loại sóng:

- **Sóng theo lịch**: Tết, 8/3, 20/10, Black Friday, các ngày sale đôi... Biết trước nên chỉ cần chuẩn bị đúng lúc.
- **Sóng bất ngờ**: một sản phẩm tự nhiên được tìm nhiều. Phải theo dõi lượng tìm kiếm mới thấy sớm.

## 2. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Nguồn dữ liệu | **Google Trends** (Việt Nam, 90 ngày, từng ngày) và **gợi ý tìm kiếm của TikTok**. Cả hai mở công khai, không cần tài khoản. TikTok Creative Center và Shopee từ chối khi không đăng nhập trình duyệt nên không dùng. Không cào TikTok Shop Seller/Affiliate Center vì dễ bị khoá tài khoản |
| Thang số | Google cho mỗi từ khoá thang 0–100 **so với đỉnh của chính nó** trong 90 ngày, không phải số lượt tìm thật. Hai từ khoá khác nhau không so độ lớn với nhau được, chỉ so được hướng đi |
| Ai làm gì | Ai cũng xem và bấm quét được. Thêm, gắn sản phẩm, bỏ theo dõi cần quyền "Thêm, sửa sản phẩm và ảnh" |
| Quét | Mỗi lúc chỉ một lượt quét trên máy chủ, từng từ khoá một, nghỉ 2,5 giây giữa hai từ khoá để Google không chặn. Từ khoá có dữ liệu cũ hơn 20 giờ được quét lại khi có người mở trang, và máy chủ tự kiểm tra mỗi giờ khi đang thức. Bị Google chặn (429) thì dừng lượt quét và báo "thử lại sau khoảng 1 giờ" |
| Giới hạn | Tối đa 200 từ khoá |

## 3. Cách đọc giai đoạn sóng

Tính trên đường 90 ngày, bỏ hôm nay (chưa đủ ngày):

- `r7` = trung bình 7 ngày gần nhất, `p21` = trung bình 21 ngày trước đó.
- `tăng` = (r7 − p21) / p21. `đỉnh` = trung bình 7 ngày cao nhất trong 90 ngày. `mức` = r7 / đỉnh.

| Giai đoạn | Điều kiện | Nên làm |
|---|---|---|
| **Sắp lên sóng** | tăng ≥ 20% và p21 ≤ 60% đỉnh (đi lên từ mức thấp) | Chuẩn bị video ngay |
| **Đang giữa sóng** | mức ≥ 70% đỉnh, tăng > −15%, và r7 ≥ 1,25 lần mức nền (trung vị 2 tháng trước 4 tuần gần nhất), để từ khoá được tìm đều quanh năm không bị coi là sóng | Làm và đăng hôm nay |
| **Tăng vọt ngắn** | 2 ngày cao nhất chiếm > 60% tổng 7 ngày và ngày cao nhất ≥ 2,5 lần trung vị 21 ngày | Có thể là trào lưu chóng qua, theo dõi thêm |
| **Đang xuống** | tăng ≤ −20% | Ưu tiên sản phẩm khác |
| **Đi ngang** | còn lại | |
| **Ít dữ liệu** | trung bình < 3 và cao nhất < 20, hoặc dưới 35 ngày dữ liệu | Thử cụm ngắn và phổ biến hơn |

Cơ sở: lượng tìm kiếm cho biết nhu cầu ngay lúc này (Choi & Varian, *Predicting the Present with Google Trends*, 2012). Hình dạng đường tăng (tăng đều nhiều ngày) đáng tin hơn tổng lượng hay một ngày tăng vọt (nghiên cứu "buzz trước khi ra mắt", *Marketing Science*). Exploding Topics cũng chỉ nhận xu hướng khi tăng liên tục.

## 4. Giao diện (`/trends`, menu "Đón sóng")

- **Sóng theo lịch · 60 ngày tới**: các ngày mua sắm sắp tới, còn bao nhiêu ngày, ngày bắt đầu chuẩn bị (Tết 6 tuần, 8/3, 20/10, Giáng sinh, Trung thu 4 tuần, khai giảng 5 tuần, 11/11, 12/12, Black Friday 3 tuần...). Ngày đang trong lúc chuẩn bị có viền cam, mùa lớn có dấu ★. Ngày âm lịch (Tết, Trung thu) ghi sẵn đến 2030 trong `client/src/lib/seasons.js`.
- **Thêm từ khoá**: ô từ khoá và chọn sản phẩm (không bắt buộc), rồi bấm "+ Theo dõi". Từ khoá mới được quét ngay.
- **Bộ lọc**: Tất cả, Nên làm ngay (sắp lên sóng và giữa sóng), Sắp lên sóng, Giữa sóng, Tăng vọt, Còn lại. Danh sách xếp theo giai đoạn rồi theo mức tăng.
- **Thẻ từ khoá**: giai đoạn (màu), đường 90 ngày (rê chuột xem từng ngày), "+45% so với 3 tuần trước · đang ở 80% đỉnh 90 ngày", lời khuyên. **Tìm kiếm liên quan đang tăng** của Google (kèm "+70%" hoặc "Đột phá") và **TikTok đang gợi ý** (gợi ý mới xuất hiện so với lần quét trước có nhãn "mới"). Nút "+" để theo dõi luôn cụm đó. Cuối thẻ là sản phẩm đã gắn (có nút "Đánh dấu 🔥" khi đang sắp lên hoặc giữa sóng), "Gắn sản phẩm", "Bỏ theo dõi" (bấm hai lần).

## 5. Dữ liệu (`trendkeywords`)

`keyword`, `key` (chữ thường, duy nhất), `product`, `createdBy`, `series` `[{ d: "YYYY-MM-DD", v }]`, `phase` (`early|mid|spike|flat|down|low|""`), `growth`, `level`, `rising` `[{ q, label, v }]`, `tiktok` `[String]`, `tiktokNew` `[String]`, `scannedAt`, `scanError`.

## 6. API

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/trends` | `{ items, scan }`, sản phẩm gắn kèm tên, 🔥 và ảnh. Có từ khoá cũ hơn 20 giờ thì bắt đầu quét nền |
| GET | `/api/trends/scan` | `{ scan: { running, done, total, error, startedAt, finishedAt } }` |
| POST | `/api/trends/scan` | `{ ids? }`: quét lại những từ khoá đó, không có thì tất cả. 409 khi đang quét |
| POST | `/api/trends` | `{ keyword, product? }` (quyền `product.edit`). 409 khi trùng |
| PATCH | `/api/trends/:id` | `{ product }`: gắn hoặc bỏ gắn (`null`) |
| DELETE | `/api/trends/:id` | Bỏ theo dõi |

Thêm, gắn, bỏ theo dõi và quét đều được ghi vào nhật ký (nhóm "Đón sóng") và thông báo cho cả team.

## 7. Giới hạn cần biết

- Google Trends không có API chính thức. Tool gọi đúng các địa chỉ mà trang web của Google gọi. Google đổi cách làm thì phần này phải sửa.
- Máy chủ trên Render dùng chung IP với nhiều người nên Google có thể chặn thường hơn khi chạy trên máy cá nhân. Bị chặn thì chờ rồi quét lại.
- Từ khoá quá ngách (tên shop, mã sản phẩm) gần như luôn "Ít dữ liệu". Nên theo dõi cụm khách thật sự gõ: loại sản phẩm + đặc điểm ("áo croptop tay dài").
