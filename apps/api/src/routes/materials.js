import express from "express";
import Material from "../models/Material.js";
import Vendor from "../models/Vendor.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireFields } from "../utils/validators.js";

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

router.get("/", requireAuth, async (req, res) => {
  const materials = await Material.find().sort({ name: 1 });
  return res.json(materials);
});

router.get("/:id", requireAuth, async (req, res) => {
  const material = await Material.findById(req.params.id);
  if (!material) {
    return res.status(404).json({ error: "Material not found" });
  }
  return res.json(material);
});

router.post("/", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
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
    vendorIds
  });
  await syncMaterialVendors(material._id, vendorIds);
  return res.status(201).json(material);
});

router.put("/:id", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
  const material = await Material.findById(req.params.id);
  if (!material) {
    return res.status(404).json({ error: "Material not found" });
  }
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
  material.vendorIds = vendorIds;
  await material.save();
  await syncMaterialVendors(material._id, vendorIds);
  return res.json(material);
});

router.delete("/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
  const material = await Material.findById(req.params.id);
  if (!material) {
    return res.status(404).json({ error: "Material not found" });
  }
  await material.deleteOne();
  await Vendor.updateMany(
    { materialsSupplied: material._id },
    { $pull: { materialsSupplied: material._id } }
  );
  return res.json({ ok: true });
});

export default router;
