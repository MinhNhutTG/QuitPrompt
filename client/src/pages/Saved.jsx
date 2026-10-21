import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePromptFilters, usePromptPage } from "../lib/queries.js";
import { useDebounce } from "../lib/util.js";
import { useAuth } from "../auth.jsx";
import { EmptyState, ErrorState, Pager, Skeleton } from "../components/ui.jsx";
import ProductPicker from "../components/ProductPicker.jsx";
import PromptCard from "../components/PromptCard.jsx";

const CardSkeleton = () => <Skeleton h={150} r={14} />;

// Same value the server reads as "product has no category".
const NO_CATEGORY = "__none";
const PAGE_SIZE = 20;

const TIMES = [
  { value: "", label: "Mọi lúc" },
  { value: "today", label: "Hôm nay" },
  { value: "7d", label: "7 ngày qua" },
  { value: "30d", label: "30 ngày qua" },
  { value: "month", label: "Tháng này" },
  { value: "custom", label: "Chọn ngày..." },
];

const day = (y, m, d) => new Date(y, m, d);
// "2026-10-21" → local midnight of that day.
const fromInput = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return y && m && d ? day(y, m - 1, d) : null;
};

// Local-day boundaries as ISO instants: { from, to } with `to` exclusive.
function timeRange(time, fromDay, toDay) {
  const n = new Date();
  const back = (k) => day(n.getFullYear(), n.getMonth(), n.getDate() - k);
  let from = null;
  let to = null;
  if (time === "today") from = back(0);
  else if (time === "7d") from = back(6);
  else if (time === "30d") from = back(29);
  else if (time === "month") from = day(n.getFullYear(), n.getMonth(), 1);
  else if (time === "custom") {
    from = fromDay ? fromInput(fromDay) : null;
    const end = toDay ? fromInput(toDay) : null;
    to = end && day(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  }
  return { from: from?.toISOString(), to: to?.toISOString() };
}

// Filters and page live in the URL, so Back, reload and shared links keep them.
export default function Saved() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const get = (k) => params.get(k) || "";
  const by = get("by");
  const cat = get("cat");
  const time = get("time");
  const fromDay = get("from");
  const toDay = get("to");
  const product = get("product");
  const page = Math.max(Number(get("page")) || 1, 1);

  // Any filter change goes back to page 1; only page turns add a history entry.
  const set = (changes) =>
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        for (const [k, v] of Object.entries(changes)) v ? next.set(k, String(v)) : next.delete(k);
        if (!("page" in changes)) next.delete("page");
        return next;
      },
      { replace: !("page" in changes) }
    );

  const [q, setQ] = useState(get("q"));
  const dq = useDebounce(q.trim(), 300);
  useEffect(() => {
    if (dq !== get("q")) set({ q: dq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const { from, to } = useMemo(() => timeRange(time, fromDay, toDay), [time, fromDay, toDay]);
  const { data: options } = usePromptFilters();
  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = usePromptPage({
    q: get("q") || undefined,
    by: by || undefined,
    category: cat || undefined,
    product: product || undefined,
    from,
    to,
    page,
  });
  const items = data?.items || [];
  const total = data?.total || 0;
  const filtered = Boolean(get("q") || by || cat || time || product);

  // A page past the end (after deletes) snaps to the last real page.
  useEffect(() => {
    if (data && !isPlaceholderData && data.page !== page) set({ page: data.page > 1 ? data.page : "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isPlaceholderData]);

  const top = useRef(null);
  const goPage = (n) => {
    set({ page: n > 1 ? n : "" });
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const others = (options?.members || []).filter((m) => m.id !== user?.id);
  const categories = options?.categories || [];
  const first = (data?.page ? data.page - 1 : 0) * PAGE_SIZE + 1;

  return (
    <div className="page">
      <div className="page-head" ref={top}>
        <div>
          <h1>Prompt đã lưu</h1>
          <p>Những prompt đã ra video đẹp của cả nhóm, để copy lại hoặc dùng lại và chỉnh.</p>
        </div>
      </div>

      <div className="filters">
        <input className="input filters-q" type="search" aria-label="Tìm prompt" placeholder="Tìm trong ghi chú, công cụ, tên sản phẩm" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="filter">
          <span>Người lưu</span>
          <select className="input" value={by} onChange={(e) => set({ by: e.target.value })}>
            <option value="">Mọi người</option>
            {user && <option value={user.id}>Tôi ({user.displayName})</option>}
            {others.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>Loại sản phẩm</span>
          <select className="input" value={cat} onChange={(e) => set({ cat: e.target.value })}>
            <option value="">Tất cả loại</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {cat && cat !== NO_CATEGORY && !categories.includes(cat) && <option value={cat}>{cat}</option>}
            <option value={NO_CATEGORY}>Chưa phân loại</option>
          </select>
        </label>
        <label className="filter">
          <span>Thời gian lưu</span>
          <select className="input" value={time} onChange={(e) => set({ time: e.target.value, from: "", to: "" })}>
            {TIMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {time === "custom" && (
          <>
            <label className="filter">
              <span>Từ ngày</span>
              <input className="input" type="date" value={fromDay} max={toDay || undefined} onChange={(e) => set({ from: e.target.value })} />
            </label>
            <label className="filter">
              <span>Đến ngày</span>
              <input className="input" type="date" value={toDay} min={fromDay || undefined} onChange={(e) => set({ to: e.target.value })} />
            </label>
          </>
        )}
        <div className="filter filter-product">
          <span>Sản phẩm của tôi</span>
          <ProductPicker
            value={product || null}
            onChange={(p) => set({ product: p?._id || "" })}
            allowClear
            clearLabel="Tất cả sản phẩm"
            placeholder="Tất cả sản phẩm"
            label="Lọc theo sản phẩm"
          />
        </div>
      </div>

      <div className="filters-sum" aria-live="polite">
        <span>
          {isLoading ? "Đang tải..." : total ? `${first}–${first + items.length - 1} trên ${total} prompt` : filtered ? "Không có prompt nào khớp" : ""}
        </span>
        {filtered && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setQ("");
              setParams({}, { replace: true });
            }}
          >
            Xoá bộ lọc
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="plist" aria-busy="true">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !items.length ? (
        filtered ? (
          <EmptyState title="Không thấy prompt nào khớp">Thử bỏ bớt bộ lọc hoặc tìm bằng từ khác.</EmptyState>
        ) : (
          <EmptyState
            title="Chưa lưu prompt nào"
            action={
              <Link to="/" className="btn btn-primary">
                Tạo prompt
              </Link>
            }
          >
            Tạo prompt, thử trên công cụ video, ra đẹp thì bấm “★ Lưu prompt tốt”.
          </EmptyState>
        )
      ) : (
        <>
          <div className={`plist ${isPlaceholderData ? "is-stale" : ""}`} aria-busy={isFetching}>
            {items.map((p) => (
              <PromptCard key={p._id} item={p} showProduct />
            ))}
          </div>
          <Pager page={data.page} pages={data.pages} onPage={goPage} disabled={isPlaceholderData} />
        </>
      )}
    </div>
  );
}
