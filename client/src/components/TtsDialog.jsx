import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { store } from "../lib/util.js";
import { Field, Modal, Skeleton } from "./ui.jsx";
import { useToast } from "./Toast.jsx";

// "Tạo lời đọc" (tài liệu 09): reads the plan's saved voice-over with an ElevenLabs voice, and the server puts the mp3
// in the plan's "Lời đọc" slot. The voice and model picked last time are remembered on this browser.

export const ELEVENLABS_TTS = "https://elevenlabs.io/app/speech-synthesis/text-to-speech";

const nf = new Intl.NumberFormat("vi-VN");
const stripTags = (s) => s.replace(/\[[^\]\n]{1,40}\]/g, "").replace(/[ \t]{2,}/g, " ").trim();

export const useTtsStatus = (enabled) => useQuery({ queryKey: ["tts"], queryFn: api.ttsStatus, enabled, staleTime: 5 * 60 * 1000 });

function Body({ plan, onChanged, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error } = useTtsStatus(true);
  const [voiceId, setVoiceId] = useState(() => store.get("tts:voice", ""));
  const [modelId, setModelId] = useState(() => store.get("tts:model", ""));
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  const [made, setMade] = useState(null);

  const voices = data?.voices || [];
  const models = data?.models || [];
  // A remembered choice that is gone from the account falls back: Eleven v3 when there, else the first.
  useEffect(() => {
    const ok = voices.filter((v) => !v.paidOnly);
    if (ok.length && !ok.some((v) => v.id === voiceId)) setVoiceId(ok[0].id);
    if (models.length && !models.some((m) => m.id === modelId)) setModelId((models.find((m) => m.id === "eleven_v3") || models[0]).id);
  }, [voices, models]); // eslint-disable-line react-hooks/exhaustive-deps

  const voice = voices.find((v) => v.id === voiceId);
  const model = models.find((m) => m.id === modelId);
  const raw = (plan.voiceText || "").trim();
  const speech = model && !model.tags ? stripTags(raw) : raw;
  const tooLong = model && speech.length > model.maxChars;
  // One read is paid by one key, so what counts is the most credit a single key with this voice has left.
  const best = voice?.best ?? null;
  const short = best !== null && speech.length > best;
  const hasTags = /\[[^\]\n]{1,40}\]/.test(raw);

  const groups = useMemo(() => {
    const own = voices.filter((v) => v.category !== "premade");
    const stock = voices.filter((v) => v.category === "premade");
    return [
      ["Giọng của team", own],
      ["Giọng có sẵn của ElevenLabs", stock],
    ].filter(([, list]) => list.length);
  }, [voices]);

  async function create() {
    if (busy || !voice || !model) return;
    setBusy(true);
    setFail("");
    store.set("tts:voice", voice.id);
    store.set("tts:model", model.id);
    try {
      const { item } = await api.planTts(plan._id, { voiceId: voice.id, modelId: model.id });
      onChanged(item);
      setMade(item.files?.audio || null);
      qc.invalidateQueries({ queryKey: ["tts"] });
      toast("Đã tạo lời đọc và lưu vào kế hoạch");
    } catch (err) {
      setFail(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading)
    return (
      <div className="form" aria-busy="true">
        <Skeleton h={40} />
        <Skeleton h={40} />
        <Skeleton h={90} />
      </div>
    );
  if (error)
    return (
      <p className="error" role="alert">
        {error.message}
      </p>
    );
  if (!data.configured)
    return (
      <div className="form">
        <p>Chưa có API key ElevenLabs nào nên chưa tạo tự động được. Quản trị viên thêm key ở Quản trị → ElevenLabs là dùng được.</p>
        <p className="hint">Trong lúc chờ, bạn có thể mở ElevenLabs, tạo mp3 bằng tay rồi bấm “Tải lên”.</p>
        <div className="btns btns-end">
          <a className="btn btn-primary" href={ELEVENLABS_TTS} target="_blank" rel="noopener noreferrer">
            Mở ElevenLabs
          </a>
        </div>
      </div>
    );

  if (made)
    return (
      <div className="form">
        <p>
          Đã lưu <b>{made.name}</b> vào mục Lời đọc của kế hoạch.
        </p>
        <audio className="tts-audio" controls autoPlay src={api.driveDownloadUrl(made.id)} />
        <div className="btns btns-end">
          <button type="button" className="btn" onClick={() => setMade(null)}>
            Tạo lại giọng khác
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Xong
          </button>
        </div>
      </div>
    );

  return (
    <div className="form">
      {!raw ? (
        <p className="error" role="alert">
          Kế hoạch chưa có lời đọc. Viết lời đọc ở ô “Lời đọc” bên dưới, bấm Lưu, rồi mở lại.
        </p>
      ) : (
        <div className="field">
          <span className="field-label">Lời đọc đã lưu · {nf.format(speech.length)} ký tự</span>
          <div className="tts-text">{speech}</div>
          {hasTags && model && (
            <span className="hint">{model.tags ? "Model này hiểu thẻ cảm xúc như [excited], [pause]." : "Model này không hiểu thẻ [ ]: các thẻ sẽ được bỏ trước khi đọc."}</span>
          )}
        </div>
      )}

      <div className="grid-2">
        <Field label="Giọng đọc">
          <select className="input" value={voiceId} onChange={(e) => setVoiceId(e.target.value)} disabled={busy}>
            {groups.map(([label, list]) => (
              <optgroup key={label} label={label}>
                {list.map((v) => (
                  <option key={v.id} value={v.id} disabled={v.paidOnly}>
                    {v.name}
                    {[v.gender === "female" ? "nữ" : v.gender === "male" ? "nam" : "", v.accent].filter(Boolean).length
                      ? ` (${[v.gender === "female" ? "nữ" : v.gender === "male" ? "nam" : "", v.accent].filter(Boolean).join(", ")})`
                      : ""}
                    {v.paidOnly ? " — cần tài khoản trả phí" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Model" hint={model ? `Tối đa ${nf.format(model.maxChars)} ký tự mỗi lần` : ""}>
          <select className="input" value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={busy}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {voice?.previewUrl && (
        <div className="field">
          <span className="field-label">Nghe mẫu giọng {voice.name}</span>
          <audio key={voice.id} className="tts-audio" controls preload="none" src={voice.previewUrl} />
        </div>
      )}
      {!models.length && <p className="error">Tài khoản ElevenLabs không có model nào đọc được tiếng Việt.</p>}
      {voices.some((v) => v.paidOnly) && (
        <p className="hint">Giọng ghi “cần tài khoản trả phí” lấy từ Voice Library: ElevenLabs không cho tài khoản gói Free dùng chúng qua API.</p>
      )}

      <p className="hint">
        {data.credits?.limit > 0 && `Còn ${nf.format(data.credits.left)} / ${nf.format(data.credits.limit)} ký tự trên ${data.credits.keys} key. `}
        Lần này dùng khoảng {nf.format(speech.length)} ký tự.
        {plan.files?.audio && " File lời đọc hiện có sẽ được thay (file cũ vào thùng rác Drive)."}
      </p>
      {tooLong && (
        <p className="error" role="alert">
          Lời đọc dài hơn mức {model.name} nhận ({nf.format(model.maxChars)} ký tự). Rút gọn hoặc chọn model khác.
        </p>
      )}
      {short && !tooLong && (
        <p className="error" role="alert">
          Không key nào có giọng này còn đủ credit (key nhiều nhất còn {nf.format(best)} ký tự). Chọn giọng khác hoặc nhờ quản trị viên thêm key.
        </p>
      )}
      {fail && (
        <p className="error" role="alert">
          {fail}
        </p>
      )}
      <div className="btns btns-end">
        <a className="btn btn-ghost" href={ELEVENLABS_TTS} target="_blank" rel="noopener noreferrer">
          Mở trang ElevenLabs
        </a>
        <button type="button" className="btn btn-primary" disabled={busy || !raw || !voice || !model || tooLong || short} onClick={create}>
          {busy ? "Đang tạo giọng đọc... (có thể mất 1 phút)" : "Tạo mp3 và lưu vào kế hoạch"}
        </button>
      </div>
    </div>
  );
}

export default function TtsDialog({ open, onClose, plan, onChanged }) {
  return (
    <Modal open={open} onClose={onClose} title="Tạo lời đọc bằng ElevenLabs" wide>
      {open && <Body plan={plan} onChanged={onChanged} onClose={onClose} />}
    </Modal>
  );
}
