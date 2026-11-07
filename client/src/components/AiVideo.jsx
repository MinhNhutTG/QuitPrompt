import { useEffect, useMemo, useState } from "react";
import { useCan } from "../auth.jsx";
import { buildIndex } from "../lib/actions.js";
import { DEFAULT_STATE, DURATIONS, KINDS, buildPrompt, normalizeSettings, sanitizeIds, shuffleChain } from "../lib/prompt.js";
import { useSettings } from "../lib/queries.js";
import { SLOTS } from "../lib/plans.js";
import { store } from "../lib/util.js";
import { Field, Seg, Tabs } from "./ui.jsx";
import FileSlot from "./FileSlot.jsx";
import Sequence from "./Sequence.jsx";
import PromptPanel from "./PromptPanel.jsx";
import SavePromptDialog from "./SavePromptDialog.jsx";

// Step 3 of "Ảnh & video AI" (doc 09 §4b): the "Tạo prompt" builder right on the plan, one prompt per clip.
// Model, duration and options are shared by both parts; each part has its own action chain, and Part 2 starts with
// "Nối tiếp clip trước" on so it continues from Part 1's last frame. Kept per plan in this browser only.

const CLIPS = SLOTS.filter((s) => s.key === "clip1" || s.key === "clip2");
const PARTS = [1, 2];
const OWN_KEYS = ["open", "mid", "end", "endOn", "style", "cont"]; // per part; everything else is shared

const own = (s) => Object.fromEntries(OWN_KEYS.map((k) => [k, s[k]]));
const shared = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => !OWN_KEYS.includes(k)));

function initial(plan) {
  const s1 = { ...DEFAULT_STATE, closed: plan.product.closed !== false, extraNeg: plan.product.extraNeg || "" };
  return { base: shared(s1), parts: { 1: own(s1), 2: { ...own(shuffleChain(s1)), cont: true } } };
}

function load(plan) {
  const start = initial(plan);
  const saved = store.get(`aiflow:${plan._id}`, null);
  if (!saved?.base || !saved?.parts) return start;
  const part = (p) => own(normalizeSettings({ ...saved.base, ...start.parts[p], ...saved.parts[p] }));
  return { base: shared(normalizeSettings({ ...start.base, ...saved.base })), parts: { 1: part(1), 2: part(2) } };
}

export default function AiVideo({ plan, ai, slotProps, imageTo, copy, dolaUrl }) {
  const can = useCan();
  const [st, setSt] = useState(() => load(plan));
  const [part, setPart] = useState(1);
  const [saving, setSaving] = useState(false);
  useEffect(() => store.set(`aiflow:${plan._id}`, st), [plan._id, st]);

  const { data: settings } = useSettings();
  const index = useMemo(() => buildIndex(settings?.customActions), [settings]);

  const stateOf = (p) => {
    const s = { ...DEFAULT_STATE, ...st.base, ...st.parts[p], productId: plan.product._id };
    return settings ? sanitizeIds(s, index) : s;
  };
  const results = useMemo(
    () => Object.fromEntries(PARTS.map((p) => [p, buildPrompt(stateOf(p), index, { template: settings?.template, negative: settings?.negative })])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st, index, settings]
  );
  const state = stateOf(part);
  const result = results[part];

  // Same contract as the builder page's set(): a patch or a function of the current state.
  const set = (patch) =>
    setSt((s) => {
      const cur = { ...DEFAULT_STATE, ...s.base, ...s.parts[part] };
      const p = typeof patch === "function" ? patch(cur) : patch;
      const base = { ...s.base };
      const mine = { ...s.parts[part] };
      for (const [k, v] of Object.entries(p)) (OWN_KEYS.includes(k) ? mine : base)[k] = v;
      return { base, parts: { ...s.parts, [part]: mine } };
    });

  return (
    <>
      <Tabs label="Prompt cho clip" value={part} onChange={setPart} tabs={PARTS.map((p) => ({ id: p, label: `Prompt Part ${p}` }))} />

      <div className="grid-2 builder aiflow-builder">
        <div>
          <div className="sec">
            <h3 className="sec-h">Người mẫu và thời lượng</h3>
            <div className="row">
              <span className="row-label">Kiểu video</span>
              <Seg name="aiflow-kind" label="Kiểu video" value={state.kind} onChange={(kind) => set({ kind })} options={KINDS} />
            </div>
            {state.kind === "selfie" && <p className="hint">Người mẫu cầm điện thoại tay phải che kín mặt suốt clip, chỉ tay trái cử động.</p>}
            <div className="row">
              <span className="row-label">Người mẫu</span>
              <Seg
                name="aiflow-gender"
                label="Người mẫu"
                value={state.gender}
                onChange={(gender) => set({ gender })}
                options={[
                  { value: "f", label: "Nữ" },
                  { value: "m", label: "Nam" },
                ]}
              />
            </div>
            <div className="row">
              <span className="row-label">Thời lượng</span>
              <Seg name="aiflow-dur" label="Thời lượng" value={state.dur} onChange={(dur) => set({ dur })} options={DURATIONS.map((d) => ({ value: d, label: `${d} giây` }))} />
            </div>
            <p className="hint">Mấy lựa chọn này và phần Tuỳ chọn dùng chung cho cả 2 part, chuỗi động tác thì mỗi part một chuỗi.</p>
          </div>

          <Sequence key={part} state={state} set={set} index={index} result={result} />

          <div className="sec">
            <h3 className="sec-h">Tuỳ chọn</h3>
            <div className="row">
              <label className="check">
                <input type="checkbox" checked={state.closed} onChange={(e) => set({ closed: e.target.checked })} />
                Áo luôn đóng
              </label>
              <label className="check">
                <input type="checkbox" checked={state.cont} onChange={(e) => set({ cont: e.target.checked })} />
                Nối tiếp clip trước
              </label>
            </div>
            <Field label="Âm thanh">
              <select className="input" value={state.audio} onChange={(e) => set({ audio: e.target.value })}>
                <option value="none">Không có</option>
                <option value="amb">Tiếng môi trường nhẹ</option>
              </select>
            </Field>
            <Field label="Lỗi riêng cần chặn" hint="Tiếng Anh, cách nhau bằng dấu phẩy. Thêm vào câu “No...” cuối prompt.">
              <input className="input" value={state.extraNeg} maxLength={1000} placeholder="shrinking brim, missing drawstring" onChange={(e) => set({ extraNeg: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="card slate ink">
          <PromptPanel result={result} onSave={can("prompt.save") ? () => setSaving(true) : undefined} />
        </div>
      </div>

      <div className="btns">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => imageTo(ai, dolaUrl, "Dola")}>
          Copy ảnh AI và mở Dola
        </button>
      </div>
      <ul className="slots">
        {CLIPS.map((c, i) => (
          <FileSlot
            key={c.key}
            {...slotProps}
            slot={c}
            extra={
              <button type="button" className="btn btn-sm" onClick={() => copy(results[i + 1].prompt, `prompt Part ${i + 1}`)}>
                Copy prompt Part {i + 1}
              </button>
            }
          />
        ))}
      </ul>
      <p className="hint">Mở Dola, dán ảnh AI, rồi dán prompt Part 1 (negative ở khung tối bên trên). Part 2 nối tiếp khung cuối của Part 1. Tạo 3–4 lần mỗi clip rồi chọn bản đẹp nhất, che watermark Dola trước khi đăng.</p>

      <SavePromptDialog open={saving} onClose={() => setSaving(false)} state={state} result={result} onSaved={() => {}} />
    </>
  );
}
