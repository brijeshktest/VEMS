import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import AppSettings from "../models/AppSettings.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
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
