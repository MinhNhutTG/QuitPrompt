import mongoose from "mongoose";

// The two account tiers, "normal" and "premium": extra permissions on top of the role, and usage limits.
// null in a limit means no limit.
const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, enum: ["normal", "premium"] },
    permissions: { type: [String], default: [] },
    limits: {
      promptsPerDay: { type: Number, default: null, min: 0 },
      productsPerDay: { type: Number, default: null, min: 0 },
      imagesPerProduct: { type: Number, default: null, min: 0 },
    },
  },
  { timestamps: true }
);

export const Tier = mongoose.model("Tier", schema);
