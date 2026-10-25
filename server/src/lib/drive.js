import crypto from "node:crypto";
import { config } from "../config.js";
import { HttpError } from "./http.js";
import { DriveLink } from "../models/DriveLink.js";
import { User } from "../models/User.js";

// Google Drive over plain REST (no SDK). One Google account holds the team folder; the server keeps its
// refresh token and acts for everyone, so members never sign in to Google.
// Full drive scope, so an existing folder (and files added to it from Google Drive itself) can be the team's folder.
// The server still keeps members inside that one folder (pathTo).
export const SCOPES = ["https://www.googleapis.com/auth/drive"];
const API = "https://www.googleapis.com/drive/v3";
export const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
export const FOLDER = "application/vnd.google-apps.folder";
// Marks a folder the app created as the team's folder, so making one again finds it instead of a duplicate.
const ROOT_MARK = { xpRoot: "1" };

export const driveConfigured = () => Boolean(config.googleClientId && config.googleClientSecret && config.googleRedirectUri);

export function requireDriveConfig(req, res, next) {
  if (!driveConfigured()) return next(new HttpError(503, "Chưa cấu hình Google Drive. Thêm GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET và GOOGLE_REDIRECT_URI trên máy chủ."));
  next();
}

// ---- refresh token at rest
const KEY = crypto.createHash("sha256").update(`drive:${config.jwtSecret}`).digest();

function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

function open(sealed) {
  const [iv, tag, body] = sealed.split(".").map((s) => Buffer.from(s, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}

// ---- OAuth
export function authUrl(state) {
  const p = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    // offline + consent: Google only hands out a refresh token when both are asked for.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.googleClientId, client_secret: config.googleClientSecret, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export async function exchangeCode(code) {
  const { ok, data } = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: config.googleRedirectUri });
  if (!ok) throw new HttpError(400, `Google từ chối kết nối: ${data.error_description || data.error || "không rõ lý do"}.`);
  if (!data.refresh_token) throw new HttpError(400, "Google không trả về refresh token. Gỡ quyền của app trong tài khoản Google rồi kết nối lại.");
  return data;
}

export async function revoke(link) {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(open(link.refreshToken))}`, { method: "POST" });
  } catch (err) {
    console.error("Drive: thu hồi token lỗi", err.message);
  }
}

// ---- the stored link and a short-lived access token, both kept in memory
let linkCache;
let access = null; // { token, until }

export async function getLink() {
  if (linkCache === undefined) linkCache = await DriveLink.findOne({ key: "team" }).lean();
  return linkCache;
}

export function forgetLink() {
  linkCache = undefined;
  access = null;
  metaCache.clear();
}

const NOT_LINKED = "Google Drive chưa được kết nối. Nhờ quản trị viên kết nối ở trang Drive.";
const EXPIRED = "Kết nối Google Drive đã hết hạn hoặc bị thu hồi. Nhờ quản trị viên kết nối lại.";

async function accessToken(force = false) {
  if (!force && access && access.until > Date.now() + 60_000) return access.token;
  const link = await getLink();
  if (!link) throw new HttpError(503, NOT_LINKED);
  let refresh;
  try {
    refresh = open(link.refreshToken);
  } catch {
    // JWT_SECRET changed since the link was made.
    throw new HttpError(503, EXPIRED);
  }
  const { ok, data } = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  if (!ok) {
    if (data.error === "invalid_grant") throw new HttpError(503, EXPIRED);
    console.error("Drive: làm mới token lỗi", data);
    throw new HttpError(502, "Không kết nối được Google Drive. Thử lại sau ít phút.");
  }
  access = { token: data.access_token, until: Date.now() + (data.expires_in || 3600) * 1000 };
  return access.token;
}

function googleError(status, data) {
  const reason = data?.error?.errors?.[0]?.reason || "";
  if (status === 404) return new HttpError(404, "Không tìm thấy file trên Drive.");
  if (reason === "storageQuotaExceeded") return new HttpError(507, "Google Drive đã hết dung lượng.");
  if (status === 429 || reason.includes("RateLimitExceeded")) return new HttpError(429, "Google Drive đang bận. Chờ một chút rồi thử lại.");
  if (status === 400) return new HttpError(400, data?.error?.message || "Google Drive từ chối yêu cầu.");
  console.error("Drive API lỗi", status, data?.error?.message);
  return new HttpError(502, "Google Drive gặp lỗi. Thử lại sau ít phút.");
}

// One Drive call. raw: return the fetch Response untouched (downloads, upload sessions).
export async function gapi(method, path, { query, body, headers, raw, base = API, token } = {}) {
  // The team's folder may sit in a shared drive; these flags are harmless for My Drive.
  if (path.startsWith("/files")) {
    query = { supportsAllDrives: "true", ...query };
    if (method === "GET" && path === "/files") query.includeItemsFromAllDrives = "true";
  }
  const url = `${base}${path}${query ? `?${new URLSearchParams(query)}` : ""}`;
  const send = async (t) =>
    fetch(url, {
      method,
      headers: { Authorization: `Bearer ${t}`, ...(body !== undefined && { "Content-Type": "application/json; charset=UTF-8" }), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  let res = await send(token || (await accessToken()));
  // The cached token may have been revoked early: refresh once and retry.
  if (res.status === 401 && !token) res = await send(await accessToken(true));
  if (res.ok) return raw ? res : res.status === 204 ? null : res.json();
  throw googleError(res.status, await res.json().catch(() => null));
}

// The connected account's email. Uses the token from the OAuth answer.
export async function accountEmail(token) {
  const about = await gapi("GET", "/about", { query: { fields: "user(emailAddress)" }, token });
  return about.user?.emailAddress || "";
}

export async function saveLink({ refreshToken, email, rootId, rootName, userId }) {
  await DriveLink.findOneAndUpdate(
    { key: "team" },
    { $set: { refreshToken: seal(refreshToken), email, rootId, rootName, connectedBy: userId } },
    { upsert: true }
  );
  forgetLink();
}

// A folder id from what an admin pasted: a Drive folder link, an "open?id=" link, or the bare id.
export function folderIdFrom(input) {
  const s = String(input || "").trim();
  const id = /\/folders\/([\w-]+)/.exec(s)?.[1] || /[?&]id=([\w-]+)/.exec(s)?.[1] || s;
  return isDriveId(id) ? id : null;
}

// An existing folder becomes the team's folder.
export async function useFolder(id) {
  const f = await gapi("GET", `/files/${id}`, { query: { fields: "id,name,mimeType,trashed" } });
  if (f.mimeType !== FOLDER) throw new HttpError(400, "Link này là một file, không phải thư mục.");
  if (f.trashed) throw new HttpError(400, "Thư mục này đang nằm trong thùng rác.");
  return setRoot(f.id, f.name);
}

// A new folder named DRIVE_FOLDER_NAME in My Drive (or the one the app made before).
export async function makeFolder() {
  const found = await gapi("GET", "/files", {
    query: { q: `mimeType='${FOLDER}' and trashed=false and appProperties has { key='xpRoot' and value='1' }`, fields: "files(id,name)", pageSize: "1" },
  });
  const f =
    found.files?.[0] ||
    (await gapi("POST", "/files", { query: { fields: "id,name" }, body: { name: config.driveFolderName, mimeType: FOLDER, appProperties: ROOT_MARK } }));
  return setRoot(f.id, f.name);
}

async function setRoot(rootId, rootName) {
  await DriveLink.updateOne({ key: "team" }, { $set: { rootId, rootName } });
  forgetLink();
  return { rootId, rootName };
}

// ---- keeping members inside the team folder
// id -> { name, parent, trashed, at }. Files are never moved by the app, so a few minutes of caching is safe.
const metaCache = new Map();
const META_TTL = 5 * 60 * 1000;

export async function metaOf(id) {
  const hit = metaCache.get(id);
  if (hit && Date.now() - hit.at < META_TTL) return hit;
  const f = await gapi("GET", `/files/${id}`, { query: { fields: "id,name,mimeType,parents,trashed" } });
  const meta = { name: f.name, mimeType: f.mimeType, parent: f.parents?.[0] || null, trashed: f.trashed, at: Date.now() };
  if (metaCache.size > 5000) metaCache.clear();
  metaCache.set(id, meta);
  return meta;
}

export const forgetMeta = (id) => metaCache.delete(id);

// Lists already tell us each file's name and folder: remember them so later checks need no extra call.
export function primeMeta(f, parent) {
  if (metaCache.size > 5000) metaCache.clear();
  metaCache.set(f.id, { name: f.name, mimeType: f.mimeType, parent, trashed: false, at: Date.now() });
}

export const isDriveId = (s) => typeof s === "string" && /^[\w-]{10,120}$/.test(s);

// Drive search strings are single-quoted.
export const quote = (s) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

// Who made a file, stored on it so the list can show it (appProperties: key + value ≤ 124 bytes).
export async function stamp(req) {
  const u = await User.findById(req.userId, { username: 1, displayName: 1 }).lean();
  return { by: String(req.userId), byName: (u?.displayName || u?.username || "").slice(0, 40) };
}

// Opens a resumable upload into parent and returns the session URL the browser PUTs the bytes to,
// so large videos never pass through (or count against) this server and its proxies.
export async function openUpload({ parent, name, mimeType, size, appProperties, origin, fields }) {
  const session = await gapi("POST", "/files", {
    base: UPLOAD_API,
    raw: true,
    query: { uploadType: "resumable", fields },
    body: { name, parents: [parent], appProperties },
    headers: {
      "X-Upload-Content-Type": mimeType || "application/octet-stream",
      // Google rejects the upload if the browser sends a different length, so the size cap holds.
      "X-Upload-Content-Length": String(size),
      // The session URL only accepts the browser's PUT (CORS) when opened for its origin.
      Origin: origin,
    },
  });
  const uploadUrl = session.headers.get("location");
  if (!uploadUrl) throw new HttpError(502, "Google Drive không mở được phiên tải lên. Thử lại.");
  return uploadUrl;
}

// To Drive's bin (restorable there for 30 days), folder content included.
export async function trash(id) {
  await gapi("PATCH", `/files/${id}`, { query: { fields: "id" }, body: { trashed: true } });
  forgetMeta(id);
}

// Path from the team folder down to id: [{ id, name }, ...]. 404 when id is outside it, in the bin, or unknown.
export async function pathTo(id) {
  const link = await getLink();
  if (!link?.rootId) throw new HttpError(503, NOT_LINKED);
  if (!isDriveId(id)) throw new HttpError(404, "Không tìm thấy file trên Drive.");
  const chain = [];
  let cur = id;
  for (let depth = 0; depth < 40; depth++) {
    if (cur === link.rootId) return [{ id: link.rootId, name: link.rootName || "Drive của team" }, ...chain.reverse()];
    const meta = await metaOf(cur);
    if (meta.trashed || !meta.parent) break;
    chain.push({ id: cur, name: meta.name });
    cur = meta.parent;
  }
  throw new HttpError(404, "Không tìm thấy file trên Drive.");
}
