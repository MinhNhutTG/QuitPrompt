import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { ACTIONS, CATS, FLAGS, ROLE_LABEL, roleNames } from "../lib/actions.js";
import { fillAction } from "../lib/prompt.js";
import { useSettings } from "../lib/queries.js";
import { norm, uid, useDebounce } from "../lib/util.js";
import { ConfirmButton, ErrorState, Field, Seg, Skeleton } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

const VARS = [
  { v: "{S}", hint: "She / He (đầu câu)" },
  { v: "{s}", hint: "she / he" },
  { v: "{p}", hint: "her / his" },
  { v: "{g}", hint: "the product" },
];
const PREVIEW_VARS = { Pronoun: "She", pronoun: "she", possessive: "her" };

function useSaveActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (customActions) => api.saveSettings({ customActions }),
    onSuccess: (data) => qc.setQueryData(["settings"], data),
  });
}

function AddForm({ custom }) {
  const toast = useToast();
  const save = useSaveActions();
  const [role, setRole] = useState("mid");
  const [label, setLabel] = useState("");
  const [text, setText] = useState("{S} ");
  const [error, setError] = useState("");
  const textRef = useRef(null);

  function insert(v) {
    const el = textRef.current;
    const a = el?.selectionStart ?? text.length;
    const b = el?.selectionEnd ?? text.length;
    setText(text.slice(0, a) + v + text.slice(b));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(a + v.length, a + v.length);
    });
  }

  function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!label.trim()) return setError("Cần nhập tên động tác.");
    if (!t || t === "{S}") return setError("Cần nhập câu lệnh tiếng Anh.");
    if (!t.startsWith("{S}")) return setError("Câu lệnh nên bắt đầu bằng {S} để app tự ghép “Starting exactly as...” khi đặt ở đầu.");
    setError("");
    const next = [...custom, { id: "c" + uid(), role, label: label.trim(), text: t }];
    save.mutate(next, {
      onSuccess: () => {
        toast("Đã thêm động tác");
        setLabel("");
        setText("{S} ");
      },
      onError: (err) => setError(err.message),
    });
  }

  return (
    <form className="card form sticky" onSubmit={submit}>
      <h2>Thêm động tác riêng</h2>
      <div className="field">
        <span className="field-label">Vị trí</span>
        <Seg name="role" label="Vị trí" value={role} onChange={setRole} options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))} />
      </div>
      <Field label="Tên tiếng Việt">
        <input className="input" value={label} maxLength={200} placeholder="Xoay nhẹ khoe tà váy" onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="Câu lệnh tiếng Anh" hint="Không để tay chạm sản phẩm, không nhắc gió, không mô tả trang phục.">
        <textarea ref={textRef} className="input mono" rows={4} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="vars" aria-label="Chèn biến">
        {VARS.map((x) => (
          <button key={x.v} type="button" title={x.hint} onClick={() => insert(x.v)}>
            {x.v} <span className="hint">{x.hint}</span>
          </button>
        ))}
      </div>
      {text.trim().length > 4 && (
        <div className="field">
          <span className="field-label">Xem trước (người mẫu nữ)</span>
          <div className="preview">{fillAction(text.trim(), PREVIEW_VARS)}</div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={save.isPending}>
        {save.isPending ? "Đang lưu..." : "Thêm vào thư viện"}
      </button>
    </form>
  );
}

function ActionItem({ a, onDelete, deleting }) {
  return (
    <li>
      <div className="act-head">
        <b>
          {a.bold && "★ "}
          {a.label}
        </b>
        <span className="hint">{a.custom ? ROLE_LABEL[a.role] : roleNames(a.roles)}</span>
        {a.conds.map((c) => (
          <span key={c} className="tag" title={FLAGS[c].warn}>
            {FLAGS[c].label}
          </span>
        ))}
      </div>
      {onDelete ? (
        <ConfirmButton className="btn btn-sm btn-danger-ghost" onConfirm={onDelete} disabled={deleting}>
          Xoá
        </ConfirmButton>
      ) : (
        <span />
      )}
      <p className="act-text">{a.text}</p>
    </li>
  );
}

export default function Library() {
  const toast = useToast();
  const { data: settings, isLoading, error, refetch } = useSettings();
  const save = useSaveActions();
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 200);
  const custom = useMemo(() => settings?.customActions || [], [settings]);

  const groups = useMemo(() => {
    const mine = custom.map((c) => ({ ...c, cat: "mine", bold: false, conds: [], custom: true }));
    const n = norm(dq);
    const match = (a) => !n || norm(a.label).includes(n) || norm(a.text).includes(n);
    return CATS.map((c) => ({ ...c, items: [...ACTIONS, ...mine].filter((a) => a.cat === c.id && match(a)) })).filter(
      (g) => g.items.length || (g.id === "mine" && !n)
    );
  }, [custom, dq]);

  const remove = (id) =>
    save.mutate(
      custom.filter((c) => c.id !== id),
      { onSuccess: () => toast("Đã xoá động tác"), onError: (e) => toast(e.message, { tone: "danger" }) }
    );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Thư viện động tác</h1>
          <p>
            {ACTIONS.length} động tác có sẵn{custom.length ? ` · ${custom.length} động tác của bạn` : ""}. ★ là động tác nổi bật.
          </p>
        </div>
      </div>

      <div className="grid-2 library">
        {isLoading ? <Skeleton h={420} r={14} /> : error ? <ErrorState error={error} onRetry={refetch} /> : <AddForm custom={custom} />}

        <div className="stack">
          <input className="input" type="search" aria-label="Lọc động tác" placeholder="Lọc theo tên hoặc câu lệnh" value={q} onChange={(e) => setQ(e.target.value)} />
          {!groups.length && <p className="muted">Không có động tác nào khớp.</p>}
          {groups.map((g) => (
            <details key={g.id} className="group" open={Boolean(dq) || g.id === "mine"}>
              <summary>
                {g.label}
                <span className="hint">{g.items.length}</span>
              </summary>
              {g.items.length ? (
                <ul className="acts">
                  {g.items.map((a) => (
                    <ActionItem key={a.id} a={a} onDelete={a.custom ? () => remove(a.id) : null} deleting={save.isPending} />
                  ))}
                </ul>
              ) : (
                <p className="acts hint" style={{ paddingBottom: 16 }}>
                  Chưa có động tác riêng. Thêm ở khung bên cạnh; động tác mới hiện ngay trong bộ tạo, nhóm “Của bạn”.
                </p>
              )}
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
