import mongoose from "mongoose";

// The one computer that Quản trị → Máy tính can shut down from anywhere (tài liệu 15). A small program on it
// (tools/pc-agent) keeps asking the server for a command with its token; only the token's hash is kept here.
const commandSchema = new mongoose.Schema(
  {
    id: String,
    kind: { type: String, enum: ["shutdown", "cancel"] },
    delaySec: Number,
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    at: Date,
    // When the computer picked it up; an unsent command older than COMMAND_TTL is dropped.
    sentAt: Date,
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    name: { type: String, default: "", maxlength: 80 },
    pairedAt: { type: Date, default: Date.now },
    pairedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastSeenAt: { type: Date, default: null },
    command: { type: commandSchema, default: null },
    // What the computer answered last: { id, kind, ok, message, at }.
    result: { type: { id: String, kind: String, ok: Boolean, message: String, at: Date, _id: false }, default: null },
    // Set once the computer confirmed a shutdown: when Windows will turn it off.
    shutdownAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const PcAgent = mongoose.model("PcAgent", schema);
