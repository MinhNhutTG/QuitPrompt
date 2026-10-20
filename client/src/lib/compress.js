// Shrinks phone photos (5–10 MB) to roughly 300–600 KB before upload.
const MAX_SIDE = 2000;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

export async function compressImage(file) {
  if (file.type === "image/gif") return file; // keep animation
  let src;
  try {
    src = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      src = await loadImage(file);
    } catch {
      return file; // e.g. HEIC on Chrome: let Cloudinary convert it
    }
  }
  const w0 = src.naturalWidth || src.width;
  const h0 = src.naturalHeight || src.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  if (scale === 1 && file.size < 700_000 && /jpe?g|webp/.test(file.type)) {
    src.close?.();
    return file;
  }
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // transparent PNG → white, not black, in JPEG
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  src.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob || (blob.size >= file.size && file.size <= 10 * 1024 * 1024)) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}
