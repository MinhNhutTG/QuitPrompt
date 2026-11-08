import mongoose from "mongoose";

// model = người mẫu (nhiều ảnh: mặt chính diện, toàn thân, các góc); background = phông nền / bối cảnh.
// Both are shared by the whole team, like products, and picked on the "Ảnh AI" page.
export const ASSET_KINDS = ["model", "background"];
export const MAX_ASSET_IMAGES = 12;

const imageSchema = new mongoose.Schema(
  { url: { type: String, required: true }, publicId: { type: String, required: true }, width: Number, height: Number },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    kind: { type: String, enum: ASSET_KINDS, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // Written into the AI prompt when picked, e.g. "a 25-year-old Vietnamese woman, long black hair, slim".
    description: { type: String, maxlength: 1500, default: "" },
    tags: { type: [String], default: [] },
    note: { type: String, maxlength: 1000, default: "" },
    // First image is the cover (for a model: the clearest front-facing face photo).
    images: { type: [imageSchema], default: [], validate: [(v) => v.length <= MAX_ASSET_IMAGES, `Tối đa ${MAX_ASSET_IMAGES} ảnh mỗi mục.`] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

schema.index({ kind: 1, updatedAt: -1 });

export const Asset = mongoose.model("Asset", schema);
