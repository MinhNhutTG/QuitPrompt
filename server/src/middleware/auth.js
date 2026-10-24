import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { User } from "../models/User.js";
import { ADMIN_ROLE, accessOf, deniedMessage } from "../lib/permissions.js";

export const COOKIE = "ps_session";
const DAY = 24 * 60 * 60 * 1000;
const cookieBase = () => ({ httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/" });
// Only the algorithm the server signs with is accepted, so a token cannot pick a weaker one.
const VERIFY = { algorithms: ["HS256"] };

// v = the user's sessionVersion: bumping it on the account voids every cookie signed before.
export function signSession(res, userId, remember, version = 0) {
  const token = jwt.sign({ sub: String(userId), rem: remember ? 1 : 0, v: version }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: remember ? "30d" : "1d",
  });
  // Without maxAge the cookie is a session cookie: closing the browser logs out.
  res.cookie(COOKIE, token, remember ? { ...cookieBase(), maxAge: 30 * DAY } : cookieBase());
}

export function clearSession(res) {
  res.clearCookie(COOKIE, cookieBase());
}

// The signed-in user's id from the cookie, or null; no account lookup (used to attribute a logout).
export function sessionUserId(req) {
  try {
    return jwt.verify(req.cookies?.[COOKIE] || "", config.jwtSecret, VERIFY).sub;
  } catch {
    return null;
  }
}

// One small lookup per request, so a disabled account or a reset password takes effect at once.
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next(new HttpError(401, "Bạn chưa đăng nhập."));
  let session;
  try {
    session = jwt.verify(token, config.jwtSecret, VERIFY);
  } catch {
    clearSession(res);
    return next(new HttpError(401, "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại."));
  }
  try {
    const user = await User.findById(session.sub, { role: 1, disabled: 1, sessionVersion: 1, premium: 1, premiumUntil: 1 }).lean();
    if (!user || user.disabled || (user.sessionVersion || 0) !== (session.v || 0)) {
      clearSession(res);
      const msg = !user ? "Tài khoản không còn tồn tại." : user.disabled ? "Tài khoản của bạn đã bị khoá. Liên hệ quản trị viên." : "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.";
      return next(new HttpError(401, msg));
    }
    req.session = session;
    req.userId = session.sub;
    req.role = user.role || "member";
    const access = await accessOf(user);
    req.permissions = new Set(access.permissions);
    req.tier = access.tier.key;
    req.limits = access.limits;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, res, next) {
  if (req.role !== ADMIN_ROLE) return next(new HttpError(403, "Chỉ quản trị viên mới làm được việc này."));
  next();
}

// Route guard for one permission from lib/permissions.js; admins have them all.
export const can = (perm) => (req, res, next) => (req.permissions?.has(perm) ? next() : next(new HttpError(403, deniedMessage(perm))));

// Sliding 30-day window: a remembered session that is used keeps renewing itself.
export function refreshIfOld(req, res) {
  const s = req.session;
  if (s?.rem && Date.now() / 1000 - s.iat > 24 * 60 * 60) signSession(res, s.sub, true, s.v || 0);
}
