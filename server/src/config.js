import "dotenv/config";

const env = process.env;
const isProd = env.NODE_ENV === "production";

if (isProd && !env.JWT_SECRET) throw new Error("Thiếu biến môi trường JWT_SECRET.");
if (isProd && !env.MONGODB_URI) throw new Error("Thiếu biến môi trường MONGODB_URI.");

export const config = {
  isProd,
  port: Number(env.PORT) || 4000,
  mongoUri: env.MONGODB_URI || "mongodb://127.0.0.1:27017/prompt-studio",
  jwtSecret: env.JWT_SECRET || "dev-only-secret-change-me",
  allowRegister: env.ALLOW_REGISTER !== "false",
  cloudinaryUrl: env.CLOUDINARY_URL || "",
  clientOrigin: env.CLIENT_ORIGIN || "",
  // Proxy hops in front of Express: 1 = Render only, 2 = Vercel rewrite + Render.
  trustProxy: Number(env.TRUST_PROXY) || 1,
};
