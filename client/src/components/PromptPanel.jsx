import { useState } from "react";
import { copyText } from "../lib/util.js";
import { useToast } from "./Toast.jsx";
import LazyImage from "./LazyImage.jsx";

export const withNegative = (prompt, negative) => `${prompt}\n\nNegative prompt: ${negative}`;

export function useCopy() {
  const toast = useToast();
  const [flash, setFlash] = useState("");
  return {
    flash,
    copy: async (text, key) => {
      const ok = await copyText(text);
      toast(ok ? "Đã copy" : "Trình duyệt chặn copy. Bôi đen rồi nhấn Ctrl/Cmd+C.", { tone: ok ? "ok" : "danger" });
      if (ok) {
        setFlash(key);
        setTimeout(() => setFlash(""), 1600);
      }
    },
  };
}

export default function PromptPanel({ product, result, onSave }) {
  const { flash, copy } = useCopy();
  return (
    <>
      {product && (
        <div className="slate-product">
          <LazyImage image={product.images?.[0]} width={56} ratio="3 / 4" eager />
          <div>
            <b>{product.name}</b>
            <span className="hint">{product.sku ? `Mã ${product.sku} · ` : ""}đối chiếu với ảnh tham chiếu trước khi tạo video</span>
          </div>
        </div>
      )}
      <div className="sec">
        <div className="sec-h">
          Prompt {flash === "p" || flash === "all" ? <span className="ok-text">Đã copy</span> : null}
        </div>
        <pre className="out" tabIndex={0} aria-label="Prompt">
          {result.prompt}
        </pre>
        <div className="meta">
          <span>{result.words} từ</span>
          <span>9:16 · 1080p · 24fps</span>
        </div>
        <div className="btns">
          <button type="button" className="btn btn-primary" onClick={() => copy(result.prompt, "p")}>
            Copy prompt
          </button>
          <button type="button" className="btn" onClick={() => copy(withNegative(result.prompt, result.negative), "all")}>
            Copy + negative
          </button>
          <button type="button" className="btn btn-accent-soft" onClick={onSave}>
            ★ Lưu prompt tốt
          </button>
        </div>
      </div>
      <div className="sec">
        <div className="sec-h">Negative {flash === "n" ? <span className="ok-text">Đã copy</span> : null}</div>
        <pre className="out out-neg" tabIndex={0} aria-label="Negative prompt">
          {result.negative}
        </pre>
        <div className="btns">
          <button type="button" className="btn" onClick={() => copy(result.negative, "n")}>
            Copy negative
          </button>
        </div>
      </div>
      <div className="copybar">
        <button type="button" className="btn btn-primary" onClick={() => copy(result.prompt, "p")}>
          Copy prompt
        </button>
        <button type="button" className="btn" onClick={onSave} aria-label="Lưu prompt tốt">
          ★ Lưu
        </button>
      </div>
    </>
  );
}
