import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { useCan } from "../auth.jsx";
import { mapCachedPrompts } from "../lib/queries.js";
import { fmtDateTime, fmtDateTimeFull } from "../lib/util.js";
import { Field, Modal } from "./ui.jsx";
import { ToolInput } from "./PromptFields.jsx";
import LazyImage from "./LazyImage.jsx";
import { useCopy, withNegative } from "./PromptPanel.jsx";
import { useToast } from "./Toast.jsx";

// Builder prompts can be rebuilt from settings, so only their note and tool are editable;
// pasted ones have nothing to rebuild from, so their text is editable too.
function NoteEditor({ item, onDone }) {
  const qc = useQueryClient();
  const toast = useToast();
  const external = item.source === "external";
  const [note, setNote] = useState(item.note || "");
  const [tool, setTool] = useState(item.tool || "");
  const [prompt, setPrompt] = useState(item.prompt || "");
  const [negative, setNegative] = useState(item.negative || "");
  const save = useMutation({
    mutationFn: () => api.updatePrompt(item._id, external ? { note, tool, prompt, negative } : { note, tool }),
    onSuccess: ({ item: updated }) => {
      mapCachedPrompts(qc, (items) => items.map((x) => (x._id === updated._id ? updated : x)));
      toast("Đã lưu");
      onDone();
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (external && !prompt.trim()) return toast("Prompt không được để trống.", { tone: "danger" });
        save.mutate();
      }}
    >
      {external && (
        <>
          <Field label="Prompt">
            <textarea className="input mono" rows={9} maxLength={20000} spellCheck={false} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </Field>
          <Field label="Negative">
            <textarea className="input mono" rows={3} maxLength={5000} spellCheck={false} value={negative} onChange={(e) => setNegative(e.target.value)} />
          </Field>
        </>
      )}
      <Field label="Công cụ">
        <ToolInput value={tool} onChange={setTool} />
      </Field>
      <Field label="Ghi chú">
        <textarea className="input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} autoFocus={!external} />
      </Field>
      <div className="btns">
        <button type="submit" className="btn btn-primary btn-sm" disabled={save.isPending}>
          {save.isPending ? "Đang lưu..." : "Lưu"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

const ICONS = {
  copy: "M10 8h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM15 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3",
  copyNeg: "M10 8h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM15 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M12 14h5",
  reuse: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  edit: "M4 20h4L19 9l-4-4L4 16ZM13.5 6.5l4 4",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6",
  view: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
};

// On phones only the icon shows (the label stays as aria-label and tooltip), plus the short `keep` text if given.
function Act({ icon, label, keep, className = "", ...props }) {
  return (
    <button type="button" className={`btn btn-sm pc-act ${keep ? "pc-keep" : ""} ${className}`} aria-label={label} title={label} {...props}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICONS[icon]} />
      </svg>
      <span className="pc-lbl">{label}</span>
      {keep && <span className="pc-short">{keep}</span>}
    </button>
  );
}

export default function PromptCard({ item, showProduct = false }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { copy } = useCopy();
  const can = useCan();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [viewing, setViewing] = useState(false);
  const product = item.product || {};

  const remove = useMutation({
    mutationFn: () => api.deletePrompt(item._id),
    onSuccess: () => {
      mapCachedPrompts(qc, (items) => items.filter((x) => x._id !== item._id));
      // Numbered pages refill from the next page and recount the total.
      qc.invalidateQueries({ queryKey: ["prompts", "page"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", product._id] });
      setConfirming(false);
      toast("Đã xoá");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  const mine = item.mine !== false;
  const canEdit = mine && can("prompt.save");
  const canDelete = can(mine ? "prompt.save" : "prompt.delete");
  const reuse = () => navigate("/", { state: { reuse: { productId: product._id, settings: item.settings } } });
  // Pasted prompts (and some imported ones) have no builder choices to load back.
  const canReuse = item.source !== "external" && item.settings && Object.keys(item.settings).length > 0;
  const external = item.source === "external";
  // More than a minute apart: the note, tool or text was edited after saving.
  const edited = item.updatedAt && item.createdAt && new Date(item.updatedAt) - new Date(item.createdAt) > 60 * 1000;
  const copyPrompt = () => copy(item.prompt, "p");
  const copyAll = () => copy(withNegative(item.prompt, item.negative), "all");

  const meta = (
    <div className="pc-meta">
      <span>
        <b className="pc-who">{mine ? "Bạn" : item.savedBy?.displayName}</b> ·{" "}
        <time dateTime={item.createdAt} title={fmtDateTimeFull(item.createdAt)}>
          {fmtDateTime(item.createdAt)}
        </time>
      </span>
    </div>
  );

  return (
    <article className="card pc">
      {showProduct ? (
        <div className="pc-head">
          <Link to={`/products/${product._id}`} className="pc-thumb" tabIndex={-1} aria-hidden="true">
            <LazyImage image={product.images?.[0]} width={44} ratio="1 / 1" />
          </Link>
          <div className="pc-title">
            <Link to={`/products/${product._id}`} className="pc-name">
              {product.name}
              {product.sku && <small className="hint"> · {product.sku}</small>}
            </Link>
            {meta}
          </div>
        </div>
      ) : (
        meta
      )}
      {editing ? <NoteEditor item={item} onDone={() => setEditing(false)} /> : item.note && <p className="pc-note">{item.note}</p>}
      <div className="pc-acts">
        <Act icon="view" label="Xem prompt" onClick={() => setViewing(true)} />
        <Act icon="copy" label="Copy prompt" keep="Copy" className="btn-primary" onClick={copyPrompt} />
        {item.negative && <Act icon="copyNeg" label="Copy + negative" onClick={copyAll} />}
        {canReuse && <Act icon="reuse" label="Dùng lại và chỉnh" onClick={reuse} />}
        {canEdit && !editing && <Act icon="edit" label={external ? "Sửa" : "Sửa ghi chú"} className="btn-ghost" onClick={() => setEditing(true)} />}
        {canDelete && <Act icon="trash" label="Xoá" className="btn-danger-ghost" onClick={() => setConfirming(true)} />}
      </div>
      <Modal open={viewing} onClose={() => setViewing(false)} title={product.name || "Prompt"} wide>
        <div className="pc-view">
          <div className="pc-meta">
            <span>
              Lưu bởi <b className="pc-who">{mine ? "bạn" : item.savedBy?.displayName}</b> · {fmtDateTimeFull(item.createdAt)}
            </span>
            {edited && <span title={fmtDateTimeFull(item.updatedAt)}>sửa lúc {fmtDateTime(item.updatedAt)}</span>}
            {external && <span className="badge">Dán từ ngoài</span>}
          </div>
          {item.note && <p className="pc-note">{item.note}</p>}
          <pre className="out" tabIndex={0}>
            {item.prompt}
          </pre>
          {item.negative && (
            <pre className="out out-neg" tabIndex={0}>
              {item.negative}
            </pre>
          )}
          <div className="btns">
            <button type="button" className="btn btn-primary" onClick={copyPrompt}>
              Copy prompt
            </button>
            {item.negative && (
              <button type="button" className="btn" onClick={copyAll}>
                Copy + negative
              </button>
            )}
            {canReuse && (
              <button type="button" className="btn" onClick={reuse}>
                Dùng lại và chỉnh
              </button>
            )}
          </div>
        </div>
      </Modal>
      <Modal open={confirming} onClose={() => setConfirming(false)} title="Xoá prompt này?">
        <p>
          {mine ? "Prompt của bạn" : <>Prompt do <b>{item.savedBy?.displayName}</b> lưu</>} cho <b>{product.name}</b> sẽ bị xoá với mọi
          thành viên và không khôi phục được.
        </p>
        <div className="btns">
          <button type="button" className="btn btn-danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {remove.isPending ? "Đang xoá..." : "Có, xoá"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} autoFocus>
            Không
          </button>
        </div>
      </Modal>
    </article>
  );
}
