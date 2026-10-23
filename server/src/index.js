import { config } from "./config.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { connectDb, dbUp } from "./db.js";
import { HttpError } from "./lib/http.js";
import { requireAuth, requireAdmin } from "./middleware/auth.js";
import { audit } from "./lib/audit.js";
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import promptRoutes from "./routes/prompts.js";
import planRoutes from "./routes/plans.js";
import resourceRoutes from "./routes/resources.js";
import settingsRoutes from "./routes/settings.js";
import transferRoutes from "./routes/transfer.js";
import adminRoutes from "./routes/admin.js";

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
        connectSrc: ["'self'"],
        scriptSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

if (config.clientOrigin) {
  // Only when the frontend is served from another domain.
  app.use("/api", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", config.clientOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
}

app.get("/api/health", (req, res) => {
  const up = dbUp();
  res.status(up ? 200 : 503).json({ ok: up, db: up ? "up" : "down" });
});

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
app.use("/api/resources", requireAuth, resourceRoutes);
app.use("/api/settings", requireAuth, settingsRoutes);
app.use("/api/transfer", requireAuth, transferRoutes);
app.use("/api/admin", requireAuth, requireAdmin, adminRoutes);
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
  if (err.name === "ValidationError") {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({ error: first?.message || "Dữ liệu không hợp lệ." });
  }
  const status = err instanceof HttpError ? err.status : err.status === 404 ? 404 : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Máy chủ gặp lỗi. Thử lại sau ít phút." : err.message });
});

app.listen(config.port, () => console.log(`Xưởng Prompt: http://localhost:${config.port}`));
connectDb(config.mongoUri);
