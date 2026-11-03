// Xưởng Prompt — chương trình nhận lệnh tắt máy từ trang Quản trị → Máy tính (tài liệu 15).
// Chỉ dùng Node (không cần cài thêm gì). Windows.
//
//   node agent.mjs setup <địa chỉ app> <mã kết nối>   lưu cấu hình vào config.json bên cạnh file này
//   node agent.mjs                                     chạy: chờ lệnh, tắt máy khi được lệnh
//   node agent.mjs test                                kiểm tra kết nối một lần rồi thoát
//   node agent.mjs --dry-run                           chạy thử: nhận lệnh và báo lại nhưng KHÔNG tắt máy thật
//
// Mỗi lần hỏi, máy chủ giữ yêu cầu tối đa 25 giây chờ lệnh, nên lệnh đến gần như ngay. Lệnh tắt máy chạy
// `shutdown /s /t <giây>`: Windows hiện thông báo đếm ngược, ngồi ở máy có thể huỷ bằng `shutdown /a`.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.join(DIR, "config.json");
const LOG = path.join(DIR, "agent.log");
const MAX_LOG = 512 * 1024;

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > MAX_LOG) fs.renameSync(LOG, LOG + ".old");
    fs.appendFileSync(LOG, line);
  } catch {
    /* the log is a convenience */
  }
  if (process.stdout.isTTY) process.stdout.write(line);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
    if (c.server && c.token) return c;
  } catch {
    /* missing or broken */
  }
  console.error(`Chưa có cấu hình. Chạy: node agent.mjs setup <địa chỉ app> <mã kết nối>`);
  process.exit(1);
}

async function api(cfg, method, p, body, timeoutMs = 35000) {
  const res = await fetch(cfg.server.replace(/\/+$/, "") + "/api/agent" + p, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      // The server refuses changes without it (its CSRF guard).
      "X-Requested-With": "fetch",
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Máy chủ trả lỗi ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const run = (file, args) =>
  new Promise((resolve) => execFile(file, args, { windowsHide: true }, (err, stdout, stderr) => resolve(err ? (stderr || err.message).trim() : "")));

const DRY_RUN = process.argv.includes("--dry-run");

async function execute(cmd) {
  if (DRY_RUN) {
    log(`(chạy thử) bỏ qua lệnh ${cmd.kind}, máy không bị tắt`);
    return "";
  }
  if (process.platform !== "win32") return "Chương trình này chỉ tắt được máy Windows.";
  if (cmd.kind === "shutdown") {
    const minutes = Math.round(cmd.delaySec / 60);
    // A shutdown already scheduled would make Windows refuse a new one (1190): replace it, so the time can change.
    await run("shutdown", ["/a"]);
    return run("shutdown", ["/s", "/t", String(cmd.delaySec), "/c", `Xưởng Prompt: máy sẽ tắt sau ${minutes} phút. Huỷ: chạy "shutdown /a" hoặc bấm Huỷ trên trang Quản trị.`]);
  }
  if (cmd.kind === "cancel") {
    const err = await run("shutdown", ["/a"]);
    // 1116: no shutdown was in progress — nothing to cancel, which is fine.
    return /1116/.test(err) ? "" : err;
  }
  return `Lệnh lạ: ${cmd.kind}`;
}

async function loop(cfg) {
  const name = os.hostname();
  log(`Bắt đầu${DRY_RUN ? " (CHẠY THỬ, không tắt máy thật)" : ""}, máy ${name}, máy chủ ${cfg.server}`);
  let wait = 2000;
  for (;;) {
    try {
      const { command, gone } = await api(cfg, "GET", `/poll?name=${encodeURIComponent(name)}`);
      wait = 2000;
      if (gone) {
        log("Máy đã bị ngắt kết nối trên trang Quản trị. Dừng.");
        return;
      }
      if (!command) continue;
      log(`Nhận lệnh ${command.kind}${command.kind === "shutdown" ? ` sau ${command.delaySec} giây` : ""}`);
      const error = await execute(command);
      log(error ? `Lỗi: ${error}` : "Đã chạy lệnh");
      await api(cfg, "POST", "/ack", { id: command.id, ok: !error, message: error.slice(0, 300) }).catch((e) => log(`Không báo lại được: ${e.message}`));
    } catch (err) {
      if (err.status === 401) {
        log(`${err.message} Thử lại sau 5 phút.`);
        await sleep(5 * 60 * 1000);
        continue;
      }
      // Offline, the server waking up on Render, a timeout: wait a little longer each time, at most a minute.
      log(`Không kết nối được (${err.message}), thử lại sau ${Math.round(wait / 1000)} giây`);
      await sleep(wait);
      wait = Math.min(wait * 2, 60000);
    }
  }
}

const [cmd, ...args] = process.argv.slice(2).filter((a) => a !== "--dry-run");
if (cmd === "setup") {
  const [server, token] = args;
  if (!/^https?:\/\/\S+$/.test(server || "") || !/^pc_[\w-]{20,100}$/.test(token || "")) {
    console.error("Cách dùng: node agent.mjs setup https://ten-app.onrender.com pc_xxxxxxxx");
    process.exit(1);
  }
  fs.writeFileSync(CONFIG, JSON.stringify({ server: server.replace(/\/+$/, ""), token }, null, 2));
  console.log(`Đã lưu ${CONFIG}. Kiểm tra: node agent.mjs test`);
} else if (cmd === "test") {
  const cfg = readConfig();
  try {
    await api(cfg, "GET", `/poll?wait=0&name=${encodeURIComponent(os.hostname())}`);
    console.log(`Kết nối được. Trang Quản trị → Máy tính sẽ thấy máy "${os.hostname()}" đang bật.`);
  } catch (err) {
    console.error(`Chưa kết nối được: ${err.message}`);
    process.exit(1);
  }
} else {
  await loop(readConfig());
}
