import { useEffect } from "react";
import { useToast } from "../components/Toast.jsx";

// Opened from the iPhone/iPad home screen: no browser bar, so a download link shows the file
// full screen with no way back. There, files go through the share sheet (Save Video, Save to Files).
export const standalone = typeof navigator !== "undefined" && navigator.standalone === true;

// "attachment; filename="a.mp4"; filename*=UTF-8''a%20b.mp4" → "a b.mp4"
function nameFrom(res, fallback) {
  const cd = res.headers.get("content-disposition") || "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1];
  if (star) {
    try {
      return decodeURIComponent(star);
    } catch {
      /* fall through */
    }
  }
  return /filename="?([^";]+)"?/i.exec(cd)?.[1] || fallback || "file";
}

async function fetchFile({ url, name }) {
  let res;
  try {
    res = await fetch(url, { credentials: "include" });
  } catch {
    throw new Error("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Không tải được file (mã ${res.status}).`);
  }
  const blob = await res.blob();
  return new File([blob], name || nameFrom(res), { type: blob.type || "application/octet-stream" });
}

async function share(files, toast) {
  try {
    await navigator.share({ files });
  } catch (e) {
    if (e.name === "AbortError") return; // the sheet was closed
    // A slow download outlives the tap; Safari then wants a fresh one before opening the sheet.
    if (e.name === "NotAllowedError") {
      toast(files.length > 1 ? `${files.length} file đã sẵn sàng` : "File đã sẵn sàng", {
        tone: "info",
        detail: "Nhấn Lưu để mở bảng lưu file.",
        action: { label: "Lưu", onClick: () => share(files, toast) },
        duration: 20000,
      });
      return;
    }
    throw e;
  }
}

// items: [{ url, name? }]. Fetches them all, then opens one share sheet for the lot.
export async function saveFiles(items, toast) {
  toast(items.length > 1 ? `Đang chuẩn bị ${items.length} file` : "Đang chuẩn bị file", { tone: "info", detail: "Xong sẽ mở bảng để lưu vào máy." });
  try {
    const files = await Promise.all(items.map(fetchFile));
    if (!navigator.canShare?.({ files })) throw new Error("Máy này không lưu được file từ app. Mở trang trong Safari để tải.");
    await share(files, toast);
  } catch (e) {
    toast(e.message || "Không lưu được file.", { tone: "danger" });
  }
}

// Mounted once: in the home-screen app, every <a download> (rendered or clicked from code) goes through saveFiles.
export function useStandaloneDownloads() {
  const toast = useToast();
  useEffect(() => {
    if (!standalone) return;
    const onClick = (e) => {
      const a = e.target.closest?.("a[download]");
      if (!a || e.defaultPrevented) return;
      e.preventDefault();
      saveFiles([{ url: a.href, name: a.getAttribute("download") || undefined }], toast);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [toast]);
}
