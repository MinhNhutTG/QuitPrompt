import crypto from "node:crypto";
import { config } from "../config.js";

// Secrets kept in the database (API keys) are sealed with AES-256-GCM under a key derived from JWT_SECRET and the
// secret's purpose. Changing JWT_SECRET makes them unreadable: they have to be entered again.
export function sealer(purpose) {
  const KEY = crypto.createHash("sha256").update(`${purpose}:${config.jwtSecret}`).digest();
  return {
    seal(text) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
      const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
      return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
    },
    open(sealed) {
      const [iv, tag, body] = sealed.split(".").map((s) => Buffer.from(s, "base64url"));
      const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(body), d.final()]).toString("utf8");
    },
  };
}
