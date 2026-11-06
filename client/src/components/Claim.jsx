import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { fmtDateTime, vnDay } from "../lib/util.js";
import { isFinished } from "../lib/plans.js";
import { ConfirmButton, Modal } from "./ui.jsx";
import { useToast } from "./Toast.jsx";

// "Nhận làm": who is making a plan's video right now, so two members never make the same one.
// Anyone takes a free plan; taking one someone else holds needs a second tap ("Nhận làm thay"). The one working on it,
// or whoever may edit plans, lets it go; the server also lets go when the plan becomes done or posted.

// "14:05" today, "06/11 14:05" another day.
export function claimTime(at) {
  if (!at) return "";
  const s = fmtDateTime(at);
  return vnDay(at) === vnDay() ? s.slice(6) : s;
}

// The plan's claim as seen by me: state is "free", "mine", "other" or "done" (finished, nothing to take).
export function useClaim(plan, onChanged) {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const claim = plan?.claim || null;
  const state = !plan || isFinished(plan.status) ? "done" : !claim ? "free" : claim.by.id === user?.id ? "mine" : "other";

  const done = (item, msg) => {
    onChanged?.(item);
    qc.invalidateQueries({ queryKey: ["plans"] });
    toast(msg);
  };
  const failed = (e) => {
    toast(e.message, { tone: "danger" });
    // Someone else got it first (or the plan changed): show what is true now.
    if (e.status === 409) qc.invalidateQueries({ queryKey: ["plans"] });
  };
  const take = useMutation({
    mutationFn: (force) => api.claimPlan(plan._id, force),
    onSuccess: ({ item }, force) => done(item, force ? "Đã nhận làm thay" : "Đã nhận làm, cả team sẽ thấy bạn đang làm"),
    onError: failed,
  });
  const release = useMutation({
    mutationFn: () => api.releasePlan(plan._id),
    onSuccess: ({ item }) => done(item, "Đã thả kế hoạch, người khác nhận làm được"),
    onError: failed,
  });
  return { claim, state, take, release, canRelease: state === "mine" || (state === "other" && can("plan.edit")), busy: take.isPending || release.isPending };
}

// The buttons for one plan; small = on a note in the list.
export function ClaimButtons({ c, small }) {
  const sm = small ? "btn-sm" : "";
  if (c.state === "free")
    return (
      <button type="button" className={`btn ${sm} btn-claim`} onClick={() => c.take.mutate(false)} disabled={c.busy} title="Báo cho cả team biết bạn đang làm video này">
        {c.take.isPending ? "Đang nhận..." : "Nhận làm"}
      </button>
    );
  if (c.state === "mine")
    return (
      <button type="button" className={`btn ${sm} btn-ghost`} onClick={() => c.release.mutate()} disabled={c.busy} title="Thôi làm, để người khác nhận">
        {c.release.isPending ? "Đang thả..." : "Thả ra"}
      </button>
    );
  // Taking over is done from the plan's page, where the whole warning is.
  if (c.state === "other" && !small)
    return (
      <>
        <ConfirmButton className={`btn ${sm}`} confirmLabel="Chắc chưa? Bấm lần nữa" disabled={c.busy} onConfirm={() => c.take.mutate(true)}>
          Nhận làm thay
        </ConfirmButton>
        {c.canRelease && (
          <ConfirmButton className="btn btn-ghost" confirmLabel="Bấm lần nữa để thả" disabled={c.busy} onConfirm={() => c.release.mutate()}>
            Thả ra
          </ConfirmButton>
        )}
      </>
    );
  return null;
}

// "Lan đang làm · 14:05" on a note.
export function ClaimTag({ c }) {
  if (c.state !== "mine" && c.state !== "other") return null;
  return (
    <span className={`claim-tag is-${c.state}`} title={`Nhận làm lúc ${fmtDateTime(c.claim.at)}`}>
      <span className="claim-dot" aria-hidden="true" />
      {c.state === "mine" ? "Bạn đang làm" : `${c.claim.by.displayName} đang làm`}
      <span className="claim-time">· {claimTime(c.claim.at)}</span>
    </span>
  );
}

// While someone else holds the plan, my first change on its page asks once: "Lan is on it, go on anyway?".
// guard(action) runs the action straight away otherwise. Returns { guard, dialog } (dialog goes in the page).
export function useClaimGuard(c) {
  const [pending, setPending] = useState(null);
  const [ok, setOk] = useState(false);
  const guard = (action) => (c.state === "other" && !ok ? setPending(() => action) : action());
  const close = () => setPending(null);
  const dialog = (
    <Modal open={Boolean(pending)} onClose={close} title={`${c.claim?.by.displayName || "Người khác"} đang làm kế hoạch này`}>
      {pending && (
        <>
          <p>
            {c.claim.by.displayName} đã nhận làm lúc {claimTime(c.claim.at)}. Sửa cùng lúc dễ làm trùng hoặc ghi đè file của nhau. Nên nhắn hỏi trước trong chat.
          </p>
          <div className="btns">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setOk(true);
                close();
                // Still inside the click, so a file picker opened by the action is allowed.
                pending();
              }}
            >
              Vẫn làm tiếp
            </button>
            <button type="button" className="btn btn-ghost" onClick={close} autoFocus>
              Thôi
            </button>
          </div>
        </>
      )}
    </Modal>
  );
  return { guard, dialog };
}

// The strip on top of a plan's page: who is on it, and what I can do about it.
export function ClaimBar({ c }) {
  if (c.state === "done") return null;
  const text =
    c.state === "free" ? (
      <>
        <b>Chưa ai nhận làm.</b> Bấm Nhận làm trước khi bắt đầu để không ai làm trùng.
      </>
    ) : c.state === "mine" ? (
      <>
        <b>Bạn đang làm kế hoạch này</b> (nhận lúc {claimTime(c.claim.at)}). Cả team đang thấy vậy. Xong hoặc thôi làm thì bấm Thả ra.
      </>
    ) : (
      <>
        <b>{c.claim.by.displayName} đang làm kế hoạch này</b> (nhận lúc {claimTime(c.claim.at)}). Hỏi lại trước khi sửa để tránh làm trùng.
      </>
    );
  return (
    <div className={`claim-bar is-${c.state}`} role="status">
      <span className="claim-dot" aria-hidden="true" />
      <p>{text}</p>
      <div className="btns">
        <ClaimButtons c={c} />
      </div>
    </div>
  );
}
