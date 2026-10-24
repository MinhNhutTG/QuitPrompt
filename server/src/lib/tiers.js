import { Tier } from "../models/Tier.js";
import { Usage } from "../models/Usage.js";
import { HttpError } from "./http.js";

// Account tiers sit beside roles: a tier adds permissions to the role and sets usage limits.
// Premium lasts until users.premiumUntil (end of that day; none = no end), then the account is Normal again.
export const TIER_KEYS = ["normal", "premium"];
export const TIER_NAMES = { normal: "Thường", premium: "Premium" };

export const LIMITS = [
  { key: "promptsPerDay", label: "Prompt lưu mỗi ngày" },
  { key: "productsPerDay", label: "Sản phẩm tạo mỗi ngày" },
  { key: "imagesPerProduct", label: "Ảnh mỗi sản phẩm (tối đa 12)" },
];
export const LIMIT_KEYS = LIMITS.map((l) => l.key);
export const NO_LIMITS = Object.fromEntries(LIMIT_KEYS.map((k) => [k, null]));

const STARTER = {
  normal: { permissions: [], limits: { promptsPerDay: 10, productsPerDay: 5, imagesPerProduct: 4 } },
  premium: { permissions: ["product.delete", "plan.edit", "resource.edit", "data.export"], limits: NO_LIMITS },
};

// Each tier is created the first time it is missing; afterwards admins change it.
export async function ensureTiers() {
  await Promise.all(TIER_KEYS.map((key) => Tier.updateOne({ key }, { $setOnInsert: { key, ...STARTER[key] } }, { upsert: true })));
  invalidateTiers();
}

const TTL = 30 * 1000;
let cache = null;
let loadedAt = 0;

async function tierMap() {
  if (!cache || Date.now() - loadedAt > TTL) {
    const rows = await Tier.find({}, { key: 1, permissions: 1, limits: 1 }).lean();
    const byKey = new Map(rows.map((t) => [t.key, t]));
    cache = new Map(
      TIER_KEYS.map((key) => {
        const t = byKey.get(key) || STARTER[key];
        const limits = Object.fromEntries(LIMIT_KEYS.map((k) => [k, t.limits?.[k] ?? null]));
        return [key, { key, name: TIER_NAMES[key], permissions: t.permissions || [], limits }];
      })
    );
    loadedAt = Date.now();
  }
  return cache;
}

export const invalidateTiers = () => {
  cache = null;
};

export const getTier = async (key) => (await tierMap()).get(TIER_KEYS.includes(key) ? key : "normal");
export const listTiers = async () => [...(await tierMap()).values()];

export const isPremium = (u) => Boolean(u?.premium) && (!u.premiumUntil || new Date(u.premiumUntil) > new Date());
export const tierKeyOf = (u) => (isPremium(u) ? "premium" : "normal");

// Mongo filter for accounts that are Premium right now.
export const premiumNow = () => ({ premium: true, $or: [{ premiumUntil: null }, { premiumUntil: { $gt: new Date() } }] });

// Days are counted on the team's clock.
const TZ = "Asia/Ho_Chi_Minh";
export const vnDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
// "2026-12-31" → the last moment of that day in Vietnam.
export const endOfDay = (day) => new Date(`${day}T23:59:59.999+07:00`);

const OVER = {
  promptsPerDay: (max) => `lưu tối đa ${max} prompt mỗi ngày`,
  productsPerDay: (max) => `tạo tối đa ${max} sản phẩm mỗi ngày`,
};

function overLimit(req, key, max) {
  const upgrade = req.tier === "normal" ? " Mai làm tiếp được, hoặc nhờ quản trị viên nâng lên Premium." : " Mai làm tiếp được.";
  return new HttpError(403, `Hạng ${TIER_NAMES[req.tier] || ""} ${OVER[key](max)}.${upgrade}`);
}

const NOOP = async () => {};

// Takes one unit of today's allowance for the signed-in account, or throws when it is used up.
// Atomic: requests sent at the same moment cannot pass the limit together. Deleting what was made does not
// give the unit back. Returns a function that does, for when the action fails after this call.
export async function useDaily(req, key) {
  const max = req.limits?.[key];
  if (max == null) return NOOP;
  if (max <= 0) throw overLimit(req, key, max);
  const id = { user: req.userId, day: vnDay(), key };
  const take = (upsert) => Usage.updateOne({ ...id, count: { $lt: max } }, { $inc: { count: 1 } }, { upsert });
  try {
    // No row yet: the upsert creates it at 1. A full row does not match, so the upsert hits the unique index.
    await take(true);
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Either the row is full, or another request created it a moment ago: try once more without creating.
    const { modifiedCount } = await take(false);
    if (!modifiedCount) throw overLimit(req, key, max);
  }
  return () => Usage.updateOne({ ...id, count: { $gt: 0 } }, { $inc: { count: -1 } }).catch(() => {});
}
