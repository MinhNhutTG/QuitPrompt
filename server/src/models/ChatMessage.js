import mongoose from "mongoose";

// How long a message is kept; then MongoDB removes it on its own (its sweep runs about once a minute).
export const CHAT_KEEP_DAYS = 4;

// One message in the team's chat room. A recalled one keeps its place with no text (recalledAt set).
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, maxlength: 2000, default: "" },
    recalledAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// An existing TTL index keeps its old lifetime until rebuilt: index.js syncs it on start.
schema.index({ createdAt: 1 }, { expireAfterSeconds: CHAT_KEEP_DAYS * 24 * 60 * 60 });

export const ChatMessage = mongoose.model("ChatMessage", schema);
