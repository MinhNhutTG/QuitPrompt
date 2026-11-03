import mongoose from "mongoose";

// An ElevenLabs API key the team can spend (tài liệu 09, mục 8b). Several keys — usually several accounts — so when
// one runs out of credit the next is used. The key itself is sealed (lib/secret.js) and never sent to a browser.
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    secret: { type: String, required: true },
    // Shown instead of the key: "…a1b2".
    last4: { type: String, default: "" },
    active: { type: Boolean, default: true },
    // ok | empty (out of credit) | invalid (refused by ElevenLabs) | error (could not check)
    status: { type: String, default: "ok" },
    statusText: { type: String, default: "" },
    used: { type: Number, default: 0 },
    limit: { type: Number, default: 0 },
    resetAt: { type: Date, default: null },
    // Voices this account can read with (cloned voices exist in one account only).
    voices: { type: [{ id: String, name: String, category: String, gender: String, accent: String, previewUrl: String, _id: false }], default: [] },
    checkedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const TtsKey = mongoose.model("TtsKey", schema);
