import GrowingRoom from "../models/GrowingRoom.js";

let legacyGrowingRoomIndexReconciled = false;

/** Older DBs had a global unique index on `name`; multi-tenant needs only (companyId, name). */
async function reconcileGrowingRoomIndexes() {
  if (legacyGrowingRoomIndexReconciled) return;
  try {
    const indexes = await GrowingRoom.collection.indexes();
    const hasLegacyNameOnly = indexes.some((ix) => ix.name === "name_1");
    if (hasLegacyNameOnly) {
      await GrowingRoom.collection.dropIndex("name_1");
      // eslint-disable-next-line no-console
      console.log("[companySeed] Dropped legacy index growingrooms.name_1 (unique name globally).");
    }
    await GrowingRoom.syncIndexes();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[companySeed] Index reconcile (non-fatal):", e && e.message ? e.message : e);
  } finally {
    legacyGrowingRoomIndexReconciled = true;
  }
}

/**
 * Does not create template rooms — plant admins add rooms/resources in Admin.
 * Keeps legacy field defaults in sync for any rooms that already exist for this company.
 */
export async function ensureDefaultRoomsForCompany(companyId) {
  await reconcileGrowingRoomIndexes();
  await GrowingRoom.updateMany(
    { companyId, $or: [{ capacityTons: { $exists: false } }, { capacityTons: null }] },
    [{ $set: { capacityTons: "$maxBagCapacity" } }]
  );
  await GrowingRoom.updateMany(
    { companyId, resourceType: { $exists: false } },
    { $set: { resourceType: "Room", locationInPlant: "" } }
  );
}
