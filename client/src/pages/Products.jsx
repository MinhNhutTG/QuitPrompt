import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { putProduct, useProducts } from "../lib/queries.js";
import { norm, useDebounce } from "../lib/util.js";
import { EmptyState, ErrorState, Field, Modal, Skeleton } from "../components/ui.jsx";
import LazyImage from "../components/LazyImage.jsx";
import { DropZone, JobList, MAX_IMAGES, useUploads } from "../components/Uploader.jsx";
import { useToast } from "../components/Toast.jsx";
import { EMPTY_EXTERNAL, ExternalPromptFields, externalBody } from "../components/PromptFields.jsx";
import { CategoryInput } from "../components/CategoryInput.jsx";

function Previews({ files, onRemove }) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  if (!files.length) return null;
  return (
    <div className="pending">
      {files.map((f, i) => (
        <figure key={urls[i]}>
          <img src={urls[i]} alt={f.name} />
          <button type="button" className="icon-btn" aria-label={`Bỏ ảnh ${f.name}`} onClick={() => onRemove(i)}>
            ×
          </button>
        </figure>
      ))}
    </div>
  );
}

function NewProductForm({ onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [files, setFiles] = useState([]);
  const [withPrompt, setWithPrompt] = useState(false);
  const [external, setExternal] = useState(EMPTY_EXTERNAL);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const uploads = useUploads((item) => putProduct(qc, item));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError("Cần nhập tên sản phẩm.");
    setError("");
    setBusy(true);
    let item;
    try {
      ({ item } = await api.createProduct({ name: name.trim(), sku: sku.trim(), category: category.trim() }));
      putProduct(qc, item);
      if (item.category) qc.invalidateQueries({ queryKey: ["prompt-filters"] });
    } catch (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    const problems = [];
    if (withPrompt && external.prompt.trim()) {
      try {
        await api.createPrompt(externalBody(item._id, external));
        qc.invalidateQueries({ queryKey: ["prompts"] });
        qc.invalidateQueries({ queryKey: ["products"] });
        // The cached detail was written with promptCount 0 just above.
        qc.invalidateQueries({ queryKey: ["product", item._id] });
      } catch (err) {
        problems.push(`prompt chưa lưu được (${err.message})`);
      }
    }
    const failed = files.length ? await uploads.run(item._id, files) : 0;
    if (failed) problems.push(`${failed} ảnh chưa tải được`);
    toast(problems.length ? `Đã tạo sản phẩm, ${problems.join(", ")}` : "Đã tạo sản phẩm", { tone: problems.length ? "danger" : "ok" });
    onClose();
    navigate(`/products/${item._id}`);
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Tên sản phẩm">
        <input className="input" value={name} maxLength={160} required autoFocus onChange={(e) => setName(e.target.value)} placeholder="Nón chống nắng vành rộng" />
      </Field>
      <div className="grid-2">
        <Field label="Mã sản phẩm" hint="Không bắt buộc">
          <input className="input" value={sku} maxLength={60} onChange={(e) => setSku(e.target.value)} placeholder="N12" />
        </Field>
        <Field label="Loại sản phẩm" hint="Dùng để lọc prompt đã lưu">
          <CategoryInput value={category} onChange={setCategory} />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Ảnh</span>
        {busy ? (
          <JobList jobs={uploads.jobs} />
        ) : (
          <>
            <Previews files={files} onRemove={(i) => setFiles((fs) => fs.filter((_, j) => j !== i))} />
            <DropZone room={MAX_IMAGES - files.length} onFiles={(fs) => setFiles((old) => [...old, ...fs])} />
          </>
        )}
      </div>
      {withPrompt ? (
        <fieldset className="subform" disabled={busy}>
          <legend>
            Prompt tốt có sẵn
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => (setWithPrompt(false), setExternal(EMPTY_EXTERNAL))}>
              Bỏ
            </button>
          </legend>
          <ExternalPromptFields value={external} onChange={setExternal} />
        </fieldset>
      ) : (
        <button type="button" className="btn btn-dashed" onClick={() => setWithPrompt(true)} disabled={busy}>
          + Thêm prompt có sẵn
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="btns btns-end">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Huỷ
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? (uploads.jobs.length ? "Đang tải ảnh..." : "Đang tạo...") : "Tạo sản phẩm"}
        </button>
      </div>
    </form>
  );
}

function GridSkeleton() {
  return (
    <div className="pgrid" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="pcard">
          <Skeleton h="auto" r={14} className="ratio-34" />
          <Skeleton h={16} w="70%" />
          <Skeleton h={12} w="40%" />
        </div>
      ))}
    </div>
  );
}

export default function Products() {
  const { data, isLoading, error, refetch } = useProducts();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const dq = useDebounce(q, 250);

  const items = useMemo(() => {
    const all = data?.items || [];
    const n = norm(dq);
    return n ? all.filter((p) => norm(p.name).includes(n) || norm(p.sku).includes(n)) : all;
  }, [data, dq]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Sản phẩm</h1>
          <p>{data ? `${data.items.length} sản phẩm` : " "}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          + Sản phẩm mới
        </button>
      </div>

      {(data?.items.length > 0 || q) && (
        <div className="toolbar">
          <input className="input" type="search" aria-label="Tìm sản phẩm" placeholder="Tìm theo tên hoặc mã" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}

      {isLoading ? (
        <GridSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.items.length ? (
        <EmptyState
          title="Chưa có sản phẩm nào"
          action={
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              + Thêm sản phẩm đầu tiên
            </button>
          }
        >
          Thêm sản phẩm đầu tiên kèm ảnh để dễ nhận ra khi tạo prompt.
        </EmptyState>
      ) : !items.length ? (
        <EmptyState title="Không thấy sản phẩm nào khớp">Thử tìm bằng tên ngắn hơn hoặc bằng mã sản phẩm.</EmptyState>
      ) : (
        <div className="pgrid">
          {items.map((p, i) => (
            <Link key={p._id} to={`/products/${p._id}`} className="pcard">
              <LazyImage image={p.images?.[0]} width={240} ratio="3 / 4" eager={i < 8} alt="" />
              <div>
                <b>{p.name}</b>
                <span className="hint">
                  {p.category ? `${p.category} · ` : ""}
                  {p.sku ? `${p.sku} · ` : ""}
                  {p.promptCount || 0} prompt · {p.images?.length || 0} ảnh
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Sản phẩm mới" wide>
        <NewProductForm onClose={() => setCreating(false)} />
      </Modal>
    </div>
  );
}
