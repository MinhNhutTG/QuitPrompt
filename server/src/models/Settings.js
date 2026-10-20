import mongoose from "mongoose";

export const MAX_CUSTOM_ACTIONS = 300;

const actionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    role: { type: String, enum: ["open", "mid", "end"], required: true },
    label: { type: String, required: true, maxlength: 200 },
    text: { type: String, required: true, maxlength: 2000 },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    // Empty string means "use the app default", so users who never edited get updates automatically.
    template: { type: String, maxlength: 30000, default: "" },
    negative: { type: String, maxlength: 5000, default: "" },
    customActions: { type: [actionSchema], default: [] },
  },
  { timestamps: true }
);

export const Settings = mongoose.model("Settings", schema);

export const publicSettings = (doc) => ({
  template: doc?.template || "",
  negative: doc?.negative || "",
  customActions: doc?.customActions || [],
});
