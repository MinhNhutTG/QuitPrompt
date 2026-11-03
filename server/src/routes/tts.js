import { Router } from "express";
import { z } from "zod";
import { TtsKey } from "../models/TtsKey.js";
import { ah, parse, assertId, text, HttpError } from "../lib/http.js";
import { can, requireAdmin } from "../middleware/auth.js";
import { ENV_ID, inspectKey, keyBox, listKeys, overview, publicKeyOf, ttsConfigured } from "../lib/elevenlabs.js";

// What the "Tạo lời đọc" dialog needs: whether any key is set up, the voices of every usable key, the Vietnamese
// models and the credit left. Reading it is free; making the mp3 is POST /api/plans/:id/tts.
export const ttsRoutes = Router();

ttsRoutes.get(
  "/",
  ah(async (req, res) => {
    if (!(await ttsConfigured())) return res.json({ configured: false, voices: [], models: [], credits: null });
    res.json({ configured: true, ...(await overview()) });
  })
);

// Quản trị → ElevenLabs: the team's API keys. Anyone who sees Quản trị sees them (never the key itself, only its
// last 4 characters); adding, changing and removing is for admins.
export const ttsKeyRoutes = Router();
const MAX_KEYS = 30;

ttsKeyRoutes.get(
  "/",
  can("admin.view"),
  ah(async (req, res) => {
    res.json({ items: await listKeys(req.query.check === "1") });
  })
);

ttsKeyRoutes.post(
  "/",
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(
      z.object({
        name: text("tên key", 60, 1),
        key: z.string({ required_error: "Chưa nhập API key." }).trim().min(20, "API key quá ngắn, kiểm tra lại.").max(200, "API key quá dài.").regex(/^[\w-]+$/, "API key chỉ có chữ, số, gạch dưới và gạch ngang."),
      }),
      req.body
    );
    if ((await TtsKey.countDocuments()) >= MAX_KEYS) throw new HttpError(400, `Tối đa ${MAX_KEYS} key.`);
    const last4 = data.key.slice(-4);
    for (const k of await TtsKey.find({ last4 }, { secret: 1 }).lean()) {
      try {
        if (keyBox.open(k.secret) === data.key) throw new HttpError(409, "Key này đã có trong danh sách.");
      } catch (err) {
        if (err instanceof HttpError) throw err;
      }
    }
    // Checked before it is kept: a wrong key never enters the pool.
    const state = await inspectKey(data.key);
    if (state.status === "invalid") throw new HttpError(400, "ElevenLabs từ chối key này. Kiểm tra lại key và quyền: Text to Speech, Voices (đọc), Models (đọc), User (đọc).");
    if (state.status === "error") throw new HttpError(502, `Chưa kiểm tra được key: ${state.statusText}`);
    const doc = await TtsKey.create({ name: data.name, secret: keyBox.seal(data.key), last4, ...state, checkedAt: new Date(), createdBy: req.userId });
    res.status(201).json({ item: publicKeyOf(doc) });
  })
);

const findKey = async (id) => {
  if (id === ENV_ID) throw new HttpError(400, "Key trong biến môi trường chỉ đổi được trên máy chủ (ELEVENLABS_API_KEY).");
  assertId(id, "key");
  const doc = await TtsKey.findById(id);
  if (!doc) throw new HttpError(404, "Không tìm thấy key.");
  return doc;
};

ttsKeyRoutes.patch(
  "/:id",
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(z.object({ name: text("tên key", 60, 1).optional(), active: z.boolean({ invalid_type_error: "Ô bật/tắt không hợp lệ." }).optional() }), req.body);
    const doc = await findKey(req.params.id);
    doc.set(data);
    await doc.save();
    res.json({ item: publicKeyOf(doc) });
  })
);

// Reads its credit and voices from ElevenLabs again (also brings a key marked "hết credit" back once refilled).
ttsKeyRoutes.post(
  "/:id/check",
  requireAdmin,
  ah(async (req, res) => {
    const doc = await findKey(req.params.id);
    let apiKey;
    try {
      apiKey = keyBox.open(doc.secret);
    } catch {
      throw new HttpError(400, "Không đọc được key đã lưu (JWT_SECRET đã đổi). Xoá và thêm lại.");
    }
    doc.set({ ...(await inspectKey(apiKey)), checkedAt: new Date() });
    await doc.save();
    res.json({ item: publicKeyOf(doc) });
  })
);

ttsKeyRoutes.delete(
  "/:id",
  requireAdmin,
  ah(async (req, res) => {
    const doc = await findKey(req.params.id);
    await doc.deleteOne();
    res.locals.audit = { label: doc.name };
    res.json({ ok: true });
  })
);
