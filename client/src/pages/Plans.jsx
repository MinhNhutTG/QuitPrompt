import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { usePlans, usePromptFilters } from "../lib/queries.js";
import { uid, useDebounce } from "../lib/util.js";
import { useAuth } from "../auth.jsx";
import { EmptyState, ErrorState, Modal, Pager, ProductName, Skeleton } from "../components/ui.jsx";
import ProductPicker from "../components/ProductPicker.jsx";
import LazyImage from "../components/LazyImage.jsx";
import CopyPlanDialog from "../components/CopyPlanDialog.jsx";
import { ScriptSelect } from "../components/Scripts.jsx";
import { useToast } from "../components/Toast.jsx";
import { STATUS, isFinished, progressOf } from "../lib/plans.js";

const NO_CATEGORY = "__none";

const STATUS_FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "open", label: "Chưa xong" },
  { value: "todo", label: STATUS.todo.label },
  { value: "partial", label: STATUS.partial.label },
  { value: "done", label: STATUS.done.label },
  { value: "posted", label: STATUS.posted.label },
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

function MemberSelect({ value, onChange, members, me, emptyLabel, label, disabled }) {
  return (
    <select className="input" aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
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

// A new row starts due today; the user can change or clear it.
const formOf = (plan, me, today) =>
  plan
    ? { product: plan.product._id, assignee: plan.assignee.id, dueDate: plan.dueDate || "", status: plan.status }
    : { product: null, assignee: me || "", dueDate: today || "", status: "todo", script: "" };

const FIELDS = ["product", "assignee", "dueDate", "status"];

const ICONS = {
  copy: "M10 8h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM15 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6",
};

// Icon-only row action; the label stays as aria-label and tooltip.
const IconAct = ({ icon, label, className, ...props }) => (
  <button type="button" className={`btn btn-sm btn-icon ${className}`} aria-label={label} title={label} {...props}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[icon]} />
    </svg>
  </button>
);

// Each plan keeps its own paper and tape colour (from its id), and a slight tilt, like notes stuck on a wall.
const PAPERS = 6;
const TAPES = 5;
function looks(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { paper: h % PAPERS, tape: (h >> 4) % TAPES, tilt: ((h >> 8) % 5) - 2 };
}

// One plan as a sticky note. plan = null for a new, unsaved one.
// A new note is filled in by whoever may add plans (status included). On a saved note, roles with plan.edit change
// the assignee and due day; any member changes the status and pins it; roles with plan.delete may delete or select it.
function PlanNote({ plan, members, me, today, onSaved, onDelete, onCopy, selected, onSelect, canEdit, canDelete }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(() => formOf(plan, me, today));
  const base = formOf(plan, me, today);
  const baseKey = plan ? `${plan._id}|${plan.updatedAt}` : "new";
  useEffect(() => setForm(formOf(plan, me, today)), [baseKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = !plan || FIELDS.some((k) => form[k] !== base[k]);
  const locked = Boolean(plan) && !canEdit;

  const save = useMutation({
    mutationFn: (body) => (plan ? api.updatePlan(plan._id, body) : api.createPlans({ ...body, products: [form.product] })),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      // The chosen voice-over is now marked used on the product page.
      if (!plan && form.script) qc.invalidateQueries({ queryKey: ["product", form.product, "scripts"] });
      if (res.driveWarning) toast("Đã thêm kế hoạch", { tone: "danger", detail: res.driveWarning });
      else toast(plan ? "Đã lưu kế hoạch" : "Đã thêm kế hoạch");
      onSaved?.();
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });
  const pin = useMutation({
    mutationFn: (on) => api.updatePlan(plan._id, { pinned: on }),
    onSuccess: (_, on) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      toast(on ? "Đã ghim lên đầu" : "Đã bỏ ghim");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  function submit() {
    if (!form.product) return toast("Chọn sản phẩm cần làm video.", { tone: "danger" });
    if (!form.assignee) return toast("Chọn người thực hiện.", { tone: "danger" });
    // Without plan.edit only the status may change, so the rest is not sent.
    const body = locked ? {} : { assignee: form.assignee, dueDate: form.dueDate };
    // A saved note only sends the status when it changed, so it never undoes an automatic change made meanwhile.
    if (!plan || form.status !== base.status) body.status = form.status;
    if (!plan && form.script) body.script = form.script;
    save.mutate(body);
  }
  const progress = plan && progressOf(plan);
  const gone = plan?.product.name.startsWith("(");
  const pinned = Boolean(plan?.pinnedAt);
  const look = looks(plan?._id || "new");
  const overdue = !isFinished(form.status) && form.dueDate && form.dueDate < today;

  return (
    <article
      className={["note", `paper-${look.paper}`, !plan && "is-draft", plan && isFinished(plan.status) && "is-done", dirty && plan && "is-dirty", selected && "is-selected", pinned && "is-pinned"].filter(Boolean).join(" ")}
      style={{ "--tilt": `${look.tilt * 0.4}deg` }}
      aria-label={plan ? `Kế hoạch ${plan.product.name}` : "Kế hoạch mới"}
    >
      {pinned ? <span className="note-pin" aria-hidden="true" /> : <span className={`note-tape tape-${look.tape}`} aria-hidden="true" />}

      <div className="note-top">
        {plan && canDelete && (
          <label className="note-check" title="Chọn để xoá nhiều">
            <input type="checkbox" checked={selected} onChange={(e) => onSelect(plan, e.target.checked)} aria-label={`Chọn kế hoạch ${plan.product.name}`} />
          </label>
        )}
        <span className="grow" />
        {plan && (
          <button
            type="button"
            className={`note-pin-btn ${pinned ? "is-on" : ""}`}
            onClick={() => pin.mutate(!pinned)}
            disabled={pin.isPending}
            aria-pressed={pinned}
            aria-label={pinned ? "Bỏ ghim" : "Ghim lên đầu"}
            title={pinned ? "Bỏ ghim" : "Ghim lên đầu danh sách cho cả team"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5ZM12 14v6" />
            </svg>
          </button>
        )}
      </div>

      <div className="note-product">
        {plan && <LazyImage image={plan.product.images?.[0]} width={44} ratio="1 / 1" />}
        <div className="note-product-text">
          {!plan ? (
            <ProductPicker value={form.product} onChange={(p) => setForm((f) => ({ ...f, product: p?._id || null, script: "" }))} placeholder="Chọn sản phẩm" label="Sản phẩm" />
          ) : gone ? (
            <span className="hint">{plan.product.name}</span>
          ) : (
            <Link className="note-title" to={`/plans/${plan._id}`} title={plan.product.name}>
              <ProductName product={plan.product} />
            </Link>
          )}
          {progress && (
            <span className={`plan-files ${progress.have === progress.total ? "is-full" : ""}`}>
              Đã có {progress.have}/{progress.total} mục
            </span>
          )}
        </div>
      </div>

      <dl className="note-fields">
        {!plan && form.product && (
          <div>
            <dt>Lời đọc</dt>
            <dd>
              <ScriptSelect productId={form.product} value={form.script} onChange={set("script")} />
            </dd>
          </div>
        )}
        <div>
          <dt>Người làm</dt>
          <dd>
            <MemberSelect value={form.assignee} onChange={set("assignee")} members={members} me={me} emptyLabel={form.assignee ? undefined : "Chọn người"} label="Người thực hiện" disabled={locked} />
          </dd>
        </div>
        <div>
          <dt>
            Hạn
            {overdue && <span className="plan-overdue">Quá hạn</span>}
          </dt>
          <dd>
            <input className="input" type="date" aria-label="Hạn hoàn thành" value={form.dueDate} disabled={locked} onChange={(e) => set("dueDate")(e.target.value)} />
          </dd>
        </div>
        <div>
          <dt>Trạng thái</dt>
          <dd>
            <select className={`input status-select status-${STATUS[form.status].tone}`} aria-label="Trạng thái" value={form.status} onChange={(e) => set("status")(e.target.value)}>
              {Object.entries(STATUS).map(([v, st]) => (
                <option key={v} value={v}>
                  {st.label}
                </option>
              ))}
            </select>
          </dd>
        </div>
      </dl>

      <div className="note-acts">
        {dirty && (
          <button type="button" className="btn btn-sm btn-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Đang lưu..." : "Lưu"}
          </button>
        )}
        {plan && dirty && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setForm(base)}>
            Huỷ sửa
          </button>
        )}
        {plan && !dirty && (
          <>
            <Link className="btn btn-sm btn-primary" to={`/plans/${plan._id}`}>
              Chi tiết
            </Link>
            {plan.files?.final && (
              <a className="btn btn-sm" href={api.driveDownloadUrl(plan.files.final.id)} download={plan.files.final.name}>
                Tải video
              </a>
            )}
            <Link className="btn btn-sm btn-ghost" to={`/?product=${plan.product._id}`}>
              Prompt
            </Link>
          </>
        )}
        <span className="note-icons">
          {plan && !dirty && canEdit && !gone && <IconAct icon="copy" label="Sao chép" className="btn-ghost" onClick={() => onCopy(plan)} />}
          {(!plan || canDelete) && <IconAct icon="trash" label="Xoá" className="btn-danger-ghost" onClick={() => onDelete(plan)} />}
        </span>
      </div>
    </article>
  );
}

// The whole team's plans, always. Filters only narrow the view and live in the URL.
export default function Plans() {
  const { user, can } = useAuth();
  const canEdit = can("plan.edit");
  const canDelete = can("plan.delete");
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

  const today = ymd(new Date());
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

  // New plans not saved yet, newest first.
  const [drafts, setDrafts] = useState([]);
  const addDraft = () => setDrafts((d) => [uid(), ...d]);
  const dropDraft = (key) => setDrafts((d) => d.filter((k) => k !== key));

  const [deleting, setDeleting] = useState(null);
  const [copying, setCopying] = useState(null);

  // Chosen plans by id, kept across pages; a new filter starts over.
  const [selected, setSelected] = useState(() => new Map());
  const filterKey = [get("q"), assignee, status, due, cat].join("|");
  useEffect(() => setSelected(new Map()), [filterKey]);
  const select = (plan, on) =>
    setSelected((old) => {
      const next = new Map(old);
      on ? next.set(plan._id, plan) : next.delete(plan._id);
      return next;
    });
  const pageAllOn = items.length > 0 && items.every((p) => selected.has(p._id));
  const selectPage = (on) =>
    setSelected((old) => {
      const next = new Map(old);
      for (const p of items) on ? next.set(p._id, p) : next.delete(p._id);
      return next;
    });
  const [bulkOpen, setBulkOpen] = useState(false);
  const removeMany = useMutation({
    mutationFn: () => api.deletePlans([...selected.keys()]),
    onSuccess: ({ deleted }) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      setSelected(new Map());
      setBulkOpen(false);
      toast(`Đã xoá ${deleted} kế hoạch`);
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });
  const remove = useMutation({
    mutationFn: (plan) => api.deletePlan(plan._id),
    onSuccess: (_, plan) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      select(plan, false);
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
  // Posted plans are finished too.
  const finished = (sum?.finished || 0) + (sum?.posted || 0);
  const pct = sum?.plans ? Math.round((finished / sum.plans) * 100) : 0;
  const showBoard = items.length > 0 || drafts.length > 0;

  return (
    <div className="page">
      <div className="page-head" ref={top}>
        <div>
          <h1>Kế hoạch video</h1>
          <p>Kế hoạch của cả team: mỗi kế hoạch là một video, có thư mục riêng trên Google Drive.</p>
        </div>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={addDraft} disabled={!members.length}>
            + Thêm kế hoạch
          </button>
        )}
      </div>

      <div className="filters">
        <input className="input filters-q" type="search" aria-label="Tìm theo sản phẩm" placeholder="Tìm theo tên hoặc mã sản phẩm" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="filter">
          <span>Người thực hiện</span>
          <MemberSelect value={assignee} onChange={(v) => set({ assignee: v })} members={members} me={user?.id} emptyLabel="Cả team" />
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
      </div>

      {sum && sum.plans > 0 && (
        <div className="plan-sum" aria-live="polite">
          <div className="plan-sum-main">
            <span>
              <b>{sum.plans}</b> kế hoạch · <b>{finished}</b> đã hoàn thành ({pct}%)
            </span>
            <div className="meter" role="img" aria-label={`Đã hoàn thành ${pct}%`}>
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="plan-sum-counts">
            <span className="status status-todo">
              {STATUS.todo.label} {sum.todo}
            </span>
            <span className="status status-partial">
              {STATUS.partial.label} {sum.partial}
            </span>
            <span className="status status-done">
              {STATUS.done.label} {sum.finished}
            </span>
            <span className="status status-posted">
              {STATUS.posted.label} {sum.posted || 0}
            </span>
            {sum.overdue > 0 && <span className="plan-overdue">Quá hạn {sum.overdue}</span>}
          </div>
        </div>
      )}

      {filtered && (
        <div className="filters-sum">
          <span>{data ? (data.total ? `Đang lọc: ${data.total} kế hoạch` : "Không có kế hoạch nào khớp") : ""}</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setQ("");
              setParams({}, { replace: true });
            }}
          >
            Xem cả team
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="notes" aria-busy="true">
          <Skeleton h={250} r={6} />
          <Skeleton h={250} r={6} />
          <Skeleton h={250} r={6} />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !showBoard ? (
        filtered ? (
          <EmptyState title="Không thấy kế hoạch nào khớp">Thử bỏ bớt bộ lọc.</EmptyState>
        ) : (
          <EmptyState
            title="Chưa có kế hoạch nào"
            action={
              canEdit && (
                <button type="button" className="btn btn-primary" onClick={addDraft}>
                  + Thêm kế hoạch
                </button>
              )
            }
          >
            {canEdit ? "Thêm một kế hoạch, chọn sản phẩm, người thực hiện và hạn rồi bấm Lưu. Bấm Chi tiết để tải video, mp3 và nhập lời đọc." : "Khi có kế hoạch video, chúng sẽ hiện ở đây."}
          </EmptyState>
        )
      ) : (
        <>
          {selected.size > 0 && (
            <div className="bulk-bar" role="region" aria-label="Kế hoạch đã chọn">
              <span>
                Đã chọn <b>{selected.size}</b> kế hoạch
              </span>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => setBulkOpen(true)}>
                Xoá {selected.size} kế hoạch
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected(new Map())}>
                Bỏ chọn
              </button>
            </div>
          )}
          {canDelete && items.length > 0 && (
            <label className="notes-select-all">
              <input
                type="checkbox"
                checked={pageAllOn}
                ref={(el) => el && (el.indeterminate = !pageAllOn && items.some((p) => selected.has(p._id)))}
                onChange={(e) => selectPage(e.target.checked)}
              />
              Chọn mọi kế hoạch trên trang này
            </label>
          )}
          <div className={`notes ${isPlaceholderData ? "is-stale" : ""}`} aria-busy={isFetching}>
            {drafts.map((key) => (
              <PlanNote key={key} plan={null} members={members} me={user?.id} today={today} onSaved={() => dropDraft(key)} onDelete={() => dropDraft(key)} canEdit />
            ))}
            {items.map((p) => (
              <PlanNote key={p._id} plan={p} members={members} me={user?.id} today={data.today || today} onDelete={setDeleting} onCopy={setCopying} selected={selected.has(p._id)} onSelect={select} canEdit={canEdit} canDelete={canDelete} />
            ))}
          </div>
          {data && <Pager page={data.page} pages={data.pages} onPage={goPage} disabled={isPlaceholderData} />}
        </>
      )}

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title={`Xoá ${selected.size} kế hoạch?`}>
        {bulkOpen && (
          <>
            <p>Các kế hoạch sau sẽ bị xoá với cả team. Thư mục của chúng trên Google Drive chuyển vào thùng rác (khôi phục được trong 30 ngày):</p>
            <ul className="bulk-list">
              {[...selected.values()].slice(0, 8).map((p) => (
                <li key={p._id}>
                  <b>{p.product.name}</b> · {p.assignee.displayName}
                </li>
              ))}
              {selected.size > 8 && <li className="hint">và {selected.size - 8} kế hoạch khác</li>}
            </ul>
            <div className="btns">
              <button type="button" className="btn btn-danger" onClick={() => removeMany.mutate()} disabled={removeMany.isPending}>
                {removeMany.isPending ? "Đang xoá..." : `Có, xoá ${selected.size} kế hoạch`}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setBulkOpen(false)} autoFocus>
                Không
              </button>
            </div>
          </>
        )}
      </Modal>

      <CopyPlanDialog plan={copying} onClose={() => setCopying(null)} />

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Xoá kế hoạch này?">
        {deleting && (
          <>
            <p>
              Kế hoạch cho <b>{deleting.product.name}</b> (giao cho {deleting.assignee.displayName}) sẽ bị xoá với cả team.
              {deleting.folder?.id && " Thư mục của kế hoạch trên Google Drive chuyển vào thùng rác (khôi phục được trong 30 ngày)."}
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
