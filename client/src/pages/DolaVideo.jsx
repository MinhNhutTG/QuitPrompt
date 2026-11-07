import { useEffect, useMemo, useState } from "react";
import { Field, Seg } from "../components/ui.jsx";
import { useCopy } from "../components/PromptPanel.jsx";

// Trang "Video Dola": prompt for Dola AI image-to-video. The user attaches ONE reference image (the model already
// wearing the product) and pastes this prompt. The prompt follows the fixed Dola form: 2-second beats, one continuous
// take, a strict product-preservation block, camera/quality, audio and an END FRAME so clips (PART 1, 2, 3) chain.
// Everything runs in the browser; the image is only previewed here.

// Beats per part. Clothing: hands never touch the garment. Hat with face cover: fingertips may touch only the
// outer brim edge (the one exception the user confirmed).
const BEATS = {
  clothes: {
    1: [
      ["Eye contact and introduction", "She looks directly into the camera with a soft, confident smile and gently tilts her head, then returns to center. Her arms rest naturally at her sides. The outfit is fully visible and perfectly still."],
      ["Reveal the side", "She slowly turns her shoulders a few degrees to her right while keeping her face mostly toward the camera, showing the side cut and drape of the outfit. Her hands stay relaxed and away from the fabric."],
      ["Natural profile", "She turns her head about 20 degrees to the left, pauses briefly, then returns to the front. The fabric moves only slightly with her body."],
      ["Small step closer", "She takes one small, relaxed step toward the camera, posture upright, so the fabric texture and details become clearer. Her arms swing very slightly and naturally."],
      ["Confident closing", "She smiles with her eyes, gives a subtle eyebrow raise, and settles into a calm, front-facing pose with direct eye contact."],
    ],
    2: [
      ["Gentle head movement", "She maintains direct eye contact, gently tilts her head to the opposite side from the previous ending pose, then returns to center. Her eyes look warm and confident."],
      ["Turn to the other side", "She slowly turns her shoulders a few degrees to her left, keeping her face toward the camera, revealing the other side of the outfit. Her hands remain relaxed at her sides."],
      ["Slow quarter turn", "She slowly rotates her body a quarter turn, showing the side silhouette of the outfit, then turns smoothly back toward the camera."],
      ["Soft expression", "She gives a subtle, friendly eyebrow raise and a gentle smile, shifting her weight lightly onto one leg."],
      ["Presenting gesture", "Her right hand briefly lifts beside her shoulder in a small presenting gesture, palm relaxed and fingers naturally separated, away from the outfit. She lowers her hand and settles into a calm, front-facing pose."],
    ],
    3: [
      ["Gentle restart", "She tilts her head slightly to the opposite side from the previous ending pose, then returns to center with a soft smile and direct eye contact."],
      ["Small step back", "She takes one small step back so more of the outfit enters the frame, showing its overall shape and length. Her arms hang relaxed."],
      ["Slow sway", "She sways her upper body gently from side to side, letting the fabric move naturally with her. Her hands stay away from the garment."],
      ["Look over the shoulder", "She turns her head and shoulders slightly to the right, glances back toward the camera over her shoulder, then returns to the front."],
      ["Final pose", "She settles into a relaxed, confident front-facing pose, smiles with her eyes and holds still for the final moment."],
    ],
  },
  hat: {
    1: [
      ["Eye contact and introduction", "She looks directly into the camera with warm, confident eyes and gently tilts her head, then returns to center. The hat and face cover remain perfectly stable."],
      ["Show the brim", "She slowly raises her right hand and lightly touches the outer edge of the brim near her temple with her fingertips, then lowers her hand naturally. The brim keeps its original shape."],
      ["Natural side profile", "She turns her head about 20 degrees to the right, pauses briefly, then returns to the front, showing the crown, brim and side of the hat."],
      ["Show the cape", "She gently turns her shoulders a few degrees, keeping her face toward the camera, revealing how the neck cape drapes over her shoulders. Her hands stay away from the cape and face panel."],
      ["Calm closing", "She smiles with her eyes only and settles into a calm, front-facing pose with direct eye contact."],
    ],
    2: [
      ["Gentle head movement", "She maintains direct eye contact with the camera, gently tilts her head to the opposite side from the previous ending pose, then returns to center. Her eyes look warm and confident. The hat and face cover remain perfectly stable."],
      ["Highlight the brim coverage", "She slowly raises her right hand and lightly touches the outer edge of the brim near her temple. She traces a very short distance along the outer brim edge with her fingertips to emphasize its width, then lowers her hand naturally. The brim maintains its original shape."],
      ["Show the neck cape", "She gently turns her shoulders a few degrees to one side while keeping her face oriented mostly toward the camera. The movement reveals how the neck cape drapes over her shoulders and upper chest. Her hands remain away from the cape fabric and the face panel."],
      ["Natural side-profile showcase", "She slowly turns her head approximately 20 degrees to the left, pauses briefly, then returns to the front. The camera clearly captures the crown, wide brim, integrated face covering and cape silhouette."],
      ["Confident closing pose", "She gives a subtle, friendly eyebrow raise and a gentle head tilt. Her right hand briefly lifts beside her shoulder in a small presenting gesture, with her palm relaxed and fingers naturally separated. She lowers her hand and settles into a calm, front-facing pose with direct eye contact."],
    ],
    3: [
      ["Gentle restart", "She tilts her head slightly to the opposite side from the previous ending pose, then returns to center, eyes smiling. The hat and face cover stay perfectly still."],
      ["Small step closer", "She takes one small step toward the camera so the face panel texture and brim stitching become clearer. Her hands stay relaxed at her sides."],
      ["Look over the shoulder", "She turns her shoulders slightly to the left and glances back at the camera, showing the back of the cape, then returns to the front."],
      ["Small wave", "She gives a small, relaxed wave beside her shoulder, palm open and fingers naturally separated, far from her face, then lowers her hand."],
      ["Final pose", "She settles into a calm, front-facing pose, smiling with her eyes only, and holds still."],
    ],
  },
};

const TYPES = [
  { value: "clothes", label: "Quần áo" },
  { value: "hat", label: "Mũ che mặt" },
];
const PARTS = [
  { value: 0, label: "Clip lẻ" },
  { value: 1, label: "Part 1" },
  { value: 2, label: "Part 2" },
  { value: 3, label: "Part 3" },
];
const FRAMINGS = [
  { value: "chest-up", label: "Ngang ngực", text: "chest-up framing" },
  { value: "waist-up", label: "Ngang hông", text: "waist-up framing" },
  { value: "full", label: "Toàn thân", text: "full-body framing from head to toe" },
];
const PLACES = [
  { value: "outdoor", label: "Ngoài trời", light: "daylight", audio: "quiet outdoor ambience" },
  { value: "indoor", label: "Trong nhà", light: "soft indoor lighting", audio: "quiet indoor room ambience" },
];

const NEGATIVE = {
  clothes: "cuts, scene changes, zoom, fast motion, hands touching or pulling the clothing, changed colors, changed logo or text, extra accessories, different face, other people, distorted hands, extra fingers, watermark, text overlay",
  hat: "visible nose, mouth, lips or chin, see-through face cover, hands touching the mesh or face cover, lowering the face cover, changed logo, cuts, zoom, other people, different face, distorted hands, extra fingers, watermark, text overlay",
};

function buildPrompt({ type, part, framing, place, setting, details }) {
  const fr = FRAMINGS.find((f) => f.value === framing);
  const pl = PLACES.find((p) => p.value === place);
  const beats = BEATS[type][part || 1];
  const d = details.trim();
  const bg = setting.trim();
  const lines = [`ACTION — 10-SECOND PRODUCT SHOWCASE${part ? `, PART ${part}` : ""}`, "", "ONE CONTINUOUS TAKE — NO CUTS", ""];

  beats.forEach(([title, text], i) => {
    lines.push(`${i * 2}–${i * 2 + 2} seconds — ${title}:`, text, "");
  });

  lines.push("STRICT PRODUCT PRESERVATION", "", "One uninterrupted shot, no cuts, no transitions, no scene changes. Smooth, slow, connected movements with realistic human timing.", "");
  lines.push("The woman is the exact same person as in the reference image: same face, eyes, skin tone, hairstyle and body shape. Do not change, beautify or replace her.", "");
  if (type === "hat") {
    lines.push(`Preserve the exact original sun hat from the reference image${d ? `: ${d}` : ""}: the crown, brim, band, face panel, side flaps and neck cape keep their exact shape, color and details.`, "");
    lines.push("The face cover is a solid material, never a gap or a transparent layer. Any mesh panel remains a flat, continuous fabric surface with evenly spaced perforations. Never reveal the nose, nostrils, mouth, lips, teeth, chin, or lower-face contours. Only the eyes and eyebrows are visible. The mouth stays closed and still; she smiles with her eyes only. The face cover is never lowered or opened.", "");
    lines.push("Fingertips may touch only the outer edge of the brim. Hands must never touch the mesh, face-covering fabric, or side flaps. No pulling, pressing, rubbing, stretching, or repositioning the product. No extra accessories, straps, logos, labels, prints, or design changes.", "");
  } else {
    lines.push(`Preserve the exact outfit from the reference image${d ? `: ${d}` : ""}. Keep every color, pattern, print, fabric texture, cut, length, neckline, sleeves, buttons, zippers and stitching exactly as shown.`, "");
    lines.push("The garment stays fastened and in place. Any logo or printed text keeps its exact position, size, color and spelling. No added pockets, stripes, labels or prints.", "");
    lines.push("Hands never touch the clothing. No pulling, pressing, rubbing, stretching, or adjusting the fabric. No extra accessories, straps, logos, labels, or design changes.", "");
  }

  lines.push("CAMERA AND QUALITY", "");
  const keep =
    part > 1
      ? `Maintain the same setting, ${pl.light}, background, and product appearance as the previous clip.`
      : `The setting stays fixed for the whole clip: ${bg || "the same background as the reference image"}, ${pl.light}. No signs, store names or logos in the background, no other people.`;
  lines.push(`Vertical 9:16, ${fr.text}, front-facing camera at eye level. Keep the woman centered with consistent framing and subtle natural handheld movement. ${keep}`, "");
  lines.push("Photorealistic premium lifestyle commercial, realistic fabric texture and stitching, accurate colors matching the reference image, natural eye expressions, anatomically correct hands, smooth 24fps motion.", "");
  lines.push(`Audio: ${pl.audio} only, no speech, no music.`, "");
  lines.push(`END FRAME: The woman faces the camera in a relaxed neutral pose${part && part < 3 ? ", ready to continue into the next product showcase segment" : ""}.`);
  return lines.join("\n");
}

function ImageSlot({ file, onFile }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return (
    <div className="imgp-slot">
      <span className="field-label">Ảnh tham chiếu</span>
      <label
        className={`drop imgp-drop ${url ? "has-img" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f?.type.startsWith("image/")) onFile(f);
        }}
      >
        <input type="file" accept="image/*" onChange={(e) => (onFile(e.target.files?.[0] || null), (e.target.value = ""))} />
        {url ? <img src={url} alt="Ảnh tham chiếu" /> : <span>+ Chọn ảnh</span>}
      </label>
      <span className="hint">Người mẫu đang mặc sản phẩm, mặt và sản phẩm rõ nét. Có thể lấy ảnh tạo từ “Ảnh AI”.</span>
      {file && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onFile(null)}>
          Bỏ ảnh
        </button>
      )}
    </div>
  );
}

export default function DolaVideo() {
  const { flash, copy } = useCopy();
  const [image, setImage] = useState(null);
  const [type, setType] = useState("clothes");
  const [part, setPart] = useState(0);
  const [framing, setFraming] = useState("waist-up");
  const [place, setPlace] = useState("outdoor");
  const [setting, setSetting] = useState("");
  const [details, setDetails] = useState("");

  const prompt = useMemo(() => buildPrompt({ type, part, framing, place, setting, details }), [type, part, framing, place, setting, details]);
  const negative = NEGATIVE[type];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Prompt video Dola AI</h1>
          <p>Tải 1 ảnh người mẫu đang mặc sản phẩm, chọn kiểu clip, rồi copy prompt sang Dola AI (ảnh thành video, 10 giây).</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card stack">
          <div className="imgp-slots">
            <ImageSlot file={image} onFile={setImage} />
          </div>

          <div className="field">
            <span className="field-label">Loại sản phẩm</span>
            <Seg name="dola-type" label="Loại sản phẩm" value={type} options={TYPES} onChange={setType} />
          </div>
          <div className="field">
            <span className="field-label">Clip</span>
            <Seg name="dola-part" label="Clip" value={part} options={PARTS} onChange={setPart} />
            <span className="hint">Ghép nhiều clip: Part 2 bắt đầu từ khung cuối của Part 1, mỗi part một bộ động tác khác.</span>
          </div>
          <div className="field">
            <span className="field-label">Cỡ cảnh</span>
            <Seg name="dola-framing" label="Cỡ cảnh" value={framing} options={FRAMINGS} onChange={setFraming} />
          </div>
          <div className="field">
            <span className="field-label">Không gian</span>
            <Seg name="dola-place" label="Không gian" value={place} options={PLACES} onChange={setPlace} />
          </div>

          <Field label="Bối cảnh" hint="Nên viết tiếng Anh. Bỏ trống thì giữ đúng nền trong ảnh tham chiếu">
            <input className="input" value={setting} onChange={(e) => setSetting(e.target.value)} placeholder="Ví dụ: a sunny park path with green trees" />
          </Field>
          <Field label="Chi tiết sản phẩm cần giữ" hint="Nên viết tiếng Anh: màu, hoạ tiết, logo… Bỏ trống thì giữ theo ảnh">
            <input className="input" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Ví dụ: cream linen shirt with small brown buttons" />
          </Field>
        </div>

        <div className="card stack">
          <div className="sec">
            <div className="sec-h">Prompt {flash === "p" ? <span className="ok-text">Đã copy</span> : null}</div>
            <pre className="out" tabIndex={0} aria-label="Prompt">
              {prompt}
            </pre>
            <div className="btns">
              <button type="button" className="btn btn-primary" onClick={() => copy(prompt, "p")}>
                Copy prompt
              </button>
            </div>
          </div>
          <div className="sec">
            <div className="sec-h">Negative (nếu Dola có ô này) {flash === "n" ? <span className="ok-text">Đã copy</span> : null}</div>
            <pre className="out" tabIndex={0} aria-label="Negative prompt">
              {negative}
            </pre>
            <div className="btns">
              <button type="button" className="btn" onClick={() => copy(negative, "n")}>
                Copy negative
              </button>
            </div>
          </div>
          <p className="hint">Tạo 3–4 lần mỗi clip rồi chọn bản đẹp nhất. Ghép clip theo thứ tự Part 1 → 2 → 3, cắt 1–2 khung ở chỗ nối. Che watermark Dola trước khi đăng, bật nhãn “Nội dung do AI tạo” trên TikTok.</p>
        </div>
      </div>
    </div>
  );
}
