// Starter entries shipped with the app: read-only, shown beside the team's own resources.
// Prompts are in English (image tools follow English best); titles and notes are Vietnamese.

export const KINDS = {
  image: { label: "Prompt tạo ảnh", short: "Prompt ảnh" },
  skill: { label: "Skill", short: "Skill" },
};

const NEG_PHOTO =
  "blurry, low resolution, jpeg artifacts, oversaturated, plastic skin, extra fingers, deformed hands, distorted fabric, warped logo, text, watermark, cropped product, harsh shadows";

export const BUILTIN_RESOURCES = [
  {
    _id: "b-img-studio",
    kind: "image",
    title: "Ảnh lookbook studio nền trơn",
    tool: "Midjourney / Flux",
    tags: ["lookbook", "studio", "người mẫu"],
    note: "Thay [OUTFIT] bằng mô tả sản phẩm thật (màu, chất liệu, kiểu dáng). Đưa kèm ảnh sản phẩm làm tham chiếu nếu công cụ cho phép.",
    content:
      "Full-body fashion lookbook photo of a young Asian female model wearing [OUTFIT], standing relaxed with weight on one leg, soft natural smile, seamless warm beige studio backdrop, large softbox key light from the left with gentle fill, subtle floor shadow, shot on 85mm lens at f/4, sharp focus on fabric texture and stitching, true-to-life colors, clean editorial look, 3:4 vertical composition, ultra detailed, 8k",
    negative: NEG_PHOTO,
  },
  {
    _id: "b-img-flatlay",
    kind: "image",
    title: "Flat lay sản phẩm trên mặt vải lanh",
    tool: "Midjourney / Flux",
    tags: ["flat lay", "sản phẩm", "không người mẫu"],
    note: "Hợp với áo thun, áo sơ mi, phụ kiện. Đạo cụ nên ít và cùng tông.",
    content:
      "Top-down flat lay product photo of [PRODUCT] neatly folded on natural linen fabric, a few minimal props (dried flowers, a ceramic cup) placed at the edges, soft diffused daylight from a window, gentle long shadows, muted earthy palette, crisp fabric texture, centered composition with breathing room, commercial e-commerce quality, 4:5 aspect ratio",
    negative: NEG_PHOTO + ", clutter, messy wrinkles",
  },
  {
    _id: "b-img-white",
    kind: "image",
    title: "Ảnh sàn TMĐT nền trắng (ghost mannequin)",
    tool: "Flux / GPT Image",
    tags: ["nền trắng", "sàn TMĐT", "sản phẩm"],
    note: "Kiểu ảnh chính trên Shopee/TikTok Shop: sản phẩm như đang được mặc nhưng không thấy người.",
    content:
      "Ghost mannequin product photo of [PRODUCT], invisible mannequin showing natural 3D shape and drape, pure white background (#FFFFFF), even shadowless studio lighting, front view, perfectly centered, accurate color reproduction, visible fabric weave and seams, high-end e-commerce catalog style, square 1:1",
    negative: NEG_PHOTO + ", visible mannequin, hanger, background props",
  },
  {
    _id: "b-img-street",
    kind: "image",
    title: "Ảnh đường phố giờ vàng",
    tool: "Midjourney",
    tags: ["lifestyle", "ngoài trời", "người mẫu"],
    note: "Thêm --style raw --ar 4:5 trên Midjourney cho ảnh tự nhiên hơn.",
    content:
      "Candid street-style photo of a young Asian model wearing [OUTFIT], walking across a quiet city street at golden hour, warm low sun backlighting the hair, soft lens flare, shallow depth of field with creamy bokeh, shot on 50mm f/1.8, natural movement in the fabric, authentic lifestyle mood, film-like color grading, 4:5 vertical",
    negative: NEG_PHOTO + ", crowd, cars in focus",
  },
  {
    _id: "b-img-macro",
    kind: "image",
    title: "Cận chất liệu vải (macro)",
    tool: "Flux / GPT Image",
    tags: ["cận cảnh", "chất liệu", "chi tiết"],
    note: "Dùng làm ảnh phụ khoe chất vải, đường may, nút, khoá kéo.",
    content:
      "Macro close-up photo of [FABRIC / DETAIL] on [PRODUCT], extreme detail of the weave and stitching, raking side light to reveal texture, shallow depth of field, rich but accurate color, soft neutral background falloff, luxury product photography, 1:1",
    negative: NEG_PHOTO,
  },
  {
    _id: "b-skill-image-prompt",
    kind: "skill",
    title: "Skill: viết prompt ảnh thời trang",
    tool: "Claude",
    tags: ["SKILL.md", "prompt ảnh"],
    note: "Tải về thành SKILL.md, đặt trong thư mục skill (vd. .claude/skills/fashion-image-prompt/) để Claude tự dùng khi được nhờ viết prompt ảnh.",
    content: `---
name: fashion-image-prompt
description: Viết prompt tạo ảnh thời trang chất lượng cao (lookbook, flat lay, nền trắng, lifestyle) từ thông tin sản phẩm. Dùng khi người dùng xin prompt tạo ảnh cho quần áo, phụ kiện.
---

# Viết prompt ảnh thời trang

## Hỏi hoặc suy ra trước khi viết
1. Sản phẩm: loại, màu chính xác, chất liệu, kiểu dáng, chi tiết nổi bật.
2. Mục đích ảnh: ảnh chính sàn TMĐT, lookbook, lifestyle, cận chất liệu.
3. Công cụ: Midjourney, Flux, GPT Image... (ảnh hưởng cú pháp và tỉ lệ khung).

## Cấu trúc prompt (tiếng Anh, một đoạn)
[Loại ảnh] of [chủ thể + sản phẩm mô tả cụ thể], [tư thế/bố cục], [bối cảnh/nền], [ánh sáng], [ống kính, khẩu độ], [màu sắc/tâm trạng], [chất lượng], [tỉ lệ khung]

## Quy tắc
- Mô tả sản phẩm đúng như thật; không thêm logo, chữ, hoạ tiết không có.
- Luôn có câu giữ màu thật: "true-to-life colors".
- Một nguồn sáng chính rõ ràng; tránh "dramatic" nếu là ảnh bán hàng.
- Kèm negative: blurry, deformed hands, distorted fabric, text, watermark.
- Đưa 3 biến thể: an toàn, sáng tạo, tối giản.

## Đầu ra
- Prompt chính
- Negative prompt
- Gợi ý tỉ lệ khung và tham số theo công cụ`,
    negative: "",
  },
  {
    _id: "b-skill-review",
    kind: "skill",
    title: "Skill: chấm và sửa prompt ảnh",
    tool: "Claude",
    tags: ["SKILL.md", "chấm điểm"],
    note: "Dán prompt cũ vào, skill chỉ ra chỗ yếu và viết lại.",
    content: `---
name: image-prompt-review
description: Chấm điểm và viết lại prompt tạo ảnh cho rõ, cụ thể, ra ảnh ổn định hơn. Dùng khi người dùng đưa một prompt ảnh và hỏi sao ảnh ra xấu hoặc nhờ cải thiện.
---

# Chấm và sửa prompt ảnh

Chấm từng mục 0–2 điểm, tổng 10:
1. Chủ thể và sản phẩm có mô tả cụ thể (màu, chất liệu, kiểu)?
2. Bố cục, góc máy, tỉ lệ khung rõ ràng?
3. Ánh sáng có một nguồn chính được gọi tên?
4. Không có từ mâu thuẫn hoặc sáo rỗng ("beautiful, amazing, best")?
5. Có negative phù hợp loại ảnh?

Sau đó:
- Liệt kê tối đa 3 lỗi quan trọng nhất, mỗi lỗi một dòng.
- Viết lại prompt hoàn chỉnh, giữ ý định ban đầu.
- Ghi ngắn gọn thay đổi gì và vì sao.`,
    negative: "",
  },
];
