/** Fixed compost batch lifecycle (durations in whole days). */
export const COMPOST_STAGE_DEFS = [
  { key: "wetting", label: "Wetting", days: 3 },
  { key: "filling", label: "Filling", days: 1 },
  { key: "turn1", label: "Turn 1", days: 2 },
  { key: "turn2", label: "Turn 2", days: 2 },
  { key: "turn3", label: "Turn 3", days: 2 },
  { key: "pasteurisation", label: "Pasteurisation", days: 10 },
  { key: "done", label: "Compost ready", days: 0 }
];

export const COMPOST_STATUS_KEYS = COMPOST_STAGE_DEFS.map((s) => s.key);

export function getNextStageKey(currentKey) {
  const k = String(currentKey || "").trim();
  const idx = COMPOST_STAGE_DEFS.findIndex((s) => s.key === k);
  if (idx < 0 || idx >= COMPOST_STAGE_DEFS.length - 1) {
    return null;
  }
  return COMPOST_STAGE_DEFS[idx + 1].key;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Cumulative day boundaries: stage i covers [boundary[i], boundary[i+1]) in day-space from start. */
export function compostStageBoundaries() {
  const boundaries = [0];
  for (const s of COMPOST_STAGE_DEFS) {
    boundaries.push(boundaries[boundaries.length - 1] + s.days);
  }
  return boundaries;
}

const BOUNDARIES = compostStageBoundaries();

/** Total calendar span (days) until end of pasteurisation (exclusive of done). */
export function compostActiveSpanDays() {
  return BOUNDARIES[BOUNDARIES.length - 2];
}

/**
 * Auto-derived status from start date and "now".
 * Before start date: still wetting (planned).
 */
export function computedCompostStatus(startDate, now = new Date()) {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  if (Number.isNaN(start.getTime())) {
    return "wetting";
  }
  const elapsedMs = now.getTime() - start.getTime();
  const elapsedDays = elapsedMs / MS_PER_DAY;
  if (elapsedDays < 0) {
    return "wetting";
  }
  for (let i = 0; i < COMPOST_STAGE_DEFS.length - 1; i += 1) {
    const lo = BOUNDARIES[i];
    const hi = BOUNDARIES[i + 1];
    if (elapsedDays >= lo && elapsedDays < hi) {
      return COMPOST_STAGE_DEFS[i].key;
    }
  }
  return "done";
}

export function effectiveCompostStatus(doc, now = new Date()) {
  const manual = doc.manualStatus && String(doc.manualStatus).trim();
  if (manual && COMPOST_STATUS_KEYS.includes(manual)) {
    return manual;
  }
  return computedCompostStatus(doc.startDate, now);
}

/** Resource types (GrowingRoom.resourceType) allowed for allocation at this compost status. */
export function resourceTypesForCompostStatus(status) {
  switch (status) {
    case "wetting":
      return ["Lagoon"];
    case "filling":
    case "turn1":
    case "turn2":
    case "turn3":
      return ["Bunker"];
    case "pasteurisation":
      return ["Tunnel"];
    case "done":
      return ["Bunker"];
    default:
      return [];
  }
}

export function buildCompostTimeline(startDate) {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  if (Number.isNaN(start.getTime())) {
    return { stages: [], totalSpanDays: compostActiveSpanDays() };
  }
  const startMs = start.getTime();
  const stages = COMPOST_STAGE_DEFS.map((def, i) => {
    const startOffsetDays = BOUNDARIES[i];
    const startsAt = new Date(startMs + startOffsetDays * MS_PER_DAY);
    const endsAt =
      def.key === "done" ? null : new Date(startMs + BOUNDARIES[i + 1] * MS_PER_DAY);
    return {
      key: def.key,
      label: def.label,
      days: def.days,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt ? endsAt.toISOString() : null
    };
  });
  return { stages, totalSpanDays: compostActiveSpanDays() };
}

/**
 * Planned calendar end of a lifecycle stage for a batch start (ISO string).
 * Used to estimate when a plant resource tied to that stage may be released if the batch follows the standard timeline.
 */
export function expectedStageEndIso(startDate, stageKey) {
  const k = String(stageKey || "wetting").trim();
  if (!COMPOST_STATUS_KEYS.includes(k) || k === "done") {
    return null;
  }
  const { stages } = buildCompostTimeline(startDate);
  const row = stages.find((s) => s.key === k);
  return row?.endsAt || null;
}

export function compostProgressFraction(startDate, effectiveStatus, now = new Date()) {
  const total = compostActiveSpanDays();
  if (total <= 0) return 0;
  if (effectiveStatus === "done") return 1;
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const elapsedMs = now.getTime() - start.getTime();
  const elapsedDays = Math.max(0, elapsedMs / MS_PER_DAY);
  return Math.min(1, elapsedDays / total);
}
