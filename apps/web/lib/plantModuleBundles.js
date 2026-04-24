/** Must match apps/api/src/utils/plantModules.js BUNDLE ids. */
export const PLANT_BUNDLE_ORDER = [
  "expense",
  "room",
  "tunnel",
  "plant",
  "sales",
  "contributions",
  "administration"
];

/** Mirror of apps/api `BUNDLE_TO_MODULE_KEYS` for UI (derive selected bundles from stored keys). */
export const BUNDLE_TO_MODULE_KEYS = {
  expense: ["vendors", "materials", "vouchers", "reports"],
  room: ["roomStages", "roomActivities"],
  tunnel: ["tunnelBunkerOps"],
  plant: ["plantOperations", "growingRoomOps"],
  sales: ["sales"],
  contributions: ["contributions"],
  administration: ["admin", "roles", "users"]
};

export const PLANT_BUNDLE_LABELS = {
  expense: "Expense & finance — vendors, materials, vouchers, reports",
  room: "Room operations — stages & activities",
  tunnel: "Tunnel & bunker compost movement",
  plant: "Plant operations — compost lifecycle, growing rooms & related workflows",
  sales: "Sales invoices",
  contributions: "Contributions & cash withdrawals",
  administration: "Admin console — settings, roles, users, resources"
};

/**
 * Which bundles are fully enabled given flat `enabledModules` keys from the API.
 * @param {string[] | undefined} enabledKeys
 * @returns {Set<string>}
 */
export function selectedBundlesFromModuleKeys(enabledKeys) {
  if (!Array.isArray(enabledKeys) || enabledKeys.length === 0) {
    return new Set(PLANT_BUNDLE_ORDER);
  }
  const keySet = new Set(enabledKeys);
  const out = new Set();
  for (const bid of PLANT_BUNDLE_ORDER) {
    const ks = BUNDLE_TO_MODULE_KEYS[bid];
    if (ks?.length && ks.every((k) => keySet.has(k))) out.add(bid);
  }
  return out;
}
