import express from "express";
import mongoose from "mongoose";
import Material from "../models/Material.js";
import Vendor from "../models/Vendor.js";
import Voucher from "../models/Voucher.js";
import {
  requireAuth,
  requirePermission,
  requireMaterialBulkDelete,
  requireMaterialBulkUpload
} from "../middleware/auth.js";
import { requireTenantContext } from "../middleware/companyScope.js";
import { requireFields } from "../utils/validators.js";
import { logChange } from "../utils/changeLog.js";

const router = express.Router();

function normalizeVendorObjectIds(vendorIds) {
  const raw = Array.isArray(vendorIds) ? vendorIds : [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const s = String(x ?? "").trim();
    if (!s || !mongoose.Types.ObjectId.isValid(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(new mongoose.Types.ObjectId(s));
  }
  return out;
}

async function syncMaterialVendors(req, materialId, vendorIds) {
  const mid =
    materialId instanceof mongoose.Types.ObjectId
      ? materialId
      : new mongoose.Types.ObjectId(String(materialId));
  const vids = normalizeVendorObjectIds(vendorIds);
  await Vendor.updateMany(
    { companyId: req.companyId, materialsSupplied: mid },
    { $pull: { materialsSupplied: mid } }
  );
  if (vids.length) {
    await Vendor.updateMany(
      { companyId: req.companyId, _id: { $in: vids } },
      { $addToSet: { materialsSupplied: mid } }
    );
  }
}

async function deleteMaterialById(req, idStr) {
  const material = await Material.findOne({ _id: idStr, companyId: req.companyId });
  if (!material) {
    return { ok: false, error: "Material not found" };
  }
  const voucherCount = await Voucher.countDocuments({
    companyId: req.companyId,
    "items.materialId": material._id
  });
  if (voucherCount > 0) {
    return { ok: false, error: `Cannot delete: used on ${voucherCount} voucher(s)` };
  }
  const before = material.toObject();
  await material.deleteOne();
  await Vendor.updateMany(
    { companyId: req.companyId, materialsSupplied: material._id },
    { $pull: { materialsSupplied: material._id } }
  );
  const mid = String(material._id);
  await logChange({
    companyId: req.companyId,
    entityType: "material",
    entityId: mid,
    action: "delete",
    user: req.user,
    before,
    after: null
  });
  return { ok: true };
}

router.get("/", requireAuth, requireTenantContext, requirePermission("materials", "view"), async (req, res) => {
  const materials = await Material.find({ companyId: req.companyId }).sort({ name: 1 });
  return res.json(materials);
});

router.post("/bulk-delete", requireAuth, requireTenantContext, requireMaterialBulkDelete, async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }
  if (ids.length > 200) {
    return res.status(400).json({ error: "Maximum 200 materials per bulk delete" });
  }
  const results = [];
  for (const raw of ids) {
    const idStr = String(raw || "").trim();
    if (!idStr) {
      results.push({ id: raw, ok: false, error: "Empty id" });
      continue;
    }
    const r = await deleteMaterialById(req, idStr);
    results.push({ id: idStr, ok: r.ok, error: r.error });
  }
  const deleted = results.filter((x) => x.ok).length;
  return res.json({ results, deleted, failed: results.length - deleted });
});

async function createMaterialDocument(req, body) {
  const missing = requireFields(body, ["name"]);
  if (missing.length) {
    return { ok: false, error: `Missing fields: ${missing.join(", ")}` };
  }
  const vendorIds = normalizeVendorObjectIds(body.vendorIds);
  if (vendorIds.length) {
    const vendors = await Vendor.countDocuments({ companyId: req.companyId, _id: { $in: vendorIds } });
    if (vendors !== vendorIds.length) {
      return { ok: false, error: "One or more vendors not found" };
    }
  }
  try {
    const material = await Material.create({
      companyId: req.companyId,
      name: body.name,
      category: body.category,
      unit: body.unit,
      description: body.description,
      vendorIds
    });
    await syncMaterialVendors(req, material._id, vendorIds);
    const persisted = await Material.findById(material._id).lean();
    await logChange({
      companyId: req.companyId,
      entityType: "material",
      entityId: material._id,
      action: "create",
      user: req.user,
      before: null,
      after: persisted || material.toObject()
    });
    return { ok: true, material: persisted || material.toObject() };
  } catch (e) {
    return { ok: false, error: e.message || "Create failed" };
  }
}

router.post("/bulk", requireAuth, requireTenantContext, requireMaterialBulkUpload, async (req, res) => {
  const materials = req.body?.materials;
  if (!Array.isArray(materials)) {
    return res.status(400).json({ error: "Request body must include materials array" });
  }
  if (materials.length > 400) {
    return res.status(400).json({ error: "Maximum 400 materials per bulk import" });
  }
  if (materials.length === 0) {
    return res.status(400).json({ error: "No materials to import" });
  }
  const results = [];
  for (let i = 0; i < materials.length; i++) {
    const r = await createMaterialDocument(req, materials[i]);
    if (r.ok) {
      results.push({ index: i, ok: true, id: String(r.material._id) });
    } else {
      results.push({ index: i, ok: false, error: r.error });
    }
  }
  const imported = results.filter((x) => x.ok).length;
  return res.status(201).json({
    results,
    imported,
    failed: results.length - imported
  });
});

router.get("/:id", requireAuth, requireTenantContext, requirePermission("materials", "view"), async (req, res) => {
  const material = await Material.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!material) {
    return res.status(404).json({ error: "Material not found" });
  }
  return res.json(material);
});

router.post("/", requireAuth, requireTenantContext, requirePermission("materials", "create"), async (req, res) => {
  const r = await createMaterialDocument(req, req.body);
  if (!r.ok) {
    return res.status(400).json({ error: r.error });
  }
  return res.status(201).json(r.material);
});

router.put("/:id", requireAuth, requireTenantContext, requirePermission("materials", "edit"), async (req, res) => {
  const material = await Material.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!material) {
    return res.status(404).json({ error: "Material not found" });
  }
  const before = material.toObject();
  const vendorIds =
    req.body.vendorIds !== undefined
      ? normalizeVendorObjectIds(req.body.vendorIds)
      : normalizeVendorObjectIds(material.vendorIds);
  if (vendorIds.length) {
    const vendors = await Vendor.countDocuments({ companyId: req.companyId, _id: { $in: vendorIds } });
    if (vendors !== vendorIds.length) {
      return res.status(400).json({ error: "One or more vendors not found" });
    }
  }
  material.name = req.body.name ?? material.name;
  material.category = req.body.category ?? material.category;
  material.unit = req.body.unit ?? material.unit;
  material.description = req.body.description ?? material.description;
  material.vendorIds = vendorIds;
  await material.save();
  await syncMaterialVendors(req, material._id, vendorIds);
  await logChange({
    companyId: req.companyId,
    entityType: "material",
    entityId: material._id,
    action: "update",
    user: req.user,
    before,
    after: material.toObject()
  });
  return res.json(material);
});

router.delete("/:id", requireAuth, requireTenantContext, requirePermission("materials", "delete"), async (req, res) => {
  const r = await deleteMaterialById(req, req.params.id);
  if (!r.ok) {
    return res.status(r.error === "Material not found" ? 404 : 400).json({ error: r.error });
  }
  return res.json({ ok: true });
});

export default router;
