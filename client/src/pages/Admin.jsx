import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useAdminLogs, useAdminRoles, useAdminStats, useAdminTiers, useAdminUsers } from "../lib/queries.js";
import { addDays, fmtDate, fmtDateTime, fmtDateTimeFull, useDebounce, vnDay } from "../lib/util.js";
import { ConfirmButton, EmptyState, ErrorState, Field, Modal, Pager, Skeleton } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

const TABS = [
  { value: "overview", label: "Tổng quan" },
  { value: "users", label: "Thành viên" },
  { value: "roles", label: "Phân quyền & hạng" },
  { value: "logs", label: "Nhật ký" },
];

const FIELD_NAMES = {
  name: "tên",
  sku: "mã",
  category: "loại",
  note: "ghi chú",
  extraNeg: "negative riêng",
  closed: "kiểu áo",
  target: "mục tiêu",
  assignee: "người làm",
  dueDate: "hạn",
  status: "trạng thái",
  done: "số đã làm",
  title: "tên",
  content: "nội dung",
  tags: "thẻ",
  kind: "loại",
  link: "liên kết",
  prompt: "prompt",
  negative: "negative",
  tool: "công cụ",
  displayName: "tên hiển thị",
  role: "vai trò",
  disabled: "khoá",
  customActions: "động tác riêng",
  permissions: "quyền",
  template: "mẫu prompt",
};

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
// Older log rows hold the role key instead of its name.
const ROLE_LABEL = { admin: "Quản trị viên", member: "Thành viên" };

// Every role an account can be given, admin first.
function RoleSelect({ value, onChange }) {
  const { data } = useAdminRoles();
  const roles = data?.items || [];
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={!roles.length}>
      {!roles.some((r) => r.key === value) && <option value={value}>{roles.length ? "(vai trò đã xoá)" : "Đang tải..."}</option>}
      {roles.map((r) => (
        <option key={r.key} value={r.key}>
          {r.name}
        </option>
      ))}
    </select>
  );
}

// "2 ngày", "1 ngày": how long the log keeps rows.
const keepText = (days) => `${days} ngày`;

function Tile({ label, value, sub, tone }) {
  return (
    <div className={`card tile ${tone ? `tile-${tone}` : ""}`}>
      <span className="tile-label">{label}</span>
      <b className="tile-value">{value}</b>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}

// One series (actions per hour or per day): one hue, no legend; the title names it. Hover or focus a bar for its value.
function ActivityChart({ data, unit }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((s, d) => s + d.count, 0);
  const mid = Math.floor(data.length / 2);
  return (
    <figure className="chart">
      <div className="chart-plot" role="list" aria-label={`Số thao tác mỗi ${unit}, tổng ${total}`}>
        <span className="chart-max" aria-hidden="true">
          {max}
        </span>
        {data.map((d) => (
          <div key={d.key} className="chart-col" role="listitem" tabIndex={0} aria-label={`${d.label}: ${d.count} thao tác`}>
            <span className="chart-bar" style={{ height: `${(d.count / max) * 100}%` }} />
            <span className="chart-tip" aria-hidden="true">
              <b>{d.count}</b> thao tác · {d.label}
            </span>
          </div>
        ))}
      </div>
      <div className="chart-x" aria-hidden="true">
        <span>{data[0].label}</span>
        <span>{data[mid].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </figure>
  );
}

function RankList({ rows, empty }) {
  if (!rows.length) return <p className="hint">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ol className="rank">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="rank-name">{r.name}</span>
          <span className="rank-val">{r.count}</span>
          <span className="meter rank-meter" aria-hidden="true">
            <span style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function Overview() {
  const { data, isLoading, error, refetch } = useAdminStats();
  if (isLoading)
    return (
      <div className="tiles" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={96} r={12} />
        ))}
      </div>
    );
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const { users, content, plans, security, activity, topActions, topUsers, retentionDays } = data;
  const keep = keepText(retentionDays);
  const hourly = activity.bucket === "hour";
  return (
    <div className="stack">
      <div className="tiles">
        <Tile label="Thành viên" value={users.total} sub={`${users.active7} đăng nhập 7 ngày qua · ${users.admins} admin · ${users.premium} premium${users.disabled ? ` · ${users.disabled} bị khoá` : ""}`} />
        <Tile label="Prompt đã lưu" value={content.prompts} sub={`+${content.prompts30} trong 30 ngày`} />
        <Tile label="Sản phẩm" value={content.products} sub={`${content.resources} tài nguyên trong kho`} />
        <Tile
          label="Video theo kế hoạch"
          value={`${pct(plans.done, plans.target)}%`}
          sub={`${plans.done}/${plans.target} video · ${plans.finished}/${plans.plans} kế hoạch xong${plans.overdue ? ` · ${plans.overdue} quá hạn` : ""}`}
        />
        <Tile
          label={`Đăng nhập sai (${keep} qua)`}
          value={security.failedLogins}
          sub={security.failedLogins ? "Xem chi tiết trong Nhật ký" : "Không có lần nào"}
          tone={security.failedLogins >= 10 ? "warn" : undefined}
        />
      </div>

      <section className="card stack">
        <div className="sec-row">
          <h2>{hourly ? `Thao tác theo giờ (${retentionDays * 24} giờ qua)` : `Thao tác mỗi ngày (${keep} qua)`}</h2>
          <span className="hint">Nhật ký tự xoá sau {keep}</span>
        </div>
        <ActivityChart data={activity.items} unit={hourly ? "giờ" : "ngày"} />
      </section>

      <div className="grid-2">
        <section className="card stack">
          <h2>Tích cực nhất ({keep} qua)</h2>
          <RankList rows={topUsers.map((u) => ({ key: u.id, name: u.displayName, count: u.count }))} empty="Chưa có hoạt động nào." />
        </section>
        <section className="card stack">
          <h2>Thao tác hay dùng ({keep} qua)</h2>
          <RankList rows={topActions.map((a) => ({ key: a.action, name: a.label, count: a.count }))} empty="Chưa có hoạt động nào." />
        </section>
      </div>
    </div>
  );
}

// ---- members

function useUserMutation(fn, done) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["prompt-filters"] });
      done?.(data, vars);
    },
    onError: (e) => toast(e.message, { tone: "danger" }),
  });
}

function NewUserForm({ onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ username: "", displayName: "", password: "", role: "member" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const create = useUserMutation(api.adminCreateUser, () => {
    toast("Đã tạo tài khoản");
    onDone();
  });
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(form);
      }}
    >
      <Field label="Tên đăng nhập" hint="3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới.">
        <input className="input" value={form.username} maxLength={30} autoComplete="off" onChange={set("username")} autoFocus />
      </Field>
      <Field label="Tên hiển thị">
        <input className="input" value={form.displayName} maxLength={60} onChange={set("displayName")} />
      </Field>
      <Field label="Mật khẩu ban đầu" hint="Ít nhất 6 ký tự. Gửi riêng cho người đó và nhắc họ đổi.">
        <input className="input" type="text" value={form.password} maxLength={100} autoComplete="new-password" onChange={set("password")} />
      </Field>
      <Field label="Vai trò" hint="Quyền của từng vai trò xem ở tab Phân quyền.">
        <RoleSelect value={form.role} onChange={set("role")} />
      </Field>
      <div className="btns">
        <button type="submit" className="btn btn-primary" disabled={create.isPending}>
          {create.isPending ? "Đang tạo..." : "Tạo tài khoản"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

function EditUserForm({ u, isMe, onDone }) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(u.displayName === u.username ? "" : u.displayName);
  const [role, setRole] = useState(u.role);
  const [premium, setPremium] = useState(u.premium);
  const [until, setUntil] = useState(u.premiumUntil ? vnDay(u.premiumUntil) : "");
  const today = vnDay();
  // Extends from the current end when it is still ahead, else from today.
  const extend = (days) => setUntil(addDays(until && until > today ? until : today, days));
  const save = useUserMutation((body) => api.adminUpdateUser(u.id, body), () => {
    toast("Đã lưu");
    onDone();
  });
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        // An unchanged role is left out, so a role deleted meanwhile does not block renaming.
        const body = role === u.role ? { displayName } : { displayName, role };
        if (premium !== u.premium || until !== (u.premiumUntil ? vnDay(u.premiumUntil) : "")) Object.assign(body, { premium, premiumUntil: premium ? until : "" });
        save.mutate(body);
      }}
    >
      <Field label="Tên hiển thị" hint={`Để trống thì dùng tên đăng nhập @${u.username}.`}>
        <input className="input" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
      </Field>
      <Field label="Vai trò">
        <RoleSelect value={role} onChange={setRole} />
      </Field>
      {isMe && role !== "admin" && <span className="error">Không tự bỏ quyền admin của chính mình được.</span>}
      <Field label="Hạng tài khoản">
        <select
          className="input"
          value={premium ? "premium" : "normal"}
          onChange={(e) => {
            const on = e.target.value === "premium";
            setPremium(on);
            if (on && !until) setUntil(addDays(today, 30));
          }}
        >
          <option value="normal">Thường</option>
          <option value="premium">Premium</option>
        </select>
      </Field>
      {premium && (
        <Field label="Premium đến hết ngày" hint="Qua ngày này tài khoản tự về hạng Thường. Để trống thì không hết hạn.">
          <div className="btns">
            <input className="input" type="date" value={until} min={today} onChange={(e) => setUntil(e.target.value)} />
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => extend(30)}>
              +30 ngày
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => extend(365)}>
              +1 năm
            </button>
          </div>
        </Field>
      )}
      <div className="btns">
        <button type="submit" className="btn btn-primary" disabled={save.isPending || (isMe && role !== "admin")}>
          {save.isPending ? "Đang lưu..." : "Lưu"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

function PasswordForm({ u, isMe, onDone }) {
  const toast = useToast();
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const reset = useUserMutation(() => api.adminResetPassword(u.id, password), () => {
    toast(`Đã đặt mật khẩu mới cho ${u.displayName}`);
    onDone();
    if (isMe) signOut();
  });
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (password.length < 6) return toast("Mật khẩu cần ít nhất 6 ký tự.", { tone: "danger" });
        reset.mutate();
      }}
    >
      <p>
        {u.displayName} sẽ bị đăng xuất trên mọi thiết bị và phải đăng nhập lại bằng mật khẩu mới.
        {isMe && " Bạn cũng sẽ bị đăng xuất."}
      </p>
      <Field label="Mật khẩu mới" hint="Ít nhất 6 ký tự.">
        <input className="input" type="text" value={password} maxLength={100} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
      <div className="btns">
        <button type="submit" className="btn btn-primary" disabled={reset.isPending}>
          {reset.isPending ? "Đang lưu..." : "Đặt mật khẩu"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

function Users({ onShowLogs }) {
  const toast = useToast();
  const { data, isLoading, error, refetch } = useAdminUsers();
  // { mode: "new" | "edit" | "password" | "delete", u }
  const [dialog, setDialog] = useState(null);
  const close = () => setDialog(null);
  const toggle = useUserMutation(({ u }) => api.adminUpdateUser(u.id, { disabled: !u.disabled }), (_, { u }) => toast(u.disabled ? `Đã mở khoá ${u.displayName}` : `Đã khoá ${u.displayName}`));
  const logout = useUserMutation(({ u }) => api.adminLogoutUser(u.id), (_, { u }) => toast(`${u.displayName} đã bị đăng xuất trên mọi thiết bị`));
  const remove = useUserMutation(({ u }) => api.adminDeleteUser(u.id), (_, { u }) => {
    toast(`Đã xoá tài khoản ${u.username}`);
    close();
  });

  if (isLoading) return <Skeleton h={240} r={12} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const me = data.me;
  const canManage = data.canManage;
  const titles = { new: "Thêm thành viên", edit: "Sửa thành viên", password: "Đặt lại mật khẩu", delete: "Xoá tài khoản này?" };

  return (
    <div className="stack">
      <div className="sec-row">
        <p className="muted">
          {data.items.length} tài khoản.{" "}
          {canManage ? "Khoá tài khoản thì người đó bị đăng xuất ngay và không đăng nhập được nữa." : "Chỉ quản trị viên mới thêm, sửa, khoá hay xoá được tài khoản."}
        </p>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => setDialog({ mode: "new" })}>
            + Thêm thành viên
          </button>
        )}
      </div>
      <div className="card atable-wrap">
        <table className="atable">
          <thead>
            <tr>
              <th>Thành viên</th>
              <th>Đăng nhập gần nhất</th>
              <th>Thao tác {keepText(data.retentionDays)} qua</th>
              <th>Prompt</th>
              <th>Kế hoạch được giao</th>
              {canManage && (
                <th>
                  <span className="sr-only">Thao tác</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.items.map((u) => {
              const isMe = u.id === me;
              return (
                <tr key={u.id} className={u.disabled ? "is-off" : ""}>
                  <td className="au-name">
                    <span className="au-avatar" aria-hidden="true">
                      {u.displayName.charAt(0).toUpperCase()}
                    </span>
                    <span>
                      <b>{u.displayName}</b>
                      {isMe && <span className="hint"> (bạn)</span>}
                      <span className="au-sub">
                        @{u.username}
                        <span className={`badge ${u.role === "admin" ? "" : "badge-soft"}`}>{u.roleName}</span>
                        {u.tier === "premium" && (
                          <span className="badge badge-premium" title={u.premiumUntil ? `Đến hết ${fmtDate(u.premiumUntil)}` : "Không hết hạn"}>
                            Premium{u.premiumUntil ? ` · ${fmtDate(u.premiumUntil)}` : ""}
                          </span>
                        )}
                        {u.premium && u.tier !== "premium" && <span className="badge badge-soft">Premium đã hết hạn</span>}
                        {u.disabled && <span className="badge badge-danger">Đã khoá</span>}
                      </span>
                    </span>
                  </td>
                  <td data-label="Đăng nhập gần nhất">
                    {u.lastLoginAt ? <time title={fmtDateTimeFull(u.lastLoginAt)}>{fmtDateTime(u.lastLoginAt)}</time> : <span className="hint">Chưa đăng nhập</span>}
                  </td>
                  <td data-label={`Thao tác ${keepText(data.retentionDays)} qua`}>
                    <button type="button" className="link-btn" onClick={() => onShowLogs(u.id)} title="Xem nhật ký của người này">
                      {u.actions}
                    </button>
                  </td>
                  <td data-label="Prompt">{u.prompts}</td>
                  <td data-label="Kế hoạch được giao">
                    {u.plans.total ? (
                      <>
                        {u.plans.done}/{u.plans.target} video
                        <span className="hint"> · {u.plans.open} chưa xong</span>
                      </>
                    ) : (
                      <span className="hint">Chưa có</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="au-actions">
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDialog({ mode: "edit", u })}>
                        Sửa
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDialog({ mode: "password", u })}>
                        Đặt mật khẩu
                      </button>
                      {!isMe && (
                        <>
                          <ConfirmButton className="btn btn-sm btn-ghost" confirmLabel="Bấm lần nữa" onConfirm={() => logout.mutate({ u })} disabled={logout.isPending}>
                            Đăng xuất mọi nơi
                          </ConfirmButton>
                          <ConfirmButton
                            className={`btn btn-sm ${u.disabled ? "btn-ghost" : "btn-danger-ghost"}`}
                            confirmLabel={u.disabled ? "Bấm lần nữa để mở" : "Bấm lần nữa để khoá"}
                            onConfirm={() => toggle.mutate({ u })}
                            disabled={toggle.isPending}
                          >
                            {u.disabled ? "Mở khoá" : "Khoá"}
                          </ConfirmButton>
                          <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => setDialog({ mode: "delete", u })}>
                            Xoá
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(dialog)} onClose={close} title={dialog ? titles[dialog.mode] : ""}>
        {dialog?.mode === "new" && <NewUserForm onDone={close} />}
        {dialog?.mode === "edit" && <EditUserForm u={dialog.u} isMe={dialog.u.id === me} onDone={close} />}
        {dialog?.mode === "password" && <PasswordForm u={dialog.u} isMe={dialog.u.id === me} onDone={close} />}
        {dialog?.mode === "delete" && (
          <>
            <p>
              Tài khoản <b>@{dialog.u.username}</b> sẽ bị xoá và không đăng nhập được nữa. Sản phẩm, prompt và kế hoạch của họ vẫn giữ lại cho team, hiện tên
              “(tài khoản đã xoá)”. Nếu chỉ muốn tạm chặn, hãy dùng Khoá.
            </p>
            <div className="btns">
              <button type="button" className="btn btn-danger" onClick={() => remove.mutate({ u: dialog.u })} disabled={remove.isPending}>
                {remove.isPending ? "Đang xoá..." : "Có, xoá"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={close} autoFocus>
                Không
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// ---- roles and permissions

function RoleNameForm({ role, onDone }) {
  const toast = useToast();
  const [name, setName] = useState(role?.name || "");
  const save = useUserMutation((body) => (role ? api.adminUpdateRole(role.key, body) : api.adminCreateRole(body)), () => {
    toast(role ? "Đã đổi tên vai trò" : "Đã tạo vai trò. Tick các quyền cho nó trong bảng.");
    onDone();
  });
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return toast("Cần nhập tên vai trò.", { tone: "danger" });
        save.mutate({ name: name.trim() });
      }}
    >
      <Field label="Tên vai trò" hint={role ? undefined : "Ví dụ: Quay dựng, Cộng tác viên. Vai trò mới chưa có quyền nào."}>
        <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="btns">
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? "Đang lưu..." : role ? "Lưu" : "Tạo vai trò"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

const ROLES_KEY = ["admin", "roles"];

// Rows are permissions, columns are roles. Each tick saves at once; ticks run one after another so none is lost.
function Roles() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useAdminRoles();
  // { mode: "new" | "rename" | "delete", role }
  const [dialog, setDialog] = useState(null);
  const close = () => setDialog(null);
  const toggle = useMutation({
    scope: { id: "admin-roles" },
    mutationFn: ({ role, permissions }) => api.adminUpdateRole(role.key, { permissions }),
    onMutate: ({ role, permissions }) =>
      qc.setQueryData(ROLES_KEY, (old) => old && { ...old, items: old.items.map((r) => (r.key === role.key ? { ...r, permissions } : r)) }),
    onError: (e) => {
      toast(e.message, { tone: "danger" });
      qc.invalidateQueries({ queryKey: ROLES_KEY });
    },
  });
  const remove = useUserMutation(({ role }) => api.adminDeleteRole(role.key), (_, { role }) => {
    toast(`Đã xoá vai trò ${role.name}`);
    close();
  });

  if (isLoading) return <Skeleton h={320} r={12} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const { items: roles, permissions, canManage } = data;
  const groups = [...new Set(permissions.map((p) => p.group))];
  const flip = (role, perm, on) => {
    const next = on ? [...role.permissions, perm] : role.permissions.filter((p) => p !== perm);
    toggle.mutate({ role, permissions: permissions.map((p) => p.key).filter((k) => next.includes(k)) });
  };
  const titles = { new: "Vai trò mới", rename: "Đổi tên vai trò", delete: "Xoá vai trò này?" };

  return (
    <div className="stack">
      <div className="sec-row">
        <p className="muted">
          Ai cũng xem được sản phẩm, prompt, kế hoạch và tài nguyên. Bảng dưới quyết định mỗi vai trò được thêm, sửa, xoá gì. Quản lý tài khoản và phân quyền
          luôn chỉ dành cho quản trị viên.
          {!canManage && " Chỉ quản trị viên thay đổi được bảng này."}
        </p>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => setDialog({ mode: "new" })}>
            + Vai trò mới
          </button>
        )}
      </div>
      <div className="card atable-wrap">
        <table className="rtable">
          <thead>
            <tr>
              <th scope="col">Quyền</th>
              {roles.map((r) => (
                <th key={r.key} scope="col">
                  <span className="rt-role">{r.name}</span>
                  <span className="hint">{r.users} tài khoản</span>
                  {canManage && !r.locked && (
                    <span className="rt-tools">
                      <button type="button" className="link-btn" onClick={() => setDialog({ mode: "rename", role: r })}>
                        Đổi tên
                      </button>
                      {!r.builtin && (
                        <button type="button" className="link-btn rt-del" onClick={() => setDialog({ mode: "delete", role: r })}>
                          Xoá
                        </button>
                      )}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g}>
              <tr className="rt-group">
                <th scope="rowgroup" colSpan={roles.length + 1}>
                  {g}
                </th>
              </tr>
              {permissions
                .filter((p) => p.group === g)
                .map((p) => (
                  <tr key={p.key}>
                    <th scope="row">{p.label}</th>
                    {roles.map((r) => (
                      <td key={r.key}>
                        <input
                          type="checkbox"
                          checked={r.permissions.includes(p.key)}
                          disabled={!canManage || r.locked}
                          aria-label={`${r.name}: ${p.label}`}
                          title={r.locked ? "Quản trị viên luôn có mọi quyền" : undefined}
                          onChange={(e) => flip(r, p.key, e.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="hint">Đổi quyền có hiệu lực ngay từ thao tác kế tiếp của người đó. Vai trò “Thành viên” dành cho tài khoản tự đăng ký nên không xoá được.</p>

      <Tiers />

      <Modal open={Boolean(dialog)} onClose={close} title={dialog ? titles[dialog.mode] : ""}>
        {(dialog?.mode === "new" || dialog?.mode === "rename") && <RoleNameForm role={dialog.role} onDone={close} />}
        {dialog?.mode === "delete" && (
          <>
            <p>
              Vai trò <b>{dialog.role.name}</b> sẽ bị xoá.
              {dialog.role.users > 0 && ` Còn ${dialog.role.users} tài khoản đang dùng nó: đổi vai trò cho họ ở tab Thành viên trước.`}
            </p>
            <div className="btns">
              <button type="button" className="btn btn-danger" onClick={() => remove.mutate({ role: dialog.role })} disabled={remove.isPending || dialog.role.users > 0}>
                {remove.isPending ? "Đang xoá..." : "Có, xoá"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={close} autoFocus>
                Không
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// Number box for one tier limit: empty means no limit. Saves when it loses focus or on Enter.
function LimitInput({ value, disabled, label, onSave }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => setText(value == null ? "" : String(value)), [value]);
  const commit = () => {
    const next = text.trim() === "" ? null : Number(text);
    if (next !== value) onSave(next);
  };
  return (
    <input
      className="input rt-limit"
      inputMode="numeric"
      maxLength={6}
      placeholder="Không giới hạn"
      aria-label={label}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value.replace(/\D/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

const TIERS_KEY = ["admin", "tiers"];

// Normal and Premium side by side: permissions added on top of the role, and usage limits.
function Tiers() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useAdminTiers();
  const save = useMutation({
    scope: { id: "admin-tiers" },
    mutationFn: ({ tier, body }) => api.adminUpdateTier(tier.key, body),
    onMutate: ({ tier, body }) =>
      qc.setQueryData(TIERS_KEY, (old) =>
        old && { ...old, items: old.items.map((t) => (t.key === tier.key ? { ...t, ...body, limits: { ...t.limits, ...body.limits } } : t)) }
      ),
    onError: (e) => {
      toast(e.message, { tone: "danger" });
      qc.invalidateQueries({ queryKey: TIERS_KEY });
    },
  });

  if (isLoading) return <Skeleton h={240} r={12} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const { items: tiers, permissions, limits, canManage } = data;
  const flip = (tier, perm, on) => {
    const next = on ? [...tier.permissions, perm] : tier.permissions.filter((p) => p !== perm);
    save.mutate({ tier, body: { permissions: permissions.map((p) => p.key).filter((k) => next.includes(k)) } });
  };

  return (
    <section className="stack">
      <div>
        <h2>Hạng tài khoản</h2>
        <p className="muted">
          Mỗi tài khoản là Thường hoặc Premium (đặt ở tab Thành viên, kèm ngày hết hạn). Quyền của một người = quyền của vai trò + quyền cộng thêm của hạng. Ô
          giới hạn để trống là không giới hạn; ngày tính theo giờ Việt Nam. Quản trị viên không bị giới hạn.
        </p>
      </div>
      <div className="card atable-wrap">
        <table className="rtable">
          <thead>
            <tr>
              <th scope="col">Hạng</th>
              {tiers.map((t) => (
                <th key={t.key} scope="col">
                  <span className="rt-role">{t.name}</span>
                  <span className="hint">{t.users} tài khoản</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="rt-group">
              <th scope="rowgroup" colSpan={tiers.length + 1}>
                Giới hạn
              </th>
            </tr>
            {limits.map((l) => (
              <tr key={l.key}>
                <th scope="row">{l.label}</th>
                {tiers.map((t) => (
                  <td key={t.key}>
                    <LimitInput
                      value={t.limits[l.key]}
                      disabled={!canManage}
                      label={`${t.name}: ${l.label}`}
                      onSave={(v) => save.mutate({ tier: t, body: { limits: { [l.key]: v } } })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tbody>
            <tr className="rt-group">
              <th scope="rowgroup" colSpan={tiers.length + 1}>
                Quyền cộng thêm
              </th>
            </tr>
            {permissions.map((p) => (
              <tr key={p.key}>
                <th scope="row">{p.label}</th>
                {tiers.map((t) => (
                  <td key={t.key}>
                    <input
                      type="checkbox"
                      checked={t.permissions.includes(p.key)}
                      disabled={!canManage}
                      aria-label={`${t.name}: ${p.label}`}
                      onChange={(e) => flip(t, p.key, e.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---- activity log

function metaText(log) {
  const m = log.meta || {};
  const out = [];
  if (m.fields?.length) out.push("đổi " + m.fields.map((f) => FIELD_NAMES[f] || f).join(", "));
  if (typeof m.count === "number") out.push(`${m.count} mục`);
  if (m.target) out.push(`${m.target} video`);
  if (m.disabled === true) out.push(log.action === "auth.login_failed" ? "tài khoản đang khoá" : "khoá");
  if (m.disabled === false) out.push("mở khoá");
  if (m.role) out.push(`vai trò ${ROLE_LABEL[m.role] || m.role}`);
  if (m.tier) out.push(`hạng ${m.tier}`);
  return out.join(" · ");
}

function Logs({ params, set }) {
  const { data: users } = useAdminUsers();
  const [q, setQ] = useState(params.q);
  const dq = useDebounce(q.trim(), 300);
  useEffect(() => {
    if (dq !== params.q) set({ q: dq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);
  const { data, isLoading, isPlaceholderData, error, refetch } = useAdminLogs({
    user: params.user || undefined,
    group: params.group || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
    q: params.q || undefined,
    page: params.page,
  });
  const top = useRef(null);
  const filtered = Boolean(params.user || params.group || params.from || params.to || params.q);

  return (
    <div className="stack" ref={top}>
      {data && <p className="hint">Nhật ký chỉ giữ thao tác trong {keepText(data.retentionDays)} gần nhất; dòng cũ hơn tự xoá.</p>}
      <div className="filters">
        <input className="input filters-q" type="search" aria-label="Tìm theo đối tượng" placeholder="Tìm theo tên sản phẩm, tài nguyên, tài khoản..." value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="filter">
          <span>Thành viên</span>
          <select className="input" value={params.user} onChange={(e) => set({ user: e.target.value })}>
            <option value="">Mọi người</option>
            {(users?.items || []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>Nhóm thao tác</span>
          <select className="input" value={params.group} onChange={(e) => set({ group: e.target.value })}>
            <option value="">Tất cả</option>
            {Object.entries(data?.groups || {}).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>Từ ngày</span>
          <input className="input" type="date" value={params.from} max={params.to || undefined} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="filter">
          <span>Đến ngày</span>
          <input className="input" type="date" value={params.to} min={params.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </label>
      </div>

      {filtered && (
        <div className="filters-sum">
          <span>{data ? (data.total ? `${data.total} dòng khớp` : "Không có dòng nào khớp") : ""}</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setQ("");
              set({ user: "", group: "", from: "", to: "", q: "" });
            }}
          >
            Bỏ lọc
          </button>
        </div>
      )}

      {isLoading ? (
        <Skeleton h={320} r={12} />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.items.length ? (
        <EmptyState title={filtered ? "Không có dòng nào khớp" : "Chưa có hoạt động nào"}>
          {filtered ? "Thử bỏ bớt bộ lọc." : `Mỗi lần ai đó thêm, sửa, xoá hay đăng nhập sẽ hiện ở đây, giữ trong ${keepText(data.retentionDays)}.`}
        </EmptyState>
      ) : (
        <>
          <div className={`card atable-wrap ${isPlaceholderData ? "is-stale" : ""}`}>
            <table className="atable alog">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Thành viên</th>
                  <th>Thao tác</th>
                  <th>Đối tượng</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l._id} className={l.action === "auth.login_failed" ? "is-warn" : ""}>
                    <td className="alog-time">
                      <time dateTime={l.createdAt}>{fmtDateTimeFull(l.createdAt)}</time>
                    </td>
                    <td data-label="Thành viên">
                      {l.user ? (
                        <button type="button" className="link-btn" onClick={() => set({ user: l.user.id })} title="Chỉ xem người này">
                          {l.user.displayName}
                        </button>
                      ) : (
                        <span className="hint">Không rõ</span>
                      )}
                    </td>
                    <td data-label="Thao tác">
                      <span className={`alog-act alog-${l.group}`}>{l.actionLabel}</span>
                    </td>
                    <td data-label="Đối tượng" className="alog-target">
                      {l.label && <span>{l.label}</span>}
                      {metaText(l) && <span className="hint">{metaText(l)}</span>}
                    </td>
                    <td data-label="IP" className="alog-ip" title={l.ua}>
                      {l.ip}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={data.page}
            pages={data.pages}
            disabled={isPlaceholderData}
            onPage={(n) => {
              set({ page: n > 1 ? n : "" });
              top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </>
      )}
    </div>
  );
}

export default function Admin() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const get = (k) => params.get(k) || "";
  const tab = TABS.some((t) => t.value === get("tab")) ? get("tab") : "overview";
  const set = (changes) =>
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        for (const [k, v] of Object.entries(changes)) v ? next.set(k, String(v)) : next.delete(k);
        if (!("page" in changes)) next.delete("page");
        return next;
      },
      { replace: !("page" in changes) && !("tab" in changes) }
    );
  const logParams = { user: get("user"), group: get("group"), from: get("from"), to: get("to"), q: get("q"), page: Math.max(Number(get("page")) || 1, 1) };

  if (!can("admin.view"))
    return (
      <div className="page">
        <EmptyState title="Bạn chưa được xem trang Quản trị">Vai trò của bạn chưa có quyền này. Nhờ quản trị viên cấp quyền nếu cần.</EmptyState>
      </div>
    );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Quản trị</h1>
          <p>Tài khoản của team, phân quyền, nhật ký thao tác và số liệu chung. Chỉ quản trị viên thay đổi được tài khoản và quyền.</p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Mục quản trị">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            className={tab === t.value ? "is-on" : ""}
            onClick={() => setParams(t.value === "overview" ? {} : { tab: t.value })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview />}
      {tab === "users" && <Users onShowLogs={(user) => setParams({ tab: "logs", user })} />}
      {tab === "roles" && <Roles />}
      {tab === "logs" && <Logs params={logParams} set={set} />}
    </div>
  );
}
