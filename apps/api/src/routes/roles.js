import express from "express";
import Role from "../models/Role.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { requireTenantContext } from "../middleware/companyScope.js";
import { MODULES } from "../utils/permissions.js";
import { requireFields } from "../utils/validators.js";

const router = express.Router();

function normalizePermissions(input = {}) {
  const normalized = {};
  for (const moduleKey of MODULES) {
    const perms = input[moduleKey] || {};
    normalized[moduleKey] = {
      create: Boolean(perms.create),
      edit: Boolean(perms.edit),
      view: Boolean(perms.view),
      delete: Boolean(perms.delete),
      bulkUpload: ["vouchers", "contributions", "vendors", "materials"].includes(moduleKey)
        ? Boolean(perms.bulkUpload)
        : false,
      bulkDelete: ["vouchers", "vendors", "materials", "contributions"].includes(moduleKey)
        ? Boolean(perms.bulkDelete)
        : false
    };
  }
  return normalized;
}

router.get("/", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const roles = await Role.find({ companyId: req.companyId }).sort({ name: 1 });
  return res.json(roles);
});

router.post("/", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const missing = requireFields(req.body, ["name"]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const permissions = normalizePermissions(req.body.permissions || {});
  const role = await Role.create({
    companyId: req.companyId,
    name: req.body.name,
    description: req.body.description,
    permissions
  });
  return res.status(201).json(role);
});

router.put("/:id", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const role = await Role.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!role) {
    return res.status(404).json({ error: "Role not found" });
  }
  role.name = req.body.name ?? role.name;
  role.description = req.body.description ?? role.description;
  role.permissions = normalizePermissions(req.body.permissions || role.permissions || {});
  await role.save();
  return res.json(role);
});

router.delete("/:id", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const role = await Role.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!role) {
    return res.status(404).json({ error: "Role not found" });
  }
  await role.deleteOne();
  return res.json({ ok: true });
});

export default router;
