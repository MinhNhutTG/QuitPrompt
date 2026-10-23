import mongoose from "mongoose";

// One row per user action; written by lib/audit.js, read by the admin pages.
const schema = new mongoose.Schema(
  {
    // Missing for a failed login with an unknown username.
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true, maxlength: 60 },
    targetId: { type: String, maxlength: 40, default: "" },
    // Human name of what was touched (product name, username...), kept so it survives deletion.
    label: { type: String, maxlength: 200, default: "" },
    // Small details only: changed field names, counts. Never passwords or prompt text.
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    ip: { type: String, maxlength: 60, default: "" },
    ua: { type: String, maxlength: 200, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Kept 180 days, then MongoDB removes them on its own.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
schema.index({ user: 1, createdAt: -1 });
schema.index({ action: 1, createdAt: -1 });

export const ActivityLog = mongoose.model("ActivityLog", schema);
