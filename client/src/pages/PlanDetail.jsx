import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useDriveStatus, usePlan } from "../lib/queries.js";
import { copyText, fmtDate, fmtDateTimeFull } from "../lib/util.js";
import { EmptyState, ErrorState, Field, Modal, ProductName, Skeleton } from "../components/ui.jsx";
import { PickScript } from "../components/Scripts.jsx";
import LazyImage from "../components/LazyImage.jsx";
import { useToast } from "../components/Toast.jsx";
import CopyPlanDialog from "../components/CopyPlanDialog.jsx";
import { ClaimBar, useClaim, useClaimGuard } from "../components/Claim.jsx";
import { SLOTS, STATUS, isFinished, progressOf } from "../lib/plans.js";
import { saveFiles, standalone } from "../lib/download.js";
import FileSlot from "../components/FileSlot.jsx";
import AiFlow from "../components/AiFlow.jsx";
import { ChannelPicker } from "../components/Channels.jsx";

function TextBlock({ plan, field, label, hint, onChanged, guard }) {
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
      <textarea className="input" rows={5} maxLength={5000} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Nhập nội dung..." />
      <div className="btns">
        {dirty && (
          <>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => guard(() => save.mutate())} disabled={save.isPending}>
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
    <section className={`card handoff ${isFinished(plan.status) ? "is-done" : ""}`}>
      <div className="sec-h">{plan.status === "posted" ? "Đã đăng bài" : plan.status === "done" ? "Thành phẩm đã xong, lấy về để đăng" : "Lấy file và text"}</div>
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

function StatusSelect({ plan, onChanged, guard }) {
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
    <select className={`input status-select status-${STATUS[plan.status].tone}`} aria-label="Trạng thái" value={plan.status} disabled={save.isPending} onChange={(e) => {
        const v = e.target.value;
        guard(() => save.mutate(v));
      }}>
      {Object.entries(STATUS).map(([v, s]) => (
        <option key={v} value={v}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

// Where the video will be posted: each tap saves at once (doc 09 §4c). Any member may change it.
function PlanChannels({ plan, onChanged, isAdmin }) {
  const toast = useToast();
  const value = plan.channels.map((c) => c._id);
  const save = useMutation({
    mutationFn: (channels) => api.updatePlan(plan._id, { channels }),
    onSuccess: ({ item }) => onChanged(item),
    onError: (e) => toast(e.message, { tone: "danger" }),
  });
  return <ChannelPicker value={save.isPending ? save.variables : value} onChange={(v) => save.mutate(v)} disabled={save.isPending} isAdmin={isAdmin} />;
}

// One plan: its details, its files (in the plan's own Drive folder) and the two texts.
export default function PlanDetail() {
  const { id } = useParams();
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error, refetch } = usePlan(id);
  const drive = useDriveStatus();
  const plan = data?.item;
  const [copying, setCopying] = useState(false);
  const [picking, setPicking] = useState(false);

  const onChanged = (item) => {
    qc.setQueryData(["plans", "one", id], { item });
    qc.invalidateQueries({ queryKey: ["plans"], predicate: (q) => q.queryKey[1] !== "one" });
  };
  const claim = useClaim(plan, onChanged);
  const { guard, dialog } = useClaimGuard(claim);

  // Opens the plan in QuickEdit, the desktop editor on this computer, through its quickedit:// link. The link carries
  // this site's address and a token for this plan only; QuickEdit downloads the files and sends the video back.
  const openEditor = useMutation({
    mutationFn: () => api.planQuickEdit(id),
    onSuccess: ({ token }) => {
      window.location.href = `quickedit://open?site=${encodeURIComponent(window.location.origin)}&token=${encodeURIComponent(token)}`;
      toast("Đang mở QuickEdit", { detail: "Nếu trình duyệt hỏi có mở QuickEdit không, chọn Mở. Không thấy gì xảy ra thì máy này chưa có QuickEdit." });
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

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

  const driveReady = Boolean(drive.data?.connected && drive.data?.folder);
  const { have, total } = progressOf(plan);
  const today = new Date().toLocaleDateString("en-CA");
  const overdue = !isFinished(plan.status) && plan.dueDate && plan.dueDate < today;
  const productGone = plan.product.name.startsWith("(");
  // QuickEdit starts from the two clips and the voice-over, or its text, which QuickEdit can read aloud.
  const editable = plan.files?.clip1 && plan.files?.clip2 && (plan.files?.audio || plan.voiceText);

  return (
    <div className="page">
      <Link to="/plans" className="back">
        ← Kế hoạch
      </Link>

      <div className="plan-head">
        <LazyImage image={plan.product.images?.[0]} width={64} ratio="1 / 1" />
        <div className="plan-head-text">
          <h1>{productGone ? plan.product.name : <Link to={`/products/${plan.product._id}`}>
            <ProductName product={plan.product} />
          </Link>}</h1>
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
            {editable && (
              <button type="button" className="btn btn-primary" onClick={() => guard(() => openEditor.mutate())} disabled={openEditor.isPending} title={plan.files?.audio ? "Mở 2 video và lời đọc trong QuickEdit trên máy này để dựng video" : "Mở 2 video trong QuickEdit trên máy này; QuickEdit đọc lời đọc thành giọng nói"}>
                {openEditor.isPending ? "Đang mở..." : "Tạo video"}
              </button>
            )}
          </div>
        )}
      </div>
      <CopyPlanDialog plan={copying ? plan : null} onClose={() => setCopying(false)} />
      {dialog}

      <ClaimBar c={claim} />

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
            <dd>
              <StatusSelect plan={plan} onChanged={onChanged} guard={guard} />
            </dd>
          </div>
          <div className="plan-info-wide">
            <dt>Kênh đăng</dt>
            <dd>
              <PlanChannels plan={plan} onChanged={onChanged} isAdmin={user?.role === "admin"} />
            </dd>
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
              ) : driveReady ? (
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

      {!productGone && <AiFlow plan={plan} driveReady={driveReady} onChanged={onChanged} guard={guard} />}

      <section className="card">
        <div className="sec-h">File</div>
        {!drive.isLoading && !driveReady && (
          <p className="notice">
            Google Drive chưa được kết nối nên chưa tải file lên được. Nhờ quản trị viên kết nối ở trang <Link to="/drive">Google Drive</Link>.
          </p>
        )}
        <ul className="slots">
          {SLOTS.map((s) => (
            <FileSlot key={s.key} plan={plan} slot={s} driveReady={driveReady} onChanged={onChanged} guard={guard} />
          ))}
        </ul>
      </section>

      <Modal open={picking} onClose={() => setPicking(false)} title="Chọn lời đọc và mô tả đã lưu" wide>
        {picking && <PickScript plan={plan} onPicked={onChanged} onClose={() => setPicking(false)} />}
      </Modal>
      <section className="card stack">
        {!productGone && (
          <div className="sec-h">
            Lời đọc và mô tả
            <button type="button" className="btn btn-sm" onClick={() => guard(() => setPicking(true))}>
              Chọn từ lời đọc đã lưu
            </button>
          </div>
        )}
        <TextBlock plan={plan} field="voiceText" label="Lời đọc" hint="Nội dung giọng đọc của video" onChanged={onChanged} guard={guard} />
        <TextBlock plan={plan} field="caption" label="Mô tả khi đăng" hint="Caption, hashtag đăng kèm video" onChanged={onChanged} guard={guard} />
      </section>
    </div>
  );
}
