import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { User } from "../models/User.js";
import { ah, parse, HttpError } from "../lib/http.js";
import { writeLog } from "../lib/audit.js";
import { publicUser } from "../lib/permissions.js";
import { signSession, clearSession, requireAuth, refreshIfOld, sessionUserId } from "../middleware/auth.js";

const router = Router();

const limitOptions = {
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Bạn thử quá nhiều lần. Chờ khoảng 15 phút rồi thử lại." },
};
// Login only counts failures, so someone typing the right password is never locked out by their own logins.
const loginLimiter = rateLimit({ ...limitOptions, skipSuccessfulRequests: true });
const registerLimiter = rateLimit(limitOptions);

const password = z
  .string({ required_error: "Thiếu mật khẩu.", invalid_type_error: "Mật khẩu phải là chữ." })
  .min(6, "Mật khẩu cần ít nhất 6 ký tự.")
  .max(100, "Mật khẩu tối đa 100 ký tự.");

const registerSchema = z.object({
  username: z
    .string({ required_error: "Thiếu tên đăng nhập." })
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{3,30}$/, "Tên đăng nhập gồm 3–30 ký tự: chữ không dấu, số, dấu chấm hoặc gạch dưới."),
  password,
  remember: z.boolean().optional().default(true),
});

const loginSchema = z.object({
  username: z.string({ required_error: "Thiếu tên đăng nhập." }).trim().toLowerCase().min(1, "Cần nhập tên đăng nhập.").max(60),
  password: z.string({ required_error: "Thiếu mật khẩu." }).min(1, "Cần nhập mật khẩu.").max(100),
  remember: z.boolean().optional().default(true),
});

// Compared against when the user does not exist, so both paths take about the same time.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);
const TAKEN = "Tên đăng nhập này đã có người dùng. Chọn tên khác.";

// Usernames listed in ADMIN_USERNAMES become admins the next time they sign in or open the app.
async function promoteIfListed(user) {
  if (user.role !== "admin" && config.adminUsernames.includes(user.username)) {
    user.role = "admin";
    await user.save();
  }
}

router.get("/config", (req, res) => res.json({ allowRegister: config.allowRegister }));

router.post(
  "/register",
  registerLimiter,
  ah(async (req, res) => {
    if (!config.allowRegister) throw new HttpError(403, "Đăng ký tài khoản mới đang tắt. Nhờ người quản trị tạo tài khoản giúp.");
    const { username, password, remember } = parse(registerSchema, req.body);
    if (await User.exists({ username })) throw new HttpError(409, TAKEN);
    const passwordHash = await bcrypt.hash(password, 10);
    let user;
    try {
      // The very first account runs the team, so it starts as admin.
      const first = !(await User.exists({}));
      user = await User.create({ username, passwordHash, lastLoginAt: new Date(), role: first ? "admin" : "member" });
    } catch (err) {
      if (err.code === 11000) throw new HttpError(409, TAKEN);
      throw err;
    }
    signSession(res, user._id, remember, user.sessionVersion);
    res.locals.audit = { userId: user._id, label: user.username };
    res.status(201).json({ user: await publicUser(user) });
  })
);

router.post(
  "/login",
  loginLimiter,
  ah(async (req, res) => {
    const { username, password, remember } = parse(loginSchema, req.body);
    const user = await User.findOne({ username });
    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) {
      writeLog(req, { user: user?._id, action: "auth.login_failed", label: username });
      throw new HttpError(401, "Sai tên đăng nhập hoặc mật khẩu.");
    }
    if (user.disabled) {
      writeLog(req, { user: user._id, action: "auth.login_failed", label: username, meta: { disabled: true } });
      throw new HttpError(403, "Tài khoản này đã bị khoá. Liên hệ quản trị viên.");
    }
    user.lastLoginAt = new Date();
    await user.save();
    await promoteIfListed(user);
    signSession(res, user._id, remember, user.sessionVersion);
    res.locals.audit = { userId: user._id, label: user.username };
    res.json({ user: await publicUser(user) });
  })
);

router.post("/logout", (req, res) => {
  res.locals.audit = { userId: sessionUserId(req), label: "" };
  clearSession(res);
  res.json({ ok: true });
});

router.get(
  "/me",
  requireAuth,
  ah(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) {
      clearSession(res);
      throw new HttpError(401, "Tài khoản không còn tồn tại.");
    }
    await promoteIfListed(user);
    refreshIfOld(req, res);
    res.json({ user: await publicUser(user) });
  })
);

const passwordSchema = z.object({
  current: z.string({ required_error: "Thiếu mật khẩu hiện tại." }).min(1, "Cần nhập mật khẩu hiện tại."),
  next: password,
});

router.post(
  "/password",
  requireAuth,
  ah(async (req, res) => {
    const { current, next } = parse(passwordSchema, req.body);
    const user = await User.findById(req.userId);
    if (!user) throw new HttpError(401, "Tài khoản không còn tồn tại.");
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new HttpError(400, "Mật khẩu hiện tại không đúng.");
    user.passwordHash = await bcrypt.hash(next, 10);
    await user.save();
    res.json({ ok: true });
  })
);

export default router;
