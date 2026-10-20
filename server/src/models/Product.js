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
    note: { type: String, maxlength: 2000, default: "" },
    extraNeg: { type: String, maxlength: 1000, default: "" },
    closed: { type: Boolean, default: true },
    // First image is the cover.
    images: { type: [imageSchema], default: [], validate: [(v) => v.length <= MAX_IMAGES, "Tối đa 12 ảnh mỗi sản phẩm."] },
    promptCount: { type: Number, default: 0 },
    lastPromptAt: Date,
  },
  { timestamps: true }
);

schema.index({ owner: 1, updatedAt: -1 });
schema.index({ owner: 1, name: 1 });

export const Product = mongoose.model("Product", schema);
