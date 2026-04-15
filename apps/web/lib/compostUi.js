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

/**
 * Calendar day within the standard compost cycle (wetting → end of pasteurisation), aligned with the progress bar.
 * @param {{ startDate?: string, timeline?: { totalSpanDays?: number }, effectiveStatus?: string, operationalStageKey?: string }} batch
 * @param {Date} [now]
 */
export function compostCycleDayDisplay(batch, now = new Date()) {
  const totalRaw = Number(batch?.timeline?.totalSpanDays);
  const span = Number.isFinite(totalRaw) && totalRaw > 0 ? totalRaw : 20;
  const done = batch?.effectiveStatus === "done" || batch?.operationalStageKey === "done";
  if (done) {
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
 * True when the batch is still on a workflow stage but the standard calendar window for that stage
 * (from batch start + planned days) has already ended — user should record the next stage movement.
 * @param {{ operationalStageKey?: string, timeline?: { stages?: Array<{ key: string, endsAt?: string | null }> } }} batch
 * @param {Date} [now]
 */
export function compostStageAdvanceReminder(batch, now = new Date()) {
  const op = batch?.operationalStageKey;
  if (!op || op === "done") {
    return { due: false, endsAt: null, endsLabel: "", stageKey: op || "" };
  }
  const stages = batch?.timeline?.stages;
  if (!Array.isArray(stages)) {
    return { due: false, endsAt: null, endsLabel: "", stageKey: op };
  }
  const row = stages.find((s) => s.key === op);
  if (!row?.endsAt) {
    return { due: false, endsAt: null, endsLabel: "", stageKey: op };
  }
  const end = new Date(row.endsAt);
  if (Number.isNaN(end.getTime())) {
    return { due: false, endsAt: null, endsLabel: "", stageKey: op };
  }
  const t = now instanceof Date ? now : new Date(now);
  const due = t.getTime() >= end.getTime();
  return {
    due,
    endsAt: row.endsAt,
    endsLabel: formatShortDate(row.endsAt),
    stageKey: op
  };
}
