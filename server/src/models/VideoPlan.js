import mongoose from "mongoose";

export const PLAN_STATUSES = ["todo", "partial", "done"];

const schema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    target: { type: Number, required: true, min: 1, max: 999 },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Chosen by the assignee, never computed: todo = chưa thực hiện, partial = còn thiếu, done = đã hoàn thành.
    status: { type: String, enum: PLAN_STATUSES, default: "todo" },
    // Videos made so far; only meaningful while partial (todo = 0, done = target).
    done: { type: Number, min: 0, max: 999, default: 0 },
    // "YYYY-MM-DD" or "": a calendar day, so it never shifts with time zones.
    dueDate: { type: String, default: "", match: /^(\d{4}-\d{2}-\d{2})?$/ },
    note: { type: String, maxlength: 1000, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

schema.index({ assignee: 1, status: 1, dueDate: 1 });
schema.index({ product: 1 });

export const VideoPlan = mongoose.model("VideoPlan", schema);
