import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { dropProduct, putProduct, usePrompts } from "../lib/queries.js";
import { fmtDate } from "../lib/util.js";
import { ConfirmButton, EmptyState, ErrorState, Field, Modal, Skeleton } from "../components/ui.jsx";
import LazyImage from "../components/LazyImage.jsx";
import PromptCard from "../components/PromptCard.jsx";
import { EMPTY_EXTERNAL, ExternalPromptFields, externalBody } from "../components/PromptFields.jsx";
import { DropZone, JobList, MAX_IMAGES, useUploads } from "../components/Uploader.jsx";
import { useToast } from "../components/Toast.jsx";

const FIELDS = ["name", "sku", "closed", "extraNeg", "note"];
const formOf = (p) => ({ name: p.name || "", sku: p.sku || "", closed: p.closed !== false, extraNeg: p.extraNeg || "", note: p.note || "" });

function Gallery({ product }) {
  const qc = useQueryClient();
  const toast = useToast();
  const images = product.images || [];
  const [current, setCurrent] = useState(images[0]?.publicId);
  const shown = images.find((i) => i.publicId === current) || images[0];
  const uploads = useUploads((item) => putProduct(qc, item));

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
      {shown && (
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
      <DropZone room={MAX_IMAGES - images.length - uploads.jobs.filter((j) => j.status !== "error").length} disabled={uploads.busy} onFiles={(files) => uploads.run(product._id, files)} />
      <JobList jobs={uploads.jobs} onDismiss={uploads.dismiss} />
    </div>
  );
}

function InfoForm({ product }) {
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
      <Field label="Tên sản phẩm">
        <input className="input" value={form.name} maxLength={160} onChange={setF("name")} />
      </Field>
      <Field label="Mã sản phẩm">
        <input className="input" value={form.sku} maxLength={60} onChange={setF("sku")} />
      </Field>
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
  const items = data?.pages.flatMap((p) => p.items) || [];
  const addButton = (
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
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["product", id],
    queryFn: () => api.product(id),
    // Start from the list entry so the page draws instantly.
    placeholderData: () => {
      const p = qc.getQueryData(["products"])?.items.find((x) => x._id === id);
      return p ? { item: p } : undefined;
    },
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
          <h1>{p.name}</h1>
          <p>
            {p.sku ? `Mã: ${p.sku} · ` : ""}
            {nPrompts} prompt tốt · cập nhật {fmtDate(p.updatedAt)}
          </p>
        </div>
        <Link className="btn btn-primary" to={`/?product=${p._id}`}>
          Tạo prompt cho sản phẩm này
        </Link>
      </div>

      <div className="grid-2 detail">
        <Gallery key={p._id} product={p} />
        <div className="card">
          <InfoForm product={p} />
        </div>
      </div>

      <ProductPrompts productId={p._id} />

      <div className="card danger-zone">
        <div>
          <b>Xoá sản phẩm</b>
          <p className="hint">
            Xoá cả {nImages} ảnh và {nPrompts} prompt. Không khôi phục được.
          </p>
        </div>
        <ConfirmButton onConfirm={() => remove.mutate()} disabled={remove.isPending} confirmLabel="Bấm lần nữa để xoá hẳn">
          Xoá sản phẩm
        </ConfirmButton>
      </div>
    </div>
  );
}
