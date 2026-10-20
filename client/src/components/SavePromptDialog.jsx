import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { snapshot } from "../lib/prompt.js";
import { store } from "../lib/util.js";
import { Field, Modal } from "./ui.jsx";
import ProductPicker from "./ProductPicker.jsx";
import { useToast } from "./Toast.jsx";

const TOOLS = ["Meta AI", "Dola AI", "Kling AI", "Google Veo", "Hailuo AI", "Runway"];

function SaveForm({ state, result, onClose, onSaved }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [productId, setProductId] = useState(state.productId);
  const [newName, setNewName] = useState("");
  const [tool, setTool] = useState(() => store.get("lastTool", "Meta AI"));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.createPrompt({
        ...(productId ? { product: productId } : { productName: newName }),
        prompt: result.prompt,
        negative: result.negative,
        note,
        tool,
        settings: snapshot(state),
      }),
    onSuccess: (res) => {
      store.set("lastTool", tool);
      qc.invalidateQueries({ queryKey: ["prompts"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", res.product._id] });
      toast(`Đã lưu cho ${res.product.name}`, { action: { label: "Xem", to: `/products/${res.product._id}` } });
      onSaved(res.product);
    },
    onError: (e) => setError(e.message),
  });

  const createNow = (name) => {
    // Picking "Tạo sản phẩm ..." here only marks the name; the server creates it when saving.
    setProductId(null);
    setNewName(name);
  };

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!productId && !newName) return setError("Chọn sản phẩm hoặc gõ tên sản phẩm mới.");
        setError("");
        save.mutate();
      }}
    >
      <Field label="Sản phẩm">
        <ProductPicker
          value={productId}
          pendingName={productId ? "" : newName}
          onChange={(p) => {
            setProductId(p?._id || null);
            setNewName("");
          }}
          onCreate={createNow}
        />
      </Field>
      <Field label="Công cụ đã dùng">
        <input className="input" list="tool-list" value={tool} maxLength={60} onChange={(e) => setTool(e.target.value)} />
        <datalist id="tool-list">
          {TOOLS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>
      <Field label="Ghi chú" hint="Ví dụ: ra đẹp lần đầu, tay không lỗi">
        <textarea className="input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
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
          {save.isPending ? "Đang lưu..." : "Lưu prompt"}
        </button>
      </div>
    </form>
  );
}

export default function SavePromptDialog({ open, onClose, state, result, onSaved }) {
  return (
    <Modal open={open} onClose={onClose} title="Lưu prompt tốt">
      <SaveForm state={state} result={result} onClose={onClose} onSaved={(p) => (onSaved?.(p), onClose())} />
    </Modal>
  );
}
