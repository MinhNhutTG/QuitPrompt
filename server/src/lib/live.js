import { User } from "../models/User.js";

// Realtime to every open page with Server-Sent Events: GET /api/live keeps one response open per tab and the
// server writes events into it (chat messages, actions as they happen, who is online). One server instance, so
// the open responses are simply kept here. The browser reconnects by itself when a connection drops.

const clients = new Map(); // response → { userId, name, session }
const BEAT = 25 * 1000; // a comment this often keeps proxies from closing a quiet stream

const write = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

// Everyone with a page open, once each: [{ id, displayName }].
export function online() {
  const byId = new Map();
  for (const c of clients.values()) byId.set(c.userId, { id: c.userId, displayName: c.name });
  return [...byId.values()];
}

export function broadcast(event, data) {
  for (const res of clients.keys()) write(res, event, data);
}

const presence = () => broadcast("presence", { online: online() });

// The session stays good while its account does: not removed, not locked, not signed out everywhere.
async function stillValid(c) {
  const user = await User.findById(c.userId, { disabled: 1, sessionVersion: 1 }).lean();
  return Boolean(user && !user.disabled && (user.sessionVersion || 0) === (c.session.v || 0));
}

// After requireAuth. Sends "hello" with who is online, then events until the page goes away.
export async function connect(req, res) {
  const user = await User.findById(req.userId, { username: 1, displayName: 1 }).lean();
  // Set before the headers go out, so compression (index.js) sees the type and leaves the stream alone.
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    // Proxies such as nginx would otherwise hold events back.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  // A dropped connection retries after 3 s.
  res.write("retry: 3000\n\n");
  const me = { userId: String(req.userId), name: user?.displayName || user?.username || "", session: req.session };
  clients.set(res, me);
  write(res, "hello", { online: online() });
  presence();

  const timer = setInterval(async () => {
    try {
      if (!(await stillValid(me))) return res.end();
    } catch {
      // The database is briefly away: keep the stream, check again next beat.
    }
    res.write(": beat\n\n");
  }, BEAT);
  req.on("close", () => {
    clearInterval(timer);
    clients.delete(res);
    presence();
  });
}
