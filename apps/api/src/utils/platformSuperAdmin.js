import bcrypt from "bcryptjs";
import User from "../models/User.js";

const DEFAULT_EMAIL = "superadmin@shroomagritech.com";
const DEFAULT_PASSWORD = "password";

/**
 * Ensures the platform Super Admin exists.
 * Override with SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD.
 * Set RESET_SUPERADMIN_PASSWORD=1 to re-hash the configured password on boot.
 */
export async function ensurePlatformSuperAdmin() {
  const email = String(process.env.SUPERADMIN_EMAIL || DEFAULT_EMAIL)
    .toLowerCase()
    .trim();
  const password = String(process.env.SUPERADMIN_PASSWORD || DEFAULT_PASSWORD);
  const passwordHash = await bcrypt.hash(password, 10);

  let user = await User.findOne({ email });
  if (!user) {
    await User.create({
      name: "Platform Super Admin",
      email,
      passwordHash,
      role: "super_admin",
      companyId: null,
      roleIds: []
    });
    return;
  }
  user.role = "super_admin";
  user.companyId = null;
  if (user.name === "Shroom Agritech Super Admin") {
    user.name = "Platform Super Admin";
  }
  if (process.env.RESET_SUPERADMIN_PASSWORD === "1") {
    user.passwordHash = passwordHash;
  }
  await user.save();
}
