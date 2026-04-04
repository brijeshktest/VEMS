import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import multer from "multer";

export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export function multerTmpUpload({ maxFiles = 25, maxFileSize = 15 * 1024 * 1024 } = {}) {
  return multer({
    storage: multer.diskStorage({
      destination: async (req, file, cb) => {
        const tmp = path.join(UPLOAD_ROOT, "tmp");
        await fs.mkdir(tmp, { recursive: true });
        cb(null, tmp);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || "") || "";
        cb(null, `${randomUUID()}${ext}`);
      }
    }),
    limits: { fileSize: maxFileSize, files: maxFiles }
  });
}

export function isMultipartRequest(req) {
  const ct = req.headers["content-type"] || "";
  return ct.includes("multipart/form-data");
}

export async function persistMulterFiles(files, entitySubdir) {
  const dir = path.join(UPLOAD_ROOT, entitySubdir);
  await fs.mkdir(dir, { recursive: true });
  const attachments = [];
  for (const f of files) {
    const target = path.join(dir, f.filename);
    await fs.rename(f.path, target);
    attachments.push({
      originalName: f.originalname,
      storedName: f.filename,
      mimeType: f.mimetype || "application/octet-stream",
      size: f.size || 0
    });
  }
  return attachments;
}

export async function removeAttachmentsFromDisk(type, id, attachmentDocs) {
  const dir = path.join(UPLOAD_ROOT, type, id);
  for (const a of attachmentDocs) {
    try {
      await fs.unlink(path.join(dir, a.storedName));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
}

export async function deleteEntityUploadFolder(type, id) {
  const dir = path.join(UPLOAD_ROOT, type, id);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

export function attachmentFilePath(type, id, storedName) {
  if (!storedName || storedName.includes("/") || storedName.includes("\\") || storedName.includes("..")) {
    return null;
  }
  const base = path.join(UPLOAD_ROOT, type, id);
  const full = path.join(base, storedName);
  const resolvedBase = path.resolve(base);
  const resolvedFull = path.resolve(full);
  if (!resolvedFull.startsWith(resolvedBase + path.sep) && resolvedFull !== resolvedBase) {
    return null;
  }
  return resolvedFull;
}

export async function unlinkTmpFiles(files) {
  for (const f of files || []) {
    try {
      await fs.unlink(f.path);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
}
