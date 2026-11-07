import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api.js";
import { copyText, fmtDateTimeFull } from "../lib/util.js";
import { ConfirmButton } from "./ui.jsx";
import { useToast } from "./Toast.jsx";

// One file of a plan (in the plan's Drive folder): upload, replace, download, delete. `extra` adds buttons;
// `uploadRef.current(file)` uploads a file the parent got another way (pasted or dropped).

function fmtSize(n) {
  if (!n) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) (n /= 1024), i++;
  return `${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

const SlotIcon = ({ kind }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={kind === "image" ? "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM21 15l-5-5-11 9" : kind === "audio" ? "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" : "M4 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM16 10l5-3v10l-5-3"} />
  </svg>
);

const ELEVENLABS_TTS = "https://elevenlabs.io/app/speech-synthesis/text-to-speech";

export default function FileSlot({ plan, slot, driveReady, onChanged, guard, extra, uploadRef }) {
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

  // The parent may hand a file in directly (pasted or dropped image).
  if (uploadRef) uploadRef.current = (f) => guard(() => upload(f));
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
        {slot.key === "audio" && (
          <a
            className="btn btn-sm btn-ghost"
            href={ELEVENLABS_TTS}
            target="_blank"
            rel="noopener noreferrer"
            title="Mở ElevenLabs Text to Speech trong tab mới để tạo file mp3 lời đọc"
            onClick={async () => {
              // The voice-over text goes to the clipboard first, ready to paste into ElevenLabs.
              if (!plan.voiceText) return;
              const ok = await copyText(plan.voiceText);
              toast(ok ? "Đã copy lời đọc, dán vào ElevenLabs" : "Đã mở ElevenLabs", { tone: ok ? "ok" : "info" });
            }}
          >
            ElevenLabs
          </a>
        )}
        {extra}
        {file && !busy && (
          <a className="btn btn-sm" href={api.driveDownloadUrl(file.id)} download={file.name}>
            Tải về
          </a>
        )}
        <input ref={input} type="file" accept={slot.accept} hidden onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ""))} />
        <button type="button" className={`btn btn-sm ${file ? "" : "btn-primary"}`} disabled={busy || !driveReady} onClick={() => guard(() => input.current?.click())}>
          {busy ? `${Math.round(progress * 100)}%` : file ? "Thay" : "Tải lên"}
        </button>
        {file && !busy && (
          <ConfirmButton className="btn btn-sm btn-danger-ghost" disabled={remove.isPending} onConfirm={() => guard(() => remove.mutate())}>
            Xoá
          </ConfirmButton>
        )}
      </div>
    </li>
  );
}
