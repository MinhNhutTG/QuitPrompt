import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useDriveStatus, usePlan } from "../lib/queries.js";
import { copyText, fmtDate, fmtDateTimeFull } from "../lib/util.js";
import { ConfirmButton, EmptyState, ErrorState, Field, Skeleton } from "../components/ui.jsx";
import LazyImage from "../components/LazyImage.jsx";
import { useToast } from "../components/Toast.jsx";
import CopyPlanDialog from "../components/CopyPlanDialog.jsx";
import { SLOTS, STATUS, progressOf } from "../lib/plans.js";
import { saveFiles, standalone } from "../lib/download.js";

function fmtSize(n) {
  if (!n) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) (n /= 1024), i++;
  return `${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

const SlotIcon = ({ kind }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={kind === "audio" ? "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" : "M4 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM16 10l5-3v10l-5-3"} />
  </svg>
);

function FileSlot({ plan, slot, canWork, driveReady, onChanged }) {
  const toast = useToast();
  const input = useRef(null);
  const [progress, setProgress] = useState(null);
  const file = plan.files?.[slot.key];

  async function upload(f) {
    if (!f) return;
    setProgress(0);
    try {
      const { item } = await api.planUpload(plan._id, slot.key, f, setProgress);
      onChanged(item);
      toast(`Đã tải lên ${slot.label}`);
    } catch (e) {
      toast(e.message, { tone: "danger" });
    } finally {
      setProgress(null);
    }
  }

  const remove = useMutation({
    mutationFn: () => api.planDeleteFile(plan._id, slot.key),
    onSuccess: ({ item }) => {
      onChanged(item);
      toast(`Đã xoá ${slot.label}`);
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  const busy = progress !== null;
  return (
    <li className={`slot ${file ? "is-filled" : ""}`}>
      <span className="slot-ico">
        <SlotIcon kind={slot.kind} />
      </span>
      <div className="slot-body">
        <b>{slot.label}</b>
        {busy ? (
          <div className="meter" role="progressbar" aria-label={`Đang tải ${slot.label}`} aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        ) : file ? (
          <span className="hint" title={fmtDateTimeFull(file.at)}>
            {file.name} · {fmtSize(file.size)}
          </span>
        ) : (
          <span className="hint">Chưa có file</span>
        )}
      </div>
      <div className="slot-acts">
        {file && !busy && (
          <a className="btn btn-sm" href={api.driveDownloadUrl(file.id)} download={file.name}>
            Tải về
          </a>
        )}
        {canWork && (
          <>
            <input ref={input} type="file" accept={slot.accept} hidden onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ""))} />
            <button type="button" className={`btn btn-sm ${file ? "" : "btn-primary"}`} disabled={busy || !driveReady} onClick={() => input.current?.click()}>
              {busy ? `${Math.round(progress * 100)}%` : file ? "Thay" : "Tải lên"}
            </button>
            {file && !busy && (
              <ConfirmButton className="btn btn-sm btn-danger-ghost" disabled={remove.isPending} onConfirm={() => remove.mutate()}>
                Xoá
              </ConfirmButton>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function TextBlock({ plan, field, label, hint, canWork, onChanged }) {
  const toast = useToast();
  const [value, setValue] = useState(plan[field] || "");
  useEffect(() => setValue(plan[field] || ""), [plan[field]]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = value !== (plan[field] || "");
  const save = useMutation({
    mutationFn: () => api.updatePlan(plan._id, { [field]: value }),
    onSuccess: ({ item }) => {
      onChanged(item);
      toast(`Đã lưu ${label.toLowerCase()}`);
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });
  async function copy() {
    const ok = await copyText(value);
    toast(ok ? "Đã copy" : "Trình duyệt chặn copy. Bôi đen rồi nhấn Ctrl/Cmd+C.", { tone: ok ? "ok" : "danger" });
  }
  return (
    <Field label={label} hint={hint}>
      <textarea className="input" rows={5} maxLength={5000} value={value} readOnly={!canWork} onChange={(e) => setValue(e.target.value)} placeholder={canWork ? "Nhập nội dung..." : ""} />
      <div className="btns">
        {canWork && dirty && (
          <>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Đang lưu..." : "Lưu"}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setValue(plan[field] || "")}>
              Huỷ sửa
            </button>
          </>
        )}
        {value && !dirty && (
          <button type="button" className="btn btn-sm" onClick={copy}>
            Copy
          </button>
        )}
      </div>
    </Field>
  );
}

// Everything needed to post the video, one tap each: the files to download and the texts to copy.
function Handoff({ plan }) {
  const toast = useToast();
  const files = SLOTS.map((s) => ({ ...s, file: plan.files?.[s.key] })).filter((s) => s.file);
  if (!files.length && !plan.voiceText && !plan.caption) return null;

  async function copy(text, what) {
    const ok = await copyText(text);
    toast(ok ? `Đã copy ${what}` : "Trình duyệt chặn copy. Bôi đen rồi nhấn Ctrl/Cmd+C.", { tone: ok ? "ok" : "danger" });
  }
  // One download per file, a moment apart: browsers drop downloads started all at once
  // (and may ask once to allow several).
  function downloadAll() {
    // Home-screen app: one share sheet for all of them.
    if (standalone) return saveFiles(files.map((s) => ({ url: api.driveDownloadUrl(s.file.id), name: s.file.name })), toast);
    files.forEach((s, i) =>
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = api.driveDownloadUrl(s.file.id);
        a.download = s.file.name;
        document.body.append(a);
        a.click();
        a.remove();
      }, i * 800)
    );
    toast(`Đang tải ${files.length} file`, { detail: "Nếu trình duyệt hỏi có cho tải nhiều file không, chọn Cho phép." });
  }

  return (
    <section className={`card handoff ${plan.status === "done" ? "is-done" : ""}`}>
      <div className="sec-h">{plan.status === "done" ? "Thành phẩm đã xong, lấy về để đăng" : "Lấy file và text"}</div>
      <div className="btns">
        {files.map((s) => (
          <a key={s.key} className={`btn btn-sm ${s.key === "final" ? "btn-primary" : ""}`} href={api.driveDownloadUrl(s.file.id)} download={s.file.name}>
            Tải {s.label.toLowerCase()}
          </a>
        ))}
        {files.length > 1 && (
          <button type="button" className="btn btn-sm" onClick={downloadAll}>
            Tải tất cả ({files.length} file)
          </button>
        )}
      </div>
      {(plan.voiceText || plan.caption) && (
        <div className="btns">
          {plan.voiceText && (
            <button type="button" className="btn btn-sm" onClick={() => copy(plan.voiceText, "lời đọc")}>
              Copy lời đọc
            </button>
          )}
          {plan.caption && (
            <button type="button" className="btn btn-sm" onClick={() => copy(plan.caption, "mô tả")}>
              Copy mô tả khi đăng
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function StatusSelect({ plan, onChanged }) {
  const toast = useToast();
  const save = useMutation({
    mutationFn: (status) => api.updatePlan(plan._id, { status }),
    onSuccess: ({ item }) => {
      onChanged(item);
      toast("Đã cập nhật trạng thái");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });
  return (
    <select className={`input status-select status-${STATUS[plan.status].tone}`} aria-label="Trạng thái" value={plan.status} disabled={save.isPending} onChange={(e) => save.mutate(e.target.value)}>
      {Object.entries(STATUS).map(([v, s]) => (
        <option key={v} value={v}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

// One plan: its details, its files (in the plan's own Drive folder) and the two texts.
export default function PlanDetail() {
  const { id } = useParams();
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error, refetch } = usePlan(id);
  const drive = useDriveStatus();
  const plan = data?.item;
  const [copying, setCopying] = useState(false);

  const onChanged = (item) => {
    qc.setQueryData(["plans", "one", id], { item });
    qc.invalidateQueries({ queryKey: ["plans"], predicate: (q) => q.queryKey[1] !== "one" });
  };

  const makeFolder = useMutation({
    mutationFn: () => api.planFolder(id),
    onSuccess: ({ item }) => {
      onChanged(item);
      toast("Đã tạo thư mục trên Google Drive");
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  if (isLoading)
    return (
      <div className="page" aria-busy="true">
        <Skeleton h={28} w="40%" />
        <Skeleton h={160} r={14} />
        <Skeleton h={240} r={14} />
      </div>
    );
  if (error)
    return (
      <div className="page">
        <Link to="/plans" className="back">
          ← Kế hoạch
        </Link>
        {error.status === 404 ? <EmptyState title="Không tìm thấy kế hoạch">Kế hoạch này có thể đã bị xoá.</EmptyState> : <ErrorState error={error} onRetry={refetch} />}
      </div>
    );

  const canWork = plan.assignee.id === user?.id || can("plan.edit");
  const isAssignee = plan.assignee.id === user?.id;
  const driveReady = Boolean(drive.data?.connected && drive.data?.folder);
  const { have, total } = progressOf(plan);
  const today = new Date().toLocaleDateString("en-CA");
  const overdue = plan.status !== "done" && plan.dueDate && plan.dueDate < today;
  const productGone = plan.product.name.startsWith("(");

  return (
    <div className="page">
      <Link to="/plans" className="back">
        ← Kế hoạch
      </Link>

      <div className="plan-head">
        <LazyImage image={plan.product.images?.[0]} width={64} ratio="1 / 1" />
        <div className="plan-head-text">
          <h1>{productGone ? plan.product.name : <Link to={`/products/${plan.product._id}`}>{plan.product.name}</Link>}</h1>
          <p className="hint">
            {plan.product.sku ? `${plan.product.sku} · ` : ""}Đã có {have}/{total} mục
          </p>
        </div>
        {!productGone && (
          <div className="btns">
            {can("plan.edit") && (
              <button type="button" className="btn" onClick={() => setCopying(true)}>
                Sao chép
              </button>
            )}
            <Link className="btn" to={`/?product=${plan.product._id}`}>
              Tạo prompt
            </Link>
          </div>
        )}
      </div>
      <CopyPlanDialog plan={copying ? plan : null} onClose={() => setCopying(false)} />

      <Handoff plan={plan} />

      <div className="card plan-info">
        <dl>
          <div>
            <dt>Người thực hiện</dt>
            <dd>{plan.assignee.displayName}</dd>
          </div>
          <div>
            <dt>Hạn nộp</dt>
            <dd>
              {plan.dueDate ? fmtDate(plan.dueDate) : "Không có hạn"}
              {overdue && <span className="plan-overdue"> Quá hạn</span>}
            </dd>
          </div>
          <div>
            <dt>Trạng thái</dt>
            <dd>{isAssignee ? <StatusSelect plan={plan} onChanged={onChanged} /> : <span className={`status status-${STATUS[plan.status].tone}`}>{STATUS[plan.status].label}</span>}</dd>
          </div>
          <div>
            <dt>Người tạo</dt>
            <dd>{plan.createdBy.displayName}</dd>
          </div>
          <div>
            <dt>Ngày tạo</dt>
            <dd title={fmtDateTimeFull(plan.createdAt)}>{fmtDate(plan.createdAt)}</dd>
          </div>
          <div>
            <dt>Thư mục Drive</dt>
            <dd>
              {plan.folder?.id ? (
                <Link to={`/drive?folder=${plan.folder.id}`}>{plan.folder.name}</Link>
              ) : canWork && driveReady ? (
                <button type="button" className="btn btn-sm" onClick={() => makeFolder.mutate()} disabled={makeFolder.isPending}>
                  {makeFolder.isPending ? "Đang tạo..." : "Tạo thư mục"}
                </button>
              ) : (
                <span className="hint">Chưa có</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <section className="card">
        <div className="sec-h">File</div>
        {!drive.isLoading && !driveReady && (
          <p className="notice">
            Google Drive chưa được kết nối nên chưa tải file lên được. Nhờ quản trị viên kết nối ở trang <Link to="/drive">Google Drive</Link>.
          </p>
        )}
        <ul className="slots">
          {SLOTS.map((s) => (
            <FileSlot key={s.key} plan={plan} slot={s} canWork={canWork} driveReady={driveReady} onChanged={onChanged} />
          ))}
        </ul>
      </section>

      <section className="card stack">
        <TextBlock plan={plan} field="voiceText" label="Lời đọc" hint="Nội dung giọng đọc của video" canWork={canWork} onChanged={onChanged} />
        <TextBlock plan={plan} field="caption" label="Mô tả khi đăng" hint="Caption, hashtag đăng kèm video" canWork={canWork} onChanged={onChanged} />
      </section>
    </div>
  );
}
