import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { UPLOAD_ROOT } from "./fileUpload.js";
import AppSettings from "../models/AppSettings.js";
import CashWithdrawalEntry from "../models/CashWithdrawalEntry.js";
import ChangeLog from "../models/ChangeLog.js";
import Company from "../models/Company.js";
import CompostLifecycleBatch from "../models/CompostLifecycleBatch.js";
import ContributionEntry from "../models/ContributionEntry.js";
import GrowingRoom from "../models/GrowingRoom.js";
import GrowingRoomCycle from "../models/GrowingRoomCycle.js";
import GrowingRoomCycleTask from "../models/GrowingRoomCycleTask.js";
import GrowingRoomInterventionLog from "../models/GrowingRoomInterventionLog.js";
import GrowingRoomParameterLog from "../models/GrowingRoomParameterLog.js";
import GrowingRoomRulesOverride from "../models/GrowingRoomRulesOverride.js";
import Material from "../models/Material.js";
import PlatformSettings from "../models/PlatformSettings.js";
import Role from "../models/Role.js";
import Sale from "../models/Sale.js";
import Stage from "../models/Stage.js";
import TunnelBatch from "../models/TunnelBatch.js";
import User from "../models/User.js";
import Vendor from "../models/Vendor.js";
import Voucher from "../models/Voucher.js";

const BRANDING_SUBDIR = "branding";

function logoFullPath(storedName) {
  if (!storedName || storedName.includes("/") || storedName.includes("\\") || storedName.includes("..")) {
    return null;
  }
  const base = path.join(UPLOAD_ROOT, BRANDING_SUBDIR);
  const full = path.join(base, storedName);
  const resolvedBase = path.resolve(base);
  const resolvedFull = path.resolve(full);
  if (!resolvedFull.startsWith(resolvedBase + path.sep) && resolvedFull !== resolvedBase) {
    return null;
  }
  return resolvedFull;
}

/**
 * Permanently remove a plant and all tenant-scoped rows (Super Admin only).
 * @param {mongoose.Types.ObjectId} companyObjectId
 */
export async function purgeCompanyAndAllData(companyObjectId) {
  const cid = companyObjectId;
  const filter = { companyId: cid };

  const settings = await AppSettings.findOne(filter).select("logoStoredName").lean();
  if (settings?.logoStoredName) {
    const fp = logoFullPath(settings.logoStoredName);
    if (fp) {
      try {
        await fs.unlink(fp);
      } catch {
        /* ignore missing file */
      }
    }
  }

  await GrowingRoomCycleTask.deleteMany(filter);
  await GrowingRoomInterventionLog.deleteMany(filter);
  await GrowingRoomParameterLog.deleteMany(filter);
  await GrowingRoomCycle.deleteMany(filter);
  await TunnelBatch.deleteMany(filter);
  await CompostLifecycleBatch.deleteMany(filter);
  await GrowingRoom.deleteMany(filter);
  await ContributionEntry.deleteMany(filter);
  await CashWithdrawalEntry.deleteMany(filter);
  await Sale.deleteMany(filter);
  await Voucher.deleteMany(filter);
  await Material.deleteMany(filter);
  await Vendor.deleteMany(filter);
  await ChangeLog.deleteMany(filter);
  await Stage.deleteMany(filter);
  await User.deleteMany(filter);
  await Role.deleteMany(filter);
  await GrowingRoomRulesOverride.deleteMany(filter);
  await AppSettings.deleteMany(filter);

  await Company.deleteOne({ _id: cid });

  const ps = await PlatformSettings.findOne().sort({ createdAt: 1 });
  if (ps?.defaultPlantCompanyId && String(ps.defaultPlantCompanyId) === String(cid)) {
    ps.defaultPlantCompanyId = null;
    await ps.save();
  }
}
