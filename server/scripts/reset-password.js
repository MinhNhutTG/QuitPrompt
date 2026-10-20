// Đặt lại mật khẩu khi người dùng quên (chưa có email để lấy lại).
// Cách dùng: npm run reset-password -- <tên đăng nhập> <mật khẩu mới>
import { config } from "../src/config.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../src/models/User.js";

const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 6) {
  console.error("Cách dùng: npm run reset-password -- <tên đăng nhập> <mật khẩu mới, ít nhất 6 ký tự>");
  process.exit(1);
}

await mongoose.connect(config.mongoUri);
const user = await User.findOne({ username: username.toLowerCase() });
if (!user) {
  console.error(`Không có tài khoản "${username}".`);
  process.exitCode = 1;
} else {
  user.passwordHash = await bcrypt.hash(password, 10);
  await user.save();
  console.log(`Đã đặt lại mật khẩu cho "${user.username}".`);
}
await mongoose.disconnect();
