import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Tier } from "../models/Tier.js";
import { Product } from "../models/Product.js";
import { Prompt } from "../models/Prompt.js";
import { VideoPlan } from "../models/VideoPlan.js";
import { Resource } from "../models/Resource.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { ACTIONS, ACTION_GROUPS } from "../lib/audit.js";
import { ah, parse, assertId, isId, escapeRegex, text, HttpError } from "../lib/http.js";
import { requireAdmin, can } from "../middleware/auth.js";
import { PERMISSIONS, PERMISSION_KEYS, ADMIN_ROLE, DEFAULT_ROLE, getRole, roleExists, listRoles, invalidateRoles } from "../lib/permissions.js";
import { TIER_KEYS, LIMITS, LIMIT_KEYS, getTier, listTiers, invalidateTiers, premiumNow, tierKeyOf, endOfDay } from "../lib/tiers.js";
import { config } from "../config.js";

const router = Router();

// Days are counted on the team's clock, not UTC.
const TZ = "Asia/Ho_Chi_Minh";
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);
// "YYYY-MM-DD" and "HH" in TZ.
const tzDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const tzHour = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(d);
const HOUR_MS = 60 * 60 * 1000;

// Every bucket in the log window, zero-filled, oldest first: hours while the log keeps 3 days or less, else days.
function activityBuckets(perBucket, hourly, retention) {
  const counts = new Map(perBucket.map((b) => [b._id, b.count]));
  const out = [];
  const n = hourly ? retention * 24 : Math.min(retention, 90);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * (hourly ? HOUR_MS : DAY_MS));
    const day = tzDay(d);
    const key = hourly ? `${day} ${tzHour(d)}` : day;
    const dm = `${day.slice(8, 10)}/${day.slice(5, 7)}`;
    out.push({ key, label: hourly ? `${tzHour(d)}h ${dm}` : dm, count: counts.get(key) || 0 });
  }
  return out;
}

const username = z
  .string({ required_error: "Thiếu tên đăng nhập." })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,30}$/, "Tên đăng nhập gồm 3–30 ký tự: chữ không dấu, số, dấu chấm hoặc gạch dưới.");
const password = z
  .string({ required_error: "Thiếu mật khẩu.", invalid_type_error: "Mật khẩu phải là chữ." })
  .min(6, "Mật khẩu cần ít nhất 6 ký tự.")
  .max(100, "Mật khẩu tối đa 100 ký tự.");
const role = z.string({ invalid_type_error: "Vai trò không hợp lệ." }).trim().min(1, "Chưa chọn vai trò.").max(40, "Vai trò không hợp lệ.");

const createSchema = z.object({
  username,
  displayName: text("tên hiển thị", 60).optional().default(""),
  password,
  role: role.optional().default("member"),
});
const patchSchema = z.object({
  displayName: text("tên hiển thị", 60).optional(),
  role: role.optional(),
  disabled: z.boolean().optional(),
  premium: z.boolean({ invalid_type_error: "Hạng tài khoản không hợp lệ." }).optional(),
  // Last day of Premium ("YYYY-MM-DD"); "" = no end.
  premiumUntil: z.string().regex(DAY, "Ngày hết hạn không hợp lệ.").or(z.literal("")).optional(),
});

const displayName = (u) => u?.displayName || u?.username || "(tài khoản đã xoá)";

async function findUser(id) {
  assertId(id, "thành viên");
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, "Không tìm thấy thành viên.");
  return user;
}

async function assertRole(key) {
  if (key !== undefined && !(await roleExists(key))) throw new HttpError(400, "Vai trò này không còn. Tải lại trang rồi chọn lại.");
}

// The team must always keep at least one admin who can still sign in.
async function assertKeepsAnAdmin(user, next) {
  const demoted = next.role !== undefined && next.role !== ADMIN_ROLE;
  const losing = user.role === ADMIN_ROLE && !user.disabled && (demoted || next.disabled === true || next.deleted);
  if (!losing) return;
  const others = await User.countDocuments({ _id: { $ne: user._id }, role: ADMIN_ROLE, disabled: { $ne: true } });
  if (!others) throw new HttpError(400, "Đây là quản trị viên cuối cùng. Cấp quyền admin cho người khác trước.");
}

// ---- overview

router.get(
  "/stats",
  can("admin.view"),
  ah(async (req, res) => {
    // Everything from the log covers only what it still keeps.
    const retention = config.logRetentionDays;
    const hourly = retention <= 3;
    const since = daysAgo(retention);
    const today = tzDay(new Date());

    const [users, admins, disabled, premium, active7, new30, products, prompts, prompts30, resources, planSum, perBucket, topActions, topUsers, failed] =
      await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ role: ADMIN_ROLE }),
        User.countDocuments({ disabled: true }),
        User.countDocuments(premiumNow()),
        // From sign-ins, which outlive the log.
        User.countDocuments({ lastLoginAt: { $gte: daysAgo(7) } }),
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
          { $group: { _id: { $dateToString: { format: hourly ? "%Y-%m-%d %H" : "%Y-%m-%d", date: "$createdAt", timezone: TZ } }, count: { $sum: 1 } } },
        ]),
        ActivityLog.aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: "$action", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 8 },
        ]),
        ActivityLog.aggregate([
          { $match: { createdAt: { $gte: since }, user: { $ne: null }, action: { $ne: "auth.login_failed" } } },
          { $group: { _id: "$user", count: { $sum: 1 }, last: { $max: "$createdAt" } } },
          { $sort: { count: -1 } },
          { $limit: 6 },
        ]),
        ActivityLog.countDocuments({ action: "auth.login_failed", createdAt: { $gte: since } }),
      ]);

    const names = await User.find({ _id: { $in: topUsers.map((u) => u._id) } }, { username: 1, displayName: 1 }).lean();
    const nameById = new Map(names.map((u) => [String(u._id), displayName(u)]));
    const { _id, ...plans } = planSum[0] || { plans: 0, target: 0, done: 0, finished: 0, overdue: 0 };

    res.json({
      users: { total: users, admins, disabled, premium, active7, new30 },
      content: { products, prompts, prompts30, resources },
      plans,
      retentionDays: retention,
      security: { failedLogins: failed },
      activity: { bucket: hourly ? "hour" : "day", items: activityBuckets(perBucket, hourly, retention) },
      topActions: topActions.map((a) => ({ action: a._id, label: ACTIONS[a._id]?.label || a._id, count: a.count })),
      topUsers: topUsers.map((u) => ({ id: String(u._id), displayName: nameById.get(String(u._id)) || "(tài khoản đã xoá)", count: u.count, last: u.last })),
    });
  })
);

// ---- members

router.get(
  "/users",
  can("admin.view"),
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
        { $group: { _id: "$user", actions: { $sum: 1 }, lastActionAt: { $max: "$createdAt" } } },
      ]),
    ]);
    const by = (rows) => new Map(rows.map((r) => [String(r._id), r]));
    const roles = new Map((await listRoles()).map((r) => [r.key, r.name]));
    const [p, pr, pl, ac] = [by(prompts), by(products), by(plans), by(actions)];
    res.json({
      me: req.userId,
      // Members see everything here; only admins get the buttons that change accounts.
      canManage: req.role === ADMIN_ROLE,
      retentionDays: config.logRetentionDays,
      items: users.map((u) => {
        const id = String(u._id);
        const { _id, sessionVersion, ...rest } = u;
        const plan = pl.get(id);
        return {
          ...rest,
          id,
          role: u.role || DEFAULT_ROLE,
          roleName: roles.get(u.role || DEFAULT_ROLE) || "(vai trò đã xoá)",
          tier: tierKeyOf(u),
          premium: Boolean(u.premium),
          premiumUntil: u.premiumUntil || null,
          disabled: Boolean(u.disabled),
          displayName: displayName(u),
          prompts: p.get(id)?.count || 0,
          products: pr.get(id)?.count || 0,
          plans: plan ? { total: plan.plans, open: plan.open, target: plan.target, done: plan.done } : { total: 0, open: 0, target: 0, done: 0 },
          // Within the log window only.
          actions: ac.get(id)?.actions || 0,
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
    await assertRole(data.role);
    const user = await User.create({ username: data.username, displayName: data.displayName || undefined, role: data.role, passwordHash: await bcrypt.hash(data.password, 10) });
    res.locals.audit = { label: user.username, meta: { role: (await getRole(user.role)).name } };
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
    if (self && (data.disabled === true || (data.role !== undefined && data.role !== ADMIN_ROLE)))
      throw new HttpError(400, "Không tự khoá hoặc tự bỏ quyền admin của chính mình được.");
    await assertRole(data.role);
    await assertKeepsAnAdmin(user, data);
    if (data.displayName !== undefined) user.displayName = data.displayName || undefined;
    if (data.role) user.role = data.role;
    if (data.premium !== undefined) user.premium = data.premium;
    if (data.premiumUntil !== undefined) user.premiumUntil = data.premiumUntil ? endOfDay(data.premiumUntil) : null;
    if (data.disabled !== undefined && data.disabled !== Boolean(user.disabled)) {
      user.disabled = data.disabled;
      if (data.disabled) user.sessionVersion = (user.sessionVersion || 0) + 1;
    }
    await user.save();
    res.locals.audit = {
      label: user.username,
      meta: {
        role: data.role && (await getRole(data.role)).name,
        disabled: data.disabled,
        tier: data.premium === undefined ? undefined : data.premium ? `Premium${data.premiumUntil ? ` đến ${data.premiumUntil.split("-").reverse().join("/")}` : ""}` : "Thường",
      },
    };
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

// ---- roles: everyone with admin.view sees them, only admins change them

const roleName = text("tên vai trò", 40, 1);
const permissions = z
  .array(z.enum(PERMISSION_KEYS, { errorMap: () => ({ message: "Có quyền không hợp lệ. Tải lại trang rồi thử lại." }) }), { invalid_type_error: "Danh sách quyền không hợp lệ." })
  .max(PERMISSION_KEYS.length * 2)
  .transform((list) => PERMISSION_KEYS.filter((k) => list.includes(k)));
const roleCreateSchema = z.object({ name: roleName, permissions: permissions.optional().default([]) });
const rolePatchSchema = z.object({ name: roleName.optional(), permissions: permissions.optional() });

async function assertFreeName(name, exceptKey) {
  const taken = (await listRoles()).some((r) => r.key !== exceptKey && r.name.toLowerCase() === name.toLowerCase());
  if (taken) throw new HttpError(409, "Đã có vai trò tên này. Chọn tên khác.");
}

async function findRole(key) {
  if (key === ADMIN_ROLE) throw new HttpError(400, "Quản trị viên luôn có mọi quyền, không sửa hay xoá được.");
  const role = await Role.findOne({ key: String(key) });
  if (!role) throw new HttpError(404, "Không tìm thấy vai trò này.");
  return role;
}

const roleOut = (r) => ({ key: r.key, name: r.name, permissions: r.permissions });

router.get(
  "/roles",
  can("admin.view"),
  ah(async (req, res) => {
    const counts = new Map((await User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }])).map((c) => [c._id || DEFAULT_ROLE, c.count]));
    res.json({
      canManage: req.role === ADMIN_ROLE,
      permissions: PERMISSIONS,
      items: (await listRoles()).map((r) => ({
        ...r,
        locked: Boolean(r.locked),
        builtin: r.key === DEFAULT_ROLE,
        users: counts.get(r.key) || 0,
      })),
    });
  })
);

router.post(
  "/roles",
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(roleCreateSchema, req.body);
    await assertFreeName(data.name);
    const role = await Role.create({ key: "r" + crypto.randomBytes(5).toString("hex"), ...data });
    invalidateRoles();
    res.status(201).json({ item: roleOut(role) });
  })
);

// Takes effect on each member's next request; their open screens catch up when the server refuses something.
router.patch(
  "/roles/:key",
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(rolePatchSchema, req.body);
    const role = await findRole(req.params.key);
    if (data.name !== undefined) await assertFreeName(data.name, role.key);
    role.set(data);
    await role.save();
    invalidateRoles();
    res.json({ item: roleOut(role) });
  })
);

router.delete(
  "/roles/:key",
  requireAdmin,
  ah(async (req, res) => {
    const role = await findRole(req.params.key);
    if (role.key === DEFAULT_ROLE) throw new HttpError(400, "Đây là vai trò cho tài khoản mới đăng ký nên không xoá được. Bạn vẫn đổi tên và quyền được.");
    const users = await User.countDocuments({ role: role.key });
    if (users) throw new HttpError(400, `Còn ${users} tài khoản đang dùng vai trò này. Đổi vai trò cho họ trước rồi xoá.`);
    await role.deleteOne();
    invalidateRoles();
    res.locals.audit = { label: role.name };
    res.json({ ok: true });
  })
);

// ---- tiers: Normal and Premium, fixed; admins change their extra permissions and limits

const limit = z.union([z.null(), z.number({ invalid_type_error: "Giới hạn phải là số." }).int("Giới hạn phải là số nguyên.").min(0, "Giới hạn không được âm.").max(100000, "Giới hạn quá lớn.")]);
const tierPatchSchema = z.object({
  permissions: permissions.optional(),
  limits: z.object(Object.fromEntries(LIMIT_KEYS.map((k) => [k, limit.optional()]))).optional(),
});

router.get(
  "/tiers",
  can("admin.view"),
  ah(async (req, res) => {
    const premiumUsers = await User.countDocuments(premiumNow());
    const total = await User.countDocuments({});
    res.json({
      canManage: req.role === ADMIN_ROLE,
      permissions: PERMISSIONS,
      limits: LIMITS,
      items: (await listTiers()).map((t) => ({ ...t, users: t.key === "premium" ? premiumUsers : total - premiumUsers })),
    });
  })
);

router.patch(
  "/tiers/:key",
  requireAdmin,
  ah(async (req, res) => {
    if (!TIER_KEYS.includes(req.params.key)) throw new HttpError(404, "Không có hạng tài khoản này.");
    const data = parse(tierPatchSchema, req.body);
    const set = {};
    if (data.permissions) set.permissions = data.permissions;
    for (const [k, v] of Object.entries(data.limits || {})) if (v !== undefined) set[`limits.${k}`] = v;
    await Tier.updateOne({ key: req.params.key }, { $set: set }, { upsert: true });
    invalidateTiers();
    const item = await getTier(req.params.key);
    res.locals.audit = { label: item.name };
    res.json({ item });
  })
);

// ---- activity log

// Filters: user, group (prefix such as "plan"), action, from/to (inclusive days in TZ), q (label). Newest first, numbered pages.
router.get(
  "/logs",
  can("admin.view"),
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
      retentionDays: config.logRetentionDays,
      groups: ACTION_GROUPS,
      actions: Object.entries(ACTIONS).map(([code, a]) => ({ code, ...a })),
    });
  })
);

export default router;
