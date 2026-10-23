import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { store } from "../lib/util.js";
import { Field, Seg } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

export default function Login() {
  const { signIn } = useAuth();
  const toast = useToast();
  const { data: cfg } = useQuery({ queryKey: ["authConfig"], queryFn: api.authConfig, staleTime: Infinity });
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState(() => store.get("lastUser", ""));
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const userRef = useRef(null);
  const passRef = useRef(null);
  const isNew = mode === "register";

  // A remembered username puts the cursor straight in the password box.
  useEffect(() => {
    (username && !isNew ? passRef : userRef).current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const body = { username: username.trim(), password, remember };
      const { user } = await (isNew ? api.register(body) : api.login(body));
      store.set("lastUser", user.username);
      signIn(user);
      toast(isNew ? `Đã tạo tài khoản ${user.username}` : `Chào ${user.displayName}`, { detail: isNew ? "Bạn đã đăng nhập." : undefined });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-art ink">
        <div className="brand brand-lg">
          Xưởng Prompt <span>Thời Trang</span>
        </div>
        <div className="login-copy">
          <h1>Prompt video AI cho từng sản phẩm.</h1>
          <p>Lưu một lần, dùng mãi.</p>
          <ul className="login-points">
            <li>Chọn sản phẩm, ghép động tác, copy prompt</li>
            <li>Lưu prompt ra video đẹp để cả team dùng lại</li>
            <li>Giao kế hoạch video và theo dõi tiến độ</li>
          </ul>
        </div>
      </div>
      <div className="login-main">
        <form className="login-card" onSubmit={submit}>
          {cfg?.allowRegister && (
            <Seg
              name="mode"
              label="Chế độ"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setError("");
              }}
              options={[
                { value: "login", label: "Đăng nhập" },
                { value: "register", label: "Tạo tài khoản" },
              ]}
            />
          )}

          <Field label="Tên đăng nhập" hint={isNew ? "3–30 ký tự: chữ không dấu, số, dấu chấm hoặc gạch dưới." : undefined}>
            <input
              ref={userRef}
              className="input"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              maxLength={60}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>

          <Field label="Mật khẩu" hint={isNew ? "Ít nhất 6 ký tự." : undefined}>
            <div className="pw">
              <input
                ref={passRef}
                className="input"
                name="password"
                type={show ? "text" : "password"}
                autoComplete={isNew ? "new-password" : "current-password"}
                required
                minLength={isNew ? 6 : undefined}
                maxLength={100}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="icon-btn" aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={show} onClick={() => setShow((s) => !s)}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  {show && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" />}
                </svg>
              </button>
            </div>
          </Field>

          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Ghi nhớ đăng nhập 30 ngày
          </label>

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? (isNew ? "Đang tạo tài khoản..." : "Đang đăng nhập...") : isNew ? "Tạo tài khoản" : "Đăng nhập"}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
