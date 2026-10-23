import mongoose from "mongoose";

// skill = hướng dẫn/skill cho AI (vd. nội dung SKILL.md); image = prompt tạo ảnh đã cho ra ảnh đẹp.
export const RESOURCE_KINDS = ["skill", "image"];

const schema = new mongoose.Schema(
  {
    kind: { type: String, enum: RESOURCE_KINDS, required: true },
    title: { type: String, required: true, maxlength: 200 },
    content: { type: String, required: true, maxlength: 20000 },
    // Only used by image prompts.
    negative: { type: String, maxlength: 5000, default: "" },
    // Where it works best, e.g. "Midjourney", "Claude".
    tool: { type: String, maxlength: 60, default: "" },
    tags: { type: [String], default: [] },
    note: { type: String, maxlength: 1000, default: "" },
    link: { type: String, maxlength: 500, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

schema.index({ kind: 1, updatedAt: -1 });

export const Resource = mongoose.model("Resource", schema);
