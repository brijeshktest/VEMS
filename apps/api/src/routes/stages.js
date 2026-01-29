import express from "express";
import Stage from "../models/Stage.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { requireFields, ensurePositive } from "../utils/validators.js";

const router = express.Router();

function normalizeActivities(input = {}) {
  return {
    watering: Boolean(input.watering),
    ruffling: Boolean(input.ruffling),
    thumping: Boolean(input.thumping)
  };
}

async function totalIntervalDays(excludeId = null) {
  const stages = await Stage.find(excludeId ? { _id: { $ne: excludeId } } : {});
  return stages.reduce((sum, stage) => sum + Number(stage.intervalDays || 0), 0);
}

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const stages = await Stage.find().sort({ sequenceOrder: 1 });
  return res.json(stages);
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const missing = requireFields(req.body, ["name", "sequenceOrder", "intervalDays"]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const sequenceOrder = ensurePositive(req.body.sequenceOrder, "sequenceOrder");
  const intervalDays = ensurePositive(req.body.intervalDays, "intervalDays");
  if (!sequenceOrder.ok || !intervalDays.ok) {
    return res.status(400).json({ error: sequenceOrder.message || intervalDays.message });
  }
  const existingOrder = await Stage.findOne({ sequenceOrder: sequenceOrder.value });
  if (existingOrder) {
    return res.status(400).json({ error: "Sequence order already in use" });
  }
  const existingName = await Stage.findOne({ name: req.body.name });
  if (existingName) {
    return res.status(400).json({ error: "Stage name already exists" });
  }
  const currentTotal = await totalIntervalDays();
  if (currentTotal + intervalDays.value > 60) {
    return res.status(400).json({ error: "Total stage interval exceeds 60 days" });
  }
  const stage = await Stage.create({
    name: req.body.name,
    sequenceOrder: sequenceOrder.value,
    intervalDays: intervalDays.value,
    humidity: Number(req.body.humidity || 0),
    temperature: Number(req.body.temperature || 0),
    co2Level: Number(req.body.co2Level || 0),
    notes: req.body.notes || "",
    activities: normalizeActivities(req.body.activities || {})
  });
  return res.status(201).json(stage);
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const stage = await Stage.findById(req.params.id);
  if (!stage) {
    return res.status(404).json({ error: "Stage not found" });
  }
  if (req.body.sequenceOrder !== undefined) {
    const sequenceOrder = ensurePositive(req.body.sequenceOrder, "sequenceOrder");
    if (!sequenceOrder.ok) {
      return res.status(400).json({ error: sequenceOrder.message });
    }
    const existingOrder = await Stage.findOne({ sequenceOrder: sequenceOrder.value, _id: { $ne: stage._id } });
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
    const currentTotal = await totalIntervalDays(stage._id);
    if (currentTotal + intervalDays.value > 60) {
      return res.status(400).json({ error: "Total stage interval exceeds 60 days" });
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
    const existingName = await Stage.findOne({ name: req.body.name, _id: { $ne: stage._id } });
    if (existingName) {
      return res.status(400).json({ error: "Stage name already exists" });
    }
    stage.name = req.body.name;
  }
  if (req.body.activities) {
    stage.activities = normalizeActivities(req.body.activities);
  }
  await stage.save();
  return res.json(stage);
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const stage = await Stage.findById(req.params.id);
  if (!stage) {
    return res.status(404).json({ error: "Stage not found" });
  }
  await stage.deleteOne();
  return res.json({ ok: true });
});

router.get("/summary", requireAuth, requireAdmin, async (req, res) => {
  const stages = await Stage.find();
  const totalDays = stages.reduce((sum, stage) => sum + Number(stage.intervalDays || 0), 0);
  return res.json({ totalDays, isValid: totalDays === 60 });
});

export default router;
