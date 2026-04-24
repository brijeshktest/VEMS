import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Role from "../models/Role.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { requireTenantContext } from "../middleware/companyScope.js";
import { requireFields } from "../utils/validators.js";
import { validateRequiredEmail } from "../utils/indianValidators.js";

const router = express.Router();

async function validateRoleIds(roleIds = [], companyId) {
  if (!roleIds.length) return [];
  const count = await Role.countDocuments({ _id: { $in: roleIds }, companyId });
  if (count !== roleIds.length) {
    return null;
  }
  return roleIds;
}

router.get("/", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const users = await User.find({ companyId: req.companyId }).sort({ name: 1 });
  const sanitized = users.map((user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleIds: user.roleIds || []
  }));
  return res.json(sanitized);
});

router.post("/", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const missing = requireFields(req.body, ["name", "email", "password"]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const nextRole = req.body.role || "viewer";
  if (nextRole === "super_admin") {
    return res.status(400).json({ error: "Cannot create Super Admin from plant user management" });
  }
  const roleIds = (req.body.roleIds || []).filter(Boolean);
  const validRoleIds = await validateRoleIds(roleIds, req.companyId);
  if (validRoleIds === null) {
    return res.status(400).json({ error: "One or more roles not found" });
  }
  const emailCheck = validateRequiredEmail(req.body.email);
  if (!emailCheck.ok) {
    return res.status(400).json({ error: emailCheck.message });
  }
  const passwordHash = await bcrypt.hash(req.body.password, 10);
  const user = await User.create({
    name: req.body.name,
    email: emailCheck.value,
    passwordHash,
    role: nextRole,
    companyId: req.companyId,
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

router.put("/:id", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  const nextRole = req.body.role ?? user.role;
  if (nextRole === "super_admin") {
    return res.status(400).json({ error: "Invalid role" });
  }
  const roleIds = req.body.roleIds ? (req.body.roleIds || []).filter(Boolean) : user.roleIds;
  const validRoleIds = await validateRoleIds(roleIds, req.companyId);
  if (validRoleIds === null) {
    return res.status(400).json({ error: "One or more roles not found" });
  }
  user.name = req.body.name ?? user.name;
  if (req.body.email !== undefined) {
    const emailCheck = validateRequiredEmail(req.body.email);
    if (!emailCheck.ok) {
      return res.status(400).json({ error: emailCheck.message });
    }
    user.email = emailCheck.value;
  }
  user.role = nextRole;
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

router.delete("/:id", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  await user.deleteOne();
  return res.json({ ok: true });
});

export default router;
