import mongoose from "mongoose";

// How much of one daily limit an account used on one day (Vietnam time). Taken atomically, see lib/tiers.js.
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  day: { type: String, required: true }, // "YYYY-MM-DD"
  key: { type: String, required: true }, // promptsPerDay, productsPerDay
  count: { type: Number, default: 0 },
  // Only today's row matters; MongoDB removes rows after 3 days.
  createdAt: { type: Date, default: Date.now, expires: 3 * 24 * 60 * 60 },
});
schema.index({ user: 1, day: 1, key: 1 }, { unique: true });

export const Usage = mongoose.model("Usage", schema);
