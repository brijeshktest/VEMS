import express from "express";
import Stage from "../models/Stage.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { requireTenantContext } from "../middleware/companyScope.js";
import { requireFields, ensurePositive } from "../utils/validators.js";
import { logChange } from "../utils/changeLog.js";

const router = express.Router();
const TARGET_CYCLE_DAYS = 53;

function normalizeActivities(input = {}) {
  return {
    watering: Boolean(input.watering),
    ruffling: Boolean(input.ruffling),
    thumping: Boolean(input.thumping),
    ventilation: Boolean(input.ventilation)
  };
}

async function totalIntervalDays(req, excludeId = null) {
  const q = { companyId: req.companyId };
  if (excludeId) q._id = { $ne: excludeId };
  const stages = await Stage.find(q);
  return stages.reduce((sum, stage) => sum + Number(stage.intervalDays || 0), 0);
}

router.get("/", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const stages = await Stage.find({ companyId: req.companyId }).sort({ sequenceOrder: 1 });
  return res.json(stages);
});

router.post("/", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const missing = requireFields(req.body, ["name", "sequenceOrder", "intervalDays"]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const sequenceOrder = ensurePositive(req.body.sequenceOrder, "sequenceOrder");
  const intervalDays = ensurePositive(req.body.intervalDays, "intervalDays");
  if (!sequenceOrder.ok || !intervalDays.ok) {
    return res.status(400).json({ error: sequenceOrder.message || intervalDays.message });
  }
  const existingOrder = await Stage.findOne({ companyId: req.companyId, sequenceOrder: sequenceOrder.value });
  if (existingOrder) {
    return res.status(400).json({ error: "Sequence order already in use" });
  }
  const existingName = await Stage.findOne({ companyId: req.companyId, name: req.body.name });
  if (existingName) {
    return res.status(400).json({ error: "Stage name already exists" });
  }
  const currentTotal = await totalIntervalDays(req);
  if (currentTotal + intervalDays.value > TARGET_CYCLE_DAYS) {
    return res.status(400).json({ error: `Total stage interval exceeds ${TARGET_CYCLE_DAYS} days` });
  }
  const stage = await Stage.create({
    companyId: req.companyId,
    name: req.body.name,
    sequenceOrder: sequenceOrder.value,
    intervalDays: intervalDays.value,
    humidity: Number(req.body.humidity || 0),
    temperature: Number(req.body.temperature || 0),
    co2Level: Number(req.body.co2Level || 0),
    notes: req.body.notes || "",
    activities: normalizeActivities(req.body.activities || {})
  });
  await logChange({
    companyId: req.companyId,
    entityType: "stage",
    entityId: stage._id,
    action: "create",
    user: req.user,
    before: null,
    after: stage.toObject()
  });
  return res.status(201).json(stage);
});

router.put("/:id", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const stage = await Stage.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!stage) {
    return res.status(404).json({ error: "Stage not found" });
  }
  const before = stage.toObject();
  if (req.body.sequenceOrder !== undefined) {
    const sequenceOrder = ensurePositive(req.body.sequenceOrder, "sequenceOrder");
    if (!sequenceOrder.ok) {
      return res.status(400).json({ error: sequenceOrder.message });
    }
    const existingOrder = await Stage.findOne({
      companyId: req.companyId,
      sequenceOrder: sequenceOrder.value,
      _id: { $ne: stage._id }
    });
    if (existingOrder) {
      return res.status(400).json({ error: "Sequence order already in use" });
    }
    stage.sequenceOrder = sequenceOrder.value;
  }
  if (req.body.intervalDays !== undefined) {
    const intervalDays = ensurePositive(req.body.intervalDays, "intervalDays");
    if (!intervalDays.ok) {
      return res.status(400).json({ error: intervalDays.message });
    }
    const currentTotal = await totalIntervalDays(req, stage._id);
    if (currentTotal + intervalDays.value > TARGET_CYCLE_DAYS) {
      return res.status(400).json({ error: `Total stage interval exceeds ${TARGET_CYCLE_DAYS} days` });
    }
    stage.intervalDays = intervalDays.value;
  }
  if (req.body.humidity !== undefined) {
    stage.humidity = Number(req.body.humidity || 0);
  }
  if (req.body.temperature !== undefined) {
    stage.temperature = Number(req.body.temperature || 0);
  }
  if (req.body.co2Level !== undefined) {
    stage.co2Level = Number(req.body.co2Level || 0);
  }
  if (req.body.notes !== undefined) {
    stage.notes = req.body.notes || "";
  }
  if (req.body.name) {
    const existingName = await Stage.findOne({
      companyId: req.companyId,
      name: req.body.name,
      _id: { $ne: stage._id }
    });
    if (existingName) {
      return res.status(400).json({ error: "Stage name already exists" });
    }
    stage.name = req.body.name;
  }
  if (req.body.activities) {
    stage.activities = normalizeActivities(req.body.activities);
  }
  await stage.save();
  await logChange({
    companyId: req.companyId,
    entityType: "stage",
    entityId: stage._id,
    action: "update",
    user: req.user,
    before,
    after: stage.toObject()
  });
  return res.json(stage);
});

router.delete("/:id", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const stage = await Stage.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!stage) {
    return res.status(404).json({ error: "Stage not found" });
  }
  const before = stage.toObject();
  await stage.deleteOne();
  await logChange({
    companyId: req.companyId,
    entityType: "stage",
    entityId: stage._id,
    action: "delete",
    user: req.user,
    before,
    after: null
  });
  return res.json({ ok: true });
});

router.get("/summary", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const stages = await Stage.find({ companyId: req.companyId });
  const totalDays = stages.reduce((sum, stage) => sum + Number(stage.intervalDays || 0), 0);
  return res.json({ totalDays, isValid: totalDays === TARGET_CYCLE_DAYS });
});

export default router;
