import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { buildIndex } from "../lib/actions.js";
import { FRAMINGS, NEGATIVE, PLACES, TYPES, buildDolaPrompt, dolaTypeOf } from "../lib/dola.js";
import { DEFAULT_STATE, DURATIONS, KINDS, buildPrompt, sanitizeIds, shuffleChain } from "../lib/prompt.js";
import { useSettings } from "../lib/queries.js";
import { SLOTS } from "../lib/plans.js";
import { fmtDate, store } from "../lib/util.js";
import { Field, Seg } from "./ui.jsx";
import FileSlot from "./FileSlot.jsx";
import Sequence from "./Sequence.jsx";

// Step 3 of "Ảnh & video AI" (doc 09 §4b): which prompt goes with the approved image into Dola for Part 1 and Part 2.
//   dola    the fixed Dola template (lib/dola.js), as on the "Video Dola" page
//   builder the "Tạo prompt" builder: one action chain per part, Part 2 continues from Part 1's last frame
//   saved   a prompt the team saved for this product, chosen per part
// The choices are kept per plan in this browser only.

const CLIPS = SLOTS.filter((s) => s.key === "clip1" || s.key === "clip2");
const PARTS = [1, 2];

const SOURCES = [
  { value: "dola", label: "Mẫu Dola" },
  { value: "builder", label: "Tạo prompt" },
  { value: "saved", label: "Prompt đã lưu" },
];

const CHAIN_KEYS = ["open", "mid", "end", "endOn"];
const pickChain = (s) => Object.fromEntries(CHAIN_KEYS.map((k) => [k, s[k]]));

function initial(plan) {
  const base = {
    kind: DEFAULT_STATE.kind,
    gender: DEFAULT_STATE.gender,
    dur: DEFAULT_STATE.dur,
    style: DEFAULT_STATE.style,
    audio: DEFAULT_STATE.audio,
    closed: plan.product.closed !== false,
    extraNeg: plan.product.extraNeg || "",
  };
  const first = pickChain(DEFAULT_STATE);
  return {
    source: "dola",
    type: dolaTypeOf(plan.product.category),
    framing: "waist-up",
    place: "outdoor",
    details: "",
    base,
    chains: { 1: first, 2: pickChain(shuffleChain({ ...DEFAULT_STATE, ...base })) },
    saved: { 1: "", 2: "" },
  };
}

function load(plan) {
  const start = initial(plan);
  const s = store.get(`aiflow:${plan._id}`, null);
  if (!s || typeof s !== "object") return start;
  const ok = (v, list) => list.some((o) => o.value === v);
  return {
    ...start,
    source: ok(s.source, SOURCES) ? s.source : start.source,
    type: ok(s.type, TYPES) ? s.type : start.type,
    framing: ok(s.framing, FRAMINGS) ? s.framing : start.framing,
    place: ok(s.place, PLACES) ? s.place : start.place,
    details: typeof s.details === "string" ? s.details : "",
    base: {
      ...start.base,
      ...(s.base && typeof s.base === "object" ? s.base : {}),
      kind: s.base?.kind === "selfie" ? "selfie" : "show",
      gender: s.base?.gender === "m" ? "m" : "f",
      dur: DURATIONS.includes(Number(s.base?.dur)) ? Number(s.base.dur) : start.base.dur,
    },
    chains: {
      1: { ...start.chains[1], ...s.chains?.[1], mid: Array.isArray(s.chains?.[1]?.mid) ? s.chains[1].mid : start.chains[1].mid },
      2: { ...start.chains[2], ...s.chains?.[2], mid: Array.isArray(s.chains?.[2]?.mid) ? s.chains[2].mid : start.chains[2].mid },
    },
    saved: { 1: String(s.saved?.[1] || ""), 2: String(s.saved?.[2] || "") },
  };
}

const savedLabel = (p) =>
  [fmtDate(p.createdAt), p.savedBy?.displayName, p.tool, p.note || p.prompt.slice(0, 60).replace(/\s+/g, " ") + "…"].filter(Boolean).join(" · ");

export default function AiVideo({ plan, ai, slotProps, imageTo, copy, dolaUrl }) {
  const [st, setSt] = useState(() => load(plan));
  const [editing, setEditing] = useState(1);
  useEffect(() => store.set(`aiflow:${plan._id}`, st), [plan._id, st]);
  const put = (patch) => setSt((s) => ({ ...s, ...patch }));

  const { data: settings } = useSettings();
  const index = useMemo(() => buildIndex(settings?.customActions), [settings]);

  const savedQ = useQuery({
    queryKey: ["prompts", "plan-pick", plan.product._id],
    queryFn: () => api.prompts({ product: plan.product._id, limit: 50 }),
    enabled: st.source === "saved",
  });
  const savedList = savedQ.data?.items || [];

  // The builder state of one part: shared options + that part's chain; Part 2 always continues from Part 1.
  const partState = (part) => {
    const s = { ...DEFAULT_STATE, ...st.base, ...st.chains[part], cont: part > 1 };
    return settings ? sanitizeIds(s, index) : s;
  };
  const built = useMemo(
    () => Object.fromEntries(PARTS.map((p) => [p, buildPrompt(partState(p), index, { template: settings?.template, negative: settings?.negative })])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.base, st.chains, index, settings]
  );

  // Sequence edits one part's chain; any shared option it touches (style) goes to base.
  const setPart = (patch) =>
    setSt((s) => {
      const cur = { ...DEFAULT_STATE, ...s.base, ...s.chains[editing] };
      const p = typeof patch === "function" ? patch(cur) : patch;
      const chain = { ...s.chains[editing] };
      const base = { ...s.base };
      for (const [k, v] of Object.entries(p)) (CHAIN_KEYS.includes(k) ? chain : base)[k] = v;
      return { ...s, base, chains: { ...s.chains, [editing]: chain } };
    });
  const setBase = (patch) => setSt((s) => ({ ...s, base: { ...s.base, ...patch } }));

  const savedOf = (part) => savedList.find((p) => p._id === st.saved[part]);

  // { prompt, negative } for one part, or null when nothing is chosen yet.
  function promptFor(part) {
    if (st.source === "builder") return built[part];
    if (st.source === "saved") {
      const p = savedOf(part);
      return p ? { prompt: p.prompt, negative: p.negative || "" } : null;
    }
    return { prompt: buildDolaPrompt({ type: st.type, part, framing: st.framing, place: st.place, setting: "", details: st.details }), negative: NEGATIVE[st.type] };
  }
  const negative = promptFor(1)?.negative || promptFor(2)?.negative || "";

  return (
    <>
      <div className="field">
        <span className="field-label">Prompt dùng cho Dola</span>
        <Seg name="aiflow-source" label="Prompt dùng cho Dola" value={st.source} options={SOURCES} onChange={(source) => put({ source })} />
      </div>

      {st.source === "dola" && (
        <div className="aiflow-opts">
          <div className="field">
            <span className="field-label">Loại sản phẩm</span>
            <Seg name="aiflow-type" label="Loại sản phẩm" value={st.type} options={TYPES} onChange={(type) => put({ type })} />
          </div>
          <div className="field">
            <span className="field-label">Cỡ cảnh</span>
            <Seg name="aiflow-framing" label="Cỡ cảnh" value={st.framing} options={FRAMINGS} onChange={(framing) => put({ framing })} />
          </div>
          <div className="field">
            <span className="field-label">Không gian</span>
            <Seg name="aiflow-place" label="Không gian" value={st.place} options={PLACES} onChange={(place) => put({ place })} />
          </div>
          <Field label="Chi tiết sản phẩm cần giữ" hint="Nên viết tiếng Anh. Bỏ trống thì giữ theo ảnh">
            <input className="input" value={st.details} onChange={(e) => put({ details: e.target.value })} placeholder="Ví dụ: cream linen shirt with small brown buttons" />
          </Field>
        </div>
      )}

      {st.source === "builder" && (
        <div className="aiflow-opts aiflow-builder">
          <div className="field">
            <span className="field-label">Kiểu video</span>
            <Seg name="aiflow-kind" label="Kiểu video" value={st.base.kind} options={KINDS} onChange={(kind) => setBase({ kind })} />
          </div>
          <div className="field">
            <span className="field-label">Người mẫu</span>
            <Seg
              name="aiflow-gender"
              label="Người mẫu"
              value={st.base.gender}
              onChange={(gender) => setBase({ gender })}
              options={[
                { value: "f", label: "Nữ" },
                { value: "m", label: "Nam" },
              ]}
            />
          </div>
          <div className="field">
            <span className="field-label">Thời lượng mỗi clip</span>
            <Seg name="aiflow-dur" label="Thời lượng" value={st.base.dur} onChange={(dur) => setBase({ dur })} options={DURATIONS.map((d) => ({ value: d, label: `${d} giây` }))} />
          </div>
          <div className="row">
            <label className="check">
              <input type="checkbox" checked={st.base.closed} onChange={(e) => setBase({ closed: e.target.checked })} />
              Áo luôn đóng
            </label>
            <label className="check">
              <input type="checkbox" checked={st.base.audio === "amb"} onChange={(e) => setBase({ audio: e.target.checked ? "amb" : "none" })} />
              Tiếng môi trường nhẹ
            </label>
          </div>
          <div className="field">
            <span className="field-label">Đang chọn động tác cho</span>
            <Seg
              name="aiflow-part"
              label="Đang chọn động tác cho"
              value={editing}
              onChange={setEditing}
              options={PARTS.map((p) => ({ value: p, label: `Part ${p}` }))}
            />
            {editing === 2 && <span className="hint">Part 2 tự thêm “nối tiếp từ ảnh” để khớp khung cuối của Part 1.</span>}
          </div>
          <Sequence key={editing} state={partState(editing)} set={setPart} index={index} result={built[editing]} />
          <details className="aiflow-prompt">
            <summary>Xem prompt Part {editing}</summary>
            <pre className="out">{built[editing].prompt}</pre>
          </details>
        </div>
      )}

      {st.source === "saved" && (
        <div className="aiflow-opts">
          {savedQ.isLoading ? (
            <p className="hint">Đang tải prompt đã lưu...</p>
          ) : savedQ.error ? (
            <p className="hint">{savedQ.error.message}</p>
          ) : savedList.length === 0 ? (
            <p className="hint">
              Sản phẩm này chưa có prompt đã lưu. <Link to={`/?product=${plan.product._id}`}>Mở Tạo prompt</Link> rồi bấm “Lưu prompt tốt”, hoặc chọn “Tạo prompt” ở trên.
            </p>
          ) : (
            PARTS.map((p) => (
              <Field key={p} label={`Prompt cho Part ${p}`}>
                <select className="input" value={st.saved[p]} onChange={(e) => put({ saved: { ...st.saved, [p]: e.target.value } })}>
                  <option value="">Chọn prompt...</option>
                  {savedList.map((x) => (
                    <option key={x._id} value={x._id}>
                      {savedLabel(x)}
                    </option>
                  ))}
                </select>
              </Field>
            ))
          )}
          {savedOf(1) && (
            <details className="aiflow-prompt">
              <summary>Xem prompt Part 1</summary>
              <pre className="out">{savedOf(1).prompt}</pre>
            </details>
          )}
        </div>
      )}

      <div className="btns">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => imageTo(ai, dolaUrl, "Dola")}>
          Copy ảnh AI và mở Dola
        </button>
        {negative && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => copy(negative, "negative")}>
            Copy negative
          </button>
        )}
      </div>
      <ul className="slots">
        {CLIPS.map((c, i) => {
          const pr = promptFor(i + 1);
          return (
            <FileSlot
              key={c.key}
              {...slotProps}
              slot={c}
              extra={
                <button type="button" className="btn btn-sm" disabled={!pr} title={pr ? "" : "Chọn prompt cho part này trước"} onClick={() => copy(pr.prompt, `prompt Part ${i + 1}`)}>
                  Copy prompt Part {i + 1}
                </button>
              }
            />
          );
        })}
      </ul>
      <p className="hint">Part 2 nối tiếp khung cuối của Part 1. Tạo 3–4 lần mỗi clip rồi chọn bản đẹp nhất, che watermark Dola trước khi đăng.</p>
    </>
  );
}
