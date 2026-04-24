import mongoose from "mongoose";
import Company from "../models/Company.js";
import User from "../models/User.js";
import { normalizeEnabledModules } from "../utils/plantModules.js";

export async function requireTenantContext(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const user = await User.findById(req.user.id).select("role companyId").lean();
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    if (user.role === "super_admin") {
      const raw = req.headers["x-company-id"] || req.headers["X-Company-Id"];
      const headerId = raw != null ? String(raw).trim() : "";
      if (!headerId || !mongoose.Types.ObjectId.isValid(headerId)) {
        return res.status(400).json({
          error: "X-Company-Id header is required for this operation when using a Super Admin account."
        });
      }
      const company = await Company.findOne({ _id: headerId, isActive: true }).select("_id enabledModules").lean();
      if (!company) {
        return res.status(404).json({ error: "Plant not found or inactive" });
      }
      req.companyId = company._id;
      req.enabledModuleKeys = normalizeEnabledModules(company.enabledModules);
      return next();
    }
    if (!user.companyId) {
      return res.status(403).json({ error: "User is not assigned to a plant" });
    }
    const co = await Company.findOne({ _id: user.companyId, isActive: true }).select("_id enabledModules").lean();
    if (!co) {
      return res.status(403).json({ error: "Plant not found or inactive" });
    }
    req.companyId = user.companyId;
    req.enabledModuleKeys = normalizeEnabledModules(co.enabledModules);
    return next();
  } catch (e) {
    return next(e);
  }
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Super Admin access required" });
  }
  return next();
}
