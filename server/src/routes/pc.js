import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { PcAgent } from "../models/PcAgent.js";
import { ah, parse, text, HttpError } from "../lib/http.js";
import { can, requireAdmin } from "../middleware/auth.js";

// Tắt máy tính từ xa (tài liệu 15). One computer runs tools/pc-agent: it holds a request open on
// GET /api/agent/poll (long polling) and gets the command the moment an admin presses the button.

const HOLD_MS = 25 * 1000; // how long one poll waits for a command
const ONLINE_MS = 45 * 1000; // seen within this: "đang bật"
const COMMAND_TTL = 2 * 60 * 1000; // a command not picked up by then is dropped, never run later
export const DELAYS = [1, 5, 15, 30, 60]; // minutes

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const online = (doc) => Boolean(doc?.lastSeenAt && Date.now() - new Date(doc.lastSeenAt) < ONLINE_MS);

// Polls waiting for a command (one server instance, so kept in memory).
const waiters = new Set();
const wake = () => waiters.forEach((w) => w());

// A command not picked up in time is dropped; one picked up but never answered is reported as failed.
function dropStale(doc) {
  const c = doc.command;
  if (!c || Date.now() - new Date(c.at) <= COMMAND_TTL) return;
  if (c.sentAt) doc.result = { id: c.id, kind: c.kind, ok: false, message: "Máy đã nhận lệnh nhưng không trả lời", at: new Date() };
  doc.command = null;
}

// Past the moment Windows was to turn off, the shutdown is over (or the computer would not be here to say so).
function settle(doc) {
  if (doc.shutdownAt && Date.now() > new Date(doc.shutdownAt).getTime() + 60 * 1000) doc.shutdownAt = null;
}

const publicState = (doc) => {
  if (!doc) return { paired: false, delays: DELAYS };
  settle(doc);
  dropStale(doc);
  return {
    paired: true,
    delays: DELAYS,
    name: doc.name,
    pairedAt: doc.pairedAt,
    online: online(doc),
    lastSeenAt: doc.lastSeenAt,
    // Waiting for the computer to pick it up or answer.
    pending: doc.command ? { kind: doc.command.kind, delaySec: doc.command.delaySec, at: doc.command.at, sent: Boolean(doc.command.sentAt) } : null,
    shutdownAt: doc.shutdownAt,
    result: doc.result,
  };
};

// ---- Quản trị → Máy tính

export const pcAdminRoutes = Router();

pcAdminRoutes.get(
  "/",
  can("admin.view"),
  ah(async (req, res) => {
    res.json(publicState(await PcAgent.findOne()));
  })
);

// A new token for the computer, shown once. Pairing again replaces the old token (the old program stops working).
pcAdminRoutes.post(
  "/pair",
  requireAdmin,
  ah(async (req, res) => {
    const token = "pc_" + crypto.randomBytes(32).toString("base64url");
    await PcAgent.deleteMany({});
    await PcAgent.create({ tokenHash: hash(token), pairedBy: req.userId });
    wake();
    res.status(201).json({ token, ...publicState(await PcAgent.findOne()) });
  })
);

pcAdminRoutes.delete(
  "/",
  requireAdmin,
  ah(async (req, res) => {
    await PcAgent.deleteMany({});
    wake();
    res.json(publicState(null));
  })
);

async function order(req, kind, delaySec) {
  const doc = await PcAgent.findOne();
  if (!doc) throw new HttpError(400, "Chưa kết nối máy tính nào.");
  if (!online(doc)) throw new HttpError(409, "Máy tính đang không kết nối (đã tắt hoặc mất mạng), nên không gửi lệnh.");
  doc.command = { id: crypto.randomUUID(), kind, delaySec, by: req.userId, at: new Date(), sentAt: null };
  await doc.save();
  wake();
  return doc;
}

pcAdminRoutes.post(
  "/shutdown",
  requireAdmin,
  ah(async (req, res) => {
    const { minutes } = parse(
      z.object({ minutes: z.number({ required_error: "Chưa chọn thời gian." }).refine((m) => DELAYS.includes(m), "Thời gian chờ không hợp lệ.") }),
      req.body
    );
    const doc = await order(req, "shutdown", minutes * 60);
    res.locals.audit = { label: `${doc.name || "máy tính"}, sau ${minutes} phút` };
    res.json(publicState(doc));
  })
);

pcAdminRoutes.post(
  "/cancel",
  requireAdmin,
  ah(async (req, res) => {
    const doc = await order(req, "cancel", 0);
    res.locals.audit = { label: doc.name || "máy tính" };
    res.json(publicState(doc));
  })
);

// ---- the program on the computer: "Authorization: Bearer pc_..."

export const agentRoutes = Router();

async function agentDoc(req) {
  const token = /^Bearer (pc_[\w-]{20,100})$/.exec(req.get("authorization") || "")?.[1];
  const doc = token && (await PcAgent.findOne({ tokenHash: hash(token) }));
  if (!doc) throw new HttpError(401, "Mã kết nối không đúng hoặc đã bị thay. Tạo mã mới ở Quản trị → Máy tính.");
  return doc;
}

const nameSchema = z.object({ name: text("tên máy", 80).optional() });

// Answers at once with a waiting command, else holds the request up to HOLD_MS for one.
agentRoutes.get(
  "/poll",
  ah(async (req, res) => {
    const { name } = parse(nameSchema, { name: typeof req.query.name === "string" ? req.query.name : undefined });
    const doc = await agentDoc(req);
    const id = doc._id;
    const take = async () => {
      const d = await PcAgent.findById(id);
      if (!d) return { gone: true };
      dropStale(d);
      d.lastSeenAt = new Date();
      if (name) d.name = name;
      let command = null;
      if (d.command && !d.command.sentAt) {
        d.command.sentAt = new Date();
        command = { id: d.command.id, kind: d.command.kind, delaySec: d.command.delaySec };
      }
      await d.save();
      return { command };
    };

    const first = await take();
    // wait=0: answer at once (the program's "test" command).
    if (first.gone || first.command || req.query.wait === "0") return res.json(first);

    let done = false;
    let wakeUp;
    const finish = async () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      waiters.delete(wakeUp);
      try {
        if (!res.writableEnded && !req.socket.destroyed) res.json(await take());
      } catch (err) {
        if (!res.headersSent) res.status(500).json({ error: "Máy chủ gặp lỗi." });
        console.error("Máy tính: lỗi khi chờ lệnh", err.message);
      }
    };
    wakeUp = () => finish();
    const timer = setTimeout(finish, HOLD_MS);
    waiters.add(wakeUp);
    req.on("close", () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      waiters.delete(wakeUp);
    });
  })
);

// The computer ran (or failed) a command.
agentRoutes.post(
  "/ack",
  ah(async (req, res) => {
    const data = parse(z.object({ id: z.string().max(64), ok: z.boolean(), message: z.string().max(300).optional().default("") }), req.body);
    const doc = await agentDoc(req);
    const c = doc.command;
    if (!c || c.id !== data.id) return res.json({ ok: true }); // already replaced by a newer command
    doc.result = { id: c.id, kind: c.kind, ok: data.ok, message: data.message, at: new Date() };
    if (data.ok) doc.shutdownAt = c.kind === "shutdown" ? new Date(Date.now() + c.delaySec * 1000) : null;
    doc.command = null;
    doc.lastSeenAt = new Date();
    await doc.save();
    res.json({ ok: true });
  })
);
