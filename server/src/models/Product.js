import mongoose from "mongoose";

export const MAX_IMAGES = 12;

const imageSchema = new mongoose.Schema(
  { url: { type: String, required: true }, publicId: { type: String, required: true }, width: Number, height: Number },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    sku: { type: String, trim: true, maxlength: 60, default: "" },
    // Free text ("Áo", "Nón"...), used to filter saved prompts.
    category: { type: String, trim: true, maxlength: 60, default: "" },
    note: { type: String, maxlength: 2000, default: "" },
    extraNeg: { type: String, maxlength: 1000, default: "" },
    closed: { type: Boolean, default: true },
    // Marked by the team as selling well right now: shown with 🔥 before its name and listed first.
    hot: { type: Boolean, default: false },
    // First image is the cover.
    images: { type: [imageSchema], default: [], validate: [(v) => v.length <= MAX_IMAGES, "Tối đa 12 ảnh mỗi sản phẩm."] },
    promptCount: { type: Number, default: 0 },
    lastPromptAt: Date,
  },
  { timestamps: true }
);

// Shared by the whole team, so lists are not narrowed by owner.
schema.index({ updatedAt: -1 });
schema.index({ name: 1 });

export const Product = mongoose.model("Product", schema);
