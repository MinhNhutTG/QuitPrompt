import { Suspense, useCallback, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { preload } from "../pages/index.js";
import { useClickOutside } from "../lib/util.js";
import { Skeleton } from "./ui.jsx";

// Each page is marked by one kanji instead of an icon (tài liệu 05, mục 2).
const NAV = [
  { to: "/", label: "Tạo prompt", short: "Tạo", kanji: "作", page: "builder", end: true },
  { to: "/products", label: "Sản phẩm", short: "Sản phẩm", kanji: "品", page: "products" },
  { to: "/saved", label: "Đã lưu", short: "Đã lưu", kanji: "蔵", page: "saved" },
  { to: "/plans", label: "Kế hoạch", short: "Kế hoạch", kanji: "計", page: "plans" },
  { to: "/library", label: "Thư viện", kanji: "書", page: "library" },
  { to: "/settings", label: "Cài đặt", kanji: "設", page: "settings" },
];

// Pages with their own tab on phones; the rest sit under "Thêm".
const TABS = 4;

const Kanji = ({ children }) => (
  <span className="kanji" aria-hidden="true">
    {children}
  </span>
);

const warm = (page) => ({ onMouseEnter: () => preload(page), onTouchStart: () => preload(page), onFocus: () => preload(page) });

function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);
  return { open, setOpen, close, ref };
}

function AccountMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const menu = useMenu();
  const name = user.displayName || user.username;
  return (
    <div className="menu-wrap" ref={menu.ref}>
      <button
        type="button"
        className="avatar"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-label={`Tài khoản ${name}`}
        onClick={() => menu.setOpen((o) => !o)}
      >
        {name.charAt(0).toUpperCase()}
      </button>
      {menu.open && (
        <div className="menu" role="menu" onKeyDown={(e) => e.key === "Escape" && menu.close()}>
          <div className="menu-head">
            <b>{name}</b>
            <span className="hint">@{user.username}</span>
          </div>
          <Link role="menuitem" to="/settings#account" onClick={menu.close}>
            Đổi mật khẩu
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              menu.close();
              await signOut();
              navigate("/login", { replace: true });
            }}
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

function MoreMenu() {
  const menu = useMenu();
  const { pathname } = useLocation();
  const active = pathname.startsWith("/library") || pathname.startsWith("/settings");
  return (
    <div className="menu-wrap" ref={menu.ref}>
      <button
        type="button"
        className={`tab ${active ? "active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        onClick={() => menu.setOpen((o) => !o)}
        {...warm("library")}
      >
        <Kanji>他</Kanji>
        <span>Thêm</span>
      </button>
      {menu.open && (
        <div className="menu menu-up" role="menu">
          {NAV.slice(TABS).map((n) => (
            <Link key={n.to} role="menuitem" to={n.to} onClick={menu.close} {...warm(n.page)}>
              {n.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <Link to="/" className="brand" aria-label="Xưởng Prompt Thời Trang, về trang tạo prompt">
            Xưởng Prompt <span>Thời Trang</span>
          </Link>
          <nav className="topnav" aria-label="Điều hướng chính">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} {...warm(n.page)}>
                <Kanji>{n.kanji}</Kanji>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <AccountMenu />
        </div>
      </header>

      <main className="main" id="main">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>

      <nav className="tabbar" aria-label="Điều hướng chính">
        {NAV.slice(0, TABS).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="tab" {...warm(n.page)}>
            <Kanji>{n.kanji}</Kanji>
            <span>{n.short}</span>
          </NavLink>
        ))}
        <MoreMenu />
      </nav>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="page" aria-busy="true">
      <Skeleton h={28} w="40%" />
      <div className="grid-2">
        <Skeleton h={320} r={14} />
        <Skeleton h={320} r={14} />
      </div>
    </div>
  );
}
