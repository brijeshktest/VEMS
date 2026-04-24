import express from "express";
import mongoose from "mongoose";
import GrowingRoom, { PLANT_RESOURCE_TYPES } from "../models/GrowingRoom.js";
import Stage from "../models/Stage.js";
import Company from "../models/Company.js";
import { requireAuth, requireAdmin, requirePermission, resolvePermissions } from "../middleware/auth.js";
import { requireTenantContext } from "../middleware/companyScope.js";
import { requireFields, ensurePositive } from "../utils/validators.js";
import { logChange } from "../utils/changeLog.js";
import { ensureDefaultRoomsForCompany } from "../utils/companySeed.js";

const router = express.Router();

function parseOptionalCoordinate(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: undefined };
  }
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) {
    return { ok: false, message: `${fieldName} must be a number when provided` };
  }
  return { ok: true, value: numberValue };
}

export async function ensureRoomsSeeded() {
  const companies = await Company.find({}).select("_id").lean();
  for (const c of companies) {
    await ensureDefaultRoomsForCompany(c._id);
  }
  await GrowingRoom.updateMany(
    { $or: [{ capacityTons: { $exists: false } }, { capacityTons: null }] },
    [{ $set: { capacityTons: "$maxBagCapacity" } }]
  );
}

router.get("/", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const rooms = await GrowingRoom.find({ companyId: req.companyId })
    .populate("currentStageId")
    .sort({ name: 1 });
  return res.json(rooms);
});

router.get("/status", requireAuth, requireTenantContext, async (req, res) => {
  if (req.enabledModuleKeys && typeof req.enabledModuleKeys.has === "function") {
    const okRoom = req.enabledModuleKeys.has("roomStages") || req.enabledModuleKeys.has("roomActivities");
    if (!okRoom) {
      return res.status(403).json({ error: "Room operations module is not enabled for this plant" });
    }
  }
  if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
    const permissions = await resolvePermissions(req.user?.roleIds || [], req.companyId);
    const canViewStages = Boolean(permissions.roomStages?.view || permissions.roomStages?.edit);
    const canViewActivities = Boolean(permissions.roomActivities?.view || permissions.roomActivities?.edit);
    if (!canViewStages && !canViewActivities) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
  }
  const onlyRoomResources = ["1", "true", "yes"].includes(
    String(req.query.onlyRoomResources || "").trim().toLowerCase()
  );
  const roomFilter = onlyRoomResources
    ? {
        companyId: req.companyId,
        $or: [{ resourceType: "Room" }, { resourceType: { $exists: false } }, { resourceType: null }]
      }
    : { companyId: req.companyId };
  const rooms = await GrowingRoom.find(roomFilter).populate("currentStageId").sort({ name: 1 });
  const stages = await Stage.find({ companyId: req.companyId }).sort({ sequenceOrder: 1 });
  const stageLookup = new Map(stages.map((stage) => [stage._id.toString(), stage]));
  const orderedStages = stages.map((stage) => stage._id.toString());
  const now = Date.now();
  const results = [];
  for (const room of rooms) {
    const currentStage = room.currentStageId ? stageLookup.get(room.currentStageId._id.toString()) : null;
    let nextStage = null;
    if (currentStage) {
      const currentIndex = orderedStages.indexOf(currentStage._id.toString());
      if (currentIndex >= 0 && orderedStages.length) {
        const nextIndex = (currentIndex + 1) % orderedStages.length;
        nextStage = stageLookup.get(orderedStages[nextIndex]);
      }
    } else if (stages.length) {
      nextStage = stages[0];
    }
    const startedAt = room.stageStartedAt ? new Date(room.stageStartedAt).getTime() : null;
    const intervalDays = currentStage ? currentStage.intervalDays : 0;
    const dueAt = startedAt ? startedAt + intervalDays * 24 * 60 * 60 * 1000 : null;
    const dueNextStage = Boolean(dueAt && now >= dueAt);
    const daysElapsed = startedAt ? Math.floor((now - startedAt) / (24 * 60 * 60 * 1000)) : 0;
    const shouldResetActivities = currentStage && room.activityDay !== daysElapsed;
    if (shouldResetActivities) {
      room.activityDay = daysElapsed;
      room.activityStatus = {
        watering: false,
        ruffling: false,
        thumping: false,
        ventilation: false
      };
      await room.save();
    }
    results.push({
      id: room._id,
      name: room.name,
      currentStage,
      nextStage,
      stageStartedAt: room.stageStartedAt,
      daysElapsed,
      stageIntervalDays: intervalDays,
      dueNextStage,
      activityStatus: room.activityStatus
    });
  }
  return res.json(results);
});

router.post("/", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const {
    name,
    resourceType,
    capacityTons,
    maxBagCapacity,
    powerBackupSource,
    locationInPlant,
    coordinateX,
    coordinateY
  } = req.body || {};
  const missingName = requireFields({ name }, ["name"]);
  if (missingName.length) {
    return res.status(400).json({ error: `Missing fields: ${missingName.join(", ")}` });
  }
  const tonsSource =
    capacityTons !== undefined && capacityTons !== "" ? capacityTons : maxBagCapacity;
  if (tonsSource === undefined || tonsSource === "") {
    return res.status(400).json({ error: "Missing fields: capacityTons or maxBagCapacity" });
  }
  const capacityCheck = ensurePositive(tonsSource, "capacityTons");
  if (!capacityCheck.ok) {
    return res.status(400).json({ error: capacityCheck.message });
  }
  const typeStr = resourceType ? String(resourceType).trim() : "Room";
  if (!PLANT_RESOURCE_TYPES.includes(typeStr)) {
    return res.status(400).json({
      error: `resourceType must be one of: ${PLANT_RESOURCE_TYPES.join(", ")}`
    });
  }
  const xCheck = parseOptionalCoordinate(coordinateX, "coordinateX");
  if (!xCheck.ok) {
    return res.status(400).json({ error: xCheck.message });
  }
  const yCheck = parseOptionalCoordinate(coordinateY, "coordinateY");
  if (!yCheck.ok) {
    return res.status(400).json({ error: yCheck.message });
  }
  const createPayload = {
    companyId: req.companyId,
    name: String(name).trim(),
    resourceType: typeStr,
    capacityTons: capacityCheck.value,
    maxBagCapacity: capacityCheck.value,
    locationInPlant: locationInPlant ? String(locationInPlant).trim() : "",
    powerBackupSource: powerBackupSource ? String(powerBackupSource).trim() : ""
  };
  if (xCheck.value !== undefined) {
    createPayload.coordinateX = xCheck.value;
  }
  if (yCheck.value !== undefined) {
    createPayload.coordinateY = yCheck.value;
  }
  const room = await GrowingRoom.create(createPayload);
  await logChange({
    companyId: req.companyId,
    entityType: "room",
    entityId: room._id,
    action: "create",
    user: req.user,
    before: null,
    after: room.toObject()
  });
  return res.status(201).json(room);
});

router.put("/:id", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid room id" });
  }
  const room = await GrowingRoom.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  const before = room.toObject();
  const body = req.body || {};
  const tonsSource =
    body.capacityTons !== undefined && body.capacityTons !== ""
      ? body.capacityTons
      : body.maxBagCapacity;
  if (tonsSource !== undefined) {
    const capacityCheck = ensurePositive(tonsSource, "capacityTons");
    if (!capacityCheck.ok) {
      return res.status(400).json({ error: capacityCheck.message });
    }
    room.capacityTons = capacityCheck.value;
    room.maxBagCapacity = capacityCheck.value;
  }
  if (body.name !== undefined) {
    room.name = String(body.name).trim();
  }
  if (body.resourceType !== undefined) {
    const typeStr = String(body.resourceType).trim();
    if (!PLANT_RESOURCE_TYPES.includes(typeStr)) {
      return res.status(400).json({
        error: `resourceType must be one of: ${PLANT_RESOURCE_TYPES.join(", ")}`
      });
    }
    room.resourceType = typeStr;
  }
  if (body.powerBackupSource !== undefined) {
    room.powerBackupSource = String(body.powerBackupSource).trim();
  }
  if (body.locationInPlant !== undefined) {
    room.locationInPlant = String(body.locationInPlant).trim();
  }
  if ("coordinateX" in body) {
    const xCheck = parseOptionalCoordinate(body.coordinateX, "coordinateX");
    if (!xCheck.ok) {
      return res.status(400).json({ error: xCheck.message });
    }
    if (xCheck.value === undefined) {
      room.set("coordinateX", undefined);
    } else {
      room.coordinateX = xCheck.value;
    }
  }
  if ("coordinateY" in body) {
    const yCheck = parseOptionalCoordinate(body.coordinateY, "coordinateY");
    if (!yCheck.ok) {
      return res.status(400).json({ error: yCheck.message });
    }
    if (yCheck.value === undefined) {
      room.set("coordinateY", undefined);
    } else {
      room.coordinateY = yCheck.value;
    }
  }
  await room.save();
  await logChange({
    companyId: req.companyId,
    entityType: "room",
    entityId: room._id,
    action: "update",
    user: req.user,
    before,
    after: room.toObject()
  });
  return res.json(room);
});

router.post("/:id/move-stage", requireAuth, requireTenantContext, requirePermission("roomStages", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid room id" });
  }
  const room = await GrowingRoom.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  const before = room.toObject();
  const stages = await Stage.find({ companyId: req.companyId }).sort({ sequenceOrder: 1 });
  if (!stages.length) {
    return res.status(400).json({ error: "No stages configured" });
  }
  let targetStage = null;
  if (req.body.stageId) {
    targetStage = stages.find((stage) => stage._id.toString() === req.body.stageId);
    if (!targetStage) {
      return res.status(400).json({ error: "Stage not found" });
    }
  } else if (room.currentStageId) {
    const currentIndex = stages.findIndex((stage) => stage._id.toString() === room.currentStageId.toString());
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % stages.length : 0;
    targetStage = stages[nextIndex];
  } else {
    targetStage = stages[0];
  }
  room.currentStageId = targetStage._id;
  room.stageStartedAt = new Date();
  room.activityDay = 0;
  room.activityStatus = {
    watering: false,
    ruffling: false,
    thumping: false,
    ventilation: false
  };
  await room.save();
  await logChange({
    companyId: req.companyId,
    entityType: "room",
    entityId: room._id,
    action: "update",
    user: req.user,
    before,
    after: room.toObject()
  });
  const populated = await room.populate("currentStageId");
  return res.json(populated);
});

router.post("/:id/init-stage", requireAuth, requireTenantContext, requirePermission("roomStages", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid room id" });
  }
  const room = await GrowingRoom.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  const before = room.toObject();
  const stages = await Stage.find({ companyId: req.companyId }).sort({ sequenceOrder: 1 });
  if (!stages.length) {
    return res.status(400).json({ error: "No stages configured" });
  }
  const firstStage = stages.find((stage) => stage.sequenceOrder === 1) || stages[0];
  room.currentStageId = firstStage._id;
  room.stageStartedAt = new Date();
  room.activityDay = 0;
  room.activityStatus = {
    watering: false,
    ruffling: false,
    thumping: false,
    ventilation: false
  };
  await room.save();
  await logChange({
    companyId: req.companyId,
    entityType: "room",
    entityId: room._id,
    action: "update",
    user: req.user,
    before,
    after: room.toObject()
  });
  const populated = await room.populate("currentStageId");
  return res.json(populated);
});

router.post("/:id/activities", requireAuth, requireTenantContext, requirePermission("roomActivities", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid room id" });
  }
  const room = await GrowingRoom.findOne({ _id: req.params.id, companyId: req.companyId }).populate("currentStageId");
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  const before = room.toObject();
  const { activity, done } = req.body;
  if (!activity || !["watering", "ruffling", "thumping", "ventilation"].includes(activity)) {
    return res.status(400).json({ error: "Invalid activity" });
  }
  if (!room.currentStageId) {
    return res.status(400).json({ error: "Room has no active stage" });
  }
  if (!room.currentStageId.activities?.[activity]) {
    return res.status(400).json({ error: "Activity not enabled for current stage" });
  }
  room.activityStatus = {
    ...room.activityStatus,
    [activity]: Boolean(done)
  };
  await room.save();
  await logChange({
    companyId: req.companyId,
    entityType: "room",
    entityId: room._id,
    action: "update",
    user: req.user,
    before,
    after: room.toObject()
  });
  return res.json({ ok: true, activityStatus: room.activityStatus });
});

router.delete("/:id", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid room id" });
  }
  const room = await GrowingRoom.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  const before = room.toObject();
  await room.deleteOne();
  await logChange({
    companyId: req.companyId,
    entityType: "room",
    entityId: room._id,
    action: "delete",
    user: req.user,
    before,
    after: null
  });
  return res.json({ ok: true });
});

export default router;
