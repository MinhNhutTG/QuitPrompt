// Cấp quyền quản trị cho một tài khoản (dùng lần đầu, khi chưa có admin nào).
// Cách dùng: npm run make-admin -- <tên đăng nhập>
import { config } from "../src/config.js";
import mongoose from "mongoose";
import { User } from "../src/models/User.js";

const [username] = process.argv.slice(2);
if (!username) {
  console.error("Cách dùng: npm run make-admin -- <tên đăng nhập>");
  process.exit(1);
}

await mongoose.connect(config.mongoUri);
const user = await User.findOneAndUpdate({ username: username.toLowerCase() }, { $set: { role: "admin", disabled: false } }, { new: true });
if (!user) {
  console.error(`Không có tài khoản "${username}".`);
  process.exitCode = 1;
} else {
  console.log(`"${user.username}" giờ là quản trị viên.`);
}
await mongoose.disconnect();
