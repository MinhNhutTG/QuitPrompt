import mongoose from "mongoose";

// A named set of permissions. The admin role is not stored here: it always has every permission.
const schema = new mongoose.Schema(
  {
    // What users.role holds; never changes after creation, so renaming a role keeps its members.
    key: { type: String, required: true, unique: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const Role = mongoose.model("Role", schema);
