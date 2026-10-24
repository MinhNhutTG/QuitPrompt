import { useCallback, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { compressImage } from "../lib/compress.js";
import { uid } from "../lib/util.js";
import { useToast } from "./Toast.jsx";

export const MAX_IMAGES = 12;

// Images per product the signed-in account may reach: its tier may allow fewer than the app-wide maximum.
export function useImageCap() {
  const { user } = useAuth();
  return Math.min(MAX_IMAGES, user?.tier?.limits?.imagesPerProduct ?? MAX_IMAGES);
}

const isImage = (f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(f.name);

// Compress then upload one file at a time: every response carries the full product,
// so sequential uploads can never apply an older image list over a newer one.
export function useUploads(onItem, { notify = true } = {}) {
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const onItemRef = useRef(onItem);
  onItemRef.current = onItem;

  const patch = (id, p) => setJobs((all) => all.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const run = useCallback(async (productId, files) => {
    const list = files.map((file) => ({ id: uid(), name: file.name, file, progress: 0, status: "wait", error: "" }));
    setJobs((all) => [...all.filter((j) => j.status !== "error"), ...list]);
    let failed = 0;
    for (const job of list) {
      try {
        patch(job.id, { status: "compress" });
        const small = await compressImage(job.file);
        patch(job.id, { status: "upload" });
        const { item } = await api.uploadImage(productId, small, (progress) => patch(job.id, { progress }));
        onItemRef.current?.(item);
        setJobs((all) => all.filter((j) => j.id !== job.id));
      } catch (e) {
        failed++;
        patch(job.id, { status: "error", error: e.message });
        if (e.status === 503 || e.status === 401) {
          // Same answer for every remaining file: stop here.
          list.slice(list.indexOf(job) + 1).forEach((j) => patch(j.id, { status: "error", error: e.message }));
          failed += list.length - list.indexOf(job) - 1;
          break;
        }
      }
    }
    const ok = list.length - failed;
    if (notify && ok) toast(`Đã tải lên ${ok} ảnh`, failed ? { detail: `${failed} ảnh lỗi, xem danh sách bên dưới.` } : undefined);
    if (notify && !ok && failed) toast(`Chưa tải được ${failed} ảnh`, { tone: "danger", detail: "Xem lỗi trong danh sách bên dưới." });
    return failed;
  }, [notify, toast]);

  const dismiss = useCallback(() => setJobs((all) => all.filter((j) => j.status !== "error")), []);
  return { jobs, run, dismiss, busy: jobs.some((j) => j.status !== "error") };
}

const STATUS = { wait: "Chờ", compress: "Đang nén", upload: "Đang tải" };

export function JobList({ jobs, onDismiss }) {
  if (!jobs.length) return null;
  const errors = jobs.some((j) => j.status === "error");
  return (
    <>
      <ul className="jobs" aria-live="polite">
        {jobs.map((j) => (
          <li key={j.id}>
            <span className="name">{j.name}</span>
            <span className={j.status === "error" ? "error" : "hint"}>
              {j.status === "error" ? "Lỗi" : j.status === "upload" ? `${Math.round(j.progress * 100)}%` : STATUS[j.status]}
            </span>
            {j.status === "error" ? (
              <span className="error" style={{ gridColumn: "1 / -1" }}>
                {j.error}
              </span>
            ) : (
              <span className="bar">
                <i style={{ width: `${j.status === "upload" ? Math.max(4, j.progress * 100) : 2}%` }} />
              </span>
            )}
          </li>
        ))}
      </ul>
      {errors && onDismiss && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={onDismiss}>
          Ẩn lỗi
        </button>
      )}
    </>
  );
}

// Drop zone + file picker. On phones accept="image/*" also offers the camera.
export function DropZone({ onFiles, room, disabled, label = "+ Ảnh" }) {
  const toast = useToast();
  const cap = useImageCap();
  room ??= cap;
  const [over, setOver] = useState(false);

  function take(fileList) {
    const files = [...(fileList || [])].filter(isImage);
    if (!files.length) return toast("Chỉ nhận file ảnh (JPG, PNG, WEBP, HEIC...).", { tone: "danger" });
    if (room <= 0) return toast(`Mỗi sản phẩm tối đa ${cap} ảnh${cap < MAX_IMAGES ? " với hạng tài khoản của bạn" : ""}.`, { tone: "danger" });
    if (files.length > room) toast(`Chỉ thêm được ${room} ảnh nữa, đã bỏ bớt ${files.length - room} ảnh.`, { tone: "danger" });
    onFiles(files.slice(0, room));
  }

  return (
    <label
      className={`drop ${over ? "is-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
    >
      <input
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        disabled={disabled}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      <span>{label}</span>
      <span className="hint">Kéo thả hoặc bấm để chọn · còn {Math.max(0, room)} ảnh</span>
    </label>
  );
}
