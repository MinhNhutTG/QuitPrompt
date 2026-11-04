import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { ACTIONS, FLAGS, ROLE_LABEL, TOP_TAB, actionTabs, roleNames } from "../lib/actions.js";
import { fillAction } from "../lib/prompt.js";
import { useActionStats, useSettings } from "../lib/queries.js";
import { norm, uid, useDebounce } from "../lib/util.js";
import { ConfirmButton, ErrorState, Field, Modal, Seg, Skeleton, Tabs } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

const VARS = [
  { v: "{S}", hint: "She / He (đầu câu)" },
  { v: "{s}", hint: "she / he" },
  { v: "{p}", hint: "her / his" },
  { v: "{g}", hint: "the product" },
];
// Same limit as the server (Settings.MAX_CUSTOM_ACTIONS).
const MAX_CUSTOM_ACTIONS = 300;
const PREVIEW_VARS ={ Pronoun: "She", pronoun: "she", possessive: "her" };

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
        {a.uses > 0 && <span className="hint">· {a.uses} prompt đã lưu</span>}
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

const withIds = (items) => items.map(({ role, label, text }) => ({ id: "c" + uid(), role, label, text }));
const rowList = (list) => list.slice(0, 8).join(", ") + (list.length > 8 ? "…" : "");

// What a filled Excel file would add, checked before anything is saved. `read` comes from ExcelButtons.
function ImportDialog({ read, custom, onClose }) {
  const toast = useToast();
  const save = useSaveActions();
  const [mode, setMode] = useState("append");

  const append = mode === "append";
  const candidates = append ? read.append : read.replace;
  const room = Math.max(MAX_CUSTOM_ACTIONS - (append ? custom.length : 0), 0);
  const items = candidates.items.slice(0, room);
  const cut = candidates.items.length - items.length;

  function confirm() {
    save.mutate(append ? [...custom, ...withIds(items)] : withIds(items), {
      onSuccess: () => {
        toast(append ? `Đã nhập ${items.length} động tác` : `Đã thay bằng ${items.length} động tác từ file`);
        onClose();
      },
      onError: (e) => toast(e.message, { tone: "danger" }),
    });
  }

  const notes = read.errors.length > 0 || candidates.dupes.length > 0 || cut > 0 || read.warnings.length > 0;

  return (
    <Modal open onClose={onClose} title="Nhập động tác từ Excel" wide>
      <p className="muted">
        File <b>{read.fileName}</b>: {items.length} động tác sẽ được nhập.
      </p>
      <div className="field">
        <span className="field-label">Cách nhập</span>
        <Seg
          name="import-mode"
          label="Cách nhập"
          value={mode}
          onChange={setMode}
          options={[
            { value: "append", label: "Thêm vào danh sách" },
            { value: "replace", label: "Thay toàn bộ động tác của tôi" },
          ]}
        />
        {!append && custom.length > 0 && <span className="hint warn-text">{custom.length} động tác riêng hiện có sẽ bị xoá và thay bằng nội dung file.</span>}
      </div>

      {notes && (
        <ul className="warnings">
          {read.errors.map((e) => (
            <li key={"e" + e.row}>
              Bỏ dòng {e.row}: {e.reason}.
            </li>
          ))}
          {candidates.dupes.length > 0 && <li>Bỏ qua dòng {rowList(candidates.dupes)}: trùng câu lệnh với động tác đã có.</li>}
          {cut > 0 && <li>Bỏ {cut} động tác cuối file: mỗi người tối đa {MAX_CUSTOM_ACTIONS} động tác riêng.</li>}
          {read.warnings.map((w, i) => (
            <li key={"w" + i}>
              Dòng {w.row} vẫn nhập nhưng {w.reason}.
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 ? (
        <div className="group import-list">
          <ul className="acts">
            {items.map((a) => (
              <li key={a.row}>
                <div className="act-head">
                  <span className="hint">Dòng {a.row}</span>
                  <b>{a.label}</b>
                  <span className="hint">{ROLE_LABEL[a.role]}</span>
                </div>
                <span />
                <p className="act-text">{a.text}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="error">Không có động tác nào để nhập.</p>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Huỷ
        </button>
        {append ? (
          <button type="button" className="btn btn-primary" disabled={!items.length || save.isPending} onClick={confirm}>
            {save.isPending ? "Đang lưu..." : `Nhập ${items.length} động tác`}
          </button>
        ) : (
          <ConfirmButton className="btn btn-primary" confirmLabel="Bấm lần nữa để thay" disabled={!items.length || save.isPending} onConfirm={confirm}>
            {save.isPending ? "Đang lưu..." : `Thay bằng ${items.length} động tác`}
          </ConfirmButton>
        )}
      </div>
    </Modal>
  );
}

// "Tải file mẫu", "Xuất ra Excel" (the user's own actions, to edit and import back) and "Nhập từ Excel".
function ExcelButtons({ custom, onRead }) {
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState("");

  async function run(kind, fn) {
    setBusy(kind);
    try {
      await fn(await import("../lib/actionExcel.js"));
    } catch (e) {
      toast(e.message, { tone: "danger" });
    } finally {
      setBusy("");
    }
  }

  const importFile = (file) =>
    run("import", async (x) => {
      let read;
      try {
        // Checked against the built-in actions only; what the user already has is told apart just below.
        read = await x.readActions(file, x.knownKeys([]));
      } catch {
        throw new Error("Không đọc được file. Chọn file Excel .xlsx (có thể bấm “Tải file mẫu” để lấy file đúng dạng).");
      } finally {
        if (input.current) input.current.value = "";
      }
      if (!read.items.length && !read.errors.length && !read.dupes.length) throw new Error("File không có dòng động tác nào để nhập.");
      // Replacing keeps every new row; adding also skips the ones the user already has.
      const mine = new Set(custom.map((c) => x.textKey(c.text)));
      const had = (a) => mine.has(x.textKey(a.text));
      onRead({
        fileName: file.name,
        errors: read.errors,
        warnings: read.warnings,
        replace: { items: read.items, dupes: read.dupes },
        append: { items: read.items.filter((a) => !had(a)), dupes: [...read.dupes, ...read.items.filter(had).map((a) => a.row)].sort((a, b) => a - b) },
      });
    });

  return (
    <div className="row-btns">
      <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => run("template", (x) => x.downloadTemplate())}>
        {busy === "template" ? "Đang tạo..." : "Tải file mẫu"}
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={Boolean(busy) || !custom.length}
        title={custom.length ? undefined : "Chưa có động tác riêng"}
        onClick={() => run("export", (x) => x.exportActions(custom))}
      >
        {busy === "export" ? "Đang xuất..." : "Xuất ra Excel"}
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
      />
      <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => input.current?.click()}>
        {busy === "import" ? "Đang đọc..." : "Nhập từ Excel"}
      </button>
    </div>
  );
}

export default function Library() {
  const toast = useToast();
  const { data: settings, isLoading, error, refetch } = useSettings();
  const { data: counts } = useActionStats();
  const save = useSaveActions();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState(TOP_TAB);
  const [read, setRead] = useState(null);
  const dq = useDebounce(q, 200);
  const custom = useMemo(() => settings?.customActions || [], [settings]);

  const tabs = useMemo(() => {
    const mine = custom.map((c) => ({ ...c, cat: "mine", bold: false, conds: [], custom: true }));
    return actionTabs([...ACTIONS, ...mine], counts, { keepMine: true });
  }, [custom, counts]);
  const n = norm(dq);
  const current = tabs.find((t) => t.id === tab) || tabs[0];
  // A search looks through every tab; "Đánh giá cao" repeats actions of the other tabs, so it is left out.
  const items = n
    ? tabs.filter((t) => t.id !== TOP_TAB).flatMap((t) => t.items.filter((a) => norm(a.label).includes(n) || norm(a.text).includes(n)))
    : current.items;

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
        {!isLoading && !error && <ExcelButtons custom={custom} onRead={setRead} />}
      </div>

      <div className="grid-2 library">
        {isLoading ? <Skeleton h={420} r={14} /> : error ? <ErrorState error={error} onRetry={refetch} /> : <AddForm custom={custom} />}

        <div className="stack">
          <input className="input" type="search" aria-label="Lọc động tác" placeholder="Lọc theo tên hoặc câu lệnh" value={q} onChange={(e) => setQ(e.target.value)} />
          {n ? (
            <p className="hint">{items.length ? `${items.length} động tác khớp` : "Không có động tác nào khớp."}</p>
          ) : (
            <Tabs label="Nhóm động tác" tabs={tabs.map((t) => ({ id: t.id, label: t.label, count: t.items.length }))} value={current.id} onChange={setTab} />
          )}
          {!n && current.id === TOP_TAB && (
            <p className="hint">Xếp theo số prompt cả nhóm đã lưu có dùng động tác đó. Khi còn ít prompt, app thêm các động tác ★ cho đủ.</p>
          )}
          {items.length > 0 ? (
            <div className="group">
              <ul className="acts">
                {items.map((a) => (
                  <ActionItem key={a.id} a={a} onDelete={a.custom ? () => remove(a.id) : null} deleting={save.isPending} />
                ))}
              </ul>
            </div>
          ) : (
            !n && (
              <p className="muted">
                Chưa có động tác riêng. Thêm ở khung bên cạnh, hoặc bấm “Tải file mẫu”, điền rồi bấm “Nhập từ Excel”. Động tác mới hiện ngay trong bộ tạo, tab “Của bạn”.
              </p>
            )
          )}
        </div>
      </div>

      {read && <ImportDialog read={read} custom={custom} onClose={() => setRead(null)} />}
    </div>
  );
}
