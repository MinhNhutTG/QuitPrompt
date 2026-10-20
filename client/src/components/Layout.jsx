import { Suspense, useCallback, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { preload } from "../pages/index.js";
import { useClickOutside } from "../lib/util.js";
import { Skeleton } from "./ui.jsx";

const ICONS = {
  builder: "M12 3l2.2 5.6L20 9l-4.5 3.8L17 19l-5-3.2L7 19l1.5-6.2L4 9l5.8-.4z",
  products: "M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10",
  saved: "M6 3h12v18l-6-4-6 4z",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
};

const NAV = [
  { to: "/", label: "Tạo prompt", short: "Tạo", page: "builder", end: true },
  { to: "/products", label: "Sản phẩm", short: "Sản phẩm", page: "products" },
  { to: "/saved", label: "Đã lưu", short: "Đã lưu", page: "saved" },
  { to: "/library", label: "Thư viện", page: "library" },
  { to: "/settings", label: "Cài đặt", page: "settings" },
];

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
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
        <Icon d={ICONS.more} />
        <span>Thêm</span>
      </button>
      {menu.open && (
        <div className="menu menu-up" role="menu">
          {NAV.slice(3).map((n) => (
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
        {NAV.slice(0, 3).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="tab" {...warm(n.page)}>
            <Icon d={ICONS[n.page]} />
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
