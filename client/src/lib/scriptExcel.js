// Excel files of saved voice-overs and captions: the template to fill in, and reading a filled one.
// The Excel libraries load only when one of these runs, so they never weigh on the first page load.
import { norm } from "./util.js";

const VOICE = "Lời đọc";
const CAPTION = "Mô tả video";
const MAX = 5000;
// The template's example rows; left in a filled file, they are not imported.
const SAMPLES = [
  ["Trời ơi cái áo này mặc mát dữ luôn! Vải dày dặn, mặc cả ngày không bí. Ai đang kiếm áo đi làm đi chơi thì chốt liền nha.", "Áo mặc mát cả ngày 🔥 #aothun #outfit #tiktokshop"],
  ["", "Dòng này chỉ có mô tả video, không có lời đọc ✨ #basic"],
];

const header = (value) => ({ value, fontWeight: "bold", backgroundColor: "#E3EDFC", height: 22 });
const wrap = (value) => ({ value, wrap: true, alignVertical: "top" });

// Two columns with headers, a filled pair and a caption-only row as examples, and a note on how to fill it in.
export async function downloadTemplate(productName) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const rows = [
    [header(VOICE), header(CAPTION)],
    ...SAMPLES.map(([v, c]) => [v ? wrap(v) : null, wrap(c)]),
    [null, null],
    [{ value: "Cách điền: mỗi dòng là một cặp. Cột Mô tả video bắt buộc, cột Lời đọc để trống được. Thay 2 dòng mẫu ở trên bằng nội dung của bạn (để nguyên thì chúng không được nhập).", fontStyle: "italic", textColor: "#6A7894", columnSpan: 2 }, null],
  ];
  const safe = String(productName || "san-pham").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60);
  await writeExcelFile(rows, { columns: [{ width: 70 }, { width: 50 }], stickyRowsCount: 1 }).toFile(`Lời đọc - ${safe}.xlsx`);
}

const text = (v) => (v == null ? "" : v instanceof Date ? v.toLocaleDateString("vi-VN") : String(v)).trim();

// → { items: [{ voiceText, caption }], missing: [row numbers with a voice-over but no caption], tooLong: [row numbers] }.
// Columns are found by their headers ("Lời đọc", "Mô tả..."), anywhere in the first 10 rows; without headers the first
// column is the voice-over and the second the caption. The note row of the template is left out.
export async function readScripts(file) {
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file);
  let start = 0;
  let voiceCol = 0;
  let captionCol = 1;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = (rows[r] || []).map((c) => norm(text(c)));
    const c = cells.findIndex((v) => v.startsWith("mo ta") || v === "caption");
    if (c >= 0) {
      captionCol = c;
      const v = cells.findIndex((x) => x.startsWith("loi doc") || x === "voice");
      voiceCol = v >= 0 ? v : -1;
      start = r + 1;
      break;
    }
  }
  const items = [];
  const missing = [];
  const tooLong = [];
  for (let r = start; r < rows.length; r++) {
    const row = rows[r] || [];
    const voiceText = voiceCol >= 0 ? text(row[voiceCol]) : "";
    const caption = text(row[captionCol]);
    if (!voiceText && !caption) continue;
    if (norm(voiceText).startsWith("cach dien:") || SAMPLES.some(([v, c]) => v === voiceText && c === caption)) continue;
    if (!caption) {
      missing.push(r + 1);
      continue;
    }
    if (voiceText.length > MAX || caption.length > MAX) {
      tooLong.push(r + 1);
      continue;
    }
    items.push({ voiceText, caption });
  }
  return { items, missing, tooLong };
}
