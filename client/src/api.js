export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const NETWORK = "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
const WAKING = "Máy chủ đang khởi động, chờ khoảng 1 phút rồi thử lại.";

let unauthorized = null;
let forbidden = null;
// AuthProvider registers here: any 401 clears the cache and returns to the login screen.
export function onUnauthorized(fn) {
  unauthorized = fn;
  return () => {
    if (unauthorized === fn) unauthorized = null;
  };
}

// AuthProvider registers here too: a 403 may mean an admin just changed this account's permissions.
export function onForbidden(fn) {
  forbidden = fn;
  return () => {
    if (forbidden === fn) forbidden = null;
  };
}

function fail(status, data, notify401) {
  if (status === 401 && notify401) unauthorized?.();
  if (status === 403 && notify401) forbidden?.();
  const msg = data?.error || (status >= 502 ? WAKING : `Có lỗi xảy ra (mã ${status}). Thử lại sau.`);
  return new ApiError(status, msg);
}

const parseJson = (text) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

async function request(method, path, body, { notify401 = true } = {}) {
  let res;
  try {
    res = await fetch("/api" + path, {
      method,
      credentials: "include",
      // The server refuses changes without X-Requested-With (CSRF guard).
      headers: { "X-Requested-With": "fetch", ...(body !== undefined && { "Content-Type": "application/json" }) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, NETWORK);
  }
  const data = parseJson(await res.text());
  if (!res.ok) throw fail(res.status, data, notify401);
  return data;
}

const qs = (params = {}) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
  return s ? "?" + s : "";
};

// XHR instead of fetch: fetch cannot report upload progress.
function uploadImage(productId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/products/${productId}/images`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-Requested-With", "fetch");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      const data = parseJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(fail(xhr.status, data, true));
    };
    xhr.onerror = () => reject(new ApiError(0, NETWORK));
    const fd = new FormData();
    fd.append("images", file, file.name);
    xhr.send(fd);
  });
}

// Two steps: the server opens a Google upload session, then the file goes straight from the browser to Google.
async function driveUpload(parent, file, onProgress) {
  const { uploadUrl } = await request("POST", "/drive/uploads", { parent, name: file.name, mimeType: file.type || "", size: file.size });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(parseJson(xhr.responseText));
      else reject(new ApiError(xhr.status, `Google Drive không nhận file (mã ${xhr.status}). Thử lại.`));
    };
    xhr.onerror = () => reject(new ApiError(0, NETWORK));
    xhr.send(file);
  });
}

export const api = {
  authConfig: () => request("GET", "/auth/config"),
  me: () => request("GET", "/auth/me", undefined, { notify401: false }),
  login: (body) => request("POST", "/auth/login", body, { notify401: false }),
  register: (body) => request("POST", "/auth/register", body, { notify401: false }),
  logout: () => request("POST", "/auth/logout", undefined, { notify401: false }),
  changePassword: (body) => request("POST", "/auth/password", body),

  products: (params) => request("GET", "/products" + qs(params)),
  product: (id) => request("GET", `/products/${id}`),
  createProduct: (body) => request("POST", "/products", body),
  updateProduct: (id, body) => request("PATCH", `/products/${id}`, body),
  deleteProduct: (id) => request("DELETE", `/products/${id}`),
  deleteImage: (id, publicId) => request("DELETE", `/products/${id}/images` + qs({ publicId })),
  setCover: (id, publicId) => request("POST", `/products/${id}/cover`, { publicId }),
  uploadImage,

  prompts: (params) => request("GET", "/prompts" + qs(params)),
  promptFilters: () => request("GET", "/prompts/filters"),

  plans: (params) => request("GET", "/plans" + qs(params)),
  createPlans: (body) => request("POST", "/plans", body),
  updatePlan: (id, body) => request("PATCH", `/plans/${id}`, body),
  deletePlan: (id) => request("DELETE", `/plans/${id}`),
  deletePlans: (ids) => request("POST", "/plans/bulk-delete", { ids }),

  resources: () => request("GET", "/resources"),
  createResource: (body) => request("POST", "/resources", body),
  updateResource: (id, body) => request("PATCH", `/resources/${id}`, body),
  deleteResource: (id) => request("DELETE", `/resources/${id}`),

  createPrompt: (body) => request("POST", "/prompts", body),
  updatePrompt: (id, body) => request("PATCH", `/prompts/${id}`, body),
  deletePrompt: (id) => request("DELETE", `/prompts/${id}`),

  adminStats: (params) => request("GET", "/admin/stats" + qs(params)),
  adminUsers: () => request("GET", "/admin/users"),
  adminCreateUser: (body) => request("POST", "/admin/users", body),
  adminUpdateUser: (id, body) => request("PATCH", `/admin/users/${id}`, body),
  adminResetPassword: (id, password) => request("POST", `/admin/users/${id}/password`, { password }),
  adminLogoutUser: (id) => request("POST", `/admin/users/${id}/logout`),
  adminDeleteUser: (id) => request("DELETE", `/admin/users/${id}`),
  adminLogs: (params) => request("GET", "/admin/logs" + qs(params)),
  adminRoles: () => request("GET", "/admin/roles"),
  adminCreateRole: (body) => request("POST", "/admin/roles", body),
  adminUpdateRole: (key, body) => request("PATCH", `/admin/roles/${key}`, body),
  adminDeleteRole: (key) => request("DELETE", `/admin/roles/${key}`),
  adminTiers: () => request("GET", "/admin/tiers"),
  adminUpdateTier: (key, body) => request("PATCH", `/admin/tiers/${key}`, body),

  driveStatus: () => request("GET", "/drive/status"),
  driveFiles: (params) => request("GET", "/drive/files" + qs(params)),
  driveCreateFolder: (body) => request("POST", "/drive/folders", body),
  driveRename: (id, name) => request("PATCH", `/drive/files/${id}`, { name }),
  driveDelete: (id) => request("DELETE", `/drive/files/${id}`),
  driveDisconnect: () => request("POST", "/drive/disconnect"),
  driveSetRoot: (body) => request("POST", "/drive/root", body),
  driveUpload,
  // Plain links: the browser navigates (connect) or downloads with the session cookie.
  driveConnectUrl: "/api/drive/connect",
  driveDownloadUrl: (id) => `/api/drive/files/${id}/download`,
  driveThumbUrl: (id, size) => `/api/drive/files/${id}/thumb?s=${size}`,

  settings: () => request("GET", "/settings"),
  saveSettings: (body) => request("PUT", "/settings", body),

  importData: (body) => request("POST", "/transfer/import", body),
  exportUrl: "/api/transfer/export",
};
