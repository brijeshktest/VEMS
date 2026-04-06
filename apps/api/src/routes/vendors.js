import express from "express";
import fs from "node:fs/promises";
import Vendor from "../models/Vendor.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
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

router.get("/", requireAuth, requirePermission("vendors", "view"), async (req, res) => {
  const vendors = await Vendor.find().sort({ name: 1 });
  return res.json(vendors);
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
  const missing = requireFields(body, ["name"]);
  if (missing.length) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const contactCheck = validateVendorContactPayload(contactPayloadForCreate(body));
  if (!contactCheck.ok) {
    await unlinkTmpFiles(req.files);
    return res.status(400).json({ error: contactCheck.message });
  }
  let vendor;
  try {
    vendor = await Vendor.create({
      name: body.name,
      address: body.address,
      contactPerson: body.contactPerson,
      contactNumber: contactCheck.normalized.contactNumber,
      email: contactCheck.normalized.email,
      gstin: contactCheck.normalized.gstin,
      vendorType: body.vendorType,
      pan: contactCheck.normalized.pan,
      aadhaar: contactCheck.normalized.aadhaar,
      materialsSupplied: body.materialsSupplied !== undefined ? body.materialsSupplied || [] : [],
      status: body.status || "Active",
      attachments: []
    });
    const files = req.files || [];
    if (files.length) {
      const meta = await persistMulterFiles(files, `vendors/${vendor._id}`);
      vendor.attachments.push(...meta);
      await vendor.save();
    }
    return res.status(201).json(vendor);
  } catch (e) {
    await unlinkTmpFiles(req.files);
    if (vendor?._id) {
      await Vendor.deleteOne({ _id: vendor._id });
      await deleteEntityUploadFolder("vendors", vendor._id.toString());
    }
    throw e;
  }
});

router.put("/:id", requireAuth, requirePermission("vendors", "edit"), conditionalVendorFiles, async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) {
    await unlinkTmpFiles(req.files);
    return res.status(404).json({ error: "Vendor not found" });
  }
  const body = isMultipartRequest(req) ? normalizeVendorBody(req) : req.body;
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
  return res.json(vendor);
});

router.delete("/:id", requireAuth, requirePermission("vendors", "delete"), async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) {
    return res.status(404).json({ error: "Vendor not found" });
  }
  const idStr = vendor._id.toString();
  await vendor.deleteOne();
  await deleteEntityUploadFolder("vendors", idStr);
  return res.json({ ok: true });
});

export default router;
