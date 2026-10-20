import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 30 },
    passwordHash: { type: String, required: true },
    displayName: { type: String, trim: true, maxlength: 60 },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

schema.methods.toPublic = function () {
  return { id: this._id.toString(), username: this.username, displayName: this.displayName || this.username };
};

export const User = mongoose.model("User", schema);
