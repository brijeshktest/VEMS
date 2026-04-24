/** Growing-room UI helpers — calendar aligns with `growingRoomMasterConfig.js` / API master config. */

import {
  GROWING_STAGE_BOUNDS,
  buildGrowingStageBounds,
  maxGrowCalendarDay,
  normalizeGrowStageKey,
  stageForCycleDay,
  masterStageNotes
} from "./growingRoomMasterConfig.js";

export {
  GROWING_STAGE_BOUNDS,
  buildGrowingStageBounds,
  normalizeGrowStageKey,
  stageForCycleDay,
  masterStageNotes
} from "./growingRoomMasterConfig.js";

/** Last calendar day of the grow (end_cycle window). */
export function maxGrowCycleDay(thirdFlushEnabled) {
  return maxGrowCalendarDay(thirdFlushEnabled);
}

const PRE_FLUSH_KEYS = [
  "spawn_run",
  "casing",
  "ruffling_case_run",
  "pinheads_fruiting"
];

/** 0–1 through the grow calendar (not including cleaning). */
export function growOverallProgressFraction(cycleDay, thirdFlushEnabled) {
  const maxD = maxGrowCycleDay(thirdFlushEnabled);
  const day = Math.min(Math.max(1, Number(cycleDay) || 1), maxD);
  if (maxD <= 1) return 1;
  return Math.min(1, (day - 1) / (maxD - 1));
}

/** Progress within the current stage’s day span. */
export function growStageProgressFraction(cycleDay, stageInfo) {
  if (!stageInfo || stageInfo.stageKey === "end_cycle" || stageInfo.stageKey === "cleaning") return 1;
  const lo = stageInfo.dayStart;
  const hi = stageInfo.dayEnd;
  const span = hi - lo + 1;
  if (span <= 0) return 1;
  const d = Math.max(1, Number(cycleDay) || 1);
  const inStage = Math.max(0, Math.min(d, hi) - lo + 1);
  return Math.min(1, inStage / span);
}

export function isBeforeFirstFlushStage(stageKey) {
  return PRE_FLUSH_KEYS.includes(String(stageKey || "").trim());
}

export function isFirstFlushOrLater(stageKey) {
  const k = String(stageKey || "").trim();
  return ["first_flush", "second_flush", "third_flush", "end_cycle", "cleaning"].includes(k);
}

/** Stages shown in the horizontal lifecycle (grow phases only). */
export function timelineStageEntries(thirdFlushEnabled) {
  const rows = [
    { key: "spawn_run", short: "Spawn" },
    { key: "casing", short: "Case" },
    { key: "ruffling_case_run", short: "Ruffle" },
    { key: "pinheads_fruiting", short: "Pins" },
    { key: "first_flush", short: "1st" },
    { key: "second_flush", short: "2nd" }
  ];
  if (thirdFlushEnabled) {
    rows.push({ key: "third_flush", short: "3rd" });
  }
  const bounds = buildGrowingStageBounds(thirdFlushEnabled);
  return rows.map((r) => {
    const b = bounds[r.key];
    return {
      ...r,
      label: b?.label || r.key,
      dayStart: b?.dayStart ?? 0,
      dayEnd: b?.dayEnd ?? 0
    };
  });
}

export function timelineStepState(cycleDay, stageKey, entryKey) {
  const d = Math.max(1, Number(cycleDay) || 1);
  const b = GROWING_STAGE_BOUNDS[entryKey];
  if (!b || !b.dayStart) return "future";
  if (d < b.dayStart) return "future";
  if (d > b.dayEnd) return "past";
  if (stageKey === entryKey) return "active";
  return "past";
}

/** For cleaning phase: active step is synthetic */
export function effectiveTimelineStageKey(cycleStatus, cycleDay, computedStageKey) {
  if (cycleStatus === "cleaning") return "cleaning";
  return computedStageKey;
}

export function sumYieldKgFromTasks(tasks) {
  if (!Array.isArray(tasks)) return 0;
  let s = 0;
  for (const t of tasks) {
    const y = Number(t.yieldKg);
    if (Number.isFinite(y) && y > 0) s += y;
  }
  return s;
}

export function countTaskStats(tasks) {
  let pending = 0;
  let overdue = 0;
  if (!Array.isArray(tasks)) return { pending: 0, overdue: 0 };
  for (const t of tasks) {
    if (t.status === "pending" || t.status === "in_progress") {
      pending += 1;
      if (t.overdue) overdue += 1;
    }
  }
  return { pending, overdue };
}

/** Grow-phase tasks only (excludes cleaning). Open = pending or in_progress. */
export function growPhaseOpenTaskCount(tasks) {
  if (!Array.isArray(tasks)) return 0;
  let n = 0;
  for (const t of tasks) {
    if (String(t.stageKey) === "cleaning") continue;
    if (t.status === "pending" || t.status === "in_progress") n += 1;
  }
  return n;
}

/** Ordered grow calendar stages (no cleaning). */
export const GROW_STAGE_ORDER = [
  "spawn_run",
  "casing",
  "ruffling_case_run",
  "pinheads_fruiting",
  "first_flush",
  "second_flush",
  "third_flush",
  "end_cycle"
];

export const STAGE_RECOMMENDATIONS = {
  spawn_run: ["Maintain stable temperature during spawn run.", "Watch for ammonia spike in first week."],
  casing: ["Ensure casing soil is evenly applied.", "Avoid over-watering immediately after casing."],
  ruffling_case_run: ["Keep humidity steady; mist lightly if surfaces dry.", "Complete ruffling and thumping per SOP."],
  pinheads_fruiting: ["High humidity helps pinning; manage CO₂ for pinset.", "Avoid sudden drafts."],
  first_flush: ["Reduce watering before peak harvest days.", "Log yield promptly after each pick."],
  second_flush: ["Allow substrate to recover between picks.", "Light ruffling between flushes as needed."],
  third_flush: ["High disease risk — monitor quality before investing labor.", "Crop usually terminated after this flush."],
  end_cycle: ["Finish remaining picks and records; when grow tasks are done, start scheduled cleaning from Context."],
  cleaning: [
    "Empty debris and spent compost, then clean and disinfect.",
    "Complete Release room only when the space is ready — the room stays unavailable until the cycle is finished."
  ]
};

export const STAGE_FOCUS_LINE = {
  spawn_run: "Monitor temperature, humidity, and CO₂ while mycelium runs — no watering or ventilation per SOP.",
  casing: "Apply casing soil and manage watering per bag schedule; maintain casing depth and moisture.",
  ruffling_case_run: "Ruffling, thumping, and light watering until pinheads appear.",
  pinheads_fruiting: "Manage air and water for pinset; check CO₂ and humidity twice daily.",
  first_flush: "Log yield as you pick (yield entry covers harvest for the day), then post-harvest watering through the first wave.",
  second_flush: "Second harvest wave — log yield as you pick, then watering and light ruffling.",
  third_flush: "Final flush — log yield and check quality; high disease risk.",
  end_cycle: "Close out the crop calendar before cleaning.",
  cleaning: "Final stage: clean and disinfect the room, then explicitly release it so a new cycle can start."
};

export const STAGE_EXPECTED_TASK_TYPES = {
  spawn_run: [
    { title: "Compost Filling", note: "day 1" },
    { title: "Spawning", note: "day 2" },
    { title: "Temperature / Humidity / CO₂ Monitoring", note: "daily" }
  ],
  casing: [
    { title: "Casing Soil Application", note: "once" },
    { title: "Watering after Casing", note: "per SOP" },
    { title: "Casing Hold Monitoring", note: "daily" }
  ],
  ruffling_case_run: [
    {
      title: "Ruffling and case run (daily)",
      note: "humidity, optional light watering, ruffling & thumping — once on each cycle day, one row per day"
    }
  ],
  pinheads_fruiting: [
    {
      title: "Pinheads & fruiting (daily bundle)",
      note: "controlled watering, fresh air adjustment & pin observation — once on each cycle day, one row per day"
    }
  ],
  first_flush: [
    { title: "Yield Entry", note: "daily · logging yield covers harvest for that day" },
    { title: "Post-harvest Watering", note: "daily" }
  ],
  second_flush: [
    { title: "Yield Entry", note: "daily · logging yield covers harvest for that day" },
    { title: "Watering", note: "daily" }
  ],
  third_flush: [{ title: "Yield Entry", note: "daily · logging yield covers harvest for that day" }],
  end_cycle: [],
  cleaning: [
    { title: "Cleaning", note: "once · empty, clean, disinfect" },
    { title: "Release room", note: "once · confirms room ready for next crop" }
  ]
};

export function growStagesForGuide(thirdFlushEnabled) {
  return GROW_STAGE_ORDER.filter((k) => k !== "third_flush" || thirdFlushEnabled);
}

export function tasksOpenInStage(tasks, stageKey) {
  if (!Array.isArray(tasks)) return 0;
  const want = normalizeGrowStageKey(stageKey);
  let n = 0;
  for (const t of tasks) {
    if (normalizeGrowStageKey(t.stageKey) !== want) continue;
    if (t.status === "pending" || t.status === "in_progress") n += 1;
  }
  return n;
}

export function groupGrowTasksByStage(tasks) {
  const map = new Map();
  if (!Array.isArray(tasks)) return map;
  for (const t of tasks) {
    if (String(t.stageKey) === "cleaning") continue;
    const k = normalizeGrowStageKey(String(t.stageKey));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  for (const [, arr] of map) {
    arr.sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return da - db;
    });
  }
  return map;
}

export function sortTasksForDisplay(list) {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    if (da !== db) return da - db;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}
