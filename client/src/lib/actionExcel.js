// Excel files of custom actions: the template to fill in, an export of the user's own actions, and reading a filled one.
// The Excel libraries load only when one of these runs, so they never weigh on the first page load.
import { ACTIONS, ROLE_LABEL } from "./actions.js";
import { norm } from "./util.js";

const COLS = ["Vị trí", "Tên tiếng Việt", "Câu lệnh tiếng Anh"];
const MAX_LABEL = 200;
const MAX_TEXT = 2000;
const VARS = ["S", "s", "p", "g"];
// The template's example rows; left in a filled file, they are not imported.
const SAMPLES = [
  ["open", "Bước vào khung hình, dừng lại mỉm cười", "{S} walks slowly into the frame with a confident stride, arms swinging naturally away from the {g}, then stops and smiles at the camera."],
  ["mid", "Xoay nửa vòng khoe dáng nghiêng", "{S} turns smoothly a half step to one side to show the profile of the {g}, arms relaxed at {p} sides, then turns back to face the camera."],
  ["end", "Gật đầu nhẹ, nhìn camera kết", "{S} gives a small, warm nod and holds a calm smile into the lens, arms relaxed at {p} sides, standing still."],
];
const NOTE = "Cách điền: mỗi dòng là một động tác. Thay 3 dòng mẫu ở trên bằng động tác của bạn (để nguyên thì chúng không được nhập). Xem sheet “Hướng dẫn” để biết các biến và quy tắc.";

const header = (value) => ({ value, fontWeight: "bold", backgroundColor: "#E3EDFC", height: 22 });
const wrap = (value) => ({ value, wrap: true, alignVertical: "top" });
const COLUMNS = [{ width: 14 }, { width: 40 }, { width: 90 }];

const GUIDE = [
  ["Cột", "Cách điền"],
  ["Vị trí", "Mở đầu, Đoạn giữa hoặc Kết (gõ không dấu cũng được: mo dau, giua, ket)."],
  ["Tên tiếng Việt", `Tên ngắn gọn để chọn trong app, tối đa ${MAX_LABEL} ký tự.`],
  ["Câu lệnh tiếng Anh", `Một câu tiếng Anh, bắt đầu bằng {S}, tối đa ${MAX_TEXT} ký tự.`],
  ["", ""],
  ["Biến", "App tự thay"],
  ["{S}", "She / He (chữ đầu câu)"],
  ["{s}", "she / he (giữa câu)"],
  ["{p}", "her / his (chỉ dùng làm sở hữu: {p} hands)"],
  ["{g}", "tên sản phẩm (the product)"],
  ["", ""],
  ["Quy tắc", "Tay không bao giờ chạm sản phẩm; máy quay đứng yên; một cảnh liền; không nhắc gió; không mô tả trang phục, màu, bối cảnh; không thêm đạo cụ."],
  ["Bỏ qua", "Dòng trống, dòng mẫu, và động tác có câu lệnh trùng với động tác đã có."],
];

const rowsOf = (actions) => [COLS.map(header), ...actions.map((a) => [wrap(ROLE_LABEL[a.role] || ""), wrap(a.label), wrap(a.text)])];

async function write(sheets, fileName) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  await writeExcelFile(sheets).toFile(fileName);
}

const guideSheet = { sheet: "Hướng dẫn", data: GUIDE.map((r, i) => (i === 0 ? r.map(header) : r.map(wrap))), columns: [{ width: 20 }, { width: 100 }] };

export async function downloadTemplate() {
  const data = [
    ...rowsOf(SAMPLES.map(([role, label, text]) => ({ role, label, text }))),
    [null, null, null],
    [{ value: NOTE, fontStyle: "italic", textColor: "#6A7894", columnSpan: 3 }, null, null],
  ];
  await write([{ sheet: "Động tác", data, columns: COLUMNS, stickyRowsCount: 1 }, guideSheet], "Mẫu động tác.xlsx");
}

// The user's own actions in the same columns, so the file can be edited and imported back.
export async function exportActions(actions) {
  await write([{ sheet: "Động tác", data: rowsOf(actions), columns: COLUMNS, stickyRowsCount: 1 }, guideSheet], "Động tác của tôi.xlsx");
}

const cell = (v) => (v == null ? "" : v instanceof Date ? v.toLocaleDateString("vi-VN") : String(v)).replace(/\s+/g, " ").trim();
// Two commands that differ only in case, accents or spacing are the same action.
export const textKey = (t) => norm(t).replace(/\s+/g, " ").trim();

function parseRole(v) {
  const n = norm(v).replace(/\s+/g, " ");
  if (!n) return null;
  if (/^(mo|open|bat dau|dau)/.test(n)) return "open";
  if (/^(doan giua|giua|mid|than)/.test(n)) return "mid";
  if (/^(ket|end|cuoi)/.test(n)) return "end";
  return null;
}



// Reads the first sheet. Columns are found by their headers anywhere in the first 10 rows; without headers they are
// A = Vị trí, B = Tên, C = Câu lệnh. `known` is a Set of textKey()s already in the library (dupes are skipped).
// → { items: [{ role, label, text }], errors: [{ row, reason }], dupes: [row], warnings: [{ row, reason }] }
export async function readActions(file, known) {
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file);
  let start = 0;
  let col = { role: 0, label: 1, text: 2 };
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = (rows[r] || []).map((c) => norm(cell(c)));
    const text = cells.findIndex((v) => v.startsWith("cau lenh") || v === "text" || v === "prompt");
    if (text >= 0) {
      const find = (test, fallback) => {
        const i = cells.findIndex(test);
        return i >= 0 ? i : fallback;
      };
      col = { role: find((v) => v.startsWith("vi tri") || v === "role", -1), label: find((v) => v.startsWith("ten") || v === "label", -1), text };
      start = r + 1;
      break;
    }
  }

  const seen = new Set(known);
  const sampleKeys = new Set(SAMPLES.map(([, , t]) => textKey(t)));
  const items = [];
  const errors = [];
  const dupes = [];
  const warnings = [];
  for (let r = start; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = (i) => (i >= 0 ? cell(row[i]) : "");
    const rawRole = get(col.role);
    const label = get(col.label);
    const text = get(col.text);
    const line = r + 1;
    if (!label && !text) continue;
    if (norm(rawRole || label || text).startsWith("cach dien")) continue;
    const key = textKey(text);
    if (sampleKeys.has(key)) continue;

    const role = parseRole(rawRole);
    const reason = !rawRole
      ? "thiếu vị trí"
      : !role
        ? `vị trí “${rawRole}” không hợp lệ (dùng Mở đầu, Đoạn giữa hoặc Kết)`
        : !label
          ? "thiếu tên tiếng Việt"
          : !text
            ? "thiếu câu lệnh tiếng Anh"
            : !text.startsWith("{S}")
              ? "câu lệnh phải bắt đầu bằng {S}"
              : label.length > MAX_LABEL
                ? `tên dài quá ${MAX_LABEL} ký tự`
                : text.length > MAX_TEXT
                  ? `câu lệnh dài quá ${MAX_TEXT} ký tự`
                  : "";
    if (reason) {
      errors.push({ row: line, reason });
      continue;
    }
    if (seen.has(key)) {
      dupes.push(line);
      continue;
    }
    seen.add(key);

    const odd = [...text.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]).filter((v) => !VARS.includes(v));
    if (odd.length) warnings.push({ row: line, reason: `có biến lạ ${[...new Set(odd)].map((v) => `{${v}}`).join(" ")}` });
    const raw = text.replace(/\{[^}]*\}/g, "").match(/\b(she|he|her|his|him)\b/i);
    if (raw) warnings.push({ row: line, reason: `viết thẳng “${raw[1]}”, nên dùng biến {S} {s} {p}` });
    items.push({ role, label, text, row: line });
  }
  return { items, errors, dupes, warnings };
}

// Text keys of the built-in actions plus the given custom ones.
export const knownKeys = (custom) => new Set([...ACTIONS, ...custom].map((a) => textKey(a.text)));

