import { config } from "../config.js";
import { HttpError } from "./http.js";
import { sealer } from "./secret.js";
import { TtsKey } from "../models/TtsKey.js";

// ElevenLabs text to speech (tài liệu 09, mục 8b) with a pool of API keys: the ones admins add in Quản trị →
// ElevenLabs, plus ELEVENLABS_API_KEY when set. Each read goes to the key with the most credit left among those that
// have the chosen voice; a key that turns out to be out of credit or refused is marked and the next one is tried.
// Keys never leave the server.

const API = "https://api.elevenlabs.io";
const FRESH_MS = 10 * 60 * 1000;
export const ENV_ID = "env";
export const keyBox = sealer("elevenlabs");

// ---- one call with one key

class KeyProblem extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // quota | auth
  }
}

// ElevenLabs' permission names, as its key settings page shows them.
const PERMS = {
  voices_read: "Voices: Read",
  user_read: "User: Read",
  models_read: "Models: Read",
  text_to_speech: "Text to Speech: Access",
};

function elError(status, data) {
  const d = data?.detail;
  const code = d?.status || d?.code || "";
  const msg = typeof d === "string" ? d : d?.message || "";
  if (code === "quota_exceeded" || status === 402) return new KeyProblem("quota", "Hết credit");
  if (code === "missing_permissions") {
    // "The API key you used is missing the permission voices_read to execute this operation."
    const perm = /permission (\w+)/.exec(msg)?.[1] || "";
    return new KeyProblem("auth", `Key thiếu quyền ${PERMS[perm] || perm || "cần thiết"}. Sửa quyền của key trên ElevenLabs (Developers → API Keys)`);
  }
  if (status === 401 || status === 403) return new KeyProblem("auth", "ElevenLabs từ chối key (sai hoặc đã xoá)");
  if (status === 429) return new HttpError(429, "ElevenLabs đang bận hoặc đang tạo quá nhiều cùng lúc. Chờ một chút rồi thử lại.");
  if (status === 404) return new HttpError(400, "Không tìm thấy giọng hoặc model này trên ElevenLabs. Chọn giọng khác.");
  if (status === 400 || status === 422) return new HttpError(400, `ElevenLabs không nhận yêu cầu${msg ? `: ${msg}` : "."}`);
  console.error("ElevenLabs lỗi", status, msg || data);
  return new HttpError(502, "ElevenLabs gặp lỗi. Thử lại sau ít phút.");
}

async function el(apiKey, path, { method = "GET", body, timeout = 20000, raw = false } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { "xi-api-key": apiKey, ...(body && { "Content-Type": "application/json" }) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (err) {
    throw new HttpError(504, err.name === "TimeoutError" ? "ElevenLabs trả lời quá lâu. Thử lại, hoặc chia lời đọc ngắn hơn." : "Không kết nối được ElevenLabs. Thử lại sau.");
  }
  if (!res.ok) throw elError(res.status, await res.json().catch(() => null));
  return raw ? res : res.json();
}

const voiceOf = (v) => ({
  id: v.voice_id,
  name: v.name,
  category: v.category || "",
  gender: v.labels?.gender || "",
  accent: v.labels?.accent || "",
  previewUrl: v.preview_url || "",
});

// Credit and voices of one key: { status, statusText, used, limit, resetAt, voices }.
export async function inspectKey(apiKey) {
  try {
    const [sub, { voices = [] }] = await Promise.all([el(apiKey, "/v1/user/subscription"), el(apiKey, "/v1/voices")]);
    const used = sub.character_count ?? 0;
    const limit = sub.character_limit ?? 0;
    const empty = limit > 0 && used >= limit;
    return {
      status: empty ? "empty" : "ok",
      statusText: empty ? "Hết credit tháng này" : "",
      used,
      limit,
      resetAt: sub.next_character_count_reset_unix ? new Date(sub.next_character_count_reset_unix * 1000) : null,
      voices: voices.map(voiceOf),
    };
  } catch (err) {
    if (err instanceof KeyProblem) return { status: err.kind === "quota" ? "empty" : "invalid", statusText: err.message };
    return { status: "error", statusText: err.message };
  }
}

// ---- the pool

// The environment key has no row; its state lives here.
let envState = { checkedAt: null, lastUsedAt: null, status: "ok", statusText: "", used: 0, limit: 0, resetAt: null, voices: [] };

// [{ id, name, apiKey, state, save(changes) }] for every active key.
async function pool() {
  const rows = await TtsKey.find({ active: true }).sort({ createdAt: 1 });
  const out = rows.map((doc) => {
    let apiKey = "";
    try {
      apiKey = keyBox.open(doc.secret);
    } catch {
      // JWT_SECRET changed since the key was saved.
    }
    return {
      id: String(doc._id),
      name: doc.name,
      apiKey,
      state: doc,
      save: async (changes) => {
        doc.set(changes);
        await doc.save();
      },
    };
  });
  if (config.elevenLabsKey)
    out.push({
      id: ENV_ID,
      name: "Key trong biến môi trường",
      apiKey: config.elevenLabsKey,
      state: envState,
      save: async (changes) => {
        envState = { ...envState, ...changes };
      },
    });
  return out;
}

async function refresh(slot) {
  if (!slot.apiKey) return slot.save({ status: "invalid", statusText: "Không đọc được key đã lưu (JWT_SECRET đã đổi). Xoá và thêm lại.", checkedAt: new Date() });
  await slot.save({ ...(await inspectKey(slot.apiKey)), checkedAt: new Date() });
}

// Re-reads keys whose numbers are older than 10 minutes (or all, with force).
async function freshPool(force = false) {
  const slots = await pool();
  await Promise.all(slots.filter((s) => force || !s.state.checkedAt || Date.now() - new Date(s.state.checkedAt) > FRESH_MS).map(refresh));
  return slots;
}

export const ttsConfigured = async () => Boolean(config.elevenLabsKey) || Boolean(await TtsKey.exists({ active: true }));

const left = (s) => (s.state.limit ? Math.max(0, s.state.limit - s.state.used) : Infinity);
const usable = (s) => s.state.status !== "invalid" && s.state.status !== "empty";

// What the "Tạo lời đọc" dialog shows: voices of every usable key (best = most credit one key has for it),
// Vietnamese models, and the credit left across keys.
export async function overview() {
  const slots = (await freshPool()).filter(usable);
  const byId = new Map();
  for (const s of slots)
    for (const v of s.state.voices || []) {
      const cur = byId.get(v.id) || { ...(v.toObject?.() || v), best: 0 };
      cur.best = Math.max(cur.best, left(s));
      byId.set(v.id, cur);
    }
  const own = (v) => (v.category === "premade" ? 1 : 0);
  const voices = [...byId.values()]
    .map((v) => ({ ...v, best: Number.isFinite(v.best) ? v.best : null }))
    .sort((a, b) => own(a) - own(b) || a.name.localeCompare(b.name));
  const finite = slots.filter((s) => s.state.limit);
  return {
    voices,
    models: slots.length ? await listModels(slots[0].apiKey) : [],
    credits: { keys: slots.length, left: finite.reduce((n, s) => n + left(s), 0), limit: finite.reduce((n, s) => n + s.state.limit, 0) },
  };
}

// Models are the same for every account, so one list for all keys.
let models = { at: 0, list: [] };
export async function listModels(apiKey) {
  if (models.list.length && Date.now() - models.at < FRESH_MS) return models.list;
  const all = await el(apiKey, "/v1/models");
  const list = all
    .filter((m) => m.can_do_text_to_speech && (m.languages || []).some((l) => l.language_id === "vi"))
    .map((m) => ({
      id: m.model_id,
      name: m.name,
      maxChars: m.max_characters_request_subscribed_user || m.max_characters_request_free_user || 5000,
      // Eleven v3 and later read [excited], [pause]...; older models would say them out loud.
      tags: Number(/^eleven_v(\d+)/.exec(m.model_id)?.[1] || 0) >= 3,
    }));
  models = { at: Date.now(), list };
  return list;
}

export const stripTags = (s) => s.replace(/\[[^\]\n]{1,40}\]/g, "").replace(/[ \t]{2,}/g, " ").trim();

// Reads text aloud with the voice; returns { mp3: Buffer, keyName }. Throws 402 when no key can pay for it.
export async function speak({ text, voiceId, modelId }) {
  const slots = (await freshPool()).filter((s) => usable(s) && (s.state.voices || []).some((v) => v.id === voiceId));
  if (!slots.length) throw new HttpError(400, "Không key nào còn dùng được có giọng này. Chọn giọng khác hoặc nhờ quản trị viên thêm key.");
  const enough = slots.filter((s) => left(s) >= text.length).sort((a, b) => left(b) - left(a));
  if (!enough.length) throw new HttpError(402, `Không key nào có giọng này còn đủ ${text.length} ký tự credit. Nhờ quản trị viên thêm key hoặc chờ credit làm mới.`);

  const tried = [];
  for (const s of enough) {
    try {
      const res = await el(s.apiKey, `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: "POST",
        body: { text, model_id: modelId },
        // Long voice-overs take a while.
        timeout: 120000,
        raw: true,
      });
      const mp3 = Buffer.from(await res.arrayBuffer());
      await s.save({ used: s.state.used + text.length, lastUsedAt: new Date() });
      return { mp3, keyName: s.name };
    } catch (err) {
      if (!(err instanceof KeyProblem)) throw err;
      // This key cannot pay: mark it and go on with the next one.
      await s.save({ status: err.kind === "quota" ? "empty" : "invalid", statusText: err.message, checkedAt: new Date() });
      tried.push(`${s.name}: ${err.message.toLowerCase()}`);
    }
  }
  throw new HttpError(402, `Không key nào tạo được lời đọc (${tried.join("; ")}). Nhờ quản trị viên kiểm tra key ở Quản trị → ElevenLabs.`);
}

// ---- for Quản trị → ElevenLabs

const publicKey = (id, name, s, extra) => ({
  id,
  name,
  last4: extra.last4,
  active: extra.active,
  fromEnv: id === ENV_ID,
  status: s.status,
  statusText: s.statusText || "",
  used: s.used || 0,
  limit: s.limit || 0,
  resetAt: s.resetAt || null,
  voices: (s.voices || []).length,
  checkedAt: s.checkedAt || null,
  lastUsedAt: s.lastUsedAt || null,
});

// Every key, inactive ones too; force re-reads them all from ElevenLabs.
export async function listKeys(force = false) {
  await freshPool(force);
  const rows = await TtsKey.find({}).sort({ createdAt: 1 }).lean();
  const out = rows.map((r) => publicKey(String(r._id), r.name, r, { last4: r.last4, active: r.active }));
  if (config.elevenLabsKey) out.push(publicKey(ENV_ID, "Key trong biến môi trường", envState, { last4: config.elevenLabsKey.slice(-4), active: true }));
  return out;
}

export const publicKeyOf = (doc) => publicKey(String(doc._id), doc.name, doc, { last4: doc.last4, active: doc.active });
