import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { mapCachedPrompts } from "../lib/queries.js";
import { fmtDateTime, fmtDateTimeFull } from "../lib/util.js";
import { Field, Modal } from "./ui.jsx";
import { ToolInput } from "./PromptFields.jsx";
import LazyImage from "./LazyImage.jsx";
import { useCopy, withNegative } from "./PromptPanel.jsx";
import { useToast } from "./Toast.jsx";

function summary(settings = {}) {
  const parts = [];
  if (settings.dur) parts.push(`${settings.dur} giây`);
  if (settings.open || Array.isArray(settings.mid)) {
    const n = (settings.open ? 1 : 0) + (settings.mid?.length || 0) + (settings.endOn ? 1 : 0);
    parts.push(`${n} động tác`);
  } else if (Array.isArray(settings.beats)) {
    parts.push(`${settings.beats.length} động tác`);
  }
  return parts;
}

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

const ProductLabel = ({ product }) => (
  <>
    <LazyImage image={product.images?.[0]} width={36} ratio="1 / 1" />
    <span>
      {product.name}
      {product.sku && <small className="hint"> · {product.sku}</small>}
    </span>
  </>
);

export default function PromptCard({ item, showProduct = false }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { flash, copy } = useCopy();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const product = item.product || {};

  const remove = useMutation({
    mutationFn: () => api.deletePrompt(item._id),
    onSuccess: () => {
      mapCachedPrompts(qc, (items) => items.filter((x) => x._id !== item._id));
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", product._id] });
      setConfirming(false);
      toast("Đã xoá");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  // Another member's prompt points at their product, which the viewer can't open: reuse only the choices.
  const mine = item.mine !== false;
  const reuse = () => navigate("/", { state: { reuse: { productId: mine ? product._id : null, settings: item.settings } } });
  // Pasted prompts (and some imported ones) have no builder choices to load back.
  const canReuse = item.source !== "external" && item.settings && Object.keys(item.settings).length > 0;
  const external = item.source === "external";
  // More than a minute apart: the note, tool or text was edited after saving.
  const edited = item.updatedAt && item.createdAt && new Date(item.updatedAt) - new Date(item.createdAt) > 60 * 1000;

  return (
    <article className="card pc">
      {showProduct &&
        (mine ? (
          <Link to={`/products/${product._id}`} className="pc-prod">
            <ProductLabel product={product} />
          </Link>
        ) : (
          <div className="pc-prod">
            <ProductLabel product={product} />
          </div>
        ))}
      <div className="pc-meta">
        <span>
          Lưu bởi <b className="pc-who">{mine ? "bạn" : item.savedBy?.displayName}</b> ·{" "}
          <time dateTime={item.createdAt} title={fmtDateTimeFull(item.createdAt)}>
            {fmtDateTimeFull(item.createdAt)}
          </time>
        </span>
        {edited && (
          <span title={fmtDateTimeFull(item.updatedAt)}>
            sửa lúc <time dateTime={item.updatedAt}>{fmtDateTime(item.updatedAt)}</time>
          </span>
        )}
        {external && <span className="badge">Dán từ ngoài</span>}
        {item.tool && <span>{item.tool}</span>}
        {summary(item.settings).map((s) => (
          <span key={s}>{s}</span>
        ))}
        {flash && <span className="ok-text">Đã copy</span>}
      </div>
      {editing ? (
        <NoteEditor item={item} onDone={() => setEditing(false)} />
      ) : (
        item.note && <p className="pc-note">{item.note}</p>
      )}
      <details>
        <summary>Xem prompt</summary>
        <pre className="out" tabIndex={0}>
          {item.prompt}
        </pre>
        {item.negative && (
          <pre className="out out-neg" tabIndex={0}>
            {item.negative}
          </pre>
        )}
      </details>
      <div className="btns">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => copy(item.prompt, "p")}>
          Copy prompt
        </button>
        {item.negative && (
          <button type="button" className="btn btn-sm" onClick={() => copy(withNegative(item.prompt, item.negative), "all")}>
            Copy + negative
          </button>
        )}
        {canReuse && (
          <button type="button" className="btn btn-sm" onClick={reuse}>
            Dùng lại và chỉnh
          </button>
        )}
        {mine && !editing && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>
            {external ? "Sửa" : "Sửa ghi chú"}
          </button>
        )}
        <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => setConfirming(true)}>
          Xoá
        </button>
      </div>
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
