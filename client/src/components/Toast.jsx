import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Link } from "react-router-dom";

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

// toast("Đã lưu") · toast("Lỗi...", { tone: "danger" }) · toast("Đã lưu", { action: { label: "Xem", to: "/..." } })
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();

  const show = useCallback((msg, opts = {}) => {
    clearTimeout(timer.current);
    setToast({ msg, tone: opts.tone || "ok", action: opts.action, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), opts.duration || (opts.action ? 4500 : 2500));
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-host" aria-live="polite" role="status">
        {toast && (
          <div className={`toast tone-${toast.tone}`} key={toast.key}>
            <span>{toast.msg}</span>
            {toast.action && (
              <Link to={toast.action.to} onClick={() => setToast(null)}>
                {toast.action.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}
