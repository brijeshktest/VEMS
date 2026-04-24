import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Role from "../models/Role.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "change-me");
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/** Blocks nested actions while a Super Admin is using an impersonation session. */
export function requireNotImpersonating(req, res, next) {
  if (req.user?.impersonatorId) {
    return res.status(403).json({ error: "This action is not available while impersonating." });
  }
  return next();
}

export function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}

/** Plant admin or Super Admin with active tenant (req.companyId). */
export function isTenantAdmin(req) {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;
  if (req.user.role === "super_admin" && req.companyId) return true;
  return false;
}

function plantAllowsAdministration(req) {
  const keys = req.enabledModuleKeys;
  if (!keys || typeof keys.has !== "function") return true;
  return ["admin", "roles", "users"].some((k) => keys.has(k));
}

export function requireAdmin(req, res, next) {
  if (!isTenantAdmin(req)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  if (!plantAllowsAdministration(req)) {
    return res.status(403).json({ error: "Administration is not enabled for this plant" });
  }
  return next();
}

export async function resolvePermissions(roleIds = [], companyId) {
  if (!companyId || !mongoose.Types.ObjectId.isValid(String(companyId))) {
    return {};
  }
  if (!roleIds.length) return {};
  const roles = await Role.find({
    _id: { $in: roleIds },
    companyId
  });
  const merged = {};
  for (const role of roles) {
    for (const [moduleKey, perms] of role.permissions.entries()) {
      merged[moduleKey] = merged[moduleKey] || {
        create: false,
        edit: false,
        view: false,
        delete: false,
        bulkUpload: false,
        bulkDelete: false
      };
      merged[moduleKey].create = merged[moduleKey].create || Boolean(perms.create);
      merged[moduleKey].edit = merged[moduleKey].edit || Boolean(perms.edit);
      merged[moduleKey].view = merged[moduleKey].view || Boolean(perms.view);
      merged[moduleKey].delete = merged[moduleKey].delete || Boolean(perms.delete);
      merged[moduleKey].bulkUpload = merged[moduleKey].bulkUpload || Boolean(perms.bulkUpload);
      merged[moduleKey].bulkDelete = merged[moduleKey].bulkDelete || Boolean(perms.bulkDelete);
    }
  }
  return merged;
}

export async function requireVoucherBulkUpload(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  if (isTenantAdmin(req)) {
    if (req.enabledModuleKeys && !req.enabledModuleKeys.has("vouchers")) {
      return res.status(403).json({ error: "This module is not enabled for this plant" });
    }
    return next();
  }
  const permissions = await resolvePermissions(req.user.roleIds || [], req.companyId);
  if (req.enabledModuleKeys && !req.enabledModuleKeys.has("vouchers")) {
    return res.status(403).json({ error: "This module is not enabled for this plant" });
  }
  if (permissions.vouchers?.bulkUpload) {
    return next();
  }
  return res.status(403).json({ error: "Bulk upload permission required" });
}

export async function requireContributionsBulkUpload(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  if (isTenantAdmin(req)) {
    if (req.enabledModuleKeys && !req.enabledModuleKeys.has("contributions")) {
      return res.status(403).json({ error: "This module is not enabled for this plant" });
    }
    return next();
  }
  const permissions = await resolvePermissions(req.user.roleIds || [], req.companyId);
  if (req.enabledModuleKeys && !req.enabledModuleKeys.has("contributions")) {
    return res.status(403).json({ error: "This module is not enabled for this plant" });
  }
  if (permissions.contributions?.bulkUpload) {
    return next();
  }
  return res.status(403).json({ error: "Contribution bulk upload permission required" });
}

export async function requireVendorBulkUpload(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  if (isTenantAdmin(req)) {
    if (req.enabledModuleKeys && !req.enabledModuleKeys.has("vendors")) {
      return res.status(403).json({ error: "This module is not enabled for this plant" });
    }
    return next();
  }
  const permissions = await resolvePermissions(req.user.roleIds || [], req.companyId);
  if (req.enabledModuleKeys && !req.enabledModuleKeys.has("vendors")) {
    return res.status(403).json({ error: "This module is not enabled for this plant" });
  }
  if (permissions.vendors?.bulkUpload) {
    return next();
  }
  return res.status(403).json({ error: "Vendor bulk upload permission required" });
}

export async function requireMaterialBulkUpload(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  if (isTenantAdmin(req)) {
    if (req.enabledModuleKeys && !req.enabledModuleKeys.has("materials")) {
      return res.status(403).json({ error: "This module is not enabled for this plant" });
    }
    return next();
  }
  const permissions = await resolvePermissions(req.user.roleIds || [], req.companyId);
  if (req.enabledModuleKeys && !req.enabledModuleKeys.has("materials")) {
    return res.status(403).json({ error: "This module is not enabled for this plant" });
  }
  if (permissions.materials?.bulkUpload) {
    return next();
  }
  return res.status(403).json({ error: "Material bulk upload permission required" });
}

export async function requireVoucherBulkDelete(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  if (isTenantAdmin(req)) {
    if (req.enabledModuleKeys && !req.enabledModuleKeys.has("vouchers")) {
      return res.status(403).json({ error: "This module is not enabled for this plant" });
    }
    return next();
  }
  const permissions = await resolvePermissions(req.user.roleIds || [], req.companyId);
  if (req.enabledModuleKeys && !req.enabledModuleKeys.has("vouchers")) {
    return res.status(403).json({ error: "This module is not enabled for this plant" });
  }
  if (permissions.vouchers?.bulkDelete) {
    return next();
  }
  return res.status(403).json({ error: "Bulk delete permission required" });
}

export async function requireVendorBulkDelete(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  if (isTenantAdmin(req)) {
    if (req.enabledModuleKeys && !req.enabledModuleKeys.has("vendors")) {
      return res.status(403).json({ error: "This module is not enabled for this plant" });
    }
    return next();
  }
  const permissions = await resolvePermissions(req.user.roleIds || [], req.companyId);
  if (req.enabledModuleKeys && !req.enabledModuleKeys.has("vendors")) {
    return res.status(403).json({ error: "This module is not enabled for this plant" });
  }
  if (permissions.vendors?.bulkDelete) {
    return next();
  }
  return res.status(403).json({ error: "Vendor bulk delete permission required" });
}

export async function requireMaterialBulkDelete(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  if (isTenantAdmin(req)) {
    if (req.enabledModuleKeys && !req.enabledModuleKeys.has("materials")) {
      return res.status(403).json({ error: "This module is not enabled for this plant" });
    }
    return next();
  }
  const permissions = await resolvePermissions(req.user.roleIds || [], req.companyId);
  if (req.enabledModuleKeys && !req.enabledModuleKeys.has("materials")) {
    return res.status(403).json({ error: "This module is not enabled for this plant" });
  }
  if (permissions.materials?.bulkDelete) {
    return next();
  }
  return res.status(403).json({ error: "Material bulk delete permission required" });
}

export async function requireContributionsBulkDelete(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  if (isTenantAdmin(req)) {
    if (req.enabledModuleKeys && !req.enabledModuleKeys.has("contributions")) {
      return res.status(403).json({ error: "This module is not enabled for this plant" });
    }
    return next();
  }
  const permissions = await resolvePermissions(req.user.roleIds || [], req.companyId);
  if (req.enabledModuleKeys && !req.enabledModuleKeys.has("contributions")) {
    return res.status(403).json({ error: "This module is not enabled for this plant" });
  }
  if (permissions.contributions?.bulkDelete) {
    return next();
  }
  return res.status(403).json({ error: "Contribution bulk delete permission required" });
}

export function requirePermission(moduleKey, action) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Missing auth token" });
    }
    if (isTenantAdmin(req)) {
      if (req.enabledModuleKeys && typeof req.enabledModuleKeys.has === "function") {
        if (!req.enabledModuleKeys.has(moduleKey)) {
          return res.status(403).json({ error: "This module is not enabled for this plant" });
        }
      }
      return next();
    }
    if (action === "delete") {
      return res.status(403).json({ error: "Only admins can delete records" });
    }
    const permissions = await resolvePermissions(req.user.roleIds || [], req.companyId);
    if (req.enabledModuleKeys && !req.enabledModuleKeys.has(moduleKey)) {
      return res.status(403).json({ error: "This module is not enabled for this plant" });
    }
    const modulePerms = permissions[moduleKey];
    if (!modulePerms || !modulePerms[action]) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}
