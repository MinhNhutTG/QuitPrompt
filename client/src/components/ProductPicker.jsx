import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useProducts } from "../lib/queries.js";
import { norm, useClickOutside } from "../lib/util.js";
import LazyImage from "./LazyImage.jsx";

// Searchable product combobox with thumbnails, arrow-key navigation and inline "create".
// value: product id · pendingName: a not-yet-created name to show as selected
export default function ProductPicker({
  value,
  pendingName,
  onChange,
  onCreate,
  allowClear = false,
  clearLabel = "Không chọn sản phẩm",
  placeholder = "Chọn sản phẩm",
  label = "Sản phẩm",
}) {
  const { data, isLoading } = useProducts();
  const items = useMemo(() => data?.items || [], [data]);
  const selected = items.find((p) => p._id === value);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
  }, []);
  useClickOutside(rootRef, close, open);

  const options = useMemo(() => {
    const n = norm(q);
    const found = n ? items.filter((p) => norm(p.name).includes(n) || norm(p.sku).includes(n)) : items;
    const exact = n && items.some((p) => norm(p.name) === n);
    return [
      ...(allowClear && !n ? [{ type: "clear" }] : []),
      ...found.slice(0, 80).map((p) => ({ type: "product", p })),
      ...(onCreate && q.trim() && !exact ? [{ type: "create", name: q.trim() }] : []),
    ];
  }, [items, q, allowClear, onCreate]);

  useEffect(() => setHi(0), [q, open]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  function choose(o) {
    if (!o) return;
    if (o.type === "clear") onChange(null);
    else if (o.type === "product") onChange(o.p);
    else onCreate(o.name);
    close();
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(options[hi]);
    } else if (e.key === "Escape") {
      close();
    }
  }

  const shown = selected ? (
    <>
      <LazyImage image={selected.images?.[0]} width={32} ratio="1 / 1" className="pick-thumb" eager />
      <span className="pick-name">
        {selected.name}
        {selected.sku && <small> · {selected.sku}</small>}
      </span>
    </>
  ) : pendingName ? (
    <>
      <span className="pick-thumb pick-new">+</span>
      <span className="pick-name">
        {pendingName} <small className="badge">mới</small>
      </span>
    </>
  ) : (
    <span className="pick-name muted">{isLoading ? "Đang tải sản phẩm..." : placeholder}</span>
  );

  return (
    <div className="picker" ref={rootRef}>
      <button
        type="button"
        className="picker-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selected?.name || pendingName || placeholder}`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {shown}
        <span className="caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="picker-pop">
          <input
            ref={inputRef}
            type="search"
            className="input"
            placeholder={onCreate ? "Tìm hoặc gõ tên sản phẩm mới" : "Tìm theo tên hoặc mã"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-controls={listId}
            aria-expanded="true"
            aria-activedescendant={options[hi] ? `${listId}-${hi}` : undefined}
          />
          <ul className="picker-list" role="listbox" id={listId} ref={listRef}>
            {options.map((o, i) => (
              <li
                key={o.type === "product" ? o.p._id : o.type}
                id={`${listId}-${i}`}
                data-i={i}
                role="option"
                aria-selected={o.type === "product" ? o.p._id === value : o.type === "clear" && !value}
                className={i === hi ? "is-hi" : ""}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
              >
                {o.type === "product" && (
                  <>
                    <LazyImage image={o.p.images?.[0]} width={40} ratio="1 / 1" className="pick-thumb" />
                    <span className="pick-name">
                      {o.p.name}
                      <small>
                        {o.p.sku ? `${o.p.sku} · ` : ""}
                        {o.p.promptCount || 0} prompt
                      </small>
                    </span>
                  </>
                )}
                {o.type === "clear" && <span className="pick-name muted">{clearLabel}</span>}
                {o.type === "create" && (
                  <>
                    <span className="pick-thumb pick-new">+</span>
                    <span className="pick-name">Tạo sản phẩm “{o.name}”</span>
                  </>
                )}
              </li>
            ))}
            {!options.length && <li className="picker-empty">{items.length ? "Không thấy sản phẩm nào khớp." : "Chưa có sản phẩm nào."}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
