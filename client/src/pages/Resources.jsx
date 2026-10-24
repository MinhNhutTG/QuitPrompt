import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { BUILTIN_RESOURCES, KINDS } from "../lib/resources.js";
import { useResources } from "../lib/queries.js";
import { fmtDateTimeFull, norm, useDebounce } from "../lib/util.js";
import { useAuth } from "../auth.jsx";
import { EmptyState, ErrorState, Field, Modal, Seg, Skeleton } from "../components/ui.jsx";
import { useCopy, withNegative } from "../components/PromptPanel.jsx";
import { useToast } from "../components/Toast.jsx";

const KIND_FILTERS = [{ value: "", label: "Tất cả" }, ...Object.entries(KINDS).map(([value, k]) => ({ value, label: k.short }))];
const SOURCE_FILTERS = [
  { value: "", label: "Tất cả nguồn" },
  { value: "team", label: "Của team" },
  { value: "builtin", label: "Có sẵn" },
];

const EMPTY = { kind: "image", title: "", content: "", negative: "", tool: "", tags: "", link: "", note: "" };
const formOf = (r) => (r ? { ...EMPTY, ...r, tags: (r.tags || []).join(", ") } : EMPTY);
const splitTags = (s) =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

// SKILL.md files name themselves in their front matter; fall back to the title.
function fileName(r) {
  const named = /^---[\s\S]*?^name:\s*([\w.-]+)/m.exec(r.content)?.[1];
  const slug = named || norm(r.title).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill";
  return `${slug}.md`;
}

function download(r) {
  const url = URL.createObjectURL(new Blob([r.content], { type: "text/markdown;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName(r) });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Add, edit, or copy a starter entry into the team store (initial without _id).
function ResourceForm({ initial, onDone }) {
  const qc = useQueryClient();
  const toast = useToast();
  const editing = Boolean(initial?._id);
  const [form, setForm] = useState(() => formOf(initial));
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const save = useMutation({
    mutationFn: (body) => (editing ? api.updateResource(initial._id, body) : api.createResource(body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      toast(editing ? "Đã lưu tài nguyên" : "Đã thêm vào kho");
      onDone();
    },
    onError: (e) => setError(e.message),
  });

  function submit(e) {
    e.preventDefault();
    const tags = splitTags(form.tags);
    if (!form.title.trim()) return setError("Cần nhập tên.");
    if (!form.content.trim()) return setError(form.kind === "skill" ? "Cần nhập nội dung skill." : "Cần nhập prompt.");
    if (tags.length > 10) return setError("Tối đa 10 thẻ.");
    if (form.link.trim() && !/^https?:\/\/\S+$/i.test(form.link.trim())) return setError("Liên kết phải bắt đầu bằng http:// hoặc https://.");
    setError("");
    const { kind, title, content, tool, link, note } = form;
    save.mutate({ kind, title, content, negative: kind === "image" ? form.negative : "", tool, tags, link: link.trim(), note });
  }

  const image = form.kind === "image";
  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <span className="field-label">Loại</span>
        <Seg name="res-kind" label="Loại" value={form.kind} onChange={set("kind")} options={Object.entries(KINDS).map(([value, k]) => ({ value, label: k.label }))} />
      </div>
      <Field label="Tên">
        <input className="input" maxLength={200} value={form.title} placeholder={image ? "Ảnh lookbook nền be" : "Skill viết caption TikTok"} onChange={set("title")} autoFocus />
      </Field>
      <Field label={image ? "Prompt" : "Nội dung skill"} hint={image ? "Để [PRODUCT], [OUTFIT] ở chỗ cần thay khi dùng." : "Dán nguyên nội dung SKILL.md hoặc hướng dẫn cho AI."}>
        <textarea className="input mono" rows={image ? 7 : 12} maxLength={20000} spellCheck={false} value={form.content} onChange={set("content")} />
      </Field>
      {image && (
        <Field label="Negative">
          <textarea className="input mono" rows={3} maxLength={5000} spellCheck={false} value={form.negative} onChange={set("negative")} />
        </Field>
      )}
      <div className="grid-2">
        <Field label="Công cụ">
          <input className="input" maxLength={60} value={form.tool} placeholder={image ? "Midjourney, Flux..." : "Claude, ChatGPT..."} onChange={set("tool")} />
        </Field>
        <Field label="Thẻ" hint="Cách nhau bằng dấu phẩy.">
          <input className="input" maxLength={450} value={form.tags} placeholder="lookbook, studio" onChange={set("tags")} />
        </Field>
      </div>
      <Field label="Liên kết (nếu có)">
        <input className="input" type="url" maxLength={500} value={form.link} placeholder="https://..." onChange={set("link")} />
      </Field>
      <Field label="Ghi chú">
        <textarea className="input" rows={2} maxLength={1000} value={form.note} placeholder="Dùng khi nào, cần thay gì, kết quả ra sao" onChange={set("note")} />
      </Field>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="btns">
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? "Đang lưu..." : editing ? "Lưu" : "Thêm vào kho"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

// onEdit, onCopyToTeam and onDelete are left out when the role may not use them.
function ResourceCard({ r, me, onEdit, onCopyToTeam, onDelete, onTag }) {
  const { flash, copy } = useCopy();
  const builtin = r.builtin;
  return (
    <article className="card pc res">
      <div className="res-head">
        <span className={`badge res-kind-${r.kind}`}>{KINDS[r.kind]?.short}</span>
        <h3>{r.title}</h3>
      </div>
      <div className="pc-meta">
        {builtin ? (
          <span>Có sẵn trong app</span>
        ) : (
          <span>
            Thêm bởi <b className="pc-who">{r.createdBy?.id === me ? "bạn" : r.createdBy?.displayName}</b> ·{" "}
            <time dateTime={r.updatedAt}>{fmtDateTimeFull(r.updatedAt)}</time>
          </span>
        )}
        {r.tool && <span>{r.tool}</span>}
        {flash && <span className="ok-text">Đã copy</span>}
      </div>
      {r.tags?.length > 0 && (
        <div className="res-tags">
          {r.tags.map((t) => (
            <button key={t} type="button" className="res-tag" onClick={() => onTag(t)} title={`Lọc theo thẻ ${t}`}>
              #{t}
            </button>
          ))}
        </div>
      )}
      {r.note && <p className="pc-note">{r.note}</p>}
      <details>
        <summary>{r.kind === "skill" ? "Xem nội dung skill" : "Xem prompt"}</summary>
        <pre className="out" tabIndex={0}>
          {r.content}
        </pre>
        {r.negative && (
          <pre className="out out-neg" tabIndex={0}>
            {r.negative}
          </pre>
        )}
      </details>
      <div className="btns">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => copy(r.content, "c")}>
          {r.kind === "skill" ? "Copy skill" : "Copy prompt"}
        </button>
        {r.negative && (
          <button type="button" className="btn btn-sm" onClick={() => copy(withNegative(r.content, r.negative), "all")}>
            Copy + negative
          </button>
        )}
        {r.kind === "skill" && (
          <button type="button" className="btn btn-sm" onClick={() => download(r)}>
            Tải {fileName(r)}
          </button>
        )}
        {r.link && (
          <a className="btn btn-sm btn-ghost" href={r.link} target="_blank" rel="noopener noreferrer">
            Mở liên kết
          </a>
        )}
        {builtin ? (
          onCopyToTeam && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => onCopyToTeam(r)}>
              Chép vào kho team để sửa
            </button>
          )
        ) : (
          <>
            {onEdit && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onEdit(r)}>
                Sửa
              </button>
            )}
            {onDelete && (
              <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => onDelete(r)}>
                Xoá
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

// The team's store of AI skills and image prompts that worked, plus a few starters. Filters live in the URL.
export default function Resources() {
  const { user, can } = useAuth();
  const canEdit = can("resource.edit");
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useResources();
  const [params, setParams] = useSearchParams();
  const kind = params.get("kind") || "";
  const tag = params.get("tag") || "";
  const source = params.get("src") || "";
  const set = (changes) =>
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k);
        return next;
      },
      { replace: true }
    );
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 200);

  // null = closed; {} = new; a resource = edit (with _id) or copy a starter (without).
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const all = useMemo(() => [...(data?.items || []), ...BUILTIN_RESOURCES.map((r) => ({ ...r, builtin: true }))], [data]);
  const tags = useMemo(() => {
    const byKey = new Map();
    for (const r of all) if (!kind || r.kind === kind) for (const t of r.tags || []) byKey.has(t.toLowerCase()) || byKey.set(t.toLowerCase(), t);
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, "vi"));
  }, [all, kind]);
  const items = useMemo(() => {
    const n = norm(dq);
    const t = tag.toLowerCase();
    return all.filter(
      (r) =>
        (!kind || r.kind === kind) &&
        (!source || (source === "builtin") === Boolean(r.builtin)) &&
        (!t || (r.tags || []).some((x) => x.toLowerCase() === t)) &&
        (!n || [r.title, r.content, r.note, r.tool, ...(r.tags || [])].some((s) => norm(s).includes(n)))
    );
  }, [all, kind, source, tag, dq]);
  const filtered = Boolean(kind || tag || source || dq);
  const teamCount = data?.items?.length || 0;

  const remove = useMutation({
    mutationFn: (r) => api.deleteResource(r._id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      setDeleting(null);
      toast("Đã xoá tài nguyên");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  const copyToTeam = ({ _id, builtin, ...r }) => setEditing(r); // eslint-disable-line no-unused-vars

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Kho tài nguyên</h1>
          <p>
            Skill cho AI và prompt tạo ảnh chất lượng, dùng chung cả team. {teamCount ? `${teamCount} mục của team · ` : ""}
            {BUILTIN_RESOURCES.length} mục có sẵn.
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ kind: kind || "image" })}>
            + Thêm tài nguyên
          </button>
        )}
      </div>

      <div className="filters">
        <input className="input filters-q" type="search" aria-label="Tìm tài nguyên" placeholder="Tìm theo tên, nội dung, thẻ, công cụ" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="filter">
          <span>Loại</span>
          <Seg name="kind-filter" label="Loại" value={kind} onChange={(v) => set({ kind: v, tag: "" })} options={KIND_FILTERS} />
        </div>
        <label className="filter">
          <span>Thẻ</span>
          <select className="input" value={tag} onChange={(e) => set({ tag: e.target.value })}>
            <option value="">Mọi thẻ</option>
            {tag && !tags.includes(tag) && <option value={tag}>{tag}</option>}
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>Nguồn</span>
          <select className="input" value={source} onChange={(e) => set({ src: e.target.value })}>
            {SOURCE_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered && (
        <div className="filters-sum">
          <span>{items.length ? `Đang lọc: ${items.length} mục` : "Không có mục nào khớp"}</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setQ("");
              setParams({}, { replace: true });
            }}
          >
            Bỏ lọc
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="res-grid" aria-busy="true">
          <Skeleton h={180} r={14} />
          <Skeleton h={180} r={14} />
          <Skeleton h={180} r={14} />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !items.length ? (
        <EmptyState title="Không thấy tài nguyên nào khớp">Thử bỏ bớt bộ lọc.</EmptyState>
      ) : (
        <div className="res-grid">
          {items.map((r) => (
            <ResourceCard
              key={r._id}
              r={r}
              me={user?.id}
              onEdit={canEdit ? setEditing : undefined}
              onCopyToTeam={canEdit ? copyToTeam : undefined}
              onDelete={can("resource.delete") ? setDeleting : undefined}
              onTag={(t) => set({ tag: t })}
            />
          ))}
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?._id ? "Sửa tài nguyên" : "Thêm tài nguyên"} wide>
        {editing && <ResourceForm initial={editing} onDone={() => setEditing(null)} />}
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Xoá tài nguyên này?">
        {deleting && (
          <>
            <p>
              <b>{deleting.title}</b> sẽ bị xoá khỏi kho của cả team và không khôi phục được.
            </p>
            <div className="btns">
              <button type="button" className="btn btn-danger" onClick={() => remove.mutate(deleting)} disabled={remove.isPending}>
                {remove.isPending ? "Đang xoá..." : "Có, xoá"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)} autoFocus>
                Không
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
