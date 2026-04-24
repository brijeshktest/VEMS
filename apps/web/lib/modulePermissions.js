/**
 * Client helpers aligned with apps/api `requirePermission` and GET /auth/permissions.
 * Optional `plantModuleKeys` restricts UI when the provider enabled only some modules for this plant.
 */

export function isPlatformAdminRole(role) {
  return role === "admin" || role === "super_admin";
}

export function isPermissionsAll(permissions) {
  return permissions === "all";
}

/** @param {string[] | null | undefined} plantModuleKeys */
function plantAllows(plantModuleKeys, moduleKey) {
  if (plantModuleKeys == null || !Array.isArray(plantModuleKeys) || plantModuleKeys.length === 0) {
    return true;
  }
  return plantModuleKeys.includes(moduleKey);
}

function modulePerm(permissions, moduleKey, plantModuleKeys) {
  if (!plantAllows(plantModuleKeys, moduleKey)) {
    return {};
  }
  if (isPermissionsAll(permissions)) return { view: true, create: true, edit: true, delete: true };
  const p = permissions && typeof permissions === "object" ? permissions[moduleKey] : null;
  return p && typeof p === "object" ? p : {};
}

/** @param {string[] | null | undefined} plantModuleKeys */
export function canViewModule(permissions, moduleKey, plantModuleKeys) {
  return Boolean(modulePerm(permissions, moduleKey, plantModuleKeys).view);
}

/** @param {string[] | null | undefined} plantModuleKeys */
export function canCreateInModule(permissions, moduleKey, plantModuleKeys) {
  return Boolean(modulePerm(permissions, moduleKey, plantModuleKeys).create);
}

/** @param {string[] | null | undefined} plantModuleKeys */
export function canEditInModule(permissions, moduleKey, plantModuleKeys) {
  return Boolean(modulePerm(permissions, moduleKey, plantModuleKeys).edit);
}

/** @param {string[] | null | undefined} plantModuleKeys */
export function hasExpenseAreaAccess(permissions, plantModuleKeys) {
  if (plantModuleKeys?.length) {
    const any = ["vendors", "materials", "vouchers", "reports"].some((k) => plantModuleKeys.includes(k));
    if (!any) return false;
  }
  if (isPermissionsAll(permissions)) return true;
  return (
    canViewModule(permissions, "vendors", plantModuleKeys) ||
    canViewModule(permissions, "materials", plantModuleKeys) ||
    canViewModule(permissions, "vouchers", plantModuleKeys) ||
    canViewModule(permissions, "reports", plantModuleKeys)
  );
}

/** @param {string[] | null | undefined} plantModuleKeys */
export function canAccessTunnelOps(permissions, plantModuleKeys) {
  if (plantModuleKeys?.length && !plantModuleKeys.includes("tunnelBunkerOps")) {
    return false;
  }
  if (isPermissionsAll(permissions)) return true;
  const p = permissions?.tunnelBunkerOps;
  return Boolean(p?.view || p?.edit);
}

/** @param {string[] | null | undefined} plantModuleKeys */
export function canAccessRoomOps(permissions, plantModuleKeys) {
  if (plantModuleKeys?.length) {
    const ok = plantModuleKeys.includes("roomStages") || plantModuleKeys.includes("roomActivities");
    if (!ok) return false;
  }
  if (isPermissionsAll(permissions)) return true;
  const rs = permissions?.roomStages;
  const ra = permissions?.roomActivities;
  return Boolean(rs?.view || rs?.edit || ra?.view || ra?.edit);
}

/** @param {string[] | null | undefined} plantModuleKeys */
export function canEditRoomStages(permissions, plantModuleKeys) {
  if (plantModuleKeys?.length && !plantModuleKeys.includes("roomStages")) return false;
  if (isPermissionsAll(permissions)) return true;
  return Boolean(permissions?.roomStages?.edit);
}

/** @param {string[] | null | undefined} plantModuleKeys */
export function canEditRoomActivities(permissions, plantModuleKeys) {
  if (plantModuleKeys?.length && !plantModuleKeys.includes("roomActivities")) return false;
  if (isPermissionsAll(permissions)) return true;
  return Boolean(permissions?.roomActivities?.edit);
}

/** @param {string[] | null | undefined} plantModuleKeys */
export function canCreateTunnelBatch(permissions, plantModuleKeys) {
  if (plantModuleKeys?.length && !plantModuleKeys.includes("tunnelBunkerOps")) return false;
  if (isPermissionsAll(permissions)) return true;
  return Boolean(permissions?.tunnelBunkerOps?.create);
}

/** @param {string[] | null | undefined} plantModuleKeys */
export function canEditTunnelBatch(permissions, plantModuleKeys) {
  if (plantModuleKeys?.length && !plantModuleKeys.includes("tunnelBunkerOps")) return false;
  if (isPermissionsAll(permissions)) return true;
  return Boolean(permissions?.tunnelBunkerOps?.edit);
}
