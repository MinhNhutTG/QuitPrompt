import { Router } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { z } from "zod";
import { User, ROLES } from "../models/User.js";
import { Product } from "../models/Product.js";
import { Prompt } from "../models/Prompt.js";
import { VideoPlan } from "../models/VideoPlan.js";
import { Resource } from "../models/Resource.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { ACTIONS, ACTION_GROUPS } from "../lib/audit.js";
import { ah, parse, assertId, isId, escapeRegex, text, HttpError } from "../lib/http.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

// Days are counted on the team's clock, not UTC.
const TZ = "Asia/Ho_Chi_Minh";
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);
// "YYYY-MM-DD" in TZ.
const tzDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

const username = z
  .string({ required_error: "Thiếu tên đăng nhập." })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,30}$/, "Tên đăng nhập gồm 3–30 ký tự: chữ không dấu, số, dấu chấm hoặc gạch dưới.");
const password = z
  .string({ required_error: "Thiếu mật khẩu.", invalid_type_error: "Mật khẩu phải là chữ." })
  .min(6, "Mật khẩu cần ít nhất 6 ký tự.")
  .max(100, "Mật khẩu tối đa 100 ký tự.");
const role = z.enum(ROLES, { errorMap: () => ({ message: "Vai trò không hợp lệ." }) });

const createSchema = z.object({
  username,
  displayName: text("tên hiển thị", 60).optional().default(""),
  password,
  role: role.optional().default("member"),
});
const patchSchema = z.object({ displayName: text("tên hiển thị", 60).optional(), role: role.optional(), disabled: z.boolean().optional() });

const displayName = (u) => u?.displayName || u?.username || "(tài khoản đã xoá)";

async function findUser(id) {
  assertId(id, "thành viên");
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, "Không tìm thấy thành viên.");
  return user;
}

// The team must always keep at least one admin who can still sign in.
async function assertKeepsAnAdmin(user, next) {
  const losing = user.role === "admin" && !user.disabled && (next.role === "member" || next.disabled === true || next.deleted);
  if (!losing) return;
  const others = await User.countDocuments({ _id: { $ne: user._id }, role: "admin", disabled: { $ne: true } });
  if (!others) throw new HttpError(400, "Đây là quản trị viên cuối cùng. Cấp quyền admin cho người khác trước.");
}

// ---- overview

router.get(
  "/stats",
  ah(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 14, 7), 90);
    // Midnight (team clock) of the first day in the window.
    const since = new Date(`${tzDay(daysAgo(days - 1))}T00:00:00+07:00`);
    const today = tzDay(new Date());

    const [users, admins, disabled, active7, new30, products, prompts, prompts30, resources, planSum, perDay, topActions, topUsers, failed7] =
      await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ role: "admin" }),
        User.countDocuments({ disabled: true }),
        ActivityLog.distinct("user", { createdAt: { $gte: daysAgo(7) }, user: { $ne: null } }).then((ids) => ids.length),
        User.countDocuments({ createdAt: { $gte: daysAgo(30) } }),
        Product.estimatedDocumentCount(),
        Prompt.estimatedDocumentCount(),
        Prompt.countDocuments({ createdAt: { $gte: daysAgo(30) } }),
        Resource.estimatedDocumentCount(),
        VideoPlan.aggregate([
          {
            $group: {
              _id: null,
              plans: { $sum: 1 },
              target: { $sum: "$target" },
              done: { $sum: "$done" },
              finished: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
              overdue: { $sum: { $cond: [{ $and: [{ $ne: ["$status", "done"] }, { $gt: ["$dueDate", ""] }, { $lt: ["$dueDate", today] }] }, 1, 0] } },
            },
          },
        ]),
        ActivityLog.aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } }, count: { $sum: 1 } } },
        ]),
        ActivityLog.aggregate([
          { $match: { createdAt: { $gte: daysAgo(30) } } },
          { $group: { _id: "$action", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 8 },
        ]),
        ActivityLog.aggregate([
          { $match: { createdAt: { $gte: daysAgo(30) }, user: { $ne: null }, action: { $ne: "auth.login_failed" } } },
          { $group: { _id: "$user", count: { $sum: 1 }, last: { $max: "$createdAt" } } },
          { $sort: { count: -1 } },
          { $limit: 6 },
        ]),
        ActivityLog.countDocuments({ action: "auth.login_failed", createdAt: { $gte: daysAgo(7) } }),
      ]);

    // Every day in the window, zero-filled, oldest first.
    const counts = new Map(perDay.map((d) => [d._id, d.count]));
    const activity = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = tzDay(daysAgo(i));
      activity.push({ day, count: counts.get(day) || 0 });
    }
    const names = await User.find({ _id: { $in: topUsers.map((u) => u._id) } }, { username: 1, displayName: 1 }).lean();
    const nameById = new Map(names.map((u) => [String(u._id), displayName(u)]));
    const { _id, ...plans } = planSum[0] || { plans: 0, target: 0, done: 0, finished: 0, overdue: 0 };

    res.json({
      users: { total: users, admins, disabled, active7, new30 },
      content: { products, prompts, prompts30, resources },
      plans,
      security: { failedLogins7: failed7 },
      activity,
      topActions: topActions.map((a) => ({ action: a._id, label: ACTIONS[a._id]?.label || a._id, count: a.count })),
      topUsers: topUsers.map((u) => ({ id: String(u._id), displayName: nameById.get(String(u._id)) || "(tài khoản đã xoá)", count: u.count, last: u.last })),
    });
  })
);

// ---- members

router.get(
  "/users",
  ah(async (req, res) => {
    const [users, prompts, products, plans, actions] = await Promise.all([
      User.find({}, { passwordHash: 0, __v: 0 }).sort({ createdAt: 1 }).lean(),
      Prompt.aggregate([{ $group: { _id: "$owner", count: { $sum: 1 } } }]),
      Product.aggregate([{ $group: { _id: "$owner", count: { $sum: 1 } } }]),
      VideoPlan.aggregate([
        {
          $group: {
            _id: "$assignee",
            plans: { $sum: 1 },
            open: { $sum: { $cond: [{ $ne: ["$status", "done"] }, 1, 0] } },
            target: { $sum: "$target" },
            done: { $sum: "$done" },
          },
        },
      ]),
      ActivityLog.aggregate([
        { $match: { user: { $ne: null }, action: { $ne: "auth.login_failed" } } },
        {
          $group: {
            _id: "$user",
            actions30: { $sum: { $cond: [{ $gte: ["$createdAt", daysAgo(30)] }, 1, 0] } },
            lastActionAt: { $max: "$createdAt" },
          },
        },
      ]),
    ]);
    const by = (rows) => new Map(rows.map((r) => [String(r._id), r]));
    const [p, pr, pl, ac] = [by(prompts), by(products), by(plans), by(actions)];
    res.json({
      me: req.userId,
      // Members see everything here; only admins get the buttons that change accounts.
      canManage: req.role === "admin",
      items: users.map((u) => {
        const id = String(u._id);
        const { _id, sessionVersion, ...rest } = u;
        const plan = pl.get(id);
        return {
          ...rest,
          id,
          role: u.role || "member",
          disabled: Boolean(u.disabled),
          displayName: displayName(u),
          prompts: p.get(id)?.count || 0,
          products: pr.get(id)?.count || 0,
          plans: plan ? { total: plan.plans, open: plan.open, target: plan.target, done: plan.done } : { total: 0, open: 0, target: 0, done: 0 },
          actions30: ac.get(id)?.actions30 || 0,
          lastActionAt: ac.get(id)?.lastActionAt || null,
        };
      }),
    });
  })
);

router.post(
  "/users",
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(createSchema, req.body);
    if (await User.exists({ username: data.username })) throw new HttpError(409, "Tên đăng nhập này đã có người dùng.");
    const user = await User.create({ username: data.username, displayName: data.displayName || undefined, role: data.role, passwordHash: await bcrypt.hash(data.password, 10) });
    res.locals.audit = { label: user.username, meta: { role: user.role } };
    res.status(201).json({ item: user.toPublic() });
  })
);

router.patch(
  "/users/:id",
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(patchSchema, req.body);
    const user = await findUser(req.params.id);
    const self = String(user._id) === String(req.userId);
    if (self && (data.disabled === true || data.role === "member")) throw new HttpError(400, "Không tự khoá hoặc tự bỏ quyền admin của chính mình được.");
    await assertKeepsAnAdmin(user, data);
    if (data.displayName !== undefined) user.displayName = data.displayName || undefined;
    if (data.role) user.role = data.role;
    if (data.disabled !== undefined && data.disabled !== Boolean(user.disabled)) {
      user.disabled = data.disabled;
      if (data.disabled) user.sessionVersion = (user.sessionVersion || 0) + 1;
    }
    await user.save();
    res.locals.audit = { label: user.username, meta: { role: data.role, disabled: data.disabled } };
    res.json({ item: user.toPublic() });
  })
);

router.post(
  "/users/:id/password",
  requireAdmin,
  ah(async (req, res) => {
    const { password: next } = parse(z.object({ password }), req.body);
    const user = await findUser(req.params.id);
    user.passwordHash = await bcrypt.hash(next, 10);
    // Signs them out everywhere, the admin included when resetting their own.
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    await user.save();
    res.locals.audit = { label: user.username };
    res.json({ ok: true, self: String(user._id) === String(req.userId) });
  })
);

router.post(
  "/users/:id/logout",
  requireAdmin,
  ah(async (req, res) => {
    const user = await findUser(req.params.id);
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    await user.save();
    res.locals.audit = { label: user.username };
    res.json({ ok: true });
  })
);

// Their products, prompts and plans stay: everything is shared, and lists show "(tài khoản đã xoá)".
router.delete(
  "/users/:id",
  requireAdmin,
  ah(async (req, res) => {
    const user = await findUser(req.params.id);
    if (String(user._id) === String(req.userId)) throw new HttpError(400, "Không tự xoá tài khoản của chính mình được.");
    await assertKeepsAnAdmin(user, { deleted: true });
    await user.deleteOne();
    res.locals.audit = { label: user.username };
    res.json({ ok: true });
  })
);

// ---- activity log

// Filters: user, group (prefix such as "plan"), action, from/to (inclusive days in TZ), q (label). Newest first, numbered pages.
router.get(
  "/logs",
  ah(async (req, res) => {
    const match = {};
    if (req.query.user) match.user = oid(assertId(String(req.query.user), "thành viên"));
    if (typeof req.query.action === "string" && ACTIONS[req.query.action]) match.action = req.query.action;
    else if (typeof req.query.group === "string" && ACTION_GROUPS[req.query.group]) match.action = new RegExp(`^${req.query.group}\\.`);
    const range = {};
    if (DAY.test(String(req.query.from))) range.$gte = new Date(`${req.query.from}T00:00:00+07:00`);
    if (DAY.test(String(req.query.to))) range.$lt = new Date(new Date(`${req.query.to}T00:00:00+07:00`).getTime() + DAY_MS);
    if (Object.keys(range).length) match.createdAt = range;
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    if (q) match.label = new RegExp(escapeRegex(q), "i");

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 10), 100);
    const total = await ActivityLog.countDocuments(match);
    const pages = Math.max(Math.ceil(total / limit), 1);
    const page = Math.min(Math.max(Math.floor(Number(req.query.page)) || 1, 1), pages);
    const rows = await ActivityLog.find(match)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    const ids = [...new Set(rows.map((r) => r.user && String(r.user)).filter((id) => id && isId(id)))];
    const users = await User.find({ _id: { $in: ids } }, { username: 1, displayName: 1 }).lean();
    const byId = new Map(users.map((u) => [String(u._id), { id: String(u._id), displayName: displayName(u), username: u.username }]));
    res.json({
      items: rows.map(({ user, ...r }) => ({
        ...r,
        user: user ? byId.get(String(user)) || { id: String(user), displayName: "(tài khoản đã xoá)" } : null,
        actionLabel: ACTIONS[r.action]?.label || r.action,
        group: ACTIONS[r.action]?.group || "",
      })),
      total,
      page,
      pages,
      limit,
      groups: ACTION_GROUPS,
      actions: Object.entries(ACTIONS).map(([code, a]) => ({ code, ...a })),
    });
  })
);

export default router;
