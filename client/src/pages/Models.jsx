import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { putAsset, useAssets } from "../lib/queries.js";
import { attachmentUrl, fmtDateTimeFull, norm, useDebounce } from "../lib/util.js";
import { ConfirmButton, EmptyState, ErrorState, Field, Modal, Seg, Skeleton } from "../components/ui.jsx";
import LazyImage from "../components/LazyImage.jsx";
import { DropZone, JobList, useUploads } from "../components/Uploader.jsx";
import { useToast } from "../components/Toast.jsx";

// Kho người mẫu và phông nền (tài liệu 16): the team's own models (several photos each) and backgrounds,
// picked on the "Ảnh AI" page instead of choosing files every time.

export const MAX_ASSET_IMAGES = 12;

export const ASSET_KINDS = {
  model: {
    label: "Người mẫu",
    one: "người mẫu",
    add: "+ Thêm người mẫu",
    what: "Mỗi người mẫu",
    namePh: "Linh — tóc dài",
    descPh: "Vietnamese woman, about 25, long straight black hair, slim build, warm natural smile",
    descHint: "Ngoại hình bằng tiếng Anh, được thêm vào prompt khi chọn người mẫu này.",
    imgHint: "Ảnh đầu tiên là ảnh đại diện và là ảnh gửi cho AI: nên là ảnh mặt chính diện rõ nét. Thêm ảnh toàn thân, các góc nghiêng.",
    empty: "Chưa có người mẫu nào",
  },
  background: {
    label: "Phông nền",
    one: "phông nền",
    add: "+ Thêm phông nền",
    what: "Mỗi phông nền",
    namePh: "Phòng ngủ nắng chiều",
    descPh: "cozy bedroom with white bedding, warm afternoon sunlight through a large window",
    descHint: "Bối cảnh bằng tiếng Anh, được thêm vào prompt khi chọn phông nền này.",
    imgHint: "Ảnh đầu tiên là ảnh đại diện và là ảnh gửi cho AI. Có thể thêm vài góc khác của cùng bối cảnh.",
    empty: "Chưa có phông nền nào",
  },
};
const KIND_OPTIONS = Object.entries(ASSET_KINDS).map(([value, k]) => ({ value, label: k.label }));

const splitTags = (s) =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
const formOf = (a) => ({ name: a?.name || "", description: a?.description || "", tags: (a?.tags || []).join(", "), note: a?.note || "" });

// Photos of one item: big view, thumbnails, set cover, delete, download, upload more.
function AssetGallery({ asset, editable }) {
  const qc = useQueryClient();
  const toast = useToast();
  const K = ASSET_KINDS[asset.kind];
  const images = asset.images || [];
  const [current, setCurrent] = useState(images[0]?.publicId);
  const shown = images.find((i) => i.publicId === current) || images[0];
  const uploads = useUploads((item) => putAsset(qc, item), { upload: api.uploadAssetImage });

  const act = useMutation({
    mutationFn: ({ kind, publicId }) => (kind === "cover" ? api.setAssetCover(asset._id, publicId) : api.deleteAssetImage(asset._id, publicId)),
    onSuccess: ({ item }, { kind }) => {
      putAsset(qc, item);
      toast(kind === "cover" ? "Đã đặt làm ảnh đại diện" : "Đã xoá ảnh");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  return (
    <div className="gallery">
      <LazyImage image={shown} width={380} ratio="3 / 4" eager fit="contain" className="gallery-main" alt={asset.name} />
      {shown && (
        <div className="btns">
          <a className="btn btn-sm" href={attachmentUrl(shown.url)} download>
            Tải ảnh về
          </a>
          {editable && shown.publicId !== images[0]?.publicId && (
            <button type="button" className="btn btn-sm" disabled={act.isPending} onClick={() => act.mutate({ kind: "cover", publicId: shown.publicId })}>
              Đặt làm ảnh đại diện
            </button>
          )}
          {editable && (
            <ConfirmButton className="btn btn-sm btn-danger-ghost" disabled={act.isPending} onConfirm={() => act.mutate({ kind: "delete", publicId: shown.publicId })}>
              Xoá ảnh này
            </ConfirmButton>
          )}
        </div>
      )}
      {images.length > 0 && (
        <div className="thumbs">
          {images.map((img, i) => (
            <button
              key={img.publicId}
              type="button"
              className={`thumb ${img.publicId === shown?.publicId ? "is-on" : ""}`}
              aria-label={`Xem ảnh ${i + 1}`}
              aria-pressed={img.publicId === shown?.publicId}
              onClick={() => setCurrent(img.publicId)}
            >
              <LazyImage image={img} width={72} ratio="1 / 1" />
              {i === 0 && <span className="badge">Đại diện</span>}
            </button>
          ))}
        </div>
      )}
      {editable && (
        <>
          <DropZone
            what={K.what}
            max={MAX_ASSET_IMAGES}
            room={MAX_ASSET_IMAGES - images.length - uploads.jobs.filter((j) => j.status !== "error").length}
            disabled={uploads.busy}
            onFiles={(files) => uploads.run(asset._id, files)}
          />
          <JobList jobs={uploads.jobs} onDismiss={uploads.dismiss} />
          <p className="hint">{K.imgHint}</p>
        </>
      )}
    </div>
  );
}

// New item (asset without _id: only the form, photos come right after it is made) or an existing one.
function AssetEditor({ asset, editable, canDelete, onCreated, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const K = ASSET_KINDS[asset.kind];
  const editing = Boolean(asset._id);
  const [form, setForm] = useState(() => formOf(asset));
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(asset));

  const save = useMutation({
    mutationFn: (body) => (editing ? api.updateAsset(asset._id, body) : api.createAsset({ ...body, kind: asset.kind })),
    onSuccess: ({ item }) => {
      putAsset(qc, item);
      if (editing) toast("Đã lưu");
      else {
        toast(`Đã thêm ${K.one}, giờ tải ảnh lên`);
        onCreated(item);
      }
    },
    onError: (e) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteAsset(asset._id),
    onSuccess: () => {
      qc.setQueryData(["assets"], (old) => (old ? { ...old, items: old.items.filter((a) => a._id !== asset._id) } : old));
      toast(`Đã xoá ${K.one}`);
      onClose();
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  function submit(e) {
    e.preventDefault();
    const tags = splitTags(form.tags);
    if (!form.name.trim()) return setError("Cần nhập tên.");
    if (tags.length > 10) return setError("Tối đa 10 thẻ.");
    setError("");
    save.mutate({ name: form.name, description: form.description, tags, note: form.note });
  }

  const fields = (
    <form className="form" onSubmit={submit}>
      <Field label="Tên">
        <input className="input" maxLength={80} value={form.name} placeholder={K.namePh} onChange={set("name")} autoFocus={!editing} readOnly={!editable} />
      </Field>
      <Field label="Mô tả cho AI" hint={K.descHint}>
        <textarea className="input" rows={4} maxLength={1500} value={form.description} placeholder={K.descPh} onChange={set("description")} readOnly={!editable} />
      </Field>
      <Field label="Thẻ" hint="Cách nhau bằng dấu phẩy.">
        <input className="input" maxLength={450} value={form.tags} placeholder={asset.kind === "model" ? "nữ, tóc dài, trẻ trung" : "trong nhà, nắng, ấm"} onChange={set("tags")} readOnly={!editable} />
      </Field>
      <Field label="Ghi chú">
        <textarea className="input" rows={2} maxLength={1000} value={form.note} placeholder="Hợp với sản phẩm nào, lưu ý khi dùng" onChange={set("note")} readOnly={!editable} />
      </Field>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="btns">
        {editable && (
          <button type="submit" className="btn btn-primary" disabled={save.isPending || (editing && !dirty)}>
            {save.isPending ? "Đang lưu..." : editing ? "Lưu" : `Tạo ${K.one}`}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {editing ? "Đóng" : "Huỷ"}
        </button>
        {editing && canDelete && (
          <ConfirmButton className="btn btn-danger-ghost" disabled={remove.isPending} confirmLabel={`Bấm lần nữa: xoá ${K.one} và mọi ảnh`} onConfirm={() => remove.mutate()}>
            Xoá {K.one}
          </ConfirmButton>
        )}
      </div>
      {editing && (
        <p className="hint">
          Thêm bởi {asset.createdBy?.displayName} · sửa lần cuối <time dateTime={asset.updatedAt}>{fmtDateTimeFull(asset.updatedAt)}</time>
        </p>
      )}
    </form>
  );

  if (!editing) return fields;
  return (
    <div className="grid-2 asset-editor">
      <AssetGallery key={asset._id} asset={asset} editable={editable} />
      {fields}
    </div>
  );
}

// A card: cover, name, photo count and tags. Shared with the picker on "Ảnh AI".
export function AssetCard({ asset, onClick, active }) {
  const n = asset.images?.length || 0;
  return (
    <button type="button" className={`pcard asset-card ${active ? "is-on" : ""}`} onClick={onClick} aria-pressed={active}>
      <LazyImage image={asset.images?.[0]} width={220} ratio="3 / 4" alt="" />
      <span className="pcard-body">
        <b>{asset.name}</b>
        <span className="hint">
          {n ? `${n} ảnh` : "Chưa có ảnh"}
          {asset.tags?.length ? ` · ${asset.tags.map((t) => `#${t}`).join(" ")}` : ""}
        </span>
      </span>
    </button>
  );
}

// Search text and tag filter over one kind; used here and by the picker.
export function useAssetFilter(items, kind) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const dq = useDebounce(q, 200);
  const ofKind = useMemo(() => (items || []).filter((a) => a.kind === kind), [items, kind]);
  const tags = useMemo(() => {
    const byKey = new Map();
    for (const a of ofKind) for (const t of a.tags || []) byKey.has(t.toLowerCase()) || byKey.set(t.toLowerCase(), t);
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, "vi"));
  }, [ofKind]);
  const list = useMemo(() => {
    const n = norm(dq);
    const t = tag.toLowerCase();
    return ofKind.filter(
      (a) => (!t || (a.tags || []).some((x) => x.toLowerCase() === t)) && (!n || [a.name, a.description, a.note, ...(a.tags || [])].some((s) => norm(s).includes(n)))
    );
  }, [ofKind, tag, dq]);
  return { q, setQ, tag, setTag, tags, list, total: ofKind.length };
}

export function AssetFilters({ f, kind }) {
  return (
    <div className="filters">
      <input
        className="input filters-q"
        type="search"
        aria-label={`Tìm ${ASSET_KINDS[kind].one}`}
        placeholder="Tìm theo tên, mô tả, thẻ"
        value={f.q}
        onChange={(e) => f.setQ(e.target.value)}
      />
      {f.tags.length > 0 && (
        <label className="filter">
          <span>Thẻ</span>
          <select className="input" value={f.tag} onChange={(e) => f.setTag(e.target.value)}>
            <option value="">Mọi thẻ</option>
            {f.tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export default function Models() {
  const { can } = useAuth();
  const editable = can("resource.edit");
  const [params, setParams] = useSearchParams();
  const kind = ASSET_KINDS[params.get("kind")] ? params.get("kind") : "model";
  const K = ASSET_KINDS[kind];
  const { data, isLoading, error, refetch } = useAssets();
  const f = useAssetFilter(data?.items, kind);
  // null = closed, { kind } = new, an id = open that item (kept fresh from the cache).
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState(null);
  const open = openId ? data?.items?.find((a) => a._id === openId) : null;
  const close = () => {
    setOpenId(null);
    setDraft(null);
  };
  const filtered = Boolean(f.q || f.tag);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Người mẫu & phông nền</h1>
          <p>Kho ảnh người mẫu và bối cảnh của team. Chọn trực tiếp ở trang Ảnh AI, không phải tải ảnh lên lại mỗi lần.</p>
        </div>
        {editable && (
          <button type="button" className="btn btn-primary" onClick={() => setDraft({ kind })}>
            {K.add}
          </button>
        )}
      </div>

      <div className="filters">
        <Seg
          name="asset-kind"
          label="Loại"
          value={kind}
          options={KIND_OPTIONS}
          onChange={(v) => {
            f.setQ("");
            f.setTag("");
            setParams(v === "model" ? {} : { kind: v }, { replace: true });
          }}
        />
      </div>
      {f.total > 0 && <AssetFilters f={f} kind={kind} />}

      {isLoading ? (
        <div className="pgrid" aria-busy="true">
          <Skeleton h={280} r={14} />
          <Skeleton h={280} r={14} />
          <Skeleton h={280} r={14} />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !f.list.length ? (
        <EmptyState
          title={filtered ? "Không thấy mục nào khớp" : K.empty}
          action={
            !filtered && editable ? (
              <button type="button" className="btn btn-primary" onClick={() => setDraft({ kind })}>
                {K.add}
              </button>
            ) : null
          }
        >
          {filtered ? "Thử bỏ bớt bộ lọc." : `Thêm ${K.one} rồi tải ảnh lên để dùng ở trang Ảnh AI.`}
        </EmptyState>
      ) : (
        <div className="pgrid">
          {f.list.map((a) => (
            <AssetCard key={a._id} asset={a} onClick={() => setOpenId(a._id)} />
          ))}
        </div>
      )}

      <Modal open={Boolean(open || draft)} onClose={close} title={open ? open.name : `Thêm ${K.one}`} wide={Boolean(open)}>
        {open ? (
          <AssetEditor key={open._id} asset={open} editable={editable} canDelete={can("resource.delete")} onClose={close} />
        ) : draft ? (
          <AssetEditor
            asset={draft}
            editable={editable}
            onClose={close}
            onCreated={(item) => {
              setDraft(null);
              setOpenId(item._id);
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
