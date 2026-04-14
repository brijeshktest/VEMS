import express from "express";
import fs from "node:fs/promises";
import Vendor from "../models/Vendor.js";
import Material from "../models/Material.js";
import Voucher from "../models/Voucher.js";
import {
  requireAuth,
  requirePermission,
  requireVendorBulkDelete,
  requireVendorBulkUpload
} from "../middleware/auth.js";
import { requireFields } from "../utils/validators.js";
import { validateVendorContactPayload } from "../utils/indianValidators.js";
import {
  multerTmpUpload,
  isMultipartRequest,
  persistMulterFiles,
  removeAttachmentsFromDisk,
  deleteEntityUploadFolder,
  attachmentFilePath,
  unlinkTmpFiles
} from "../utils/fileUpload.js";
import { logChange } from "../utils/changeLog.js";

const router = express.Router();
const upload = multerTmpUpload();

function conditionalVendorFiles(req, res, next) {
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

function normalizeVendorBody(req) {
  const b = req.body;
  const materialsRaw = b.materialsSupplied;
  let materialsSupplied;
  if (materialsRaw !== undefined && materialsRaw !== null && `${materialsRaw}`.length) {
    if (Array.isArray(materialsRaw)) {
      materialsSupplied = materialsRaw;
    } else if (typeof materialsRaw === "string") {
      try {
        materialsSupplied = JSON.parse(materialsRaw);
      } catch {
        materialsSupplied = [];
      }
    }
  }
  return {
    name: b.name,
    address: b.address ?? "",
    contactPerson: b.contactPerson ?? "",
    contactNumber: b.contactNumber ?? "",
    email: b.email ?? "",
    gstin: b.gstin ?? "",
    vendorType: b.vendorType ?? "",
    status: b.status || "Active",
    pan: b.pan ?? "",
    aadhaar: b.aadhaar ?? "",
    materialsSupplied
  };
}

const CONTACT_KEYS = ["email", "gstin", "pan", "aadhaar", "contactNumber"];

function bodyTouchesVendorContact(body) {
  return CONTACT_KEYS.some((k) => Object.prototype.hasOwnProperty.call(body, k));
}

function contactPayloadForCreate(body) {
  const o = { email: "", gstin: "", pan: "", aadhaar: "", contactNumber: "" };
  for (const k of CONTACT_KEYS) {
    o[k] = Object.prototype.hasOwnProperty.call(body, k) ? body[k] ?? "" : "";
  }
  return o;
}

function contactPayloadForPut(body, vendor) {
  const o = {
    email: vendor.email || "",
    gstin: vendor.gstin || "",
    pan: vendor.pan || "",
    aadhaar: vendor.aadhaar || "",
    contactNumber: vendor.contactNumber || ""
  };
  for (const k of CONTACT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      o[k] = body[k] ?? "";
    }
  }
  return o;
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

async function deleteVendorById(user, idStr) {
  const vendor = await Vendor.findById(idStr);
  if (!vendor) {
    return { ok: false, error: "Vendor not found" };
  }
  const vid = vendor._id;
  const voucherCount = await Voucher.countDocuments({ vendorId: vid });
  if (voucherCount > 0) {
    return { ok: false, error: `Cannot delete: ${voucherCount} voucher(s) reference this vendor` };
  }
  const before = vendor.toObject();
  const idString = vid.toString();
  await vendor.deleteOne();
  await deleteEntityUploadFolder("vendors", idString);
  await Material.updateMany({ vendorIds: vid }, { $pull: { vendorIds: vid } });
  await logChange({
    entityType: "vendor",
    entityId: idString,
    action: "delete",
    user,
    before,
    after: null
  });
  return { ok: true };
}

router.get("/", requireAuth, requirePermission("vendors", "view"), async (req, res) => {
  const vendors = await Vendor.find().sort({ name: 1 });
  return res.json(vendors);
});

router.post("/bulk-delete", requireAuth, requireVendorBulkDelete, async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }
  if (ids.length > 200) {
    return res.status(400).json({ error: "Maximum 200 vendors per bulk delete" });
  }
  const results = [];
  for (const raw of ids) {
    const idStr = String(raw || "").trim();
    if (!idStr) {
      results.push({ id: raw, ok: false, error: "Empty id" });
      continue;
    }
    const r = await deleteVendorById(req.user, idStr);
    results.push({ id: idStr, ok: r.ok, error: r.error });
  }
  const deleted = results.filter((x) => x.ok).length;
  return res.json({ results, deleted, failed: results.length - deleted });
});

/**
 * Create a vendor from plain JSON (no multipart). Shared by POST / and POST /bulk.
 * @returns {Promise<{ ok: true, vendor: object } | { ok: false, error: string }>}
 */
async function createVendorDocument(user, body, files = []) {
  const missing = requireFields(body, ["name"]);
  if (missing.length) {
    await unlinkTmpFiles(files);
    return { ok: false, error: `Missing fields: ${missing.join(", ")}` };
  }
  const contactCheck = validateVendorContactPayload(contactPayloadForCreate(body));
  if (!contactCheck.ok) {
    await unlinkTmpFiles(files);
    return { ok: false, error: contactCheck.message };
  }
  const materialsSupplied =
    body.materialsSupplied !== undefined && Array.isArray(body.materialsSupplied)
      ? body.materialsSupplied
      : [];
  const status = body.status === "Inactive" ? "Inactive" : "Active";
  let vendor;
  try {
    vendor = await Vendor.create({
      name: body.name,
      address: body.address ?? "",
      contactPerson: body.contactPerson ?? "",
      contactNumber: contactCheck.normalized.contactNumber,
      email: contactCheck.normalized.email,
      gstin: contactCheck.normalized.gstin,
      vendorType: body.vendorType ?? "",
      pan: contactCheck.normalized.pan,
      aadhaar: contactCheck.normalized.aadhaar,
      materialsSupplied,
      status,
      attachments: []
    });
    if (files.length) {
      const meta = await persistMulterFiles(files, `vendors/${vendor._id}`);
      vendor.attachments.push(...meta);
      await vendor.save();
    }
    await logChange({
      entityType: "vendor",
      entityId: vendor._id,
      action: "create",
      user,
      before: null,
      after: vendor.toObject()
    });
    return { ok: true, vendor };
  } catch (e) {
    await unlinkTmpFiles(files);
    if (vendor?._id) {
      await Vendor.deleteOne({ _id: vendor._id });
      await deleteEntityUploadFolder("vendors", vendor._id.toString());
    }
    return { ok: false, error: e.message || "Create failed" };
  }
}

router.post("/bulk", requireAuth, requireVendorBulkUpload, async (req, res) => {
  const vendors = req.body?.vendors;
  if (!Array.isArray(vendors)) {
    return res.status(400).json({ error: "Request body must include vendors array" });
  }
  if (vendors.length > 400) {
    return res.status(400).json({ error: "Maximum 400 vendors per bulk import" });
  }
  if (vendors.length === 0) {
    return res.status(400).json({ error: "No vendors to import" });
  }
  const results = [];
  for (let i = 0; i < vendors.length; i++) {
    const r = await createVendorDocument(req.user, vendors[i], []);
    if (r.ok) {
      results.push({ index: i, ok: true, id: String(r.vendor._id) });
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

router.get(
  "/:id/attachments/download/:storedName",
  requireAuth,
  requirePermission("vendors", "view"),
  async (req, res) => {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }
    const att = vendor.attachments.find((a) => a.storedName === req.params.storedName);
    if (!att) {
      return res.status(404).json({ error: "Attachment not found" });
    }
    const filePath = attachmentFilePath("vendors", req.params.id, att.storedName);
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
  requirePermission("vendors", "edit"),
  async (req, res) => {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }
    const att = vendor.attachments.id(req.params.attachmentId);
    if (!att) {
      return res.status(404).json({ error: "Attachment not found" });
    }
    await removeAttachmentsFromDisk("vendors", vendor._id.toString(), [att]);
    att.deleteOne();
    await vendor.save();
    return res.json({ ok: true, vendor });
  }
);

router.get("/:id", requireAuth, requirePermission("vendors", "view"), async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) {
    return res.status(404).json({ error: "Vendor not found" });
  }
  return res.json(vendor);
});

router.post("/", requireAuth, requirePermission("vendors", "create"), conditionalVendorFiles, async (req, res) => {
  const body = isMultipartRequest(req) ? normalizeVendorBody(req) : req.body;
  const files = req.files || [];
  const r = await createVendorDocument(req.user, body, files);
  if (!r.ok) {
    return res.status(400).json({ error: r.error });
  }
  return res.status(201).json(r.vendor);
});

router.put("/:id", requireAuth, requirePermission("vendors", "edit"), conditionalVendorFiles, async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) {
    await unlinkTmpFiles(req.files);
    return res.status(404).json({ error: "Vendor not found" });
  }
  const body = isMultipartRequest(req) ? normalizeVendorBody(req) : req.body;
  const before = vendor.toObject();
  const removedIds = parseRemovedAttachmentIds(req);
  const toRemove = vendor.attachments.filter((a) => removedIds.includes(a._id.toString()));
  if (toRemove.length) {
    await removeAttachmentsFromDisk("vendors", vendor._id.toString(), toRemove);
    vendor.attachments = vendor.attachments.filter((a) => !removedIds.includes(a._id.toString()));
  }
  vendor.name = body.name ?? vendor.name;
  vendor.address = body.address ?? vendor.address;
  vendor.contactPerson = body.contactPerson ?? vendor.contactPerson;
  vendor.gstin = body.gstin ?? vendor.gstin;
  vendor.vendorType = body.vendorType ?? vendor.vendorType;
  if (bodyTouchesVendorContact(body)) {
    const contactCheck = validateVendorContactPayload(contactPayloadForPut(body, vendor));
    if (!contactCheck.ok) {
      await unlinkTmpFiles(req.files);
      return res.status(400).json({ error: contactCheck.message });
    }
    vendor.email = contactCheck.normalized.email;
    vendor.gstin = contactCheck.normalized.gstin;
    vendor.pan = contactCheck.normalized.pan;
    vendor.aadhaar = contactCheck.normalized.aadhaar;
    vendor.contactNumber = contactCheck.normalized.contactNumber;
  }
  if (body.materialsSupplied !== undefined) {
    vendor.materialsSupplied = body.materialsSupplied;
  }
  vendor.status = body.status ?? vendor.status;
  const files = req.files || [];
  if (files.length) {
    try {
      const meta = await persistMulterFiles(files, `vendors/${vendor._id}`);
      vendor.attachments.push(...meta);
    } catch (e) {
      await unlinkTmpFiles(req.files);
      throw e;
    }
  }
  await vendor.save();
  await logChange({
    entityType: "vendor",
    entityId: vendor._id,
    action: "update",
    user: req.user,
    before,
    after: vendor.toObject()
  });
  return res.json(vendor);
});

router.delete("/:id", requireAuth, requirePermission("vendors", "delete"), async (req, res) => {
  const r = await deleteVendorById(req.user, req.params.id);
  if (!r.ok) {
    return res.status(r.error === "Vendor not found" ? 404 : 400).json({ error: r.error });
  }
  return res.json({ ok: true });
});

export default router;
