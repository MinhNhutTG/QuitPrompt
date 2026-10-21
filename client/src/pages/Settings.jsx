import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { DEFAULT_NEGATIVE, DEFAULT_TEMPLATE, TEMPLATE_VARS } from "../lib/prompt.js";
import { useSettings } from "../lib/queries.js";
import { ConfirmButton, ErrorState, Field, Skeleton } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

const VERSION = "2.0.0";

function TemplateBlock() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useSettings();
  const [template, setTemplate] = useState("");
  const [negative, setNegative] = useState("");

  const savedTemplate = data?.template || DEFAULT_TEMPLATE;
  const savedNegative = data?.negative || DEFAULT_NEGATIVE;
  useEffect(() => {
    setTemplate(savedTemplate);
    setNegative(savedNegative);
  }, [savedTemplate, savedNegative]);

  const save = useMutation({
    // Text equal to the default is stored as "" so later app updates to the default still apply.
    mutationFn: (body) => api.saveSettings(body),
    onSuccess: (res) => qc.setQueryData(["settings"], res),
  });

  const dirty = template !== savedTemplate || negative !== savedNegative;
  const isDefault = !data?.template && !data?.negative;
  const unknown = [...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).filter((v) => !TEMPLATE_VARS.includes(v));

  if (isLoading) return <Skeleton h={420} r={14} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <section className="card form" id="template">
      <h2>Template prompt</h2>
      <p className="hint">Sửa template đổi mọi prompt tạo từ nay về sau. Prompt đã lưu giữ nguyên văn.</p>
      <Field label="Template">
        <textarea className="input mono" rows={18} value={template} maxLength={30000} spellCheck={false} onChange={(e) => setTemplate(e.target.value)} />
      </Field>
      <div className="field">
        <span className="field-label">Biến dùng được</span>
        <div className="vars">
          {TEMPLATE_VARS.map((v) => (
            <code key={v}>{`{{${v}}}`}</code>
          ))}
        </div>
        {unknown.length > 0 && (
          <span className="error">
            Biến không có: {unknown.map((v) => `{{${v}}}`).join(", ")}. Biến lạ sẽ hiện nguyên trong prompt.
          </span>
        )}
      </div>
      <Field label="Negative mặc định" hint="Có động tác cần ảnh lưng thì app tự bỏ “back view”.">
        <textarea className="input mono" rows={4} value={negative} maxLength={5000} spellCheck={false} onChange={(e) => setNegative(e.target.value)} />
      </Field>
      <div className="btns btns-end">
        {!isDefault && (
          <ConfirmButton
            className="btn btn-danger-ghost"
            confirmLabel="Bấm lần nữa để khôi phục"
            disabled={save.isPending}
            onConfirm={() =>
              save.mutate({ template: "", negative: "" }, { onSuccess: () => toast("Đã khôi phục mặc định"), onError: (e) => toast(e.message, { tone: "danger" }) })
            }
          >
            Khôi phục mặc định
          </ConfirmButton>
        )}
        {dirty && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setTemplate(savedTemplate);
              setNegative(savedNegative);
            }}
          >
            Bỏ thay đổi
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!dirty || save.isPending}
          onClick={() =>
            save.mutate(
              {
                template: template.trim() === DEFAULT_TEMPLATE.trim() ? "" : template,
                negative: negative.trim() === DEFAULT_NEGATIVE.trim() ? "" : negative,
              },
              { onSuccess: () => toast("Đã lưu template"), onError: (e) => toast(e.message, { tone: "danger" }) }
            )
          }
        >
          {save.isPending ? "Đang lưu..." : "Lưu template"}
        </button>
      </div>
    </section>
  );
}

function AccountBlock() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: "", next: "", again: "" });
  const [error, setError] = useState("");
  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const change = useMutation({
    mutationFn: () => api.changePassword({ current: form.current, next: form.next }),
    onSuccess: () => {
      setForm({ current: "", next: "", again: "" });
      toast("Đã đổi mật khẩu");
    },
    onError: (e) => setError(e.message),
  });

  return (
    <section className="card form" id="account">
      <h2>Tài khoản</h2>
      <dl className="kv">
        <dt>Tên đăng nhập</dt>
        <dd>{user.username}</dd>
      </dl>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.next.length < 6) return setError("Mật khẩu mới cần ít nhất 6 ký tự.");
          if (form.next !== form.again) return setError("Hai lần nhập mật khẩu mới chưa khớp.");
          setError("");
          change.mutate();
        }}
      >
        <input type="text" name="username" autoComplete="username" value={user.username} readOnly hidden />
        <Field label="Mật khẩu hiện tại">
          <input className="input" type="password" autoComplete="current-password" required value={form.current} onChange={setF("current")} />
        </Field>
        <div className="grid-2">
          <Field label="Mật khẩu mới">
            <input className="input" type="password" autoComplete="new-password" required minLength={6} maxLength={100} value={form.next} onChange={setF("next")} />
          </Field>
          <Field label="Nhập lại mật khẩu mới">
            <input className="input" type="password" autoComplete="new-password" required value={form.again} onChange={setF("again")} />
          </Field>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="btns btns-end">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              await signOut();
              navigate("/login", { replace: true });
            }}
          >
            Đăng xuất
          </button>
          <button type="submit" className="btn btn-primary" disabled={change.isPending}>
            {change.isPending ? "Đang đổi..." : "Đổi mật khẩu"}
          </button>
        </div>
      </form>
    </section>
  );
}

function TransferBlock() {
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const run = useMutation({
    mutationFn: async (file) => {
      if (file.size > 5 * 1024 * 1024) throw new Error("File lớn hơn 5 MB.");
      let body;
      try {
        body = JSON.parse(await file.text());
      } catch {
        throw new Error("File không phải JSON hợp lệ.");
      }
      return api.importData(body);
    },
    onSuccess: (res) => {
      setResult(res);
      setError("");
      qc.invalidateQueries();
      toast("Đã nhập dữ liệu");
    },
    onError: (e) => {
      setResult(null);
      setError(e.message);
    },
  });

  return (
    <section className="card form" id="transfer">
      <h2>Chuyển dữ liệu</h2>
      <p className="hint">
        Nhập file sao lưu <code>.json</code> từ bản tĩnh cũ hoặc từ app này. Nhập lại nhiều lần không bị trùng. File xuất gồm sản phẩm và prompt của cả nhóm, cùng template và động tác riêng của bạn. Máy chủ miễn phí không tự sao lưu: nên xuất dữ liệu mỗi tuần.
      </p>
      <div className="btns">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) run.mutate(f);
          }}
        />
        <button type="button" className="btn" disabled={run.isPending} onClick={() => fileRef.current?.click()}>
          {run.isPending ? "Đang nhập..." : "Nhập file .json"}
        </button>
        <a className="btn btn-primary" href={api.exportUrl} download>
          Xuất toàn bộ dữ liệu
        </a>
      </div>
      {result && (
        <p className="ok-text" role="status">
          Đã thêm {result.products} sản phẩm, {result.prompts} prompt, {result.actions} động tác riêng
          {result.skipped ? ` · bỏ qua ${result.skipped} mục trùng hoặc lỗi` : ""}.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function AboutBlock() {
  return (
    <section className="card form" id="about">
      <h2>Giới thiệu</h2>
      <dl className="kv">
        <dt>Phiên bản</dt>
        <dd>Xưởng Prompt Thời Trang {VERSION}</dd>
      </dl>
      <ul className="tips">
        <li>Chọn sản phẩm trước khi tạo: app tự điền “Áo luôn đóng” và lỗi riêng của sản phẩm.</li>
        <li>Mỗi động tác nên có ít nhất 2 giây. Video 10 giây hợp với 2–3 động tác giữa.</li>
        <li>Động tác có nhãn điều kiện (cần tường, cần ghế...) chỉ dùng khi ảnh tham chiếu đáp ứng.</li>
        <li>Ra video đẹp thì bấm “★ Lưu prompt tốt” để lần sau copy lại ngay.</li>
      </ul>
    </section>
  );
}

export default function Settings() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <div className="page settings">
      <h1>Cài đặt</h1>
      <TemplateBlock />
      <AccountBlock />
      <TransferBlock />
      <AboutBlock />
    </div>
  );
}
