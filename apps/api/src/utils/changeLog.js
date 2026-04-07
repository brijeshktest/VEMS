import ChangeLog from "../models/ChangeLog.js";

export async function logChange({ entityType, entityId, action, user, before = null, after = null }) {
  try {
    await ChangeLog.create({
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
