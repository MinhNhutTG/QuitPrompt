import { useEffect, useState } from "react";

// ---- Cloudinary URL transforms: images are resized on the CDN, never by our server.
export function cld(url, transform) {
  const i = url ? url.indexOf("/upload/") : -1;
  if (i < 0) return url || "";
  return url.slice(0, i + 8) + transform + "/" + url.slice(i + 8);
}
export const thumbUrl = (url, w) => cld(url, `f_auto,q_auto,w_${w},c_limit`);
export const blurUrl = (url) => cld(url, "f_auto,q_auto:low,w_24,e_blur:200");

// ---- Vietnamese-friendly search: "non" matches "Nón".
export const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();

const dateOnly = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const pad = (n) => String(n).padStart(2, "0");
// "20/10 12:07": built by hand because vi-VN Intl puts the time first and uses "-".
export const fmtDateTime = (d) => {
  if (!d) return "";
  const t = new Date(d);
  return `${pad(t.getDate())}/${pad(t.getMonth() + 1)} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
};
// "20/10/2026 12:07"
export const fmtDateTimeFull = (d) => {
  if (!d) return "";
  const t = new Date(d);
  return `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
};
export const fmtDate = (d) => (d ? dateOnly.format(new Date(d)) : "");

// ---- localStorage that never throws (private mode, blocked storage)
export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("ps:" + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("ps:" + key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  },
};

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function useDebounce(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useClickOutside(ref, onOutside, active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (e) => ref.current && !ref.current.contains(e.target) && onOutside();
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [ref, onOutside, active]);
}

export const uid = () => Math.random().toString(36).slice(2, 10);
