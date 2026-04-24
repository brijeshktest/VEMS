import Company from "../models/Company.js";
import User from "../models/User.js";
import Vendor from "../models/Vendor.js";
import Material from "../models/Material.js";
import Voucher from "../models/Voucher.js";
import Sale from "../models/Sale.js";
import ContributionEntry from "../models/ContributionEntry.js";
import CashWithdrawalEntry from "../models/CashWithdrawalEntry.js";
import Stage from "../models/Stage.js";
import GrowingRoom from "../models/GrowingRoom.js";
import TunnelBatch from "../models/TunnelBatch.js";
import CompostLifecycleBatch from "../models/CompostLifecycleBatch.js";
import GrowingRoomCycle from "../models/GrowingRoomCycle.js";
import GrowingRoomCycleTask from "../models/GrowingRoomCycleTask.js";
import GrowingRoomParameterLog from "../models/GrowingRoomParameterLog.js";
import GrowingRoomInterventionLog from "../models/GrowingRoomInterventionLog.js";
import GrowingRoomRulesOverride from "../models/GrowingRoomRulesOverride.js";
import AppSettings from "../models/AppSettings.js";
import ChangeLog from "../models/ChangeLog.js";
import Role from "../models/Role.js";
import { ensureDefaultRoomsForCompany } from "./companySeed.js";
import { ALL_MODULE_KEYS_ARRAY } from "./plantModules.js";

/** First onboarded plant: all legacy data is attributed here. */
export const FIRST_PLANT_NAME = "Shroom Agritech";
export const FIRST_PLANT_SLUG = "shroom-agritech";

const LEGACY_FILTER = {
  $or: [{ companyId: { $exists: false } }, { companyId: null }]
};

async function assignCompanyToModel(Model, companyId) {
  await Model.updateMany(LEGACY_FILTER, { $set: { companyId } });
}

/**
 * Idempotent: ensures at least one Company, backfills companyId on legacy rows,
 * and normalizes super_admin users (no plant assignment).
 */
export async function ensureTenantMigration() {
  const companies = await Company.find({ isActive: true }).select("_id").lean();
  for (const c of companies) {
    await ensureDefaultRoomsForCompany(c._id);
  }

  let company =
    (await Company.findOne({ slug: "default-plant" }).lean()) ||
    (await Company.findOne({ slug: FIRST_PLANT_SLUG }).lean()) ||
    (await Company.findOne({ isActive: true }).sort({ createdAt: 1 }).lean());

  if (company && company.slug === "default-plant") {
    await Company.updateOne(
      { _id: company._id },
      { $set: { name: FIRST_PLANT_NAME, slug: FIRST_PLANT_SLUG } }
    );
    company = await Company.findById(company._id).lean();
  } else if (company && company.name === "Default plant") {
    await Company.updateOne(
      { _id: company._id },
      { $set: { name: FIRST_PLANT_NAME, slug: FIRST_PLANT_SLUG } }
    );
    company = await Company.findById(company._id).lean();
  }

  if (!company) {
    const doc = await Company.create({
      name: FIRST_PLANT_NAME,
      slug: FIRST_PLANT_SLUG,
      isActive: true,
      enabledModules: ALL_MODULE_KEYS_ARRAY
    });
    company = doc.toObject();
  }

  const companyId = company._id;

  await User.updateMany({ ...LEGACY_FILTER, role: { $ne: "super_admin" } }, { $set: { companyId } });
  await User.updateMany({ role: "super_admin" }, { $set: { companyId: null } });

  await assignCompanyToModel(Role, companyId);
  await assignCompanyToModel(Vendor, companyId);
  await assignCompanyToModel(Material, companyId);
  await assignCompanyToModel(Voucher, companyId);
  await assignCompanyToModel(Sale, companyId);
  await assignCompanyToModel(ContributionEntry, companyId);
  await assignCompanyToModel(CashWithdrawalEntry, companyId);
  await assignCompanyToModel(Stage, companyId);
  await assignCompanyToModel(GrowingRoom, companyId);
  await assignCompanyToModel(TunnelBatch, companyId);
  await assignCompanyToModel(CompostLifecycleBatch, companyId);
  await assignCompanyToModel(GrowingRoomCycle, companyId);
  await assignCompanyToModel(GrowingRoomCycleTask, companyId);
  await assignCompanyToModel(GrowingRoomParameterLog, companyId);
  await assignCompanyToModel(GrowingRoomInterventionLog, companyId);
  await GrowingRoomRulesOverride.updateMany(LEGACY_FILTER, { $set: { companyId } });
  if (!(await GrowingRoomRulesOverride.exists({ companyId }))) {
    await GrowingRoomRulesOverride.create({ companyId, disabledKeys: [], additionalTemplates: [] });
  }
  await AppSettings.updateMany(LEGACY_FILTER, { $set: { companyId } });
  if (!(await AppSettings.exists({ companyId }))) {
    await AppSettings.create({ companyId });
  }
  await assignCompanyToModel(ChangeLog, companyId);

  await ensureDefaultRoomsForCompany(companyId);

  await Company.updateMany(
    { $or: [{ enabledModules: { $exists: false } }, { enabledModules: null }, { enabledModules: { $size: 0 } }] },
    { $set: { enabledModules: ALL_MODULE_KEYS_ARRAY } }
  );
}
