import { Role } from "../models/Role.js";
import { getTier, tierKeyOf, NO_LIMITS } from "./tiers.js";

// Everything a role can be allowed to do. Viewing products, prompts, plans and resources is always allowed;
// managing accounts and roles is for admins only and never a tickable permission.
export const PERMISSIONS = [
  { key: "product.edit", label: "Thêm, sửa sản phẩm và ảnh", group: "Sản phẩm" },
  { key: "product.delete", label: "Xoá sản phẩm", group: "Sản phẩm" },
  { key: "prompt.save", label: "Lưu, sửa, xoá prompt của mình", group: "Prompt" },
  { key: "prompt.delete", label: "Xoá prompt của người khác", group: "Prompt" },
  { key: "plan.edit", label: "Tạo, sửa kế hoạch", group: "Kế hoạch" },
  { key: "plan.delete", label: "Xoá kế hoạch", group: "Kế hoạch" },
  { key: "resource.edit", label: "Thêm, sửa tài nguyên", group: "Tài nguyên" },
  { key: "resource.delete", label: "Xoá tài nguyên", group: "Tài nguyên" },
  { key: "data.import", label: "Nhập dữ liệu từ file", group: "Dữ liệu" },
  { key: "data.export", label: "Xuất dữ liệu ra file", group: "Dữ liệu" },
  { key: "admin.view", label: "Xem trang Quản trị", group: "Quản trị" },
];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
const LABELS = new Map(PERMISSIONS.map((p) => [p.key, p.label]));

export const ADMIN_ROLE = "admin";
// Given to accounts that register themselves, so it cannot be deleted (its permissions can change).
export const DEFAULT_ROLE = "member";
const ADMIN = { key: ADMIN_ROLE, name: "Quản trị viên", permissions: PERMISSION_KEYS, locked: true };

// Created once, on the first start with no roles at all.
const STARTER_ROLES = [
  { key: "editor", name: "Biên tập", permissions: PERMISSION_KEYS.filter((k) => !k.startsWith("data.")) },
  { key: DEFAULT_ROLE, name: "Thành viên", permissions: ["product.edit", "prompt.save", "resource.edit"] },
  { key: "viewer", name: "Chỉ xem", permissions: [] },
];

export async function ensureStarterRoles() {
  if (await Role.exists({})) return;
  await Role.insertMany(STARTER_ROLES);
  invalidateRoles();
}

// Every request needs its user's permissions, so roles are kept in memory for a short while.
// Changes made through this server clear it at once.
const TTL = 30 * 1000;
let cache = null;
let loadedAt = 0;

async function roleMap() {
  if (!cache || Date.now() - loadedAt > TTL) {
    const rows = await Role.find({}, { key: 1, name: 1, permissions: 1, createdAt: 1 }).sort({ createdAt: 1 }).lean();
    cache = new Map(rows.map((r) => [r.key, { key: r.key, name: r.name, permissions: r.permissions.filter((p) => LABELS.has(p)) }]));
    loadedAt = Date.now();
  }
  return cache;
}

export const invalidateRoles = () => {
  cache = null;
};

// A role that no longer exists grants nothing.
export async function getRole(key) {
  if (key === ADMIN_ROLE) return ADMIN;
  return (await roleMap()).get(key) || { key, name: "(vai trò đã xoá)", permissions: [] };
}

export const roleExists = async (key) => key === ADMIN_ROLE || (await roleMap()).has(key);

// Admin first, then the others in the order they were made.
export async function listRoles() {
  return [ADMIN, ...(await roleMap()).values()];
}

export const deniedMessage = (perm) => `Tài khoản của bạn chưa được cấp quyền “${LABELS.get(perm) || perm}”. Nhờ quản trị viên cấp quyền.`;

// What an account may do: its role's permissions plus its tier's, and the tier's limits. Admins get everything, unlimited.
export async function accessOf(user) {
  const role = await getRole(user.role || DEFAULT_ROLE);
  const tier = await getTier(tierKeyOf(user));
  if (role.key === ADMIN_ROLE) return { role, tier, permissions: PERMISSION_KEYS, limits: NO_LIMITS };
  const permissions = PERMISSION_KEYS.filter((k) => role.permissions.includes(k) || tier.permissions.includes(k));
  return { role, tier, permissions, limits: tier.limits };
}

// The account as the app sees it: who, which role and tier, and what it may do.
export async function publicUser(user) {
  const { role, tier, permissions, limits } = await accessOf(user);
  return {
    ...user.toPublic(),
    roleName: role.name,
    permissions,
    tier: { key: tier.key, name: tier.name, until: tier.key === "premium" ? user.premiumUntil || null : null, limits },
  };
}
