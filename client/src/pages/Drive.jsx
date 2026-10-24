import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useDriveFiles, useDriveStatus } from "../lib/queries.js";
import { fmtDateTimeFull, uid, useDebounce } from "../lib/util.js";
import { EmptyState, ErrorState, Field, Modal, Skeleton } from "../components/ui.jsx";
import { JobList } from "../components/Uploader.jsx";
import { useToast } from "../components/Toast.jsx";

const FOLDER_ICON = "M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z";
const KIND_ICONS = {
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5",
  video: "M3 6h13v12H3zM16 10l5-3v10l-5-3",
  doc: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8ZM14 3v5h5M8 13h8M8 17h5",
};

const kindOf = (f) => (f.folder ? "folder" : f.mimeType?.startsWith("image/") ? "image" : f.mimeType?.startsWith("video/") ? "video" : "doc");
// Google Docs, Sheets, Slides and Drawings download as Office files; other Google types only open in Drive.
const EXPORTABLE = ["document", "spreadsheet", "presentation", "drawing"].map((t) => `application/vnd.google-apps.${t}`);
const downloadable = (f) => !f.folder && (!f.mimeType?.startsWith("application/vnd.google-apps.") || EXPORTABLE.includes(f.mimeType));

function fmtSize(n) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  for (; v >= 1024 && i < units.length - 1; i++) v /= 1024;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function FileIcon({ f }) {
  const kind = kindOf(f);
  return (
    <svg className={`drive-ico drive-ico-${kind}`} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d={kind === "folder" ? FOLDER_ICON : KIND_ICONS[kind]} />
    </svg>
  );
}

// One file at a time, so progress reads clearly and a failure names its file.
function useDriveUploads(maxMb) {
  const qc = useQueryClient();
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const patch = (id, p) => setJobs((all) => all.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const run = useCallback(
    async (parent, files) => {
      const list = files.map((file) => ({ id: uid(), name: file.name, file, progress: 0, status: "wait", error: "" }));
      setJobs((all) => [...all.filter((j) => j.status !== "error"), ...list]);
      let failed = 0;
      for (const job of list) {
        if (job.file.size > maxMb * 1024 * 1024) {
          failed++;
          patch(job.id, { status: "error", error: `File lớn hơn ${maxMb} MB.` });
          continue;
        }
        try {
          patch(job.id, { status: "upload" });
          await api.driveUpload(parent, job.file, (progress) => patch(job.id, { progress }));
          setJobs((all) => all.filter((j) => j.id !== job.id));
          qc.invalidateQueries({ queryKey: ["drive", "files"] });
        } catch (e) {
          failed++;
          patch(job.id, { status: "error", error: e.message });
          if (e.status === 401 || e.status === 403 || e.status === 503) {
            // Same answer for every remaining file: stop here.
            const rest = list.slice(list.indexOf(job) + 1);
            rest.forEach((j) => patch(j.id, { status: "error", error: e.message }));
            failed += rest.length;
            break;
          }
        }
      }
      const ok = list.length - failed;
      if (ok) toast(`Đã tải lên ${ok} file`, failed ? { detail: `${failed} file lỗi, xem danh sách bên dưới.` } : undefined);
      else if (failed) toast(`Chưa tải được ${failed} file`, { tone: "danger", detail: "Xem lỗi trong danh sách bên dưới." });
    },
    [maxMb, qc, toast]
  );

  const dismiss = useCallback(() => setJobs((all) => all.filter((j) => j.status !== "error")), []);
  return { jobs, run, dismiss, busy: jobs.some((j) => j.status !== "error") };
}

// New folder or rename: just a name.
function NameForm({ initial = "", submitLabel, pending, error, onSubmit, onCancel }) {
  const [value, setValue] = useState(initial);
  const ref = useRef(null);
  useEffect(() => {
    // Select the name without its extension, as file managers do.
    const el = ref.current;
    const dot = initial.lastIndexOf(".");
    el?.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <Field label="Tên">
        <input ref={ref} className="input" maxLength={200} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </Field>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="btns">
        <button type="submit" className="btn btn-primary" disabled={pending || !value.trim()}>
          {pending ? "Đang lưu..." : submitLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

function FileRow({ f, onOpen, onPreview, onRename, onDelete }) {
  return (
    <li className="drive-row">
      <button
        type="button"
        className="drive-main"
        onClick={() => (f.folder ? onOpen(f) : f.thumb ? onPreview(f) : null)}
        disabled={!f.folder && !f.thumb}
        title={f.folder ? `Mở thư mục ${f.name}` : f.thumb ? "Xem trước" : f.name}
      >
        {f.thumb ? <img className="drive-thumb" src={api.driveThumbUrl(f.id, 96)} alt="" loading="lazy" decoding="async" /> : <FileIcon f={f} />}
        <span className="drive-name">
          <b>{f.name}</b>
          <small>
            {f.path && <span>{f.path} · </span>}
            {f.folder ? "Thư mục" : fmtSize(f.size)}
            {f.modifiedTime && <> · <time dateTime={f.modifiedTime}>{fmtDateTimeFull(f.modifiedTime)}</time></>}
            {f.by && <> · {f.by}</>}
          </small>
        </span>
      </button>
      <div className="drive-acts">
        {downloadable(f) && (
          <a className="btn btn-sm" href={api.driveDownloadUrl(f.id)} download={f.name}>
            Tải về
          </a>
        )}
        {onRename && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onRename(f)}>
            Đổi tên
          </button>
        )}
        {onDelete && (
          <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => onDelete(f)}>
            Xoá
          </button>
        )}
      </div>
    </li>
  );
}

// Admins pick the team's folder: an existing one from its link, or a new one made by the app.
function FolderPicker({ current, onDone }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [link, setLink] = useState("");
  const save = useMutation({
    mutationFn: api.driveSetRoot,
    onSuccess: ({ folder }) => {
      toast(`Đã chọn thư mục “${folder.name}”`);
      setLink("");
      qc.invalidateQueries({ queryKey: ["drive"] });
      onDone?.();
    },
  });
  return (
    <form
      className="form drive-pick"
      onSubmit={(e) => {
        e.preventDefault();
        if (link.trim()) save.mutate({ folder: link.trim() });
      }}
    >
      <Field
        label={current ? "Đổi sang thư mục khác" : "Link thư mục Google Drive của team"}
        hint="Trong Google Drive, bấm chuột phải vào thư mục → Chia sẻ → Sao chép đường liên kết, rồi dán vào đây."
      >
        <input className="input" value={link} placeholder="https://drive.google.com/drive/folders/..." onChange={(e) => setLink(e.target.value)} />
      </Field>
      {save.error && (
        <p className="error" role="alert">
          {save.error.message}
        </p>
      )}
      <div className="btns">
        <button type="submit" className="btn btn-primary" disabled={save.isPending || !link.trim()}>
          {save.isPending ? "Đang kiểm tra..." : "Dùng thư mục này"}
        </button>
        {!current && (
          <button type="button" className="btn btn-ghost" disabled={save.isPending} onClick={() => save.mutate({ create: true })}>
            Hoặc tạo thư mục mới
          </button>
        )}
      </div>
    </form>
  );
}

function NotReady({ status, isAdmin }) {
  if (!status.configured)
    return (
      <EmptyState title="Chưa cấu hình Google Drive">
        {isAdmin
          ? "Thêm GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET và GOOGLE_REDIRECT_URI trên máy chủ (xem tài liệu 12), khởi động lại, rồi quay lại đây để kết nối."
          : "Quản trị viên cần cấu hình Google Drive trên máy chủ trước."}
      </EmptyState>
    );
  if (status.connected)
    return (
      <EmptyState title="Chọn thư mục cho team" action={isAdmin && <FolderPicker />}>
        {isAdmin
          ? `Đã kết nối Drive ${status.email}. Chọn thư mục cả team sẽ dùng chung: thành viên chỉ thấy những gì nằm trong thư mục này.`
          : "Quản trị viên chưa chọn thư mục Drive cho team."}
      </EmptyState>
    );
  return (
    <EmptyState
      title="Chưa kết nối Google Drive"
      action={
        isAdmin && (
          <a className="btn btn-primary" href={api.driveConnectUrl}>
            Kết nối Google Drive
          </a>
        )
      }
    >
      {isAdmin
        ? "Đăng nhập tài khoản Google đang giữ kho file của team, rồi chọn thư mục dùng chung. Thành viên không cần đăng nhập Google."
        : "Nhờ quản trị viên kết nối một tài khoản Google cho team."}
    </EmptyState>
  );
}

// The team's shared Google Drive folder: browse, search, upload, download, rename, delete. Folder and search live in the URL.
export default function Drive() {
  const { user, can } = useAuth();
  const isAdmin = user?.role === "admin";
  const canEdit = can("drive.edit");
  const qc = useQueryClient();
  const toast = useToast();
  const status = useDriveStatus();
  const connected = Boolean(status.data?.connected && status.data?.folder);

  const [params, setParams] = useSearchParams();
  const folder = params.get("folder") || "";
  const [q, setQ] = useState(params.get("q") || "");
  const dq = useDebounce(q.trim(), 300);
  const set = useCallback(
    (changes) =>
      setParams(
        (old) => {
          const next = new URLSearchParams(old);
          for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k);
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  // Back from Google's consent screen.
  useEffect(() => {
    const err = params.get("error");
    if (params.get("connected")) toast("Đã kết nối Google Drive");
    if (err) toast(err, { tone: "danger" });
    if (err || params.get("connected")) set({ connected: "", error: "" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (dq !== (params.get("q") || "")) set({ q: dq });
  }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps

  const files = useDriveFiles(dq ? { q: dq } : { folder }, connected);
  const first = files.data?.pages[0];
  const items = files.data?.pages.flatMap((p) => p.items) || [];
  const path = first?.path || [];
  const here = first?.folder?.id;

  const uploads = useDriveUploads(status.data?.maxUploadMb || 500);
  const [over, setOver] = useState(false);
  const pickRef = useRef(null);
  const upload = (list) => {
    const picked = [...(list || [])];
    if (!picked.length || !here) return;
    uploads.run(here, picked);
  };

  // null = closed; "new" = new folder; a file = rename it.
  const [naming, setNaming] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [preview, setPreview] = useState(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["drive", "files"] });

  const saveName = useMutation({
    mutationFn: (name) => (naming === "new" ? api.driveCreateFolder({ parent: here, name }) : api.driveRename(naming.id, name)),
    onSuccess: () => {
      toast(naming === "new" ? "Đã tạo thư mục" : "Đã đổi tên");
      setNaming(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (f) => api.driveDelete(f.id),
    onSuccess: () => {
      toast("Đã chuyển vào thùng rác của Drive");
      setDeleting(null);
      refresh();
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });
  const disconnect = useMutation({
    mutationFn: api.driveDisconnect,
    onSuccess: () => {
      toast("Đã ngắt kết nối Google Drive");
      qc.removeQueries({ queryKey: ["drive"] });
      status.refetch();
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  const openFolder = (f) => {
    setQ("");
    set({ folder: f.id, q: "" });
  };

  if (status.isLoading) return <Skeleton h={240} r={14} />;
  if (status.error) return <ErrorState error={status.error} onRetry={status.refetch} />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Google Drive</h1>
          <p>{connected ? `Thư mục “${status.data.folder.name}” trong Drive ${status.data.email}, dùng chung cả team.` : "Kho file chung của team trên Google Drive."}</p>
        </div>
        {connected && canEdit && !dq && (
          <div className="btns">
            <button type="button" className="btn" onClick={() => setNaming("new")} disabled={!here}>
              + Thư mục
            </button>
            <button type="button" className="btn btn-primary" onClick={() => pickRef.current?.click()} disabled={!here}>
              Tải file lên
            </button>
            <input
              ref={pickRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                upload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>

      {!connected ? (
        <NotReady status={status.data} isAdmin={isAdmin} />
      ) : (
        <>
          <div className="drive-bar">
            <input className="input" type="search" aria-label="Tìm file trên Drive" placeholder="Tìm theo tên file trong cả kho" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          {dq ? (
            <div className="filters-sum">
              <span>{files.isLoading ? "Đang tìm..." : items.length ? `Tìm thấy ${items.length} mục` : "Không có file nào khớp"}</span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setQ("")}>
                Bỏ tìm
              </button>
            </div>
          ) : (
            path.length > 0 && (
              <nav className="crumbs" aria-label="Đường dẫn thư mục">
                {path.map((p, i) =>
                  i === path.length - 1 ? (
                    <span key={p.id} aria-current="page">
                      {p.name}
                    </span>
                  ) : (
                    <span key={p.id}>
                      <button type="button" className="link-btn" onClick={() => set({ folder: i ? p.id : "" })}>
                        {p.name}
                      </button>
                      <span aria-hidden="true"> / </span>
                    </span>
                  )
                )}
              </nav>
            )
          )}

          <JobList jobs={uploads.jobs} onDismiss={uploads.dismiss} />

          <section
            className={`drive-box ${over ? "is-over" : ""}`}
            onDragOver={(e) => {
              if (!canEdit || dq || !e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setOver(false)}
            onDrop={(e) => {
              if (!canEdit || dq) return;
              e.preventDefault();
              setOver(false);
              upload(e.dataTransfer.files);
            }}
          >
            {files.isLoading ? (
              <div className="stack" aria-busy="true">
                <Skeleton h={52} />
                <Skeleton h={52} />
                <Skeleton h={52} />
              </div>
            ) : files.error ? (
              <ErrorState error={files.error} onRetry={files.refetch} />
            ) : !items.length ? (
              !dq && (
                <EmptyState title="Thư mục trống">{canEdit ? "Kéo thả file vào đây hoặc bấm “Tải file lên”." : "Chưa có file nào."}</EmptyState>
              )
            ) : (
              <ul className="drive-list">
                {items.map((f) => (
                  <FileRow
                    key={f.id}
                    f={f}
                    onOpen={openFolder}
                    onPreview={setPreview}
                    onRename={canEdit ? setNaming : undefined}
                    onDelete={can("drive.delete") ? setDeleting : undefined}
                  />
                ))}
              </ul>
            )}
            {files.hasNextPage && (
              <button type="button" className="btn btn-ghost" onClick={() => files.fetchNextPage()} disabled={files.isFetchingNextPage}>
                {files.isFetchingNextPage ? "Đang tải..." : "Xem thêm"}
              </button>
            )}
            {over && <div className="drive-drop-hint">Thả để tải lên “{first?.folder?.name}”</div>}
          </section>

          {isAdmin && (
            <details className="drive-admin">
              <summary>Quản lý kết nối</summary>
              <p className="hint">
                Đang dùng thư mục <b>{status.data.folder.name}</b> trong Drive của <b>{status.data.email}</b>. Ngắt kết nối không xoá file nào trên Drive.
              </p>
              <FolderPicker current={status.data.folder} onDone={() => set({ folder: "", q: "" })} />
              <div className="btns">
                <a className="btn btn-sm" href={api.driveConnectUrl}>
                  Kết nối lại / đổi tài khoản
                </a>
                <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                  {disconnect.isPending ? "Đang ngắt..." : "Ngắt kết nối"}
                </button>
              </div>
            </details>
          )}
        </>
      )}

      <Modal
        open={Boolean(naming)}
        onClose={() => {
          setNaming(null);
          saveName.reset();
        }}
        title={naming === "new" ? "Thư mục mới" : "Đổi tên"}
      >
        {naming && (
          <NameForm
            initial={naming === "new" ? "" : naming.name}
            submitLabel={naming === "new" ? "Tạo thư mục" : "Lưu"}
            pending={saveName.isPending}
            error={saveName.error?.message}
            onSubmit={(name) => saveName.mutate(name)}
            onCancel={() => {
              setNaming(null);
              saveName.reset();
            }}
          />
        )}
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title={deleting?.folder ? "Xoá thư mục này?" : "Xoá file này?"}>
        {deleting && (
          <>
            <p>
              <b>{deleting.name}</b>
              {deleting.folder ? " và mọi thứ bên trong" : ""} sẽ vào thùng rác của Google Drive (khôi phục được trong 30 ngày từ chính Drive).
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

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.name || ""} wide>
        {preview && (
          <>
            <img className="drive-preview" src={api.driveThumbUrl(preview.id, 1600)} alt={preview.name} />
            <div className="btns">
              {downloadable(preview) && (
                <a className="btn btn-primary" href={api.driveDownloadUrl(preview.id)} download={preview.name}>
                  Tải về ({fmtSize(preview.size)})
                </a>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
                Đóng
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
