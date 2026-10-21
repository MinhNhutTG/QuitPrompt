# 04. Đặc tả API

## Quy ước chung

- Gốc: `/api`. Dữ liệu gửi và nhận là JSON (trừ tải ảnh dùng `multipart/form-data`).
- Xác thực: cookie `ps_session` (httpOnly) do máy chủ đặt khi đăng nhập. Trình duyệt tự gửi kèm; giao diện gọi `fetch` với `credentials: "include"`.
- Mọi route trừ nhóm `/api/auth` (trừ `/me` và `/password`) và `/api/health` đều cần đăng nhập. Chưa đăng nhập hoặc hết hạn thì trả `401`.
- Lỗi luôn có dạng:

```json
{ "error": "Câu tiếng Việt nói rõ chuyện gì và cách sửa." }
```

| Mã | Khi nào |
|---|---|
| 400 | Dữ liệu không hợp lệ (thiếu trường, sai định dạng, quá dài, quá nhiều ảnh) |
| 401 | Chưa đăng nhập, hết phiên, sai mật khẩu |
| 403 | Đăng ký đang tắt |
| 404 | Không tìm thấy, hoặc không thuộc về người đang đăng nhập |
| 409 | Tên đăng nhập đã có người dùng |
| 413 | Ảnh vượt 10 MB |
| 429 | Đăng nhập sai quá nhiều lần |
| 503 | Chưa cấu hình Cloudinary |
| 500 | Lỗi máy chủ (không lộ chi tiết) |

---

## 1. Hệ thống

### `GET /api/health`
Kiểm tra máy chủ còn sống và đã nối được cơ sở dữ liệu. Dùng cho Render và cho màn hình "Máy chủ đang khởi động".

```json
200 { "ok": true, "db": "up" }
```

---

## 2. Xác thực `/api/auth`

### `GET /api/auth/config`
```json
200 { "allowRegister": true }
```
Giao diện dùng để ẩn hoặc hiện chế độ "Tạo tài khoản".

### `POST /api/auth/register`
```json
// gửi
{ "username": "minh.shop", "password": "matkhau123", "remember": true }
// nhận 201 + Set-Cookie
{ "user": { "id": "6719ff...", "username": "minh.shop", "displayName": "minh.shop" } }
```
Luật: `username` 3–30 ký tự `[a-z0-9_.]` (tự chuyển chữ thường), `password` 6–100 ký tự. Lỗi: 400, 403, 409, 429.

### `POST /api/auth/login`
Gửi giống register. `remember: true` → cookie 30 ngày; `false` → cookie phiên (đóng trình duyệt là mất), token hết hạn sau 1 ngày.
```json
200 { "user": { ... } }   // + Set-Cookie
401 { "error": "Sai tên đăng nhập hoặc mật khẩu." }
```

### `POST /api/auth/logout`
Xoá cookie. `200 { "ok": true }`

### `GET /api/auth/me` (cần đăng nhập)
```json
200 { "user": { ... } }
```
Giao diện gọi đầu tiên khi mở app để quyết định vào thẳng hay hiện màn hình đăng nhập.

### `POST /api/auth/password` (cần đăng nhập)
```json
{ "current": "matkhau123", "next": "matkhaumoi456" }
200 { "ok": true }
400 { "error": "Mật khẩu hiện tại không đúng." }
```

---

## 3. Sản phẩm `/api/products`

### `GET /api/products?q=&limit=`
Danh sách sản phẩm **của cả nhóm**, mới cập nhật trước. Sản phẩm dùng chung: thành viên nào cũng xem, sửa, xoá, tải ảnh được. Xoá sản phẩm xoá luôn prompt và kế hoạch video của nó. `q` tìm theo tên hoặc mã (không phân biệt hoa thường). Tối đa 500.
```json
200 {
  "items": [
    { "_id": "671a0c...", "name": "Nón chống nắng vành rộng", "sku": "N12",
      "extraNeg": "shrinking brim", "closed": true,
      "images": [ { "url": "...", "publicId": "...", "width": 1500, "height": 2000 } ],
      "promptCount": 3, "lastPromptAt": "...", "updatedAt": "..." }
  ]
}
```

### `POST /api/products`
```json
{ "name": "Áo mưa poncho", "sku": "AM02", "category": "Áo khoác", "note": "", "extraNeg": "missing hood", "closed": true }
201 { "item": { ...sản phẩm đầy đủ } }
```

### `GET /api/products/:id`
`200 { "item": { ... } }`, hoặc `404`.

### `PATCH /api/products/:id`
Gửi một phần các trường như `POST`. `200 { "item": { ... } }`

### `DELETE /api/products/:id`
Xoá sản phẩm, ảnh trên Cloudinary và mọi prompt của nó. `200 { "ok": true }`

### `POST /api/products/:id/images`
`multipart/form-data`, trường `images` (một hoặc nhiều file, tối đa 8 mỗi lần, mỗi file tối đa 10 MB, tổng tối đa 12 ảnh mỗi sản phẩm). Nhận JPG, PNG, WEBP, GIF, HEIC, AVIF.
```json
201 { "item": { ...sản phẩm với mảng images mới } }
```

### `DELETE /api/products/:id/images?publicId=...`
`200 { "item": { ... } }`

### `POST /api/products/:id/cover`
```json
{ "publicId": "prompt-studio/.../abc" }
200 { "item": { ... } }   // ảnh đó lên vị trí đầu
```

---

## 4. Prompt tốt `/api/prompts`

### `GET /api/prompts/filters`
Lựa chọn cho bộ lọc ở trang Prompt đã lưu (cũng dùng làm gợi ý loại khi sửa sản phẩm).
```json
200 { "members": [ { "id": "671...", "username": "nhut", "displayName": "Nhựt" } ],
      "categories": ["Áo", "Nón"] }
```

### `GET /api/prompts?by=&mine=&category=&from=&to=&product=&q=&page=&cursor=&limit=`
Trả prompt đã lưu của **mọi thành viên**, mới nhất trước. Các bộ lọc kết hợp với nhau (và).
- `by`: id thành viên đã lưu. `mine=1`: chỉ prompt của tài khoản đang đăng nhập.
- `category`: loại sản phẩm, không phân biệt hoa thường; `__none` là sản phẩm chưa phân loại.
- `from`, `to`: thời điểm ISO, lọc `createdAt` trong `[from, to)`. Giao diện tự tính đầu ngày theo giờ máy người dùng.
- `product`: lọc theo một sản phẩm.
- `q`: tìm trong ghi chú, công cụ, tên hoặc mã sản phẩm.
- `limit`: mặc định 20, tối đa 50.
- Phân trang, chọn một trong hai:
  - `page` (từ 1): trang đánh số, trả thêm `total`, `page`, `pages`, `limit`. Trang vượt quá thì trả trang cuối. Trang Prompt đã lưu dùng cách này.
  - `cursor`: `_id` của mục cuối trang trước, trả `nextCursor` (ổn định khi có prompt mới chen vào). Trang chi tiết sản phẩm dùng cách này.

```json
200 {
  "items": [
    { "_id": "671b...", "prompt": "The woman from the reference image...", "negative": "wind, ...",
      "note": "Ra đẹp lần đầu", "tool": "Meta AI", "settings": { ... }, "createdAt": "...", "updatedAt": "...",
      "savedBy": { "username": "nhut", "displayName": "nhut" }, "mine": true,
      "product": { "_id": "671a0c...", "name": "Nón chống nắng vành rộng", "sku": "N12",
                   "images": [ { "url": "...", "width": 1500, "height": 2000 } ] } }
  ],
  "nextCursor": "671a9..."   // null nếu hết
}
```
Chỉ trả ảnh đại diện của sản phẩm để giảm dung lượng. `savedBy` là tài khoản đã lưu prompt (tra theo `owner` mỗi lần đọc, nên đổi tên hiển thị thì hiện tên mới); `createdAt` là lúc lưu, `updatedAt` là lần sửa gần nhất. `mine` cho biết người xem có phải người lưu không: chỉ người lưu mới sửa được (`PATCH` với prompt của người khác trả 404), còn xoá thì thành viên nào cũng xoá được (giao diện hỏi xác nhận Có/Không trước). Sản phẩm dùng chung nên "Dùng lại và chỉnh" luôn nạp cả sản phẩm và lựa chọn.

### `POST /api/prompts`
Cần `product` (mã sản phẩm có sẵn) **hoặc** `productName` (tìm sản phẩm trùng tên không phân biệt hoa thường, chưa có thì tạo mới).
```json
{
  "product": "671a0c...",
  "prompt": "The woman from the reference image...",
  "negative": "wind, breeze, ...",
  "note": "Meta AI, đẹp lần đầu",
  "tool": "Meta AI",
  "settings": { "gender": "f", "dur": 10, "open": "ob1", "mid": ["mb1","mb2"], "endOn": false }
}
201 { "item": { ... }, "product": { "_id": "...", "name": "..." } }
```
Prompt dán từ ngoài (nút "+ Thêm prompt" ở trang sản phẩm) gửi thêm `"source": "external"`; khi đó `settings` luôn được lưu rỗng.

Tác dụng phụ: `product.promptCount += 1`, `product.lastPromptAt = now`.

### `PATCH /api/prompts/:id`
```json
{ "note": "Dùng cho video livestream", "tool": "Dola AI" }
// thêm được "prompt", "negative": giao diện chỉ cho sửa với prompt dán từ ngoài
200 { "item": { ... } }
```

### `DELETE /api/prompts/:id`
Xoá được prompt của bất kỳ thành viên nào. `200 { "ok": true }`. Tác dụng phụ: `promptCount -= 1`.

---

## 5. Cài đặt `/api/settings`

### `GET /api/settings`
```json
200 { "template": "", "negative": "", "customActions": [ { "id": "c1", "role": "mid", "label": "...", "text": "{S} ..." } ] }
```
`template` hoặc `negative` rỗng nghĩa là giao diện dùng bản mặc định.

### `PUT /api/settings`
Gửi một phần, ví dụ chỉ `template` và `negative`, hoặc chỉ `customActions` (gửi cả mảng).
```json
{ "template": "...", "negative": "..." }
200 { "template": "...", "negative": "...", "customActions": [ ... ] }
```
Giới hạn: tối đa 300 động tác riêng.

---

## 6. Chuyển dữ liệu `/api/transfer`

### `POST /api/transfer/import`
Nhận file sao lưu của bản tĩnh cũ (hoặc file xuất của chính app mới). Giới hạn 5 MB.
```json
// dạng bản tĩnh cũ
{ "app": "xuong-prompt", "saved": [ { "id": "s...", "product": "Nón N12", "note": "...",
  "prompt": "...", "negative": "...", "settings": { ... }, "at": 1729400000000 } ],
  "custom": { "open": [], "mid": [ { "id": "c...", "label": "...", "text": "..." } ], "end": [] } }

200 { "products": 3, "prompts": 12, "actions": 2, "skipped": 0 }
```
Quy tắc:
- Gom theo tên sản phẩm, không phân biệt hoa thường. Sản phẩm chưa có thì tạo mới.
- Bỏ qua prompt trùng nội dung với prompt đã có của cùng sản phẩm.
- Giữ nguyên thời điểm lưu gốc (`at`).

### `GET /api/transfer/export`
Trả toàn bộ dữ liệu của tài khoản (sản phẩm kèm URL ảnh, prompt, cài đặt) dạng file `.json` để tải về.

---

## 7. Kế hoạch video `/api/plans`

Kế hoạch dùng chung cho cả nhóm. Thành viên nào cũng lập, sửa mục tiêu, người thực hiện, hạn, ghi chú và xoá được; **chỉ người thực hiện** đổi được trạng thái. Xem [tài liệu 09](09-ke-hoach-video.md).

### `GET /api/plans?assignee=&status=&category=&q=&dueFrom=&dueTo=&overdue=&today=&page=&limit=`
- `assignee`: id người thực hiện.
- `status`: `todo`, `partial`, `done`, hoặc `open` (= `todo` + `partial`).
- `category`: loại sản phẩm (`__none` là chưa phân loại). `q`: tên hoặc mã sản phẩm.
- `dueFrom`, `dueTo`: ngày `YYYY-MM-DD`, tính cả hai đầu. `overdue=1`: hạn trước `today` và chưa hoàn thành.
- `today`: ngày hôm nay theo máy người xem, dùng để tính quá hạn (thiếu thì lấy ngày UTC của máy chủ).
- Sắp xếp: hạn gần nhất trước, kế hoạch không có hạn ở cuối. Mặc định 20 mỗi trang, tối đa 50.

```json
200 {
  "items": [
    { "_id": "...", "target": 10, "done": 7, "status": "partial", "dueDate": "2026-10-25", "note": "",
      "product": { "_id": "...", "name": "Nón lá", "sku": "N12", "category": "Nón", "images": [ { "url": "..." } ] },
      "assignee": { "id": "...", "displayName": "Bình" }, "createdBy": { "id": "...", "displayName": "An" },
      "createdAt": "...", "updatedAt": "..." }
  ],
  "total": 12, "page": 1, "pages": 1, "limit": 20, "today": "2026-10-21",
  "summary": { "plans": 12, "target": 80, "done": 47, "todo": 4, "partial": 5, "finished": 3, "overdue": 2 }
}
```
`summary` tính trên toàn bộ kết quả lọc, không chỉ trang đang xem.

### `POST /api/plans`
Lập một hoặc nhiều kế hoạch cùng lúc, mỗi sản phẩm một dòng.
```json
{ "products": ["671a...", "671b..."], "target": 5, "assignee": "6719...", "dueDate": "2026-10-31", "note": "" }
201 { "items": [ ... ] }
```
Lỗi: sản phẩm hoặc người thực hiện không tồn tại → 404; mục tiêu ngoài 1–999 → 400.

### `PATCH /api/plans/:id`
```json
{ "target": 8, "assignee": "...", "dueDate": "", "note": "..." }   // ai cũng sửa được
{ "status": "partial", "done": 3 }                                   // chỉ người thực hiện, người khác → 403
200 { "item": { ... } }
```
`done` tự chỉnh theo trạng thái: `todo` → 0, `done` → bằng `target`, `partial` → giữ trong khoảng 0 đến `target − 1`.

### `DELETE /api/plans/:id`
`200 { "ok": true }`.
