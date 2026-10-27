import { config } from "./config.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { connectDb, dbUp } from "./db.js";
import { HttpError } from "./lib/http.js";
import { requireAuth, requireHandoff } from "./middleware/auth.js";
import { audit } from "./lib/audit.js";
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import promptRoutes from "./routes/prompts.js";
import planRoutes, { quickeditRoutes } from "./routes/plans.js";
import resourceRoutes from "./routes/resources.js";
import settingsRoutes from "./routes/settings.js";
import transferRoutes from "./routes/transfer.js";
import adminRoutes from "./routes/admin.js";
import driveRoutes from "./routes/drive.js";
import liveRoutes from "./routes/live.js";
import { ActivityLog } from "./models/ActivityLog.js";
import { ensureStarterRoles } from "./lib/permissions.js";
import { ensureTiers } from "./lib/tiers.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy); // needed for rate limiting by the real client IP

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        // Drive uploads go from the browser straight to Google.
        connectSrc: ["'self'", "https://www.googleapis.com"],
        scriptSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
// An event stream (GET /api/live) must reach the browser as it is written, never held back to compress. Asked
// when the headers go out, so by its type: by then req.path is the router's own, not /api/live.
const eventStream = (res) => String(res.getHeader("Content-Type") || "").startsWith("text/event-stream");
app.use(compression({ filter: (req, res) => !eventStream(res) && compression.filter(req, res) }));
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

if (config.clientOrigin) {
  // Only when the frontend is served from another domain.
  app.use("/api", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", config.clientOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
}

app.get("/api/health", (req, res) => {
  const up = dbUp();
  res.status(up ? 200 : 503).json({ ok: up, db: up ? "up" : "down" });
});

// API answers hold private data: browsers and proxies must not keep them.
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// CSRF: every change must carry this header. A page on another site can submit a form with the user's cookie,
// but cannot add a custom header without passing CORS, which only CLIENT_ORIGIN does.
app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.get("x-requested-with") === "fetch") return next();
  next(new HttpError(403, "Yêu cầu không hợp lệ. Tải lại trang rồi thử lại."));
});

// A ceiling per IP for the whole API, well above normal use; logins have their own stricter limit.
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Bạn thao tác quá nhanh. Chờ một phút rồi thử lại." },
  })
);

// Without this, Mongoose buffers queries until they time out and the user sees a vague 500.
app.use("/api", (req, res, next) =>
  dbUp() ? next() : next(new HttpError(503, "Máy chủ chưa kết nối được cơ sở dữ liệu. Chờ một chút rồi thử lại."))
);

// Writes the activity log for every action it knows, after the response is sent.
app.use("/api", audit);

app.use("/api/auth", authRoutes);
app.use("/api/products", requireAuth, productRoutes);
app.use("/api/prompts", requireAuth, promptRoutes);
app.use("/api/plans", requireAuth, planRoutes);
// QuickEdit, the desktop editor, with the token of one plan (see routes/plans.js).
app.use("/api/quickedit", requireHandoff, quickeditRoutes);
app.use("/api/resources", requireAuth, resourceRoutes);
app.use("/api/settings", requireAuth, settingsRoutes);
app.use("/api/transfer", requireAuth, transferRoutes);
app.use("/api/drive", requireAuth, driveRoutes);
// Realtime: the event stream, the team chat and the notifications feed (routes/live.js).
app.use("/api", liveRoutes);
// Each route checks its own permission: admin.view to look, an admin to change accounts and roles.
app.use("/api/admin", requireAuth, adminRoutes);
app.use("/api", (req, res, next) => next(new HttpError(404, "Không có đường dẫn API này.")));

// ---- React build (same origin, so the session cookie just works)
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
if (fs.existsSync(dist)) {
  app.use(
    "/assets",
    express.static(path.join(dist, "assets"), { immutable: true, maxAge: "1y", fallthrough: false })
  );
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get("*", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(dist, "index.html"));
  });
} else if (!config.isProd) {
  app.get("/", (req, res) => res.type("text").send("API đang chạy. Mở giao diện ở http://localhost:5173"));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Dữ liệu gửi lên quá lớn (tối đa 5 MB)." });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Dữ liệu gửi lên không phải JSON hợp lệ." });
  if (err.name === "CastError") return res.status(400).json({ error: "Dữ liệu gửi lên không hợp lệ." });
  if (err.name === "ValidationError") {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({ error: first?.message || "Dữ liệu không hợp lệ." });
  }
  const status = err instanceof HttpError ? err.status : err.status === 404 ? 404 : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Máy chủ gặp lỗi. Thử lại sau ít phút." : err.message });
});

app.listen(config.port, () => console.log(`Xưởng Prompt: http://localhost:${config.port}`));
// An existing TTL index keeps its old lifetime until rebuilt, so bring it in line with LOG_RETENTION_DAYS.
connectDb(config.mongoUri).then(() =>
  Promise.all([
    ActivityLog.syncIndexes().catch((err) => console.error("Không cập nhật được chỉ mục nhật ký:", err.message)),
    ensureStarterRoles().catch((err) => console.error("Không tạo được vai trò mặc định:", err.message)),
    ensureTiers().catch((err) => console.error("Không tạo được hạng tài khoản:", err.message)),
  ])
);
