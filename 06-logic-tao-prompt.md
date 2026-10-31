# 06. Logic tạo prompt

Tài liệu này là "luật nghiệp vụ" của app. Toàn bộ logic chạy trên trình duyệt (`client/src/lib/prompt.js` và `client/src/lib/actions.js`), chuyển nguyên từ bản tĩnh đang dùng.

## 1. Quy tắc nền (không được phá)

Rút ra từ quá trình làm video thực tế và skill viết prompt của người dùng:

| # | Quy tắc | Thể hiện trong prompt |
|---|---|---|
| R1 | Một cảnh liền, không cắt | `ONE SINGLE UNBROKEN TAKE, no cuts, no scene changes` |
| R2 | Máy quay đứng yên; khung hình đổi chỉ vì người mẫu đi tới hoặc lùi ra | Khối `Camera: locked-off tripod...` |
| R3 | **Tay không bao giờ chạm sản phẩm**, kể cả khi chỉ tay | Khối `Motion quality` + `no hands touching the product` |
| R4 | Không nhắc gió trong prompt chính; chữ "wind, breeze" chỉ nằm trong negative | Negative mặc định |
| R5 | Không mô tả trang phục, bối cảnh, độ tuổi: mọi thứ lấy theo ảnh tham chiếu | `The woman from the reference image...`, `the same setting as the reference image` |
| R6 | Giữ nguyên sản phẩm | Khối `PRODUCT FIDELITY CONSTRAINTS` |
| R7 | Không nói, không chữ, không logo | `does not speak`, `no subtitles, no text overlays...` |
| R8 | Khung dọc 9:16, 1080p, 24fps | Khối `Quality` và `FINAL REQUIREMENTS` |

## 2. Template mặc định

Template là văn bản cố định có các **biến** trong dấu `{{...}}`. Người dùng sửa được template trong trang Cài đặt; bản sửa lưu theo tài khoản.

```text
{{continue}}The {{person}} from the reference image, wearing the product shown in it, performs one continuous {{duration}}-second product showcase in the same setting as the reference image. ONE SINGLE UNBROKEN TAKE, no cuts, no scene changes.

Product: reproduce the product exactly as in the reference image, with no changes to color, material, pattern, cut or details.

Action — one continuous chain of movements, each gesture flowing into the next:
{{actions}}

Motion quality: every movement is smooth, confident and controlled, like a high-end fashion commercial. Each gesture flows into the next without stopping, with natural weight shifts and a steady pace. No sudden, jerky or fast movements. {{Possessive}} hands never touch, pull, smooth or adjust the {{garment}}; they keep a clear distance from it at all times, even when gesturing toward it. The {{garment}} moves only with {{possessive}} body movements.

PRODUCT FIDELITY CONSTRAINTS
The {{garment}} is a real product. Keep it exactly as shown in the reference image in every frame: same color, same material and gloss, same pattern size and spacing, same buttons, same closures, same length and same cut. Do not add any new detail: no pockets, zippers, extra buttons, belts, straps, logos, labels, text, patches, prints, trims or lining.{{closed_line}} The pattern stays fixed on the material, moving only with it.

Environment: the same setting as in the reference image, unchanged. No signs, no store name, no logos, no other people.

Style: photorealistic lifestyle fashion commercial, natural skin texture, true-to-life colors, soft even lighting that stays constant throughout.

Camera: locked-off tripod at chest height, no pan, no zoom, no camera movement. The framing changes only because {{pronoun}} walks toward and away from the camera. Focus stays on {{object}}. One continuous take from the first frame to the last.

Quality: 1080p, 24fps, smooth natural motion, sharp detail on the fabric and finishing. Face, hairstyle and the {{garment}} stay identical throughout. Natural hands with five fingers. {{Pronoun}} does not speak.

Audio: {{audio}}

No horizontal video, no 16:9, no square format, no scene cuts, no transitions, no sudden zooms, no camera shake, no product redesign, no changing {{garment}} color, no changing pattern, no missing details, no fabric flickering, no distorted seams{{extra_neg}}, no hands touching the {{garment}}, no deformed hands, no extra fingers, no face distortion, no unnatural eye movement, no sudden pose changes, no clothing changes, no background changes, no added logos, no subtitles, no text overlays, no watermarks.

FINAL REQUIREMENTS

Duration: exactly {{duration}} seconds.
Aspect ratio: 9:16 vertical.
Platform: TikTok and TikTok Shop.
Motion: smooth, natural, realistic.
Priority: accurately showcase the original {{garment}} while preserving the reference model and setting.
```

**Negative mặc định**

```text
wind, breeze, fluttering, camera cut, jump cut, scene change, zoom, camera pan, back view, extra people, pockets, zipper, logo, label, text, extra buttons, opened garment, changed pattern, hand touching garment, hands pulling fabric, morphing, jerky motion, watermark
```

### 2.1 Kiểu video thứ hai: Selfie che mặt

Ở mục 2 của trang tạo prompt có lựa chọn **Kiểu video**: "Trình diễn" (template ở trên) hoặc "Selfie che mặt" (`SELFIE_TEMPLATE` trong `client/src/lib/prompt.js`). Kiểu selfie: người mẫu cầm điện thoại bằng tay phải che kín mặt suốt clip như chụp gương, chỉ thân, chân và tay trái cử động. Template này dùng cùng bảng biến, nhưng cố định trong code: Cài đặt chỉ sửa template "Trình diễn".

- Negative đầu ra được nối thêm: `visible face, lowered phone, phone moving away from face, phone logo`.
- Động tác nhóm "Đầu & biểu cảm" cùng `t5`, `t6`, `p3`, `e6` (cần hai tay, tay gần mặt, hoặc khoe mặt) không vào chuỗi ngẫu nhiên, và hiện cảnh báo nếu người dùng tự chọn.
- Kiểu video (`kind`) được lưu cùng prompt; prompt cũ không có `kind` thì mặc định "Trình diễn".

## 3. Bảng biến

| Biến | Giá trị | Nguồn |
|---|---|---|
| `{{person}}` | `woman` / `man` | Nam/Nữ |
| `{{pronoun}}`, `{{Pronoun}}` | `she`/`She`, `he`/`He` | Nam/Nữ |
| `{{possessive}}`, `{{Possessive}}` | `her`/`Her`, `his`/`His` | Nam/Nữ |
| `{{object}}` | `her` / `him` | Nam/Nữ |
| `{{garment}}` | luôn là `product` | Cố định (theo quy tắc R5) |
| `{{duration}}` | `10`, `15`, `20` | Thời lượng |
| `{{actions}}` | Các dòng `0–2s: ...` | Chuỗi động tác (mục 5) |
| `{{closed_line}}` | ` The product stays fully closed and is never opened.` hoặc rỗng | Ô "Áo luôn đóng" |
| `{{continue}}` | `Continue exactly from the provided image: ` hoặc rỗng | Ô "Nối từ khung cuối clip trước" |
| `{{extra_neg}}` | `, no shrinking brim, no missing drawstring` | Ô "Lỗi riêng cần chặn": tách theo dấu phẩy, tự thêm "no " nếu chưa có |
| `{{audio}}` | `none.` hoặc `soft quiet ambience only, no music, no speech.` | Ô Âm thanh |

Biến không nhận ra được giữ nguyên chữ `{{...}}` để người dùng thấy và sửa template.

## 4. Động tác

### 4.1 Cấu trúc một động tác

```js
{
  id: "mb2",               // mã cố định, dùng để lưu
  cat: "turn",             // nhóm: pose | turn | move | head | point | end | mine
  roles: "m",              // vị trí gợi ý: o (mở đầu), m (giữa), e (kết)
  flags: "b",              // b = nổi bật; các chữ khác là điều kiện (mục 4.2)
  label: "Xoay 45° khoe dáng nghiêng, nhìn qua vai",
  text: "{S} turns {p} body about forty-five degrees to one side, ..."
}
```

Biến trong câu lệnh: `{S}` = She/He, `{s}` = she/he, `{p}` = her/his, `{g}` = the product.

Mọi câu lệnh bắt đầu bằng `{S}`. Với động tác ở vị trí đầu tiên, app tự thêm `Starting exactly as in the reference image, ` và đổi `{S}` thành chữ thường.

### 4.2 Nhãn điều kiện

| Chữ | Nhãn | Ý nghĩa | Ảnh hưởng |
|---|---|---|---|
| `P` | bán áo | Tay đút túi quần sẽ chạm vào quần | Cảnh báo |
| `W` | cần tường | Ảnh tham chiếu phải có tường ngay sau người mẫu | Cảnh báo |
| `C` | cần ghế | Ảnh tham chiếu phải có ghế | Cảnh báo |
| `S` | cần bục | Ảnh tham chiếu phải có bục thấp | Cảnh báo |
| `B` | cần ảnh lưng | AI sẽ tự vẽ mặt sau | Cảnh báo, và **tự bỏ `back view` khỏi negative** |
| `H` | không dùng cho mũ | Tay gần đầu dễ làm méo mũ | Cảnh báo |
| `T` | chỉ cho mũ | Chỉ tay lên nón | Cảnh báo |
| `X` | chuyển cảnh | Tay che ống kính ở cuối để ghép clip | Cảnh báo |

Động tác có bất kỳ nhãn điều kiện nào **không bao giờ** được nút Đổi ngẫu nhiên chọn.

### 4.3 Động tác đã loại khỏi danh sách 100 động tác của người dùng

| Số | Động tác | Lý do |
|---|---|---|
| 6, 7, 19 | Chống hông, khoanh tay, hai tay chống hông | Tay đè lên sản phẩm |
| 36–55 | Toàn bộ nhóm "Động tác với áo" | Tay chạm, kéo, vuốt, cài, mở áo |
| 57–62, 68 | Chỉnh cạp, thắt lưng, vuốt đùi, chạm túi, kéo hoặc xắn gấu, chỉnh quần | Tay chạm quần |
| 32, 50, 78 | Xoay hoặc đi kèm chỉnh áo, chỉnh cổ áo | Tay chạm áo |
| 99 | Cầm kính, túi, phụ kiện | Phụ kiện không có trong ảnh tham chiếu, AI sẽ bịa |
| 82 | Đi từ phía sau ra trước camera | Trùng ý "Đi về phía camera" |

### 4.4 Danh sách 76 động tác có sẵn

#### Tạo dáng

| Mã | Tên | Vị trí gợi ý | Nổi bật | Điều kiện |
|---|---|---|---|---|
| `t1` | Đứng thẳng nhìn camera, thở nhẹ | Mở, Giữa, Kết |  |  |
| `t9` | Dồn trọng tâm sang một chân, mỉm cười | Mở, Giữa, Kết |  |  |
| `t7` | Hai tay buông tự nhiên | Mở, Giữa, Kết |  |  |
| `t6` | Đặt hai tay ra sau lưng | Mở, Giữa, Kết |  |  |
| `ob3` | Vào dáng người mẫu: vai nghiêng, hơi ngẩng cằm | Mở, Giữa, Kết | ★ |  |
| `t2` | Đứng nghiêng người 45° | Giữa |  |  |
| `t3` | Đứng nghiêng 90° khoe dáng nghiêng, ống quần | Giữa | ★ |  |
| `t8` | Đứng bắt chéo chân | Giữa, Kết | ★ |  |
| `mb3` | Đổi liên tiếp hai dáng người mẫu | Giữa | ★ |  |
| `t4` | Một tay đút túi quần | Mở, Giữa, Kết |  | Bán áo |
| `t5` | Hai tay đút túi quần | Mở, Kết |  | Bán áo |
| `t10` | Tựa lưng vào tường | Mở, Giữa, Kết |  | Cần tường |
| `t11` | Tựa vai vào tường | Mở, Giữa, Kết |  | Cần tường |
| `t12` | Dựa một bên hông vào tường | Mở, Giữa, Kết |  | Cần tường |
| `t13` | Ngồi trên ghế tạo dáng | Mở, Giữa, Kết |  | Cần ghế |
| `t14` | Ngồi vắt chéo chân | Mở, Giữa, Kết |  | Cần ghế |
| `t15` | Ngồi hơi nghiêng người về trước | Giữa |  | Cần ghế |
| `t16` | Ngồi tựa lưng thư giãn | Mở, Giữa, Kết |  | Cần ghế |

#### Xoay người

| Mã | Tên | Vị trí gợi ý | Nổi bật | Điều kiện |
|---|---|---|---|---|
| `m3` | Xoay 30° sang phải rồi quay lại | Giữa |  |  |
| `m4` | Xoay 30° sang trái rồi quay lại | Giữa |  |  |
| `o3` | Xoay nhẹ 30° rồi quay lại | Mở |  |  |
| `r8` | Xoay rồi dừng ở góc nghiêng | Giữa |  |  |
| `r9` | Xoay nửa thân trên sang trái rồi phải | Giữa |  |  |
| `r11` | Xoay người rồi nhìn thẳng vào camera | Giữa, Kết |  |  |
| `r12` | Xoay người kết hợp bước lùi | Giữa, Kết |  |  |
| `mb2` | Xoay 45° khoe dáng nghiêng, nhìn qua vai | Giữa | ★ |  |
| `r4` | Xoay từ chính diện sang góc 90° | Giữa | ★ |  |
| `r10` | Xoay người kết hợp bước chân | Giữa | ★ |  |
| `r13` | Xoay người kết hợp đút tay vào túi | Giữa |  | Bán áo |
| `r5` | Xoay 180° khoe mặt sau trang phục | Giữa |  | Cần ảnh lưng |
| `r6` | Xoay một vòng 360° | Giữa |  | Cần ảnh lưng |
| `r7` | Quay lưng về camera rồi nhìn qua vai | Giữa |  | Cần ảnh lưng |

#### Di chuyển

| Mã | Tên | Vị trí gợi ý | Nổi bật | Điều kiện |
|---|---|---|---|---|
| `m1` | Bước chậm 2–3 bước lại gần máy (khung nửa người) | Giữa |  |  |
| `d7` | Bước một bước về phía trước | Mở, Giữa, Kết |  |  |
| `d8` | Bước lùi một bước | Giữa, Kết |  |  |
| `m8` | Lùi chậm về khung toàn thân | Giữa, Kết |  |  |
| `d6` | Đi chậm rồi dừng lại | Giữa |  |  |
| `d11` | Vừa đi vừa nhìn sang bên | Giữa |  |  |
| `d17` | Bước đi khoe độ rũ của quần, váy | Giữa |  |  |
| `ob1` | Bước tự tin 1–2 bước tới máy, cười tươi | Mở | ★ |  |
| `mb1` | Bước catwalk tới máy, dừng tạo dáng | Giữa | ★ |  |
| `d4` | Đi ngang qua khung hình | Giữa | ★ |  |
| `mb4` | Đi chéo khung hình rồi quay lại nhìn máy | Giữa | ★ |  |
| `d12` | Đi rồi quay đầu nhìn camera | Giữa | ★ |  |
| `d16` | Đi bộ kết hợp xoay người | Giữa | ★ |  |
| `d10` | Đi bộ kết hợp đút tay vào túi | Giữa |  | Bán áo |
| `d3` | Đi ra xa camera rồi quay lại | Giữa |  | Cần ảnh lưng |
| `d13` | Đi vòng quanh một vị trí | Giữa |  | Cần ảnh lưng |
| `d14` | Bước lên bục rồi tạo dáng | Giữa |  | Cần bục |
| `d18` | Đặt một chân lên bục thấp | Giữa |  | Cần bục |
| `d15` | Ngồi xuống ghế rồi đứng dậy | Giữa |  | Cần ghế |

#### Đầu & biểu cảm

| Mã | Tên | Vị trí gợi ý | Nổi bật | Điều kiện |
|---|---|---|---|---|
| `m9` | Quay đầu chậm sang một bên rồi nhìn lại máy | Mở, Giữa, Kết |  |  |
| `m5` | Nghiêng đầu nhẹ, mỉm cười, giữ dáng | Mở, Giữa, Kết |  |  |
| `h6` | Cười tự nhiên nhìn camera | Mở, Giữa, Kết |  |  |
| `h4` | Nhìn xuống trang phục rồi ngẩng nhìn camera | Giữa |  |  |
| `h5` | Nhìn qua vai | Giữa, Kết |  |  |
| `h7` | Nhìn xa khỏi camera rồi nhìn lại | Mở, Giữa |  |  |
| `h9` | Đưa tay chạm nhẹ vào cằm | Giữa, Kết |  |  |
| `ob2` | Liếc sang bên rồi quay đầu nhìn thẳng máy | Mở, Giữa | ★ |  |
| `h8` | Vuốt tóc bằng một tay | Giữa, Kết |  | Không dùng cho mũ |

#### Chỉ tay

| Mã | Tên | Vị trí gợi ý | Nổi bật | Điều kiện |
|---|---|---|---|---|
| `p1` | Chỉ tay nhẹ về phía sản phẩm rồi hạ tay | Giữa |  |  |
| `p2` | Nhìn máy mỉm cười, chỉ tay về sản phẩm | Giữa |  |  |
| `p3` | Hai tay mở ra giới thiệu sản phẩm | Giữa |  |  |
| `p4` | Xoay nhẹ 30° kèm chỉ tay về sản phẩm | Giữa |  |  |
| `p5` | Chỉ tay lên nón, mũ | Giữa |  | Chỉ cho mũ |
| `eb2` | Chỉ tay về phía máy (mời người xem) | Giữa, Kết | ★ |  |
| `eb3` | Chỉ xuống góc dưới bên trái (giỏ hàng) | Kết | ★ |  |

#### Kết

| Mã | Tên | Vị trí gợi ý | Nổi bật | Điều kiện |
|---|---|---|---|---|
| `e1` | Lùi về toàn thân, về dáng khung đầu | Kết |  |  |
| `e2` | Về đúng dáng khung đầu (để lặp mượt) | Kết |  |  |
| `e5` | Đứng yên nhìn camera để kết thúc | Kết |  |  |
| `e3` | Đứng yên nửa giây cuối (để nối clip) | Kết |  |  |
| `eb1` | Dáng chốt (hero pose), giữ yên 1 giây | Kết | ★ |  |
| `eb4` | Vẫy tay chào, gật đầu cười tươi | Kết | ★ |  |
| `eb5` | Bước thêm một bước tới máy, gật đầu chốt | Kết | ★ |  |
| `e4` | Kết với một tay trong túi quần | Kết |  | Bán áo |
| `e6` | Đưa tay về phía camera (chuyển cảnh) | Kết |  | Chuyển cảnh |


## 5. Chia thời gian (timeline)

Chuỗi động tác gồm ba phần:

| Phần | Số động tác | Thời lượng |
|---|---|---|
| Mở đầu | 1 | 2 giây cố định |
| Đoạn giữa | 0 đến không giới hạn | Phần còn lại, chia đều |
| Đoạn kết | 0 hoặc 1 (tuỳ chọn, mặc định tắt) | 2 giây cuối |

Thuật toán (T là thời lượng, k là số động tác giữa):

```js
function timeline({ dur: T, open, mid, end, endOn }) {
  const k = mid.length, E = endOn ? 2 : 0;
  const O = (k || endOn) ? 2 : T;          // chỉ có mở đầu thì mở đầu chiếm cả video
  const M = T - O - E;                       // thời lượng đoạn giữa
  const out = [{ role: "open", id: open, a: 0, b: k ? O : T - E }];
  mid.forEach((id, j) => out.push({ role: "mid", id, a: O + M * j / k, b: O + M * (j + 1) / k }));
  if (endOn) out.push({ role: "end", id: end, a: T - E, b: T });
  return out;                                 // a, b làm tròn 1 chữ số thập phân khi hiển thị
}
```

Ví dụ 15 giây, 4 động tác giữa, không kết: `0–2s`, `2–5.3s`, `5.3–8.5s`, `8.5–11.8s`, `11.8–15s` (mỗi động tác giữa 3,25 giây).

**Cảnh báo:** khi `M / k < 2` (mỗi động tác giữa dưới 2 giây), hiện dòng "Mỗi động tác chưa tới 2 giây, AI dễ làm vội và giật."

Mỗi dòng trong `{{actions}}`:

```text
<a>–<b>s: <câu lệnh đã thay biến>
```

## 6. Đổi ngẫu nhiên

Đầu vào: kiểu (`bold` nổi bật hoặc `soft` nhẹ nhàng), số động tác giữa hiện tại (nếu đang trống: 3 cho 10 giây, 4 cho 15 giây, 6 cho 20 giây).

Luật chọn:
1. Chỉ chọn động tác có sẵn **không có nhãn điều kiện**.
2. Không lặp lại một động tác trong cùng một chuỗi.
3. Mở đầu: chọn trong các động tác có vị trí `o`.
4. Đoạn giữa: chọn trong các động tác vị trí `m`, không thuộc nhóm Kết.
   - Kiểu `bold`: động tác giữa **đầu tiên** bắt buộc là động tác nổi bật.
   - Kiểu `soft`: loại toàn bộ động tác nổi bật.
   - "Lùi chậm về khung toàn thân" chỉ được chọn sau khi đã có động tác đi tới máy (`m1` hoặc `mb1`).
   - Tối đa **một** động tác chỉ tay trong cả chuỗi.
5. Đoạn kết (dù đang tắt vẫn chọn sẵn để bật lên là có): nhóm Kết hoặc Chỉ tay có vị trí `e`; kiểu `bold` thì bắt buộc nổi bật.

## 7. Negative đầu ra

1. Lấy negative của tài khoản (hoặc mặc định).
2. Nếu chuỗi có động tác nhãn `B` → bỏ cụm `back view`.

Lỗi riêng của sản phẩm (`extraNeg`) **không** thêm vào ô negative mà nằm trong câu "No..." ở cuối prompt, vì nhiều công cụ (như Meta AI) không có ô negative riêng.

## 8. Lưu và dùng lại

- **Lưu** chép nguyên văn prompt và negative tại thời điểm lưu, kèm `settings` (tài liệu 03, mục 3). Sửa template sau này không làm đổi prompt đã lưu.
- **Dùng lại và chỉnh** nạp `settings` vào bộ tạo, chọn đúng sản phẩm, rồi ghép lại prompt bằng template **hiện tại**. Nếu template đã đổi, prompt mới có thể khác bản đã lưu. Muốn đúng bản cũ thì dùng nút Copy ở thẻ prompt đã lưu.
- Mã động tác không còn tồn tại thì thay bằng mặc định của vị trí: mở `ob1`, giữa `mb1`, kết `eb1`.

## 9. Ví dụ đầu ra

Nữ, 10 giây, mở `ob1`, giữa `mb1` và `mb2`, không kết, áo luôn đóng, lỗi riêng "shrinking brim":

```text
The woman from the reference image, wearing the product shown in it, performs one continuous 10-second product showcase in the same setting as the reference image. ONE SINGLE UNBROKEN TAKE, no cuts, no scene changes.
...
Action — one continuous chain of movements, each gesture flowing into the next:
0–2s: Starting exactly as in the reference image, she takes one or two confident steps toward the camera with a bright, self-assured smile, shoulders back and posture tall, arms swinging naturally away from the product.
2–6s: She walks toward the camera with a confident catwalk stride, one foot placed in front of the other, arms swinging naturally away from the product, and stops in a waist-up medium shot in a poised fashion pose.
6–10s: She turns her body about forty-five degrees to one side, showing the silhouette of the product in profile, glances back at the camera over her shoulder with a confident smile, holds the pose, then turns back to face the camera.
...
... no distorted seams, no shrinking brim, no hands touching the product, ...
```
