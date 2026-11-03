import { config } from "../config.js";
import { HttpError } from "./http.js";

// ElevenLabs text to speech (tài liệu 09, mục "Tạo lời đọc bằng ElevenLabs"). One API key for the team, in
// ELEVENLABS_API_KEY; it never leaves the server. Voices and models are asked from the account itself, so new
// models and the team's own cloned voices show up without a code change.

const API = "https://api.elevenlabs.io";
const LIST_TTL = 10 * 60 * 1000;

export const ttsConfigured = () => Boolean(config.elevenLabsKey);

function elError(status, data) {
  const d = data?.detail;
  const code = d?.status || d?.code || "";
  const msg = typeof d === "string" ? d : d?.message || "";
  if (status === 401) {
    if (code === "quota_exceeded") return new HttpError(402, "Tài khoản ElevenLabs đã hết credit. Nạp thêm hoặc chờ gói tháng mới.");
    return new HttpError(502, "API key ElevenLabs sai, hết hạn hoặc thiếu quyền. Nhờ quản trị viên kiểm tra ELEVENLABS_API_KEY.");
  }
  if (status === 402 || code === "quota_exceeded") return new HttpError(402, "Tài khoản ElevenLabs đã hết credit. Nạp thêm hoặc chờ gói tháng mới.");
  if (status === 429) return new HttpError(429, "ElevenLabs đang bận hoặc đang tạo quá nhiều cùng lúc. Chờ một chút rồi thử lại.");
  if (status === 404) return new HttpError(400, "Không tìm thấy giọng hoặc model này trên ElevenLabs. Chọn giọng khác.");
  if (status === 400 || status === 422) return new HttpError(400, `ElevenLabs không nhận yêu cầu${msg ? `: ${msg}` : "."}`);
  console.error("ElevenLabs lỗi", status, msg || data);
  return new HttpError(502, "ElevenLabs gặp lỗi. Thử lại sau ít phút.");
}

async function el(path, { method = "GET", body, timeout = 20000, raw = false } = {}) {
  if (!ttsConfigured()) throw new HttpError(503, "Chưa cài ElevenLabs. Nhờ quản trị viên đặt ELEVENLABS_API_KEY trên máy chủ.");
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { "xi-api-key": config.elevenLabsKey, ...(body && { "Content-Type": "application/json" }) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (err) {
    throw new HttpError(504, err.name === "TimeoutError" ? "ElevenLabs trả lời quá lâu. Thử lại, hoặc chia lời đọc ngắn hơn." : "Không kết nối được ElevenLabs. Thử lại sau.");
  }
  if (!res.ok) throw elError(res.status, await res.json().catch(() => null));
  return raw ? res : res.json();
}

const cache = new Map(); // key → { at, value }
async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < LIST_TTL) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

// [{ id, name, category, gender, accent, previewUrl }], the team's own voices (cloned, generated) first.
export const listVoices = () =>
  cached("voices", async () => {
    const { voices = [] } = await el("/v1/voices");
    const own = (v) => (v.category === "premade" ? 1 : 0);
    return voices
      .map((v) => ({
        id: v.voice_id,
        name: v.name,
        category: v.category || "",
        gender: v.labels?.gender || "",
        accent: v.labels?.accent || "",
        previewUrl: v.preview_url || "",
      }))
      .sort((a, b) => own(a) - own(b) || a.name.localeCompare(b.name));
  });

// Text-to-speech models that read Vietnamese: [{ id, name, maxChars, tags }]. tags: understands [audio tags].
export const listModels = () =>
  cached("models", async () => {
    const models = await el("/v1/models");
    return models
      .filter((m) => m.can_do_text_to_speech && (m.languages || []).some((l) => l.language_id === "vi"))
      .map((m) => ({
        id: m.model_id,
        name: m.name,
        maxChars: m.max_characters_request_subscribed_user || m.max_characters_request_free_user || 5000,
        // Eleven v3 and later read [excited], [pause]...; older models would say them out loud.
        tags: Number(/^eleven_v(\d+)/.exec(m.model_id)?.[1] || 0) >= 3,
      }));
  });

// { used, limit, resetAt } characters this billing period; null when the key may not read it.
export async function credits() {
  try {
    const s = await el("/v1/user/subscription");
    return { used: s.character_count ?? 0, limit: s.character_limit ?? 0, resetAt: s.next_character_count_reset_unix ? new Date(s.next_character_count_reset_unix * 1000) : null };
  } catch (err) {
    if (err.status === 503) throw err;
    return null;
  }
}

export const stripTags = (s) => s.replace(/\[[^\]\n]{1,40}\]/g, "").replace(/[ \t]{2,}/g, " ").trim();

// The voice-over as an mp3 Buffer.
export async function speak({ text, voiceId, modelId }) {
  const res = await el(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    body: { text, model_id: modelId },
    // Long voice-overs take a while.
    timeout: 120000,
    raw: true,
  });
  return Buffer.from(await res.arrayBuffer());
}
