# 03. Thiết kế cơ sở dữ liệu (MongoDB)

## 1. Sơ đồ quan hệ

```mermaid
erDiagram
  USER ||--o{ PRODUCT : "sở hữu"
  USER ||--o{ PROMPT : "sở hữu"
  USER ||--|| SETTINGS : "có"
  PRODUCT ||--o{ PROMPT : "có các prompt tốt"
  PRODUCT ||--o{ IMAGE : "nhúng (tối đa 12)"
  SETTINGS ||--o{ CUSTOM_ACTION : "nhúng"

  USER {
    ObjectId _id
    string username "duy nhất, chữ thường"
    string passwordHash
    string displayName
    date lastLoginAt
  }
  PRODUCT {
    ObjectId _id
    ObjectId owner
    string name
    string sku
    string note
    string extraNeg
    bool closed
    int promptCount
    date lastPromptAt
  }
  IMAGE {
    string url
    string publicId
    int width
    int height
  }
  PROMPT {
    ObjectId _id
    ObjectId owner
    ObjectId product
    string prompt
    string negative
    string note
    string tool
    object settings
  }
  SETTINGS {
    ObjectId owner "duy nhất"
    string template
    string negative
  }
  CUSTOM_ACTION {
    string id
    string role
    string label
    string text
  }
```

Mọi collection có `createdAt` và `updatedAt` tự động (`timestamps: true`).

## 2. Chi tiết từng collection

### 2.1 `users`

| Trường | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `username` | string | bắt buộc, duy nhất, 3–30 ký tự, `[a-z0-9_.]` | Lưu chữ thường; đăng nhập không phân biệt hoa thường |
| `passwordHash` | string | bắt buộc | bcrypt |
| `displayName` | string | tuỳ chọn | Mặc định hiển thị `username` |
| `lastLoginAt` | date | | Cập nhật mỗi lần đăng nhập |

**Chỉ mục:** `{ username: 1 }` duy nhất.

### 2.2 `products`

| Trường | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `owner` | ObjectId → users | bắt buộc | |
| `name` | string | bắt buộc, tối đa 160 | Ví dụ "Nón chống nắng vành rộng" |
| `sku` | string | tối đa 60 | Mã sản phẩm tuỳ chọn |
| `note` | string | tối đa 2000 | Ghi chú tự do |
| `extraNeg` | string | tối đa 1000 | Lỗi riêng cần chặn, cách nhau bằng dấu phẩy |
| `closed` | bool | mặc định `true` | "Áo luôn đóng, không mở" |
| `images` | mảng `Image` | tối đa 12 | Phần tử đầu tiên là ảnh đại diện |
| `promptCount` | number | mặc định 0 | Đếm sẵn để hiện trên thẻ sản phẩm, khỏi đếm lại |
| `lastPromptAt` | date | | Lần lưu prompt gần nhất |

`Image` (nhúng, không có `_id`): `url` (https của Cloudinary), `publicId` (để xoá), `width`, `height` (để giữ tỉ lệ khung trước khi ảnh tải).

**Chỉ mục:**

| Chỉ mục | Phục vụ truy vấn |
|---|---|
| `{ owner: 1, updatedAt: -1 }` | Danh sách sản phẩm mới cập nhật lên trước |
| `{ owner: 1, name: 1 }` | Tìm theo tên, tìm hoặc tạo sản phẩm khi lưu prompt |

**Vì sao ảnh nhúng trong sản phẩm:** ảnh luôn được đọc cùng sản phẩm, số lượng ít (tối đa 12), không bao giờ truy vấn ảnh riêng lẻ. Nhúng giúp một lần đọc là đủ.

### 2.3 `prompts`

| Trường | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `owner` | ObjectId → users | bắt buộc | |
| `product` | ObjectId → products | bắt buộc | |
| `prompt` | string | bắt buộc, tối đa 20000 | Nguyên văn, không đổi khi sau này sửa template |
| `negative` | string | tối đa 5000 | |
| `note` | string | tối đa 1000 | "Ra đẹp lần đầu, tay không lỗi" |
| `tool` | string | tối đa 60 | "Meta AI", "Dola AI"... |
| `settings` | object | | Ảnh chụp lựa chọn của bộ tạo, xem mục 3 |

**Chỉ mục:**

| Chỉ mục | Phục vụ truy vấn |
|---|---|
| `{ owner: 1, _id: -1 }` | Tất cả prompt, mới nhất trước, phân trang bằng con trỏ `_id` |
| `{ owner: 1, product: 1, _id: -1 }` | Prompt của một sản phẩm |

**Vì sao prompt là collection riêng:** số lượng tăng không giới hạn theo thời gian và cần phân trang. Nhúng vào sản phẩm sẽ làm tài liệu sản phẩm phình to.

### 2.4 `settings`

Mỗi người dùng một tài liệu, tạo khi lần đầu lưu cài đặt.

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `owner` | ObjectId → users, duy nhất | |
| `template` | string | Rỗng nghĩa là dùng template mặc định của app |
| `negative` | string | Rỗng nghĩa là dùng negative mặc định |
| `customActions` | mảng `{ id, role, label, text }` | Động tác riêng; `role` là `open`, `mid` hoặc `end` |

Để rỗng thay vì chép template mặc định vào cơ sở dữ liệu: khi app cập nhật template mặc định, những người chưa tự sửa sẽ nhận bản mới ngay.

## 3. Cấu trúc `settings` trong một prompt

Đây là toàn bộ lựa chọn của bộ tạo tại lúc lưu. Dùng cho chức năng "Dùng lại và chỉnh".

```json
{
  "gender": "f",
  "dur": 15,
  "style": "bold",
  "open": "ob1",
  "mid": ["mb1", "mb2", "p1", "t8"],
  "end": "eb1",
  "endOn": false,
  "closed": true,
  "cont": false,
  "audio": "none",
  "extraNeg": "shrinking brim, missing drawstring"
}
```

| Khoá | Giá trị |
|---|---|
| `gender` | `f` nữ, `m` nam |
| `dur` | 10, 15, 20 (giây) |
| `style` | `bold` nổi bật, `soft` nhẹ nhàng (chỉ ảnh hưởng nút Đổi ngẫu nhiên) |
| `open`, `end` | Mã động tác mở đầu và kết |
| `mid` | Danh sách mã động tác đoạn giữa theo thứ tự |
| `endOn` | Có đoạn kết hay không |
| `closed` | Áo luôn đóng |
| `cont` | Nối từ khung cuối clip trước |
| `audio` | `none` hoặc `amb` |
| `extraNeg` | Lỗi riêng cần chặn tại lúc lưu |

Mã động tác có sẵn (`ob1`, `mb2`...) cố định trong mã nguồn. Động tác riêng có mã dạng `c...`. Nếu một mã không còn tồn tại (động tác riêng đã xoá), bộ tạo tự thay bằng động tác mặc định của vị trí đó.

## 4. Ví dụ tài liệu

```json
// products
{
  "_id": "671a0c...",
  "owner": "6719ff...",
  "name": "Nón chống nắng vành rộng",
  "sku": "N12",
  "extraNeg": "shrinking brim, missing face covering, missing drawstring",
  "closed": true,
  "images": [
    { "url": "https://res.cloudinary.com/demo/image/upload/v1729/prompt-studio/6719ff/671a0c/abc.jpg",
      "publicId": "prompt-studio/6719ff/671a0c/abc", "width": 1500, "height": 2000 }
  ],
  "promptCount": 3,
  "lastPromptAt": "2026-10-20T05:10:00Z"
}
```

## 5. Ước lượng dung lượng

| Đối tượng | Kích thước trung bình | 1.000 mục |
|---|---|---|
| Prompt (khoảng 3.500 ký tự + negative + settings) | ~5 KB | ~5 MB |
| Sản phẩm (không tính ảnh, ảnh nằm ở Cloudinary) | ~1 KB | ~1 MB |

Gói MongoDB Atlas miễn phí có 512 MB, đủ cho khoảng 80.000 prompt. Ảnh không chiếm dung lượng MongoDB.

## 6. Thư mục ảnh trên Cloudinary

```
prompt-studio/<userId>/<productId>/<tên ngẫu nhiên>
```

Xoá sản phẩm thì xoá từng ảnh theo `publicId`. Xoá ảnh thất bại (ví dụ Cloudinary tạm lỗi) không chặn việc xoá sản phẩm. Ảnh mồ côi còn sót lại có thể dọn tay theo thư mục.
