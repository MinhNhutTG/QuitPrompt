export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const NETWORK = "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
const WAKING = "Máy chủ đang khởi động, chờ khoảng 1 phút rồi thử lại.";

let unauthorized = null;
// AuthProvider registers here: any 401 clears the cache and returns to the login screen.
export function onUnauthorized(fn) {
  unauthorized = fn;
  return () => {
    if (unauthorized === fn) unauthorized = null;
  };
}

function fail(status, data, notify401) {
  if (status === 401 && notify401) unauthorized?.();
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
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
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
  createPrompt: (body) => request("POST", "/prompts", body),
  updatePrompt: (id, body) => request("PATCH", `/prompts/${id}`, body),
  deletePrompt: (id) => request("DELETE", `/prompts/${id}`),

  settings: () => request("GET", "/settings"),
  saveSettings: (body) => request("PUT", "/settings", body),

  importData: (body) => request("POST", "/transfer/import", body),
  exportUrl: "/api/transfer/export",
};
