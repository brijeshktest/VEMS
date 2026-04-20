/**
 * Default growing-room crop lifecycle templates and calendar helpers.
 * Stage calendar bounds come from `growingRoomMasterConfig.js`.
 */

import { buildGrowingStageBounds } from "./growingRoomMasterConfig.js";

export { GROWING_STAGE_BOUNDS, buildGrowingStageBounds, maxGrowCalendarDay } from "./growingRoomMasterConfig.js";

export const GROWING_STAGE_KEYS = [
  "spawn_run",
  "casing",
  "ruffling_case_run",
  "pinheads_fruiting",
  "first_flush",
  "second_flush",
  "third_flush",
  "end_cycle",
  "cleaning"
];

/**
 * @typedef {Object} TaskTemplate
 * @property {string} stageKey
 * @property {string} taskKey
 * @property {string} title
 * @property {number} dayStart
 * @property {number} dayEnd
 * @property {'once'|'daily'} recurrence
 * @property {string} [assignedRoleHint]
 * @property {boolean} [isOptional]
 * @property {boolean} [isCritical]
 * @property {'on_cleaning'} [trigger]
 */

/** Day ranges match `buildGrowingStageBounds(true)` (with third flush). */
/** @type {TaskTemplate[]} */
export const DEFAULT_TASK_TEMPLATES = [
  {
    stageKey: "spawn_run",
    taskKey: "compost_filling",
    title: "Compost Filling",
    dayStart: 1,
    dayEnd: 1,
    recurrence: "once",
    assignedRoleHint: "Supervisor/Worker",
    isCritical: true
  },
  {
    stageKey: "spawn_run",
    taskKey: "spawning",
    title: "Spawning",
    dayStart: 2,
    dayEnd: 2,
    recurrence: "once",
    assignedRoleHint: "Supervisor/Worker",
    isCritical: true
  },
  {
    stageKey: "spawn_run",
    taskKey: "th_rh_co2_monitoring",
    title: "Temperature / Humidity / CO₂ Monitoring",
    dayStart: 3,
    dayEnd: 15,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "casing",
    taskKey: "casing_soil_application",
    title: "Casing Soil Application",
    dayStart: 16,
    dayEnd: 16,
    recurrence: "once",
    isCritical: true
  },
  {
    stageKey: "casing",
    taskKey: "watering_after_casing",
    title: "Watering after Casing",
    dayStart: 17,
    dayEnd: 17,
    recurrence: "once",
    isCritical: true
  },
  {
    stageKey: "casing",
    taskKey: "casing_hold_monitoring",
    title: "Casing Hold Monitoring",
    dayStart: 18,
    dayEnd: 20,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "ruffling_case_run",
    taskKey: "light_watering",
    title: "Light Watering (as needed)",
    dayStart: 21,
    dayEnd: 25,
    recurrence: "daily",
    isOptional: true
  },
  {
    stageKey: "ruffling_case_run",
    taskKey: "ruffling",
    title: "Ruffling",
    dayStart: 21,
    dayEnd: 25,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "ruffling_case_run",
    taskKey: "thumping",
    title: "Thumping",
    dayStart: 21,
    dayEnd: 25,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "ruffling_case_run",
    taskKey: "humidity_maintenance",
    title: "Humidity Maintenance",
    dayStart: 21,
    dayEnd: 25,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "pinheads_fruiting",
    taskKey: "controlled_watering",
    title: "Controlled Watering",
    dayStart: 26,
    dayEnd: 31,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "pinheads_fruiting",
    taskKey: "fresh_air_adjustment",
    title: "Fresh Air Adjustment",
    dayStart: 26,
    dayEnd: 31,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "pinheads_fruiting",
    taskKey: "pin_observation",
    title: "Pin Observation",
    dayStart: 26,
    dayEnd: 31,
    recurrence: "daily"
  },
  {
    stageKey: "first_flush",
    taskKey: "harvesting",
    title: "Harvesting",
    dayStart: 32,
    dayEnd: 40,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "first_flush",
    taskKey: "yield_entry",
    title: "Yield Entry",
    dayStart: 32,
    dayEnd: 40,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "first_flush",
    taskKey: "post_harvest_watering",
    title: "Post-harvest Watering",
    dayStart: 32,
    dayEnd: 40,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "second_flush",
    taskKey: "harvesting",
    title: "Harvesting",
    dayStart: 41,
    dayEnd: 48,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "second_flush",
    taskKey: "yield_entry",
    title: "Yield Entry",
    dayStart: 41,
    dayEnd: 48,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "second_flush",
    taskKey: "watering",
    title: "Watering",
    dayStart: 41,
    dayEnd: 48,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "third_flush",
    taskKey: "harvesting",
    title: "Harvesting",
    dayStart: 49,
    dayEnd: 53,
    recurrence: "daily",
    isCritical: true
  },
  {
    stageKey: "third_flush",
    taskKey: "yield_entry",
    title: "Yield Entry",
    dayStart: 49,
    dayEnd: 53,
    recurrence: "daily",
    isCritical: true
  }
];

/** Tasks created when cycle moves to `cleaning` status — one cleaning step, then explicit room release. */
export const CLEANING_TASK_TEMPLATES = [
  {
    stageKey: "cleaning",
    taskKey: "room_cleaning",
    title: "Cleaning",
    recurrence: "once",
    assignedRoleHint: "Supervisor/Worker",
    isCritical: true,
    trigger: "on_cleaning"
  },
  {
    stageKey: "cleaning",
    taskKey: "release_room",
    title: "Release room",
    recurrence: "once",
    assignedRoleHint: "Supervisor/Worker",
    isCritical: true,
    trigger: "on_cleaning"
  }
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function cycleDayAtStart(cycleStartedAt) {
  const d = cycleStartedAt instanceof Date ? cycleStartedAt : new Date(cycleStartedAt);
  const t = new Date(d);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

/** 1-based cycle day index for "today" */
export function computeCycleDay(cycleStartedAt, now = new Date()) {
  const start = cycleDayAtStart(cycleStartedAt);
  const n = now instanceof Date ? now : new Date(now);
  const diff = n.getTime() - start.getTime();
  if (diff < 0) return 1;
  return Math.floor(diff / MS_PER_DAY) + 1;
}

export function dueDateForScheduledDay(cycleStartedAt, scheduledDay) {
  const start = cycleDayAtStart(cycleStartedAt);
  const day = Math.max(1, Number(scheduledDay) || 1);
  return new Date(start.getTime() + (day - 1) * MS_PER_DAY);
}

/**
 * @param {number} day
 * @param {boolean} [thirdFlushEnabled=true]
 */
export function stageForCycleDay(day, thirdFlushEnabled = true) {
  const d = Math.max(1, Number(day) || 1);
  const bounds = buildGrowingStageBounds(thirdFlushEnabled);
  const keys = [
    "spawn_run",
    "casing",
    "ruffling_case_run",
    "pinheads_fruiting",
    "first_flush",
    "second_flush"
  ];
  if (thirdFlushEnabled) keys.push("third_flush");
  for (const k of keys) {
    const b = bounds[k];
    if (!b) continue;
    if (d >= b.dayStart && d <= b.dayEnd) return { stageKey: k, label: b.label, ...b };
  }
  const ec = bounds.end_cycle;
  if (ec && d >= ec.dayStart && d <= ec.dayEnd) {
    return { stageKey: "end_cycle", label: ec.label, ...ec };
  }
  if (ec && d > ec.dayEnd) {
    return { stageKey: "end_cycle", label: ec.label, ...ec };
  }
  const fb = bounds.spawn_run;
  return { stageKey: "spawn_run", label: fb.label, ...fb };
}

/** Suggested hints for dashboard (not prescriptive). */
export const STAGE_RECOMMENDATIONS = {
  spawn_run: ["Maintain stable temperature during spawn run.", "Watch for ammonia spike in first week."],
  casing: ["Ensure casing soil is evenly applied.", "Avoid over-watering immediately after casing."],
  ruffling_case_run: ["Keep humidity steady; mist lightly if surfaces dry.", "Track ruffling until pinheads show."],
  pinheads_fruiting: ["High humidity helps pinning; manage CO₂ for pinset.", "Reduce watering slightly as pins develop."],
  first_flush: ["Reduce watering before peak harvest days.", "Log yield promptly after each pick."],
  second_flush: ["Allow substrate to recover between picks.", "Light ruffling between flushes as needed."],
  third_flush: ["High disease risk — monitor quality.", "Terminate crop when yield no longer justifies labor."],
  cleaning: [
    "Empty debris and spent compost, then clean and disinfect the room.",
    "Mark Release room only when the space is ready for the next crop — the room stays unavailable until the cycle is completed."
  ]
};

export function recommendationsForStage(stageKey) {
  return STAGE_RECOMMENDATIONS[String(stageKey || "").trim()] || [];
}

/**
 * Merge default templates with admin additions; remove any template whose `stageKey:taskKey` is in disabledKeys.
 * @param {TaskTemplate[]} defaultTemplates
 * @param {Partial<TaskTemplate>[]} additional
 * @param {string[]} disabledKeys — entries like `spawn_run:th_rh_co2_monitoring`
 */
export function mergeTemplatesWithOverride(defaultTemplates, additional, disabledKeys) {
  const disabled = new Set((disabledKeys || []).map((k) => String(k || "").trim()).filter(Boolean));
  const merged = [];
  for (const t of defaultTemplates) {
    const id = `${t.stageKey}:${t.taskKey}`;
    if (!disabled.has(id)) merged.push({ ...t });
  }
  for (const t of additional || []) {
    if (!t || typeof t !== "object") continue;
    if (!t.stageKey || !t.taskKey) continue;
    const id = `${String(t.stageKey).trim()}:${String(t.taskKey).trim()}`;
    if (!disabled.has(id)) merged.push(t);
  }
  return merged;
}

export function expandTemplatesToInstances(templates, opts = {}) {
  const thirdFlush = Boolean(opts.thirdFlushEnabled);
  const disabled = opts.disabledKeys || new Set();
  const out = [];
  for (const t of templates) {
    if (t.trigger === "on_cleaning") continue;
    if (t.stageKey === "third_flush" && !thirdFlush) continue;
    const key = `${t.stageKey}:${t.taskKey}:${t.dayStart}:${t.dayEnd}`;
    if (disabled.has(key) || disabled.has(`${t.stageKey}:${t.taskKey}`)) continue;
    const lo = Math.min(t.dayStart, t.dayEnd);
    const hi = Math.max(t.dayStart, t.dayEnd);
    if (t.recurrence === "once") {
      out.push({
        ...t,
        scheduledDay: lo
      });
    } else if (t.recurrence === "daily") {
      for (let day = lo; day <= hi; day += 1) {
        out.push({
          ...t,
          scheduledDay: day
        });
      }
    }
  }
  return out;
}

export function expandCleaningTasks(scheduledDay) {
  const day = Math.max(1, Number(scheduledDay) || 1);
  return CLEANING_TASK_TEMPLATES.map((t) => ({
    ...t,
    scheduledDay: day
  }));
}
