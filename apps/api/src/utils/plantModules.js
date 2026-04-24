/**
 * Plant module licensing: which permission keys the provider enabled for a tenant.
 * Bundles are used in onboarding UI; stored flat on Company.enabledModules.
 */

export const BUNDLE_TO_MODULE_KEYS = {
  expense: ["vendors", "materials", "vouchers", "reports"],
  room: ["roomStages", "roomActivities"],
  tunnel: ["tunnelBunkerOps"],
  plant: ["plantOperations", "growingRoomOps"],
  sales: ["sales"],
  contributions: ["contributions"],
  administration: ["admin", "roles", "users"]
};

export const MODULE_BUNDLE_ORDER = [
  "expense",
  "room",
  "tunnel",
  "plant",
  "sales",
  "contributions",
  "administration"
];

const VALID = new Set(Object.values(BUNDLE_TO_MODULE_KEYS).flat());

export const ALL_MODULE_KEYS_ARRAY = [...VALID];

export const ALL_MODULE_KEY_SET = new Set(ALL_MODULE_KEYS_ARRAY);

/**
 * @param {unknown} bundles
 * @returns {string[]}
 */
export function expandBundlesToModuleKeys(bundles) {
  if (!Array.isArray(bundles) || bundles.length === 0) {
    return [...ALL_MODULE_KEYS_ARRAY];
  }
  const out = new Set();
  for (const b of bundles) {
    const key = String(b || "").trim();
    const arr = BUNDLE_TO_MODULE_KEYS[key];
    if (arr) arr.forEach((k) => out.add(k));
  }
  return out.size ? [...out] : [...ALL_MODULE_KEYS_ARRAY];
}

/**
 * @param {unknown} raw — flat module keys from DB
 * @returns {Set<string>}
 */
export function normalizeEnabledModules(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return new Set(ALL_MODULE_KEYS_ARRAY);
  }
  const s = new Set();
  for (const k of raw) {
    const id = String(k || "").trim();
    if (VALID.has(id)) s.add(id);
  }
  return s.size ? s : new Set(ALL_MODULE_KEYS_ARRAY);
}

/**
 * @param {unknown} bundles
 * @returns {string[]}
 */
export function validateBundleListOr400(bundles) {
  if (!Array.isArray(bundles) || bundles.length === 0) {
    return { ok: false, error: "Select at least one module bundle for this plant." };
  }
  const keys = expandBundlesToModuleKeys(bundles);
  if (keys.length === 0) {
    return { ok: false, error: "No valid module bundles provided." };
  }
  return { ok: true, keys };
}
