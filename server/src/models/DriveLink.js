import mongoose from "mongoose";

// The one Google account the team's Drive folder lives in. A single document, key "team".
const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "team" },
    // AES-GCM encrypted with a key derived from JWT_SECRET (lib/drive.js).
    refreshToken: { type: String, required: true },
    email: { type: String, default: "" },
    // The team's folder, chosen by an admin; members only ever see what is inside it. Empty until chosen.
    rootId: { type: String, default: "" },
    rootName: { type: String, default: "" },
    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const DriveLink = mongoose.model("DriveLink", schema);
