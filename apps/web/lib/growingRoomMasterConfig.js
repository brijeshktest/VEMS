/**
 * Master grow-room stage definitions — keep in sync with `apps/api/src/utils/growingRoomMasterConfig.js`.
 */

/** @typedef {{ key: string; label: string }} ActivityDef */

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
    activities: [{ key: "watering", label: "Watering" }],
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

export const LEGACY_GROW_STAGE_KEY_MAP = {
  spawning: "spawn_run",
  case_run: "ruffling_case_run",
  pinning: "pinheads_fruiting"
};

export function normalizeGrowStageKey(key) {
  const k = String(key || "").trim();
  return LEGACY_GROW_STAGE_KEY_MAP[k] || k;
}

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

export const GROWING_STAGE_BOUNDS = buildGrowingStageBounds(true);

export function maxGrowCalendarDay(thirdFlushEnabled) {
  const b = buildGrowingStageBounds(thirdFlushEnabled);
  return b.end_cycle.dayEnd;
}

export function growStageSequenceFromMaster(thirdFlushEnabled) {
  const rows = thirdFlushEnabled
    ? MASTER_GROW_STAGE_ROWS
    : MASTER_GROW_STAGE_ROWS.filter((r) => r.key !== "third_flush");
  return [...rows.map((r) => r.key), "end_cycle"];
}

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
    if (b && d >= b.dayStart && d <= b.dayEnd) return { stageKey: k, label: b.label, ...b };
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

export function masterStageNotes(stageKey) {
  const k = normalizeGrowStageKey(stageKey);
  const row = MASTER_GROW_STAGE_ROWS.find((r) => r.key === k);
  return row?.notes || "";
}
