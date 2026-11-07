import { useEffect, useMemo, useState } from "react";
import { Field, Seg } from "../components/ui.jsx";
import { useCopy } from "../components/PromptPanel.jsx";
import { FRAMINGS, NEGATIVE, PARTS, PLACES, TYPES, buildDolaPrompt } from "../lib/dola.js";

// Trang "Video Dola": prompt for Dola AI image-to-video (built in lib/dola.js). The user attaches ONE reference image
// (the model already wearing the product) and pastes this prompt.
// Everything runs in the browser; the image is only previewed here.

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

  const prompt = useMemo(() => buildDolaPrompt({ type, part, framing, place, setting, details }), [type, part, framing, place, setting, details]);
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
