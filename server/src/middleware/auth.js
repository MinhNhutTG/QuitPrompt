import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";

export const COOKIE = "ps_session";
const DAY = 24 * 60 * 60 * 1000;
const cookieBase = () => ({ httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/" });

export function signSession(res, userId, remember) {
  const token = jwt.sign({ sub: String(userId), rem: remember ? 1 : 0 }, config.jwtSecret, {
    expiresIn: remember ? "30d" : "1d",
  });
  // Without maxAge the cookie is a session cookie: closing the browser logs out.
  res.cookie(COOKIE, token, remember ? { ...cookieBase(), maxAge: 30 * DAY } : cookieBase());
}

export function clearSession(res) {
  res.clearCookie(COOKIE, cookieBase());
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next(new HttpError(401, "Bạn chưa đăng nhập."));
  try {
    req.session = jwt.verify(token, config.jwtSecret);
    req.userId = req.session.sub;
    next();
  } catch {
    clearSession(res);
    next(new HttpError(401, "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại."));
  }
}

// Sliding 30-day window: a remembered session that is used keeps renewing itself.
export function refreshIfOld(req, res) {
  const s = req.session;
  if (s?.rem && Date.now() / 1000 - s.iat > 24 * 60 * 60) signSession(res, s.sub, true);
}
