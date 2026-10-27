import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { ah, parse } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";
import { connect, broadcast } from "../lib/live.js";
import { notice, namesOf } from "../lib/audit.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { ChatMessage } from "../models/ChatMessage.js";
import { User } from "../models/User.js";

// The team's realtime: the event stream, the one chat room, and the feed of what members just did. Mounted on
// /api itself, so each route signs in on its own and any other path falls through to the next routes.
const router = Router();

router.get("/live", requireAuth, ah(connect));

// ---- chat: one room for the whole team

const PAGE = 50;

const message = (m, names) => ({ id: String(m._id), user: { id: String(m.user), displayName: names.get(String(m.user)) || "(tài khoản đã xoá)" }, text: m.text, at: m.createdAt });

// The newest messages, oldest first; ?before=<id> for the page before that message.
router.get(
  "/chat",
  requireAuth,
  ah(async (req, res) => {
    const before = typeof req.query.before === "string" && /^[a-f0-9]{24}$/.test(req.query.before) ? req.query.before : null;
    const rows = await ChatMessage.find(before ? { _id: { $lt: before } } : {})
      .sort({ _id: -1 })
      .limit(PAGE + 1)
      .lean();
    const more = rows.length > PAGE;
    const page = rows.slice(0, PAGE).reverse();
    const names = await namesOf(page.map((m) => m.user));
    res.json({ items: page.map((m) => message(m, names)), more });
  })
);

// A burst of messages from one account, not a conversation.
const chatLimit = rateLimit({
  windowMs: 10 * 1000,
  limit: 15,
  keyGenerator: (req) => req.userId,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Bạn gửi tin nhắn quá nhanh. Chờ vài giây rồi gửi tiếp." },
});

const sendSchema = z.object({
  text: z.string({ required_error: "Chưa có nội dung tin nhắn." }).trim().min(1, "Chưa có nội dung tin nhắn.").max(2000, "Mỗi tin nhắn tối đa 2000 ký tự."),
});

router.post(
  "/chat",
  requireAuth,
  chatLimit,
  ah(async (req, res) => {
    const { text } = parse(sendSchema, req.body);
    const m = await ChatMessage.create({ user: req.userId, text });
    const item = message(m, await namesOf([req.userId]));
    broadcast("chat", item);
    res.status(201).json({ item });
  })
);

// ---- notifications: the activity log as the team sees it

// The latest actions of everyone, newest first, and when this user last looked ({ items, seenAt }).
router.get(
  "/notifications",
  requireAuth,
  ah(async (req, res) => {
    const [rows, me] = await Promise.all([
      ActivityLog.find({ user: { $ne: null }, action: { $ne: "auth.login_failed" } }, { ip: 0, ua: 0 })
        .sort({ createdAt: -1 })
        .limit(PAGE)
        .lean(),
      User.findById(req.userId, { notifSeenAt: 1 }).lean(),
    ]);
    const names = await namesOf(rows.map((r) => r.user));
    res.json({ items: rows.map((r) => notice(r, names)), seenAt: me?.notifSeenAt || null });
  })
);

router.post(
  "/notifications/seen",
  requireAuth,
  ah(async (req, res) => {
    const seenAt = new Date();
    await User.updateOne({ _id: req.userId }, { $set: { notifSeenAt: seenAt } });
    res.json({ seenAt });
  })
);

export default router;
