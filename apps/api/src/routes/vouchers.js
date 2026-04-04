import express from "express";
import Voucher from "../models/Voucher.js";
import Vendor from "../models/Vendor.js";
import Material from "../models/Material.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { calculateTotals } from "../utils/calc.js";
import { requireFields, ensurePositive } from "../utils/validators.js";
import {
  multerTmpUpload,
  isMultipartRequest,
  persistMulterFiles,
  removeAttachmentsFromDisk,
  deleteEntityUploadFolder,
  attachmentFilePath,
  unlinkTmpFiles
} from "../utils/fileUpload.js";
import fs from "node:fs/promises";

const router = express.Router();
const upload = multerTmpUpload();

function conditionalVoucherFiles(req, res, next) {
  if (isMultipartRequest(req)) {
    return upload.array("files", 25)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || "File upload failed" });
      }
      return next();
    });
  }
  return next();
}

function extractVoucherPayload(req) {
  if (isMultipartRequest(req)) {
    try {
      return JSON.parse(req.body.data || "{}");
    } catch {
      return null;
    }
  }
  return req.body;
}

function parseRemovedAttachmentIds(req) {
  const raw = req.body?.removedAttachmentIds;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

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

router.get(
  "/:id/attachments/download/:storedName",
  requireAuth,
  requirePermission("vouchers", "view"),
  async (req, res) => {
    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) {
      return res.status(404).json({ error: "Voucher not found" });
    }
    const att = voucher.attachments.find((a) => a.storedName === req.params.storedName);
    if (!att) {
      return res.status(404).json({ error: "Attachment not found" });
    }
    const filePath = attachmentFilePath("vouchers", req.params.id, att.storedName);
    if (!filePath) {
      return res.status(400).json({ error: "Invalid file" });
    }
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: "File missing on server" });
    }
    return res.download(filePath, att.originalName);
  }
);

router.delete(
  "/:id/attachments/:attachmentId",
  requireAuth,
  requirePermission("vouchers", "edit"),
  async (req, res) => {
    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) {
      return res.status(404).json({ error: "Voucher not found" });
    }
    const att = voucher.attachments.id(req.params.attachmentId);
    if (!att) {
      return res.status(404).json({ error: "Attachment not found" });
    }
    await removeAttachmentsFromDisk("vouchers", voucher._id.toString(), [att]);
    att.deleteOne();
    await voucher.save();
    return res.json({ ok: true, voucher });
  }
);

router.get("/:id", requireAuth, requirePermission("vouchers", "view"), async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) {
    return res.status(404).json({ error: "Voucher not found" });
  }
  return res.json(voucher);
});

router.post("/", requireAuth, requirePermission("vouchers", "create"), conditionalVoucherFiles, async (req, res) => {
  const payload = extractVoucherPayload(req);
  if (payload === null) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: "Invalid JSON in data field" });
  }
  const missing = requireFields(payload, ["vendorId", "items", "dateOfPurchase", "paymentMethod", "paymentStatus"]);
  if (missing.length) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const vendor = await Vendor.findById(payload.vendorId);
  if (!vendor) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: "Vendor not found" });
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: "items must be a non-empty array" });
  }
  const items = normalizeItems(payload.items);
  for (const item of items) {
    const qty = ensurePositive(item.quantity, "quantity");
    const price = ensurePositive(item.pricePerUnit, "pricePerUnit");
    if (!qty.ok || !price.ok) {
      await unlinkTmpFiles(req.files);
      return res.status(400).json({ error: qty.message || price.message });
    }
  }
  const mapping = await validateVendorMaterialMapping(payload.vendorId, items);
  if (!mapping.ok) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: mapping.message });
  }
  const taxPercent = Number(payload.taxPercent || 0);
  const discountType = payload.discountType || "none";
  const discountValue = Number(payload.discountValue || 0);
  const totals = calculateTotals(items, taxPercent, discountType, discountValue);
  let voucher;
  try {
    voucher = await Voucher.create({
      vendorId: payload.vendorId,
      items,
      dateOfPurchase: new Date(payload.dateOfPurchase),
      subTotal: totals.subTotal,
      taxPercent,
      taxAmount: totals.taxAmount,
      discountType,
      discountValue,
      finalAmount: totals.finalAmount,
      paymentMethod: payload.paymentMethod,
      paymentStatus: payload.paymentStatus,
      paymentDate: payload.paymentDate ? new Date(payload.paymentDate) : undefined,
      paidByMode: payload.paidByMode || "",
      paymentComments: payload.paymentComments || "",
      createdByName: req.user?.name || "",
      statusUpdatedByName: req.user?.name || "",
      statusUpdatedAt: new Date(),
      attachments: []
    });
    const files = req.files || [];
    if (files.length) {
      const meta = await persistMulterFiles(files, `vouchers/${voucher._id}`);
      voucher.attachments.push(...meta);
      await voucher.save();
    }
    return res.status(201).json(voucher);
  } catch (e) {
    await unlinkTmpFiles(req.files);
    if (voucher?._id) {
      await Voucher.deleteOne({ _id: voucher._id });
      await deleteEntityUploadFolder("vouchers", voucher._id.toString());
    }
    throw e;
  }
});

router.put("/:id", requireAuth, requirePermission("vouchers", "edit"), conditionalVoucherFiles, async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) {
    await unlinkTmpFiles(req.files);
    return res.status(404).json({ error: "Voucher not found" });
  }
  const payload = extractVoucherPayload(req);
  if (payload === null) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: "Invalid JSON in data field" });
  }
  const removedIds = parseRemovedAttachmentIds(req);
  const toRemove = voucher.attachments.filter((a) => removedIds.includes(a._id.toString()));
  if (toRemove.length) {
    await removeAttachmentsFromDisk("vouchers", voucher._id.toString(), toRemove);
    voucher.attachments = voucher.attachments.filter((a) => !removedIds.includes(a._id.toString()));
  }
  const vendorId = payload.vendorId ?? voucher.vendorId;
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: "Vendor not found" });
  }
  const items = payload.items ? normalizeItems(payload.items) : voucher.items;
  if (payload.items && items.length === 0) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: "items must be a non-empty array" });
  }
  for (const item of items) {
    const qty = ensurePositive(item.quantity, "quantity");
    const price = ensurePositive(item.pricePerUnit, "pricePerUnit");
    if (!qty.ok || !price.ok) {
      await unlinkTmpFiles(req.files);
      return res.status(400).json({ error: qty.message || price.message });
    }
  }
  const mapping = await validateVendorMaterialMapping(vendorId, items);
  if (!mapping.ok) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: mapping.message });
  }
  const taxPercent = Number(payload.taxPercent ?? voucher.taxPercent ?? 0);
  const discountType = payload.discountType ?? voucher.discountType ?? "none";
  const discountValue = Number(payload.discountValue ?? voucher.discountValue ?? 0);
  const totals = calculateTotals(items, taxPercent, discountType, discountValue);
  voucher.vendorId = vendorId;
  voucher.items = items;
  voucher.dateOfPurchase = payload.dateOfPurchase ? new Date(payload.dateOfPurchase) : voucher.dateOfPurchase;
  voucher.subTotal = totals.subTotal;
  voucher.taxPercent = taxPercent;
  voucher.taxAmount = totals.taxAmount;
  voucher.discountType = discountType;
  voucher.discountValue = discountValue;
  voucher.finalAmount = totals.finalAmount;
  voucher.paymentMethod = payload.paymentMethod ?? voucher.paymentMethod;
  if (payload.paymentStatus && payload.paymentStatus !== voucher.paymentStatus) {
    voucher.paymentStatus = payload.paymentStatus;
    voucher.statusUpdatedByName = req.user?.name || "";
    voucher.statusUpdatedAt = new Date();
  }
  if (payload.paymentDate !== undefined) {
    voucher.paymentDate = payload.paymentDate ? new Date(payload.paymentDate) : null;
  }
  if (payload.paidByMode !== undefined) {
    voucher.paidByMode = payload.paidByMode || "";
  }
  if (payload.paymentComments !== undefined) {
    voucher.paymentComments = payload.paymentComments || "";
  }
  const files = req.files || [];
  if (files.length) {
    try {
      const meta = await persistMulterFiles(files, `vouchers/${voucher._id}`);
      voucher.attachments.push(...meta);
    } catch (e) {
      await unlinkTmpFiles(req.files);
      throw e;
    }
  }
  await voucher.save();
  return res.json(voucher);
});

router.delete("/:id", requireAuth, requirePermission("vouchers", "delete"), async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) {
    return res.status(404).json({ error: "Voucher not found" });
  }
  const idStr = voucher._id.toString();
  await voucher.deleteOne();
  await deleteEntityUploadFolder("vouchers", idStr);
  return res.json({ ok: true });
});

export default router;
