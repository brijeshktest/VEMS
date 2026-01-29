import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { requireAuth, resolvePermissions } from "../middleware/auth.js";

const router = express.Router();

router.post("/seed", async (req, res) => {
  const existing = await User.countDocuments();
  if (existing > 0) {
    return res.status(400).json({ error: "Users already exist" });
  }
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role: role || "admin",
    roleIds: []
  });
  return res.status(201).json({ id: user._id, email: user.email, role: user.role });
});

router.get("/seed-status", async (req, res) => {
  const count = await User.countDocuments();
  return res.json({ hasAdmin: count > 0 });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const roleIds = (user.roleIds || []).map((id) => id.toString());
  const token = jwt.sign(
    { id: user._id.toString(), role: user.role, roleIds, email: user.email, name: user.name },
    process.env.JWT_SECRET || "change-me",
    { expiresIn: "8h" }
  );
  return res.json({ token, role: user.role, roleIds, name: user.name });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleIds: user.roleIds || []
    }
  });
});

router.get("/permissions", requireAuth, async (req, res) => {
  if (req.user.role === "admin") {
    return res.json({ permissions: "all" });
  }
  const permissions = await resolvePermissions(req.user.roleIds || []);
  return res.json({ permissions });
});

export default router;
