import mongoose from "mongoose";

// One message in the team's chat room. Kept 90 days, then MongoDB removes it on its own.
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const ChatMessage = mongoose.model("ChatMessage", schema);
