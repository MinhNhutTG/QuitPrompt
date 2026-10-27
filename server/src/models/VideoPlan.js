import mongoose from "mongoose";

export const PLAN_STATUSES = ["todo", "partial", "done", "posted"];
// The video is made (done) or already posted: these sit at the end of the list and are never overdue.
export const FINISHED_STATUSES = ["done", "posted"];

// The files every plan collects, each kept in the plan's own Drive folder.
export const PLAN_SLOTS = {
  clip1: "Video 10s 1",
  clip2: "Video 10s 2",
  audio: "Lời đọc",
  final: "Video thành phẩm",
};

// A file uploaded to the plan's Drive folder.
const fileSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: "" },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: "" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // Older plans counted videos; a plan is now one finished video, so these only remain for old rows.
    target: { type: Number, min: 1, max: 999, default: 1 },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // todo = chưa thực hiện, partial = còn thiếu, done = đã hoàn thành (follow the files and texts, see autoStatus),
    // posted = đã đăng bài (only ever chosen by hand). Any member may change it.
    status: { type: String, enum: PLAN_STATUSES, default: "todo" },
    done: { type: Number, min: 0, max: 999, default: 0 },
    // "YYYY-MM-DD" or "": a calendar day, so it never shifts with time zones.
    dueDate: { type: String, default: "", match: /^(\d{4}-\d{2}-\d{2})?$/ },
    // The day the plan was made (Vietnam time). Its Drive folder sits in a folder named after this day.
    day: { type: String, default: "", match: /^(\d{4}-\d{2}-\d{2})?$/ },
    note: { type: String, maxlength: 1000, default: "" },
    // Pinned to the top of the team's list (newest pin first); null when not pinned. Any member pins or unpins.
    pinnedAt: { type: Date, default: null },
    // The plan's own Drive folder: <team folder>/<DD_MM_YYYY>/<product name (n)>. Made on creation, or later when Drive was not connected.
    folder: {
      id: { type: String, default: "" },
      name: { type: String, default: "" },
    },
    files: {
      clip1: { type: fileSchema, default: undefined },
      clip2: { type: fileSchema, default: undefined },
      audio: { type: fileSchema, default: undefined },
      final: { type: fileSchema, default: undefined },
    },
    // What the voice-over says, and the text posted with the video.
    voiceText: { type: String, maxlength: 5000, default: "" },
    caption: { type: String, maxlength: 5000, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

schema.index({ assignee: 1, status: 1, dueDate: 1 });
schema.index({ product: 1 });

export const VideoPlan = mongoose.model("VideoPlan", schema);
