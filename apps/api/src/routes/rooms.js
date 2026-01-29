import express from "express";
import GrowingRoom from "../models/GrowingRoom.js";
import Stage from "../models/Stage.js";
import { requireAuth, requireAdmin, requirePermission, resolvePermissions } from "../middleware/auth.js";
import { requireFields, ensurePositive } from "../utils/validators.js";

const router = express.Router();

const SEED_ROOMS = [
  { name: "Orion", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Nova", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Cosmos", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Nebula", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Pulsar", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Atlas", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Apollo", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Zenith", maxBagCapacity: 0, powerBackupSource: "" }
];

export async function ensureRoomsSeeded() {
  const count = await GrowingRoom.countDocuments();
  if (count > 0) return;
  await GrowingRoom.insertMany(SEED_ROOMS);
}

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const rooms = await GrowingRoom.find().populate("currentStageId").sort({ name: 1 });
  return res.json(rooms);
});

router.get("/status", requireAuth, async (req, res) => {
  if (req.user?.role !== "admin") {
    const permissions = await resolvePermissions(req.user?.roleIds || []);
    const canViewStages = Boolean(permissions.roomStages?.view || permissions.roomStages?.edit);
    const canViewActivities = Boolean(permissions.roomActivities?.view || permissions.roomActivities?.edit);
    if (!canViewStages && !canViewActivities) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
  }
  const rooms = await GrowingRoom.find().populate("currentStageId").sort({ name: 1 });
  const stages = await Stage.find().sort({ sequenceOrder: 1 });
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
        thumping: false
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

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const missing = requireFields(req.body, ["name", "maxBagCapacity"]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const maxBagCapacity = ensurePositive(req.body.maxBagCapacity, "maxBagCapacity");
  if (!maxBagCapacity.ok) {
    return res.status(400).json({ error: maxBagCapacity.message });
  }
  const room = await GrowingRoom.create({
    name: req.body.name,
    maxBagCapacity: maxBagCapacity.value,
    powerBackupSource: req.body.powerBackupSource || ""
  });
  return res.status(201).json(room);
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const room = await GrowingRoom.findById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  if (req.body.maxBagCapacity !== undefined) {
    const maxBagCapacity = ensurePositive(req.body.maxBagCapacity, "maxBagCapacity");
    if (!maxBagCapacity.ok) {
      return res.status(400).json({ error: maxBagCapacity.message });
    }
    room.maxBagCapacity = maxBagCapacity.value;
  }
  room.name = req.body.name ?? room.name;
  room.powerBackupSource = req.body.powerBackupSource ?? room.powerBackupSource;
  await room.save();
  return res.json(room);
});

router.post("/:id/move-stage", requireAuth, requirePermission("roomStages", "edit"), async (req, res) => {
  const room = await GrowingRoom.findById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  const stages = await Stage.find().sort({ sequenceOrder: 1 });
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
    thumping: false
  };
  await room.save();
  const populated = await room.populate("currentStageId");
  return res.json(populated);
});

router.post("/:id/init-stage", requireAuth, requirePermission("roomStages", "edit"), async (req, res) => {
  const room = await GrowingRoom.findById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  const stages = await Stage.find().sort({ sequenceOrder: 1 });
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
    thumping: false
  };
  await room.save();
  const populated = await room.populate("currentStageId");
  return res.json(populated);
});

router.post("/:id/activities", requireAuth, requirePermission("roomActivities", "edit"), async (req, res) => {
  const room = await GrowingRoom.findById(req.params.id).populate("currentStageId");
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  const { activity, done } = req.body;
  if (!activity || !["watering", "ruffling", "thumping"].includes(activity)) {
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
  return res.json({ ok: true, activityStatus: room.activityStatus });
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const room = await GrowingRoom.findById(req.params.id);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  await room.deleteOne();
  return res.json({ ok: true });
});

export default router;
