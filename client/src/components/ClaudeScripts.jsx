import { useState } from "react";
import { copyText, thumbUrl } from "../lib/util.js";
import { Field, Modal, Seg } from "./ui.jsx";
import { useToast } from "./Toast.jsx";
import { useScriptImport } from "./Scripts.jsx";

// "Tạo bằng Claude" on a product (doc 09 §8): Claude writes the voice-overs and captions from the product's photos and
// hands back an Excel file in the import template's shape, which "Nhập Excel" then saves. Half by hand, like the AI
// image flow: the site joins the photos into one image on the clipboard and opens Claude with the prompt; the member
// pastes the image, sends, downloads the file and imports it.

const CLAUDE = "https://claude.ai/new";
const COUNTS = [5, 10, 20].map((n) => ({ value: n, label: `${n} cặp` }));
const MAX_PHOTOS = 12;

export function claudePrompt({ product, count, info }) {
  const name = product.name;
  return [
    `Sản phẩm: ${name}${product.category ? ` (loại: ${product.category})` : ""}${product.sku ? `, mã ${product.sku}` : ""}.`,
    "Ảnh đính kèm là ảnh thật của sản phẩm (nhiều ảnh ghép thành một).",
    info.trim() ? `Thông tin thêm: ${info.trim()}` : "",
    "",
    `Dùng skill "loi-doc-ban-hang-san-pham" để viết ${count} lời đọc bán hàng khác nhau cho video TikTok Shop, và skill "mo-ta-video-tiktok-shop" để viết mô tả video khớp với từng lời đọc. Nếu không có skill đó thì vẫn viết theo cách bình thường.`,
    "Chỉ dựa vào những gì thấy trong ảnh và thông tin ở trên: không bịa chất liệu, thông số, giá hay khuyến mãi.",
    "",
    "Trả kết quả thành MỘT file Excel (.xlsx) để tôi tải về:",
    '- 1 sheet, dòng 1 là tiêu đề, đúng 2 cột: "Lời đọc" và "Mô tả video".',
    "- Mỗi dòng sau là một cặp: lời đọc và mô tả video đi với nó.",
    `- Đúng ${count} dòng nội dung. Không thêm cột, không đánh số, không thêm dòng ghi chú.`,
    "- Mỗi ô tối đa 5000 ký tự.",
    `Tên file: Lời đọc - ${name}.xlsx`,
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
}

// All photos side by side in one PNG (the clipboard holds one image), each fitted in a 3:4 cell on white.
async function collage(images) {
  const list = images.slice(0, MAX_PHOTOS);
  const bitmaps = await Promise.all(
    list.map(async (img) => {
      const res = await fetch(thumbUrl(img.url, 640));
      if (!res.ok) throw new Error("load");
      return createImageBitmap(await res.blob());
    })
  );
  const cols = bitmaps.length <= 1 ? 1 : bitmaps.length <= 4 ? 2 : 3;
  const rows = Math.ceil(bitmaps.length / cols);
  const W = 600;
  const H = 800;
  const GAP = 12;
  const canvas = document.createElement("canvas");
  canvas.width = cols * W + (cols + 1) * GAP;
  canvas.height = rows * H + (rows + 1) * GAP;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  bitmaps.forEach((b, i) => {
    const k = Math.min(W / b.width, H / b.height);
    const w = b.width * k;
    const h = b.height * k;
    const x = GAP + (i % cols) * (W + GAP) + (W - w) / 2;
    const y = GAP + Math.floor(i / cols) * (H + GAP) + (H - h) / 2;
    g.drawImage(b, x, y, w, h);
  });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png"))), "image/png"));
}

export default function ClaudeScripts({ product, canImport }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(10);
  const [info, setInfo] = useState(product.note || "");
  const imp = useScriptImport(product._id, () => setOpen(false));
  const images = product.images || [];
  const prompt = claudePrompt({ product, count, info });

  async function copyPrompt() {
    const ok = await copyText(prompt);
    toast(ok ? "Đã copy prompt" : "Trình duyệt chặn copy. Bôi đen prompt rồi nhấn Ctrl/Cmd+C.", { tone: ok ? "ok" : "danger" });
  }

  // The clipboard write must start inside the click, so the collage goes in as a promise; Claude opens at once.
  function start() {
    const url = `${CLAUDE}?q=${encodeURIComponent(prompt)}`;
    if (!images.length) {
      window.open(url, "_blank", "noopener");
      return toast("Đã mở Claude", { tone: "info", detail: "Sản phẩm chưa có ảnh nên Claude chỉ viết theo tên và thông tin thêm." });
    }
    const png = collage(images);
    const copying =
      window.ClipboardItem && navigator.clipboard?.write ? navigator.clipboard.write([new ClipboardItem({ "image/png": png })]) : Promise.reject(new Error("unsupported"));
    window.open(url, "_blank", "noopener");
    copying.then(
      () => toast(`Đã copy ${Math.min(images.length, MAX_PHOTOS)} ảnh (ghép thành 1), dán vào Claude bằng Ctrl+V`, { detail: "Prompt đã điền sẵn. Không thấy prompt thì quay lại bấm Copy prompt." }),
      async () => {
        // No image clipboard here: the collage is downloaded instead, to drag into Claude.
        try {
          const blob = await png;
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `Ảnh - ${product.name}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 10000);
          toast("Đã tải ảnh ghép về máy", { tone: "info", detail: "Trình duyệt này không copy được ảnh: kéo file ảnh vừa tải vào Claude." });
        } catch {
          toast("Không lấy được ảnh sản phẩm", { tone: "danger", detail: "Vẫn đã mở Claude: tải ảnh từ trang sản phẩm rồi kéo vào." });
        }
      }
    );
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        ✦ Tạo bằng Claude
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Tạo lời đọc bằng Claude" wide>
        <div className="form">
          <p className="hint">
            Claude xem {images.length ? `${Math.min(images.length, MAX_PHOTOS)} ảnh` : "thông tin"} của sản phẩm, viết lời đọc và mô tả video, trả về file Excel đúng mẫu để nhập vào đây.
          </p>
          <div className="field">
            <span className="field-label">Số cặp lời đọc + mô tả</span>
            <Seg name="claude-count" label="Số cặp" value={count} options={COUNTS} onChange={setCount} />
          </div>
          <Field label="Thông tin thêm cho Claude" hint="Không bắt buộc: giá, khuyến mãi, size, điểm muốn nhấn. Lấy sẵn ghi chú của sản phẩm.">
            <textarea className="input" rows={3} maxLength={2000} value={info} onChange={(e) => setInfo(e.target.value)} placeholder="Ví dụ: vải linen, có size S–XL, đang giảm 20%" />
          </Field>

          <ol className="aiflow-how">
            <li>
              <button type="button" className="btn btn-sm btn-primary" onClick={start}>
                {images.length ? "Copy ảnh và mở Claude" : "Mở Claude"}
              </button>{" "}
              {images.length ? "rồi nhấn Ctrl+V trong ô chat để dán ảnh, kiểm tra prompt đã có sẵn, bấm gửi." : "rồi bấm gửi."}{" "}
              <button type="button" className="link-btn" onClick={copyPrompt}>
                Copy prompt
              </button>{" "}
              nếu ô chat trống.
            </li>
            <li>Claude làm xong file Excel: bấm tải file về máy.</li>
            <li>
              {canImport ? (
                <>
                  {imp.input}
                  <button type="button" className="btn btn-sm" onClick={imp.pick} disabled={imp.busy}>
                    {imp.busy ? "Đang nhập..." : "Nhập file Excel của Claude"}
                  </button>{" "}
                  để lưu các cặp vào sản phẩm (dòng trùng tự bỏ qua).
                </>
              ) : (
                "Nhờ người có quyền sửa sản phẩm bấm Nhập Excel để lưu các cặp."
              )}
            </li>
          </ol>

          <details className="aiflow-prompt">
            <summary>Xem prompt</summary>
            <pre className="out">{prompt}</pre>
          </details>
        </div>
      </Modal>
    </>
  );
}
