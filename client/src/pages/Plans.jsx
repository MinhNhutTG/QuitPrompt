import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { usePlans, usePromptFilters, useProducts } from "../lib/queries.js";
import { useDebounce } from "../lib/util.js";
import { useAuth } from "../auth.jsx";
import { EmptyState, ErrorState, Field, Modal, Pager, Skeleton } from "../components/ui.jsx";
import ProductPicker from "../components/ProductPicker.jsx";
import LazyImage from "../components/LazyImage.jsx";
import { useToast } from "../components/Toast.jsx";

const NO_CATEGORY = "__none";

export const STATUS = {
  todo: { label: "Chưa thực hiện", tone: "todo" },
  partial: { label: "Còn thiếu", tone: "partial" },
  done: { label: "Đã hoàn thành", tone: "done" },
};

const STATUS_FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "open", label: "Chưa xong" },
  { value: "todo", label: STATUS.todo.label },
  { value: "partial", label: STATUS.partial.label },
  { value: "done", label: STATUS.done.label },
];

const DUE_FILTERS = [
  { value: "", label: "Mọi lúc" },
  { value: "overdue", label: "Quá hạn" },
  { value: "today", label: "Hôm nay" },
  { value: "7d", label: "7 ngày tới" },
  { value: "month", label: "Tháng này" },
];

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// "2026-10-25" → "25/10" (this year) or "25/10/2027".
const showDay = (s, thisYear) => {
  const [y, m, d] = s.split("-");
  return Number(y) === thisYear ? `${d}/${m}` : `${d}/${m}/${y}`;
};

// Due filter → { dueFrom, dueTo, overdue } as calendar days in the viewer's time zone.
function dueRange(due, today) {
  const n = new Date();
  const plus = (k) => ymd(new Date(n.getFullYear(), n.getMonth(), n.getDate() + k));
  if (due === "overdue") return { overdue: 1 };
  if (due === "today") return { dueFrom: today, dueTo: today };
  if (due === "7d") return { dueFrom: today, dueTo: plus(6) };
  if (due === "month") return { dueFrom: ymd(new Date(n.getFullYear(), n.getMonth(), 1)), dueTo: ymd(new Date(n.getFullYear(), n.getMonth() + 1, 0)) };
  return {};
}

function MemberSelect({ value, onChange, members, me, required, emptyLabel }) {
  return (
    <select className="input" value={value} required={required} onChange={(e) => onChange(e.target.value)}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.displayName}
          {m.id === me ? " (tôi)" : ""}
        </option>
      ))}
    </select>
  );
}

// Create (several products at once) or edit one plan.
function PlanForm({ plan, members, me, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: productsData } = useProducts();
  const byId = useMemo(() => new Map((productsData?.items || []).map((p) => [p._id, p])), [productsData]);
  const [products, setProducts] = useState([]);
  const [target, setTarget] = useState(plan ? String(plan.target) : "5");
  const [assignee, setAssignee] = useState(plan ? plan.assignee.id : me);
  const [dueDate, setDueDate] = useState(plan?.dueDate || "");
  const [note, setNote] = useState(plan?.note || "");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: (body) => (plan ? api.updatePlan(plan._id, body) : api.createPlans({ ...body, products })),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      toast(plan ? "Đã lưu kế hoạch" : `Đã lập ${res.items.length} kế hoạch`);
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  function submit(e) {
    e.preventDefault();
    const n = Number(target);
    if (!plan && !products.length) return setError("Chọn ít nhất một sản phẩm.");
    if (!Number.isInteger(n) || n < 1 || n > 999) return setError("Mục tiêu là số video từ 1 đến 999.");
    if (!assignee) return setError("Chọn người thực hiện.");
    setError("");
    save.mutate({ target: n, assignee, dueDate, note: note.trim() });
  }

  return (
    <form className="form" onSubmit={submit}>
      {plan ? (
        <div className="plan-prod">
          <LazyImage image={plan.product.images?.[0]} width={40} ratio="1 / 1" />
          <b>{plan.product.name}</b>
        </div>
      ) : (
        <div className="field">
          <span className="field-label">Sản phẩm cần làm video</span>
          {products.length > 0 && (
            <ul className="chips">
              {products.map((id) => (
                <li key={id} className="chip">
                  {byId.get(id)?.name || "…"}
                  <button type="button" aria-label="Bỏ sản phẩm này" onClick={() => setProducts((ps) => ps.filter((x) => x !== id))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ProductPicker
            value={null}
            onChange={(p) => p && setProducts((ps) => (ps.includes(p._id) ? ps : [...ps, p._id]))}
            placeholder={products.length ? "+ Thêm sản phẩm khác" : "Chọn sản phẩm"}
            label="Thêm sản phẩm vào kế hoạch"
          />
          <span className="hint">Chọn nhiều sản phẩm thì mỗi sản phẩm thành một dòng, cùng mục tiêu và người thực hiện.</span>
        </div>
      )}
      <div className="grid-2">
        <Field label="Mục tiêu (số video)">
          <input className="input" type="number" inputMode="numeric" min={1} max={999} required value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label="Người thực hiện">
          <MemberSelect value={assignee} onChange={setAssignee} members={members} me={me} required />
        </Field>
      </div>
      <Field label="Hạn hoàn thành" hint="Không bắt buộc">
        <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      <Field label="Ghi chú">
        <input className="input" maxLength={1000} placeholder="Ưu tiên Meta AI, video 15 giây" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="btns btns-end">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Huỷ
        </button>
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? "Đang lưu..." : plan ? "Lưu" : "Lập kế hoạch"}
        </button>
      </div>
    </form>
  );
}

// The assignee picks the status; everyone else sees it read-only.
function StatusCell({ plan, mine }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [done, setDone] = useState(String(plan.done));
  useEffect(() => setDone(String(plan.done)), [plan.done]);
  const update = useMutation({
    mutationFn: (body) => api.updatePlan(plan._id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
    onError: (e) => toast(e.message, { tone: "danger" }),
  });
  const missing = plan.target - plan.done;
  const saveDone = () => {
    const n = Number(done);
    if (!Number.isInteger(n) || n === plan.done) return setDone(String(plan.done));
    update.mutate({ done: n });
  };

  if (!mine) {
    return (
      <span className={`status status-${STATUS[plan.status].tone}`}>
        {STATUS[plan.status].label}
        {plan.status === "partial" && ` ${missing}`}
      </span>
    );
  }
  return (
    <div className="status-edit">
      <select
        className={`input status-select status-${STATUS[plan.status].tone}`}
        aria-label="Trạng thái"
        value={plan.status}
        disabled={update.isPending}
        onChange={(e) => update.mutate({ status: e.target.value })}
      >
        {Object.entries(STATUS).map(([v, s]) => (
          <option key={v} value={v}>
            {s.label}
          </option>
        ))}
      </select>
      {plan.status === "partial" && plan.target > 1 && (
        <label className="status-count">
          đã làm
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            max={plan.target - 1}
            value={done}
            onChange={(e) => setDone(e.target.value)}
            onBlur={saveDone}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          / {plan.target}
        </label>
      )}
    </div>
  );
}

function PlanRow({ plan, me, today, thisYear, onEdit, onDelete }) {
  const mine = plan.assignee.id === me;
  const overdue = plan.status !== "done" && plan.dueDate && plan.dueDate < today;
  return (
    <tr className={plan.status === "done" ? "is-done" : ""}>
      <td data-label="Sản phẩm">
        <Link to={`/products/${plan.product._id}`} className="plan-prod">
          <LazyImage image={plan.product.images?.[0]} width={40} ratio="1 / 1" />
          <span>
            <b>{plan.product.name}</b>
            {(plan.product.category || plan.product.sku) && (
              <small className="hint">{[plan.product.category, plan.product.sku].filter(Boolean).join(" · ")}</small>
            )}
            {plan.note && <small className="plan-note">{plan.note}</small>}
          </span>
        </Link>
      </td>
      <td data-label="Mục tiêu" className="num">
        {plan.status === "partial" ? `${plan.done}/${plan.target}` : plan.target} video
      </td>
      <td data-label="Người thực hiện">
        <span className={mine ? "plan-me" : ""}>{mine ? "Tôi" : plan.assignee.displayName}</span>
      </td>
      <td data-label="Hạn">
        {plan.dueDate ? <span className={overdue ? "plan-overdue" : ""}>{showDay(plan.dueDate, thisYear)}{overdue && " · quá hạn"}</span> : <span className="hint">—</span>}
      </td>
      <td data-label="Trạng thái">
        <StatusCell plan={plan} mine={mine} />
      </td>
      <td className="plan-actions">
        <Link className="btn btn-sm" to={`/?product=${plan.product._id}`}>
          Tạo prompt
        </Link>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onEdit(plan)}>
          Sửa
        </button>
        <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => onDelete(plan)}>
          Xoá
        </button>
      </td>
    </tr>
  );
}

// Filters and page live in the URL, like the saved-prompts page.
export default function Plans() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const get = (k) => params.get(k) || "";
  const assignee = get("assignee");
  const status = get("status");
  const due = get("due");
  const cat = get("cat");
  const page = Math.max(Number(get("page")) || 1, 1);

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

  const now = new Date();
  const today = ymd(now);
  const { data: options } = usePromptFilters();
  const members = options?.members || [];
  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = usePlans({
    q: get("q") || undefined,
    assignee: assignee || undefined,
    status: status || undefined,
    category: cat || undefined,
    today,
    ...dueRange(due, today),
    page,
  });
  const items = data?.items || [];
  const sum = data?.summary;
  const filtered = Boolean(get("q") || assignee || status || due || cat);

  useEffect(() => {
    if (data && !isPlaceholderData && data.page !== page) set({ page: data.page > 1 ? data.page : "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isPlaceholderData]);

  const [editing, setEditing] = useState(null); // null | "new" | plan
  const [deleting, setDeleting] = useState(null);
  const remove = useMutation({
    mutationFn: (plan) => api.deletePlan(plan._id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      setDeleting(null);
      toast("Đã xoá kế hoạch");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  const top = useRef(null);
  const goPage = (n) => {
    set({ page: n > 1 ? n : "" });
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const pct = sum?.target ? Math.round((sum.done / sum.target) * 100) : 0;

  return (
    <div className="page">
      <div className="page-head" ref={top}>
        <div>
          <h1>Kế hoạch video</h1>
          <p>Sản phẩm nào cần bao nhiêu video, ai làm, tới đâu rồi.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")} disabled={!members.length}>
          + Lập kế hoạch
        </button>
      </div>

      <div className="filters">
        <input className="input filters-q" type="search" aria-label="Tìm theo sản phẩm" placeholder="Tìm theo tên hoặc mã sản phẩm" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="filter">
          <span>Người thực hiện</span>
          <MemberSelect value={assignee} onChange={(v) => set({ assignee: v })} members={members} me={user?.id} emptyLabel="Mọi người" />
        </label>
        <label className="filter">
          <span>Trạng thái</span>
          <select className="input" value={status} onChange={(e) => set({ status: e.target.value })}>
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>Hạn</span>
          <select className="input" value={due} onChange={(e) => set({ due: e.target.value })}>
            {DUE_FILTERS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>Loại sản phẩm</span>
          <select className="input" value={cat} onChange={(e) => set({ cat: e.target.value })}>
            <option value="">Tất cả loại</option>
            {(options?.categories || []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={NO_CATEGORY}>Chưa phân loại</option>
          </select>
        </label>
        {user && (
          <button type="button" className={`btn btn-sm ${assignee === user.id && status === "open" ? "btn-accent-soft" : ""}`} onClick={() => set({ assignee: user.id, status: "open" })}>
            Việc của tôi chưa xong
          </button>
        )}
      </div>

      {sum && sum.plans > 0 && (
        <div className="plan-sum" aria-live="polite">
          <div className="plan-sum-main">
            <b>{sum.plans}</b> kế hoạch · <b>{sum.done}</b>/{sum.target} video ({pct}%)
            <div className="meter" role="img" aria-label={`Đã làm ${pct}%`}>
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="plan-sum-counts">
            <span className="status status-todo">{STATUS.todo.label} {sum.todo}</span>
            <span className="status status-partial">{STATUS.partial.label} {sum.partial}</span>
            <span className="status status-done">{STATUS.done.label} {sum.finished}</span>
            {sum.overdue > 0 && <span className="plan-overdue">Quá hạn {sum.overdue}</span>}
          </div>
        </div>
      )}

      {filtered && (
        <div className="filters-sum">
          <span>{data ? (data.total ? `${data.total} kế hoạch khớp bộ lọc` : "Không có kế hoạch nào khớp") : ""}</span>
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
        </div>
      )}

      {isLoading ? (
        <div className="plist" aria-busy="true">
          <Skeleton h={64} r={14} />
          <Skeleton h={64} r={14} />
          <Skeleton h={64} r={14} />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !items.length ? (
        filtered ? (
          <EmptyState title="Không thấy kế hoạch nào khớp">Thử bỏ bớt bộ lọc.</EmptyState>
        ) : (
          <EmptyState
            title="Chưa có kế hoạch nào"
            action={
              <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
                + Lập kế hoạch
              </button>
            }
          >
            Chọn sản phẩm, đặt số video cần làm và giao cho một thành viên.
          </EmptyState>
        )
      ) : (
        <>
          <div className={`card ptable-wrap ${isPlaceholderData ? "is-stale" : ""}`} aria-busy={isFetching}>
            <table className="ptable">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th className="num">Mục tiêu</th>
                  <th>Người thực hiện</th>
                  <th>Hạn</th>
                  <th>Trạng thái</th>
                  <th>
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <PlanRow key={p._id} plan={p} me={user?.id} today={data.today || today} thisYear={now.getFullYear()} onEdit={setEditing} onDelete={setDeleting} />
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pages={data.pages} onPage={goPage} disabled={isPlaceholderData} />
        </>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Lập kế hoạch video" : "Sửa kế hoạch"} wide>
        {editing && <PlanForm plan={editing === "new" ? null : editing} members={members} me={user?.id} onClose={() => setEditing(null)} />}
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Xoá kế hoạch này?">
        {deleting && (
          <>
            <p>
              Kế hoạch <b>{deleting.target} video</b> cho <b>{deleting.product.name}</b> (giao cho {deleting.assignee.displayName}) sẽ bị xoá với mọi
              thành viên.
            </p>
            <div className="btns">
              <button type="button" className="btn btn-danger" onClick={() => remove.mutate(deleting)} disabled={remove.isPending}>
                {remove.isPending ? "Đang xoá..." : "Có, xoá"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)} autoFocus>
                Không
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
