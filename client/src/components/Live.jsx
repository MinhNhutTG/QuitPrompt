import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { fmtDateTime, useClickOutside } from "../lib/util.js";
import { useToast } from "./Toast.jsx";
import { ConfirmButton } from "./ui.jsx";

// The team's realtime (server: lib/live.js, routes/live.js). One EventSource per tab on /api/live brings:
// "hello"/"presence" (who has the app open), "chat" (a message in the team room), "chat-recall" (its sender took
// it back) and "activity" (an action a member just did). Messages are kept 4 days. An action by someone else shows as a toast, refreshes the data it changed, and joins the
// bell's list. The browser reconnects by itself when the stream drops (a sleeping or restarting server).

const LiveCtx = createContext({ online: [], connected: false, chatUnread: 0, chatOpen: false, setChatOpen: () => {} });
export const useLive = () => useContext(LiveCtx);

// What each group of actions may have changed, to fetch again.
const REFRESH = {
  plan: [["plans"]],
  product: [["products"], ["product"], ["prompt-filters"]],
  prompt: [["prompts"]],
  resource: [["resources"]],
  drive: [["drive"]],
  settings: [["settings"]],
  admin: [["admin"], ["prompt-filters"]],
};

// Where an action can be looked at; deleted things have nowhere to go.
function linkOf(n) {
  if (/delete/.test(n.action)) return null;
  if (n.group === "plan") return n.targetId ? `/plans/${n.targetId}` : "/plans";
  if (n.group === "product") return n.targetId ? `/products/${n.targetId}` : "/products";
  if (n.group === "prompt") return "/saved";
  if (n.group === "resource") return "/resources";
  if (n.group === "drive") return "/drive";
  return null;
}

// "Ngọc Lan · Thêm kế hoạch: Áo thun"
const sentence = (n) => `${n.label}${n.target ? `: ${n.target}` : ""}${n.count > 1 ? ` (${n.count})` : ""}`;

const READ_KEY = (uid) => `qp.chat.read.${uid}`;
const readAt = (uid) => {
  try {
    return localStorage.getItem(READ_KEY(uid)) || "";
  } catch {
    return "";
  }
};

export function LiveProvider({ children }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [online, setOnline] = useState([]);
  const [connected, setConnected] = useState(false);
  const [chatOpen, setChatOpenState] = useState(false);
  const [lastRead, setLastRead] = useState(() => readAt(user.id));
  const open = useRef(false);

  const markRead = useCallback(() => {
    const now = new Date().toISOString();
    setLastRead(now);
    try {
      localStorage.setItem(READ_KEY(user.id), now);
    } catch {}
  }, [user.id]);
  const setChatOpen = useCallback(
    (v) => {
      open.current = v;
      setChatOpenState(v);
      if (v) markRead();
    },
    [markRead]
  );
  // Toasts move out of the open room's way (styles.css, body.chat-open).
  useEffect(() => {
    document.body.classList.toggle("chat-open", chatOpen);
    return () => document.body.classList.remove("chat-open");
  }, [chatOpen]);

  // The room's latest messages, fetched once and then kept up to date by the stream.
  const chat = useQuery({ queryKey: ["chat"], queryFn: () => api.chat(), staleTime: Infinity });

  useEffect(() => {
    const es = new EventSource("/api/live", { withCredentials: true });
    const on = (event, fn) => es.addEventListener(event, (e) => fn(JSON.parse(e.data)));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    on("hello", ({ online }) => {
      setOnline(online);
      // Anything missed while the stream was down.
      qc.invalidateQueries({ queryKey: ["chat"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    });
    on("presence", ({ online }) => setOnline(online));
    on("chat", (m) => {
      qc.setQueryData(["chat"], (old) => (old ? { ...old, items: old.items.some((x) => x.id === m.id) ? old.items : [...old.items, m] } : old));
      if (m.user.id === user.id) return;
      if (open.current) markRead();
      else toast(`${m.user.displayName}: ${m.text.slice(0, 80)}`, { tone: "info", detail: "Tin nhắn trong phòng chat", action: { label: "Mở chat", onClick: () => setChatOpen(true) } });
    });
    on("chat-recall", (m) => qc.setQueryData(["chat"], (old) => old && { ...old, items: old.items.map((x) => (x.id === m.id ? m : x)) }));
    on("activity", (n) => {
      qc.setQueryData(["notifications"], (old) => (old ? { ...old, items: [n, ...old.items.filter((x) => x.id !== n.id)].slice(0, 50) } : old));
      if (n.user.id === user.id) return;
      for (const key of REFRESH[n.group] || []) qc.invalidateQueries({ queryKey: key });
      const to = linkOf(n);
      toast(`${n.user.displayName} · ${sentence(n)}`, { tone: "info", ...(to && { action: { label: "Xem", to } }) });
    });
    return () => es.close();
  }, [qc, toast, user.id, markRead, setChatOpen]);

  const items = chat.data?.items || [];
  const chatUnread = chatOpen ? 0 : items.filter((m) => m.user.id !== user.id && !m.recalled && (!lastRead || m.at > lastRead)).length;

  return <LiveCtx.Provider value={{ online, connected, chatUnread, chatOpen, setChatOpen }}>{children}</LiveCtx.Provider>;
}

const Svg = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const BELL = "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0";
const CHAT = "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z";

// The bell: what the team did lately, newest first; the badge counts what came after this user last looked.
export function Bell({ className = "" }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: api.notifications, staleTime: Infinity });
  const seen = useMutation({
    mutationFn: api.seenNotifications,
    onSuccess: ({ seenAt }) => qc.setQueryData(["notifications"], (old) => old && { ...old, seenAt }),
  });
  const items = data?.items || [];
  const unread = items.filter((n) => n.user.id !== user.id && (!data?.seenAt || n.at > data.seenAt)).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread) seen.mutate();
  }

  return (
    <div className={`menu-wrap bell ${className}`} ref={ref}>
      <button type="button" className="icon-btn" aria-haspopup="true" aria-expanded={open} aria-label={unread ? `Thông báo, ${unread} chưa xem` : "Thông báo"} onClick={toggle}>
        <Svg d={BELL} />
        {unread > 0 && <span className="dot-count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="menu notif-menu" role="dialog" aria-label="Thông báo" onKeyDown={(e) => e.key === "Escape" && close()}>
          <div className="menu-head">
            <b>Hoạt động của team</b>
            <span className="hint">2 ngày gần nhất</span>
          </div>
          {items.length === 0 ? (
            <p className="hint notif-empty">Chưa có hoạt động nào.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => {
                const to = linkOf(n);
                const fresh = n.user.id !== user.id && data?.seenAt && n.at > data.seenAt;
                const body = (
                  <>
                    <span className="notif-who">{n.user.id === user.id ? "Bạn" : n.user.displayName || "(tài khoản đã xoá)"}</span> {sentence(n)}
                    <span className="notif-time">{fmtDateTime(n.at)}</span>
                  </>
                );
                return (
                  <li key={n.id} className={fresh ? "is-new" : ""}>
                    {to ? (
                      <Link to={to} onClick={close}>
                        {body}
                      </Link>
                    ) : (
                      <span>{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// The chat button, bottom right, and the room it opens.
export function ChatDock() {
  const { chatUnread, chatOpen, setChatOpen, online } = useLive();
  return (
    <>
      {!chatOpen && (
        <button type="button" className="chat-fab" onClick={() => setChatOpen(true)} aria-label={chatUnread ? `Chat của team, ${chatUnread} tin mới` : "Chat của team"}>
          <Svg d={CHAT} size={22} />
          {chatUnread > 0 && <span className="dot-count">{chatUnread > 99 ? "99+" : chatUnread}</span>}
        </button>
      )}
      {chatOpen && <ChatPanel online={online} onClose={() => setChatOpen(false)} />}
    </>
  );
}

function ChatPanel({ online, onClose }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error } = useQuery({ queryKey: ["chat"], queryFn: () => api.chat(), staleTime: Infinity });
  const [text, setText] = useState("");
  const [older, setOlder] = useState(false);
  const list = useRef(null);
  const atBottom = useRef(true);
  const items = data?.items || [];

  const recall = useMutation({
    mutationFn: (id) => api.recallChat(id),
    onSuccess: ({ item }) => qc.setQueryData(["chat"], (old) => old && { ...old, items: old.items.map((x) => (x.id === item.id ? item : x)) }),
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  const send = useMutation({
    mutationFn: (t) => api.sendChat(t),
    onSuccess: ({ item }) => qc.setQueryData(["chat"], (old) => (old ? { ...old, items: old.items.some((x) => x.id === item.id) ? old.items : [...old.items, item] } : old)),
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  // Follows new messages while the reader is at the end, not while they scroll back.
  useEffect(() => {
    const el = list.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  async function loadOlder() {
    if (!items.length) return;
    setOlder(true);
    try {
      const page = await api.chat(items[0].id);
      const el = list.current;
      const from = el ? el.scrollHeight - el.scrollTop : 0;
      qc.setQueryData(["chat"], (old) => ({ items: [...page.items, ...(old?.items || [])], more: page.more }));
      requestAnimationFrame(() => el && (el.scrollTop = el.scrollHeight - from));
    } catch (e) {
      toast(e.message, { tone: "danger" });
    } finally {
      setOlder(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t || send.isPending) return;
    atBottom.current = true;
    send.mutate(t, { onSuccess: () => setText("") });
  }

  const others = online.filter((o) => o.id !== user.id);
  return (
    <section className="chat-panel" role="dialog" aria-label="Chat của team" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <header className="chat-head">
        <div>
          <b>Chat của team</b>
          <span className="hint" title={online.map((o) => o.displayName).join(", ")}>
            <span className="online-dot" aria-hidden="true" />
            {others.length ? `${others.map((o) => o.displayName).slice(0, 3).join(", ")}${others.length > 3 ? ` và ${others.length - 3} người khác` : ""} đang online` : "Chỉ có bạn đang online"}
          </span>
          <span className="hint">Tin nhắn tự xoá sau 4 ngày</span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng chat">
          <Svg d="M18 6 6 18M6 6l12 12" />
        </button>
      </header>
      <div
        className="chat-list"
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {data?.more && (
          <button type="button" className="btn btn-sm btn-ghost chat-older" onClick={loadOlder} disabled={older}>
            {older ? "Đang tải..." : "Xem tin cũ hơn"}
          </button>
        )}
        {isLoading ? (
          <p className="hint">Đang tải tin nhắn...</p>
        ) : error ? (
          <p className="hint">{error.message}</p>
        ) : items.length === 0 ? (
          <p className="hint chat-empty">Chưa có tin nhắn nào. Gửi lời chào cả team!</p>
        ) : (
          items.map((m, i) => {
            const mine = m.user.id === user.id;
            const first = i === 0 || items[i - 1].user.id !== m.user.id;
            return (
              <div key={m.id} data-id={m.id} className={`chat-msg ${mine ? "is-mine" : ""} ${first ? "is-first" : ""} ${m.recalled ? "is-recalled" : ""}`}>
                {first && !mine && <span className="chat-who">{m.user.displayName}</span>}
                <div className="chat-bubble">
                  {mine && !m.recalled && (
                    <ConfirmButton className="chat-recall" confirmLabel="Thu hồi?" disabled={recall.isPending} onConfirm={() => recall.mutate(m.id)}>
                      Thu hồi
                    </ConfirmButton>
                  )}
                  <p title={fmtDateTime(m.at)}>{m.recalled ? (mine ? "Bạn đã thu hồi tin nhắn" : "Tin nhắn đã được thu hồi") : m.text}</p>
                </div>
                {first && <span className="chat-time">{fmtDateTime(m.at)}</span>}
              </div>
            );
          })
        )}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <textarea
          className="input"
          rows={1}
          maxLength={2000}
          placeholder="Nhắn cho cả team… (Enter để gửi, Shift+Enter xuống dòng)"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={!text.trim() || send.isPending}>
          Gửi
        </button>
      </form>
    </section>
  );
}
