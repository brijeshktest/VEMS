import express from "express";
import Voucher from "../models/Voucher.js";
import Vendor from "../models/Vendor.js";
import Material from "../models/Material.js";
import {
  requireAuth,
  requirePermission,
  requireVoucherBulkUpload,
  requireVoucherBulkDelete
} from "../middleware/auth.js";

const BULK_IMPORT_VENDOR_NAME = "— Bulk import: assign vendor —";
const BULK_IMPORT_MATERIAL_NAME = "— Bulk import: assign item —";
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
import { logChange } from "../utils/changeLog.js";
import { PAYMENT_MADE_FROM_CHOICES, isAllowedPaymentMadeBy } from "../utils/paymentMadeFrom.js";

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

function validatePaidPaymentMadeBy(payload) {
  if (payload.paymentStatus === "Paid") {
    if (!isAllowedPaymentMadeBy(payload.paymentMadeBy)) {
      return {
        ok: false,
        message: `When payment status is Paid, Payment made from is required and must be one of: ${PAYMENT_MADE_FROM_CHOICES.join(
          ", "
        )}`
      };
    }
  }
  return { ok: true };
}

async function ensureBulkImportVendor() {
  let v = await Vendor.findOne({ name: BULK_IMPORT_VENDOR_NAME });
  if (!v) {
    v = await Vendor.create({
      name: BULK_IMPORT_VENDOR_NAME,
      vendorType: "Import",
      status: "Active"
    });
  }
  return v._id;
}

async function ensureBulkImportMaterialForVendor(vendorId) {
  const vid = vendorId.toString();
  let m = await Material.findOne({
    name: BULK_IMPORT_MATERIAL_NAME,
    vendorIds: vendorId
  });
  if (!m) {
    m = await Material.create({
      name: BULK_IMPORT_MATERIAL_NAME,
      vendorIds: [vendorId],
      unit: "unit",
      category: "Import",
      description: "Placeholder line for bulk-imported vouchers; edit voucher to set real items."
    });
  } else if (!m.vendorIds.map((id) => id.toString()).includes(vid)) {
    m.vendorIds.push(vendorId);
    await m.save();
  }
  return m._id;
}

function escapeRegexForVendorName(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Excel bulk import: create or resolve vendor by name and align line-item materials to that vendor.
 * Strips `importVendorName` from the returned payload.
 */
async function resolveImportVendorPayload(payload) {
  const raw = payload.importVendorName;
  if (raw === undefined || raw === null || !String(raw).trim()) {
    const { importVendorName: _drop, ...rest } = payload;
    return rest;
  }
  const importName = String(raw).trim();
  let vendor = await Vendor.findOne({
    name: new RegExp(`^${escapeRegexForVendorName(importName)}$`, "i")
  });
  if (!vendor) {
    vendor = await Vendor.create({
      name: importName,
      vendorType: "Vendor",
      status: "Active"
    });
  }
  const resolvedVendorId = vendor._id;
  const out = { ...payload, vendorId: resolvedVendorId };
  const items = Array.isArray(payload.items) ? [...payload.items] : [];
  const phMatId = await ensureBulkImportMaterialForVendor(resolvedVendorId);
  const vidStr = String(resolvedVendorId);
  out.items = await Promise.all(
    items.map(async (item) => {
      const mat = await Material.findById(item.materialId);
      const ok = mat && (mat.vendorIds || []).map(String).includes(vidStr);
      if (ok) return item;
      return { ...item, materialId: phMatId };
    })
  );
  delete out.importVendorName;
  return out;
}

/**
 * Create voucher (no attachments). Throws Error with user-facing message on validation failure.
 * @param {{ name?: string }} user
 * @param {object} payload
 */
async function createVoucherCore(user, payload) {
  payload = await resolveImportVendorPayload(payload);
  const missing = requireFields(payload, ["vendorId", "items", "dateOfPurchase", "paymentMethod", "paymentStatus"]);
  if (missing.length) {
    throw new Error(`Missing fields: ${missing.join(", ")}`);
  }
  const vendor = await Vendor.findById(payload.vendorId);
  if (!vendor) {
    throw new Error("Vendor not found");
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error("items must be a non-empty array");
  }
  const paidSourceCheck = validatePaidPaymentMadeBy(payload);
  if (!paidSourceCheck.ok) {
    throw new Error(paidSourceCheck.message);
  }
  const items = normalizeItems(payload.items);
  for (const item of items) {
    const qty = ensurePositive(item.quantity, "quantity");
    const price = ensurePositive(item.pricePerUnit, "pricePerUnit");
    if (!qty.ok || !price.ok) {
      throw new Error(qty.message || price.message);
    }
  }
  const mapping = await validateVendorMaterialMapping(payload.vendorId, items);
  if (!mapping.ok) {
    throw new Error(mapping.message);
  }
  const taxPercent = Number(payload.taxPercent || 0);
  const discountType = payload.discountType || "none";
  const discountValue = Number(payload.discountValue || 0);
  const totals = calculateTotals(items, taxPercent, discountType, discountValue);
  let finalAmount = totals.finalAmount;
  const rawOverride = payload.finalAmount;
  if (rawOverride !== undefined && rawOverride !== null && rawOverride !== "") {
    const o = Number(rawOverride);
    if (Number.isFinite(o) && o >= 0) {
      finalAmount = o;
    }
  }
  const paidAmount = Number(payload.paidAmount ?? finalAmount);
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    throw new Error("paidAmount must be a non-negative number");
  }
  const voucher = await Voucher.create({
    vendorId: payload.vendorId,
    voucherNumber: payload.voucherNumber || "",
    items,
    dateOfPurchase: new Date(payload.dateOfPurchase),
    subTotal: totals.subTotal,
    taxPercent,
    taxAmount: totals.taxAmount,
    discountType,
    discountValue,
    finalAmount,
    paidAmount,
    paymentMethod: payload.paymentMethod,
    paymentStatus: payload.paymentStatus,
    paymentDate: payload.paymentDate ? new Date(payload.paymentDate) : undefined,
    paymentMadeBy: (payload.paymentMadeBy && String(payload.paymentMadeBy).trim()) || "",
    paidByMode: payload.paidByMode || "",
    paymentComments: payload.paymentComments || "",
    createdByName: user?.name || "",
    statusUpdatedByName: user?.name || "",
    statusUpdatedAt: new Date(),
    attachments: []
  });
  await logChange({
    entityType: "voucher",
    entityId: voucher._id,
    action: "create",
    user,
    before: null,
    after: voucher.toObject()
  });
  return voucher;
}

async function deleteVoucherById(user, idStr) {
  const voucher = await Voucher.findById(idStr);
  if (!voucher) {
    return { ok: false, error: "Voucher not found" };
  }
  const before = voucher.toObject();
  await voucher.deleteOne();
  await deleteEntityUploadFolder("vouchers", idStr);
  await logChange({
    entityType: "voucher",
    entityId: idStr,
    action: "delete",
    user,
    before,
    after: null
  });
  return { ok: true };
}

router.get("/", requireAuth, requirePermission("vouchers", "view"), async (req, res) => {
  const vouchers = await Voucher.find().sort({ dateOfPurchase: -1 });
  return res.json(vouchers);
});

/** Fixed payment-made-from choices (must be before /:id). */
router.get("/payment-made-by-options", requireAuth, requirePermission("vouchers", "view"), async (req, res) => {
  return res.json({ options: [...PAYMENT_MADE_FROM_CHOICES] });
});

/** Ensures placeholder vendor + per-vendor placeholder material for bulk Excel imports (must be before /:id). */
router.post("/import-placeholders", requireAuth, requireVoucherBulkUpload, async (req, res) => {
  const rawIds = req.body?.vendorIds;
  const vendorIds = Array.isArray(rawIds) ? [...new Set(rawIds.map((id) => String(id)).filter(Boolean))] : [];
  const defaultVendorId = await ensureBulkImportVendor();
  const materialByVendorId = {};
  materialByVendorId[String(defaultVendorId)] = await ensureBulkImportMaterialForVendor(defaultVendorId);
  for (const id of vendorIds) {
    try {
      materialByVendorId[String(id)] = await ensureBulkImportMaterialForVendor(id);
    } catch {
      /* invalid vendor id */
    }
  }
  return res.json({ defaultVendorId, materialByVendorId });
});

router.post("/bulk", requireAuth, requireVoucherBulkUpload, async (req, res) => {
  const vouchers = req.body?.vouchers;
  if (!Array.isArray(vouchers)) {
    return res.status(400).json({ error: "Request body must include vouchers array" });
  }
  if (vouchers.length > 400) {
    return res.status(400).json({ error: "Maximum 400 vouchers per bulk import" });
  }
  if (vouchers.length === 0) {
    return res.status(400).json({ error: "No vouchers to import" });
  }
  const results = [];
  for (let i = 0; i < vouchers.length; i++) {
    try {
      const voucher = await createVoucherCore(req.user, vouchers[i]);
      results.push({ index: i, ok: true, id: String(voucher._id) });
    } catch (e) {
      results.push({ index: i, ok: false, error: e.message || "Validation failed" });
    }
  }
  const imported = results.filter((r) => r.ok).length;
  return res.status(201).json({
    results,
    imported,
    failed: results.length - imported
  });
});

router.post("/bulk-delete", requireAuth, requireVoucherBulkDelete, async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }
  if (ids.length > 200) {
    return res.status(400).json({ error: "Maximum 200 vouchers per bulk delete" });
  }
  const results = [];
  for (const raw of ids) {
    const idStr = String(raw || "").trim();
    if (!idStr) {
      results.push({ id: raw, ok: false, error: "Empty id" });
      continue;
    }
    const r = await deleteVoucherById(req.user, idStr);
    results.push({ id: idStr, ok: r.ok, error: r.error });
  }
  const deleted = results.filter((x) => x.ok).length;
  return res.json({ results, deleted, failed: results.length - deleted });
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
  let voucher;
  try {
    voucher = await createVoucherCore(req.user, payload);
  } catch (e) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: e.message || "Validation failed" });
  }
  try {
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
  const before = voucher.toObject();
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
  const paidAmount = Number(payload.paidAmount ?? voucher.paidAmount ?? totals.finalAmount);
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: "paidAmount must be a non-negative number" });
  }
  voucher.vendorId = vendorId;
  voucher.voucherNumber = payload.voucherNumber ?? voucher.voucherNumber;
  voucher.items = items;
  voucher.dateOfPurchase = payload.dateOfPurchase ? new Date(payload.dateOfPurchase) : voucher.dateOfPurchase;
  voucher.subTotal = totals.subTotal;
  voucher.taxPercent = taxPercent;
  voucher.taxAmount = totals.taxAmount;
  voucher.discountType = discountType;
  voucher.discountValue = discountValue;
  voucher.finalAmount = totals.finalAmount;
  voucher.paidAmount = paidAmount;
  voucher.paymentMethod = payload.paymentMethod ?? voucher.paymentMethod;
  if (payload.paymentStatus && payload.paymentStatus !== voucher.paymentStatus) {
    voucher.paymentStatus = payload.paymentStatus;
    voucher.statusUpdatedByName = req.user?.name || "";
    voucher.statusUpdatedAt = new Date();
  }
  if (payload.paymentDate !== undefined) {
    voucher.paymentDate = payload.paymentDate ? new Date(payload.paymentDate) : null;
  }
  if (payload.paymentMadeBy !== undefined) {
    voucher.paymentMadeBy = (payload.paymentMadeBy && String(payload.paymentMadeBy).trim()) || "";
  }
  if (payload.paidByMode !== undefined) {
    voucher.paidByMode = payload.paidByMode || "";
  }
  if (payload.paymentComments !== undefined) {
    voucher.paymentComments = payload.paymentComments || "";
  }
  const paidPutCheck = validatePaidPaymentMadeBy({
    paymentStatus: voucher.paymentStatus,
    paymentMadeBy: voucher.paymentMadeBy || ""
  });
  if (!paidPutCheck.ok) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: paidPutCheck.message });
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
  await logChange({
    entityType: "voucher",
    entityId: voucher._id,
    action: "update",
    user: req.user,
    before,
    after: voucher.toObject()
  });
  return res.json(voucher);
});

router.delete("/:id", requireAuth, requirePermission("vouchers", "delete"), async (req, res) => {
  const idStr = String(req.params.id);
  const r = await deleteVoucherById(req.user, idStr);
  if (!r.ok) {
    return res.status(404).json({ error: r.error || "Voucher not found" });
  }
  return res.json({ ok: true });
});

export default router;
