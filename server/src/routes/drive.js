import crypto from "node:crypto";
import { Readable } from "node:stream";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { User } from "../models/User.js";
import { DriveLink } from "../models/DriveLink.js";
import { ah, parse, text, HttpError } from "../lib/http.js";
import { can, requireAdmin } from "../middleware/auth.js";
import { ADMIN_ROLE } from "../lib/permissions.js";
import { writeLog } from "../lib/audit.js";
import {
  FOLDER,
  accountEmail,
  authUrl,
  driveConfigured,
  exchangeCode,
  folderIdFrom,
  forgetLink,
  forgetMeta,
  gapi,
  getLink,
  isDriveId,
  makeFolder,
  metaOf,
  pathTo,
  primeMeta,
  requireDriveConfig,
  revoke,
  saveLink,
  UPLOAD_API,
  useFolder,
} from "../lib/drive.js";

const router = Router();

const STATE_COOKIE = "ps_drive_state";
const FIELDS = "id,name,mimeType,size,modifiedTime,hasThumbnail,appProperties";
const GOOGLE_APPS = "application/vnd.google-apps.";
// Google Docs, Sheets, Slides and Drawings have no bytes of their own: they download as Office files.
const EXPORTS = {
  "application/vnd.google-apps.document": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  "application/vnd.google-apps.spreadsheet": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  "application/vnd.google-apps.presentation": ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"],
  "application/vnd.google-apps.drawing": ["image/png", ".png"],
};

// Drive names may hold almost anything; slashes would only confuse people downloading to disk.
const name = (label) => text(label, 200, 1).refine((s) => !/[\\/]/.test(s) && s !== "." && s !== "..", `Tên không được chứa dấu / hoặc \\.`);
const driveId = z.string().refine(isDriveId, "Thư mục không hợp lệ.");

const toItem = (f) => ({
  id: f.id,
  name: f.name,
  folder: f.mimeType === FOLDER,
  mimeType: f.mimeType,
  size: f.size ? Number(f.size) : null,
  modifiedTime: f.modifiedTime,
  thumb: Boolean(f.hasThumbnail),
  by: f.appProperties?.byName || "",
  path: f.path,
});

// Drive search strings are single-quoted.
const quote = (s) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

// Who made a file, stored on it so the list can show it (appProperties: key + value ≤ 124 bytes).
async function stamp(req) {
  const u = await User.findById(req.userId, { username: 1, displayName: 1 }).lean();
  return { by: String(req.userId), byName: (u?.displayName || u?.username || "").slice(0, 40) };
}

async function linked() {
  const link = await getLink();
  if (!link) throw new HttpError(503, "Google Drive chưa được kết nối. Nhờ quản trị viên kết nối ở trang Drive.");
  if (!link.rootId) throw new HttpError(503, "Quản trị viên chưa chọn thư mục Drive cho team.");
  return link;
}

// A folder inside the team tree; returns its path.
async function folderPath(id) {
  const path = await pathTo(id);
  const link = await getLink();
  if (id !== link.rootId && (await metaOf(id)).mimeType !== FOLDER) throw new HttpError(400, "Đây không phải thư mục.");
  return path;
}

// A file or folder inside the team tree, never the top folder itself.
async function childOf(id) {
  const path = await pathTo(id);
  if (path.length < 2) throw new HttpError(400, "Không thể thay đổi thư mục gốc của team.");
  return { path, meta: await metaOf(id) };
}

const back = (res, query) => res.redirect(`${config.clientOrigin}/drive?${new URLSearchParams(query)}`);

router.get(
  "/status",
  ah(async (req, res) => {
    const link = driveConfigured() ? await getLink() : null;
    res.json({
      configured: driveConfigured(),
      connected: Boolean(link),
      email: link?.email || "",
      folder: link?.rootId ? { id: link.rootId, name: link.rootName } : null,
      connectedAt: link?.updatedAt || null,
      maxUploadMb: config.driveMaxUploadMb,
    });
  })
);

// ---- connecting the team account (admins). The browser navigates here; Google sends it back to /callback.
router.get("/connect", requireAdmin, requireDriveConfig, (req, res) => {
  const state = crypto.randomBytes(24).toString("base64url");
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/api/drive", maxAge: 10 * 60 * 1000 });
  res.redirect(authUrl(state));
});

router.get("/callback", requireDriveConfig, async (req, res) => {
  const expected = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: "/api/drive" });
  try {
    if (req.role !== ADMIN_ROLE) throw new HttpError(403, "Chỉ quản trị viên mới kết nối được Google Drive.");
    if (req.query.error) throw new HttpError(400, "Bạn đã huỷ kết nối Google Drive.");
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!expected || state.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected)))
      throw new HttpError(400, "Phiên kết nối không hợp lệ hoặc đã quá 10 phút. Bấm kết nối lại.");
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code) throw new HttpError(400, "Google không trả về mã kết nối.");
    const tokens = await exchangeCode(code);
    const email = await accountEmail(tokens.access_token);
    const old = await getLink();
    if (old && old.email !== email) await revoke(old);
    // Reconnecting the same account keeps the chosen folder; another account must choose again.
    const keep = old?.email === email;
    await saveLink({ refreshToken: tokens.refresh_token, email, rootId: keep ? old.rootId : "", rootName: keep ? old.rootName : "", userId: req.userId });
    writeLog(req, { user: req.userId, action: "drive.connect", label: email });
    back(res, { connected: "1" });
  } catch (err) {
    if (!(err instanceof HttpError)) console.error("Drive: kết nối lỗi", err);
    back(res, { error: err instanceof HttpError ? err.message : "Không kết nối được Google Drive. Thử lại sau." });
  }
});

// Files stay in Google Drive; the app just stops using the account.
router.post(
  "/disconnect",
  requireAdmin,
  ah(async (req, res) => {
    const link = await getLink();
    if (link) await revoke(link);
    await DriveLink.deleteOne({ key: "team" });
    forgetLink();
    res.locals.audit = { label: link?.email || "" };
    res.json({ ok: true });
  })
);

// The team's folder: an existing Drive folder from its link, or { create: true } for a new one.
router.post(
  "/root",
  requireAdmin,
  ah(async (req, res) => {
    if (!(await getLink())) throw new HttpError(503, "Google Drive chưa được kết nối.");
    const data = parse(z.object({ folder: z.string().max(500).optional(), create: z.boolean().optional() }), req.body);
    let root;
    if (data.create) root = await makeFolder();
    else {
      const id = folderIdFrom(data.folder);
      if (!id) throw new HttpError(400, "Dán link thư mục Google Drive (dạng https://drive.google.com/drive/folders/...).");
      root = await useFolder(id);
    }
    res.locals.audit = { label: root.rootName };
    res.json({ folder: { id: root.rootId, name: root.rootName } });
  })
);

// ---- browsing: one folder's content, or a search over the whole team tree
router.get(
  "/files",
  ah(async (req, res) => {
    const link = await linked();
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const pageToken = typeof req.query.pageToken === "string" ? req.query.pageToken.slice(0, 500) : "";

    if (q) {
      const found = await gapi("GET", "/files", {
        query: {
          q: `name contains ${quote(q)} and trashed=false`,
          fields: `files(${FIELDS},parents)`,
          pageSize: "60",
          orderBy: "folder,modifiedTime desc",
          corpora: "allDrives",
        },
      });
      // Drive cannot search one folder tree, so the whole account is searched and anything outside the team folder dropped.
      const items = [];
      for (const f of found.files || []) {
        const parent = f.parents?.[0];
        if (!parent) continue;
        try {
          const path = await pathTo(parent);
          primeMeta(f, parent);
          items.push(toItem({ ...f, path: path.map((p) => p.name).join(" / ") }));
        } catch {
          /* outside the team folder */
        }
      }
      return res.json({ folder: null, path: [], items, nextPageToken: null });
    }

    const folder = typeof req.query.folder === "string" && req.query.folder ? req.query.folder : link.rootId;
    const path = await folderPath(folder);
    const list = await gapi("GET", "/files", {
      query: {
        q: `${quote(folder)} in parents and trashed=false`,
        fields: `nextPageToken,files(${FIELDS})`,
        orderBy: "folder,name_natural",
        pageSize: "100",
        ...(pageToken && { pageToken }),
      },
    });
    for (const f of list.files || []) primeMeta(f, folder);
    res.json({ folder: path[path.length - 1], path, items: (list.files || []).map(toItem), nextPageToken: list.nextPageToken || null });
  })
);

router.post(
  "/folders",
  can("drive.edit"),
  ah(async (req, res) => {
    await linked();
    const data = parse(z.object({ parent: driveId, name: name("tên thư mục") }), req.body);
    await folderPath(data.parent);
    const f = await gapi("POST", "/files", {
      query: { fields: FIELDS },
      body: { name: data.name, mimeType: FOLDER, parents: [data.parent], appProperties: await stamp(req) },
    });
    primeMeta(f, data.parent);
    res.status(201).json({ item: toItem(f) });
  })
);

// The browser sends the bytes straight to Google: the server only opens a resumable upload session for it,
// so large videos never pass through (or count against) this server and its proxies.
router.post(
  "/uploads",
  can("drive.edit"),
  ah(async (req, res) => {
    await linked();
    const max = config.driveMaxUploadMb;
    const data = parse(
      z.object({
        parent: driveId,
        name: name("tên file"),
        mimeType: z.string().trim().max(200).regex(/^[\w.+-]+\/[\w.+-]+$/, "Loại file không hợp lệ.").or(z.literal("")).default(""),
        size: z.number({ invalid_type_error: "Dung lượng file không hợp lệ." }).int().min(0).max(max * 1024 * 1024, `Mỗi file tối đa ${max} MB.`),
      }),
      req.body
    );
    await folderPath(data.parent);
    const origin = req.get("origin") || config.clientOrigin || new URL(config.googleRedirectUri).origin;
    const session = await gapi("POST", "/files", {
      base: UPLOAD_API,
      raw: true,
      query: { uploadType: "resumable", fields: FIELDS },
      body: { name: data.name, parents: [data.parent], appProperties: await stamp(req) },
      headers: {
        "X-Upload-Content-Type": data.mimeType || "application/octet-stream",
        // Google rejects the upload if the browser sends a different length, so the size cap holds.
        "X-Upload-Content-Length": String(data.size),
        // The session URL only accepts the browser's PUT (CORS) when opened for its origin.
        Origin: origin,
      },
    });
    const uploadUrl = session.headers.get("location");
    if (!uploadUrl) throw new HttpError(502, "Google Drive không mở được phiên tải lên. Thử lại.");
    res.locals.audit = { label: data.name };
    res.status(201).json({ uploadUrl });
  })
);

router.patch(
  "/files/:id",
  can("drive.edit"),
  ah(async (req, res) => {
    await linked();
    const data = parse(z.object({ name: name("tên") }), req.body);
    const { path } = await childOf(req.params.id);
    const f = await gapi("PATCH", `/files/${req.params.id}`, { query: { fields: FIELDS }, body: { name: data.name } });
    forgetMeta(req.params.id);
    primeMeta(f, path[path.length - 2].id);
    res.json({ item: toItem(f) });
  })
);

// To Drive's bin (restorable there for 30 days), folder content included.
router.delete(
  "/files/:id",
  can("drive.delete"),
  ah(async (req, res) => {
    await linked();
    const { meta } = await childOf(req.params.id);
    await gapi("PATCH", `/files/${req.params.id}`, { query: { fields: "id" }, body: { trashed: true } });
    forgetMeta(req.params.id);
    res.locals.audit = { label: meta.name };
    res.json({ ok: true });
  })
);

// Streams from Google to the browser. A plain link (cookie auth), so the browser shows its own download progress.
router.get(
  "/files/:id/download",
  ah(async (req, res) => {
    await linked();
    const { meta } = await childOf(req.params.id);
    if (meta.mimeType === FOLDER) throw new HttpError(400, "Không tải được cả thư mục. Mở thư mục rồi tải từng file.");
    const exp = EXPORTS[meta.mimeType];
    if (!exp && meta.mimeType.startsWith(GOOGLE_APPS)) throw new HttpError(400, "Loại file này chỉ mở được trong Google Drive.");
    const up = exp
      ? await gapi("GET", `/files/${req.params.id}/export`, { query: { mimeType: exp[0] }, raw: true })
      : await gapi("GET", `/files/${req.params.id}`, { query: { alt: "media" }, raw: true });
    const fileName = exp && !meta.name.toLowerCase().endsWith(exp[1]) ? meta.name + exp[1] : meta.name;
    res.setHeader("Content-Type", up.headers.get("content-type") || "application/octet-stream");
    const len = up.headers.get("content-length");
    if (len) res.setHeader("Content-Length", len);
    const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    const body = Readable.fromWeb(up.body);
    req.on("close", () => body.destroy());
    body.on("error", () => res.destroy());
    body.pipe(res);
  })
);

// Drive's thumbnail links need the token and refuse CORS, so they come through here.
router.get(
  "/files/:id/thumb",
  ah(async (req, res) => {
    await linked();
    await childOf(req.params.id);
    const size = Math.min(Math.max(Number(req.query.s) || 320, 64), 1600);
    const f = await gapi("GET", `/files/${req.params.id}`, { query: { fields: "thumbnailLink" } });
    if (!f.thumbnailLink) throw new HttpError(404, "File này không có ảnh xem trước.");
    const up = await gapi("GET", "", { base: f.thumbnailLink.replace(/=s\d+$/, `=s${size}`), raw: true });
    res.setHeader("Content-Type", up.headers.get("content-type") || "image/jpeg");
    // Overrides the API-wide no-store: thumbnails are safe to keep in this browser for a while.
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(Buffer.from(await up.arrayBuffer()));
  })
);

export default router;
