import { Suspense, useCallback, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { preload } from "../pages/index.js";
import { useClickOutside } from "../lib/util.js";
import { Skeleton } from "./ui.jsx";

// Line icons, 24px grid, drawn with the text colour (tài liệu 05, mục 2).
const ICONS = {
  builder: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
  products: "M20.4 3.5 16 2a4 4 0 0 1-8 0L3.6 3.5a2 2 0 0 0-1.3 2.2l.6 3.5a1 1 0 0 0 1 .8H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.2a1 1 0 0 0 1-.8l.6-3.5a2 2 0 0 0-1.4-2.2Z",
  saved: "M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z",
  plans: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM9 16l2 2 4-4",
  resources: "M3 8h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1ZM2 3h20v5H2ZM10 12h4",
  library: "M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2ZM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7Z",
  settings: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

const NAV = [
  { to: "/", label: "Tạo prompt", short: "Tạo", page: "builder", end: true },
  { to: "/products", label: "Sản phẩm", short: "Sản phẩm", page: "products" },
  { to: "/saved", label: "Đã lưu", short: "Đã lưu", page: "saved" },
  { to: "/plans", label: "Kế hoạch", short: "Kế hoạch", page: "plans" },
  { to: "/resources", label: "Tài nguyên", page: "resources" },
  { to: "/library", label: "Thư viện", page: "library" },
  { to: "/settings", label: "Cài đặt", page: "settings" },
];

// Pages with their own tab on phones; the rest sit under "Thêm".
const TABS = 4;

const Icon = ({ name }) => (
  <svg className="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name]} />
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
  const active = NAV.slice(TABS).some((n) => pathname.startsWith(n.to));
  return (
    <div className="menu-wrap" ref={menu.ref}>
      <button
        type="button"
        className={`tab ${active ? "active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        onClick={() => menu.setOpen((o) => !o)}
        {...warm("resources")}
      >
        <Icon name="more" />
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
                <Icon name={n.page} />
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
            <Icon name={n.page} />
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
