import express from "express";
import TunnelBatch from "../models/TunnelBatch.js";
import AppSettings from "../models/AppSettings.js";
import { requireAuth, requireAdmin, requirePermission, resolvePermissions } from "../middleware/auth.js";
import { logChange } from "../utils/changeLog.js";

const router = express.Router();
const DAY_MS = 24 * 60 * 60 * 1000;

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  return rounded > 0 ? rounded : fallback;
}

async function getOrCreateSettings() {
  let settings = await AppSettings.findOne();
  if (!settings) {
    settings = await AppSettings.create({});
  }
  return settings;
}

function getConfig(settingsDoc) {
  return {
    bunkerCount: readPositiveInt(settingsDoc?.bunkerCount, 3),
    tunnelCount: readPositiveInt(settingsDoc?.tunnelCount, 2),
    bunkerIntervalDays: readPositiveInt(settingsDoc?.bunkerIntervalDays, 2),
    tunnelIntervalDays: readPositiveInt(settingsDoc?.tunnelIntervalDays, 10),
    autoAdvanceEnabled: Boolean(settingsDoc?.autoAdvanceEnabled)
  };
}

function describeStage(stageType, stageNumber) {
  if (stageType === "bunker") return `Bunker ${stageNumber}`;
  if (stageType === "tunnel") return `Tunnel ${stageNumber}`;
  return "Growing room";
}

function computeDue(batch, config) {
  const started = new Date(batch.stageStartedAt).getTime();
  const interval = batch.currentStageType === "bunker" ? config.bunkerIntervalDays : config.tunnelIntervalDays;
  const dueAtMs = started + interval * DAY_MS;
  const now = Date.now();
  const daysElapsed = Math.floor((now - started) / DAY_MS);
  const daysRemaining = Math.max(0, Math.ceil((dueAtMs - now) / DAY_MS));
  return {
    dueAt: new Date(dueAtMs),
    due: now >= dueAtMs,
    overdueDays: now >= dueAtMs ? Math.floor((now - dueAtMs) / DAY_MS) : 0,
    daysElapsed,
    daysRemaining
  };
}

function nextStage(batch, config) {
  if (batch.currentStageType === "bunker") {
    if (batch.currentStageNumber < config.bunkerCount) {
      return { stageType: "bunker", stageNumber: batch.currentStageNumber + 1 };
    }
    return { stageType: "tunnel", stageNumber: null };
  }
  if (batch.currentStageType === "tunnel") {
    return { stageType: "growing_room", stageNumber: 1 };
  }
  return null;
}

async function canAccessTunnelOps(req) {
  if (req.user?.role === "admin") return true;
  const permissions = await resolvePermissions(req.user?.roleIds || []);
  return Boolean(permissions.tunnelBunkerOps?.view || permissions.tunnelBunkerOps?.edit);
}

async function getTunnelOccupancy(config) {
  const activeTunnelBatches = await TunnelBatch.find({
    status: "active",
    currentStageType: "tunnel"
  }).select("batchCode currentStageNumber");
  const occupiedByTunnel = {};
  for (const item of activeTunnelBatches) {
    occupiedByTunnel[item.currentStageNumber] = item.batchCode;
  }
  const tunnels = [];
  for (let tunnel = 1; tunnel <= config.tunnelCount; tunnel += 1) {
    tunnels.push({
      tunnelNumber: tunnel,
      occupied: Boolean(occupiedByTunnel[tunnel]),
      occupiedByBatchCode: occupiedByTunnel[tunnel] || ""
    });
  }
  return tunnels;
}

function serializeBatch(batch, config, tunnelAvailability = []) {
  const batchObj = batch.toObject ? batch.toObject() : batch;
  const due = batchObj.status === "active" ? computeDue(batchObj, config) : null;
  const next = batchObj.status === "active" ? nextStage(batchObj, config) : null;
  const requiresTunnelSelection =
    batchObj.status === "active" &&
    batchObj.currentStageType === "bunker" &&
    batchObj.currentStageNumber === config.bunkerCount;
  return {
    id: batchObj._id,
    batchCode: batchObj.batchCode,
    compostType: batchObj.compostType,
    status: batchObj.status,
    currentStageType: batchObj.currentStageType,
    currentStageNumber: batchObj.currentStageNumber,
    currentStageLabel: describeStage(batchObj.currentStageType, batchObj.currentStageNumber),
    nextStageLabel: requiresTunnelSelection
      ? "Select tunnel"
      : next
        ? describeStage(next.stageType, next.stageNumber)
        : "—",
    stageStartedAt: batchObj.stageStartedAt,
    shiftedToGrowingRoomAt: batchObj.shiftedToGrowingRoomAt,
    daysElapsed: due?.daysElapsed ?? null,
    daysRemaining: due?.daysRemaining ?? null,
    dueAt: due?.dueAt ?? null,
    due: due?.due ?? false,
    overdueDays: due?.overdueDays ?? 0,
    requiresTunnelSelection,
    availableTunnels: requiresTunnelSelection ? tunnelAvailability : [],
    stageHistory: batchObj.stageHistory || [],
    notes: batchObj.notes || ""
  };
}

async function advanceBatch(batch, config, user, { notes = "", tunnelNumber } = {}) {
  const fromType = batch.currentStageType;
  const fromNumber = batch.currentStageNumber;
  const next = nextStage(batch, config);
  if (!next) return batch;
  const now = new Date();
  batch.stageHistory.push({
    stageType: fromType === "growing_room" ? "tunnel" : fromType,
    stageNumber: fromNumber,
    startedAt: batch.stageStartedAt,
    movedAt: now,
    movedByUserId: user?.id ? String(user.id) : "",
    movedByName: user?.name || "",
    notes: notes || ""
  });
  if (next.stageType === "tunnel" && next.stageNumber == null) {
    const selectedTunnel = Number(tunnelNumber);
    if (!Number.isFinite(selectedTunnel) || selectedTunnel < 1 || selectedTunnel > config.tunnelCount) {
      throw new Error("Select a valid tunnel number");
    }
    const occupied = await TunnelBatch.findOne({
      _id: { $ne: batch._id },
      status: "active",
      currentStageType: "tunnel",
      currentStageNumber: selectedTunnel
    }).lean();
    if (occupied) {
      throw new Error(`Tunnel ${selectedTunnel} is currently occupied by ${occupied.batchCode}`);
    }
    batch.currentStageType = "tunnel";
    batch.currentStageNumber = selectedTunnel;
    batch.stageStartedAt = now;
  } else if (next.stageType === "growing_room") {
    batch.currentStageType = "growing_room";
    batch.currentStageNumber = 1;
    batch.status = "shifted_to_growing_room";
    batch.shiftedToGrowingRoomAt = now;
    batch.stageStartedAt = now;
  } else {
    batch.currentStageType = next.stageType;
    batch.currentStageNumber = next.stageNumber;
    batch.stageStartedAt = now;
  }
  await batch.save();
  return batch;
}

router.get("/config", requireAuth, requireAdmin, async (_req, res) => {
  const settings = await getOrCreateSettings();
  return res.json(getConfig(settings));
});

router.put("/config", requireAuth, requireAdmin, async (req, res) => {
  const settings = await getOrCreateSettings();
  const before = settings.toObject();
  settings.bunkerCount = readPositiveInt(req.body?.bunkerCount, 3);
  settings.tunnelCount = readPositiveInt(req.body?.tunnelCount, 2);
  settings.bunkerIntervalDays = readPositiveInt(req.body?.bunkerIntervalDays, 2);
  settings.tunnelIntervalDays = readPositiveInt(req.body?.tunnelIntervalDays, 10);
  settings.autoAdvanceEnabled = Boolean(req.body?.autoAdvanceEnabled);
  await settings.save();
  await logChange({
    entityType: "tunnel_bunker_config",
    entityId: settings._id,
    action: "update",
    user: req.user,
    before,
    after: settings.toObject()
  });
  return res.json(getConfig(settings));
});

router.get("/alerts", requireAuth, async (req, res) => {
  if (!(await canAccessTunnelOps(req))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  const settings = await getOrCreateSettings();
  const config = getConfig(settings);
  const tunnelAvailability = await getTunnelOccupancy(config);
  const activeBatches = await TunnelBatch.find({ status: "active" }).sort({ stageStartedAt: 1 });
  const dueItems = activeBatches
    .map((batch) => serializeBatch(batch, config, tunnelAvailability))
    .filter((batch) => batch.due)
    .map((batch) => ({
      id: batch.id,
      batchCode: batch.batchCode,
      currentStageLabel: batch.currentStageLabel,
      nextStageLabel: batch.nextStageLabel,
      requiresTunnelSelection: batch.requiresTunnelSelection,
      availableTunnels: batch.availableTunnels,
      dueAt: batch.dueAt,
      overdueDays: batch.overdueDays
    }));
  return res.json({ dueItems });
});

router.post("/auto-advance", requireAuth, requirePermission("tunnelBunkerOps", "edit"), async (req, res) => {
  const settings = await getOrCreateSettings();
  const config = getConfig(settings);
  const activeBatches = await TunnelBatch.find({ status: "active" }).sort({ stageStartedAt: 1 });
  let moved = 0;
  for (const batch of activeBatches) {
    const due = computeDue(batch, config);
    if (!due.due) continue;
    if (batch.currentStageType === "bunker" && batch.currentStageNumber === config.bunkerCount) continue;
    const before = batch.toObject();
    await advanceBatch(batch, config, req.user, { notes: "Auto-advanced on due time" });
    await logChange({
      entityType: "tunnel_batch",
      entityId: batch._id,
      action: "update",
      user: req.user,
      before,
      after: batch.toObject()
    });
    moved += 1;
  }
  return res.json({ ok: true, moved });
});

router.get("/batches", requireAuth, async (req, res) => {
  if (!(await canAccessTunnelOps(req))) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  const settings = await getOrCreateSettings();
  const config = getConfig(settings);
  const tunnelAvailability = await getTunnelOccupancy(config);
  if (config.autoAdvanceEnabled) {
    const dueBatches = await TunnelBatch.find({ status: "active" });
    for (const batch of dueBatches) {
      const due = computeDue(batch, config);
      if (due.due) {
        if (batch.currentStageType === "bunker" && batch.currentStageNumber === config.bunkerCount) {
          continue;
        }
        await advanceBatch(batch, config, req.user, { notes: "Auto-advanced by automation setting" });
      }
    }
  }
  const statusFilter = String(req.query.status || "").trim();
  const filter = statusFilter === "active" || statusFilter === "shifted_to_growing_room" ? { status: statusFilter } : {};
  const batches = await TunnelBatch.find(filter).sort({ createdAt: -1 });
  return res.json({
    config,
    batches: batches.map((batch) => serializeBatch(batch, config, tunnelAvailability))
  });
});

router.post("/batches", requireAuth, requirePermission("tunnelBunkerOps", "create"), async (req, res) => {
  const settings = await getOrCreateSettings();
  const config = getConfig(settings);
  const batchCode = String(req.body?.batchCode || "").trim();
  if (!batchCode) {
    return res.status(400).json({ error: "batchCode is required" });
  }
  const exists = await TunnelBatch.findOne({ batchCode });
  if (exists) {
    return res.status(400).json({ error: "Batch code already exists" });
  }
  const batch = await TunnelBatch.create({
    batchCode,
    compostType: String(req.body?.compostType || "Mushroom compost").trim() || "Mushroom compost",
    notes: String(req.body?.notes || "").trim(),
    status: "active",
    currentStageType: "bunker",
    currentStageNumber: 1,
    stageStartedAt: new Date()
  });
  await logChange({
    entityType: "tunnel_batch",
    entityId: batch._id,
    action: "create",
    user: req.user,
    before: null,
    after: batch.toObject()
  });
  return res.status(201).json(serializeBatch(batch, config, []));
});

router.post("/batches/:id/move-next", requireAuth, requirePermission("tunnelBunkerOps", "edit"), async (req, res) => {
  const settings = await getOrCreateSettings();
  const config = getConfig(settings);
  const batch = await TunnelBatch.findById(req.params.id);
  if (!batch) {
    return res.status(404).json({ error: "Batch not found" });
  }
  if (batch.status !== "active") {
    return res.status(400).json({ error: "Batch is already shifted to growing room" });
  }
  try {
    const before = batch.toObject();
    await advanceBatch(batch, config, req.user, {
      notes: String(req.body?.notes || "").trim(),
      tunnelNumber: req.body?.tunnelNumber
    });
    await logChange({
      entityType: "tunnel_batch",
      entityId: batch._id,
      action: "update",
      user: req.user,
      before,
      after: batch.toObject()
    });
    const tunnelAvailability = await getTunnelOccupancy(config);
    return res.json(serializeBatch(batch, config, tunnelAvailability));
  } catch (error) {
    return res.status(400).json({ error: error.message || "Unable to move batch" });
  }
});

export default router;
