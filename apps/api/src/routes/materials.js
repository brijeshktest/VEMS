import express from "express";
import Material from "../models/Material.js";
import Vendor from "../models/Vendor.js";
import Voucher from "../models/Voucher.js";
import { requireAuth, requirePermission, requireMaterialBulkDelete } from "../middleware/auth.js";
import { requireFields } from "../utils/validators.js";
import { logChange } from "../utils/changeLog.js";

const router = express.Router();

async function syncMaterialVendors(materialId, vendorIds) {
  await Vendor.updateMany(
    { materialsSupplied: materialId },
    { $pull: { materialsSupplied: materialId } }
  );
  if (vendorIds.length) {
    await Vendor.updateMany(
      { _id: { $in: vendorIds } },
      { $addToSet: { materialsSupplied: materialId } }
    );
  }
}

async function deleteMaterialById(user, idStr) {
  const material = await Material.findById(idStr);
  if (!material) {
    return { ok: false, error: "Material not found" };
  }
  const voucherCount = await Voucher.countDocuments({ "items.materialId": material._id });
  if (voucherCount > 0) {
    return { ok: false, error: `Cannot delete: used on ${voucherCount} voucher(s)` };
  }
  const before = material.toObject();
  await material.deleteOne();
  await Vendor.updateMany(
    { materialsSupplied: material._id },
    { $pull: { materialsSupplied: material._id } }
  );
  const mid = String(material._id);
  await logChange({
    entityType: "material",
    entityId: mid,
    action: "delete",
    user,
    before,
    after: null
  });
  return { ok: true };
}

router.get("/", requireAuth, requirePermission("materials", "view"), async (req, res) => {
  const materials = await Material.find().sort({ name: 1 });
  return res.json(materials);
});

router.post("/bulk-delete", requireAuth, requireMaterialBulkDelete, async (req, res) => {
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
    const r = await deleteMaterialById(req.user, idStr);
    results.push({ id: idStr, ok: r.ok, error: r.error });
  }
  const deleted = results.filter((x) => x.ok).length;
  return res.json({ results, deleted, failed: results.length - deleted });
});

router.get("/:id", requireAuth, requirePermission("materials", "view"), async (req, res) => {
  const material = await Material.findById(req.params.id);
  if (!material) {
    return res.status(404).json({ error: "Material not found" });
  }
  return res.json(material);
});

router.post("/", requireAuth, requirePermission("materials", "create"), async (req, res) => {
  const missing = requireFields(req.body, ["name"]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const vendorIds = req.body.vendorIds || [];
  if (vendorIds.length) {
    const vendors = await Vendor.countDocuments({ _id: { $in: vendorIds } });
    if (vendors !== vendorIds.length) {
      return res.status(400).json({ error: "One or more vendors not found" });
    }
  }
  const material = await Material.create({
    name: req.body.name,
    category: req.body.category,
    unit: req.body.unit,
    description: req.body.description,
    vendorIds
  });
  await syncMaterialVendors(material._id, vendorIds);
  await logChange({
    entityType: "material",
    entityId: material._id,
    action: "create",
    user: req.user,
    before: null,
    after: material.toObject()
  });
  return res.status(201).json(material);
});

router.put("/:id", requireAuth, requirePermission("materials", "edit"), async (req, res) => {
  const material = await Material.findById(req.params.id);
  if (!material) {
    return res.status(404).json({ error: "Material not found" });
  }
  const before = material.toObject();
  const vendorIds = req.body.vendorIds ?? material.vendorIds;
  if (vendorIds.length) {
    const vendors = await Vendor.countDocuments({ _id: { $in: vendorIds } });
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
  await syncMaterialVendors(material._id, vendorIds);
  await logChange({
    entityType: "material",
    entityId: material._id,
    action: "update",
    user: req.user,
    before,
    after: material.toObject()
  });
  return res.json(material);
});

router.delete("/:id", requireAuth, requirePermission("materials", "delete"), async (req, res) => {
  const r = await deleteMaterialById(req.user, req.params.id);
  if (!r.ok) {
    return res.status(r.error === "Material not found" ? 404 : 400).json({ error: r.error });
  }
  return res.json({ ok: true });
});

export default router;
