import { v2 as cloudinary } from "cloudinary";
import { config } from "../config.js";
import { HttpError } from "./http.js";

let ready = false;
if (config.cloudinaryUrl) {
  try {
    const u = new URL(config.cloudinaryUrl);
    cloudinary.config({
      cloud_name: u.hostname,
      api_key: decodeURIComponent(u.username),
      api_secret: decodeURIComponent(u.password),
      secure: true,
    });
    ready = true;
  } catch {
    console.error("CLOUDINARY_URL không đúng dạng cloudinary://KEY:SECRET@CLOUD_NAME");
  }
}

export const cloudinaryReady = () => ready;

export function requireCloudinary(req, res, next) {
  if (!ready) return next(new HttpError(503, "Chưa cấu hình Cloudinary nên chưa tải ảnh được. Thêm biến CLOUDINARY_URL trên máy chủ."));
  next();
}

export function uploadBuffer(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: "image" }, (err, result) =>
      err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
  });
}

// Failures are logged, never thrown: a Cloudinary hiccup must not block deleting data.
export async function destroyImages(publicIds) {
  if (!ready || !publicIds.length) return;
  const results = await Promise.allSettled(publicIds.map((id) => cloudinary.uploader.destroy(id)));
  results.forEach((r, i) => r.status === "rejected" && console.error("Cloudinary: xoá ảnh lỗi", publicIds[i], r.reason?.message));
}
