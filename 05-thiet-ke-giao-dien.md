# 05. Thiết kế giao diện

## 1. Nguyên tắc

1. **Việc chính lên trước.** Mở app là vào ngay bộ tạo prompt. Mọi thứ khác chỉ cách một lần bấm.
2. **Ảnh để nhận ra sản phẩm.** Người làm nội dung nhớ sản phẩm bằng hình hơn bằng tên. Ở đâu có sản phẩm, ở đó có ảnh nhỏ.
3. **Một màn hình một việc.** Nút chính rõ ràng, nút phụ nằm lùi lại.
4. **Không bắt chờ.** Chỗ nào đang tải thì hiện khung xám có hình dạng giống nội dung thật (skeleton), không dùng vòng xoay toàn màn hình.
5. **Nói rõ khi có rủi ro.** Động tác dễ lỗi, ảnh quá lớn, hành động xoá đều có nhắc rõ bằng lời, không chỉ bằng màu.

## 2. Nhận diện hình ảnh

Giữ nhận diện của bản tĩnh để người dùng quen tay.

| Token | Sáng | Tối | Dùng cho |
|---|---|---|---|
| `--bg` | `#F3F2F5` | `#141218` | Nền trang |
| `--surface` | `#FFFFFF` | `#1D1A22` | Thẻ, khung |
| `--sunk` | `#ECEAF0` | `#26222C` | Khung prompt, ô chọn |
| `--line` | `#DAD6E0` | `#37323F` | Viền |
| `--fg` | `#1B1820` | `#EEEAF2` | Chữ chính |
| `--muted` | `#6B6475` | `#A49CAE` | Chữ phụ |
| `--accent` | `#9C2A5C` | `#E27AA6` | Màu nhấn (mận), nút chính, mục đang chọn |
| `--accent-soft` | `#F6E3EC` | `#3A2230` | Nền nhấn nhẹ, mốc thời gian |
| `--ok` | `#1F7A4D` | `#5CC48F` | Thông báo thành công |
| `--danger` | `#B3261E` | `#F2B8B5` | Xoá, lỗi |

| Vai trò chữ | Font | Dùng cho |
|---|---|---|
| Tiêu đề | Bricolage Grotesque 600/800 | Tên trang, tên sản phẩm |
| Nội dung | Be Vietnam Pro 400/500/600 | Toàn bộ giao diện (hỗ trợ tiếng Việt tốt) |
| Prompt, mã | JetBrains Mono | Khung prompt, mốc giây |

Bo góc: 8px cho nút và ô nhập, 14px cho khung lớn. Viền mảnh, bóng đổ chỉ dùng cho hộp thoại và thanh điều hướng.

## 3. Bố cục và điều hướng

```
Máy tính (≥ 900px)                          Điện thoại (< 900px)
┌──────────────────────────────────────┐    ┌────────────────────┐
│ Xưởng Prompt   Tạo  Sản phẩm  Đã lưu │    │ Xưởng Prompt   (M) │
│                Thư viện  Cài đặt (M) │    ├────────────────────┤
├──────────────────────────────────────┤    │                    │
│                                      │    │     nội dung       │
│            nội dung trang            │    │                    │
│                                      │    ├────────────────────┤
└──────────────────────────────────────┘    │ Tạo  SP  Lưu  Thêm │
                                            └────────────────────┘
```

- Máy tính: thanh trên cùng, cố định khi cuộn.
- Điện thoại: thanh dưới cùng 4 mục (Tạo, Sản phẩm, Đã lưu, Thêm). "Thêm" mở Thư viện và Cài đặt. Thanh chừa khoảng an toàn của tai thỏ và thanh home.
- Avatar chữ cái đầu (M) mở menu: tên tài khoản, Đổi mật khẩu, Đăng xuất.

## 4. Các màn hình

### 4.1 Đăng nhập `/login`

```
┌─────────────────────────────┐
│  Xưởng Prompt Thời Trang     │
│  Prompt video AI cho từng    │
│  sản phẩm, lưu một lần dùng  │
│  mãi.                        │
│                              │
│  [ Đăng nhập | Tạo tài khoản ]│
│  Tên đăng nhập [minh.shop  ] │
│  Mật khẩu      [••••••  👁 ] │
│  [x] Ghi nhớ đăng nhập 30 ngày│
│  [      Đăng nhập      ]     │
└─────────────────────────────┘
```

- Nhớ tên đăng nhập gần nhất; nếu có thì con trỏ nằm sẵn ở ô mật khẩu.
- `autocomplete="username"` và `current-password` / `new-password` để trình duyệt và trình quản lý mật khẩu tự điền: thường chỉ cần một chạm.
- Enter là đăng nhập. Nút hiện "Đang đăng nhập..." và khoá lại khi đang gửi.
- Lỗi hiện ngay dưới nút, viết rõ ("Sai tên đăng nhập hoặc mật khẩu.").
- Ở chế độ "Tạo tài khoản" có dòng nhắc luật tên đăng nhập và mật khẩu.
- Nếu máy chủ đang ngủ, hiện "Máy chủ đang khởi động, chờ khoảng 1 phút..." thay vì báo lỗi.

### 4.2 Tạo prompt `/` (trang chính)

```
┌─────────────── Cột trái: lựa chọn ───────────────┐ ┌──── Cột phải: kết quả (dính khi cuộn) ────┐
│ SẢN PHẨM                                         │ │ [ảnh đại diện sản phẩm, nhỏ]               │
│ [🖼 Nón chống nắng N12           ▾]  + Mới        │ │ PROMPT                         Đã copy     │
│                                                  │ │ ┌────────────────────────────────────────┐ │
│ NGƯỜI MẪU   (Nữ) ( Nam )                         │ │ │ The woman from the reference image...  │ │
│ THỜI LƯỢNG  (10 giây) (15) (20)                  │ │ │ 0–2s: Starting exactly as...           │ │
│                                                  │ │ └────────────────────────────────────────┘ │
│ CHUỖI ĐỘNG TÁC                 [Đổi ngẫu nhiên]  │ │ 486 từ · 9:16 · 1080p                      │
│ (Nổi bật) (Nhẹ nhàng)                            │ │ [Copy prompt] [Copy + negative]            │
│ ▓▓░░░░░░░░░░░░░░░ thanh thời gian                │ │ [★ Lưu prompt tốt]                         │
│ 0–2s   [★ Bước tự tin tới máy        ▾]          │ │                                            │
│ Đoạn giữa · 3 động tác   2,7 giây mỗi động tác   │ │ NEGATIVE                                   │
│ 2–4.7s [★ Bước catwalk...            ▾] ↑ ↓ ×    │ │ ┌────────────────────────────────────────┐ │
│ 4.7–7.3 [Xoay 30° phải...            ▾] ↑ ↓ ×    │ │ │ wind, breeze, ...                      │ │
│ 7.3–10s [Chỉ tay về sản phẩm...      ▾] ↑ ↓ ×    │ │ └────────────────────────────────────────┘ │
│ [+ Thêm động tác vào đoạn giữa]                  │ │ [Copy negative]                            │
│ [ ] Thêm đoạn kết (2 giây cuối)                  │ └────────────────────────────────────────────┘
│                                                  │
│ TUỲ CHỌN  [x] Áo luôn đóng  [ ] Nối clip trước   │
│ Âm thanh [Không có ▾]                            │
│ Lỗi riêng cần chặn [shrinking brim, ...]         │
└──────────────────────────────────────────────────┘
```

- **Ô chọn sản phẩm** có ảnh nhỏ và ô tìm kiếm. Gõ để lọc; có mục "+ Tạo sản phẩm “...”" khi không thấy.
- Chọn sản phẩm thì tự điền "Áo luôn đóng" và "Lỗi riêng cần chặn" từ sản phẩm; người dùng vẫn sửa được cho riêng lần này.
- Trên điện thoại hai cột xếp chồng. Thanh nổi dưới cùng có nút **Copy prompt**, nên không phải cuộn xuống mới copy được.
- Bấm **★ Lưu prompt tốt** mở hộp thoại nhỏ: sản phẩm (điền sẵn), công cụ (gợi ý Meta AI, Dola AI), ghi chú. Lưu xong hiện "Đã lưu cho Nón chống nắng N12 · Xem".

### 4.3 Sản phẩm `/products`

- Lưới thẻ: ảnh đại diện tỉ lệ 3:4, tên, mã, số prompt đã lưu. 2 cột trên điện thoại, 4–5 cột trên máy tính.
- Ô tìm theo tên hoặc mã, kết quả lọc ngay khi gõ (chờ 250 ms sau phím cuối).
- Nút **+ Sản phẩm mới** mở hộp thoại: tên (bắt buộc), mã, và ô kéo thả ảnh. Tạo xong chuyển vào trang chi tiết.
- Chưa có sản phẩm: khung hướng dẫn "Thêm sản phẩm đầu tiên kèm ảnh để dễ nhận ra khi tạo prompt".
- Ảnh tải lười, có nền mờ giữ chỗ.

### 4.4 Chi tiết sản phẩm `/products/:id`

```
← Sản phẩm
┌───────────────┐  Nón chống nắng vành rộng            [Tạo prompt cho sản phẩm này]
│               │  Mã: N12 · 3 prompt tốt · cập nhật 20/10
│   ảnh lớn     │
│               │  THÔNG TIN DÙNG CHO PROMPT
└───────────────┘  [x] Áo luôn đóng
[▫][▫][▫][+ Ảnh]   Lỗi riêng cần chặn [shrinking brim, missing drawstring]
                   Ghi chú [...]                               [Lưu thay đổi]

PROMPT TỐT CỦA SẢN PHẨM NÀY
┌ 20/10 12:07 · Meta AI · 15 giây · 4 động tác ─────────────────────────────┐
│ Ra đẹp lần đầu, tay không lỗi                                             │
│ ▸ Xem prompt                                                              │
│ [Copy prompt] [Copy + negative] [Dùng lại và chỉnh] [Xoá]                │
└───────────────────────────────────────────────────────────────────────────┘
```

- Thư viện ảnh: ảnh lớn và hàng ảnh nhỏ bên dưới. Mỗi ảnh nhỏ có menu "Đặt làm ảnh đại diện", "Xoá".
- Ô "+ Ảnh" nhận kéo thả, chọn nhiều file, hoặc chụp bằng camera điện thoại (`accept="image/*"`). Mỗi ảnh đang tải có thanh tiến độ riêng.
- Xoá sản phẩm nằm cuối trang, chữ đỏ, cần bấm xác nhận lần hai và nói rõ "Xoá cả 12 ảnh và 3 prompt".

### 4.5 Prompt đã lưu `/saved`

- Thanh lọc: ô tìm kiếm và ô chọn sản phẩm (có ảnh).
- Danh sách thẻ như ở trang chi tiết, thêm ảnh nhỏ và tên sản phẩm ở đầu thẻ. Bấm tên thì sang trang sản phẩm.
- Cuộn tới cuối thì tự tải thêm 20 mục; có khung xám giữ chỗ khi đang tải.
- "Dùng lại và chỉnh" mở bộ tạo với sản phẩm và toàn bộ lựa chọn cũ.

### 4.6 Thư viện động tác `/library`

- Bên trái: thêm động tác riêng (vị trí, tên tiếng Việt, câu lệnh tiếng Anh, gợi ý biến `{S}` `{s}` `{p}` `{g}`).
- Bên phải: toàn bộ động tác theo nhóm, mỗi nhóm thu gọn hoặc mở được. Có ô lọc theo chữ. Nhãn điều kiện hiện bằng chữ màu nhấn.

### 4.7 Cài đặt `/settings`

Bốn khối:
1. **Template prompt:** ô soạn thảo, danh sách biến, nút Lưu và Khôi phục mặc định (có xác nhận).
2. **Tài khoản:** tên đăng nhập, đổi mật khẩu, đăng xuất.
3. **Chuyển dữ liệu:** nhập file `.json` từ bản tĩnh cũ, xuất toàn bộ dữ liệu.
4. **Giới thiệu:** phiên bản, gợi ý sử dụng.

## 5. Thành phần dùng chung

| Thành phần | Mô tả |
|---|---|
| `LazyImage` | Nhận URL Cloudinary và độ rộng hiển thị. Tự sinh URL thu nhỏ, `srcset` 1x/2x, nền mờ giữ chỗ, `loading="lazy"`, mờ dần khi tải xong |
| `ProductPicker` | Ô chọn sản phẩm có tìm kiếm, ảnh nhỏ, điều hướng bằng phím mũi tên, tạo mới tại chỗ |
| `Sequence` | Toàn bộ khối chuỗi động tác: mở đầu, đoạn giữa (thêm, xoá, đổi thứ tự), đoạn kết |
| `PromptPanel` | Khung prompt, negative, các nút copy, nút lưu |
| `Uploader` | Kéo thả hoặc chọn ảnh, nén trên trình duyệt, thanh tiến độ từng ảnh |
| `PromptCard` | Thẻ một prompt đã lưu với các nút thao tác |
| `ConfirmButton` | Nút cần bấm hai lần cho thao tác xoá |
| `Toast` | Thông báo nhỏ góc dưới, tự ẩn sau 2,5 giây |
| `Skeleton` | Khung xám nhấp nháy nhẹ khi đang tải (tắt hiệu ứng nếu máy bật giảm chuyển động) |
| `EmptyState` | Màn hình trống có hướng dẫn và nút hành động |

## 6. Trạng thái cần thiết kế cho mỗi màn hình

| Trạng thái | Cách hiển thị |
|---|---|
| Đang tải lần đầu | Skeleton đúng hình dạng nội dung |
| Trống | `EmptyState` với bước tiếp theo |
| Lỗi mạng | Thông báo kèm nút "Thử lại" |
| Đang gửi | Nút khoá lại, chữ đổi sang dạng "Đang lưu..." |
| Thành công | Toast "Đã lưu", "Đã copy", "Đã xoá" |
| Hết phiên | Đưa về đăng nhập, giữ nguyên bản nháp bộ tạo |

## 7. Khả năng truy cập

- Mọi nút và ô nhập có nhãn đọc được. Biểu tượng một mình (↑ ↓ ×) có `aria-label`.
- Viền focus 2px màu nhấn trên mọi thành phần tương tác.
- Độ tương phản chữ thường tối thiểu 4.5:1 ở cả hai giao diện sáng và tối.
- Tôn trọng cài đặt `prefers-reduced-motion` của máy.
