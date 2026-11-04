import { useMemo, useState } from "react";
import { FLAGS, TOP_TAB, actionTabs } from "../lib/actions.js";
import { useActionStats } from "../lib/queries.js";
import { norm } from "../lib/util.js";
import { Modal, Tabs } from "./ui.jsx";

export const optionLabel = (a) => `${a.bold ? "★ " : ""}${a.label}${a.conds.length ? ` (${a.conds.map((c) => FLAGS[c].label).join(", ")})` : ""}`;

const matches = (a, n) => !n || norm(a.label).includes(n) || norm(a.text).includes(n);

function PickerBody({ role, value, index, onPick }) {
  const { data: counts } = useActionStats();
  const [q, setQ] = useState("");
  const n = norm(q);

  const tabs = useMemo(() => {
    const list = index.forRole(role);
    if (value && !list.some((a) => a.id === value) && index.byId.has(value)) list.push(index.byId.get(value));
    return actionTabs(list, counts);
  }, [role, value, index, counts]);
  const [tab, setTab] = useState(() => tabs[0]?.id || TOP_TAB);
  const current = tabs.find((t) => t.id === tab) || tabs[0];

  // A search looks through every tab; "Đánh giá cao" repeats actions of the other tabs, so it is left out.
  const items = n ? tabs.filter((t) => t.id !== TOP_TAB).flatMap((t) => t.items.filter((a) => matches(a, n))) : current?.items || [];

  return (
    <>
      <input
        className="input"
        type="search"
        autoFocus
        aria-label="Tìm động tác"
        placeholder="Tìm theo tên hoặc câu lệnh"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {n ? (
        <p className="hint">{items.length ? `${items.length} động tác khớp` : "Không có động tác nào khớp."}</p>
      ) : (
        <Tabs label="Nhóm động tác" tabs={tabs.map((t) => ({ id: t.id, label: t.label, count: t.items.length }))} value={current?.id} onChange={setTab} />
      )}
      <ul className="pick-list">
        {items.map((a) => (
          <li key={a.id}>
            <button type="button" className={`pick-item ${a.id === value ? "is-on" : ""}`} aria-pressed={a.id === value} onClick={() => onPick(a.id)}>
              <span className="pick-head">
                <b>
                  {a.bold && "★ "}
                  {a.label}
                </b>
                {a.conds.map((c) => (
                  <span key={c} className="tag" title={FLAGS[c].warn}>
                    {FLAGS[c].label}
                  </span>
                ))}
                {a.uses > 0 && <span className="hint pick-uses">{a.uses} prompt đã lưu</span>}
              </span>
              <span className="pick-text">{a.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// A button showing the chosen action; it opens a dialog with the actions for this slot split into tabs
// ("Đánh giá cao" first) and a search across all of them.
export default function ActionPicker({ role, value, index, onChange, label }) {
  const [open, setOpen] = useState(false);
  const current = index.byId.get(value);
  return (
    <>
      <button type="button" className="input pick-btn" aria-haspopup="dialog" aria-label={`${label}: ${current ? current.label : "chưa chọn"}`} onClick={() => setOpen(true)}>
        <span className="pick-btn-label">{current ? optionLabel(current) : "Chọn động tác"}</span>
        <span className="pick-btn-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={label} wide>
        <PickerBody
          role={role}
          value={value}
          index={index}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      </Modal>
    </>
  );
}
