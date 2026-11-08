import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Field, Modal, Seg } from "../components/ui.jsx";
import { useCopy } from "../components/PromptPanel.jsx";
import LazyImage from "../components/LazyImage.jsx";
import { useAssets } from "../lib/queries.js";
import { attachmentUrl, store, thumbUrl } from "../lib/util.js";
import { ASSET_KINDS, AssetCard, AssetFilters, useAssetFilter } from "./Models.jsx";

// Trang "Ảnh AI": prompt for an image model (ChatGPT, Gemini, …) that dresses the woman in image 1 in the outfit
// from image 2, in a chosen pose and background. Image 1 (người mẫu) and the optional background image can come from
// the team's store (pages/Models.jsx) or from this computer. Nothing is uploaded here: images are previewed so the user
// can check them, then attached in the same order in the AI tool.

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

function buildPrompt({ pose, background, ratio, modelDesc = "", bgImage = false, bgDesc = "" }) {
  const extra = background.trim();
  let bg;
  if (bgImage) {
    const about = [bgDesc.trim(), extra].filter(Boolean).join("; ");
    bg = `place her in the exact setting from Image 3: same location, furniture, colors, lighting and mood${about ? ` (${about})` : ""}. Keep the perspective natural so she fits into the scene realistically`;
  } else bg = [bgDesc.trim(), extra].filter(Boolean).join("; ") || "a clean, simple setting that suits the outfit";
  return [
    `Use the ${bgImage ? "three" : "two"} attached images as references. Image 1: the woman (model reference). Image 2: the fashion product (outfit reference).${bgImage ? " Image 3: the background (location reference)." : ""}`,
    "",
    "Task: dress the woman from Image 1 in the exact outfit from Image 2.",
    "",
    "FACE LOCK (most important): the woman must be the exact same person as in Image 1, not a different model and not a look-alike. Copy her face exactly from Image 1: face shape, eyes, eyebrows, nose, lips, jawline, skin tone, moles or marks, makeup and age. Do not beautify, slim, retouch or alter her face in any way. Anyone who knows her must recognize her instantly.",
    "Also keep her hairstyle, hair color and body shape from Image 1. Only the clothing, pose and background change.",
    ...(modelDesc.trim() ? [`About her: ${modelDesc.trim()}.`] : []),
    "Reproduce the outfit from Image 2 exactly: same colors, pattern, print, fabric texture, cut, length, neckline, sleeves, buttons, details and logos. Do not redesign or add anything to it. Ignore any person, mannequin, hanger or background in Image 2.",
    ...(bgImage ? ["Use Image 3 only for the place: ignore any people in it."] : []),
    "The outfit fits her body naturally with realistic fabric folds and drape.",
    "",
    `Pose: ${pose}.`,
    `Background: ${bg}.`,
    "",
    `Style: photorealistic fashion photo, natural soft lighting matching the background, sharp focus on the outfit, true-to-life colors, high detail. Aspect ratio ${ratio}.`,
    "Avoid: replacing her with another model, a different or generic face, changing her facial features or ethnicity, changing the outfit's color or design, extra clothing items, distorted hands or fingers, text or watermarks.",
  ].join("\n");
}

// Pick a người mẫu / phông nền from the team's store, then which of its photos goes to the AI.
function AssetPicker({ kind, open, onClose, onPick }) {
  const { data, isLoading, error } = useAssets();
  const f = useAssetFilter(data?.items, kind);
  const [chosen, setChosen] = useState(null);
  const K = ASSET_KINDS[kind];
  const close = () => {
    setChosen(null);
    onClose();
  };
  const take = (asset, image) => {
    onPick({ asset, image });
    close();
  };

  return (
    <Modal open={open} onClose={close} title={chosen ? `${chosen.name}: chọn ảnh gửi cho AI` : `Chọn ${K.one} từ kho`} wide>
      {chosen ? (
        <div className="stack">
          <div className="asset-photos">
            {chosen.images.map((img, i) => (
              <button key={img.publicId} type="button" className="thumb" onClick={() => take(chosen, img)} aria-label={`Chọn ảnh ${i + 1}`}>
                <LazyImage image={img} width={140} ratio="3 / 4" />
                {i === 0 && <span className="badge">Đại diện</span>}
              </button>
            ))}
          </div>
          <div className="btns">
            <button type="button" className="btn btn-ghost" onClick={() => setChosen(null)}>
              ← Chọn {K.one} khác
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          {f.total > 0 && <AssetFilters f={f} kind={kind} />}
          {isLoading ? (
            <p className="hint">Đang tải kho…</p>
          ) : error ? (
            <p className="error">{error.message}</p>
          ) : !f.list.length ? (
            <p className="hint">
              {f.total ? "Không có mục nào khớp." : `Kho chưa có ${K.one} nào.`} <Link to={`/models${kind === "model" ? "" : "?kind=background"}`}>Mở kho {K.label.toLowerCase()}</Link>
            </p>
          ) : (
            <div className="asset-pick-grid">
              {f.list.map((a) => (
                <AssetCard
                  key={a._id}
                  asset={a}
                  onClick={() => {
                    if (!a.images?.length) return;
                    if (a.images.length === 1) take(a, a.images[0]);
                    else setChosen(a);
                  }}
                />
              ))}
            </div>
          )}
          <p className="hint">Mục chưa có ảnh thì chưa chọn được. Thêm, sửa ở trang Người mẫu.</p>
        </div>
      )}
    </Modal>
  );
}

// One reference image: from the store ({ asset, image }) or from this computer (a File).
function ImageSlot({ n, title, hint, value, onChange, kind, optional }) {
  const [picking, setPicking] = useState(false);
  const file = value instanceof File ? value : null;
  const picked = value && !file ? value : null;
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => fileUrl && URL.revokeObjectURL(fileUrl), [fileUrl]);
  const url = fileUrl || (picked ? thumbUrl(picked.image.url, 500) : "");

  return (
    <div className="imgp-slot">
      <span className="field-label">
        Ảnh {n}: {title}
        {optional && <span className="hint"> (không bắt buộc)</span>}
      </span>
      <label
        className={`drop imgp-drop ${url ? "has-img" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f?.type.startsWith("image/")) onChange(f);
        }}
      >
        <input type="file" accept="image/*" onChange={(e) => (onChange(e.target.files?.[0] || null), (e.target.value = ""))} />
        {url ? <img src={url} alt={`Ảnh ${n}`} /> : <span>+ Chọn ảnh từ máy</span>}
      </label>
      {picked && (
        <span className="imgp-picked">
          Từ kho: <b>{picked.asset.name}</b>
        </span>
      )}
      <span className="hint">{hint}</span>
      <div className="imgp-src">
        {kind && (
          <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>
            Chọn từ kho
          </button>
        )}
        {picked && (
          <a className="btn btn-sm" href={attachmentUrl(picked.image.url)} download>
            Tải ảnh về
          </a>
        )}
        {value && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(null)}>
            Bỏ ảnh
          </button>
        )}
      </div>
      {kind && <AssetPicker kind={kind} open={picking} onClose={() => setPicking(false)} onPick={onChange} />}
    </div>
  );
}

// The last store picks are remembered on this browser and restored once the store has loaded.
function useRememberedPick(key) {
  const { data } = useAssets();
  const [value, setValue] = useState(null);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restored || !data) return;
    setRestored(true);
    const saved = store.get(key, null);
    const asset = saved && data.items.find((a) => a._id === saved.id);
    const image = asset?.images.find((i) => i.publicId === saved.publicId) || asset?.images[0];
    if (asset && image) setValue((v) => v ?? { asset, image });
  }, [data, key, restored]);
  const set = (v) => {
    setValue(v);
    store.set(key, v && !(v instanceof File) ? { id: v.asset._id, publicId: v.image.publicId } : null);
  };
  return [value, set];
}

export default function ImagePrompt() {
  const { flash, copy } = useCopy();
  const [model, setModel] = useRememberedPick("imgp:model");
  const [outfit, setOutfit] = useState(null);
  const [bgImage, setBgImage] = useRememberedPick("imgp:bg");
  const [poseId, setPoseId] = useState(POSES[0].id);
  const [customPose, setCustomPose] = useState("");
  const [background, setBackground] = useState("");
  const [ratio, setRatio] = useState("9:16");

  const preset = POSES.find((p) => p.id === poseId);
  const pose = poseId === "custom" ? customPose.trim() : preset.text;
  const modelDesc = model && !(model instanceof File) ? model.asset.description || "" : "";
  const bgDesc = bgImage && !(bgImage instanceof File) ? bgImage.asset.description || "" : "";
  const prompt = useMemo(
    () => buildPrompt({ pose: pose || "a natural, relaxed pose that shows the whole outfit", background, ratio, modelDesc, bgImage: Boolean(bgImage), bgDesc }),
    [pose, background, ratio, modelDesc, bgImage, bgDesc]
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Prompt ảnh AI thay đồ</h1>
          <p>Mặc sản phẩm thời trang (ảnh 2) cho người mẫu nữ (ảnh 1), chọn động tác và bối cảnh, rồi copy prompt sang ChatGPT, Gemini…</p>
        </div>
        <Link className="btn btn-ghost" to="/models">
          Kho người mẫu & phông nền
        </Link>
      </div>

      <div className="grid-2">
        <div className="card stack">
          <div className="imgp-slots imgp-slots-3">
            <ImageSlot n={1} title="Người mẫu nữ" hint="Mặt chính diện, rõ nét, đủ sáng để AI giữ đúng khuôn mặt" value={model} onChange={setModel} kind="model" />
            <ImageSlot n={2} title="Sản phẩm" hint="Rõ màu, hoạ tiết, chi tiết" value={outfit} onChange={setOutfit} />
            <ImageSlot n={3} title="Phông nền" hint="Bối cảnh muốn đặt người mẫu vào" value={bgImage} onChange={setBgImage} kind="background" optional />
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

          <Field
            label={bgImage ? "Ghi chú thêm về bối cảnh" : "Bối cảnh"}
            hint={bgImage ? "Đã có ảnh phông nền (ảnh 3). Có thể ghi thêm, ví dụ: buổi tối, đèn vàng." : "Bỏ trống thì dùng phông đơn giản hợp với trang phục, hoặc chọn ảnh 3 từ kho phông nền"}
          >
            <input className="input" list="imgp-bg" value={background} onChange={(e) => setBackground(e.target.value)} placeholder={bgImage ? "Ví dụ: buổi tối, đèn vàng ấm" : "Ví dụ: phòng ngủ ấm cúng, ánh nắng qua cửa sổ"} />
            {!bgImage && (
              <datalist id="imgp-bg">
                {BG_IDEAS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            )}
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
            <p className="hint">
              Khi dán vào công cụ AI, đính kèm ảnh theo đúng thứ tự: người mẫu (ảnh 1), sản phẩm (ảnh 2){bgImage ? ", phông nền (ảnh 3)" : ""}. Ảnh lấy từ kho thì bấm “Tải ảnh về” để có file đính kèm. Nếu ảnh ra bị đổi mặt, nhắn thêm cho AI: “Giữ đúng khuôn mặt của người trong ảnh 1, làm lại”.
            </p>
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
