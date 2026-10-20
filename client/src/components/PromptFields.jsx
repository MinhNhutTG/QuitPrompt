import { useId } from "react";
import { Field } from "./ui.jsx";

export const TOOLS = ["Meta AI", "Dola AI", "Kling AI", "Google Veo", "Hailuo AI", "Runway"];

export const EMPTY_EXTERNAL = { prompt: "", negative: "", tool: "", note: "" };

// "...prompt...\n\nNegative prompt: a, b" → { prompt, negative }. Many tools copy both as one block.
export function splitNegative(text) {
  const m = /\n\s*negative(?:\s+prompt)?\s*:\s*/i.exec(text);
  if (!m) return null;
  return { prompt: text.slice(0, m.index).trim(), negative: text.slice(m.index + m[0].length).trim() };
}

export function ToolInput({ value, onChange }) {
  const listId = useId();
  return (
    <>
      <input className="input" list={listId} value={value} maxLength={60} placeholder="Meta AI" onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {TOOLS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}

// Fields for a prompt written outside the builder. value: { prompt, negative, tool, note }
export function ExternalPromptFields({ value, onChange, autoFocus }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  return (
    <>
      <Field label="Prompt" hint="Dán nguyên văn prompt đã ra video đẹp, viết theo cấu trúc nào cũng được.">
        <textarea
          className="input mono"
          rows={9}
          maxLength={20000}
          spellCheck={false}
          autoFocus={autoFocus}
          value={value.prompt}
          onChange={(e) => {
            const text = e.target.value;
            const split = !value.negative && splitNegative(text);
            onChange(split ? { ...value, ...split } : { ...value, prompt: text });
          }}
        />
      </Field>
      <Field label="Negative" hint="Không bắt buộc. Có dòng “Negative prompt:” trong đoạn dán thì app tự tách sang đây.">
        <textarea className="input mono" rows={3} maxLength={5000} spellCheck={false} value={value.negative} onChange={(e) => set("negative")(e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Công cụ đã dùng">
          <ToolInput value={value.tool} onChange={set("tool")} />
        </Field>
        <Field label="Ghi chú">
          <input className="input" maxLength={1000} placeholder="Ra đẹp lần đầu" value={value.note} onChange={(e) => set("note")(e.target.value)} />
        </Field>
      </div>
    </>
  );
}

export const externalBody = (productId, v) => ({
  product: productId,
  source: "external",
  prompt: v.prompt.trim(),
  negative: v.negative.trim(),
  tool: v.tool.trim(),
  note: v.note.trim(),
});
