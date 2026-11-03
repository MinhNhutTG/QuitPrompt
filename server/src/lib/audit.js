import { ActivityLog } from "../models/ActivityLog.js";
import { User } from "../models/User.js";
import { broadcast } from "./live.js";

// Every logged action: [method, path pattern (group 1 = target id), code, Vietnamese label, group].
const RULES = [
  ["POST", /^\/api\/auth\/login$/, "auth.login", "Đăng nhập", "auth"],
  ["POST", /^\/api\/auth\/logout$/, "auth.logout", "Đăng xuất", "auth"],
  ["POST", /^\/api\/auth\/register$/, "auth.register", "Tạo tài khoản", "auth"],
  ["POST", /^\/api\/auth\/password$/, "auth.password", "Đổi mật khẩu", "auth"],
  ["POST", /^\/api\/products$/, "product.create", "Thêm sản phẩm", "product"],
  ["PATCH", /^\/api\/products\/(\w+)$/, "product.update", "Sửa sản phẩm", "product"],
  ["DELETE", /^\/api\/products\/(\w+)$/, "product.delete", "Xoá sản phẩm", "product"],
  ["POST", /^\/api\/products\/(\w+)\/images$/, "product.images.add", "Tải ảnh sản phẩm", "product"],
  ["DELETE", /^\/api\/products\/(\w+)\/images$/, "product.images.delete", "Xoá ảnh sản phẩm", "product"],
  ["POST", /^\/api\/products\/(\w+)\/cover$/, "product.cover", "Đổi ảnh bìa", "product"],
  ["POST", /^\/api\/products\/(\w+)\/scripts$/, "product.script.create", "Lưu lời đọc, mô tả video", "product"],
  ["POST", /^\/api\/products\/(\w+)\/scripts\/import$/, "product.script.import", "Nhập lời đọc từ Excel", "product"],
  ["PATCH", /^\/api\/products\/(\w+)\/scripts\/\w+$/, "product.script.update", "Sửa lời đọc, mô tả video", "product"],
  ["DELETE", /^\/api\/products\/(\w+)\/scripts\/\w+$/, "product.script.delete", "Xoá lời đọc, mô tả video", "product"],
  ["POST", /^\/api\/prompts$/, "prompt.create", "Lưu prompt", "prompt"],
  ["PATCH", /^\/api\/prompts\/(\w+)$/, "prompt.update", "Sửa prompt", "prompt"],
  ["DELETE", /^\/api\/prompts\/(\w+)$/, "prompt.delete", "Xoá prompt", "prompt"],
  ["POST", /^\/api\/plans$/, "plan.create", "Thêm kế hoạch", "plan"],
  ["PATCH", /^\/api\/plans\/(\w+)$/, "plan.update", "Sửa kế hoạch", "plan"],
  ["DELETE", /^\/api\/plans\/(\w+)$/, "plan.delete", "Xoá kế hoạch", "plan"],
  ["POST", /^\/api\/plans\/bulk-delete$/, "plan.bulk_delete", "Xoá nhiều kế hoạch", "plan"],
  ["POST", /^\/api\/plans\/(\w+)\/copy$/, "plan.copy", "Sao chép kế hoạch", "plan"],
  ["POST", /^\/api\/plans\/(\w+)\/files$/, "plan.file.add", "Tải file kế hoạch", "plan"],
  ["DELETE", /^\/api\/plans\/(\w+)\/files\/\w+$/, "plan.file.delete", "Xoá file kế hoạch", "plan"],
  ["POST", /^\/api\/plans\/(\w+)\/quickedit$/, "plan.quickedit", "Mở kế hoạch trong QuickEdit", "plan"],
  ["POST", /^\/api\/quickedit\/files$/, "plan.quickedit.final", "Gửi file từ QuickEdit", "plan"],
  ["POST", /^\/api\/resources$/, "resource.create", "Thêm tài nguyên", "resource"],
  ["PATCH", /^\/api\/resources\/(\w+)$/, "resource.update", "Sửa tài nguyên", "resource"],
  ["DELETE", /^\/api\/resources\/(\w+)$/, "resource.delete", "Xoá tài nguyên", "resource"],
  ["POST", /^\/api\/drive\/folders$/, "drive.folder", "Drive: tạo thư mục", "drive"],
  ["POST", /^\/api\/drive\/uploads$/, "drive.upload", "Drive: tải file lên", "drive"],
  ["PATCH", /^\/api\/drive\/files\/([\w-]+)$/, "drive.rename", "Drive: đổi tên", "drive"],
  ["DELETE", /^\/api\/drive\/files\/([\w-]+)$/, "drive.delete", "Drive: xoá vào thùng rác", "drive"],
  ["POST", /^\/api\/drive\/root$/, "drive.root", "Drive: chọn thư mục của team", "drive"],
  ["POST", /^\/api\/drive\/disconnect$/, "drive.disconnect", "Drive: ngắt kết nối", "drive"],
  ["PUT", /^\/api\/settings$/, "settings.update", "Đổi cài đặt", "settings"],
  ["POST", /^\/api\/transfer\/import$/, "data.import", "Nhập dữ liệu", "data"],
  ["GET", /^\/api\/transfer\/export$/, "data.export", "Xuất dữ liệu", "data"],
  ["POST", /^\/api\/admin\/users$/, "admin.user.create", "Admin: tạo thành viên", "admin"],
  ["PATCH", /^\/api\/admin\/users\/(\w+)$/, "admin.user.update", "Admin: sửa thành viên", "admin"],
  ["POST", /^\/api\/admin\/users\/(\w+)\/password$/, "admin.user.password", "Admin: đặt lại mật khẩu", "admin"],
  ["POST", /^\/api\/admin\/users\/(\w+)\/logout$/, "admin.user.logout", "Admin: đăng xuất mọi nơi", "admin"],
  ["DELETE", /^\/api\/admin\/users\/(\w+)$/, "admin.user.delete", "Admin: xoá thành viên", "admin"],
  ["POST", /^\/api\/admin\/roles$/, "admin.role.create", "Admin: tạo vai trò", "admin"],
  ["PATCH", /^\/api\/admin\/roles\/(\w+)$/, "admin.role.update", "Admin: sửa vai trò", "admin"],
  ["DELETE", /^\/api\/admin\/roles\/(\w+)$/, "admin.role.delete", "Admin: xoá vai trò", "admin"],
  ["PATCH", /^\/api\/admin\/tiers\/(\w+)$/, "admin.tier.update", "Admin: sửa hạng tài khoản", "admin"],
];

// Written directly by the auth routes, not matched from a path.
const EXTRA = [
  ["auth.login_failed", "Đăng nhập sai", "auth"],
  ["drive.connect", "Drive: kết nối", "drive"],
];

export const ACTIONS = Object.fromEntries([
  ...RULES.map(([, , code, label, group]) => [code, { label, group }]),
  ...EXTRA.map(([code, label, group]) => [code, { label, group }]),
]);

export const ACTION_GROUPS = {
  auth: "Đăng nhập",
  product: "Sản phẩm",
  prompt: "Prompt",
  plan: "Kế hoạch",
  resource: "Tài nguyên",
  drive: "Google Drive",
  settings: "Cài đặt",
  data: "Dữ liệu",
  admin: "Quản trị",
};

// Body fields never written to the log, whatever the route.
const SECRET = new Set(["password", "current", "next", "passwordHash"]);

const clip = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");

// Best guess at a readable name for what the response is about.
function labelOf(body) {
  const item = body?.item;
  if (item) return item.name || item.title || item.product?.name || item.username || "";
  if (Array.isArray(body?.items)) return body.items.map((i) => i.product?.name || i.name || i.title).filter(Boolean).join(", ");
  return body?.user?.username || "";
}

// Not told to the team: a failed login names no account (and may carry someone else's guess at a username).
const PRIVATE = new Set(["auth.login_failed"]);

// A log row as the team sees it, without IP or browser: { id, action, label, group, target, targetId, user, at }.
// names: user id → display name, when the caller already has them.
export function notice(log, names = new Map()) {
  const a = ACTIONS[log.action] || { label: log.action, group: "" };
  const id = String(log.user || "");
  return {
    id: String(log._id),
    action: log.action,
    label: a.label,
    group: a.group,
    target: log.label || "",
    targetId: log.targetId || "",
    count: log.meta?.count,
    user: { id, displayName: names.get(id) || "" },
    at: log.createdAt,
  };
}

export async function namesOf(ids) {
  const users = await User.find({ _id: { $in: [...new Set(ids.map(String))].filter(Boolean) } }, { username: 1, displayName: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), u.displayName || u.username]));
}

// Written, then told to every open page as an "activity" event.
export function writeLog(req, entry) {
  ActivityLog.create({
    ip: clip(req.ip, 60),
    ua: clip(req.get("user-agent"), 200),
    ...entry,
    label: clip(entry.label, 200),
  })
    .then(async (log) => {
      if (PRIVATE.has(log.action) || !log.user) return;
      broadcast("activity", notice(log, await namesOf([log.user])));
    })
    .catch((err) => console.error("Không ghi được nhật ký:", err.message));
}

// Logs each successful action listed in RULES once the response is sent.
// A route may set res.locals.audit = { label, userId, meta } when the response alone is not enough (deletes, login).
export function audit(req, res, next) {
  const path = req.originalUrl.split("?")[0];
  const rule = RULES.find(([method, rx]) => method === req.method && rx.test(path));
  if (!rule) return next();
  const json = res.json.bind(res);
  res.json = (body) => {
    res.locals.body = body;
    return json(body);
  };
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const extra = res.locals.audit || {};
    const user = extra.userId || req.userId;
    if (!user) return;
    const body = res.locals.body;
    const meta = { ...extra.meta };
    if (["PATCH", "PUT"].includes(req.method) && req.body && typeof req.body === "object") {
      const fields = Object.keys(req.body).filter((k) => !SECRET.has(k));
      if (fields.length) meta.fields = fields.slice(0, 20);
    }
    if (Array.isArray(body?.items) && req.method === "POST") meta.count = body.items.length;
    if (typeof body?.deleted === "number") meta.count = body.deleted;
    writeLog(req, {
      user,
      action: rule[2],
      targetId: clip(rule[1].exec(path)?.[1] || body?.item?._id?.toString() || "", 40),
      label: extra.label ?? labelOf(body),
      meta: Object.keys(meta).length ? meta : undefined,
    });
  });
  next();
}
