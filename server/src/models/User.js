import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 30 },
    passwordHash: { type: String, required: true },
    displayName: { type: String, trim: true, maxlength: 60 },
    // "admin" or the key of a Role (see lib/permissions.js).
    role: { type: String, default: "member", maxlength: 40 },
    // A disabled account cannot log in and its open sessions stop working.
    disabled: { type: Boolean, default: false },
    // Registered by themselves and not yet let in by an admin (also disabled until then).
    pending: { type: Boolean, default: false },
    // Bumped to sign the user out everywhere (disable, password reset by an admin).
    sessionVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
    // Premium tier (lib/tiers.js) until the end of premiumUntil; no date = no end.
    premium: { type: Boolean, default: false },
    premiumUntil: { type: Date, default: null },
    // Up to when they have seen the team's notifications (the bell); newer ones count as unread.
    notifSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

schema.methods.toPublic = function () {
  return { id: this._id.toString(), username: this.username, displayName: this.displayName || this.username, role: this.role || "member" };
};

export const User = mongoose.model("User", schema);
