import express from "express";
import Voucher from "../models/Voucher.js";
import Vendor from "../models/Vendor.js";
import Material from "../models/Material.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { calculateTotals } from "../utils/calc.js";
import { requireFields, ensurePositive } from "../utils/validators.js";

const router = express.Router();

async function validateVendorMaterialMapping(vendorId, items) {
  const materialIds = items.map((item) => item.materialId);
  const materials = await Material.find({ _id: { $in: materialIds } });
  if (materials.length !== materialIds.length) {
    return { ok: false, message: "One or more materials not found" };
  }
  for (const material of materials) {
    if (!material.vendorIds.map((id) => id.toString()).includes(vendorId.toString())) {
      return { ok: false, message: `Material ${material.name} not mapped to vendor` };
    }
  }
  return { ok: true };
}

function normalizeItems(items) {
  return items.map((item) => ({
    materialId: item.materialId,
    quantity: Number(item.quantity),
    pricePerUnit: Number(item.pricePerUnit),
    comment: item.comment || ""
  }));
}

router.get("/", requireAuth, requirePermission("vouchers", "view"), async (req, res) => {
  const vouchers = await Voucher.find().sort({ dateOfPurchase: -1 });
  return res.json(vouchers);
});

router.get("/:id", requireAuth, requirePermission("vouchers", "view"), async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) {
    return res.status(404).json({ error: "Voucher not found" });
  }
  return res.json(voucher);
});

router.post("/", requireAuth, requirePermission("vouchers", "create"), async (req, res) => {
  const missing = requireFields(req.body, ["vendorId", "items", "dateOfPurchase", "paymentMethod", "paymentStatus"]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const vendor = await Vendor.findById(req.body.vendorId);
  if (!vendor) {
    return res.status(400).json({ error: "Vendor not found" });
  }
  if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
    return res.status(400).json({ error: "items must be a non-empty array" });
  }
  const items = normalizeItems(req.body.items);
  for (const item of items) {
    const qty = ensurePositive(item.quantity, "quantity");
    const price = ensurePositive(item.pricePerUnit, "pricePerUnit");
    if (!qty.ok || !price.ok) {
      return res.status(400).json({ error: qty.message || price.message });
    }
  }
  const mapping = await validateVendorMaterialMapping(req.body.vendorId, items);
  if (!mapping.ok) {
    return res.status(400).json({ error: mapping.message });
  }
  const taxPercent = Number(req.body.taxPercent || 0);
  const discountType = req.body.discountType || "none";
  const discountValue = Number(req.body.discountValue || 0);
  const totals = calculateTotals(items, taxPercent, discountType, discountValue);
  const voucher = await Voucher.create({
    vendorId: req.body.vendorId,
    items,
    dateOfPurchase: new Date(req.body.dateOfPurchase),
    subTotal: totals.subTotal,
    taxPercent,
    taxAmount: totals.taxAmount,
    discountType,
    discountValue,
    finalAmount: totals.finalAmount,
    paymentMethod: req.body.paymentMethod,
    paymentStatus: req.body.paymentStatus,
    paymentDate: req.body.paymentDate ? new Date(req.body.paymentDate) : undefined,
    paidByMode: req.body.paidByMode || "",
    paymentComments: req.body.paymentComments || "",
    createdByName: req.user?.name || "",
    statusUpdatedByName: req.user?.name || "",
    statusUpdatedAt: new Date()
  });
  return res.status(201).json(voucher);
});

router.put("/:id", requireAuth, requirePermission("vouchers", "edit"), async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) {
    return res.status(404).json({ error: "Voucher not found" });
  }
  const vendorId = req.body.vendorId ?? voucher.vendorId;
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    return res.status(400).json({ error: "Vendor not found" });
  }
  const items = req.body.items ? normalizeItems(req.body.items) : voucher.items;
  if (req.body.items && items.length === 0) {
    return res.status(400).json({ error: "items must be a non-empty array" });
  }
  for (const item of items) {
    const qty = ensurePositive(item.quantity, "quantity");
    const price = ensurePositive(item.pricePerUnit, "pricePerUnit");
    if (!qty.ok || !price.ok) {
      return res.status(400).json({ error: qty.message || price.message });
    }
  }
  const mapping = await validateVendorMaterialMapping(vendorId, items);
  if (!mapping.ok) {
    return res.status(400).json({ error: mapping.message });
  }
  const taxPercent = Number(req.body.taxPercent ?? voucher.taxPercent ?? 0);
  const discountType = req.body.discountType ?? voucher.discountType ?? "none";
  const discountValue = Number(req.body.discountValue ?? voucher.discountValue ?? 0);
  const totals = calculateTotals(items, taxPercent, discountType, discountValue);
  voucher.vendorId = vendorId;
  voucher.items = items;
  voucher.dateOfPurchase = req.body.dateOfPurchase ? new Date(req.body.dateOfPurchase) : voucher.dateOfPurchase;
  voucher.subTotal = totals.subTotal;
  voucher.taxPercent = taxPercent;
  voucher.taxAmount = totals.taxAmount;
  voucher.discountType = discountType;
  voucher.discountValue = discountValue;
  voucher.finalAmount = totals.finalAmount;
  voucher.paymentMethod = req.body.paymentMethod ?? voucher.paymentMethod;
  if (req.body.paymentStatus && req.body.paymentStatus !== voucher.paymentStatus) {
    voucher.paymentStatus = req.body.paymentStatus;
    voucher.statusUpdatedByName = req.user?.name || "";
    voucher.statusUpdatedAt = new Date();
  }
  if (req.body.paymentDate !== undefined) {
    voucher.paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : null;
  }
  if (req.body.paidByMode !== undefined) {
    voucher.paidByMode = req.body.paidByMode || "";
  }
  if (req.body.paymentComments !== undefined) {
    voucher.paymentComments = req.body.paymentComments || "";
  }
  await voucher.save();
  return res.json(voucher);
});

router.delete("/:id", requireAuth, requirePermission("vouchers", "delete"), async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) {
    return res.status(404).json({ error: "Voucher not found" });
  }
  await voucher.deleteOne();
  return res.json({ ok: true });
});

export default router;
