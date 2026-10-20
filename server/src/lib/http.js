import mongoose from "mongoose";
import { z } from "zod";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Express 4 does not catch rejected promises from async handlers.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message || "Dữ liệu không hợp lệ.");
  return r.data;
}

export const isId = (s) => typeof s === "string" && /^[a-f0-9]{24}$/i.test(s) && mongoose.isValidObjectId(s);

export function assertId(s, what = "mục này") {
  if (!isId(s)) throw new HttpError(404, `Không tìm thấy ${what}.`);
  return s;
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Trimmed string field with Vietnamese messages.
export const text = (label, max, min = 0) =>
  z
    .string({ required_error: `Thiếu ${label}.`, invalid_type_error: `${cap(label)} phải là chữ.` })
    .trim()
    .min(min, min <= 1 ? `Cần nhập ${label}.` : `${cap(label)} cần ít nhất ${min} ký tự.`)
    .max(max, `${cap(label)} tối đa ${max} ký tự.`);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
