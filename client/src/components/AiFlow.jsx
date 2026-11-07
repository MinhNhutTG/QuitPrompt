import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api.js";
import { copyText, fmtDateTimeFull } from "../lib/util.js";
import { FRAMINGS, NEGATIVE, PLACES, TYPES, buildDolaPrompt, dolaTypeOf } from "../lib/dola.js";
import { IMAGE_SLOTS, SLOTS } from "../lib/plans.js";
import { Field, Seg } from "./ui.jsx";
import { useToast } from "./Toast.jsx";
import FileSlot from "./FileSlot.jsx";

// "Ảnh & video AI" on a plan (doc 09 §4b), half by hand: the site prepares everything and keeps where the plan is,
// the member pastes into ChatGPT and Dola themselves.
//   1. Ảnh tham chiếu: the photo to start from (uploaded, pasted, or the product's cover).
//   2. Ảnh AI: what to change → copy the photo and the prompt into ChatGPT → paste the result back → approve it.
//   3. Video: once approved, copy that image and the Dola prompt for Part 1 and Part 2 → upload the two clips.

const CHATGPT = "https://chatgpt.com/";
const DOLA = "https://www.dola.com/";

const REF = IMAGE_SLOTS.find((s) => s.key === "ref");
const AI = IMAGE_SLOTS.find((s) => s.key === "aiImage");
const CLIPS = SLOTS.filter((s) => s.key === "clip1" || s.key === "clip2");

// One tap fills the request; it can be edited after.
const IDEAS = [
  "Đổi nền thành quán cà phê sáng sủa, ánh nắng tự nhiên",
  "Đổi nền thành phòng ngủ ấm cúng, nắng chiều qua cửa sổ",
  "Đổi nền thành phố đi bộ buổi sáng",
  "Đổi nền thành studio phông trơn màu be",
  "Đổi sang dáng đứng thả lỏng, thấy toàn thân",
];

function editPrompt(request) {
  const ask = request.trim() || "Đổi nền thành một bối cảnh sáng sủa, đơn giản, hợp với sản phẩm";
  return [
    "Edit the attached image (photorealistic).",
    "",
    `Change ONLY this: ${ask}`,
    "",
    "Keep everything else exactly as in the attached image:",
    "- The person: the exact same face (face shape, eyes, eyebrows, nose, lips, skin tone, marks, makeup, age), hairstyle and body shape. Do not beautify, retouch or replace her.",
    "- The product she wears: the exact same colors, pattern, print, fabric texture, cut, length, details and any logo or text. Do not redesign it or add anything.",
    "",
    "Natural lighting that matches the new scene, realistic shadows, sharp focus on the product, true-to-life colors. Vertical 9:16.",
    "No text, no watermark, no extra people, no distorted hands or fingers.",
  ].join("\n");
}

// The clipboard takes PNG images only, so anything else is redrawn as PNG first.
async function pngOf(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("load");
  const blob = await res.blob();
  if (blob.type === "image/png") return blob;
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext("2d").drawImage(bmp, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
}

// Must start inside the click (browsers refuse later), so the image is handed over as a promise.
function copyImage(url) {
  if (!window.ClipboardItem || !navigator.clipboard?.write) return Promise.reject(new Error("unsupported"));
  return navigator.clipboard.write([new ClipboardItem({ "image/png": pngOf(url) })]);
}

const imageIn = (list) => [...(list || [])].find((f) => f.type?.startsWith("image/"));

function Step({ n, title, done, locked, children }) {
  return (
    <div className={`aiflow-step ${done ? "is-done" : ""} ${locked ? "is-locked" : ""}`}>
      <div className="aiflow-step-h">
        <span className="aiflow-n" aria-hidden="true">
          {done ? "✓" : n}
        </span>
        <b>{title}</b>
      </div>
      {children}
    </div>
  );
}

function Preview({ file, alt }) {
  if (!file) return null;
  return (
    <a className="aiflow-img" href={api.driveDownloadUrl(file.id)} target="_blank" rel="noopener noreferrer" title="Mở ảnh cỡ thật">
      <img src={api.driveDownloadUrl(file.id)} alt={alt} loading="lazy" />
    </a>
  );
}

export default function AiFlow({ plan, driveReady, onChanged, guard }) {
  const toast = useToast();
  const refUpload = useRef(null);
  const aiUpload = useRef(null);
  const ref = plan.files?.ref;
  const ai = plan.files?.aiImage;
  const approved = Boolean(ai && plan.imageApproved);
  const cover = plan.product.images?.[0];

  const [request, setRequest] = useState(plan.imageRequest || "");
  useEffect(() => setRequest(plan.imageRequest || ""), [plan.imageRequest]);

  const [type, setType] = useState(() => dolaTypeOf(plan.product.category));
  const [framing, setFraming] = useState("waist-up");
  const [place, setPlace] = useState("outdoor");
  const [details, setDetails] = useState("");

  async function copy(text, what) {
    const ok = await copyText(text);
    toast(ok ? `Đã copy ${what}` : "Trình duyệt chặn copy. Bôi đen rồi nhấn Ctrl/Cmd+C.", { tone: ok ? "ok" : "danger" });
    return ok;
  }

  // Copies the image, then opens the AI site in a new tab: paste the image there first (Ctrl+V), then the prompt.
  function imageTo(file, site, name) {
    const copying = copyImage(api.driveDownloadUrl(file.id));
    window.open(site, "_blank", "noopener");
    copying.then(
      () => toast(`Đã copy ảnh, dán vào ${name} (Ctrl+V)`, { detail: "Sau đó quay lại đây bấm Copy prompt rồi dán tiếp." }),
      () => toast(`Đã mở ${name}`, { tone: "info", detail: "Trình duyệt này không copy được ảnh: bấm Tải về rồi kéo ảnh vào." })
    );
  }

  const saveRequest = useMutation({
    mutationFn: () => api.updatePlan(plan._id, { imageRequest: request.trim() }),
    onSuccess: ({ item }) => onChanged(item),
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  const approve = useMutation({
    mutationFn: (yes) => (yes ? api.planApproveImage(plan._id) : api.planUnapproveImage(plan._id)),
    onSuccess: ({ item }, yes) => {
      onChanged(item);
      toast(yes ? "Đã duyệt ảnh AI, chuyển sang tạo video" : "Đã bỏ duyệt ảnh AI");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  // The product's cover photo becomes the reference: fetched here, then uploaded like any other file.
  const useCover = useMutation({
    mutationFn: async () => {
      const res = await fetch(cover.url);
      if (!res.ok) throw new Error("Không tải được ảnh bìa sản phẩm.");
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      refUpload.current?.(new File([blob], `anh-bia.${ext}`, { type: blob.type || "image/jpeg" }));
    },
    onError: (e) => toast(e.message || "Không tải được ảnh bìa sản phẩm.", { tone: "danger" }),
  });

  // An image pasted anywhere on the page (outside a text box) goes to the reference first, then to the AI image.
  useEffect(() => {
    if (!driveReady) return;
    function onPaste(e) {
      if (e.target.closest?.("input, textarea, [contenteditable]")) return;
      const f = imageIn(e.clipboardData?.files);
      if (!f) return;
      e.preventDefault();
      (ref ? aiUpload : refUpload).current?.(f);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [driveReady, ref]);

  const dropTo = (target) => ({
    onDragOver: (e) => e.preventDefault(),
    onDrop: (e) => {
      const f = imageIn(e.dataTransfer?.files);
      if (!f) return;
      e.preventDefault();
      target.current?.(f);
    },
  });

  const prompt = editPrompt(request);
  const dola = (part) => buildDolaPrompt({ type, part, framing, place, setting: "", details });
  const slotProps = { plan, driveReady, onChanged, guard };

  return (
    <section className="card aiflow">
      <div className="sec-h">Ảnh & video AI</div>
      <p className="hint">
        Ảnh tham chiếu → nhờ ChatGPT sửa ảnh → duyệt → tạo 2 clip trên Dola. Dán ảnh (Ctrl+V) ở bất kỳ đâu trên trang này: chưa có ảnh tham chiếu thì vào ảnh tham chiếu, có rồi thì vào ảnh AI.
      </p>

      <Step n={1} title="Ảnh tham chiếu" done={Boolean(ref)}>
        <div className="aiflow-row" {...dropTo(refUpload)}>
          <Preview file={ref} alt="Ảnh tham chiếu" />
          <ul className="slots">
            <FileSlot
              {...slotProps}
              slot={REF}
              uploadRef={refUpload}
              extra={
                !ref &&
                cover && (
                  <button type="button" className="btn btn-sm btn-ghost" disabled={!driveReady || useCover.isPending} onClick={() => guard(() => useCover.mutate())}>
                    {useCover.isPending ? "Đang lấy..." : "Dùng ảnh bìa sản phẩm"}
                  </button>
                )
              }
            />
          </ul>
        </div>
      </Step>

      <Step n={2} title="Ảnh AI (ChatGPT)" done={approved} locked={!ref}>
        {!ref ? (
          <p className="hint">Cần ảnh tham chiếu trước.</p>
        ) : (
          <>
            <Field label="Yêu cầu sửa ảnh" hint="Viết tiếng Việt được. Khuôn mặt và sản phẩm luôn được giữ nguyên.">
              <textarea
                className="input"
                rows={2}
                maxLength={1000}
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                onBlur={() => request.trim() !== (plan.imageRequest || "") && saveRequest.mutate()}
                placeholder="Ví dụ: đổi nền thành quán cà phê sáng sủa"
              />
            </Field>
            <div className="aiflow-ideas">
              {IDEAS.map((t) => (
                <button key={t} type="button" className="aiflow-chip" onClick={() => setRequest(t)}>
                  {t}
                </button>
              ))}
            </div>
            <ol className="aiflow-how">
              <li>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => imageTo(ref, CHATGPT, "ChatGPT")}>
                  Copy ảnh và mở ChatGPT
                </button>{" "}
                rồi dán ảnh vào ô chat.
              </li>
              <li>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    copy(prompt, "prompt sửa ảnh");
                    if (request.trim() !== (plan.imageRequest || "")) saveRequest.mutate();
                  }}
                >
                  Copy prompt
                </button>{" "}
                rồi dán tiếp và gửi.
              </li>
              <li>Ảnh ra: chuột phải → Sao chép hình ảnh, quay lại đây nhấn Ctrl+V (hoặc tải về rồi kéo vào ô Ảnh AI).</li>
            </ol>
            <details className="aiflow-prompt">
              <summary>Xem prompt</summary>
              <pre className="out">{prompt}</pre>
            </details>

            <div className="aiflow-row" {...dropTo(aiUpload)}>
              <Preview file={ai} alt="Ảnh AI" />
              <ul className="slots">
                <FileSlot {...slotProps} slot={AI} uploadRef={aiUpload} />
              </ul>
            </div>
            {ai &&
              (approved ? (
                <p className="aiflow-ok">
                  Đã duyệt bởi {plan.imageApproved.by.displayName} lúc <span title={fmtDateTimeFull(plan.imageApproved.at)}>{fmtDateTimeFull(plan.imageApproved.at)}</span>{" "}
                  <button type="button" className="btn btn-sm btn-ghost" disabled={approve.isPending} onClick={() => guard(() => approve.mutate(false))}>
                    Bỏ duyệt
                  </button>
                </p>
              ) : (
                <div className="btns">
                  <button type="button" className="btn btn-primary" disabled={approve.isPending} onClick={() => guard(() => approve.mutate(true))}>
                    Duyệt ảnh này
                  </button>
                  <span className="hint">Chưa ưng: sửa yêu cầu rồi làm lại bước trên, ảnh mới sẽ thay ảnh này. Ảnh bị đổi mặt thì nhắn ChatGPT: “Giữ đúng khuôn mặt người trong ảnh, làm lại”.</span>
                </div>
              ))}
          </>
        )}
      </Step>

      <Step n={3} title="Video (Dola AI)" done={CLIPS.every((c) => plan.files?.[c.key])} locked={!approved}>
        {!approved ? (
          <p className="hint">Mở khi ảnh AI đã được duyệt.</p>
        ) : (
          <>
            <div className="aiflow-opts">
              <div className="field">
                <span className="field-label">Loại sản phẩm</span>
                <Seg name="aiflow-type" label="Loại sản phẩm" value={type} options={TYPES} onChange={setType} />
              </div>
              <div className="field">
                <span className="field-label">Cỡ cảnh</span>
                <Seg name="aiflow-framing" label="Cỡ cảnh" value={framing} options={FRAMINGS} onChange={setFraming} />
              </div>
              <div className="field">
                <span className="field-label">Không gian</span>
                <Seg name="aiflow-place" label="Không gian" value={place} options={PLACES} onChange={setPlace} />
              </div>
              <Field label="Chi tiết sản phẩm cần giữ" hint="Nên viết tiếng Anh. Bỏ trống thì giữ theo ảnh">
                <input className="input" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Ví dụ: cream linen shirt with small brown buttons" />
              </Field>
            </div>
            <div className="btns">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => imageTo(ai, DOLA, "Dola")}>
                Copy ảnh AI và mở Dola
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => copy(NEGATIVE[type], "negative")}>
                Copy negative
              </button>
            </div>
            <ul className="slots">
              {CLIPS.map((c, i) => (
                <FileSlot
                  key={c.key}
                  {...slotProps}
                  slot={c}
                  extra={
                    <button type="button" className="btn btn-sm" onClick={() => copy(dola(i + 1), `prompt Part ${i + 1}`)}>
                      Copy prompt Part {i + 1}
                    </button>
                  }
                />
              ))}
            </ul>
            <p className="hint">Part 2 nối tiếp khung cuối của Part 1. Tạo 3–4 lần mỗi clip rồi chọn bản đẹp nhất, che watermark Dola trước khi đăng.</p>
          </>
        )}
      </Step>
    </section>
  );
}
