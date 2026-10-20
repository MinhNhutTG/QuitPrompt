import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { mapCachedPrompts } from "../lib/queries.js";
import { fmtDateTime } from "../lib/util.js";
import { ConfirmButton } from "./ui.jsx";
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

function NoteEditor({ item, onDone }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState(item.note || "");
  const [tool, setTool] = useState(item.tool || "");
  const save = useMutation({
    mutationFn: () => api.updatePrompt(item._id, { note, tool }),
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
        save.mutate();
      }}
    >
      <input className="input" aria-label="Công cụ" placeholder="Công cụ" value={tool} maxLength={60} onChange={(e) => setTool(e.target.value)} />
      <textarea className="input" aria-label="Ghi chú" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
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

export default function PromptCard({ item, showProduct = false }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { flash, copy } = useCopy();
  const [editing, setEditing] = useState(false);
  const product = item.product || {};

  const remove = useMutation({
    mutationFn: () => api.deletePrompt(item._id),
    onSuccess: () => {
      mapCachedPrompts(qc, (items) => items.filter((x) => x._id !== item._id));
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", product._id] });
      toast("Đã xoá");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  const reuse = () => navigate("/", { state: { reuse: { productId: product._id, settings: item.settings } } });

  return (
    <article className="card pc">
      {showProduct && (
        <Link to={`/products/${product._id}`} className="pc-prod">
          <LazyImage image={product.images?.[0]} width={36} ratio="1 / 1" />
          <span>
            {product.name}
            {product.sku && <small className="hint"> · {product.sku}</small>}
          </span>
        </Link>
      )}
      <div className="pc-meta">
        <span>{fmtDateTime(item.createdAt)}</span>
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
        <button type="button" className="btn btn-sm" onClick={reuse}>
          Dùng lại và chỉnh
        </button>
        {!editing && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>
            Sửa ghi chú
          </button>
        )}
        <ConfirmButton className="btn btn-sm btn-danger-ghost" onConfirm={() => remove.mutate()} disabled={remove.isPending}>
          Xoá
        </ConfirmButton>
      </div>
    </article>
  );
}
