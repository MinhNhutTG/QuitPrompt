import { FOLDER, gapi, getLink, metaOf, primeMeta, quote, trash } from "./drive.js";
import { HttpError } from "./http.js";
import { vnDay } from "./tiers.js";

// Each plan's files live in <team folder>/<DD_MM_YYYY of the day it was made>/<product name (n)>.

// "2026-10-25" -> "25_10_2026"
export const dayFolderName = (day) => day.split("-").reverse().join("_");

// Drive allows almost any name; slashes would only confuse people downloading to disk.
const safe = (s) => String(s || "").replace(/[\\/]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 150) || "Sản phẩm";

// Folders directly in parent, optionally only the one named exactly `named`.
async function childFolders(parent, named) {
  const list = await gapi("GET", "/files", {
    query: {
      q: `${quote(parent)} in parents and mimeType='${FOLDER}' and trashed=false${named ? ` and name = ${quote(named)}` : ""}`,
      fields: "files(id,name,mimeType)",
      pageSize: "1000",
    },
  });
  return list.files || [];
}

async function newFolder(parent, name) {
  const f = await gapi("POST", "/files", { query: { fields: "id,name,mimeType" }, body: { name, mimeType: FOLDER, parents: [parent] } });
  primeMeta(f, parent);
  return f;
}

// One at a time on this server, so two plans made together never create the same day folder twice
// or both pick "(1)".
let queue = Promise.resolve();
const serial = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

async function folderAlive(id) {
  try {
    return !(await metaOf(id)).trashed;
  } catch {
    return false;
  }
}

// Makes (or finds again) the plan's folder and stores it on the plan. Returns the folder id.
export function ensurePlanFolder(plan, productName) {
  return serial(async () => {
    if (plan.folder?.id && (await folderAlive(plan.folder.id))) return plan.folder.id;
    const link = await getLink();
    if (!link) throw new HttpError(503, "Google Drive chưa được kết nối. Nhờ quản trị viên kết nối ở trang Drive.");
    if (!link.rootId) throw new HttpError(503, "Quản trị viên chưa chọn thư mục Drive cho team.");

    const dayName = dayFolderName(plan.day || vnDay(plan.createdAt));
    const days = await childFolders(link.rootId, dayName);
    const dayFolder = days[0] || (await newFolder(link.rootId, dayName));

    const base = safe(productName);
    const taken = new Set((await childFolders(dayFolder.id)).map((f) => f.name));
    let n = 1;
    while (taken.has(`${base} (${n})`)) n++;
    const f = await newFolder(dayFolder.id, `${base} (${n})`);
    plan.folder = { id: f.id, name: f.name };
    await plan.save();
    return f.id;
  });
}

// Plan deleted: its folder goes to Drive's bin (restorable for 30 days). Never fails the delete.
export async function trashPlanFolders(plans) {
  for (const p of plans) {
    if (!p.folder?.id) continue;
    try {
      await trash(p.folder.id);
    } catch (err) {
      console.error("Drive: không xoá được thư mục kế hoạch", p.folder.id, err.message);
    }
  }
}
