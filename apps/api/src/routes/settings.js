import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import AppSettings from "../models/AppSettings.js";
import { requireAuth, requireAdmin, requirePermission } from "../middleware/auth.js";
import { validateOptionalGstin } from "../utils/indianValidators.js";
import {
  multerTmpUpload,
  persistMulterFiles,
  unlinkTmpFiles,
  UPLOAD_ROOT
} from "../utils/fileUpload.js";

const router = express.Router();
const upload = multerTmpUpload({ maxFiles: 1, maxFileSize: 2 * 1024 * 1024 });

const BRANDING_SUBDIR = "branding";

function brandingDir() {
  return path.join(UPLOAD_ROOT, BRANDING_SUBDIR);
}

function logoFullPath(storedName) {
  if (!storedName || storedName.includes("/") || storedName.includes("\\") || storedName.includes("..")) {
    return null;
  }
  const base = brandingDir();
  const full = path.join(base, storedName);
  const resolvedBase = path.resolve(base);
  const resolvedFull = path.resolve(full);
  if (!resolvedFull.startsWith(resolvedBase + path.sep) && resolvedFull !== resolvedBase) {
    return null;
  }
  return resolvedFull;
}

const ALLOWED_LOGO_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"]);

async function getOrCreateSettings() {
  let doc = await AppSettings.findOne();
  if (!doc) {
    doc = await AppSettings.create({});
  }
  return doc;
}

const LETTERHEAD_NAME_MAX = 160;
const LETTERHEAD_LINE_MAX = 200;
const LETTERHEAD_MAX_LINES = 12;

/** Authenticated: letterhead for sales invoice PDFs (any user with sales view, or admin). */
router.get("/invoice-letterhead", requireAuth, requirePermission("sales", "view"), async (_req, res) => {
  const doc = await getOrCreateSettings();
  const lean = doc.toObject();
  const lines = Array.isArray(lean.companyAddressLines)
    ? lean.companyAddressLines.map((s) => String(s || "").trim()).filter(Boolean)
    : [];
  const legal = String(lean.companyLegalName || "").trim();
  const hasLogo = Boolean(lean.logoStoredName);
  const logoCacheKey = hasLogo && lean.updatedAt ? new Date(lean.updatedAt).getTime() : null;
  return res.json({
    legalName: legal || "Shroom Agritech LLP",
    addressLines: lines,
    phone: String(lean.companyPhone || "").trim(),
    gstin: String(lean.companyGstin || "").trim(),
    website: String(lean.companyWebsite || "").trim(),
    email: String(lean.companyEmail || "").trim(),
    hasLogo,
    logoCacheKey
  });
});

router.put("/invoice-letterhead", requireAuth, requireAdmin, async (req, res) => {
  const body = req.body || {};
  const legalName = String(body.legalName ?? "").trim();
  if (!legalName || legalName.length > LETTERHEAD_NAME_MAX) {
    return res.status(400).json({
      error: `Legal name is required and must be at most ${LETTERHEAD_NAME_MAX} characters.`
    });
  }
  let addressLines = Array.isArray(body.addressLines) ? body.addressLines : [];
  if (!addressLines.length && typeof body.addressText === "string") {
    addressLines = body.addressText.split(/\r?\n/).map((s) => String(s).trim()).filter(Boolean);
  }
  addressLines = addressLines
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, LETTERHEAD_MAX_LINES)
    .map((s) => (s.length > LETTERHEAD_LINE_MAX ? s.slice(0, LETTERHEAD_LINE_MAX) : s));
  const phone = String(body.phone ?? "").trim().slice(0, 80);
  const gstinRaw = String(body.gstin ?? "").trim();
  const gstin = gstinRaw.slice(0, 20);
  const g = validateOptionalGstin(gstin);
  if (!g.ok) {
    return res.status(400).json({ error: g.message });
  }
  const website = String(body.website ?? "").trim().slice(0, 200);
  const email = String(body.email ?? "").trim().slice(0, 120);

  const settings = await getOrCreateSettings();
  settings.companyLegalName = legalName;
  settings.companyAddressLines = addressLines;
  settings.companyPhone = phone;
  settings.companyGstin = g.value || "";
  settings.companyWebsite = website;
  settings.companyEmail = email;
  await settings.save();
  const lean = settings.toObject();
  const hasLogo = Boolean(lean.logoStoredName);
  const logoCacheKey = hasLogo && lean.updatedAt ? new Date(lean.updatedAt).getTime() : null;
  const gstinOut = g.value || "";
  return res.json({
    legalName: legalName,
    addressLines,
    phone,
    gstin: gstinOut,
    website,
    email,
    hasLogo,
    logoCacheKey
  });
});

/** Public: whether a logo exists (for cache-busting in UI). */
router.get("/branding", async (_req, res) => {
  const doc = await AppSettings.findOne().lean();
  const hasLogo = Boolean(doc?.logoStoredName);
  return res.json({
    hasLogo,
    updatedAt: hasLogo && doc.updatedAt ? new Date(doc.updatedAt).getTime() : null
  });
});

/** Public: serve current logo image. */
router.get("/logo", async (_req, res) => {
  const doc = await AppSettings.findOne().lean();
  if (!doc?.logoStoredName) {
    return res.status(404).end();
  }
  const filePath = logoFullPath(doc.logoStoredName);
  if (!filePath) {
    return res.status(404).end();
  }
  try {
    await fs.access(filePath);
  } catch {
    return res.status(404).end();
  }
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.sendFile(filePath);
});

function uploadLogoSingle(req, res, next) {
  return upload.single("logo")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Upload failed" });
    }
    return next();
  });
}

router.post("/logo", requireAuth, requireAdmin, uploadLogoSingle, async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const mime = (file.mimetype || "").toLowerCase();
  if (!ALLOWED_LOGO_MIMES.has(mime)) {
    await unlinkTmpFiles([file]);
    return res.status(400).json({ error: "Logo must be PNG, JPEG, SVG, or WebP" });
  }
  let settings;
  try {
    settings = await getOrCreateSettings();
    const oldName = settings.logoStoredName;
    const [meta] = await persistMulterFiles([file], BRANDING_SUBDIR);
    if (oldName && oldName !== meta.storedName) {
      try {
        const oldPath = logoFullPath(oldName);
        if (oldPath) await fs.unlink(oldPath);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    settings.logoStoredName = meta.storedName;
    settings.logoMimeType = meta.mimeType || mime;
    await settings.save();
    return res.json({
      ok: true,
      updatedAt: new Date(settings.updatedAt).getTime()
    });
  } catch (e) {
    await unlinkTmpFiles(req.file ? [req.file] : []);
    throw e;
  }
});

router.delete("/logo", requireAuth, requireAdmin, async (_req, res) => {
  const settings = await AppSettings.findOne();
  if (!settings?.logoStoredName) {
    return res.json({ ok: true });
  }
  const filePath = logoFullPath(settings.logoStoredName);
  if (filePath) {
    try {
      await fs.unlink(filePath);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  settings.logoStoredName = "";
  settings.logoMimeType = "";
  await settings.save();
  return res.json({ ok: true });
});

export default router;
