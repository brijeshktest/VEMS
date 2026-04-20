/**
 * Client helpers aligned with apps/api `requirePermission` and list routes (view).
 * Admin JWT users receive `{ permissions: "all" }` from GET /auth/permissions.
 */

export function isPermissionsAll(permissions) {
  return permissions === "all";
}

function modulePerm(permissions, moduleKey) {
  if (isPermissionsAll(permissions)) return { view: true, create: true, edit: true, delete: true };
  const p = permissions && typeof permissions === "object" ? permissions[moduleKey] : null;
  return p && typeof p === "object" ? p : {};
}

export function canViewModule(permissions, moduleKey) {
  return Boolean(modulePerm(permissions, moduleKey).view);
}

export function canCreateInModule(permissions, moduleKey) {
  return Boolean(modulePerm(permissions, moduleKey).create);
}

export function canEditInModule(permissions, moduleKey) {
  return Boolean(modulePerm(permissions, moduleKey).edit);
}

/** Expense work area: at least one expense-related list the user may open. */
export function hasExpenseAreaAccess(permissions) {
  if (isPermissionsAll(permissions)) return true;
  return (
    canViewModule(permissions, "vendors") ||
    canViewModule(permissions, "materials") ||
    canViewModule(permissions, "vouchers") ||
    canViewModule(permissions, "reports")
  );
}

export function canAccessTunnelOps(permissions) {
  if (isPermissionsAll(permissions)) return true;
  const p = permissions?.tunnelBunkerOps;
  return Boolean(p?.view || p?.edit);
}

export function canAccessRoomOps(permissions) {
  if (isPermissionsAll(permissions)) return true;
  const rs = permissions?.roomStages;
  const ra = permissions?.roomActivities;
  return Boolean(rs?.view || rs?.edit || ra?.view || ra?.edit);
}

export function canEditRoomStages(permissions) {
  if (isPermissionsAll(permissions)) return true;
  return Boolean(permissions?.roomStages?.edit);
}

export function canEditRoomActivities(permissions) {
  if (isPermissionsAll(permissions)) return true;
  return Boolean(permissions?.roomActivities?.edit);
}

export function canCreateTunnelBatch(permissions) {
  if (isPermissionsAll(permissions)) return true;
  return Boolean(permissions?.tunnelBunkerOps?.create);
}

export function canEditTunnelBatch(permissions) {
  if (isPermissionsAll(permissions)) return true;
  return Boolean(permissions?.tunnelBunkerOps?.edit);
}
