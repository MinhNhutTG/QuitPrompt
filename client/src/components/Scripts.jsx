import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { useCan } from "../auth.jsx";
import { useScripts } from "../lib/queries.js";
import { copyText, fmtDate } from "../lib/util.js";
import { ConfirmButton, EmptyState, ErrorState, Field, Seg, Skeleton } from "./ui.jsx";
import { useToast } from "./Toast.jsx";

// Saved voice-overs and captions of a product ("Lời đọc & mô tả video"). Each one is a pair, or a caption alone;
// Chưa dùng until a plan takes it (or someone marks it by hand), then Đã dùng.

const short = (s, n) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

// One line naming a saved pair, for pickers.
export const scriptLabel = (s, n = 60) => (s.voiceText ? short(s.voiceText, n) : `(chỉ mô tả) ${short(s.caption, n)}`);

const refresh = (qc, productId) => qc.invalidateQueries({ queryKey: ["product", productId, "scripts"] });

function ScriptForm({ productId, script, onDone }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [voiceText, setVoice] = useState(script?.voiceText || "");
  const [caption, setCaption] = useState(script?.caption || "");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => (script ? api.updateScript(productId, script._id, { voiceText, caption }) : api.createScript(productId, { voiceText, caption })),
    onSuccess: () => {
      refresh(qc, productId);
      if (script) {
        toast("Đã lưu thay đổi");
        onDone();
      } else {
        // Many are usually written at once: the form stays open for the next one.
        toast("Đã lưu, nhập tiếp cặp khác hoặc bấm Đóng");
        setVoice("");
        setCaption("");
      }
    },
    onError: (e) => setError(e.message),
  });
  return (
    <form
      className="form script-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!caption.trim()) return setError("Cần nhập mô tả video.");
        setError("");
        save.mutate();
      }}
    >
      <Field label="Lời đọc" hint="Không bắt buộc: để trống nếu chỉ lưu mô tả video.">
        <textarea className="input" rows={4} maxLength={5000} value={voiceText} onChange={(e) => setVoice(e.target.value)} autoFocus placeholder="Nội dung giọng đọc của video..." />
      </Field>
      <Field label="Mô tả video" hint="Caption, hashtag đăng kèm video.">
        <textarea className="input" rows={4} maxLength={5000} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Mô tả đăng kèm video..." />
      </Field>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="btns btns-end">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {script ? "Huỷ" : "Đóng"}
        </button>
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? "Đang lưu..." : script ? "Lưu thay đổi" : "Lưu"}
        </button>
      </div>
    </form>
  );
}

function ScriptText({ label, text }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  async function copy() {
    const ok = await copyText(text);
    toast(ok ? `Đã copy ${label.toLowerCase()}` : "Trình duyệt chặn copy. Bôi đen rồi nhấn Ctrl/Cmd+C.", { tone: ok ? "ok" : "danger" });
  }
  return (
    <div className="script-text">
      <div className="script-text-h">
        <b>{label}</b>
        <button type="button" className="btn btn-sm btn-ghost" onClick={copy}>
          Copy
        </button>
      </div>
      <p className={open ? "" : "is-clamped"} onClick={() => setOpen((v) => !v)} title={open ? "Bấm để thu gọn" : "Bấm để xem hết"}>
        {text}
      </p>
    </div>
  );
}

function ScriptCard({ productId, script, editable }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const mark = useMutation({
    mutationFn: (used) => api.updateScript(productId, script._id, { used }),
    onSuccess: ({ item }) => {
      refresh(qc, productId);
      toast(item.used ? "Đã đánh dấu đã dùng" : "Đã đánh dấu chưa dùng");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteScript(productId, script._id),
    onSuccess: () => {
      refresh(qc, productId);
      toast("Đã xoá");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  if (editing) return <li className="script card">{<ScriptForm productId={productId} script={script} onDone={() => setEditing(false)} />}</li>;
  return (
    <li className={`script card ${script.used ? "is-used" : ""}`}>
      <div className="script-head">
        <span className={`badge script-status ${script.used ? "status-done" : "status-todo"}`}>{script.used ? "Đã dùng" : "Chưa dùng"}</span>
        <span className="hint">
          {script.used && script.usedAt ? `dùng ${fmtDate(script.usedAt)}` : `lưu ${fmtDate(script.createdAt)} · ${script.createdBy.displayName}`}
          {script.usedPlan && (
            <>
              {" · "}
              <Link to={`/plans/${script.usedPlan}`}>xem kế hoạch</Link>
            </>
          )}
        </span>
      </div>
      {script.voiceText ? <ScriptText label="Lời đọc" text={script.voiceText} /> : <p className="hint">Chỉ có mô tả video, không có lời đọc.</p>}
      <ScriptText label="Mô tả video" text={script.caption} />
      {editable && (
        <div className="btns">
          <button type="button" className="btn btn-sm" onClick={() => mark.mutate(!script.used)} disabled={mark.isPending}>
            {script.used ? "Đánh dấu chưa dùng" : "Đánh dấu đã dùng"}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>
            Sửa
          </button>
          <ConfirmButton className="btn btn-sm btn-danger-ghost" onConfirm={() => remove.mutate()} disabled={remove.isPending}>
            Xoá
          </ConfirmButton>
        </div>
      )}
    </li>
  );
}

const FILTERS = [
  { value: "unused", label: "Chưa dùng" },
  { value: "used", label: "Đã dùng" },
  { value: "all", label: "Tất cả" },
];

// The section on the product page.
export function ProductScripts({ productId }) {
  const { data, isLoading, error, refetch } = useScripts(productId);
  const editable = useCan()("product.edit");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("unused");
  const items = data?.items || [];
  const nUsed = items.filter((s) => s.used).length;
  const shown = items.filter((s) => filter === "all" || (filter === "used") === s.used);
  const addButton = editable && !adding && (
    <button type="button" className="btn" onClick={() => setAdding(true)}>
      + Thêm lời đọc
    </button>
  );

  return (
    <section className="sec scripts">
      <div className="page-head">
        <div>
          <h2>Lời đọc & mô tả video</h2>
          <p className="hint">
            {items.length ? `${items.length - nUsed} chưa dùng · ${nUsed} đã dùng. ` : ""}Lưu sẵn để khi tạo kế hoạch chỉ cần chọn, không phải viết lại.
          </p>
        </div>
        {addButton}
      </div>
      {adding && (
        <div className="card">
          <ScriptForm productId={productId} onDone={() => setAdding(false)} />
        </div>
      )}
      {isLoading ? (
        <Skeleton h={120} r={14} />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !items.length ? (
        !adding && <EmptyState title="Chưa lưu lời đọc nào">Mỗi lần viết được nhiều lời đọc và mô tả video, lưu hết ở đây. Cặp nào được chọn cho kế hoạch sẽ tự chuyển sang “Đã dùng”.</EmptyState>
      ) : (
        <>
          <Seg name={`scripts-${productId}`} label="Lọc theo trạng thái" value={filter} onChange={setFilter} options={FILTERS} />
          {shown.length ? (
            <ul className="scripts-list">
              {shown.map((s) => (
                <ScriptCard key={s._id} productId={productId} script={s} editable={editable} />
              ))}
            </ul>
          ) : (
            <p className="hint">{filter === "unused" ? "Đã dùng hết. Thêm lời đọc mới hoặc xem mục Đã dùng." : "Chưa có cặp nào đã dùng."}</p>
          )}
        </>
      )}
    </section>
  );
}

// A select of the product's saved pairs, not used yet first. value = script id or "".
export function ScriptSelect({ productId, value, onChange, disabled }) {
  const { data, isLoading } = useScripts(productId);
  const items = data?.items || [];
  if (!productId) return null;
  const unused = items.filter((s) => !s.used);
  const used = items.filter((s) => s.used);
  return (
    <select className="input" aria-label="Lời đọc và mô tả video" value={value} disabled={disabled || isLoading} onChange={(e) => onChange(e.target.value)}>
      <option value="">{isLoading ? "Đang tải..." : items.length ? "Không chọn lời đọc" : "Sản phẩm chưa lưu lời đọc"}</option>
      {unused.length > 0 && (
        <optgroup label={`Chưa dùng (${unused.length})`}>
          {unused.map((s) => (
            <option key={s._id} value={s._id}>
              {scriptLabel(s, 50)}
            </option>
          ))}
        </optgroup>
      )}
      {used.length > 0 && (
        <optgroup label={`Đã dùng (${used.length})`}>
          {used.map((s) => (
            <option key={s._id} value={s._id}>
              {scriptLabel(s, 50)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// For a saved plan: pick one of its product's pairs to fill both texts.
export function PickScript({ plan, onPicked, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const productId = plan.product._id;
  const { data, isLoading, error, refetch } = useScripts(productId);
  const items = data?.items || [];
  const pick = useMutation({
    mutationFn: (id) => api.updatePlan(plan._id, { script: id }),
    onSuccess: ({ item }) => {
      refresh(qc, productId);
      onPicked(item);
      toast("Đã điền lời đọc và mô tả");
      onClose();
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });
  if (isLoading) return <Skeleton h={120} r={14} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!items.length)
    return (
      <EmptyState title="Sản phẩm chưa lưu lời đọc nào" action={<Link className="btn btn-primary" to={`/products/${productId}`}>Mở trang sản phẩm</Link>}>
        Lưu lời đọc và mô tả video ở trang chi tiết sản phẩm, rồi quay lại chọn.
      </EmptyState>
    );
  return (
    <div className="stack">
      {(plan.voiceText || plan.caption) && <p className="notice">Chọn một cặp sẽ thay lời đọc và mô tả hiện có của kế hoạch.</p>}
      <ul className="scripts-list">
        {items.map((s) => (
          <li key={s._id} className={`script card ${s.used ? "is-used" : ""}`}>
            <div className="script-head">
              <span className={`badge script-status ${s.used ? "status-done" : "status-todo"}`}>{s.used ? "Đã dùng" : "Chưa dùng"}</span>
              <span className="grow" />
              <button type="button" className="btn btn-sm btn-primary" onClick={() => pick.mutate(s._id)} disabled={pick.isPending}>
                Dùng cặp này
              </button>
            </div>
            {s.voiceText ? <ScriptText label="Lời đọc" text={s.voiceText} /> : <p className="hint">Chỉ có mô tả video.</p>}
            <ScriptText label="Mô tả video" text={s.caption} />
          </li>
        ))}
      </ul>
    </div>
  );
}
