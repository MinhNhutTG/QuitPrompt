import { useEffect, useMemo, useState } from "react";
import { Field, Seg } from "../components/ui.jsx";
import { useCopy } from "../components/PromptPanel.jsx";

// Trang "Ảnh AI": prompt for an image model (ChatGPT, Gemini, …) that dresses the woman in image 1 in the outfit
// from image 2, in a chosen pose and background. Everything runs in the browser: the two images are only previewed
// here so the user can check them, then attached in the same order in the AI tool.

const POSES = [
  { id: "sit", label: "Ngồi trên ghế", text: "sitting naturally on a chair with a relaxed, elegant posture, hands resting lightly on her lap, the whole outfit clearly visible" },
  { id: "stand", label: "Đứng", text: "standing in a relaxed natural pose with her weight on one leg, full body visible from head to toe" },
  { id: "selfie-run", label: "Chụp selfie đang chạy bộ", text: "taking a selfie while jogging, one arm extended holding a smartphone toward the camera, slight natural motion, energetic smile, framed from the phone's point of view" },
  { id: "walk", label: "Đang đi", text: "walking toward the camera mid-stride with a natural arm swing and a confident expression, full body visible" },
  { id: "custom", label: "Khác (tự nhập)…", text: "" },
];

const RATIOS = [
  { value: "9:16", label: "9:16" },
  { value: "3:4", label: "3:4" },
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
];

const BG_IDEAS = ["phòng ngủ ấm cúng, ánh nắng chiều qua cửa sổ", "quán cà phê sáng sủa", "phố đi bộ buổi sáng", "công viên cây xanh", "studio phông trơn màu be"];

function buildPrompt({ pose, background, ratio }) {
  const bg = background.trim() || "a clean, simple setting that suits the outfit";
  return [
    "Use the two attached images as references. Image 1: the woman (model reference). Image 2: the fashion product (outfit reference).",
    "",
    "Task: dress the woman from Image 1 in the exact outfit from Image 2.",
    "",
    "FACE LOCK (most important): the woman must be the exact same person as in Image 1, not a different model and not a look-alike. Copy her face exactly from Image 1: face shape, eyes, eyebrows, nose, lips, jawline, skin tone, moles or marks, makeup and age. Do not beautify, slim, retouch or alter her face in any way. Anyone who knows her must recognize her instantly.",
    "Also keep her hairstyle, hair color and body shape from Image 1. Only the clothing, pose and background change.",
    "Reproduce the outfit from Image 2 exactly: same colors, pattern, print, fabric texture, cut, length, neckline, sleeves, buttons, details and logos. Do not redesign or add anything to it. Ignore any person, mannequin, hanger or background in Image 2.",
    "The outfit fits her body naturally with realistic fabric folds and drape.",
    "",
    `Pose: ${pose}.`,
    `Background: ${bg}.`,
    "",
    `Style: photorealistic fashion photo, natural soft lighting matching the background, sharp focus on the outfit, true-to-life colors, high detail. Aspect ratio ${ratio}.`,
    "Avoid: replacing her with another model, a different or generic face, changing her facial features or ethnicity, changing the outfit's color or design, extra clothing items, distorted hands or fingers, text or watermarks.",
  ].join("\n");
}

function ImageSlot({ n, title, hint, file, onFile }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return (
    <div className="imgp-slot">
      <span className="field-label">
        Ảnh {n}: {title}
      </span>
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
        {url ? <img src={url} alt={`Ảnh ${n}`} /> : <span>+ Chọn ảnh</span>}
      </label>
      <span className="hint">{hint}</span>
      {file && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onFile(null)}>
          Bỏ ảnh
        </button>
      )}
    </div>
  );
}

export default function ImagePrompt() {
  const { flash, copy } = useCopy();
  const [model, setModel] = useState(null);
  const [outfit, setOutfit] = useState(null);
  const [poseId, setPoseId] = useState(POSES[0].id);
  const [customPose, setCustomPose] = useState("");
  const [background, setBackground] = useState("");
  const [ratio, setRatio] = useState("9:16");

  const preset = POSES.find((p) => p.id === poseId);
  const pose = poseId === "custom" ? customPose.trim() : preset.text;
  const prompt = useMemo(() => buildPrompt({ pose: pose || "a natural, relaxed pose that shows the whole outfit", background, ratio }), [pose, background, ratio]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Prompt ảnh AI thay đồ</h1>
          <p>Mặc sản phẩm thời trang (ảnh 2) cho người mẫu nữ (ảnh 1), chọn động tác và bối cảnh, rồi copy prompt sang ChatGPT, Gemini…</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card stack">
          <div className="imgp-slots">
            <ImageSlot n={1} title="Người mẫu nữ" hint="Mặt chính diện, rõ nét, đủ sáng để AI giữ đúng khuôn mặt" file={model} onFile={setModel} />
            <ImageSlot n={2} title="Sản phẩm" hint="Rõ màu, hoạ tiết, chi tiết" file={outfit} onFile={setOutfit} />
          </div>

          <Field label="Động tác">
            <select className="input" value={poseId} onChange={(e) => setPoseId(e.target.value)}>
              {POSES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          {poseId === "custom" && (
            <Field label="Động tác khác" hint="Nên viết tiếng Anh, ví dụ: leaning against a wall with arms crossed">
              <input className="input" autoFocus value={customPose} onChange={(e) => setCustomPose(e.target.value)} placeholder="Mô tả động tác…" />
            </Field>
          )}

          <Field label="Bối cảnh" hint="Bỏ trống thì dùng phông đơn giản hợp với trang phục">
            <input className="input" list="imgp-bg" value={background} onChange={(e) => setBackground(e.target.value)} placeholder="Ví dụ: phòng ngủ ấm cúng, ánh nắng qua cửa sổ" />
            <datalist id="imgp-bg">
              {BG_IDEAS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>

          <div className="field">
            <span className="field-label">Tỉ lệ ảnh</span>
            <Seg name="imgp-ratio" label="Tỉ lệ ảnh" value={ratio} options={RATIOS} onChange={setRatio} />
          </div>
        </div>

        <div className="card">
          <div className="sec">
            <div className="sec-h">Prompt {flash === "p" ? <span className="ok-text">Đã copy</span> : null}</div>
            <pre className="out" tabIndex={0} aria-label="Prompt">
              {prompt}
            </pre>
            {poseId === "custom" && !customPose.trim() && <p className="hint">Chưa nhập động tác, prompt đang dùng dáng tự nhiên.</p>}
            <p className="hint">Khi dán vào công cụ AI, đính kèm ảnh người mẫu trước, ảnh sản phẩm sau cho đúng thứ tự Ảnh 1, Ảnh 2. Nếu ảnh ra bị đổi mặt, nhắn thêm cho AI: “Giữ đúng khuôn mặt của người trong ảnh 1, làm lại”.</p>
            <div className="btns">
              <button type="button" className="btn btn-primary" onClick={() => copy(prompt, "p")}>
                Copy prompt
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
