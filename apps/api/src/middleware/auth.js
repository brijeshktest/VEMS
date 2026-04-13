import jwt from "jsonwebtoken";
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

export function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  return next();
}

export async function resolvePermissions(roleIds = []) {
  if (!roleIds.length) return {};
  const roles = await Role.find({ _id: { $in: roleIds } });
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
  if (req.user.role === "admin") {
    return next();
  }
  const permissions = await resolvePermissions(req.user.roleIds || []);
  if (permissions.vouchers?.bulkUpload) {
    return next();
  }
  return res.status(403).json({ error: "Bulk upload permission required" });
}

export async function requireVoucherBulkDelete(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  if (req.user.role === "admin") {
    return next();
  }
  const permissions = await resolvePermissions(req.user.roleIds || []);
  if (permissions.vouchers?.bulkDelete) {
    return next();
  }
  return res.status(403).json({ error: "Bulk delete permission required" });
}

export async function requireVendorBulkDelete(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  if (req.user.role === "admin") {
    return next();
  }
  const permissions = await resolvePermissions(req.user.roleIds || []);
  if (permissions.vendors?.bulkDelete) {
    return next();
  }
  return res.status(403).json({ error: "Vendor bulk delete permission required" });
}

export async function requireMaterialBulkDelete(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  if (req.user.role === "admin") {
    return next();
  }
  const permissions = await resolvePermissions(req.user.roleIds || []);
  if (permissions.materials?.bulkDelete) {
    return next();
  }
  return res.status(403).json({ error: "Material bulk delete permission required" });
}

export function requirePermission(moduleKey, action) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Missing auth token" });
    }
    if (req.user.role === "admin") {
      return next();
    }
    if (action === "delete") {
      return res.status(403).json({ error: "Only admins can delete records" });
    }
    const permissions = await resolvePermissions(req.user.roleIds || []);
    const modulePerms = permissions[moduleKey];
    if (!modulePerms || !modulePerms[action]) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}
