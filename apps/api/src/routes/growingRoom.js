import express from "express";
import mongoose from "mongoose";
import GrowingRoom from "../models/GrowingRoom.js";
import GrowingRoomCycle from "../models/GrowingRoomCycle.js";
import GrowingRoomCycleTask from "../models/GrowingRoomCycleTask.js";
import GrowingRoomParameterLog from "../models/GrowingRoomParameterLog.js";
import GrowingRoomInterventionLog from "../models/GrowingRoomInterventionLog.js";
import GrowingRoomRulesOverride from "../models/GrowingRoomRulesOverride.js";
import CompostLifecycleBatch from "../models/CompostLifecycleBatch.js";
import User from "../models/User.js";
import { requireAuth, requireAdmin, requirePermission } from "../middleware/auth.js";
import { requireTenantContext } from "../middleware/companyScope.js";
import { COMPOST_STATUS_KEYS, effectiveCompostStatus } from "../utils/compostLifecycle.js";
import {
  DEFAULT_TASK_TEMPLATES,
  computeCycleDay,
  dueDateForScheduledDay,
  expandCleaningTasks,
  expandTemplatesToInstances,
  mergeTemplatesWithOverride,
  recommendationsForStage,
  stageForCycleDay
} from "../utils/growingRoomStages.js";
import {
  buildGrowingStageBounds,
  buildGrowStageParamTargets,
  getActivityDefinitionsForStage,
  masterStageRow,
  normalizeGrowStageKey
} from "../utils/growingRoomMasterConfig.js";
import {
  allActivitiesCompleteForStage,
  allGrowTasksCompleteForStage,
  nextGrowStageKey,
  growStageSequence,
  evaluateGrowParameterAlerts
} from "../utils/growingRoomStageParams.js";

const router = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;

async function getOrCreateRulesDoc(companyId) {
  let doc = await GrowingRoomRulesOverride.findOne({ companyId });
  if (!doc) {
    doc = await GrowingRoomRulesOverride.create({ companyId, disabledKeys: [], additionalTemplates: [] });
  }
  return doc;
}

const LEGACY_TASK_STAGE_KEYS = {
  spawning: "spawn_run",
  case_run: "ruffling_case_run",
  pinning: "pinheads_fruiting"
};

/** One-time normalize of task rows from older stage key names. */
async function migrateLegacyTaskStageKeysForCycle(companyId, cycleId) {
  for (const [from, to] of Object.entries(LEGACY_TASK_STAGE_KEYS)) {
    await GrowingRoomCycleTask.updateMany({ companyId, cycleId, stageKey: from }, { $set: { stageKey: to } });
  }
}

const SPAWN_MONITOR_LEGACY_KEYS = ["temperature_monitoring", "humidity_monitoring", "co2_monitoring"];
const SPAWN_MONITOR_TASK_KEY = "th_rh_co2_monitoring";

/** Merge legacy three-row daily monitoring into one task per day (spawn run days 3–15). */
async function dedupeSpawnRunMonitoringTasks(companyId, cycleId) {
  const legacyRows = await GrowingRoomCycleTask.find({
    companyId,
    cycleId,
    stageKey: "spawn_run",
    taskKey: { $in: SPAWN_MONITOR_LEGACY_KEYS }
  }).lean();
  if (legacyRows.length === 0) return;

  const cycle = await GrowingRoomCycle.findOne({ _id: cycleId, companyId }).select("cycleStartedAt").lean();
  if (!cycle) return;

  const days = [...new Set(legacyRows.map((t) => t.scheduledDay))].filter((d) => d >= 3 && d <= 15);
  for (const day of days) {
    const rows = await GrowingRoomCycleTask.find({
      companyId,
      cycleId,
      stageKey: "spawn_run",
      scheduledDay: day,
      taskKey: { $in: [...SPAWN_MONITOR_LEGACY_KEYS, SPAWN_MONITOR_TASK_KEY] }
    }).lean();
    if (rows.length === 0) continue;

    const statuses = rows.map((t) => t.status);
    let newStatus = "pending";
    if (statuses.some((s) => s === "completed")) newStatus = "completed";
    else if (statuses.length > 0 && statuses.every((s) => s === "skipped")) newStatus = "skipped";

    await GrowingRoomCycleTask.deleteMany({ _id: { $in: rows.map((r) => r._id) }, companyId });
    const sample = rows[0];
    await GrowingRoomCycleTask.create({
      companyId,
      cycleId: sample.cycleId,
      growingRoomId: sample.growingRoomId,
      compostLifecycleBatchId: sample.compostLifecycleBatchId,
      stageKey: "spawn_run",
      taskKey: SPAWN_MONITOR_TASK_KEY,
      title: "Temperature / Humidity / CO₂ Monitoring",
      scheduledDay: day,
      dueDate: dueDateForScheduledDay(cycle.cycleStartedAt, day),
      recurrenceKind: "daily",
      assignedRoleHint: sample.assignedRoleHint || "",
      isOptional: false,
      isCritical: true,
      status: newStatus,
      completedAt: newStatus === "completed" ? new Date() : null
    });
  }
}

const RUFFLING_CASE_DAILY_TASK_KEY = "ruffling_case_daily";
const RUFFLING_CASE_DAILY_TITLE =
  "Ruffling and case run — humidity, light watering (optional), ruffling & thumping (once on each day)";
const RUFFLING_CASE_DAILY_TITLE_PREV =
  "Ruffling and case run — humidity, light watering (optional), ruffling & thumping";

/**
 * One row per scheduled day for ruffling_case_run:
 * - merges legacy four taskKeys into `ruffling_case_daily`
 * - collapses duplicate `ruffling_case_daily` rows (e.g. template merged twice into instances)
 */
async function dedupeRufflingCaseRunDailyTasks(companyId, cycleId) {
  const cycle = await GrowingRoomCycle.findOne({ _id: cycleId, companyId }).select("cycleStartedAt").lean();
  if (!cycle) return;

  const all = await GrowingRoomCycleTask.find({ companyId, cycleId, stageKey: "ruffling_case_run" }).lean();
  if (all.length === 0) return;

  const byDay = new Map();
  for (const t of all) {
    const d = Number(t.scheduledDay) || 0;
    if (d <= 0) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(t);
  }

  for (const [day, rows] of byDay) {
    if (rows.length <= 1) continue;

    const statuses = rows.map((t) => t.status);
    let newStatus = "pending";
    if (statuses.some((s) => s === "completed")) newStatus = "completed";
    else if (statuses.length > 0 && statuses.every((s) => s === "skipped")) newStatus = "skipped";
    else if (statuses.some((s) => s === "in_progress")) newStatus = "in_progress";

    const completedAt =
      newStatus === "completed"
        ? rows.reduce((best, t) => {
            const c = t.completedAt ? new Date(t.completedAt).getTime() : 0;
            return Math.max(best, c);
          }, 0)
        : 0;

    await GrowingRoomCycleTask.deleteMany({ _id: { $in: rows.map((r) => r._id) }, companyId });
    const sample = rows[0];
    await GrowingRoomCycleTask.create({
      companyId,
      cycleId: sample.cycleId,
      growingRoomId: sample.growingRoomId,
      compostLifecycleBatchId: sample.compostLifecycleBatchId,
      stageKey: "ruffling_case_run",
      taskKey: RUFFLING_CASE_DAILY_TASK_KEY,
      title: RUFFLING_CASE_DAILY_TITLE,
      scheduledDay: day,
      dueDate: dueDateForScheduledDay(cycle.cycleStartedAt, day),
      recurrenceKind: "daily",
      assignedRoleHint: sample.assignedRoleHint || "",
      isOptional: false,
      isCritical: true,
      status: newStatus,
      completedAt: newStatus === "completed" && completedAt > 0 ? new Date(completedAt) : null
    });
  }

  await GrowingRoomCycleTask.updateMany(
    {
      companyId,
      cycleId,
      stageKey: "ruffling_case_run",
      taskKey: RUFFLING_CASE_DAILY_TASK_KEY,
      title: RUFFLING_CASE_DAILY_TITLE_PREV
    },
    { $set: { title: RUFFLING_CASE_DAILY_TITLE } }
  );
}

const PINHEADS_FRUITING_DAILY_TASK_KEY = "pinheads_fruiting_daily";
const PINHEADS_FRUITING_DAILY_TITLE =
  "Pinheads & fruiting — controlled watering, fresh air adjustment & pin observation (once each day)";

/**
 * One row per scheduled day for pinheads_fruiting: legacy three dailies → `pinheads_fruiting_daily`;
 * also collapses duplicate bundled rows.
 */
async function dedupePinheadsFruitingDailyTasks(companyId, cycleId) {
  const cycle = await GrowingRoomCycle.findOne({ _id: cycleId, companyId }).select("cycleStartedAt").lean();
  if (!cycle) return;

  const all = await GrowingRoomCycleTask.find({ companyId, cycleId, stageKey: "pinheads_fruiting" }).lean();
  if (all.length === 0) return;

  const byDay = new Map();
  for (const t of all) {
    const d = Number(t.scheduledDay) || 0;
    if (d <= 0) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(t);
  }

  for (const [day, rows] of byDay) {
    if (rows.length <= 1) continue;

    const statuses = rows.map((t) => t.status);
    let newStatus = "pending";
    if (statuses.some((s) => s === "completed")) newStatus = "completed";
    else if (statuses.length > 0 && statuses.every((s) => s === "skipped")) newStatus = "skipped";
    else if (statuses.some((s) => s === "in_progress")) newStatus = "in_progress";

    const completedAt =
      newStatus === "completed"
        ? rows.reduce((best, t) => {
            const c = t.completedAt ? new Date(t.completedAt).getTime() : 0;
            return Math.max(best, c);
          }, 0)
        : 0;

    await GrowingRoomCycleTask.deleteMany({ _id: { $in: rows.map((r) => r._id) }, companyId });
    const sample = rows[0];
    await GrowingRoomCycleTask.create({
      companyId,
      cycleId: sample.cycleId,
      growingRoomId: sample.growingRoomId,
      compostLifecycleBatchId: sample.compostLifecycleBatchId,
      stageKey: "pinheads_fruiting",
      taskKey: PINHEADS_FRUITING_DAILY_TASK_KEY,
      title: PINHEADS_FRUITING_DAILY_TITLE,
      scheduledDay: day,
      dueDate: dueDateForScheduledDay(cycle.cycleStartedAt, day),
      recurrenceKind: "daily",
      assignedRoleHint: sample.assignedRoleHint || "",
      isOptional: false,
      isCritical: true,
      status: newStatus,
      completedAt: newStatus === "completed" && completedAt > 0 ? new Date(completedAt) : null
    });
  }
}

/** Flush stages: separate Harvesting rows are redundant with yield entry (log yield = harvest done). */
async function removeFlushHarvestingTasks(companyId, cycleId) {
  await GrowingRoomCycleTask.deleteMany({
    companyId,
    cycleId,
    stageKey: { $in: ["first_flush", "second_flush", "third_flush"] },
    taskKey: "harvesting"
  });
}

const LEGACY_CLEANING_TASK_KEYS = ["room_emptying", "cleaning_disinfection"];

/**
 * Replace legacy two-step cleaning tasks with `room_cleaning` + `release_room` for cycles still in cleaning.
 */
async function migrateLegacyCleaningTasksForCycle(companyId, cycleId) {
  const legacy = await GrowingRoomCycleTask.find({
    companyId,
    cycleId,
    stageKey: "cleaning",
    taskKey: { $in: LEGACY_CLEANING_TASK_KEYS }
  }).lean();
  if (legacy.length === 0) return;

  const hasNew = await GrowingRoomCycleTask.exists({
    companyId,
    cycleId,
    stageKey: "cleaning",
    taskKey: { $in: ["room_cleaning", "release_room"] }
  });
  if (hasNew) return;

  const cycle = await GrowingRoomCycle.findOne({ _id: cycleId, companyId }).select("cycleStartedAt status").lean();
  if (!cycle || cycle.status !== "cleaning") return;

  const statuses = legacy.map((t) => t.status);
  let cleaningStatus = "pending";
  if (statuses.some((s) => s === "pending" || s === "in_progress")) cleaningStatus = "pending";
  else if (statuses.length && statuses.every((s) => s === "skipped")) cleaningStatus = "skipped";
  else cleaningStatus = "completed";

  const day = Math.max(1, ...legacy.map((t) => Number(t.scheduledDay) || 1));
  const due = dueDateForScheduledDay(cycle.cycleStartedAt, day);
  const sample = legacy[0];

  await GrowingRoomCycleTask.deleteMany({ _id: { $in: legacy.map((l) => l._id) }, companyId });

  await GrowingRoomCycleTask.create({
    companyId,
    cycleId,
    growingRoomId: sample.growingRoomId,
    compostLifecycleBatchId: sample.compostLifecycleBatchId || null,
    stageKey: "cleaning",
    taskKey: "room_cleaning",
    title: "Cleaning",
    scheduledDay: day,
    dueDate: due,
    recurrenceKind: "once",
    assignedRoleHint: sample.assignedRoleHint || "",
    isCritical: true,
    status: cleaningStatus,
    completedAt: cleaningStatus === "completed" ? new Date() : null
  });

  await GrowingRoomCycleTask.create({
    companyId,
    cycleId,
    growingRoomId: sample.growingRoomId,
    compostLifecycleBatchId: sample.compostLifecycleBatchId || null,
    stageKey: "cleaning",
    taskKey: "release_room",
    title: "Release room",
    scheduledDay: day,
    dueDate: due,
    recurrenceKind: "once",
    assignedRoleHint: sample.assignedRoleHint || "",
    isCritical: true,
    status: "pending"
  });
}

function startOfUtcDay(d) {
  const x = d instanceof Date ? new Date(d) : new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function endOfUtcDay(d) {
  const x = d instanceof Date ? new Date(d) : new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

async function assertRoomIsGrowingRoom(roomId, companyId) {
  const room = await GrowingRoom.findOne({ _id: roomId, companyId });
  if (!room) {
    return { ok: false, error: "Growing room not found" };
  }
  if (String(room.resourceType || "") !== "Room") {
    return { ok: false, error: "Resource must be of type Room for a growing cycle." };
  }
  return { ok: true, room };
}

/** Matches plant-ops workflow: persisted operational key or calendar-derived status. */
function operationalStageFromDoc(doc, now = new Date()) {
  const os =
    doc.operationalStageKey != null && String(doc.operationalStageKey).trim() !== ""
      ? String(doc.operationalStageKey).trim()
      : null;
  if (os && COMPOST_STATUS_KEYS.includes(os)) {
    return os;
  }
  return effectiveCompostStatus(doc, now);
}

/**
 * Compost ready (`done`), final step recorded for growing (not ready to sell), not already on a cycle.
 * Batches with no specific room are offered to every room; legacy batches with postCompostGrowingRoomId only match that room.
 */
async function findEligibleCompostBatchesForRoom(roomId, companyId) {
  const now = new Date();
  const activeCycles = await GrowingRoomCycle.find({
    companyId,
    status: { $in: ["active", "cleaning"] },
    compostLifecycleBatchId: { $ne: null }
  })
    .select("compostLifecycleBatchId")
    .lean();
  const claimed = new Set(activeCycles.map((c) => String(c.compostLifecycleBatchId)));

  const batches = await CompostLifecycleBatch.find({ companyId })
    .sort({ startDate: -1 })
    .limit(400)
    .lean();

  const rid = String(roomId);
  const out = [];
  for (const b of batches) {
    if (operationalStageFromDoc(b, now) !== "done") continue;
    if (claimed.has(String(b._id))) continue;
    if (b.postCompostRecordedAt == null) continue;
    if (b.postCompostReadyToSell) continue;
    const dr = b.postCompostGrowingRoomId ? String(b.postCompostGrowingRoomId) : "";
    if (dr && dr !== rid) continue;
    out.push({
      _id: b._id,
      batchName: b.batchName,
      startDate: b.startDate,
      postCompostRecordedAt: b.postCompostRecordedAt
    });
  }
  return out;
}

async function assertCompostBatchEligibleForRoom(batchId, roomId, companyId) {
  const batch = await CompostLifecycleBatch.findOne({ _id: batchId, companyId }).lean();
  if (!batch) {
    return { ok: false, error: "Compost batch not found" };
  }
  const now = new Date();
  if (operationalStageFromDoc(batch, now) !== "done") {
    return { ok: false, error: "Compost batch must be compost ready (not an ongoing compost run)." };
  }
  if (batch.postCompostRecordedAt == null) {
    return {
      ok: false,
      error:
        "Record the final step in Compost Units first (Ready for growing room or Ready to sell)."
    };
  }
  if (batch.postCompostReadyToSell) {
    return { ok: false, error: "This batch was marked ready to sell, not for a growing room crop." };
  }
  const dr = batch.postCompostGrowingRoomId ? String(batch.postCompostGrowingRoomId) : "";
  if (dr && dr !== String(roomId)) {
    return {
      ok: false,
      error: "This batch was recorded for a different growing room (legacy dispatch). Pick that room or use an open batch."
    };
  }
  const inUse = await GrowingRoomCycle.findOne({
    companyId,
    status: { $in: ["active", "cleaning"] },
    compostLifecycleBatchId: batch._id
  })
    .select("_id")
    .lean();
  if (inUse) {
    return { ok: false, error: "This compost batch is already linked to an active or cleaning growing cycle." };
  }
  return { ok: true, batch };
}

async function assertNoConflictingCycle(roomId, excludeCycleId, companyId) {
  const q = { companyId, growingRoomId: roomId, status: { $in: ["active", "cleaning"] } };
  if (excludeCycleId) {
    q._id = { $ne: excludeCycleId };
  }
  const existing = await GrowingRoomCycle.findOne(q).select("_id").lean();
  if (existing) {
    return { ok: false, error: "This room already has an active or cleaning cycle." };
  }
  return { ok: true };
}

async function buildMergedTemplates(companyId) {
  const rules = await getOrCreateRulesDoc(companyId);
  return mergeTemplatesWithOverride(DEFAULT_TASK_TEMPLATES, rules.additionalTemplates || [], rules.disabledKeys || []);
}

async function generateGrowPhaseTasks(cycleDoc, roomId, batchId, opts, companyId) {
  const templates = await buildMergedTemplates(companyId);
  const instances = expandTemplatesToInstances(templates, {
    thirdFlushEnabled: Boolean(opts.thirdFlushEnabled)
  });
  const tasks = [];
  for (const inst of instances) {
    const due = dueDateForScheduledDay(cycleDoc.cycleStartedAt, inst.scheduledDay);
    tasks.push({
      companyId,
      cycleId: cycleDoc._id,
      growingRoomId: roomId,
      compostLifecycleBatchId: batchId || null,
      stageKey: inst.stageKey,
      taskKey: inst.taskKey,
      title: inst.title,
      scheduledDay: inst.scheduledDay,
      dueDate: due,
      recurrenceKind: inst.recurrence === "daily" ? "daily" : "once",
      assignedRoleHint: inst.assignedRoleHint || "",
      isOptional: Boolean(inst.isOptional),
      isCritical: Boolean(inst.isCritical),
      status: "pending"
    });
  }
  if (tasks.length) {
    await GrowingRoomCycleTask.insertMany(tasks);
  }
}

async function appendIntervention(cycle, roomId, batchId, taskId, action, detail, user) {
  await GrowingRoomInterventionLog.create({
    companyId: cycle.companyId,
    cycleId: cycle._id,
    growingRoomId: roomId,
    compostLifecycleBatchId: batchId || null,
    taskId: taskId || null,
    action,
    detail: detail || "",
    performedByUserId: user?.id && mongoose.Types.ObjectId.isValid(String(user.id)) ? user.id : null,
    performedByName: user?.name ? String(user.name).trim() : ""
  });
}

function cycleDayBoundsForQuery(now, cycleStartedAt) {
  const day = computeCycleDay(cycleStartedAt, now);
  const start = dueDateForScheduledDay(cycleStartedAt, day);
  const end = new Date(start.getTime() + DAY_MS - 1);
  return { cycleDay: day, start, end };
}

async function toCycleView(cycle, { includeTaskStats = false } = {}) {
  const c = cycle.toObject ? cycle.toObject() : cycle;
  const tenantCo = c.companyId;
  if (c.status === "cleaning") {
    await migrateLegacyCleaningTasksForCycle(tenantCo, c._id);
  }
  const now = new Date();
  const cycleDay = computeCycleDay(c.cycleStartedAt, now);
  const third = Boolean(c.thirdFlushEnabled);
  const stageInfo = stageForCycleDay(cycleDay, third);
  const recommendations = recommendationsForStage(stageInfo.stageKey);
  const boundsMap = buildGrowingStageBounds(third);
  const targetsMap = buildGrowStageParamTargets(third);

  let pendingCount = 0;
  let overdueCount = 0;
  let taskLean = [];
  if (c.status === "active" || c.status === "cleaning" || includeTaskStats) {
    await dedupeSpawnRunMonitoringTasks(tenantCo, c._id);
    await dedupeRufflingCaseRunDailyTasks(tenantCo, c._id);
    await dedupePinheadsFruitingDailyTasks(tenantCo, c._id);
    await removeFlushHarvestingTasks(tenantCo, c._id);
    taskLean = await GrowingRoomCycleTask.find({ companyId: tenantCo, cycleId: c._id })
      .select("status dueDate scheduledDay stageKey")
      .lean();
    if (includeTaskStats && c.status === "active") {
      const sod = startOfUtcDay(now);
      for (const t of taskLean) {
        if (t.status === "pending" || t.status === "in_progress") {
          pendingCount += 1;
          const due = t.dueDate ? new Date(t.dueDate) : null;
          if (due && due < sod) overdueCount += 1;
        }
      }
    }
  }

  let recorded = c.recordedGrowStageKey ? String(c.recordedGrowStageKey).trim() : "";
  if (c.status === "active") {
    if (!recorded) {
      recorded = "spawn_run";
      await GrowingRoomCycle.updateOne({ _id: c._id, companyId: tenantCo }, { $set: { recordedGrowStageKey: "spawn_run" } });
    }
    recorded = normalizeGrowStageKey(recorded);
    const prior = c.recordedGrowStageKey ? String(c.recordedGrowStageKey).trim() : "";
    if (prior !== recorded) {
      await GrowingRoomCycle.updateOne({ _id: c._id, companyId: tenantCo }, { $set: { recordedGrowStageKey: recorded } });
    }
  } else if (c.status === "cleaning") {
    recorded = "cleaning";
  } else {
    recorded = normalizeGrowStageKey(recorded || stageInfo.stageKey);
  }

  const bounds = boundsMap[recorded] || boundsMap[normalizeGrowStageKey(recorded)];
  const recordedLabel = bounds?.label || recorded;
  const nextKey = c.status === "active" ? nextGrowStageKey(recorded, third) : null;
  const completions = Array.isArray(c.stageActivityCompletions) ? c.stageActivityCompletions : [];
  const activitiesDone = allActivitiesCompleteForStage(recorded, completions);
  const activityDefs = getActivityDefinitionsForStage(recorded);
  const checklist = activityDefs.map((def) => ({
    key: def.key,
    label: def.label,
    completed: completions.some(
      (x) =>
        normalizeGrowStageKey(x.stageKey) === normalizeGrowStageKey(recorded) && String(x.activityKey) === String(def.key)
    )
  }));

  const canAdvanceGrowStage =
    c.status === "active" &&
    recorded !== "end_cycle" &&
    nextKey != null &&
    allGrowTasksCompleteForStage(taskLean, recorded) &&
    activitiesDone;

  let lastParameterLoggedAt = null;
  if (c.status === "active" || c.status === "cleaning") {
    const lastPl = await GrowingRoomParameterLog.findOne({ companyId: tenantCo, cycleId: c._id })
      .sort({ loggedAt: -1 })
      .select("loggedAt")
      .lean();
    lastParameterLoggedAt = lastPl?.loggedAt || null;
  }
  const hoursSinceParameterLog =
    lastParameterLoggedAt != null ? (now.getTime() - new Date(lastParameterLoggedAt).getTime()) / 3600000 : null;
  const PARAMETER_LOG_STALE_HOURS = 48;
  const parameterLogStale =
    c.status === "active" && (hoursSinceParameterLog == null || hoursSinceParameterLog > PARAMETER_LOG_STALE_HOURS);

  const row = masterStageRow(recorded);

  return {
    ...c,
    id: c._id,
    currentCycleDay: cycleDay,
    currentStageKey: stageInfo.stageKey,
    currentStageLabel: stageInfo.label,
    recordedGrowStageKey: recorded,
    recordedGrowStageLabel: recordedLabel,
    recordedStageRisky: Boolean(row?.risky),
    nextGrowStageKey: nextKey,
    canAdvanceGrowStage,
    activitiesCompleteForRecordedStage: activitiesDone,
    stageActivityChecklist: checklist,
    growStageSequence: growStageSequence(third),
    paramTargetsForRecordedStage: targetsMap[normalizeGrowStageKey(recorded)] || null,
    lastParameterLoggedAt,
    hoursSinceParameterLog,
    parameterLogStaleWarning: parameterLogStale,
    parameterLogStaleAfterHours: PARAMETER_LOG_STALE_HOURS,
    recommendations,
    ...(includeTaskStats && c.status === "active" ? { pendingTaskCount: pendingCount, overdueTaskCount: overdueCount } : {})
  };
}

/** User pickers for assignment (internal directory). */
router.get("/user-options", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "edit"), async (req, res) => {
  const users = await User.find({ companyId: req.companyId }).select("name email").sort({ name: 1 }).limit(400).lean();
  return res.json(users);
});

/** GET /growing-room/dashboard-summary */
router.get("/dashboard-summary", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "view"), async (req, res) => {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const todayEnd = endOfUtcDay(now);
  const activeCycles = await GrowingRoomCycle.find({
    companyId: req.companyId,
    status: { $in: ["active", "cleaning"] }
  })
    .populate("growingRoomId", "name locationInPlant growingOperationalState")
    .sort({ updatedAt: -1 })
    .lean();
  const dueToday = await GrowingRoomCycleTask.countDocuments({
    companyId: req.companyId,
    status: { $in: ["pending", "in_progress"] },
    dueDate: { $gte: todayStart, $lte: todayEnd }
  });
  const overdue = await GrowingRoomCycleTask.countDocuments({
    companyId: req.companyId,
    status: { $in: ["pending", "in_progress"] },
    dueDate: { $lt: todayStart }
  });
  const completedToday = await GrowingRoomCycleTask.countDocuments({
    companyId: req.companyId,
    status: "completed",
    completedAt: { $gte: todayStart, $lte: todayEnd }
  });
  return res.json({
    activeCycles: activeCycles.map((row) => {
      const cid = row._id;
      const room = row.growingRoomId;
      const cd = computeCycleDay(row.cycleStartedAt, now);
      const st = stageForCycleDay(cd, Boolean(row.thirdFlushEnabled));
      return {
        cycleId: cid,
        status: row.status,
        cycleStartedAt: row.cycleStartedAt,
        currentCycleDay: cd,
        currentStageKey: st.stageKey,
        currentStageLabel: st.label,
        room: room
          ? {
              _id: room._id,
              name: room.name,
              locationInPlant: room.locationInPlant,
              growingOperationalState: room.growingOperationalState
            }
          : null
      };
    }),
    counts: { dueToday, overdue, completedToday }
  });
});

/** GET /growing-room/rules */
router.get("/rules", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "view"), async (req, res) => {
  const doc = await getOrCreateRulesDoc(req.companyId);
  return res.json({
    disabledKeys: doc.disabledKeys || [],
    additionalTemplates: doc.additionalTemplates || [],
    defaultTemplateCount: DEFAULT_TASK_TEMPLATES.length
  });
});

/** PUT /growing-room/rules */
router.put("/rules", requireAuth, requireTenantContext, requireAdmin, async (req, res) => {
  const body = req.body || {};
  const doc = await getOrCreateRulesDoc(req.companyId);
  if (Array.isArray(body.disabledKeys)) {
    doc.disabledKeys = body.disabledKeys.map((k) => String(k || "").trim()).filter(Boolean);
  }
  if (Array.isArray(body.additionalTemplates)) {
    doc.additionalTemplates = body.additionalTemplates;
  }
  doc.updatedByUserId =
    req.user?.id && mongoose.Types.ObjectId.isValid(String(req.user.id)) ? req.user.id : null;
  await doc.save();
  return res.json({
    disabledKeys: doc.disabledKeys,
    additionalTemplates: doc.additionalTemplates
  });
});

/**
 * Compost batches eligible to start a crop in this room: compost ready, marked for growing (not sell),
 * not already on a cycle. Batches without a specific room apply to all rooms; legacy room-specific dispatch still matches one room.
 */
router.get("/eligible-compost-batches", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "create"), async (req, res) => {
  const roomId = req.query.growingRoomId;
  if (!roomId || !mongoose.Types.ObjectId.isValid(String(roomId))) {
    return res.status(400).json({ error: "growingRoomId is required" });
  }
  const roomCheck = await assertRoomIsGrowingRoom(roomId, req.companyId);
  if (!roomCheck.ok) {
    return res.status(400).json({ error: roomCheck.error });
  }
  const rows = await findEligibleCompostBatchesForRoom(roomId, req.companyId);
  return res.json(rows);
});

/** GET /growing-room/rooms */
router.get("/rooms", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "view"), async (req, res) => {
  const rooms = await GrowingRoom.find({ companyId: req.companyId, resourceType: "Room" }).sort({ name: 1 }).lean();
  const cycles = await GrowingRoomCycle.find({ companyId: req.companyId, status: { $in: ["active", "cleaning"] } })
    .select("growingRoomId status cycleStartedAt compostLifecycleBatchId thirdFlushEnabled")
    .populate("compostLifecycleBatchId", "batchName")
    .lean();
  const byRoom = new Map();
  for (const c of cycles) {
    byRoom.set(String(c.growingRoomId), c);
  }
  const out = [];
  for (const r of rooms) {
    const c = byRoom.get(String(r._id));
    const now = new Date();
    let currentCycleDay = null;
    let currentStageKey = null;
    let currentStageLabel = null;
    if (c) {
      currentCycleDay = computeCycleDay(c.cycleStartedAt, now);
      const st = stageForCycleDay(currentCycleDay, Boolean(c.thirdFlushEnabled));
      currentStageKey = st.stageKey;
      currentStageLabel = st.label;
    }
    let compostBatchName = "";
    let compostBatchIdStr = "";
    if (c?.compostLifecycleBatchId != null) {
      const br = c.compostLifecycleBatchId;
      if (typeof br === "object" && br != null && "batchName" in br) {
        compostBatchName = br.batchName != null ? String(br.batchName).trim() : "";
        compostBatchIdStr = br._id != null ? String(br._id) : "";
      } else {
        compostBatchIdStr = String(br);
      }
    }
    out.push({
      ...r,
      activeCycle: c
        ? {
            _id: c._id,
            status: c.status,
            cycleStartedAt: c.cycleStartedAt,
            compostLifecycleBatchId: compostBatchIdStr || c.compostLifecycleBatchId,
            compostBatchName: compostBatchName,
            thirdFlushEnabled: Boolean(c.thirdFlushEnabled),
            currentCycleDay,
            currentStageKey,
            currentStageLabel
          }
        : null
    });
  }
  return res.json(out);
});

/** GET /growing-room/cycles */
router.get("/cycles", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "view"), async (req, res) => {
  const q = { companyId: req.companyId };
  if (req.query.roomId && mongoose.Types.ObjectId.isValid(String(req.query.roomId))) {
    q.growingRoomId = req.query.roomId;
  }
  if (req.query.batchId && mongoose.Types.ObjectId.isValid(String(req.query.batchId))) {
    q.compostLifecycleBatchId = req.query.batchId;
  }
  if (req.query.status && ["active", "cleaning", "completed", "cancelled"].includes(String(req.query.status))) {
    q.status = String(req.query.status);
  }
  if (req.query.from || req.query.to) {
    q.cycleStartedAt = {};
    if (req.query.from) q.cycleStartedAt.$gte = new Date(req.query.from);
    if (req.query.to) q.cycleStartedAt.$lte = new Date(req.query.to);
  }
  const rows = await GrowingRoomCycle.find(q).sort({ cycleStartedAt: -1 }).limit(200).lean();
  const enriched = [];
  const now = new Date();
  for (const row of rows) {
    const cd = computeCycleDay(row.cycleStartedAt, now);
    const st = stageForCycleDay(cd, Boolean(row.thirdFlushEnabled));
    enriched.push({
      ...row,
      currentCycleDay: row.status === "active" ? cd : null,
      currentStageKey: row.status === "active" ? st.stageKey : null,
      currentStageLabel: row.status === "active" ? st.label : null
    });
  }
  return res.json(enriched);
});

/** POST /growing-room/cycles */
router.post("/cycles", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "create"), async (req, res) => {
  const body = req.body || {};
  const roomId = body.growingRoomId;
  if (!roomId || !mongoose.Types.ObjectId.isValid(String(roomId))) {
    return res.status(400).json({ error: "growingRoomId is required" });
  }
  const roomCheck = await assertRoomIsGrowingRoom(roomId, req.companyId);
  if (!roomCheck.ok) {
    return res.status(400).json({ error: roomCheck.error });
  }
  const conflict = await assertNoConflictingCycle(roomId, null, req.companyId);
  if (!conflict.ok) {
    return res.status(400).json({ error: conflict.error });
  }
  const opState = roomCheck.room.growingOperationalState || "available";
  if (opState !== "available") {
    return res.status(400).json({ error: "Room is not available for a new cycle (clear cleaning or complete prior cycle)." });
  }
  if (!body.compostLifecycleBatchId || !mongoose.Types.ObjectId.isValid(String(body.compostLifecycleBatchId))) {
    return res.status(400).json({ error: "compostLifecycleBatchId is required" });
  }
  const batchId = new mongoose.Types.ObjectId(String(body.compostLifecycleBatchId));
  const batchCheck = await assertCompostBatchEligibleForRoom(batchId, roomId, req.companyId);
  if (!batchCheck.ok) {
    return res.status(400).json({ error: batchCheck.error });
  }
  let cycleStartedAt = body.cycleStartedAt ? new Date(body.cycleStartedAt) : new Date();
  if (Number.isNaN(cycleStartedAt.getTime())) {
    cycleStartedAt = new Date();
  }
  cycleStartedAt = startOfUtcDay(cycleStartedAt);

  const cycle = await GrowingRoomCycle.create({
    companyId: req.companyId,
    growingRoomId: roomId,
    compostLifecycleBatchId: batchId,
    cycleStartedAt,
    status: "active",
    thirdFlushEnabled: Boolean(body.thirdFlushEnabled),
    recordedGrowStageKey: "spawn_run",
    notes: body.notes ? String(body.notes).trim() : ""
  });
  await CompostLifecycleBatch.updateOne(
    {
      _id: batchId,
      companyId: req.companyId,
      postCompostReadyToSell: { $ne: true },
      postCompostRecordedAt: { $ne: null }
    },
    { $set: { postCompostGrowingRoomId: roomId } }
  );
  await generateGrowPhaseTasks(cycle, roomId, batchId, { thirdFlushEnabled: cycle.thirdFlushEnabled }, req.companyId);
  roomCheck.room.growingOperationalState = "active_growing";
  await roomCheck.room.save();
  const populated = await GrowingRoomCycle.findOne({ _id: cycle._id, companyId: req.companyId })
    .populate("growingRoomId", "name locationInPlant")
    .populate("compostLifecycleBatchId", "batchName");
  return res.status(201).json(await toCycleView(populated, { includeTaskStats: true }));
});

/** GET /growing-room/cycles/:id */
router.get("/cycles/:id", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "view"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid cycle id" });
  }
  const cycle = await GrowingRoomCycle.findOne({ _id: req.params.id, companyId: req.companyId })
    .populate("growingRoomId", "name locationInPlant capacityTons growingOperationalState")
    .populate("compostLifecycleBatchId", "batchName startDate");
  if (!cycle) {
    return res.status(404).json({ error: "Cycle not found" });
  }
  return res.json(await toCycleView(cycle, { includeTaskStats: true }));
});

/** POST /growing-room/cycles/:id/begin-cleaning
 *  Body: { emergency?: boolean, reason?: string }
 *  Scheduled cleaning requires every grow-phase task completed or skipped.
 *  Emergency cleaning requires a non-trivial reason (e.g. damaged bags, contamination).
 */
router.post("/cycles/:id/begin-cleaning", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid cycle id" });
  }
  const cycle = await GrowingRoomCycle.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!cycle) {
    return res.status(404).json({ error: "Cycle not found" });
  }
  if (cycle.status !== "active") {
    return res.status(400).json({ error: "Only an active cycle can move to cleaning." });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const emergency = Boolean(body.emergency);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!emergency) {
    const pendingGrow = await GrowingRoomCycleTask.countDocuments({
      companyId: req.companyId,
      cycleId: cycle._id,
      stageKey: { $ne: "cleaning" },
      status: { $in: ["pending", "in_progress"] }
    });
    if (pendingGrow > 0) {
      return res.status(400).json({
        error: `Complete or skip all grow-phase tasks before scheduled cleaning (${pendingGrow} still open).`,
        code: "GROW_TASKS_INCOMPLETE",
        pendingGrowTaskCount: pendingGrow
      });
    }
  } else {
    if (reason.length < 10) {
      return res.status(400).json({
        error: "Emergency cleaning requires a clear reason (at least 10 characters), e.g. damaged mushroom bags or contamination."
      });
    }
  }

  const now = new Date();
  const day = computeCycleDay(cycle.cycleStartedAt, now);
  const instances = expandCleaningTasks(day);
  const roomId = cycle.growingRoomId;
  const batchId = cycle.compostLifecycleBatchId;
  for (const inst of instances) {
    const due = dueDateForScheduledDay(cycle.cycleStartedAt, inst.scheduledDay);
    await GrowingRoomCycleTask.create({
      companyId: req.companyId,
      cycleId: cycle._id,
      growingRoomId: roomId,
      compostLifecycleBatchId: batchId || null,
      stageKey: inst.stageKey,
      taskKey: inst.taskKey,
      title: inst.title,
      scheduledDay: inst.scheduledDay,
      dueDate: due,
      recurrenceKind: "once",
      assignedRoleHint: inst.assignedRoleHint || "",
      isCritical: true,
      status: "pending"
    });
  }
  cycle.status = "cleaning";
  cycle.cleaningStartedAt = now;
  cycle.recordedGrowStageKey = "cleaning";
  await cycle.save();
  const room = await GrowingRoom.findOne({ _id: roomId, companyId: req.companyId });
  if (room) {
    room.growingOperationalState = "cleaning";
    await room.save();
  }
  const actionLabel = emergency ? "Emergency clean & release started" : "Clean & release phase started";
  const detail = emergency ? reason : "";
  await appendIntervention(cycle, roomId, batchId, null, actionLabel, detail, req.user);
  const populated = await GrowingRoomCycle.findOne({ _id: cycle._id, companyId: req.companyId })
    .populate("growingRoomId", "name locationInPlant")
    .populate("compostLifecycleBatchId", "batchName");
  return res.json(await toCycleView(populated, { includeTaskStats: true }));
});

/** POST /growing-room/cycles/:id/complete-cleaning */
router.post("/cycles/:id/complete-cleaning", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid cycle id" });
  }
  const cycle = await GrowingRoomCycle.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!cycle) {
    return res.status(404).json({ error: "Cycle not found" });
  }
  if (cycle.status !== "cleaning") {
    return res.status(400).json({ error: "Cycle is not in cleaning status." });
  }
  const pending = await GrowingRoomCycleTask.countDocuments({
    companyId: req.companyId,
    cycleId: cycle._id,
    status: { $in: ["pending", "in_progress"] }
  });
  if (pending > 0) {
    return res.status(400).json({ error: "Complete or skip all clean & release tasks first." });
  }
  const now = new Date();
  cycle.status = "completed";
  cycle.completedAt = now;
  await cycle.save();
  const room = await GrowingRoom.findOne({ _id: cycle.growingRoomId, companyId: req.companyId });
  if (room) {
    room.growingOperationalState = "available";
    await room.save();
  }
  await appendIntervention(
    cycle,
    cycle.growingRoomId,
    cycle.compostLifecycleBatchId,
    null,
    "Cycle completed — room released and available",
    "",
    req.user
  );
  const populated = await GrowingRoomCycle.findOne({ _id: cycle._id, companyId: req.companyId })
    .populate("growingRoomId", "name locationInPlant")
    .populate("compostLifecycleBatchId", "batchName");
  return res.json(await toCycleView(populated, { includeTaskStats: false }));
});

/** PATCH /growing-room/cycles/:id */
router.patch("/cycles/:id", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid cycle id" });
  }
  const cycle = await GrowingRoomCycle.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!cycle) {
    return res.status(404).json({ error: "Cycle not found" });
  }
  const body = req.body || {};
  if (body.notes !== undefined) {
    cycle.notes = String(body.notes || "").trim();
  }
  if (body.status === "cancelled" && cycle.status === "active") {
    cycle.status = "cancelled";
    await GrowingRoomCycleTask.deleteMany({ companyId: req.companyId, cycleId: cycle._id });
    const room = await GrowingRoom.findOne({ _id: cycle.growingRoomId, companyId: req.companyId });
    if (room) {
      room.growingOperationalState = "available";
      await room.save();
    }
    if (cycle.compostLifecycleBatchId) {
      await CompostLifecycleBatch.updateOne(
        {
          _id: cycle.compostLifecycleBatchId,
          companyId: req.companyId,
          postCompostGrowingRoomId: cycle.growingRoomId
        },
        { $set: { postCompostGrowingRoomId: null } }
      );
    }
  }
  await cycle.save();
  const populated = await GrowingRoomCycle.findOne({ _id: cycle._id, companyId: req.companyId })
    .populate("growingRoomId", "name locationInPlant")
    .populate("compostLifecycleBatchId", "batchName");
  return res.json(await toCycleView(populated, { includeTaskStats: true }));
});

/** GET /growing-room/cycles/:id/tasks */
router.get("/cycles/:id/tasks", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "view"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid cycle id" });
  }
  const cycle = await GrowingRoomCycle.findOne({ _id: req.params.id, companyId: req.companyId }).select("_id thirdFlushEnabled").lean();
  if (!cycle) {
    return res.status(404).json({ error: "Cycle not found" });
  }
  await migrateLegacyTaskStageKeysForCycle(req.companyId, cycle._id);
  await dedupeSpawnRunMonitoringTasks(req.companyId, cycle._id);
  await dedupeRufflingCaseRunDailyTasks(req.companyId, cycle._id);
  await dedupePinheadsFruitingDailyTasks(req.companyId, cycle._id);
  await removeFlushHarvestingTasks(req.companyId, cycle._id);
  await migrateLegacyCleaningTasksForCycle(req.companyId, cycle._id);
  const tasks = await GrowingRoomCycleTask.find({ companyId: req.companyId, cycleId: cycle._id })
    .populate("assignedUserId", "name email")
    .sort({ scheduledDay: 1, stageKey: 1, title: 1 })
    .lean();
  const now = new Date();
  const sod = startOfUtcDay(now);
  const out = tasks.map((t) => {
    const due = t.dueDate ? new Date(t.dueDate) : null;
    const overdue =
      (t.status === "pending" || t.status === "in_progress") && due && due < sod;
    const dueToday =
      (t.status === "pending" || t.status === "in_progress") &&
      due &&
      due >= sod &&
      due <= endOfUtcDay(now);
    return { ...t, overdue, dueToday };
  });
  return res.json(out);
});

/** PATCH /growing-room/tasks/:id */
router.patch("/tasks/:id", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid task id" });
  }
  const body = req.body || {};
  const task = await GrowingRoomCycleTask.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  const cycle = await GrowingRoomCycle.findOne({ _id: task.cycleId, companyId: req.companyId });
  if (!cycle || (cycle.status !== "active" && cycle.status !== "cleaning")) {
    return res.status(400).json({ error: "Cannot update tasks for this cycle state." });
  }

  const third = Boolean(cycle.thirdFlushEnabled);
  const boundsMap = buildGrowingStageBounds(third);

  const touchesWork =
    body.status !== undefined ||
    (body.yieldKg !== undefined && body.yieldKg !== null && body.yieldKg !== "");
  if (touchesWork) {
    if (cycle.status === "active" && String(task.stageKey) !== "cleaning") {
      let op = cycle.recordedGrowStageKey ? String(cycle.recordedGrowStageKey).trim() : "spawn_run";
      if (!cycle.recordedGrowStageKey) {
        cycle.recordedGrowStageKey = "spawn_run";
        await cycle.save();
      }
      op = normalizeGrowStageKey(op);
      const taskSk = normalizeGrowStageKey(task.stageKey);
      if (taskSk !== op) {
        return res.status(400).json({
          error: `Work only on tasks for the current operational stage (${boundsMap[op]?.label || op}). When every task there is done or skipped, use Advance grow stage.`
        });
      }
    }
    if (cycle.status === "cleaning" && String(task.stageKey) !== "cleaning") {
      return res.status(400).json({ error: "During cleaning, only cleaning tasks can be updated." });
    }
  }
  if (body.status !== undefined) {
    const st = String(body.status);
    if (!["pending", "in_progress", "completed", "skipped"].includes(st)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    task.status = st;
    if (st === "in_progress" && !task.startedAt) {
      task.startedAt = new Date();
    }
    if (st === "completed") {
      task.completedAt = new Date();
      await appendIntervention(
        cycle,
        task.growingRoomId,
        task.compostLifecycleBatchId,
        task._id,
        `Completed: ${task.title}`,
        body.notes ? String(body.notes).trim() : "",
        req.user
      );
    }
    if (st === "skipped") {
      task.skipReason = body.skipReason ? String(body.skipReason).trim() : "Skipped";
      await appendIntervention(
        cycle,
        task.growingRoomId,
        task.compostLifecycleBatchId,
        task._id,
        `Skipped: ${task.title}`,
        task.skipReason,
        req.user
      );
    }
  }
  if (body.assignedUserId !== undefined) {
    const uid = body.assignedUserId;
    task.assignedUserId =
      uid && mongoose.Types.ObjectId.isValid(String(uid)) ? new mongoose.Types.ObjectId(String(uid)) : null;
  }
  if (body.notes !== undefined) {
    task.notes = String(body.notes || "").trim();
  }
  if (body.yieldKg !== undefined && body.yieldKg !== null && body.yieldKg !== "") {
    const y = Number(body.yieldKg);
    task.yieldKg = Number.isFinite(y) ? y : null;
  }
  await task.save();
  const populated = await GrowingRoomCycleTask.findOne({ _id: task._id, companyId: req.companyId }).populate(
    "assignedUserId",
    "name email"
  );
  return res.json(populated);
});

/** GET /growing-room/grow-stage-param-targets — reference ranges for UI and alerts */
router.get("/grow-stage-param-targets", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "view"), async (req, res) => {
  return res.json({
    withThirdFlush: buildGrowStageParamTargets(true),
    withoutThirdFlush: buildGrowStageParamTargets(false)
  });
});

/** POST /growing-room/cycles/:id/advance-grow-stage — after all tasks in the current operational stage are done or skipped */
router.post("/cycles/:id/advance-grow-stage", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid cycle id" });
  }
  const cycle = await GrowingRoomCycle.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!cycle || cycle.status !== "active") {
    return res.status(400).json({ error: "Only an active grow cycle can advance operational stages." });
  }
  const taskLean = await GrowingRoomCycleTask.find({ companyId: req.companyId, cycleId: cycle._id })
    .select("status stageKey")
    .lean();
  const third = Boolean(cycle.thirdFlushEnabled);
  const boundsMap = buildGrowingStageBounds(third);
  if (!cycle.recordedGrowStageKey) {
    cycle.recordedGrowStageKey = "spawn_run";
    await cycle.save();
  }
  let recorded = normalizeGrowStageKey(String(cycle.recordedGrowStageKey).trim());
  if (recorded !== cycle.recordedGrowStageKey) {
    cycle.recordedGrowStageKey = recorded;
    await cycle.save();
  }
  if (recorded === "end_cycle") {
    return res.status(400).json({ error: "Grow stages are complete — begin cleaning when ready." });
  }
  if (!allGrowTasksCompleteForStage(taskLean, recorded)) {
    return res.status(400).json({
      error: `Finish or skip all tasks in ${boundsMap[recorded]?.label || recorded} before advancing.`
    });
  }
  const completions = Array.isArray(cycle.stageActivityCompletions) ? cycle.stageActivityCompletions : [];
  if (!allActivitiesCompleteForStage(recorded, completions)) {
    return res.status(400).json({
      error: `Complete all activities for ${boundsMap[recorded]?.label || recorded} (checklist) before advancing.`
    });
  }
  const next = nextGrowStageKey(recorded, third);
  if (!next) {
    return res.status(400).json({ error: "There is no next grow stage to advance to." });
  }
  cycle.recordedGrowStageKey = next;
  await cycle.save();
  await appendIntervention(
    cycle,
    cycle.growingRoomId,
    cycle.compostLifecycleBatchId,
    null,
    `Grow stage advanced to ${boundsMap[next]?.label || next}`,
    "",
    req.user
  );
  const populated = await GrowingRoomCycle.findOne({ _id: cycle._id, companyId: req.companyId })
    .populate("growingRoomId", "name locationInPlant capacityTons growingOperationalState")
    .populate("compostLifecycleBatchId", "batchName startDate");
  return res.json(await toCycleView(populated, { includeTaskStats: true }));
});

/** POST /growing-room/cycles/:id/stage-activities — mark manual activity checklist items for the current operational stage */
router.post("/cycles/:id/stage-activities", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid cycle id" });
  }
  const cycle = await GrowingRoomCycle.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!cycle || cycle.status !== "active") {
    return res.status(400).json({ error: "Only an active cycle can update stage activities." });
  }
  const body = req.body || {};
  const stageKey = normalizeGrowStageKey(String(body.stageKey || "").trim());
  const activityKey = String(body.activityKey || "").trim();
  const completed = body.completed !== false;
  if (!stageKey || !activityKey) {
    return res.status(400).json({ error: "stageKey and activityKey are required." });
  }
  let op = cycle.recordedGrowStageKey ? String(cycle.recordedGrowStageKey).trim() : "spawn_run";
  op = normalizeGrowStageKey(op);
  if (stageKey !== op) {
    return res.status(400).json({ error: "Activities can only be updated for the current operational stage." });
  }
  const defs = getActivityDefinitionsForStage(stageKey);
  if (!defs.find((d) => d.key === activityKey)) {
    return res.status(400).json({ error: "Unknown activity for this stage." });
  }
  const arr = Array.isArray(cycle.stageActivityCompletions) ? [...cycle.stageActivityCompletions] : [];
  const uid = req.user?.id && mongoose.Types.ObjectId.isValid(String(req.user.id)) ? req.user.id : null;
  const filtered = arr.filter(
    (x) => !(normalizeGrowStageKey(String(x.stageKey)) === stageKey && String(x.activityKey) === activityKey)
  );
  if (completed) {
    filtered.push({
      stageKey,
      activityKey,
      completedAt: new Date(),
      completedByUserId: uid || undefined
    });
  }
  cycle.stageActivityCompletions = filtered;
  await cycle.save();
  await appendIntervention(
    cycle,
    cycle.growingRoomId,
    cycle.compostLifecycleBatchId,
    null,
    completed ? `Activity completed: ${activityKey}` : `Activity cleared: ${activityKey}`,
    "",
    req.user
  );
  const populated = await GrowingRoomCycle.findOne({ _id: cycle._id, companyId: req.companyId })
    .populate("growingRoomId", "name locationInPlant capacityTons growingOperationalState")
    .populate("compostLifecycleBatchId", "batchName startDate");
  return res.json(await toCycleView(populated, { includeTaskStats: true }));
});

/** POST /growing-room/cycles/:id/parameter-logs */
router.post("/cycles/:id/parameter-logs", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid cycle id" });
  }
  const cycle = await GrowingRoomCycle.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!cycle || cycle.status === "cancelled" || cycle.status === "completed") {
    return res.status(400).json({ error: "Cannot log parameters for this cycle." });
  }
  const body = req.body || {};
  const growStageKey = String(body.growStageKey || "").trim();
  if (!growStageKey) {
    return res.status(400).json({ error: "growStageKey is required (operational stage this reading belongs to)." });
  }
  const third = Boolean(cycle.thirdFlushEnabled);
  const boundsMap = buildGrowingStageBounds(third);
  if (cycle.status === "active") {
    let recorded = cycle.recordedGrowStageKey ? String(cycle.recordedGrowStageKey).trim() : "spawn_run";
    if (!cycle.recordedGrowStageKey) {
      cycle.recordedGrowStageKey = "spawn_run";
      await cycle.save();
    }
    recorded = normalizeGrowStageKey(recorded);
    if (normalizeGrowStageKey(growStageKey) !== recorded) {
      return res.status(400).json({
        error: `Parameter logs must be for the current operational stage (${boundsMap[recorded]?.label || recorded}). You can log many times per stage.`
      });
    }
  } else if (cycle.status === "cleaning") {
    if (growStageKey !== "cleaning") {
      return res.status(400).json({ error: "During cleaning, use growStageKey \"cleaning\" for parameter logs." });
    }
  } else {
    return res.status(400).json({ error: "Parameter logs are only for active or cleaning cycles." });
  }

  const temp = body.temperatureC != null ? Number(body.temperatureC) : null;
  const hum = body.humidityPercent != null ? Number(body.humidityPercent) : null;
  const co2 = body.co2Ppm != null ? Number(body.co2Ppm) : null;
  let taskId = null;
  if (body.taskId && mongoose.Types.ObjectId.isValid(String(body.taskId))) {
    taskId = new mongoose.Types.ObjectId(String(body.taskId));
    const t = await GrowingRoomCycleTask.findOne({ _id: taskId, companyId: req.companyId, cycleId: cycle._id });
    if (!t) {
      return res.status(400).json({ error: "Task not part of this cycle" });
    }
  }
  const alerts = evaluateGrowParameterAlerts(
    growStageKey,
    {
      temperatureC: temp,
      humidityPercent: hum,
      co2Ppm: co2
    },
    third
  );
  const uid = req.user?.id && mongoose.Types.ObjectId.isValid(String(req.user.id)) ? req.user.id : null;
  const log = await GrowingRoomParameterLog.create({
    companyId: req.companyId,
    cycleId: cycle._id,
    growingRoomId: cycle.growingRoomId,
    compostLifecycleBatchId: cycle.compostLifecycleBatchId || null,
    taskId,
    growStageKey,
    parameterAlerts: alerts,
    temperatureC: temp != null && Number.isFinite(temp) ? temp : null,
    humidityPercent: hum != null && Number.isFinite(hum) ? hum : null,
    co2Ppm: co2 != null && Number.isFinite(co2) ? co2 : null,
    customParameters: Array.isArray(body.customParameters) ? body.customParameters : [],
    notes: body.notes ? String(body.notes).trim() : "",
    loggedByUserId: uid || undefined,
    loggedByName: req.user?.name ? String(req.user.name).trim() : "",
    loggedAt: body.loggedAt ? new Date(body.loggedAt) : new Date()
  });
  await appendIntervention(
    cycle,
    cycle.growingRoomId,
    cycle.compostLifecycleBatchId,
    taskId,
    "Parameter log recorded",
    [log.notes, alerts.length ? alerts.map((a) => a.message).join(" ") : ""].filter(Boolean).join(" — ") || "",
    req.user
  );
  const lean = log.toObject ? log.toObject() : log;
  return res.status(201).json({ ...lean, parameterAlerts: alerts });
});

/** GET /growing-room/cycles/:id/parameter-logs */
router.get("/cycles/:id/parameter-logs", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "view"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid cycle id" });
  }
  const logs = await GrowingRoomParameterLog.find({ companyId: req.companyId, cycleId: req.params.id })
    .sort({ loggedAt: -1 })
    .limit(500)
    .lean();
  return res.json(logs);
});

/** GET /growing-room/cycles/:id/intervention-logs */
router.get("/cycles/:id/intervention-logs", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "view"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid cycle id" });
  }
  const logs = await GrowingRoomInterventionLog.find({ companyId: req.companyId, cycleId: req.params.id })
    .sort({ performedAt: -1 })
    .limit(500)
    .lean();
  return res.json(logs);
});

/** POST /growing-room/cycles/:id/intervention-logs — free-form note */
router.post("/cycles/:id/intervention-logs", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid cycle id" });
  }
  const cycle = await GrowingRoomCycle.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!cycle) {
    return res.status(404).json({ error: "Cycle not found" });
  }
  const body = req.body || {};
  const action = String(body.action || "").trim() || "Note";
  const detail = String(body.detail || "").trim();
  const log = await GrowingRoomInterventionLog.create({
    companyId: req.companyId,
    cycleId: cycle._id,
    growingRoomId: cycle.growingRoomId,
    compostLifecycleBatchId: cycle.compostLifecycleBatchId || null,
    taskId: null,
    action,
    detail,
    performedByUserId: req.user?.id && mongoose.Types.ObjectId.isValid(String(req.user.id)) ? req.user.id : null,
    performedByName: req.user?.name ? String(req.user.name).trim() : ""
  });
  return res.status(201).json(log);
});

/** Reports */
router.get("/reports/room-performance", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "view"), async (req, res) => {
  const match = { companyId: req.companyId };
  if (req.query.roomId && mongoose.Types.ObjectId.isValid(String(req.query.roomId))) {
    match.growingRoomId = new mongoose.Types.ObjectId(String(req.query.roomId));
  }
  if (req.query.from || req.query.to) {
    match.cycleStartedAt = {};
    if (req.query.from) match.cycleStartedAt.$gte = new Date(req.query.from);
    if (req.query.to) match.cycleStartedAt.$lte = new Date(req.query.to);
  }
  const cycles = await GrowingRoomCycle.find(match)
    .select("growingRoomId cycleStartedAt status completedAt compostLifecycleBatchId")
    .sort({ cycleStartedAt: -1 })
    .limit(500)
    .lean();
  const roomIds = [...new Set(cycles.map((c) => String(c.growingRoomId)))];
  const rooms = await GrowingRoom.find({ companyId: req.companyId, _id: { $in: roomIds } })
    .select("name")
    .lean();
  const roomName = Object.fromEntries(rooms.map((r) => [String(r._id), r.name]));
  const cycleIds = cycles.map((c) => c._id);
  const yields = await GrowingRoomCycleTask.aggregate([
    { $match: { companyId: req.companyId, cycleId: { $in: cycleIds }, yieldKg: { $gt: 0 } } },
    { $group: { _id: "$cycleId", totalYield: { $sum: "$yieldKg" } } }
  ]);
  const yieldByCycle = Object.fromEntries(yields.map((y) => [String(y._id), y.totalYield]));
  return res.json(
    cycles.map((c) => ({
      cycleId: c._id,
      roomId: c.growingRoomId,
      roomName: roomName[String(c.growingRoomId)] || "—",
      cycleStartedAt: c.cycleStartedAt,
      status: c.status,
      completedAt: c.completedAt,
      compostLifecycleBatchId: c.compostLifecycleBatchId,
      totalYieldKg: yieldByCycle[String(c._id)] || 0
    }))
  );
});

router.get("/reports/batch-yield", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "view"), async (req, res) => {
  const rows = await GrowingRoomCycleTask.aggregate([
    { $match: { companyId: req.companyId, compostLifecycleBatchId: { $ne: null }, yieldKg: { $gt: 0 } } },
    {
      $group: {
        _id: "$compostLifecycleBatchId",
        totalYieldKg: { $sum: "$yieldKg" },
        entries: { $sum: 1 }
      }
    }
  ]);
  const batchIds = rows.map((r) => r._id).filter(Boolean);
  const batches = await CompostLifecycleBatch.find({ companyId: req.companyId, _id: { $in: batchIds } })
    .select("batchName startDate")
    .lean();
  const bn = Object.fromEntries(batches.map((b) => [String(b._id), b]));
  return res.json(
    rows.map((r) => ({
      compostLifecycleBatchId: r._id,
      batchName: bn[String(r._id)]?.batchName || String(r._id),
      startDate: bn[String(r._id)]?.startDate,
      totalYieldKg: r.totalYieldKg,
      yieldEntries: r.entries
    }))
  );
});

router.get("/reports/monthly-production", requireAuth, requireTenantContext, requirePermission("growingRoomOps", "view"), async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = Number(req.query.month);
  const start = new Date(year, Number.isFinite(month) ? month - 1 : 0, 1);
  const end = new Date(year, Number.isFinite(month) ? month : 12, 0, 23, 59, 59, 999);
  const tasks = await GrowingRoomCycleTask.find({
    companyId: req.companyId,
    yieldKg: { $gt: 0 },
    completedAt: { $gte: start, $lte: end }
  })
    .select("yieldKg completedAt compostLifecycleBatchId")
    .lean();
  let totalKg = 0;
  for (const t of tasks) {
    totalKg += Number(t.yieldKg) || 0;
  }
  return res.json({
    year,
    month: Number.isFinite(month) ? month : null,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    totalYieldKg: totalKg,
    yieldEntryCount: tasks.length
  });
});

export default router;
