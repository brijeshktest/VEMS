/**
 * Master grow-room stage definitions (order, calendar days, environmental targets, activities).
 * Single source for bounds, parameter alerts, and activity checklists.
 */

/** @typedef {{ key: string; label: string }} ActivityDef */

/**
 * Stages 1–7 per plant SOP. `end_cycle` is appended for close-out before cleaning.
 * third_flush stage is omitted from the operational sequence when thirdFlushEnabled is false.
 */
export const MASTER_GROW_STAGE_ROWS = [
  {
    order: 1,
    key: "spawn_run",
    label: "Spawn Run",
    intervalDays: 15,
    humidityPercent: { min: 90, max: 95 },
    temperatureC: { min: 24, max: 25 },
    co2Ppm: { min: 10000, max: 20000 },
    activities: /** @type {ActivityDef[]} */ ([]),
    risky: false,
    notes:
      "No watering required. No ventilation required. Maintain 90–95% humidity, 24–25°C temperature, CO₂ between 10000–20000 ppm. Use fogging in short pulses to maintain RH."
  },
  {
    order: 2,
    key: "casing",
    label: "Casing",
    intervalDays: 5,
    humidityPercent: { min: 88, max: 92 },
    temperatureC: { min: 23, max: 25 },
    co2Ppm: { min: 7000, max: 9000 },
    activities: [
      { key: "watering", label: "Watering" }
    ],
    risky: false,
    notes:
      "400 ml water per bag 2–3 times on first day. After that, no watering unless mycelium visible (else 200 ml twice daily). Maintain 66% casing. Depth: 3–4 cm. Use moist porous casing. Avoid standing water."
  },
  {
    order: 3,
    key: "ruffling_case_run",
    label: "Ruffling and Case Run",
    intervalDays: 5,
    humidityPercent: { min: 88, max: 92 },
    temperatureC: { min: 23, max: 25 },
    co2Ppm: { min: 4000, max: 8000 },
    activities: [
      { key: "watering", label: "Watering" },
      { key: "ruffling", label: "Ruffling" },
      { key: "thumping", label: "Thumping" }
    ],
    risky: false,
    notes:
      "Break soil and add remaining casing. 100–200 ml water per bag twice daily until pinheads appear. Light misting only if dry. Avoid water logging. CO₂ range 4000–8000 ppm."
  },
  {
    order: 4,
    key: "pinheads_fruiting",
    label: "Pinheads Formation and Fruiting",
    intervalDays: 6,
    humidityPercent: { min: 82, max: 88 },
    temperatureC: { min: 16, max: 18 },
    co2Ppm: { min: 800, max: 1200 },
    activities: [{ key: "watering", label: "Watering" }],
    risky: false,
    notes:
      "Check CO₂ and humidity twice daily. Maintain 16–18°C. Ensure sudden drop in temperature and CO₂ for pinhead formation."
  },
  {
    order: 5,
    key: "first_flush",
    label: "First Flush Development & Harvest",
    intervalDays: 9,
    humidityPercent: { min: 82, max: 88 },
    temperatureC: { min: 16, max: 18 },
    co2Ppm: { min: 800, max: 1200 },
    activities: [{ key: "watering", label: "Watering" }],
    risky: false,
    notes: "Major yield stage (50–60%). Harvest daily. Avoid overwatering."
  },
  {
    order: 6,
    key: "second_flush",
    label: "Second Flush",
    intervalDays: 8,
    humidityPercent: { min: 82, max: 88 },
    temperatureC: { min: 17, max: 19 },
    co2Ppm: { min: 1200, max: 1800 },
    activities: [{ key: "ruffling", label: "Ruffling" }],
    risky: false,
    notes: "Light ruffling after first flush. Yield ~25–30%."
  },
  {
    order: 7,
    key: "third_flush",
    label: "Third Flush & Crop Termination",
    intervalDays: 5,
    humidityPercent: { min: 82, max: 88 },
    temperatureC: { min: 18, max: 22 },
    co2Ppm: { min: 1600, max: 2400 },
    activities: /** @type {ActivityDef[]} */ ([]),
    risky: true,
    notes: "Yield ~10–15%. High disease risk. Crop usually terminated."
  }
];

const END_CYCLE_DAYS = 3;

/** Legacy keys from older builds → current operational keys */
export const LEGACY_GROW_STAGE_KEY_MAP = {
  spawning: "spawn_run",
  case_run: "ruffling_case_run",
  pinning: "pinheads_fruiting"
};

export function normalizeGrowStageKey(key) {
  const k = String(key || "").trim();
  return LEGACY_GROW_STAGE_KEY_MAP[k] || k;
}

/**
 * Build calendar bounds from master rows + optional third flush + end cycle buffer.
 * @param {boolean} thirdFlushEnabled
 */
export function buildGrowingStageBounds(thirdFlushEnabled) {
  /** @type {Record<string, { label: string; dayStart: number; dayEnd: number; risky?: boolean }>} */
  const out = {};
  let day = 1;
  const rows = thirdFlushEnabled
    ? MASTER_GROW_STAGE_ROWS
    : MASTER_GROW_STAGE_ROWS.filter((r) => r.key !== "third_flush");
  for (const r of rows) {
    const start = day;
    const end = day + r.intervalDays - 1;
    out[r.key] = {
      label: r.label,
      dayStart: start,
      dayEnd: end,
      risky: Boolean(r.risky)
    };
    day = end + 1;
  }
  const ecStart = day;
  const ecEnd = day + END_CYCLE_DAYS - 1;
  out.end_cycle = {
    label: "End Cycle",
    dayStart: ecStart,
    dayEnd: ecEnd,
    risky: false
  };
  out.cleaning = { label: "Clean & release", dayStart: 0, dayEnd: 0, risky: false };
  return out;
}

/** Bounds when third flush is on (default for server helpers that need a reference). */
export const GROWING_STAGE_BOUNDS = buildGrowingStageBounds(true);

export function maxGrowCalendarDay(thirdFlushEnabled) {
  const b = buildGrowingStageBounds(thirdFlushEnabled);
  return b.end_cycle.dayEnd;
}

export function lastFlushDay(thirdFlushEnabled) {
  const b = buildGrowingStageBounds(thirdFlushEnabled);
  return thirdFlushEnabled ? b.third_flush.dayEnd : b.second_flush.dayEnd;
}

/**
 * @param {boolean} thirdFlushEnabled
 */
export function growStageSequenceFromMaster(thirdFlushEnabled) {
  const rows = thirdFlushEnabled
    ? MASTER_GROW_STAGE_ROWS
    : MASTER_GROW_STAGE_ROWS.filter((r) => r.key !== "third_flush");
  return [...rows.map((r) => r.key), "end_cycle"];
}

/**
 * Param targets for alerts (same bands as master environmental columns).
 */
export function buildGrowStageParamTargets(thirdFlushEnabled) {
  const rows = thirdFlushEnabled
    ? MASTER_GROW_STAGE_ROWS
    : MASTER_GROW_STAGE_ROWS.filter((r) => r.key !== "third_flush");
  /** @type {Record<string, object>} */
  const out = {};
  for (const r of rows) {
    out[r.key] = {
      label: r.label,
      temperatureC: r.temperatureC,
      humidityPercent: r.humidityPercent,
      co2Ppm: r.co2Ppm
    };
  }
  out.end_cycle = {
    label: "End Cycle",
    temperatureC: { min: 17, max: 22 },
    humidityPercent: { min: 78, max: 90 },
    co2Ppm: { min: 800, max: 2500 }
  };
  out.cleaning = {
    label: "Clean & release",
    temperatureC: { min: 16, max: 28 },
    humidityPercent: { min: 55, max: 88 },
    co2Ppm: { min: null, max: 2500 }
  };
  return out;
}

export const GROW_STAGE_PARAM_TARGETS = buildGrowStageParamTargets(true);

/**
 * Activity definitions for a stage (empty = no checklist gate).
 * @param {string} stageKey
 */
export function getActivityDefinitionsForStage(stageKey) {
  const k = normalizeGrowStageKey(stageKey);
  const row = MASTER_GROW_STAGE_ROWS.find((r) => r.key === k);
  return row?.activities || [];
}

/**
 * @param {string} stageKey
 * @param {{ stageKey?: string; activityKey?: string }[]} completions
 */
export function allActivitiesCompleteForStage(stageKey, completions) {
  const k = normalizeGrowStageKey(stageKey);
  const defs = getActivityDefinitionsForStage(k);
  if (defs.length === 0) return true;
  const done = new Set(
    (completions || [])
      .filter((c) => normalizeGrowStageKey(c.stageKey) === k && c.activityKey)
      .map((c) => String(c.activityKey).trim())
  );
  return defs.every((d) => done.has(d.key));
}

export function masterStageRow(stageKey) {
  const k = normalizeGrowStageKey(stageKey);
  return MASTER_GROW_STAGE_ROWS.find((r) => r.key === k) || null;
}
