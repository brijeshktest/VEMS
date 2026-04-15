/** User-facing labels for lifecycle keys (must match server `COMPOST_STAGE_DEFS` labels). */
const STAGE_LABELS = {
  wetting: "Wetting",
  filling: "Filling",
  turn1: "Turn 1",
  turn2: "Turn 2",
  turn3: "Turn 3",
  pasteurisation: "Pasteurisation",
  done: "Compost ready"
};

/** Same order as server `COMPOST_STAGE_DEFS` / `COMPOST_STATUS_KEYS`. */
const COMPOST_STAGE_ORDER = ["wetting", "filling", "turn1", "turn2", "turn3", "pasteurisation", "done"];

function compostStageIndex(key) {
  const k = String(key || "").trim();
  const i = COMPOST_STAGE_ORDER.indexOf(k);
  return i < 0 ? -1 : i;
}

function inferNextStageKeyFromBatch(batch) {
  const fromApi = String(batch?.nextOperationalStage || "").trim();
  if (fromApi && STAGE_LABELS[fromApi]) return fromApi;
  const op = String(batch?.operationalStageKey || "").trim();
  const idx = compostStageIndex(op);
  if (idx < 0 || idx >= COMPOST_STAGE_ORDER.length - 1) return "";
  return COMPOST_STAGE_ORDER[idx + 1];
}

export function compostStageDisplayLabel(key) {
  const k = String(key || "").trim();
  return STAGE_LABELS[k] || k || "—";
}

/** Maps API compost lifecycle key to CSS modifier (valid class segment). */
export function compostStagePillClass(status) {
  const key = String(status || "").trim() || "wetting";
  return `compost-stage-pill compost-stage-pill--${key}`;
}

export function formatStockQty(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

export function formatShortDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return "—";
  }
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "—";
  }
}

/** Threshold alerts for daily compost parameter logs (aligned with plant operations UI). */
export function compostParameterLogAlerts(log) {
  if (!log) {
    return { highTemperature: false, lowMoisture: false };
  }
  return {
    highTemperature: Number(log.temperatureC) > 75,
    lowMoisture: Number(log.moisturePercent) < 65
  };
}

/** Planned compost-ready moment: end of pasteurisation on the standard timeline (`buildCompostTimeline`). */
export function compostEstimatedReadyIso(batch) {
  const stages = batch?.timeline?.stages;
  if (!Array.isArray(stages)) return null;
  const row = stages.find((s) => s.key === "pasteurisation");
  return row?.endsAt || null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from batch start to earliest stage movement into compost ready (`done`), for display when workflow finished early. */
function completionDayCountFromStageMovements(batch) {
  const movements = batch?.stageMovements;
  if (!Array.isArray(movements) || movements.length === 0) return null;
  let earliestDoneAt = null;
  for (const m of movements) {
    if (String(m?.toStage || "").trim() !== "done") continue;
    if (!m.movedAt) continue;
    const t = new Date(m.movedAt).getTime();
    if (Number.isNaN(t)) continue;
    if (earliestDoneAt == null || t < earliestDoneAt) earliestDoneAt = t;
  }
  if (earliestDoneAt == null) return null;
  const start = batch?.startDate ? new Date(batch.startDate) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  const ms = earliestDoneAt - start.getTime();
  if (!Number.isFinite(ms)) return null;
  const days = ms / MS_PER_DAY;
  return Math.max(1, Math.ceil(days));
}

/**
 * Calendar day within the standard compost cycle while in progress; once workflow is compost ready, shows actual duration.
 * @param {{
 *   startDate?: string,
 *   timeline?: { totalSpanDays?: number },
 *   effectiveStatus?: string,
 *   operationalStageKey?: string,
 *   stageMovements?: Array<{ toStage?: string, movedAt?: string | Date }>
 * }} batch
 * @param {Date} [now]
 */
export function compostCycleDayDisplay(batch, now = new Date()) {
  const totalRaw = Number(batch?.timeline?.totalSpanDays);
  const span = Number.isFinite(totalRaw) && totalRaw > 0 ? totalRaw : 20;
  if (batch?.operationalStageKey === "done") {
    const n = completionDayCountFromStageMovements(batch);
    if (n != null) {
      return `Completed in ${n} day${n === 1 ? "" : "s"}`;
    }
    return "Completed";
  }
  if (batch?.effectiveStatus === "done") {
    return `Day ${span} of ${span} · complete`;
  }
  const start = batch?.startDate ? new Date(batch.startDate) : null;
  if (!start || Number.isNaN(start.getTime())) return "—";
  const t = now instanceof Date ? now : new Date(now);
  const elapsedMs = Math.max(0, t.getTime() - start.getTime());
  const elapsedDays = elapsedMs / MS_PER_DAY;
  const day = Math.min(span, Math.floor(elapsedDays) + 1);
  return `Day ${day} of ${span}`;
}

/**
 * True when user intervention is needed to record the **next** workflow stage: either the planned end of the
 * current recorded stage has passed, or the date-only calendar plan (`computedStatus`) is already past the
 * recorded workflow stage.
 * @param {{
 *   operationalStageKey?: string,
 *   computedStatus?: string,
 *   nextOperationalStage?: string,
 *   timeline?: { stages?: Array<{ key: string, endsAt?: string | null }> }
 * }} batch
 * @param {Date} [now]
 * @returns {{
 *   due: boolean,
 *   endsAt: string | null,
 *   endsLabel: string,
 *   stageKey: string,
 *   nextStageKey: string,
 *   nextStageLabel: string
 * }}
 */
export function compostStageAdvanceReminder(batch, now = new Date()) {
  const empty = {
    due: false,
    endsAt: null,
    endsLabel: "",
    stageKey: "",
    nextStageKey: "",
    nextStageLabel: ""
  };
  const op = batch?.operationalStageKey;
  if (!op || op === "done") {
    return { ...empty, stageKey: op || "" };
  }
  const nextStageKey = inferNextStageKeyFromBatch(batch);
  const nextStageLabel = nextStageKey ? compostStageDisplayLabel(nextStageKey) : "";
  const stages = batch?.timeline?.stages;
  if (!Array.isArray(stages)) {
    return { ...empty, stageKey: op, nextStageKey, nextStageLabel };
  }
  const row = stages.find((s) => s.key === op);
  if (!row?.endsAt) {
    return { ...empty, stageKey: op, nextStageKey, nextStageLabel };
  }
  const end = new Date(row.endsAt);
  if (Number.isNaN(end.getTime())) {
    return { ...empty, stageKey: op, nextStageKey, nextStageLabel };
  }
  const t = now instanceof Date ? now : new Date(now);
  const pastPlannedEndOfRecordedStage = t.getTime() >= end.getTime();
  const idxOp = compostStageIndex(op);
  const idxComputed = compostStageIndex(batch?.computedStatus);
  const calendarAheadOfRecordedWorkflow =
    idxOp >= 0 && idxComputed >= 0 && idxComputed > idxOp;
  const due = pastPlannedEndOfRecordedStage || calendarAheadOfRecordedWorkflow;
  return {
    due,
    endsAt: row.endsAt,
    endsLabel: formatShortDate(row.endsAt),
    stageKey: op,
    nextStageKey,
    nextStageLabel
  };
}
