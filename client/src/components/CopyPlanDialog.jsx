import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { SLOTS } from "../lib/plans.js";
import { Modal } from "./ui.jsx";
import { useToast } from "./Toast.jsx";

// Makes a new plan like `plan` (same product, assignee, due day; "Chưa thực hiện", made today, its own Drive folder),
// optionally with the texts and some of the files copied over, then opens it.
export default function CopyPlanDialog({ plan, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const hasTexts = Boolean(plan?.voiceText || plan?.caption);
  const fileSlots = SLOTS.filter((s) => plan?.files?.[s.key]);
  const [texts, setTexts] = useState(true);
  const [files, setFiles] = useState(() => new Set());
  useEffect(() => {
    setTexts(true);
    setFiles(new Set());
  }, [plan?._id]);

  const copy = useMutation({
    mutationFn: () => api.copyPlan(plan._id, { texts: hasTexts && texts, files: [...files] }),
    onSuccess: ({ item, driveWarning }) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      if (driveWarning) toast("Đã sao chép kế hoạch", { tone: "danger", detail: driveWarning });
      else toast("Đã sao chép kế hoạch");
      onClose();
      navigate(`/plans/${item._id}`);
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });

  const toggle = (key, on) =>
    setFiles((old) => {
      const next = new Set(old);
      on ? next.add(key) : next.delete(key);
      return next;
    });

  return (
    <Modal open={Boolean(plan)} onClose={onClose} title="Sao chép kế hoạch">
      {plan && (
        <div className="form">
          <p>
            Tạo kế hoạch mới cho <b>{plan.product.name}</b>, giao cho {plan.assignee.displayName}, cùng hạn nộp. Kế hoạch mới bắt đầu ở trạng thái "Chưa thực
            hiện" và có thư mục riêng trên Google Drive theo ngày hôm nay.
          </p>
          {(hasTexts || fileSlots.length > 0) && (
            <fieldset className="bare copy-opts">
              <legend className="field-label">Chép thêm sang kế hoạch mới</legend>
              {hasTexts && (
                <label className="check">
                  <input type="checkbox" checked={texts} onChange={(e) => setTexts(e.target.checked)} />
                  Lời đọc và mô tả khi đăng
                </label>
              )}
              {fileSlots.map((s) => (
                <label key={s.key} className="check">
                  <input type="checkbox" checked={files.has(s.key)} onChange={(e) => toggle(s.key, e.target.checked)} />
                  {s.label}
                </label>
              ))}
            </fieldset>
          )}
          <div className="btns">
            <button type="button" className="btn btn-primary" onClick={() => copy.mutate()} disabled={copy.isPending}>
              {copy.isPending ? "Đang sao chép..." : "Sao chép"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Huỷ
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
