import express from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Company from "../models/Company.js";
import PlatformSettings from "../models/PlatformSettings.js";
import User from "../models/User.js";
import Voucher from "../models/Voucher.js";
import GrowingRoom from "../models/GrowingRoom.js";
import GrowingRoomCycle from "../models/GrowingRoomCycle.js";
import Sale from "../models/Sale.js";
import AppSettings from "../models/AppSettings.js";
import { requireAuth } from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/companyScope.js";
import { requireFields } from "../utils/validators.js";
import { validateRequiredEmail } from "../utils/indianValidators.js";
import { ensureDefaultRoomsForCompany } from "../utils/companySeed.js";
import { validateBundleListOr400 } from "../utils/plantModules.js";
import { purgeCompanyAndAllData } from "../utils/deleteCompanyData.js";

const router = express.Router();

/** URL-safe slug from plant name (lowercase, hyphens). */
function slugBaseFromName(name) {
  let s = String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
  if (!s) s = "plant";
  if (s.length > 60) s = s.slice(0, 60).replace(/-+$/g, "") || "plant";
  return s;
}

/** Unique slug for a company; `excludeCompanyId` keeps the current plant’s slug when regenerating from its name. */
async function generateUniqueCompanySlug(name, excludeCompanyId = null) {
  const base = slugBaseFromName(name);
  const excludeStr = excludeCompanyId != null ? String(excludeCompanyId) : null;
  let suffix = 0;
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix}`;
    const found = await Company.findOne({ slug: candidate }).select("_id").lean();
    if (!found) return candidate;
    if (excludeStr && String(found._id) === excludeStr) return candidate;
    suffix += 1;
  }
  return `${base}-${mongoose.Types.ObjectId().toString().slice(-8)}`;
}

router.get("/", requireAuth, requireSuperAdmin, async (_req, res) => {
  const list = await Company.find().sort({ name: 1 }).select("name slug isActive notes enabledModules").lean();
  return res.json(list);
});

/** Cross-plant snapshot for Super Admin. Keep before GET /:id if added later. */
router.get("/plant-activity", requireAuth, requireSuperAdmin, async (_req, res) => {
  const companies = await Company.find().sort({ name: 1 }).lean();
  const platformLean = await PlatformSettings.findOne().sort({ createdAt: 1 }).select("defaultPlantCompanyId").lean();
  const defaultPlantCompanyId = platformLean?.defaultPlantCompanyId
    ? String(platformLean.defaultPlantCompanyId)
    : null;
  const rows = await Promise.all(
    companies.map(async (c) => {
      const id = c._id;
      const [
        vouchers,
        roomResources,
        tunnelResources,
        bunkerResources,
        activeGrowingCycles,
        sales,
        usersCount,
        settingsLean,
        primaryAdminLean
      ] = await Promise.all([
        Voucher.countDocuments({ companyId: id }),
        GrowingRoom.countDocuments({ companyId: id, resourceType: "Room" }),
        GrowingRoom.countDocuments({ companyId: id, resourceType: "Tunnel" }),
        GrowingRoom.countDocuments({ companyId: id, resourceType: "Bunker" }),
        GrowingRoomCycle.countDocuments({ companyId: id, status: "active" }),
        Sale.countDocuments({ companyId: id }),
        User.countDocuments({ companyId: id }),
        AppSettings.findOne({ companyId: id }).select("logoStoredName updatedAt").lean(),
        User.findOne({ companyId: id, role: "admin" }).sort({ createdAt: 1 }).select("name email").lean()
      ]);
      const hasPlantLogo = Boolean(settingsLean?.logoStoredName);
      const plantLogoUpdatedAt =
        hasPlantLogo && settingsLean.updatedAt ? new Date(settingsLean.updatedAt).getTime() : null;
      return {
        id: String(id),
        name: c.name,
        slug: c.slug || "",
        isActive: c.isActive !== false,
        enabledModules: Array.isArray(c.enabledModules) ? c.enabledModules : [],
        hasPlantLogo,
        plantLogoUpdatedAt,
        primaryAdmin: primaryAdminLean
          ? { name: String(primaryAdminLean.name || "").trim(), email: String(primaryAdminLean.email || "").trim() }
          : null,
        activity: {
          vouchers,
          /** GrowingRoom rows with resourceType "Room". */
          roomResources,
          /** GrowingRoom rows with resourceType "Tunnel". */
          tunnelResources,
          /** GrowingRoom rows with resourceType "Bunker". */
          bunkerResources,
          activeGrowingCycles,
          sales,
          usersCount
        }
      };
    })
  );
  return res.json({ plants: rows, totalPlants: companies.length, defaultPlantCompanyId });
});

router.post("/", requireAuth, requireSuperAdmin, async (req, res) => {
  const missing = requireFields(req.body, ["name", "moduleBundles", "admin"]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const adminBody = req.body.admin && typeof req.body.admin === "object" ? req.body.admin : {};
  const missingAdmin = requireFields(adminBody, ["name", "email", "password"]);
  if (missingAdmin.length) {
    return res.status(400).json({ error: `Administrator fields required: ${missingAdmin.join(", ")}` });
  }
  const name = String(req.body.name).trim();
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }
  const bundleCheck = validateBundleListOr400(req.body.moduleBundles);
  if (!bundleCheck.ok) {
    return res.status(400).json({ error: bundleCheck.error });
  }
  const enabledModules = bundleCheck.keys;
  const emailCheck = validateRequiredEmail(adminBody.email);
  if (!emailCheck.ok) {
    return res.status(400).json({ error: emailCheck.message });
  }
  const dup = await User.findOne({ email: emailCheck.value }).select("_id").lean();
  if (dup) {
    return res.status(400).json({ error: "Administrator email is already registered" });
  }
  const pwd = String(adminBody.password);
  if (pwd.length < 8) {
    return res.status(400).json({ error: "Administrator password must be at least 8 characters" });
  }
  const adminName = String(adminBody.name).trim();
  if (!adminName) {
    return res.status(400).json({ error: "Administrator name is required" });
  }

  let company;
  try {
    const slug = await generateUniqueCompanySlug(name, null);
    company = await Company.create({
      name,
      slug,
      isActive: true,
      enabledModules
    });
    await ensureDefaultRoomsForCompany(company._id);
    const passwordHash = await bcrypt.hash(pwd, 10);
    await User.create({
      name: adminName,
      email: emailCheck.value,
      passwordHash,
      role: "admin",
      companyId: company._id,
      roleIds: []
    });
  } catch (e) {
    if (company?._id) {
      try {
        await purgeCompanyAndAllData(company._id);
      } catch {
        /* ignore */
      }
    }
    const msg = e?.message || "Could not create plant";
    return res.status(400).json({ error: msg });
  }

  return res.status(201).json({
    id: company._id.toString(),
    name: company.name,
    slug: company.slug,
    enabledModules: company.enabledModules
  });
});

router.delete("/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid plant id" });
  }
  const cid = new mongoose.Types.ObjectId(req.params.id);
  const company = await Company.findById(cid).select("_id name").lean();
  if (!company) {
    return res.status(404).json({ error: "Plant not found" });
  }
  try {
    await purgeCompanyAndAllData(cid);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to delete plant data" });
  }
  return res.json({ ok: true, deletedId: String(cid) });
});

router.patch("/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid plant id" });
  }
  const company = await Company.findById(req.params.id);
  if (!company) {
    return res.status(404).json({ error: "Plant not found" });
  }
  if (!String(company.slug || "").trim()) {
    company.slug = await generateUniqueCompanySlug(company.name || "plant", company._id);
  }
  if (req.body.name != null) {
    const n = String(req.body.name).trim();
    if (!n) {
      return res.status(400).json({ error: "name cannot be empty" });
    }
    company.name = n;
    company.slug = await generateUniqueCompanySlug(n, company._id);
  }
  if (req.body.isActive !== undefined) {
    company.isActive = Boolean(req.body.isActive);
  }
  if (req.body.notes !== undefined) {
    company.notes = String(req.body.notes || "").trim();
  }
  if (req.body.moduleBundles != null) {
    const bundleCheck = validateBundleListOr400(req.body.moduleBundles);
    if (!bundleCheck.ok) {
      return res.status(400).json({ error: bundleCheck.error });
    }
    company.enabledModules = bundleCheck.keys;
  }

  const adminPatch = req.body.admin && typeof req.body.admin === "object" ? req.body.admin : null;
  if (adminPatch) {
    const emailTrim = adminPatch.email != null ? String(adminPatch.email).trim() : "";
    const nameTrim = adminPatch.name != null ? String(adminPatch.name).trim() : "";
    const pwdRaw = adminPatch.password != null ? String(adminPatch.password) : "";
    const pwdTrim = pwdRaw.trim();
    if (emailTrim || nameTrim || pwdTrim) {
      if (!emailTrim) {
        return res.status(400).json({ error: "Administrator email is required" });
      }
      if (!nameTrim) {
        return res.status(400).json({ error: "Administrator name is required" });
      }
      const emailCheck = validateRequiredEmail(emailTrim);
      if (!emailCheck.ok) {
        return res.status(400).json({ error: emailCheck.message });
      }
      const adminUser = await User.findOne({ companyId: company._id, role: "admin" }).sort({ createdAt: 1 }).exec();
      if (!adminUser) {
        return res.status(400).json({
          error:
            "No plant administrator (role admin) found for this plant. Create one with POST /companies/:id/admins first."
        });
      }
      const dup = await User.findOne({ email: emailCheck.value, _id: { $ne: adminUser._id } }).select("_id").lean();
      if (dup) {
        return res.status(400).json({ error: "Administrator email is already in use by another account" });
      }
      adminUser.name = nameTrim;
      adminUser.email = emailCheck.value;
      if (pwdTrim) {
        if (pwdTrim.length < 8) {
          return res.status(400).json({ error: "Administrator password must be at least 8 characters" });
        }
        adminUser.passwordHash = await bcrypt.hash(pwdTrim, 10);
      }
      await adminUser.save();
    }
  }

  await company.save();
  return res.json({
    id: company._id,
    name: company.name,
    slug: company.slug,
    isActive: company.isActive,
    notes: company.notes,
    enabledModules: company.enabledModules || []
  });
});

router.post("/:id/admins", requireAuth, requireSuperAdmin, async (req, res) => {
  const missing = requireFields(req.body, ["name", "email", "password"]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const company = await Company.findOne({ _id: req.params.id, isActive: true });
  if (!company) {
    return res.status(404).json({ error: "Plant not found" });
  }
  const emailCheck = validateRequiredEmail(req.body.email);
  if (!emailCheck.ok) {
    return res.status(400).json({ error: emailCheck.message });
  }
  const dup = await User.findOne({ email: emailCheck.value }).select("_id").lean();
  if (dup) {
    return res.status(400).json({ error: "Email is already registered" });
  }
  const pwd = String(req.body.password);
  if (pwd.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const passwordHash = await bcrypt.hash(pwd, 10);
  const user = await User.create({
    name: String(req.body.name).trim(),
    email: emailCheck.value,
    passwordHash,
    role: "admin",
    companyId: company._id,
    roleIds: []
  });
  return res.status(201).json({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyId: user.companyId
  });
});

export default router;
