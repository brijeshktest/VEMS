import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/models/User.js";

const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/vendor_expense";
const adminEmail = process.env.ADMIN_EMAIL || "admin@carlsonfarms.com";
const adminPassword = process.env.ADMIN_PASSWORD || "Bloxham1!";

await mongoose.connect(mongoUrl);
await User.init();

const existing = await User.findOne({ email: adminEmail.toLowerCase() });
if (existing) {
  console.log("Admin user already exists. Skipping.");
  await mongoose.disconnect();
  process.exit(0);
}

const passwordHash = await bcrypt.hash(adminPassword, 10);
await User.create({
  name: "Admin User",
  email: adminEmail,
  passwordHash,
  role: "admin",
  roleIds: []
});

console.log("Admin user created.");
await mongoose.disconnect();
