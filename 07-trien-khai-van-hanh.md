# 07. Triển khai và vận hành

## 1. Phương án deploy miễn phí

| Thành phần | Dịch vụ | Gói | Vai trò |
|---|---|---|---|
| Cơ sở dữ liệu | MongoDB Atlas | Free (M0) | Lưu tài khoản, sản phẩm, prompt, cài đặt |
| Ảnh | Cloudinary | Free | Lưu ảnh sản phẩm, CDN, thu nhỏ ảnh |
| Máy chủ + giao diện | Render | Free Web Service | Chạy Node.js, phục vụ cả API và file React đã build |
| Mã nguồn | GitHub | Free | Render tự deploy mỗi khi đẩy mã mới |

### Giới hạn cần biết (kiểm tra tháng 10/2026)

**Render (Free Web Service)**
- Không có truy cập trong **15 phút** thì máy chủ ngủ. Lần mở tiếp theo phải chờ **khoảng 1 phút** để máy chủ khởi động lại.
- 750 giờ chạy miễn phí mỗi tháng cho cả tài khoản. Một dịch vụ chạy liên tục cả tháng khoảng 744 giờ, nên đủ cho một dịch vụ.
- Ổ đĩa không lưu lâu dài. App không lưu gì trên ổ đĩa máy chủ, ảnh nằm ở Cloudinary và dữ liệu ở Atlas, nên không bị ảnh hưởng.

**Cloudinary (Free)**
- 25 credit mỗi tháng, không cần thẻ.
- 1 credit bằng **một trong**: 1 GB lưu trữ, **hoặc** 1 GB băng thông ảnh, **hoặc** 1.000 lần biến đổi ảnh.
- Ước tính: ảnh đã nén khoảng 400 KB, 500 sản phẩm × 4 ảnh ≈ 0,8 GB lưu trữ. Ảnh thu nhỏ hiển thị chỉ vài chục KB. Nằm gọn trong 25 credit.

**MongoDB Atlas (Free)**
- 512 MB, đủ cho khoảng 80.000 prompt (tài liệu 03).
- Không có sao lưu tự động. Dùng chức năng **Xuất dữ liệu** của app định kỳ.

### Giảm ảnh hưởng của việc máy chủ ngủ

- Màn hình chờ ghi rõ "Máy chủ đang khởi động, chờ khoảng 1 phút", tự thử lại, không báo lỗi.
- Nếu cần mở là có ngay: dùng dịch vụ ping miễn phí (ví dụ UptimeRobot) gọi `/api/health` mỗi 10 phút trong giờ làm việc. Lưu ý việc này dùng hết giờ miễn phí nhanh hơn nếu có nhiều dịch vụ.
- Hoặc nâng gói Render trả phí thấp nhất khi dùng thường xuyên.

## 2. Biến môi trường

| Biến | Bắt buộc | Ví dụ | Ghi chú |
|---|---|---|---|
| `MONGODB_URI` | Có | `mongodb+srv://user:pass@cluster0.xxx.mongodb.net/prompt-studio` | Lấy ở Atlas → Connect → Drivers |
| `JWT_SECRET` | Có | chuỗi ngẫu nhiên 64+ ký tự | Đổi chuỗi này là đăng xuất mọi người |
| `CLOUDINARY_URL` | Có (để tải ảnh) | `cloudinary://KEY:SECRET@CLOUD_NAME` | Lấy ở Cloudinary → Settings → API Keys |
| `ALLOW_REGISTER` | Không | `true` / `false` | Tạo xong tài khoản cho nhóm thì đặt `false` |
| `NODE_ENV` | Có khi deploy | `production` | Bật cookie Secure, phục vụ file build |
| `PORT` | Không | `4000` | Render tự cấp |
| `CLIENT_ORIGIN` | Không | `http://localhost:5173` | Chỉ khi frontend gọi thẳng API ở domain khác (không dùng khi đi qua rewrite của Vercel) |
| `TRUST_PROXY` | Không | `1` / `2` | Số tầng proxy trước server: `1` khi chỉ có Render, `2` khi đi qua rewrite của Vercel. Sai số này thì chống dò mật khẩu tính nhầm IP |

## 3. Các bước deploy

### Bước 1. MongoDB Atlas
1. Tạo tài khoản tại mongodb.com/atlas, tạo cluster **Free**, chọn vùng gần Việt Nam (Singapore).
2. **Database Access:** tạo user và mật khẩu.
3. **Network Access:** thêm `0.0.0.0/0`, vì Render free không có IP cố định.
4. **Connect → Drivers:** copy chuỗi kết nối, thêm tên database `prompt-studio` sau dấu `/`.

### Bước 2. Cloudinary
1. Tạo tài khoản tại cloudinary.com.
2. **Settings → API Keys:** copy biến môi trường dạng `CLOUDINARY_URL=cloudinary://...`.

### Bước 3. GitHub
1. Tạo repo **private**, đẩy toàn bộ thư mục `prompt-studio` lên.
2. Kiểm tra `.env` **không** bị đẩy lên (đã có trong `.gitignore`).

### Bước 4. Render
1. Tạo tài khoản tại render.com, chọn **New → Web Service**, kết nối repo.
2. Thiết lập:
   - Runtime: **Node**
   - Build Command: `npm run build`
   - Start Command: `npm start`
   - Instance Type: **Free**
   - Health Check Path: `/api/health`
3. Thêm các biến môi trường ở mục 2.
4. Bấm Deploy. Lần đầu mất khoảng 3 đến 5 phút. Địa chỉ có dạng `https://xuong-prompt.onrender.com`.

Có sẵn file `render.yaml` để tạo bằng **Blueprint** nếu muốn.

### Bước 4b. Vercel (tuỳ chọn: giao diện trên CDN, API vẫn ở Render)
Giao diện mở ngay cả khi máy chủ Render đang ngủ, rồi hiện màn hình chờ trong lúc Render thức dậy.

1. Tạo tài khoản tại vercel.com, chọn **Add New → Project**, import repo.
2. **Root Directory:** `client`. Các thiết lập còn lại lấy từ `client/vercel.json`.
3. Không cần biến môi trường nào trên Vercel.
4. Nếu địa chỉ Render khác `https://xuong-prompt.onrender.com`, sửa dòng `destination` trong `client/vercel.json`.

`/api/*` đi qua **rewrite** của Vercel sang Render, nên trình duyệt chỉ thấy một tên miền: cookie đăng nhập vẫn là cookie cùng trang, không bị Safari hay Chrome chặn như cookie bên thứ ba. Không gọi thẳng API Render từ domain Vercel.

Trên Render, phần giao diện vẫn chạy ở địa chỉ `onrender.com` làm bản dự phòng.

### Bước 5. Sau khi deploy
1. Mở địa chỉ (Vercel nếu có, không thì Render), chọn **Tạo tài khoản**.
2. Tạo đủ tài khoản cho nhóm, rồi đặt `ALLOW_REGISTER=false` trên Render.
3. Vào **Cài đặt → Chuyển dữ liệu**, nhập file sao lưu `.json` từ bản tĩnh cũ.

## 4. Chạy trên máy để phát triển

```bash
# Yêu cầu: Node.js 20.6 trở lên
cp server/.env.example server/.env      # rồi điền giá trị
npm install                              # cài cho cả server và client
npm run dev                              # server :4000 + giao diện :5173 (tự proxy /api)
```

MongoDB khi phát triển: dùng luôn Atlas, hoặc cài MongoDB Community trên máy (`mongodb://127.0.0.1:27017/prompt-studio`).

## 5. Chuyển dữ liệu từ bản tĩnh

1. Mở bản tĩnh cũ, tab **Prompt đã lưu → Sao lưu và chuyển máy → Copy dữ liệu sao lưu** (hoặc tải file `.json`).
2. App mới: **Cài đặt → Chuyển dữ liệu → Nhập**, dán nội dung hoặc chọn file.
3. App tự tạo sản phẩm theo tên, nhập prompt kèm thời điểm lưu gốc và các động tác riêng. Nhập lại lần hai không bị trùng.
4. Sau đó vào từng sản phẩm để thêm ảnh.

Bản trên Claude và bản tĩnh trên Netlify có dữ liệu riêng: cần nhập từ từng nơi nếu đã dùng cả hai.

## 6. Sao lưu và khôi phục

| Việc | Cách làm | Tần suất gợi ý |
|---|---|---|
| Sao lưu dữ liệu | Cài đặt → Xuất dữ liệu (`.json`) | Mỗi tuần |
| Khôi phục | Cài đặt → Nhập file `.json` đã xuất | Khi cần |
| Ảnh | Nằm trên Cloudinary; file xuất chứa URL ảnh | |

## 7. Theo dõi

- Render → Logs: xem lỗi máy chủ (lỗi 5xx được ghi log đầy đủ).
- Atlas → Metrics: dung lượng, số kết nối.
- Cloudinary → Dashboard: credit đã dùng trong tháng.

## 8. Cập nhật phiên bản

Đẩy mã mới lên nhánh chính của GitHub, Render tự build và deploy. Người đang mở app chỉ cần tải lại trang. Phiên đăng nhập vẫn giữ nguyên vì cookie không đổi.
