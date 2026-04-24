import ChangeLog from "../models/ChangeLog.js";

export async function logChange({ entityType, entityId, action, user, before = null, after = null, companyId }) {
  try {
    if (!companyId) return;
    await ChangeLog.create({
      companyId,
      entityType,
      entityId: String(entityId),
      action,
      changedByUserId: user?.id ? String(user.id) : "",
      changedByName: user?.name || "",
      before,
      after
    });
  } catch {
    // Change logs are best-effort and should not block primary operations.
  }
}
