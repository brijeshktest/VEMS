/**
 * Operational stage sequence + parameter alerts (uses master config).
 */
import {
  allActivitiesCompleteForStage,
  buildGrowStageParamTargets,
  growStageSequenceFromMaster,
  normalizeGrowStageKey
} from "./growingRoomMasterConfig.js";

export { allActivitiesCompleteForStage, normalizeGrowStageKey } from "./growingRoomMasterConfig.js";

/** Static targets map for routes that expect one object (third flush enabled). */
export const GROW_STAGE_PARAM_TARGETS = buildGrowStageParamTargets(true);

export function growStageSequence(thirdFlushEnabled) {
  return growStageSequenceFromMaster(thirdFlushEnabled);
}

export function nextGrowStageKey(currentKey, thirdFlushEnabled) {
  const seq = growStageSequence(thirdFlushEnabled);
  const normalized = normalizeGrowStageKey(currentKey);
  const i = seq.indexOf(String(normalized || "").trim());
  if (i < 0 || i >= seq.length - 1) return null;
  return seq[i + 1];
}

/**
 * @param {string} stageKey
 * @param {{ temperatureC?: number|null, humidityPercent?: number|null, co2Ppm?: number|null }} values
 * @param {boolean} [thirdFlushEnabled=true]
 */
export function evaluateGrowParameterAlerts(stageKey, values, thirdFlushEnabled = true) {
  const key = normalizeGrowStageKey(String(stageKey || "").trim());
  const targets = buildGrowStageParamTargets(thirdFlushEnabled);
  const spec = targets[key];
  if (!spec) return [];

  const alerts = [];
  const check = (param, label, v, min, max) => {
    if (v == null || !Number.isFinite(Number(v))) return;
    const n = Number(v);
    const unit = param === "temperatureC" ? "°C" : param === "humidityPercent" ? "%" : " ppm";
    const lo = min == null ? "—" : `${min}${unit}`;
    const hi = max == null ? "—" : `${max}${unit}`;
    if (min != null && n < min) {
      alerts.push({
        param,
        level: "low",
        message: `${label} is low (${n}${unit}) for ${spec.label}. Target range about ${lo}–${hi}.`
      });
    }
    if (max != null && n > max) {
      alerts.push({
        param,
        level: "high",
        message: `${label} is high (${n}${unit}) for ${spec.label}. Target range about ${lo}–${hi}.`
      });
    }
  };

  const t = spec.temperatureC;
  const h = spec.humidityPercent;
  const c = spec.co2Ppm;
  check("temperatureC", "Temperature", values.temperatureC, t?.min ?? null, t?.max ?? null);
  check("humidityPercent", "Humidity", values.humidityPercent, h?.min ?? null, h?.max ?? null);
  check("co2Ppm", "CO₂", values.co2Ppm, c?.min ?? null, c?.max ?? null);
  return alerts;
}

/**
 * First stage in sequence that still has open grow tasks; if none, end_cycle.
 */
export function inferRecordedGrowStageKey(tasks, thirdFlushEnabled) {
  const seq = growStageSequence(thirdFlushEnabled);
  for (const stageKey of seq) {
    const relevant = (tasks || []).filter(
      (t) => normalizeGrowStageKey(t.stageKey) === stageKey && String(t.stageKey) !== "cleaning"
    );
    if (relevant.length === 0) continue;
    const hasOpen = relevant.some((t) => t.status === "pending" || t.status === "in_progress");
    if (hasOpen) return stageKey;
  }
  return "end_cycle";
}

export function allGrowTasksCompleteForStage(tasks, stageKey) {
  const k = normalizeGrowStageKey(stageKey);
  const relevant = (tasks || []).filter((t) => normalizeGrowStageKey(t.stageKey) === k);
  if (relevant.length === 0) return true;
  return relevant.every((t) => t.status === "completed" || t.status === "skipped");
}
