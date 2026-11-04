import { FLAGS } from "../lib/actions.js";
import { fmtSec, fmtSecVi, nextMid, shuffleChain } from "../lib/prompt.js";
import ActionPicker from "./ActionPicker.jsx";
import { Seg } from "./ui.jsx";

function Beat({ beat, children, controls }) {
  const conds = beat.action?.conds || [];
  return (
    <div className="beat">
      <span className={`tc tc-${beat.role}`}>
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
      <h2 className="sec-h">
        <span className="sec-n" aria-hidden="true">3</span>Chuỗi động tác
        <button type="button" className="btn btn-sm" onClick={() => set((s) => shuffleChain(s))}>
          Đổi ngẫu nhiên
        </button>
      </h2>
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
          <ActionPicker role="open" value={state.open} index={index} label="Động tác mở đầu" onChange={(open) => set({ open })} />
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
            <ActionPicker
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
            <ActionPicker role="end" value={state.end} index={index} label="Động tác kết" onChange={(end) => set({ end })} />
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
