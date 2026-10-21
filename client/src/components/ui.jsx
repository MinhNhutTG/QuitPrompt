import { useEffect, useRef, useState } from "react";

export function Skeleton({ h = 16, w = "100%", r, className = "" }) {
  return <div className={`skel ${className}`} style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty empty-error" role="alert">
      <h3>Không tải được dữ liệu</h3>
      <p>{error?.message || "Có lỗi xảy ra."}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={() => onRetry()}>
          Thử lại
        </button>
      )}
    </div>
  );
}

// Destructive actions need a second click within a few seconds.
export function ConfirmButton({ onConfirm, children, confirmLabel = "Bấm lần nữa để xoá", className = "btn btn-danger-ghost", disabled }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${className} ${armed ? "is-armed" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="modal-body">
          <header className="modal-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Đóng" onClick={onClose}>
              ×
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}

// Radio pills. options: [{ value, label }]
export function Seg({ name, value, options, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={String(o.value)} className={value === o.value ? "is-on" : ""}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

// 1 … 4 5 [6] 7 8 … 20: first, last and two either side of the current page.
function pageList(page, pages) {
  const out = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 2) out.push(i);
    else if (out[out.length - 1] !== "…") out.push("…");
  }
  return out;
}

export function Pager({ page, pages, onPage, disabled }) {
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Phân trang">
      <button type="button" className="btn btn-sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
        ‹ Trước
      </button>
      {pageList(page, pages).map((n, i) =>
        n === "…" ? (
          <span key={`gap${i}`} className="pager-gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            className={`btn btn-sm pager-n ${n === page ? "btn-primary" : "btn-ghost"}`}
            aria-current={n === page ? "page" : undefined}
            aria-label={`Trang ${n}`}
            disabled={disabled}
            onClick={() => n !== page && onPage(n)}
          >
            {n}
          </button>
        )
      )}
      <button type="button" className="btn btn-sm" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)}>
        Sau ›
      </button>
    </nav>
  );
}
