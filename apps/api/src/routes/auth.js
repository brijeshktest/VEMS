import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import Company from "../models/Company.js";
import PlatformSettings from "../models/PlatformSettings.js";
import { requireAuth, resolvePermissions, requireNotImpersonating } from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/companyScope.js";
import { validateRequiredEmail, validateOptionalEmail } from "../utils/indianValidators.js";
import { ensureDefaultRoomsForCompany } from "../utils/companySeed.js";
import { ALL_MODULE_KEY_SET } from "../utils/plantModules.js";

const router = express.Router();

async function readPlatformDefaultPlantId() {
  const doc = await PlatformSettings.findOne().sort({ createdAt: 1 }).select("defaultPlantCompanyId").lean();
  return doc?.defaultPlantCompanyId ? String(doc.defaultPlantCompanyId) : null;
}

const DEFAULT_ADMIN_PASSWORD = "Hexa@123";
const DEFAULT_ADMIN_EMAILS = ["admin@shroomagritech.com", "admin@shroomagritechllp.com"];

export function jwtPayloadForUser(user) {
  const roleIds = (user.roleIds || []).map((id) => id.toString());
  const companyId = user.companyId ? user.companyId.toString() : null;
  return {
    id: user._id.toString(),
    role: user.role,
    roleIds,
    email: user.email,
    name: user.name,
    companyId
  };
}

const JWT_SECRET = () => process.env.JWT_SECRET || "change-me";
const IMPERSONATE_TTL = "8h";

function signUserToken(user, expiresIn = IMPERSONATE_TTL) {
  return jwt.sign(jwtPayloadForUser(user), JWT_SECRET(), { expiresIn });
}

export async function ensureDefaultAdminPassword() {
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  await User.updateMany(
    {
      role: "admin",
      email: { $in: DEFAULT_ADMIN_EMAILS }
    },
    { $set: { passwordHash } }
  );
}

router.post("/seed", async (req, res) => {
  const existing = await User.countDocuments();
  if (existing > 0) {
    return res.status(400).json({ error: "Users already exist" });
  }
  const { name, email, password, role, companyName } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }
  const emailCheck = validateRequiredEmail(email);
  if (!emailCheck.ok) {
    return res.status(400).json({ error: emailCheck.message });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const chosenRole = role || "admin";

  if (chosenRole === "super_admin") {
    const user = await User.create({
      name,
      email: emailCheck.value,
      passwordHash,
      role: "super_admin",
      companyId: null,
      roleIds: []
    });
    return res.status(201).json({ id: user._id, email: user.email, role: user.role });
  }

  if (!["admin", "accountant", "viewer"].includes(chosenRole)) {
    return res.status(400).json({ error: "Invalid role for first-time setup" });
  }

  const cname = (companyName && String(companyName).trim()) || "My plant";
  const company = await Company.create({
    name: cname,
    slug: "",
    isActive: true
  });
  await ensureDefaultRoomsForCompany(company._id);

  const user = await User.create({
    name,
    email: emailCheck.value,
    passwordHash,
    role: chosenRole === "admin" ? "admin" : chosenRole,
    companyId: company._id,
    roleIds: []
  });

  return res.status(201).json({
    id: user._id,
    email: user.email,
    role: user.role,
    companyId: company._id.toString()
  });
});

router.get("/seed-status", async (req, res) => {
  const count = await User.countDocuments();
  return res.json({ hasAdmin: count > 0 });
});

router.post("/login", async (req, res) => {
  const { email, password, rememberPassword, rememberMe } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  const emailCheck = validateOptionalEmail(email);
  if (!emailCheck.ok) {
    return res.status(400).json({ error: emailCheck.message });
  }
  const user = await User.findOne({ email: emailCheck.value });
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (user.role !== "super_admin" && user.companyId) {
    const co = await Company.findById(user.companyId).select("isActive").lean();
    if (!co || co.isActive === false) {
      return res.status(403).json({
        error: "This plant has been deactivated. Contact your platform administrator."
      });
    }
  }
  const remember = Boolean(rememberPassword || rememberMe);
  const token = jwt.sign(jwtPayloadForUser(user), JWT_SECRET(), {
    expiresIn: remember ? "30d" : "8h"
  });
  let defaultPlantCompanyId = null;
  if (user.role === "super_admin") {
    defaultPlantCompanyId = await readPlatformDefaultPlantId();
  }
  return res.json({
    token,
    role: user.role,
    roleIds: (user.roleIds || []).map((id) => id.toString()),
    name: user.name,
    companyId: user.companyId ? user.companyId.toString() : null,
    ...(user.role === "super_admin" ? { defaultPlantCompanyId } : {})
  });
});

router.get(
  "/impersonation-candidates/:companyId",
  requireAuth,
  requireNotImpersonating,
  requireSuperAdmin,
  async (req, res) => {
    const cid = String(req.params.companyId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(cid)) {
      return res.status(400).json({ error: "Invalid plant id" });
    }
    const company = await Company.findOne({ _id: cid, isActive: true }).select("_id").lean();
    if (!company) {
      return res.status(404).json({ error: "Plant not found" });
    }
    const users = await User.find({ companyId: cid, role: { $ne: "super_admin" } })
      .select("name email role")
      .sort({ name: 1 })
      .lean();
    return res.json(
      users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role
      }))
    );
  }
);

async function issueImpersonationToken(superAdminUserId, target) {
  const actor = await User.findById(superAdminUserId).select("name email").lean();
  const payload = {
    id: target._id.toString(),
    role: target.role,
    roleIds: (target.roleIds || []).map((id) => id.toString()),
    email: target.email,
    name: target.name,
    companyId: target.companyId.toString(),
    impersonatorId: superAdminUserId,
    impersonatorEmail: actor?.email || "",
    impersonatorName: actor?.name || ""
  };
  const token = jwt.sign(payload, JWT_SECRET(), { expiresIn: IMPERSONATE_TTL });
  return {
    token,
    role: target.role,
    companyId: target.companyId.toString(),
    impersonation: {
      impersonatorEmail: payload.impersonatorEmail,
      impersonatorName: payload.impersonatorName
    }
  };
}

router.post("/impersonate", requireAuth, requireNotImpersonating, async (req, res) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Super Admin only" });
  }
  const userId = req.body?.userId;
  if (!mongoose.Types.ObjectId.isValid(String(userId))) {
    return res.status(400).json({ error: "Invalid userId" });
  }
  const target = await User.findById(userId).select("name email role companyId roleIds").lean();
  if (!target) {
    return res.status(404).json({ error: "User not found" });
  }
  if (target.role === "super_admin") {
    return res.status(400).json({ error: "Cannot impersonate a Super Admin" });
  }
  if (!target.companyId) {
    return res.status(400).json({ error: "User has no plant assignment" });
  }
  const companyOk = await Company.findOne({ _id: target.companyId, isActive: true }).select("_id").lean();
  if (!companyOk) {
    return res.status(400).json({ error: "Plant not found or inactive" });
  }
  const out = await issueImpersonationToken(req.user.id, target);
  return res.json(out);
});

/** Super Admin: impersonate the plant’s first admin user (same ordering as plant network primary admin). */
router.post(
  "/impersonate/plant-primary-admin",
  requireAuth,
  requireNotImpersonating,
  requireSuperAdmin,
  async (req, res) => {
    const cid = String(req.body?.companyId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(cid)) {
      return res.status(400).json({ error: "Invalid plant id" });
    }
    const companyOk = await Company.findOne({ _id: cid, isActive: true }).select("_id").lean();
    if (!companyOk) {
      return res.status(400).json({ error: "Plant not found or inactive" });
    }
    const target = await User.findOne({ companyId: cid, role: "admin" })
      .sort({ createdAt: 1 })
      .select("name email role companyId roleIds")
      .lean();
    if (!target) {
      return res.status(400).json({ error: "No plant administrator found for this plant." });
    }
    if (target.role === "super_admin") {
      return res.status(400).json({ error: "Cannot impersonate a Super Admin" });
    }
    if (!target.companyId) {
      return res.status(400).json({ error: "User has no plant assignment" });
    }
    const out = await issueImpersonationToken(req.user.id, target);
    return res.json(out);
  }
);

router.post("/impersonate/stop", requireAuth, async (req, res) => {
  if (!req.user.impersonatorId) {
    return res.status(400).json({ error: "Not impersonating" });
  }
  const real = await User.findById(req.user.impersonatorId);
  if (!real || real.role !== "super_admin") {
    return res.status(401).json({ error: "Invalid impersonation session" });
  }
  const token = signUserToken(real, "8h");
  return res.json({
    token,
    role: real.role,
    companyId: real.companyId ? real.companyId.toString() : null,
    name: real.name
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  let companies = undefined;
  let defaultPlantCompanyId = undefined;
  if (user.role === "super_admin") {
    companies = await Company.find().sort({ name: 1 }).select("name slug isActive").lean();
    defaultPlantCompanyId = await readPlatformDefaultPlantId();
  }
  const impersonation = req.user.impersonatorId
    ? {
        impersonatorId: req.user.impersonatorId,
        impersonatorEmail: String(req.user.impersonatorEmail || ""),
        impersonatorName: String(req.user.impersonatorName || "")
      }
    : undefined;
  let superAdminSelf = undefined;
  if (req.user.impersonatorId && mongoose.Types.ObjectId.isValid(String(req.user.impersonatorId))) {
    const sa = await User.findById(req.user.impersonatorId).select("name email role").lean();
    if (sa?.role === "super_admin") {
      superAdminSelf = {
        name: String(sa.name || "").trim(),
        email: String(sa.email || "").trim()
      };
    }
  }
  return res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleIds: user.roleIds || [],
      companyId: user.companyId || null
    },
    ...(companies ? { companies, defaultPlantCompanyId } : {}),
    ...(impersonation ? { impersonation } : {}),
    ...(superAdminSelf ? { superAdminSelf } : {})
  });
});

router.patch("/profile", requireAuth, async (req, res) => {
  const body = req.body || {};
  if ("email" in body) {
    return res.status(400).json({ error: "Email cannot be changed." });
  }
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  let changed = false;
  if (body.name !== undefined && body.name !== null) {
    const n = String(body.name).trim();
    if (!n) {
      return res.status(400).json({ error: "Name cannot be empty" });
    }
    if (n !== user.name) {
      user.name = n;
      changed = true;
    }
  }

  const newPwd = body.newPassword != null ? String(body.newPassword).trim() : "";
  if (newPwd.length > 0) {
    if (newPwd.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    const current = body.currentPassword != null ? String(body.currentPassword) : "";
    if (!current) {
      return res.status(400).json({ error: "Current password is required to set a new password" });
    }
    const ok = await bcrypt.compare(current, user.passwordHash);
    if (!ok) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    user.passwordHash = await bcrypt.hash(newPwd, 10);
    changed = true;
  }

  if (!changed) {
    return res.status(400).json({ error: "No changes to save" });
  }

  await user.save();
  const token = signUserToken(user, "8h");
  return res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleIds: user.roleIds || [],
      companyId: user.companyId || null
    }
  });
});

/** While impersonating: update the real Super Admin account (name / password) and re-issue the impersonation JWT. */
router.patch("/profile/super", requireAuth, async (req, res) => {
  if (!req.user.impersonatorId) {
    return res.status(400).json({ error: "This action is only available when signed in as Super Admin via impersonation." });
  }
  const body = req.body || {};
  if ("email" in body) {
    return res.status(400).json({ error: "Email cannot be changed." });
  }
  const superDoc = await User.findById(req.user.impersonatorId);
  if (!superDoc || superDoc.role !== "super_admin") {
    return res.status(403).json({ error: "Invalid Super Admin session." });
  }
  const targetLean = await User.findById(req.user.id).select("name email role companyId roleIds").lean();
  if (!targetLean || !targetLean.companyId) {
    return res.status(400).json({ error: "Invalid impersonated user." });
  }

  let changed = false;
  if (body.name !== undefined && body.name !== null) {
    const n = String(body.name).trim();
    if (!n) {
      return res.status(400).json({ error: "Name cannot be empty" });
    }
    if (n !== superDoc.name) {
      superDoc.name = n;
      changed = true;
    }
  }

  const newPwd = body.newPassword != null ? String(body.newPassword).trim() : "";
  if (newPwd.length > 0) {
    if (newPwd.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    const current = body.currentPassword != null ? String(body.currentPassword) : "";
    if (!current) {
      return res.status(400).json({ error: "Current password is required to set a new one" });
    }
    const ok = await bcrypt.compare(current, superDoc.passwordHash);
    if (!ok) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    superDoc.passwordHash = await bcrypt.hash(newPwd, 10);
    changed = true;
  }

  if (!changed) {
    return res.status(400).json({ error: "No changes to save" });
  }

  await superDoc.save();
  const out = await issueImpersonationToken(superDoc._id.toString(), targetLean);
  return res.json({
    token: out.token,
    user: {
      id: targetLean._id,
      name: targetLean.name,
      email: targetLean.email,
      role: targetLean.role,
      roleIds: (targetLean.roleIds || []).map((id) => id.toString()),
      companyId: targetLean.companyId ? targetLean.companyId.toString() : null
    },
    impersonation: out.impersonation
  });
});

function filterPermissionsByPlantModules(permissions, keySet) {
  if (!keySet || keySet.size === 0) return permissions;
  const out = {};
  for (const [k, v] of Object.entries(permissions)) {
    if (keySet.has(k)) out[k] = v;
  }
  return out;
}

async function resolvePlantModuleKeys(req) {
  let companyId = null;
  if (req.user.impersonatorId) {
    const u = await User.findById(req.user.id).select("companyId").lean();
    companyId = u?.companyId ? String(u.companyId) : null;
  } else if (req.user.role === "super_admin") {
    const raw = req.headers["x-company-id"] || req.headers["X-Company-Id"];
    const headerId = raw != null ? String(raw).trim() : "";
    if (mongoose.Types.ObjectId.isValid(headerId)) {
      companyId = headerId;
    }
  } else if (req.user.companyId) {
    companyId = String(req.user.companyId);
  }
  if (!companyId) {
    return null;
  }
  const c = await Company.findById(companyId).select("enabledModules").lean();
  if (!c?.enabledModules?.length) {
    return null;
  }
  return c.enabledModules.map((k) => String(k)).filter((k) => ALL_MODULE_KEY_SET.has(k));
}

router.get("/permissions", requireAuth, async (req, res) => {
  const plantModuleKeys = await resolvePlantModuleKeys(req);
  const keySet = plantModuleKeys?.length ? new Set(plantModuleKeys) : null;

  if (req.user.role === "admin" || req.user.role === "super_admin") {
    return res.json({ permissions: "all", plantModuleKeys: plantModuleKeys || null });
  }
  const companyId = req.user.companyId;
  const permissions = await resolvePermissions(req.user.roleIds || [], companyId);
  const filtered = keySet ? filterPermissionsByPlantModules(permissions, keySet) : permissions;
  return res.json({ permissions: filtered, plantModuleKeys: plantModuleKeys || null });
});

export default router;
