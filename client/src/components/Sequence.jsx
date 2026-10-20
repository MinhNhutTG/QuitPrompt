import { useMemo } from "react";
import { CATS, FLAGS } from "../lib/actions.js";
import { fmtSec, fmtSecVi, nextMid, shuffleChain } from "../lib/prompt.js";
import { Seg } from "./ui.jsx";

const optionLabel = (a) => `${a.bold ? "★ " : ""}${a.label}${a.conds.length ? ` (${a.conds.map((c) => FLAGS[c].label).join(", ")})` : ""}`;

// Native <select> grouped by category: fast, accessible, and good on phones.
function ActionSelect({ role, value, index, onChange, label }) {
  const groups = useMemo(() => {
    const list = index.forRole(role);
    if (value && !list.some((a) => a.id === value) && index.byId.has(value)) list.push(index.byId.get(value));
    return CATS.map((c) => ({ ...c, items: list.filter((a) => a.cat === c.id) })).filter((g) => g.items.length);
  }, [role, value, index]);
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {groups.map((g) => (
        <optgroup key={g.id} label={g.label}>
          {g.items.map((a) => (
            <option key={a.id} value={a.id}>
              {optionLabel(a)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function Beat({ beat, children, controls }) {
  const conds = beat.action?.conds || [];
  return (
    <div className="beat">
      <span className="tc">
        {fmtSec(beat.a)}–{fmtSec(beat.b)}s
      </span>
      <div className="beat-main">
        {children}
        {conds.length > 0 && <span className="beat-cond">{conds.map((c) => FLAGS[c].label).join(" · ")}</span>}
      </div>
      {controls && <div className="beat-ctl">{controls}</div>}
    </div>
  );
}

export default function Sequence({ state, set, index, result }) {
  const { beats, perMid } = result;
  const open = beats[0];
  const mids = beats.filter((b) => b.role === "mid");
  const end = beats.find((b) => b.role === "end");
  const k = state.mid.length;

  const moveMid = (j, d) =>
    set((s) => {
      const mid = [...s.mid];
      [mid[j], mid[j + d]] = [mid[j + d], mid[j]];
      return { mid };
    });

  return (
    <div className="sec">
      <div className="sec-h">
        Chuỗi động tác
        <button type="button" className="btn btn-sm" onClick={() => set((s) => shuffleChain(s))}>
          Đổi ngẫu nhiên
        </button>
      </div>
      <Seg
        name="style"
        label="Kiểu đổi ngẫu nhiên"
        value={state.style}
        onChange={(style) => set({ style })}
        options={[
          { value: "bold", label: "Nổi bật" },
          { value: "soft", label: "Nhẹ nhàng" },
        ]}
      />

      <div className="tl" aria-hidden="true">
        {beats.map((b, i) => (
          <i key={i} className={`tl-${b.role}`} style={{ flex: b.b - b.a }} />
        ))}
      </div>

      <div className="beats">
        <div className="beats-h">Mở đầu</div>
        <Beat beat={open}>
          <ActionSelect role="open" value={state.open} index={index} label="Động tác mở đầu" onChange={(open) => set({ open })} />
        </Beat>

        <div className="beats-h">
          Đoạn giữa · {k} động tác
          {k > 0 && <span className={perMid < 2 ? "warn-text" : ""}> · {fmtSecVi(perMid)} giây mỗi động tác</span>}
        </div>
        {mids.map((b, j) => (
          <Beat
            key={j}
            beat={b}
            controls={
              <>
                <button type="button" className="icon-btn" aria-label={`Đưa động tác ${j + 1} lên`} disabled={j === 0} onClick={() => moveMid(j, -1)}>
                  ↑
                </button>
                <button type="button" className="icon-btn" aria-label={`Đưa động tác ${j + 1} xuống`} disabled={j === k - 1} onClick={() => moveMid(j, 1)}>
                  ↓
                </button>
                <button type="button" className="icon-btn" aria-label={`Xoá động tác ${j + 1}`} onClick={() => set((s) => ({ mid: s.mid.filter((_, i) => i !== j) }))}>
                  ×
                </button>
              </>
            }
          >
            <ActionSelect
              role="mid"
              value={state.mid[j]}
              index={index}
              label={`Động tác giữa thứ ${j + 1}`}
              onChange={(id) => set((s) => ({ mid: s.mid.map((x, i) => (i === j ? id : x)) }))}
            />
          </Beat>
        ))}
        <button type="button" className="btn btn-dashed" onClick={() => set((s) => ({ mid: [...s.mid, nextMid(s)] }))}>
          + Thêm động tác vào đoạn giữa
        </button>

        <label className="check">
          <input type="checkbox" checked={state.endOn} onChange={(e) => set({ endOn: e.target.checked })} />
          Thêm đoạn kết (2 giây cuối)
        </label>
        {end && (
          <Beat beat={end}>
            <ActionSelect role="end" value={state.end} index={index} label="Động tác kết" onChange={(end) => set({ end })} />
          </Beat>
        )}
      </div>

      {result.warnings.length > 0 && (
        <ul className="warnings" aria-live="polite">
          {result.warnings.map((w) => (
            <li key={w.id}>{w.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
