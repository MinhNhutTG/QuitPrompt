import mongoose from "mongoose";

mongoose.set("strictQuery", true);

// Keeps retrying so the web server can boot (and answer /api/health) before Atlas is reachable.
export async function connectDb(uri) {
  for (;;) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
      console.log("MongoDB: đã kết nối");
      return;
    } catch (err) {
      console.error("MongoDB: kết nối thất bại, thử lại sau 5 giây.", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

export const dbUp = () => mongoose.connection.readyState === 1;
