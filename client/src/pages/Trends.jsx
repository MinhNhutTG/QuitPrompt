import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { useCan } from "../auth.jsx";
import { putProduct } from "../lib/queries.js";
import { fmtDateTime, norm } from "../lib/util.js";
import { upcomingSeasons } from "../lib/seasons.js";
import { ConfirmButton, EmptyState, ErrorState, Modal, ProductName, Seg, Skeleton } from "../components/ui.jsx";
import ProductPicker from "../components/ProductPicker.jsx";
import { useToast } from "../components/Toast.jsx";

// Trang "Đón sóng" (tài liệu 14): which watched phrases are about to rise or are mid-wave, from Google search interest
// in Vietnam and TikTok's search suggestions, plus the shopping days coming up.

const PHASES = {
  early: { label: "Sắp lên sóng", tone: "early", rank: 0, tip: "Đang tăng từ mức thấp. Chuẩn bị video ngay để đón đầu." },
  mid: { label: "Đang giữa sóng", tone: "mid", rank: 1, tip: "Đang gần đỉnh 90 ngày. Làm video và đăng ngay hôm nay." },
  spike: { label: "Tăng vọt ngắn", tone: "spike", rank: 2, tip: "Chỉ 1–2 ngày tăng mạnh, có thể là trào lưu chóng qua. Theo dõi thêm vài ngày." },
  flat: { label: "Đi ngang", tone: "flat", rank: 3, tip: "Chưa có sóng rõ ràng." },
  down: { label: "Đang xuống", tone: "down", rank: 4, tip: "Sóng đang qua. Ưu tiên sản phẩm khác." },
  low: { label: "Ít dữ liệu", tone: "flat", rank: 5, tip: "Quá ít người tìm trên Google để đọc xu hướng. Thử cụm ngắn và phổ biến hơn." },
  "": { label: "Chưa quét", tone: "flat", rank: 6, tip: "Đang chờ lượt quét." },
};

const FILTERS = [
  { value: "all", label: "Tất cả" },
  { value: "hot", label: "Nên làm ngay" },
  { value: "early", label: "Sắp lên sóng" },
  { value: "mid", label: "Giữa sóng" },
  { value: "spike", label: "Tăng vọt" },
  { value: "rest", label: "Còn lại" },
];

const pct = (x) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
const shortDay = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function useTrends() {
  return useQuery({
    queryKey: ["trends"],
    queryFn: api.trends,
    // While the server is scanning, ask again every few seconds.
    refetchInterval: (q) => (q.state.data?.scan?.running ? 3000 : false),
  });
}

// 90 days of search interest as one line, with the day and value under the pointer. Google's daily numbers jump
// around a lot (weekdays, days rounded to 0), so the line is the 7-day average, the same the phase is read from.
function Spark({ series: raw, keyword }) {
  const [hi, setHi] = useState(null);
  const series = useMemo(
    () => raw.map((p, i) => {
      const win = raw.slice(Math.max(0, i - 6), i + 1);
      return { d: p.d, v: Math.round(win.reduce((s, x) => s + x.v, 0) / win.length) };
    }),
    [raw]
  );
  const W = 300;
  const H = 64;
  const P = 4;
  if (series.length < 2) return <div className="trend-spark is-empty">Chưa có đường xu hướng</div>;
  const max = Math.max(1, ...series.map((p) => p.v));
  const x = (i) => P + (i / (series.length - 1)) * (W - 2 * P);
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = `${line}L${x(series.length - 1).toFixed(1)},${H - P}L${P},${H - P}Z`;
  const point = hi != null ? series[hi] : null;
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round((((e.clientX - r.left) / r.width) * W - P) / ((W - 2 * P) / (series.length - 1)));
    setHi(Math.max(0, Math.min(series.length - 1, i)));
  };
  return (
    <div className="trend-spark">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Mức quan tâm tìm kiếm “${keyword}” 90 ngày, trung bình 7 ngày gần nhất ${series[series.length - 1].v}/100`}
        onPointerMove={move}
        onPointerLeave={() => setHi(null)}
      >
        <path d={area} className="trend-area" />
        <path d={line} className="trend-line" vectorEffect="non-scaling-stroke" />
        {point && <line x1={x(hi)} x2={x(hi)} y1={P} y2={H - P} className="trend-cross" vectorEffect="non-scaling-stroke" />}
      </svg>
      <span className="trend-tip" aria-hidden="true">
        {point ? (
          <>
            TB 7 ngày <b>{point.v}</b>/100 · {shortDay(point.d)}
          </>
        ) : (
          <>
            {shortDay(series[0].d)} → {shortDay(series[series.length - 1].d)}
          </>
        )}
      </span>
    </div>
  );
}

function Chips({ title, items, watched, canAdd, onWatch, busy }) {
  if (!items.length) return null;
  return (
    <div className="trend-chips">
      <span className="field-label">{title}</span>
      <div>
        {items.map((c) => {
          const has = watched.has(norm(c.q));
          return (
            <span key={c.q} className={`trend-chip ${c.isNew ? "is-new" : ""}`}>
              {c.q}
              {c.label && <small>{c.label}</small>}
              {c.isNew && <small className="trend-new">mới</small>}
              {canAdd && !has && (
                <button type="button" className="trend-chip-add" disabled={busy} aria-label={`Theo dõi “${c.q}”`} title="Theo dõi từ khoá này" onClick={() => onWatch(c.q)}>
                  +
                </button>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function TrendCard({ k, watched, canEdit, onWatch, onLink, onRemove, onHot, busy }) {
  const ph = PHASES[k.phase] || PHASES[""];
  const newSet = new Set(k.tiktokNew || []);
  const p = k.product;
  return (
    <article className={`card trend-card tone-${ph.tone}`}>
      <header className="trend-head">
        <h3>{k.keyword}</h3>
        <span className={`badge trend-badge tone-${ph.tone}`}>{ph.label}</span>
      </header>
      <Spark series={k.series || []} keyword={k.keyword} />
      {k.scannedAt && k.phase !== "low" && (
        <p className="trend-nums">
          <b>{pct(k.growth)}</b> so với 3 tuần trước · đang ở <b>{Math.round(k.level * 100)}%</b> đỉnh 90 ngày
        </p>
      )}
      <p className="hint">{ph.tip}</p>
      {k.scanError && (
        <p className="error" role="alert">
          {k.scanError}
        </p>
      )}

      <Chips title="Tìm kiếm liên quan đang tăng (Google)" items={k.rising || []} watched={watched} canAdd={canEdit} onWatch={onWatch} busy={busy} />
      <Chips
        title="TikTok đang gợi ý"
        items={(k.tiktok || []).map((q) => ({ q, isNew: newSet.has(q) }))}
        watched={watched}
        canAdd={canEdit}
        onWatch={onWatch}
        busy={busy}
      />

      <footer className="trend-foot">
        {p ? (
          <span className="trend-product">
            <Link to={`/products/${p._id}`}>
              <ProductName product={p} />
            </Link>
            {canEdit && !p.hot && (k.phase === "early" || k.phase === "mid") && (
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => onHot(p)}>
                Đánh dấu 🔥
              </button>
            )}
          </span>
        ) : (
          <span className="hint">Chưa gắn sản phẩm</span>
        )}
        <span className="trend-actions">
          {canEdit && (
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => onLink(k)}>
              {p ? "Đổi sản phẩm" : "Gắn sản phẩm"}
            </button>
          )}
          {canEdit && (
            <ConfirmButton className="btn btn-sm btn-danger-ghost" confirmLabel="Bấm lần nữa" disabled={busy} onConfirm={() => onRemove(k)}>
              Bỏ theo dõi
            </ConfirmButton>
          )}
        </span>
      </footer>
      <p className="trend-when hint">{k.scannedAt ? `Quét lúc ${fmtDateTime(k.scannedAt)}` : "Chưa quét"}</p>
    </article>
  );
}

function Seasons() {
  const items = useMemo(() => upcomingSeasons(60), []);
  if (!items.length) return null;
  return (
    <section className="card trend-seasons" aria-label="Sóng theo lịch">
      <h2>Sóng theo lịch · 60 ngày tới</h2>
      <ul>
        {items.map((e) => (
          <li key={e.day + e.name} className={`${e.preparing ? "is-prep" : ""} ${e.big ? "is-big" : ""}`}>
            <b>{e.name}</b>
            <span>
              {shortDay(e.day)} · còn {e.daysLeft} ngày
            </span>
            <small>{e.preparing ? "Đang trong lúc chuẩn bị" : `Chuẩn bị từ ${shortDay(e.prepFrom)}`}</small>
            {e.hint && <small className="hint">{e.hint}</small>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScanStatus({ scan, onScan, disabled }) {
  if (scan?.running)
    return (
      <span className="trend-scan" role="status">
        Đang quét {scan.done}/{scan.total || "…"}
      </span>
    );
  return (
    <button type="button" className="btn" disabled={disabled} onClick={onScan}>
      Quét lại tất cả
    </button>
  );
}

export default function Trends() {
  const { data, isLoading, error, refetch } = useTrends();
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const canEdit = can("product.edit");
  const [keyword, setKeyword] = useState("");
  const [product, setProduct] = useState(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(null);

  const items = useMemo(() => data?.items || [], [data]);
  const watched = useMemo(() => new Set(items.map((k) => norm(k.keyword))), [items]);
  const shown = useMemo(() => {
    const pick = {
      all: () => true,
      hot: (k) => k.phase === "early" || k.phase === "mid",
      early: (k) => k.phase === "early",
      mid: (k) => k.phase === "mid",
      spike: (k) => k.phase === "spike",
      rest: (k) => !["early", "mid", "spike"].includes(k.phase),
    }[filter];
    const rank = (k) => (PHASES[k.phase] || PHASES[""]).rank;
    return items.filter(pick).sort((a, b) => rank(a) - rank(b) || b.growth - a.growth);
  }, [items, filter]);
  const counts = useMemo(() => {
    const c = { early: 0, mid: 0, spike: 0 };
    for (const k of items) if (k.phase in c) c[k.phase]++;
    return c;
  }, [items]);

  const setData = (fn) => qc.setQueryData(["trends"], (old) => old && fn(old));

  async function run(fn, ok) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (err) {
      toast(err.message, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  const watch = (kw, productId = null) =>
    run(async () => {
      const r = await api.createTrend({ keyword: kw, product: productId });
      setData((old) => ({ ...old, items: [r.item, ...old.items], scan: r.scan }));
    }, `Đã thêm “${kw}”`);

  function submit(e) {
    e.preventDefault();
    const kw = keyword.trim();
    if (kw.length < 2) return toast("Nhập từ khoá ít nhất 2 ký tự.", { tone: "danger" });
    watch(kw, product?._id || null).then(() => {
      setKeyword("");
      setProduct(null);
    });
  }

  const scanAll = () =>
    run(async () => {
      const r = await api.scanTrends();
      setData((old) => ({ ...old, scan: r.scan }));
    });

  const remove = (k) =>
    run(async () => {
      await api.deleteTrend(k._id);
      setData((old) => ({ ...old, items: old.items.filter((x) => x._id !== k._id) }));
    }, `Đã bỏ “${k.keyword}”`);

  const link = (k, p) =>
    run(async () => {
      const r = await api.updateTrend(k._id, { product: p?._id || null });
      setData((old) => ({ ...old, items: old.items.map((x) => (x._id === k._id ? r.item : x)) }));
      setLinking(null);
    });

  const markHot = (p) =>
    run(async () => {
      const r = await api.updateProduct(p._id, { hot: true });
      putProduct(qc, r.item);
      setData((old) => ({ ...old, items: old.items.map((x) => (x.product?._id === p._id ? { ...x, product: { ...x.product, hot: true } } : x)) }));
    }, "Đã đánh dấu sản phẩm đang hot");

  const scan = data?.scan;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Đón sóng</h1>
          <p>Theo dõi lượng tìm kiếm để biết sản phẩm nào sắp lên sóng hoặc đang giữa sóng, làm video trước khi đông người làm.</p>
        </div>
        <ScanStatus scan={scan} onScan={scanAll} disabled={busy || !items.length} />
      </div>

      {scan?.error && !scan.running && (
        <p className="error" role="alert">
          {scan.error}
        </p>
      )}

      <Seasons />

      {canEdit && (
        <form className="toolbar trend-add" onSubmit={submit}>
          <input
            className="input"
            value={keyword}
            maxLength={80}
            aria-label="Từ khoá cần theo dõi"
            placeholder="Từ khoá khách hay tìm, vd: áo croptop, quạt cầm tay"
            onChange={(e) => setKeyword(e.target.value)}
          />
          <div className="picker">
            <ProductPicker value={product?._id} onChange={setProduct} allowClear clearLabel="Không gắn sản phẩm" placeholder="Gắn sản phẩm (không bắt buộc)" label="Sản phẩm" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            + Theo dõi
          </button>
        </form>
      )}

      {items.length > 0 && (
        <Seg
          name="trend-filter"
          label="Lọc theo giai đoạn"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ ...f, label: f.value in counts ? `${f.label} (${counts[f.value]})` : f.value === "hot" ? `${f.label} (${counts.early + counts.mid})` : f.label }))}
        />
      )}

      {isLoading ? (
        <div className="trend-grid" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card">
              <Skeleton h={18} w="50%" />
              <Skeleton h={64} />
              <Skeleton h={12} w="80%" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !items.length ? (
        <EmptyState title="Chưa theo dõi từ khoá nào">
          {canEdit
            ? "Thêm từ khoá khách hay gõ khi tìm sản phẩm của bạn (ngắn, phổ biến: “áo croptop”, “quạt mini”). Tool sẽ quét Google và TikTok mỗi ngày."
            : "Khi team thêm từ khoá, xu hướng sẽ hiện ở đây."}
        </EmptyState>
      ) : !shown.length ? (
        <EmptyState title="Không có từ khoá nào ở giai đoạn này" />
      ) : (
        <div className="trend-grid">
          {shown.map((k) => (
            <TrendCard key={k._id} k={k} watched={watched} canEdit={canEdit} busy={busy} onWatch={(q) => watch(q)} onLink={setLinking} onRemove={remove} onHot={markHot} />
          ))}
        </div>
      )}

      <p className="hint trend-source">
        Nguồn: Google Trends (Việt Nam, 90 ngày, thang 0–100 so với đỉnh của chính từ khoá) và gợi ý tìm kiếm của TikTok. Tự quét lại mỗi ngày.
      </p>

      <Modal open={Boolean(linking)} onClose={() => setLinking(null)} title={linking ? `Gắn sản phẩm cho “${linking.keyword}”` : ""}>
        {linking && (
          <div className="form">
            <ProductPicker value={linking.product?._id} onChange={(p) => link(linking, p)} allowClear clearLabel="Bỏ gắn sản phẩm" />
          </div>
        )}
      </Modal>
    </div>
  );
}
