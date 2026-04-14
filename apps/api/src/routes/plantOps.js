import express from "express";
import mongoose from "mongoose";
import CompostLifecycleBatch from "../models/CompostLifecycleBatch.js";
import GrowingRoom from "../models/GrowingRoom.js";
import Material from "../models/Material.js";
import Vendor from "../models/Vendor.js";
import Voucher from "../models/Voucher.js";
import { requireAuth, requireAdmin, requirePermission } from "../middleware/auth.js";
import { requireFields, ensurePositive } from "../utils/validators.js";
import {
  COMPOST_STATUS_KEYS,
  buildCompostTimeline,
  compostProgressFraction,
  effectiveCompostStatus,
  expectedStageEndIso,
  resourceTypesForCompostStatus,
  getNextStageKey
} from "../utils/compostLifecycle.js";

const router = express.Router();

/** Workflow stage (persisted when set; otherwise derived for legacy batches). */
function operationalStageFromDoc(doc, now = new Date()) {
  const os = doc.operationalStageKey != null && String(doc.operationalStageKey).trim() !== "" ? String(doc.operationalStageKey).trim() : null;
  if (os && COMPOST_STATUS_KEYS.includes(os)) {
    return os;
  }
  return effectiveCompostStatus(doc, now);
}

function allocationIsOpen(a) {
  return a == null || a.endDate == null;
}

async function buildBusyGrowingRoomIdSet(excludeBatchId) {
  const now = new Date();
  const batches = await CompostLifecycleBatch.find({
    resourceAllocations: { $elemMatch: { endDate: null } }
  })
    .select("_id operationalStageKey manualStatus startDate resourceAllocations")
    .lean();
  const busy = new Set();
  for (const b of batches) {
    if (excludeBatchId && String(b._id) === String(excludeBatchId)) continue;
    if (operationalStageFromDoc(b, now) === "done") continue;
    for (const a of b.resourceAllocations || []) {
      if (allocationIsOpen(a)) {
        busy.add(String(a.growingRoomId));
      }
    }
  }
  return busy;
}

async function countFreeRoomsOfTypes(types, excludeBatchId) {
  const busy = await buildBusyGrowingRoomIdSet(excludeBatchId);
  const rooms = await GrowingRoom.find({ resourceType: { $in: types } }).select("_id").lean();
  let n = 0;
  for (const r of rooms) {
    if (!busy.has(String(r._id))) n += 1;
  }
  return n;
}

/**
 * For each growing room id with an open allocation on an active batch (excluding excludeBatchId),
 * planned ISO date when that allocation's stage ends on the batch calendar, plus holding batch name.
 */
async function buildRoomAvailabilityMeta(excludeBatchId) {
  const now = new Date();
  const meta = new Map();
  const batches = await CompostLifecycleBatch.find({
    resourceAllocations: { $elemMatch: { endDate: null } }
  })
    .select("batchName startDate operationalStageKey manualStatus resourceAllocations")
    .lean();
  for (const b of batches) {
    if (excludeBatchId && String(b._id) === String(excludeBatchId)) continue;
    if (operationalStageFromDoc(b, now) === "done") continue;
    for (const a of b.resourceAllocations || []) {
      if (!allocationIsOpen(a)) continue;
      const gid = String(a.growingRoomId);
      if (meta.has(gid)) continue;
      const skRaw = a.stageKey != null && String(a.stageKey).trim() !== "" ? String(a.stageKey).trim() : "wetting";
      const sk = COMPOST_STATUS_KEYS.includes(skRaw) ? skRaw : "wetting";
      const availableFrom = expectedStageEndIso(b.startDate, sk);
      meta.set(gid, {
        availableFrom,
        holdingBatchName: (b.batchName && String(b.batchName).trim()) || String(b._id),
        allocationStageKey: sk
      });
    }
  }
  return meta;
}

const RAW_MATERIAL_CATEGORY = /^raw material$/i;

function usageKey(materialId, vendorId) {
  return `${String(materialId)}|${String(vendorId)}`;
}

/** Sum compost batch raw lines with vendor (materialId + vendorId). */
async function getCompostRawMaterialUsageByVendor() {
  const batches = await CompostLifecycleBatch.find()
    .select("rawMaterialLines")
    .lean();
  const map = new Map();
  for (const b of batches) {
    for (const line of b.rawMaterialLines || []) {
      if (!line.materialId || !line.vendorId) continue;
      const k = usageKey(line.materialId, line.vendorId);
      const q = Number(line.quantity) || 0;
      map.set(k, (map.get(k) || 0) + q);
    }
  }
  return map;
}

async function getVoucherPurchasedByMaterialVendor(dateMatch) {
  const matVendorRows = await Voucher.aggregate([
    { $match: dateMatch },
    { $unwind: "$items" },
    {
      $group: {
        _id: {
          materialId: "$items.materialId",
          vendorId: "$vendorId"
        },
        expenseQuantity: { $sum: "$items.quantity" }
      }
    },
    {
      $lookup: {
        from: "materials",
        localField: "_id.materialId",
        foreignField: "_id",
        as: "material"
      }
    },
    { $unwind: "$material" },
    {
      $lookup: {
        from: "vendors",
        localField: "_id.vendorId",
        foreignField: "_id",
        as: "vendor"
      }
    },
    { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } }
  ]);
  const byMaterial = new Map();
  for (const row of matVendorRows) {
    if (!RAW_MATERIAL_CATEGORY.test((row.material?.category || "").trim())) {
      continue;
    }
    const mid = String(row._id.materialId);
    if (!byMaterial.has(mid)) {
      byMaterial.set(mid, []);
    }
    const q = Number(row.expenseQuantity) || 0;
    byMaterial.get(mid).push({
      vendorId: row._id.vendorId,
      vendorName: (row.vendor && row.vendor.name) || "Unknown vendor",
      expenseQuantity: q
    });
  }
  for (const [, list] of byMaterial) {
    list.sort((a, b) => String(a.vendorName).localeCompare(String(b.vendorName)));
  }
  return byMaterial;
}

async function computeRawMaterialStockSummary(dateMatch) {
  const [catalogMaterials, purchasedByMaterial, usageMap] = await Promise.all([
    Material.find().select("name unit category").sort({ name: 1 }).lean(),
    getVoucherPurchasedByMaterialVendor(dateMatch),
    getCompostRawMaterialUsageByVendor()
  ]);
  const rawCatalog = catalogMaterials.filter((m) =>
    RAW_MATERIAL_CATEGORY.test((m.category || "").trim())
  );
  const rows = rawCatalog.map((m) => {
    const mid = String(m._id);
    const vendorPurchased = purchasedByMaterial.get(mid) || [];
    let totalExpense = 0;
    let totalUsed = 0;
    let totalAvailable = 0;
    const byVendor = vendorPurchased.map((v) => {
      const k = usageKey(mid, v.vendorId);
      const used = Number(usageMap.get(k)) || 0;
      const expense = Number(v.expenseQuantity) || 0;
      const available = Math.max(0, expense - used);
      totalExpense += expense;
      totalUsed += used;
      totalAvailable += available;
      return {
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        expenseQuantity: expense,
        compostUsed: used,
        availableQuantity: available
      };
    });
    return {
      _id: m._id,
      materialId: m._id,
      name: m.name,
      unit: m.unit || "",
      category: m.category || "",
      totalExpenseQuantity: totalExpense,
      totalCompostUsed: totalUsed,
      totalAvailableQuantity: totalAvailable,
      byVendor
    };
  });
  rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return rows;
}

function buildVoucherDateMatch(start, end) {
  const match = {};
  if (start) {
    match.$gte = new Date(start);
  }
  if (end) {
    match.$lte = new Date(end);
  }
  return Object.keys(match).length ? { dateOfPurchase: match } : {};
}

function parseStartDate(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(s.length <= 10 ? `${s}T00:00:00.000Z` : s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function normalizeManualStatus(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const s = String(value).trim();
  if (!COMPOST_STATUS_KEYS.includes(s)) {
    return { ok: false, error: `manualStatus must be one of: ${COMPOST_STATUS_KEYS.join(", ")}` };
  }
  return { ok: true, value: s };
}

async function toBatchView(doc, { populate = true } = {}) {
  let batch = doc;
  if (populate && typeof doc.populate === "function") {
    batch = await doc.populate([
      { path: "resourceAllocations.growingRoomId", select: "name resourceType locationInPlant" },
      { path: "rawMaterialLines.materialId", select: "name unit category" },
      { path: "rawMaterialLines.vendorId", select: "name" }
    ]);
  }
  const o = typeof batch.toObject === "function" ? batch.toObject() : { ...batch };
  const now = new Date();
  const effectiveStatus = effectiveCompostStatus(o, now);
  const computedStatus = effectiveCompostStatus({ ...o, manualStatus: null }, now);
  const operationalStageKey = operationalStageFromDoc(o, now);
  const nextOperationalStage = getNextStageKey(operationalStageKey);
  const timeline = buildCompostTimeline(o.startDate);
  const progress = compostProgressFraction(o.startDate, effectiveStatus, now);
  return {
    ...o,
    id: o._id,
    effectiveStatus,
    computedStatus,
    operationalStageKey,
    nextOperationalStage,
    isManualOverride: Boolean(o.manualStatus && String(o.manualStatus).trim()),
    timeline,
    progress
  };
}

async function assertResourceNotDoubleBooked(growingRoomId, excludeBatchId) {
  const busy = await buildBusyGrowingRoomIdSet(excludeBatchId);
  const gid = String(growingRoomId);
  if (busy.has(gid)) {
    const gidObj = new mongoose.Types.ObjectId(gid);
    const other = await CompostLifecycleBatch.findOne({
      ...(excludeBatchId ? { _id: { $ne: excludeBatchId } } : {}),
      resourceAllocations: { $elemMatch: { growingRoomId: gidObj, endDate: null } }
    })
      .select("batchName operationalStageKey manualStatus startDate")
      .lean();
    const now = new Date();
    const st = other ? operationalStageFromDoc(other, now) : "active";
    const otherName = other?.batchName || "another batch";
    return {
      ok: false,
      error: `Resource is already in use by active batch “${otherName}” (${st})`
    };
  }
  return { ok: true };
}

/**
 * @param {import("mongoose").Document} batch
 * @param {string} stageKey
 * @param {Array<{ growingRoomId: string }>} resources
 * @param {Date} startDate
 * @returns {Promise<{ ok: true, resourcesUsed: Array<{ name: string, resourceType: string }> } | { ok: false, error: string }>}
 */
async function validateAndPushResourceAllocations(batch, stageKey, resources, startDate) {
  const allowedTypes = resourceTypesForCompostStatus(stageKey);
  if (!allowedTypes.length) {
    return { ok: false, error: `No resource types are allowed for stage ${stageKey}` };
  }
  if (!Array.isArray(resources) || resources.length === 0) {
    return { ok: false, error: "Select at least one plant resource for this stage." };
  }
  const resourcesUsed = [];
  const seen = new Set();
  /** @type {Array<import("mongoose").Document>} */
  const roomsOk = [];
  for (const row of resources) {
    const gid = row?.growingRoomId;
    if (!gid) {
      return { ok: false, error: "Each resource entry must include growingRoomId" };
    }
    const idStr = String(gid);
    if (seen.has(idStr)) {
      return { ok: false, error: "Duplicate resource in request" };
    }
    seen.add(idStr);
    const room = await GrowingRoom.findById(gid);
    if (!room) {
      return { ok: false, error: "Resource not found" };
    }
    if (!allowedTypes.includes(room.resourceType)) {
      return {
        ok: false,
        error: `Stage ${stageKey} allows only: ${allowedTypes.join(", ")}. “${room.name}” is ${room.resourceType}.`
      };
    }
    const check = await assertResourceNotDoubleBooked(room._id, batch._id);
    if (!check.ok) {
      return { ok: false, error: check.error };
    }
    roomsOk.push(room);
    resourcesUsed.push({
      name: room.name,
      resourceType: room.resourceType
    });
  }
  const assignedAt = new Date();
  for (const room of roomsOk) {
    batch.resourceAllocations.push({
      growingRoomId: room._id,
      stageKey,
      startDate,
      endDate: null,
      assignedAt
    });
  }
  return { ok: true, resourcesUsed };
}

/**
 * @param {import("mongoose").Document} batch
 * @param {string} stageKey
 * @param {unknown} rawMaterials — array of { materialId, vendorId, quantity } or { materialId, allocations: [...] }
 * @param {string} note
 * @returns {Promise<{ ok: true, rawMaterialsUsed: Array<{ materialName: string, vendorName: string, quantity: number }> } | { ok: false, error: string }>}
 */
async function applyRawMaterialsForStage(batch, stageKey, rawMaterials, note) {
  const rows = [];
  if (Array.isArray(rawMaterials)) {
    for (const block of rawMaterials) {
      if (!block || typeof block !== "object") continue;
      if (block.materialId && Array.isArray(block.allocations)) {
        for (const a of block.allocations) {
          if (a == null || a.vendorId == null || a.vendorId === "") continue;
          const qn = Number(a.quantity);
          if (!Number.isFinite(qn) || qn <= 0) continue;
          rows.push({ materialId: block.materialId, vendorId: a.vendorId, quantity: qn });
        }
      } else if (block.materialId && block.vendorId != null && block.vendorId !== "" && block.quantity != null) {
        rows.push({
          materialId: block.materialId,
          vendorId: block.vendorId,
          quantity: block.quantity
        });
      }
    }
  }
  if (!rows.length) {
    return { ok: false, error: "Add at least one raw material line for this stage movement." };
  }
  const byMaterial = new Map();
  for (const r of rows) {
    const mid = String(r.materialId);
    if (!byMaterial.has(mid)) {
      byMaterial.set(mid, new Map());
    }
    const vid = String(r.vendorId);
    const q = ensurePositive(r.quantity, "quantity");
    if (!q.ok) {
      return { ok: false, error: q.message };
    }
    const m = byMaterial.get(mid);
    m.set(vid, (m.get(vid) || 0) + q.value);
  }

  const dateMatch = buildVoucherDateMatch();
  const [usageMap, purchasedByMaterial] = await Promise.all([
    getCompostRawMaterialUsageByVendor(),
    getVoucherPurchasedByMaterialVendor(dateMatch)
  ]);

  const rawMaterialsUsed = [];
  /** @type {Array<{ material: import("mongoose").Document, vendor: import("mongoose").Document, totalQty: number }>} */
  const pendingLines = [];

  for (const [midStr, vendorMap] of byMaterial) {
    const material = await Material.findById(midStr);
    if (!material) {
      return { ok: false, error: "Material not found" };
    }
    const cat = (material.category || "").trim();
    if (!RAW_MATERIAL_CATEGORY.test(cat)) {
      return { ok: false, error: "Material category must be Raw Material" };
    }
    const vendorList = purchasedByMaterial.get(midStr) || [];
    const purchasedMap = new Map(vendorList.map((v) => [String(v.vendorId), Number(v.expenseQuantity) || 0]));

    for (const [vendorIdStr, totalQty] of vendorMap) {
      if (!mongoose.Types.ObjectId.isValid(String(vendorIdStr))) {
        return { ok: false, error: "Invalid vendorId" };
      }
      const vendor = await Vendor.findById(vendorIdStr);
      if (!vendor) {
        return { ok: false, error: "Vendor not found" };
      }
      const vidStr = String(vendor._id);
      const purchased = purchasedMap.get(vidStr) ?? 0;
      if (purchased <= 0) {
        return { ok: false, error: `No voucher purchases for ${material.name} from vendor ${vendor.name}` };
      }
      const k = usageKey(midStr, vidStr);
      const used = Number(usageMap.get(k)) || 0;
      const available = Math.max(0, purchased - used);
      if (totalQty > available + 1e-6) {
        return {
          ok: false,
          error: `Quantity for ${material.name} / ${vendor.name} exceeds available (${available})`
        };
      }
      usageMap.set(k, used + totalQty);
      pendingLines.push({ material, vendor, totalQty });
    }
  }

  const recordedAt = new Date();
  const noteStr = note ? String(note).trim() : "";
  for (const line of pendingLines) {
    batch.rawMaterialLines.push({
      materialId: line.material._id,
      vendorId: line.vendor._id,
      quantity: line.totalQty,
      stageKey,
      note: noteStr,
      recordedAt
    });
    rawMaterialsUsed.push({
      materialName: line.material.name,
      vendorName: line.vendor.name,
      quantity: line.totalQty
    });
  }

  return { ok: true, rawMaterialsUsed };
}

router.get("/compost-batches", requireAuth, requirePermission("plantOperations", "view"), async (req, res) => {
  const rows = await CompostLifecycleBatch.find().sort({ startDate: -1 });
  const out = [];
  for (const row of rows) {
    out.push(await toBatchView(row, { populate: false }));
  }
  return res.json(out);
});

router.post("/compost-batches", requireAuth, requirePermission("plantOperations", "create"), async (req, res) => {
  const body = req.body || {};
  const missing = requireFields(body, ["batchName", "startDate", "resources", "rawMaterials"]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const startDate = parseStartDate(body.startDate);
  if (!startDate) {
    return res.status(400).json({ error: "Invalid startDate" });
  }
  const resources = body.resources;
  const rawMaterials = body.rawMaterials;
  if (!Array.isArray(resources) || resources.length === 0) {
    return res.status(400).json({ error: "resources must be a non-empty array of { growingRoomId } for wetting." });
  }
  if (!Array.isArray(rawMaterials) || rawMaterials.length === 0) {
    return res.status(400).json({ error: "rawMaterials must be a non-empty array." });
  }
  let quantity;
  if (body.quantity !== undefined && body.quantity !== null && body.quantity !== "") {
    const q = ensurePositive(body.quantity, "quantity");
    if (!q.ok) {
      return res.status(400).json({ error: q.message });
    }
    quantity = q.value;
  }
  const lagoonFree = await countFreeRoomsOfTypes(["Lagoon"], null);
  if (lagoonFree < 1) {
    return res.status(400).json({
      error: "No Lagoon plant resources are available; cannot create a new batch until capacity frees up."
    });
  }
  const rawNote = body.rawMaterialNote ? String(body.rawMaterialNote).trim() : "";
  try {
    const batch = await CompostLifecycleBatch.create({
      batchName: String(body.batchName).trim(),
      startDate,
      quantity,
      notes: body.notes ? String(body.notes).trim() : "",
      operationalStageKey: "wetting",
      stageMovements: []
    });
    const resPush = await validateAndPushResourceAllocations(batch, "wetting", resources, startDate);
    if (!resPush.ok) {
      await CompostLifecycleBatch.deleteOne({ _id: batch._id });
      return res.status(400).json({ error: resPush.error });
    }
    const rawRes = await applyRawMaterialsForStage(batch, "wetting", rawMaterials, rawNote);
    if (!rawRes.ok) {
      await CompostLifecycleBatch.deleteOne({ _id: batch._id });
      return res.status(400).json({ error: rawRes.error });
    }
    batch.stageMovements.push({
      movedAt: new Date(),
      fromStage: "initial",
      toStage: "wetting",
      resourcesUsed: resPush.resourcesUsed,
      rawMaterialsUsed: rawRes.rawMaterialsUsed
    });
    await batch.save();
    return res.status(201).json(await toBatchView(batch));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Batch name already exists" });
    }
    throw err;
  }
});

router.get("/compost-batches/:id", requireAuth, requirePermission("plantOperations", "view"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid batch id" });
  }
  const batch = await CompostLifecycleBatch.findById(req.params.id);
  if (!batch) {
    return res.status(404).json({ error: "Batch not found" });
  }
  return res.json(await toBatchView(batch));
});

router.patch("/compost-batches/:id", requireAuth, requirePermission("plantOperations", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid batch id" });
  }
  const batch = await CompostLifecycleBatch.findById(req.params.id);
  if (!batch) {
    return res.status(404).json({ error: "Batch not found" });
  }
  const body = req.body || {};
  if (body.batchName !== undefined) {
    batch.batchName = String(body.batchName).trim();
  }
  if (body.startDate !== undefined) {
    const d = parseStartDate(body.startDate);
    if (!d) {
      return res.status(400).json({ error: "Invalid startDate" });
    }
    batch.startDate = d;
  }
  if (body.notes !== undefined) {
    batch.notes = String(body.notes).trim();
  }
  if (body.quantity !== undefined) {
    if (body.quantity === null || body.quantity === "") {
      batch.quantity = undefined;
    } else {
      const q = ensurePositive(body.quantity, "quantity");
      if (!q.ok) {
        return res.status(400).json({ error: q.message });
      }
      batch.quantity = q.value;
    }
  }
  if ("manualStatus" in body) {
    const norm = normalizeManualStatus(body.manualStatus);
    if (!norm.ok) {
      return res.status(400).json({ error: norm.error });
    }
    batch.manualStatus = norm.value || undefined;
  }
  try {
    await batch.save();
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Batch name already exists" });
    }
    throw err;
  }
  return res.json(await toBatchView(await CompostLifecycleBatch.findById(batch._id)));
});

router.post(
  "/compost-batches/:id/advance-stage",
  requireAuth,
  requirePermission("plantOperations", "edit"),
  async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid batch id" });
    }
    const batch = await CompostLifecycleBatch.findById(req.params.id);
    if (!batch) {
      return res.status(404).json({ error: "Batch not found" });
    }
    const now = new Date();
    const op = operationalStageFromDoc(batch, now);
    if (op === "done") {
      return res.status(400).json({ error: "Batch is already at compost ready; cannot advance further." });
    }
    const nextKey = getNextStageKey(op);
    if (!nextKey) {
      return res.status(400).json({ error: "Cannot determine next stage." });
    }
    const typesNeeded = resourceTypesForCompostStatus(nextKey);
    if (nextKey !== "done" && typesNeeded.length) {
      const free = await countFreeRoomsOfTypes(typesNeeded, batch._id);
      if (free < 1) {
        return res.status(400).json({
          error: `No available ${typesNeeded.join(" / ")} plant resources for the next stage. Advance is blocked until capacity frees up.`
        });
      }
    }
    const body = req.body || {};
    const resources = body.resources;
    const rawMaterials = body.rawMaterials;
    const note = body.note ? String(body.note).trim() : "";

    const endDateSnapshot = batch.resourceAllocations.map((a) => ({ doc: a, endDate: a.endDate }));
    function revertEndDates() {
      for (const s of endDateSnapshot) {
        s.doc.endDate = s.endDate;
      }
    }
    function closeOpenAllocations() {
      const t = new Date();
      for (const a of batch.resourceAllocations) {
        if (allocationIsOpen(a)) {
          a.endDate = t;
        }
      }
    }

    const lenBeforeNewResources = batch.resourceAllocations.length;
    const lenBeforeNewRaw = batch.rawMaterialLines.length;

    closeOpenAllocations();

    if (nextKey === "done") {
      let rawMaterialsUsed = [];
      if (Array.isArray(rawMaterials) && rawMaterials.length) {
        const rawRes = await applyRawMaterialsForStage(batch, nextKey, rawMaterials, note);
        if (!rawRes.ok) {
          revertEndDates();
          return res.status(400).json({ error: rawRes.error });
        }
        rawMaterialsUsed = rawRes.rawMaterialsUsed;
      }
      batch.stageMovements.push({
        movedAt: now,
        fromStage: op,
        toStage: nextKey,
        resourcesUsed: [],
        rawMaterialsUsed
      });
      batch.operationalStageKey = nextKey;
      await batch.save();
      return res.json(await toBatchView(await CompostLifecycleBatch.findById(batch._id)));
    }

    const resPush = await validateAndPushResourceAllocations(batch, nextKey, resources || [], now);
    if (!resPush.ok) {
      revertEndDates();
      return res.status(400).json({ error: resPush.error });
    }
    const rawRes = await applyRawMaterialsForStage(batch, nextKey, rawMaterials || [], note);
    if (!rawRes.ok) {
      revertEndDates();
      while (batch.resourceAllocations.length > lenBeforeNewResources) {
        batch.resourceAllocations.pop();
      }
      return res.status(400).json({ error: rawRes.error });
    }
    batch.stageMovements.push({
      movedAt: now,
      fromStage: op,
      toStage: nextKey,
      resourcesUsed: resPush.resourcesUsed,
      rawMaterialsUsed: rawRes.rawMaterialsUsed
    });
    batch.operationalStageKey = nextKey;
    try {
      await batch.save();
    } catch (err) {
      revertEndDates();
      while (batch.resourceAllocations.length > lenBeforeNewResources) {
        batch.resourceAllocations.pop();
      }
      while (batch.rawMaterialLines.length > lenBeforeNewRaw) {
        batch.rawMaterialLines.pop();
      }
      throw err;
    }
    return res.json(await toBatchView(await CompostLifecycleBatch.findById(batch._id)));
  }
);

router.delete("/compost-batches/:id", requireAuth, requireAdmin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid batch id" });
  }
  const batch = await CompostLifecycleBatch.findById(req.params.id);
  if (!batch) {
    return res.status(404).json({ error: "Batch not found" });
  }
  const st = operationalStageFromDoc(batch, new Date());
  if (st === "done") {
    return res.status(400).json({
      error: "Cannot delete a batch that has reached compost ready stage."
    });
  }
  await batch.deleteOne();
  return res.json({ ok: true });
});

router.post(
  "/compost-batches/:id/resources",
  requireAuth,
  requirePermission("plantOperations", "edit"),
  async (req, res) => {
    return res.status(400).json({
      error:
        "Resources are assigned only when creating a batch (wetting) or advancing a stage. Use POST /plant-ops/compost-batches/:id/advance-stage with a resources array."
    });
  }
);

router.delete(
  "/compost-batches/:id/resources/:allocationId",
  requireAuth,
  requirePermission("plantOperations", "edit"),
  async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid batch id" });
    }
    const batch = await CompostLifecycleBatch.findById(req.params.id);
    if (!batch) {
      return res.status(404).json({ error: "Batch not found" });
    }
    const sub = batch.resourceAllocations.id(req.params.allocationId);
    if (!sub) {
      return res.status(404).json({ error: "Allocation not found" });
    }
    sub.deleteOne();
    await batch.save();
    return res.json(await toBatchView(await CompostLifecycleBatch.findById(batch._id)));
  }
);

router.post(
  "/compost-batches/:id/raw-materials",
  requireAuth,
  requirePermission("plantOperations", "edit"),
  async (req, res) => {
    return res.status(400).json({
      error:
        "Raw materials are recorded only when creating a batch (wetting) or advancing a stage. Use POST /plant-ops/compost-batches/:id/advance-stage with a rawMaterials array."
    });
  }
);

router.delete(
  "/compost-batches/:id/raw-materials/:lineId",
  requireAuth,
  requirePermission("plantOperations", "edit"),
  async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid batch id" });
    }
    const batch = await CompostLifecycleBatch.findById(req.params.id);
    if (!batch) {
      return res.status(404).json({ error: "Batch not found" });
    }
    const sub = batch.rawMaterialLines.id(req.params.lineId);
    if (!sub) {
      return res.status(404).json({ error: "Line not found" });
    }
    sub.deleteOne();
    await batch.save();
    return res.json(await toBatchView(await CompostLifecycleBatch.findById(batch._id)));
  }
);

router.get("/raw-materials", requireAuth, requirePermission("plantOperations", "view"), async (req, res) => {
  const all = await Material.find().sort({ name: 1 }).select("name unit category description");
  const materials = all.filter((m) => RAW_MATERIAL_CATEGORY.test((m.category || "").trim()));
  return res.json(materials);
});

/**
 * Raw materials (category Raw Material): voucher quantities by vendor minus quantities committed on compost batches.
 * Optional query: start, end (ISO date strings) to filter voucher dateOfPurchase.
 */
router.get(
  "/raw-materials-expense-summary",
  requireAuth,
  requirePermission("plantOperations", "view"),
  async (req, res) => {
    const dateMatch = buildVoucherDateMatch(req.query.start, req.query.end);
    const rows = await computeRawMaterialStockSummary(dateMatch);
    return res.json(rows);
  }
);

router.get(
  "/available-plant-resources",
  requireAuth,
  requirePermission("plantOperations", "view"),
  async (req, res) => {
    const excludeBatchId =
      req.query.excludeBatchId && mongoose.Types.ObjectId.isValid(String(req.query.excludeBatchId))
        ? new mongoose.Types.ObjectId(String(req.query.excludeBatchId))
        : null;
    const busy = await buildBusyGrowingRoomIdSet(excludeBatchId);
    const roomMeta = await buildRoomAvailabilityMeta(excludeBatchId);
    const rooms = await GrowingRoom.find()
      .sort({ name: 1 })
      .select("name resourceType locationInPlant capacityTons maxBagCapacity")
      .lean();
    const byType = { Lagoon: [], Tunnel: [], Bunker: [], Room: [], Other: [] };
    for (const r of rooms) {
      const t = r.resourceType || "Room";
      const bucket = Object.prototype.hasOwnProperty.call(byType, t) ? t : "Other";
      const idStr = String(r._id);
      const inUse = busy.has(idStr);
      const m = inUse ? roomMeta.get(idStr) : null;
      byType[bucket].push({
        _id: r._id,
        name: r.name,
        resourceType: t,
        locationInPlant: r.locationInPlant,
        capacityTons: r.capacityTons ?? r.maxBagCapacity,
        available: !inUse,
        availableFrom: m?.availableFrom ?? null,
        holdingBatchName: m?.holdingBatchName ?? null,
        allocationStageKey: m?.allocationStageKey ?? null
      });
    }
    return res.json({ byType });
  }
);

router.get("/resource-options", requireAuth, requirePermission("plantOperations", "view"), async (req, res) => {
  const status = String(req.query.status || "").trim();
  if (!COMPOST_STATUS_KEYS.includes(status)) {
    return res.status(400).json({ error: "Query status must be a valid compost lifecycle status" });
  }
  const types = resourceTypesForCompostStatus(status);
  const rooms = await GrowingRoom.find({ resourceType: { $in: types } })
    .sort({ name: 1 })
    .select("name resourceType locationInPlant capacityTons maxBagCapacity");
  const currentBatchId = req.query.excludeBatchId ? String(req.query.excludeBatchId) : null;
  const excludeOid =
    currentBatchId && mongoose.Types.ObjectId.isValid(currentBatchId)
      ? new mongoose.Types.ObjectId(currentBatchId)
      : null;
  const busy = await buildBusyGrowingRoomIdSet(excludeOid);
  if (excludeOid) {
    const self = await CompostLifecycleBatch.findById(excludeOid).select("resourceAllocations").lean();
    if (self) {
      for (const a of self.resourceAllocations || []) {
        if (allocationIsOpen(a)) {
          busy.delete(String(a.growingRoomId));
        }
      }
    }
  }
  const list = rooms.map((r) => ({
    _id: r._id,
    name: r.name,
    resourceType: r.resourceType,
    locationInPlant: r.locationInPlant,
    capacityTons: r.capacityTons ?? r.maxBagCapacity,
    available: !busy.has(String(r._id))
  }));
  return res.json({ status, allowedTypes: types, resources: list });
});

export default router;
