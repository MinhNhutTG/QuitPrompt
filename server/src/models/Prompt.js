import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    prompt: { type: String, required: true, maxlength: 20000 },
    negative: { type: String, maxlength: 5000, default: "" },
    note: { type: String, maxlength: 1000, default: "" },
    tool: { type: String, maxlength: 60, default: "" },
    // "external": pasted from outside the builder, so it has no settings to reuse.
    source: { type: String, enum: ["builder", "external"], default: "builder" },
    // Snapshot of the builder choices, used by "Dùng lại và chỉnh".
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false }
);

schema.index({ owner: 1, _id: -1 });
schema.index({ owner: 1, product: 1, _id: -1 });

export const Prompt = mongoose.model("Prompt", schema);
