import mongoose from "mongoose";

// A search phrase the team watches to catch a selling wave early (trang "Đón sóng", tài liệu 14). Each scan stores
// the last 90 days of Google search interest in Vietnam, the phase read from it, the related searches growing fastest
// and what TikTok suggests when the phrase is typed.
const point = new mongoose.Schema({ d: String, v: Number }, { _id: false });
const rising = new mongoose.Schema({ q: String, label: String, v: Number }, { _id: false });

const schema = new mongoose.Schema(
  {
    keyword: { type: String, required: true, trim: true, maxlength: 80 },
    // Lowercased, spaces collapsed: one entry per phrase.
    key: { type: String, required: true, unique: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    series: { type: [point], default: [] },
    // early | mid | spike | flat | down | low | "" (never scanned)
    phase: { type: String, default: "" },
    // Last 7 days against the 3 weeks before, as a fraction (0.4 = +40%).
    growth: { type: Number, default: 0 },
    // Last 7 days as a share of the 90-day peak (weekly average), 0..1.
    level: { type: Number, default: 0 },
    rising: { type: [rising], default: [] },
    tiktok: { type: [String], default: [] },
    // TikTok suggestions that were not there on the scan before.
    tiktokNew: { type: [String], default: [] },
    scannedAt: { type: Date, default: null },
    scanError: { type: String, default: "" },
  },
  { timestamps: true }
);

schema.index({ createdAt: -1 });

export const keyOf = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");

export const TrendKeyword = mongoose.model("TrendKeyword", schema);
