import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, onUnauthorized } from "./api.js";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [waking, setWaking] = useState(false);

  // First call on open: a live cookie goes straight to the builder, no login screen.
  useEffect(() => {
    let alive = true;
    let retry;
    const slow = setTimeout(() => alive && setWaking(true), 2500);
    const done = (u) => {
      clearTimeout(slow);
      setUser(u);
      setBooting(false);
      setWaking(false);
    };
    async function check() {
      try {
        const { user } = await api.me();
        if (alive) done(user);
      } catch (e) {
        if (!alive) return;
        if (e.status === 401) done(null);
        else {
          // Free server asleep or network down: keep trying instead of showing an error.
          setWaking(true);
          retry = setTimeout(check, 3000);
        }
      }
    }
    check();
    return () => {
      alive = false;
      clearTimeout(slow);
      clearTimeout(retry);
    };
  }, []);

  useEffect(
    () =>
      onUnauthorized(() => {
        qc.clear();
        setUser(null);
      }),
    [qc]
  );

  const signIn = useCallback((u) => setUser(u), []);
  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      qc.clear();
      setUser(null);
    }
  }, [qc]);

  if (booting) return <BootScreen waking={waking} />;
  return <AuthCtx.Provider value={{ user, signIn, signOut }}>{children}</AuthCtx.Provider>;
}

function BootScreen({ waking }) {
  return (
    <div className="boot" role="status" aria-live="polite">
      <div className="brand brand-lg">
        Xưởng Prompt <span>Thời Trang</span>
      </div>
      {waking ? (
        <p>
          Máy chủ đang khởi động, chờ khoảng 1 phút...
          <br />
          <small>Máy chủ miễn phí ngủ khi lâu không dùng. App tự vào khi sẵn sàng.</small>
        </p>
      ) : (
        <div className="boot-bar" aria-hidden="true" />
      )}
    </div>
  );
}
