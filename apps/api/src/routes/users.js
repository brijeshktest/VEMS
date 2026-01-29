import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Role from "../models/Role.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { requireFields } from "../utils/validators.js";

const router = express.Router();

async function validateRoleIds(roleIds = []) {
  if (!roleIds.length) return [];
  const count = await Role.countDocuments({ _id: { $in: roleIds } });
  if (count !== roleIds.length) {
    return null;
  }
  return roleIds;
}

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const users = await User.find().sort({ name: 1 });
  const sanitized = users.map((user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleIds: user.roleIds || []
  }));
  return res.json(sanitized);
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const missing = requireFields(req.body, ["name", "email", "password"]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const roleIds = (req.body.roleIds || []).filter(Boolean);
  const validRoleIds = await validateRoleIds(roleIds);
  if (validRoleIds === null) {
    return res.status(400).json({ error: "One or more roles not found" });
  }
  const passwordHash = await bcrypt.hash(req.body.password, 10);
  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    passwordHash,
    role: req.body.role || "viewer",
    roleIds: validRoleIds
  });
  return res.status(201).json({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleIds: user.roleIds
  });
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  const roleIds = req.body.roleIds ? (req.body.roleIds || []).filter(Boolean) : user.roleIds;
  const validRoleIds = await validateRoleIds(roleIds);
  if (validRoleIds === null) {
    return res.status(400).json({ error: "One or more roles not found" });
  }
  user.name = req.body.name ?? user.name;
  user.email = req.body.email ?? user.email;
  user.role = req.body.role ?? user.role;
  user.roleIds = validRoleIds;
  if (req.body.password) {
    user.passwordHash = await bcrypt.hash(req.body.password, 10);
  }
  await user.save();
  return res.json({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleIds: user.roleIds
  });
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  await user.deleteOne();
  return res.json({ ok: true });
});

export default router;
