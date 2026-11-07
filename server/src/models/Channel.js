import mongoose from "mongoose";

// Where the team posts videos (doc 09 §4c): a TikTok account, a Facebook page... Managed in Quản trị → Kênh đăng by an
// admin; every member marks on a plan which of them the video goes to. Deleting a channel takes it off every plan.
export const PLATFORMS = ["tiktok", "facebook", "youtube", "instagram", "shopee", "other"];

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    platform: { type: String, enum: PLATFORMS, default: "tiktok" },
  },
  { timestamps: true }
);
schema.index({ name: 1 }, { unique: true, collation: { locale: "vi", strength: 2 } });

export const Channel = mongoose.model("Channel", schema);
