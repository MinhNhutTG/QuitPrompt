import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

// At most this many on screen; the oldest leaves first.
const MAX = 3;

const ICONS = {
  ok: "M20 6 9 17l-5-5",
  danger: "M12 8v5M12 16.5h.01",
  info: "M12 11v5M12 7.5h.01",
};

// toast("Đã lưu") · toast("Lỗi...", { tone: "danger" }) · toast("Đã lưu", { action: { label: "Xem", to: "/..." } })
// An action may run code instead of navigating: { label, onClick }.
// Options: tone ok | danger | info, detail (second line), action, duration (ms).
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback((msg, opts = {}) => {
    const tone = opts.tone || "ok";
    const id = ++seq.current;
    // Errors stay longer: they usually need reading.
    const duration = opts.duration || (tone === "danger" ? 6000 : opts.action ? 5000 : 3000);
    setToasts((all) => [...all.filter((t) => t.msg !== msg || t.tone !== tone), { id, msg, tone, detail: opts.detail, action: opts.action, duration }].slice(-MAX));
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-host" aria-live="polite" role="status">
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} dismiss={dismiss} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// Counts down only while the pointer is away and the page is visible, so nothing vanishes unread.
function ToastItem({ t, dismiss }) {
  const [paused, setPaused] = useState(false);
  const onClose = useCallback(() => dismiss(t.id), [dismiss, t.id]);
  const left = useRef(t.duration);
  useEffect(() => {
    if (paused) return;
    const start = Date.now();
    const timer = setTimeout(onClose, left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - start;
    };
  }, [paused, onClose]);
  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <div
      className={`toast tone-${t.tone} ${paused ? "is-paused" : ""}`}
      role={t.tone === "danger" ? "alert" : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONS[t.tone] || ICONS.ok} />
        </svg>
      </span>
      <span className="toast-text">
        <span className="toast-msg">{t.msg}</span>
        {t.detail && <span className="toast-detail">{t.detail}</span>}
      </span>
      {t.action?.onClick && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            onClose();
            t.action.onClick();
          }}
        >
          {t.action.label}
        </button>
      )}
      {t.action?.to && (
        <Link className="toast-action" to={t.action.to} onClick={onClose}>
          {t.action.label}
        </Link>
      )}
      <button type="button" className="toast-close" aria-label="Đóng thông báo" onClick={onClose}>
        ×
      </button>
      <span className="toast-timer" style={{ animationDuration: `${t.duration}ms` }} aria-hidden="true" />
    </div>
  );
}
