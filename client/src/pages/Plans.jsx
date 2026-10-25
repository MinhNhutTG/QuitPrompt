import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { usePlans, usePromptFilters } from "../lib/queries.js";
import { uid, useDebounce } from "../lib/util.js";
import { useAuth } from "../auth.jsx";
import { EmptyState, ErrorState, Modal, Pager, Skeleton } from "../components/ui.jsx";
import ProductPicker from "../components/ProductPicker.jsx";
import CopyPlanDialog from "../components/CopyPlanDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { STATUS, progressOf } from "../lib/plans.js";

const NO_CATEGORY = "__none";

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
    : { product: null, assignee: me || "", dueDate: today || "", status: "todo" };

const FIELDS = ["product", "assignee", "dueDate", "status"];

// One editable row. plan = null for a new, unsaved row.
// A new row is filled in by whoever may add plans (status included). On a saved row, roles with plan.edit change
// the details and only the assignee changes the status; roles with plan.delete may delete or select it.
function PlanRow({ plan, members, me, today, onSaved, onDelete, onCopy, selected, onSelect, canEdit, canDelete }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(() => formOf(plan, me, today));
  const base = formOf(plan, me, today);
  const baseKey = plan ? `${plan._id}|${plan.updatedAt}` : "new";
  useEffect(() => setForm(formOf(plan, me, today)), [baseKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = !plan || FIELDS.some((k) => form[k] !== base[k]);
  const canStatus = !plan || plan.assignee.id === me;
  const locked = Boolean(plan) && !canEdit;

  const save = useMutation({
    mutationFn: (body) => (plan ? api.updatePlan(plan._id, body) : api.createPlans({ ...body, products: [form.product] })),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      if (res.driveWarning) toast("Đã thêm kế hoạch", { tone: "danger", detail: res.driveWarning });
      else toast(plan ? "Đã lưu kế hoạch" : "Đã thêm kế hoạch");
      onSaved?.();
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  function submit() {
    if (!form.product) return toast("Chọn sản phẩm cần làm video.", { tone: "danger" });
    if (!form.assignee) return toast("Chọn người thực hiện.", { tone: "danger" });
    // Without plan.edit only the status may change, so the rest is not sent.
    const body = locked ? {} : { assignee: form.assignee, dueDate: form.dueDate };
    // A saved row only sends the status when it changed: others may edit the rest but not the status.
    if (!plan || form.status !== base.status) body.status = form.status;
    save.mutate(body);
  }
  const progress = plan && progressOf(plan);

  const overdue = form.status !== "done" && form.dueDate && form.dueDate < today;
  return (
    <tr className={[!plan && "is-draft", plan?.status === "done" && "is-done", dirty && plan && "is-dirty", selected && "is-selected"].filter(Boolean).join(" ")}>
      <td className="plan-check">
        {plan && canDelete && (
          <label>
            <input type="checkbox" checked={selected} onChange={(e) => onSelect(plan, e.target.checked)} aria-label={`Chọn kế hoạch ${plan.product.name}`} />
            <span className="plan-check-text">Chọn</span>
          </label>
        )}
      </td>
      <td data-label="Sản phẩm" className="plan-product-cell">
        {plan && plan.product.name.startsWith("(") ? (
          <span className="hint">{plan.product.name}</span>
        ) : locked ? (
          <span>{plan.product.name}</span>
        ) : (
          <ProductPicker value={form.product} onChange={(p) => set("product")(p?._id || null)} placeholder="Chọn sản phẩm" label="Sản phẩm" />
        )}
        {progress && (
          <span className={`plan-files ${progress.have === progress.total ? "is-full" : ""}`}>
            Đã có {progress.have}/{progress.total} mục
          </span>
        )}
      </td>
      <td data-label="Người thực hiện">
        <MemberSelect value={form.assignee} onChange={set("assignee")} members={members} me={me} emptyLabel={form.assignee ? undefined : "Chọn người"} label="Người thực hiện" disabled={locked} />
      </td>
      <td data-label="Hạn">
        <div className="plan-due">
          <input className="input" type="date" aria-label="Hạn hoàn thành" value={form.dueDate} disabled={locked} onChange={(e) => set("dueDate")(e.target.value)} />
          {overdue && <span className="plan-overdue">Quá hạn</span>}
        </div>
      </td>
      <td data-label="Trạng thái">
        <div className="status-edit" title={canStatus ? undefined : `Chỉ ${plan.assignee.displayName} cập nhật được trạng thái`}>
          <select
            className={`input status-select status-${STATUS[form.status].tone}`}
            aria-label="Trạng thái"
            value={form.status}
            disabled={!canStatus}
            onChange={(e) => set("status")(e.target.value)}
          >
            {Object.entries(STATUS).map(([v, s]) => (
              <option key={v} value={v}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td className="plan-actions">
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
        {(!plan || canDelete) && (
          <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => onDelete(plan)}>
            Xoá
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
            {canEdit && !plan.product.name.startsWith("(") && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onCopy(plan)}>
                Sao chép
              </button>
            )}
            <Link className="btn btn-sm btn-ghost" to={`/?product=${plan.product._id}`}>
              Tạo prompt
            </Link>
          </>
        )}
      </td>
    </tr>
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

  // New rows not saved yet, newest on top.
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
  const pct = sum?.plans ? Math.round((sum.finished / sum.plans) * 100) : 0;
  const showTable = items.length > 0 || drafts.length > 0;

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
              <b>{sum.plans}</b> kế hoạch · <b>{sum.finished}</b> đã hoàn thành ({pct}%)
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
        <div className="plist" aria-busy="true">
          <Skeleton h={64} r={14} />
          <Skeleton h={64} r={14} />
          <Skeleton h={64} r={14} />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !showTable ? (
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
            {canEdit ? "Thêm một dòng, chọn sản phẩm, người thực hiện và hạn rồi bấm Lưu. Bấm Chi tiết để tải video, mp3 và nhập lời đọc." : "Khi có kế hoạch video, chúng sẽ hiện ở đây."}
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
          <div className={`card ptable-wrap ${isPlaceholderData ? "is-stale" : ""}`} aria-busy={isFetching}>
            <table className="ptable">
              <thead>
                <tr>
                  <th className="plan-check">
                    {canDelete && (
                      <input
                        type="checkbox"
                        aria-label="Chọn mọi kế hoạch trên trang này"
                        checked={pageAllOn}
                        ref={(el) => el && (el.indeterminate = !pageAllOn && items.some((p) => selected.has(p._id)))}
                        onChange={(e) => selectPage(e.target.checked)}
                        disabled={!items.length}
                      />
                    )}
                  </th>
                  <th>Sản phẩm</th>
                  <th>Người thực hiện</th>
                  <th>Hạn</th>
                  <th>Trạng thái</th>
                  <th>
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((key) => (
                  <PlanRow key={key} plan={null} members={members} me={user?.id} today={today} onSaved={() => dropDraft(key)} onDelete={() => dropDraft(key)} canEdit />
                ))}
                {items.map((p) => (
                  <PlanRow key={p._id} plan={p} members={members} me={user?.id} today={data.today || today} onDelete={setDeleting} onCopy={setCopying} selected={selected.has(p._id)} onSelect={select} canEdit={canEdit} canDelete={canDelete} />
                ))}
              </tbody>
            </table>
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
