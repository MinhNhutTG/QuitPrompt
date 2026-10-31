import mongoose from "mongoose";

// A voice-over and the video's caption written for one product, kept so the ones not picked yet can go into a later
// plan instead of being written again. The caption is always there; the voice-over may be left empty.
const schema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    voiceText: { type: String, maxlength: 5000, default: "" },
    caption: { type: String, required: true, maxlength: 5000 },
    // Đã dùng: set when a plan takes it, or by hand. usedPlan is the last plan that took it (null when marked by hand).
    used: { type: Boolean, default: false },
    usedAt: { type: Date, default: null },
    usedPlan: { type: mongoose.Schema.Types.ObjectId, ref: "VideoPlan", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

schema.index({ product: 1, used: 1, _id: -1 });

export const Script = mongoose.model("Script", schema);
