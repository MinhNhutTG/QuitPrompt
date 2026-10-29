import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { useCan } from "../auth.jsx";
import { dropProduct, putProduct, usePrompts } from "../lib/queries.js";
import { fmtDate } from "../lib/util.js";
import { ConfirmButton, EmptyState, ErrorState, Field, Modal, ProductName, Skeleton } from "../components/ui.jsx";
import LazyImage from "../components/LazyImage.jsx";
import PromptCard from "../components/PromptCard.jsx";
import { EMPTY_EXTERNAL, ExternalPromptFields, externalBody } from "../components/PromptFields.jsx";
import { DropZone, JobList, useImageCap, useUploads } from "../components/Uploader.jsx";
import { useToast } from "../components/Toast.jsx";
import { CategoryInput } from "../components/CategoryInput.jsx";

const FIELDS = ["name", "sku", "category", "closed", "extraNeg", "note"];
const formOf = (p) => ({ name: p.name || "", sku: p.sku || "", category: p.category || "", closed: p.closed !== false, extraNeg: p.extraNeg || "", note: p.note || "" });

function Gallery({ product, editable }) {
  const qc = useQueryClient();
  const toast = useToast();
  const images = product.images || [];
  const [current, setCurrent] = useState(images[0]?.publicId);
  const shown = images.find((i) => i.publicId === current) || images[0];
  const uploads = useUploads((item) => putProduct(qc, item));
  const cap = useImageCap();

  const act = useMutation({
    mutationFn: ({ kind, publicId }) => (kind === "cover" ? api.setCover(product._id, publicId) : api.deleteImage(product._id, publicId)),
    onSuccess: ({ item }, { kind }) => {
      putProduct(qc, item);
      toast(kind === "cover" ? "Đã đặt làm ảnh đại diện" : "Đã xoá ảnh");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  return (
    <div className="gallery">
      <LazyImage image={shown} width={380} ratio="3 / 4" eager fit="contain" className="gallery-main" alt={product.name} />
      {shown && editable && (
        <div className="btns">
          {shown.publicId !== images[0]?.publicId && (
            <button type="button" className="btn btn-sm" disabled={act.isPending} onClick={() => act.mutate({ kind: "cover", publicId: shown.publicId })}>
              Đặt làm ảnh đại diện
            </button>
          )}
          <ConfirmButton className="btn btn-sm btn-danger-ghost" disabled={act.isPending} onConfirm={() => act.mutate({ kind: "delete", publicId: shown.publicId })}>
            Xoá ảnh này
          </ConfirmButton>
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
          <DropZone room={cap - images.length - uploads.jobs.filter((j) => j.status !== "error").length} disabled={uploads.busy} onFiles={(files) => uploads.run(product._id, files)} />
          <JobList jobs={uploads.jobs} onDismiss={uploads.dismiss} />
        </>
      )}
    </div>
  );
}

function InfoForm({ product, editable }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(() => formOf(product));
  const base = formOf(product);
  // Image uploads also replace the product object; only a change to these fields resets the form.
  const baseKey = FIELDS.map((k) => String(base[k])).join("\u0000");
  useEffect(() => setForm(formOf(product)), [baseKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = FIELDS.some((k) => form[k] !== base[k]);
  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const save = useMutation({
    mutationFn: () => api.updateProduct(product._id, { ...form, name: form.name.trim() }),
    onSuccess: ({ item }) => {
      putProduct(qc, item);
      // Category or name shows on saved prompts and feeds the category filter.
      qc.invalidateQueries({ queryKey: ["prompt-filters"] });
      qc.invalidateQueries({ queryKey: ["prompts"] });
      toast("Đã lưu thay đổi");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name.trim()) return toast("Cần nhập tên sản phẩm.", { tone: "danger" });
        save.mutate();
      }}
    >
      <fieldset className="bare" disabled={!editable}>
        <Field label="Tên sản phẩm">
          <input className="input" value={form.name} maxLength={160} onChange={setF("name")} />
        </Field>
        <div className="grid-2">
          <Field label="Mã sản phẩm">
            <input className="input" value={form.sku} maxLength={60} onChange={setF("sku")} />
          </Field>
          <Field label="Loại sản phẩm">
            <CategoryInput value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} />
          </Field>
        </div>
        <div className="sec-h">Thông tin dùng cho prompt</div>
        <label className="check">
          <input type="checkbox" checked={form.closed} onChange={setF("closed")} />
          Áo luôn đóng
        </label>
        <Field label="Lỗi riêng cần chặn" hint="Tiếng Anh, cách nhau bằng dấu phẩy. Tự điền vào bộ tạo khi chọn sản phẩm này.">
          <input className="input" value={form.extraNeg} maxLength={1000} placeholder="shrinking brim, missing drawstring" onChange={setF("extraNeg")} />
        </Field>
        <Field label="Ghi chú">
          <textarea className="input" rows={3} value={form.note} maxLength={2000} onChange={setF("note")} />
        </Field>
      </fieldset>
      {editable && (
        <div className="btns btns-end">
          {dirty && (
            <button type="button" className="btn btn-ghost" onClick={() => setForm(base)}>
              Bỏ thay đổi
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={!dirty || save.isPending}>
            {save.isPending ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </div>
      )}
    </form>
  );
}

function AddPromptForm({ productId, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState(EMPTY_EXTERNAL);
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => api.createPrompt(externalBody(productId, value)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompts"] });
      qc.invalidateQueries({ queryKey: ["product", productId] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast("Đã thêm prompt");
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.prompt.trim()) return setError("Cần dán nội dung prompt.");
        setError("");
        save.mutate();
      }}
    >
      <ExternalPromptFields value={value} onChange={setValue} autoFocus />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="btns btns-end">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Huỷ
        </button>
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? "Đang lưu..." : "Lưu prompt"}
        </button>
      </div>
    </form>
  );
}

function ProductPrompts({ productId }) {
  const { data, isLoading, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = usePrompts({ product: productId });
  const [adding, setAdding] = useState(false);
  const canSave = useCan()("prompt.save");
  const items = data?.pages.flatMap((p) => p.items) || [];
  const addButton = canSave && (
    <button type="button" className="btn" onClick={() => setAdding(true)}>
      + Thêm prompt
    </button>
  );
  return (
    <section className="sec">
      <Modal open={adding} onClose={() => setAdding(false)} title="Thêm prompt có sẵn" wide>
        <AddPromptForm productId={productId} onClose={() => setAdding(false)} />
      </Modal>
      <div className="page-head">
        <h2>Prompt tốt của sản phẩm này</h2>
        {items.length > 0 && addButton}
      </div>
      {isLoading ? (
        <Skeleton h={120} r={14} />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !items.length ? (
        <EmptyState
          title="Chưa lưu prompt nào"
          action={
            <div className="btns">
              <Link className="btn btn-primary" to={`/?product=${productId}`}>
                Tạo prompt cho sản phẩm này
              </Link>
              {addButton}
            </div>
          }
        >
          Tạo prompt, thử trên công cụ video, ra đẹp thì bấm “★ Lưu prompt tốt”. Có sẵn prompt tốt viết ở chỗ khác thì bấm “+ Thêm prompt” để dán vào.
        </EmptyState>
      ) : (
        <div className="plist">
          {items.map((p) => (
            <PromptCard key={p._id} item={p} />
          ))}
          {hasNextPage && (
            <button type="button" className="btn" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? "Đang tải..." : "Xem thêm"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const can = useCan();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["product", id],
    queryFn: () => api.product(id),
    // Start from the list entry so the page draws instantly.
    placeholderData: () => {
      const p = qc.getQueryData(["products"])?.items.find((x) => x._id === id);
      return p ? { item: p } : undefined;
    },
  });

  // 🔥 shows wherever the product's name does: on prompts and plans too.
  const hot = useMutation({
    mutationFn: (on) => api.updateProduct(id, { hot: on }),
    onSuccess: ({ item }) => {
      putProduct(qc, item);
      qc.invalidateQueries({ queryKey: ["prompts"] });
      qc.invalidateQueries({ queryKey: ["plans"] });
      toast(item.hot ? "Đã đánh dấu sản phẩm đang hot" : "Đã bỏ đánh dấu hot");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteProduct(id),
    onSuccess: () => {
      dropProduct(qc, id);
      toast("Đã xoá sản phẩm");
      navigate("/products", { replace: true });
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  if (isLoading)
    return (
      <div className="page" aria-busy="true">
        <Skeleton h={20} w={100} />
        <div className="grid-2 detail">
          <Skeleton h={480} r={14} />
          <Skeleton h={360} r={14} />
        </div>
      </div>
    );
  if (error)
    return (
      <div className="page">
        <Link to="/products" className="back">
          ← Sản phẩm
        </Link>
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : refetch} />
      </div>
    );

  const p = data.item;
  const nImages = p.images?.length || 0;
  const nPrompts = p.promptCount || 0;

  return (
    <div className="page">
      <Link to="/products" className="back">
        ← Sản phẩm
      </Link>
      <div className="page-head">
        <div>
          <h1>
            <ProductName product={p} />
          </h1>
          <p>
            {p.category ? `${p.category} · ` : ""}
            {p.sku ? `Mã: ${p.sku} · ` : ""}
            {nPrompts} prompt tốt · cập nhật {fmtDate(p.updatedAt)}
          </p>
        </div>
        <div className="head-actions">
          {can("product.edit") && (
            <button
              type="button"
              className={`btn hot-toggle ${p.hot ? "is-on" : ""}`}
              onClick={() => hot.mutate(!p.hot)}
              disabled={hot.isPending}
              aria-pressed={Boolean(p.hot)}
              title={p.hot ? "Bỏ đánh dấu đang hot" : "Đánh dấu sản phẩm đang hot: hiện 🔥 trước tên và lên đầu danh sách"}
            >
              🔥 {p.hot ? "Đang hot" : "Đánh dấu hot"}
            </button>
          )}
          <Link className="btn btn-primary" to={`/?product=${p._id}`}>
            Tạo prompt cho sản phẩm này
          </Link>
        </div>
      </div>

      <div className="grid-2 detail">
        <Gallery key={p._id} product={p} editable={can("product.edit")} />
        <div className="card">
          <InfoForm product={p} editable={can("product.edit")} />
        </div>
      </div>

      <ProductPrompts productId={p._id} />

      {can("product.delete") && (
        <div className="card danger-zone">
          <div>
            <b>Xoá sản phẩm</b>
            <p className="hint">
              Sản phẩm dùng chung cả nhóm: xoá là mất với mọi người, cùng {nImages} ảnh, {nPrompts} prompt và các kế hoạch video của nó. Không khôi
              phục được.
            </p>
          </div>
          <ConfirmButton onConfirm={() => remove.mutate()} disabled={remove.isPending} confirmLabel="Bấm lần nữa để xoá hẳn">
            Xoá sản phẩm
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}
