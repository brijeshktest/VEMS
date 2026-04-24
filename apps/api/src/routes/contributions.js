import express from "express";
import mongoose from "mongoose";
import CashWithdrawalEntry from "../models/CashWithdrawalEntry.js";
import ContributionEntry from "../models/ContributionEntry.js";
import Voucher from "../models/Voucher.js";
import {
  CONTRIBUTION_MEMBERS,
  PRIMARY_ACCOUNT_HOLDERS,
  CONTRIBUTION_TRANSFER_MODES,
  CONTRIBUTION_TRANSFER_MODES_INTERNAL,
  isPrimaryHolder
} from "../models/contributionConstants.js";
import {
  requireAuth,
  requirePermission,
  requireContributionsBulkUpload,
  requireContributionsBulkDelete
} from "../middleware/auth.js";
import { requireTenantContext } from "../middleware/companyScope.js";
import { requireFields } from "../utils/validators.js";
import { expensePaidTotalsByContributionMember } from "../utils/expensePaidByMemberAgg.js";

const router = express.Router();

/** Paid vouchers: Company Account + Paid by mode Cash (same rules as cash-withdrawals dashlets). */
const VOUCHER_MATCH_PAID_COMPANY_ACCOUNT_CASH_MODE = {
  paymentStatus: "Paid",
  $expr: {
    $and: [
      { $eq: [{ $toLower: { $trim: { input: { $ifNull: ["$paymentMadeBy", ""] } } } }, "company account"] },
      { $eq: [{ $toLower: { $trim: { input: { $ifNull: ["$paidByMode", ""] } } } }, "cash"] }
    ]
  }
};

/** Totals used on cash-withdrawals page and in contribution bank balance. */
async function computeCashWithdrawalDashMetrics(companyId) {
  const [withdrawalSumAgg, companyCashVoucherAgg] = await Promise.all([
    CashWithdrawalEntry.aggregate([
      { $match: { companyId } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]),
    Voucher.aggregate([
      { $match: { companyId, ...VOUCHER_MATCH_PAID_COMPANY_ACCOUNT_CASH_MODE } },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ["$paidAmount", "$finalAmount"] } }
        }
      }
    ])
  ]);
  const totalWithdrawal = Number(withdrawalSumAgg[0]?.total) || 0;
  const totalCashSpent = Number(companyCashVoucherAgg[0]?.total) || 0;
  const cashInHand = totalWithdrawal - totalCashSpent;
  return { totalWithdrawal, totalCashSpent, cashInHand };
}

/** Mongoose pluralized collection name for the removed ContributionTransfer model. */
const LEGACY_TRANSFER_COLLECTION = "contributiontransfers";

let migrationPromise = null;

async function ensureContributionsMigrated() {
  if (!migrationPromise) {
    migrationPromise = runContributionsMigration().catch((err) => {
      migrationPromise = null;
      throw err;
    });
  }
  return migrationPromise;
}

async function runContributionsMigration() {
  const db = mongoose.connection.db;
  if (!db) return;

  const legacyCol = db.collection(LEGACY_TRANSFER_COLLECTION);
  const legacyCount = await legacyCol.countDocuments();
  if (legacyCount > 0) {
    const cursor = legacyCol.find({});
    for await (const t of cursor) {
      const fromMember = t.fromMember;
      if (!fromMember || !["Rahul", "Siddharth", "Brijesh"].includes(fromMember)) continue;
      const toPrimaryHolder = t.toPrimaryHolder;
      if (!PRIMARY_ACCOUNT_HOLDERS.includes(toPrimaryHolder)) continue;
      await ContributionEntry.create({
        member: fromMember,
        amount: Number(t.amount) || 0,
        contributedAt: t.transferredAt || t.createdAt || new Date(),
        toPrimaryHolder,
        transferMode: "Migrated_transfer",
        notes: typeof t.notes === "string" ? t.notes.trim().slice(0, 2000) : ""
      });
    }
    await legacyCol.deleteMany({});
  }

  await ContributionEntry.updateMany(
    {
      member: { $nin: PRIMARY_ACCOUNT_HOLDERS },
      $or: [
        { toPrimaryHolder: { $exists: false } },
        { toPrimaryHolder: null },
        { transferMode: { $exists: false } },
        { transferMode: null }
      ]
    },
    [
      {
        $set: {
          toPrimaryHolder: { $ifNull: ["$toPrimaryHolder", "Sunil"] },
          transferMode: { $ifNull: ["$transferMode", "Legacy_unspecified"] }
        }
      }
    ]
  );
  await ContributionEntry.updateMany(
    {
      member: { $in: PRIMARY_ACCOUNT_HOLDERS },
      $or: [{ transferMode: { $exists: false } }, { transferMode: null }]
    },
    [{ $set: { transferMode: { $ifNull: ["$transferMode", "Legacy_unspecified"] } } }]
  );
  await ContributionEntry.updateMany({ member: { $in: PRIMARY_ACCOUNT_HOLDERS } }, [
    { $set: { toPrimaryHolder: null } }
  ]);
}

function parseDate(raw, fieldName) {
  if (raw == null || raw === "") {
    return { ok: false, error: `${fieldName} is required` };
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: `${fieldName} must be a valid date` };
  }
  return { ok: true, value: d };
}

function parseAmount(raw) {
  if (raw == null || raw === "") {
    return { ok: false, error: "amount must be a non-negative number" };
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "amount must be a non-negative number" };
  }
  return { ok: true, value: n };
}

function parseTransferMode(raw, { allowInternal = false } = {}) {
  const mode = typeof raw === "string" ? raw.trim() : "";
  if (!mode) {
    return { ok: false, error: "transferMode is required" };
  }
  if (CONTRIBUTION_TRANSFER_MODES.includes(mode)) {
    return { ok: true, value: mode };
  }
  if (allowInternal && CONTRIBUTION_TRANSFER_MODES_INTERNAL.includes(mode)) {
    return { ok: true, value: mode };
  }
  return {
    ok: false,
    error: `transferMode must be one of: ${CONTRIBUTION_TRANSFER_MODES.join(", ")}`
  };
}

/** Validates a single contribution entry body; used by POST /entries and POST /bulk. */
function parseContributionEntryPayload(body) {
  const missing = requireFields(body, ["member", "amount", "contributedAt", "transferMode"]);
  if (missing.length) {
    return { ok: false, error: `Missing fields: ${missing.join(", ")}` };
  }
  if (!CONTRIBUTION_MEMBERS.includes(body.member)) {
    return { ok: false, error: `member must be one of: ${CONTRIBUTION_MEMBERS.join(", ")}` };
  }
  let toPrimaryHolder = null;
  if (!isPrimaryHolder(body.member)) {
    const h = body.toPrimaryHolder;
    if (h == null || h === "" || (typeof h === "string" && !h.trim())) {
      return {
        ok: false,
        error: `toPrimaryHolder is required (one of: ${PRIMARY_ACCOUNT_HOLDERS.join(", ")}) for this contributor.`
      };
    }
    const trimmed = String(h).trim();
    if (!PRIMARY_ACCOUNT_HOLDERS.includes(trimmed)) {
      return {
        ok: false,
        error: `toPrimaryHolder must be one of: ${PRIMARY_ACCOUNT_HOLDERS.join(", ")}`
      };
    }
    toPrimaryHolder = trimmed;
  }
  const tm = parseTransferMode(body.transferMode, { allowInternal: false });
  if (!tm.ok) return { ok: false, error: tm.error };
  const amt = parseAmount(body.amount);
  if (!amt.ok) return { ok: false, error: amt.error };
  const dt = parseDate(body.contributedAt, "contributedAt");
  if (!dt.ok) return { ok: false, error: dt.error };
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
  return {
    ok: true,
    value: {
      member: body.member,
      amount: amt.value,
      contributedAt: dt.value,
      toPrimaryHolder,
      transferMode: tm.value,
      notes
    }
  };
}

router.use(async (_req, _res, next) => {
  try {
    await ensureContributionsMigrated();
    next();
  } catch (e) {
    next(e);
  }
});

router.get("/meta", requireAuth, requireTenantContext, requirePermission("contributions", "view"), (_req, res) => {
  return res.json({
    members: CONTRIBUTION_MEMBERS.map((name) => ({
      name,
      isPrimaryHolder: isPrimaryHolder(name)
    })),
    primaryAccountHolders: [...PRIMARY_ACCOUNT_HOLDERS],
    transferModes: [...CONTRIBUTION_TRANSFER_MODES]
  });
});

router.get("/summary", requireAuth, requireTenantContext, requirePermission("contributions", "view"), async (req, res) => {
  const companyId = req.companyId;
  const [entryAgg, byMemberAndHolder, entryCount, expensePaidByMember, companyAccountPaidAgg, cashDash] =
    await Promise.all([
      ContributionEntry.aggregate([
        { $match: { companyId } },
        { $group: { _id: "$member", totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } }
      ]),
      ContributionEntry.aggregate([
        { $match: { companyId } },
        {
          $group: {
            _id: { member: "$member", toPrimaryHolder: "$toPrimaryHolder" },
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 }
          }
        }
      ]),
      ContributionEntry.countDocuments({ companyId }),
      expensePaidTotalsByContributionMember({ companyId }),
      Voucher.aggregate([
        {
          $match: {
            companyId,
            paymentStatus: "Paid",
            paymentMadeBy: "Company Account"
          }
        },
        {
          $group: {
            _id: null,
            totalPaidAmount: { $sum: { $ifNull: ["$paidAmount", "$finalAmount"] } },
            voucherCount: { $sum: 1 }
          }
        }
      ]),
      computeCashWithdrawalDashMetrics(companyId)
    ]);

  const contributionByMember = {};
  const routedSunil = {};
  const routedShailendra = {};
  for (const m of CONTRIBUTION_MEMBERS) {
    contributionByMember[m] = { totalAmount: 0, count: 0 };
    routedSunil[m] = 0;
    routedShailendra[m] = 0;
  }
  for (const row of entryAgg) {
    if (row._id && contributionByMember[row._id] !== undefined) {
      contributionByMember[row._id] = { totalAmount: row.totalAmount, count: row.count };
    }
  }
  for (const row of byMemberAndHolder) {
    const mem = row._id?.member;
    const holder = row._id?.toPrimaryHolder;
    if (!mem || contributionByMember[mem] === undefined) continue;
    if (holder === "Sunil") routedSunil[mem] = row.totalAmount || 0;
    if (holder === "Shailendra") routedShailendra[mem] = row.totalAmount || 0;
  }

  const receivedByPrimary = {
    Sunil: { totalAmount: 0, count: 0 },
    Shailendra: { totalAmount: 0, count: 0 }
  };
  for (const row of byMemberAndHolder) {
    const holder = row._id?.toPrimaryHolder;
    if (holder && receivedByPrimary[holder]) {
      receivedByPrimary[holder].totalAmount += row.totalAmount || 0;
      receivedByPrimary[holder].count += row.count || 0;
    }
  }

  // Primary holders' own contribution rows have toPrimaryHolder null, so they are not in the loop
  // above. Per-person "routed to bank (from primary)" and dashboard cards should combine:
  // that primary's own bank-module totals + all amounts explicitly routed to them from others.
  for (const ph of PRIMARY_ACCOUNT_HOLDERS) {
    const own = contributionByMember[ph];
    if (own && receivedByPrimary[ph]) {
      receivedByPrimary[ph].totalAmount += own.totalAmount ?? 0;
      receivedByPrimary[ph].count += own.count ?? 0;
    }
  }

  const members = CONTRIBUTION_MEMBERS.map((name) => {
    const contributionTotal = contributionByMember[name]?.totalAmount ?? 0;
    const expenseContributionTotal = expensePaidByMember[name] ?? 0;
    return {
      name,
      isPrimaryHolder: isPrimaryHolder(name),
      contributionTotal,
      contributionCount: contributionByMember[name]?.count ?? 0,
      expenseContributionTotal,
      totalContribution: contributionTotal + expenseContributionTotal,
      routedToSunil: routedSunil[name] ?? 0,
      routedToShailendra: routedShailendra[name] ?? 0,
      receivedOnPaperTotal: isPrimaryHolder(name) ? receivedByPrimary[name]?.totalAmount ?? 0 : null,
      receivedOnPaperCount: isPrimaryHolder(name) ? receivedByPrimary[name]?.count ?? 0 : null
    };
  });

  let totalContributions = 0;
  for (const row of entryAgg) totalContributions += row.totalAmount || 0;

  let totalExpenseContribution = 0;
  for (const name of CONTRIBUTION_MEMBERS) {
    totalExpenseContribution += expensePaidByMember[name] ?? 0;
  }

  const companyPaidRow = companyAccountPaidAgg[0];
  const totalExpensePaidFromCompanyAccount = Number(companyPaidRow?.totalPaidAmount) || 0;
  const companyAccountPaidVoucherCount = Number(companyPaidRow?.voucherCount) || 0;
  const { totalWithdrawal, totalCashSpent, cashInHand } = cashDash;
  const balanceAvailableInBank =
    totalContributions - totalExpensePaidFromCompanyAccount - cashInHand;

  return res.json({
    members,
    receivedByPrimary,
    totalContributions,
    totalExpenseContribution,
    totalContributionCombined: totalContributions + totalExpenseContribution,
    entryCount,
    totalExpensePaidFromCompanyAccount,
    companyAccountPaidVoucherCount,
    totalWithdrawal,
    totalCashSpent,
    cashInHand,
    balanceAvailableInBank
  });
});

/**
 * Month × member bank totals from contribution entries; pie uses per-member bank + direct expense (table Total contribution).
 */
router.get("/dashboard-charts", requireAuth, requireTenantContext, requirePermission("contributions", "view"), async (req, res) => {
  const y = Number(req.query.year);
  const year = Number.isFinite(y) ? Math.min(2100, Math.max(1990, Math.floor(y))) : new Date().getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const companyId = req.companyId;

  const [byMonthMember, totalsByMember, expenseByMember] = await Promise.all([
    ContributionEntry.aggregate([
      { $match: { companyId, contributedAt: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: {
            month: { $month: "$contributedAt" },
            member: "$member"
          },
          total: { $sum: "$amount" }
        }
      }
    ]),
    ContributionEntry.aggregate([
      { $match: { companyId } },
      { $group: { _id: "$member", total: { $sum: "$amount" } } }
    ]),
    expensePaidTotalsByContributionMember({ companyId })
  ]);

  const members = [...CONTRIBUTION_MEMBERS];
  const monthly = Array.from({ length: 12 }, (_, monthIndex) => {
    const amounts = {};
    for (const m of members) amounts[m] = 0;
    return { monthIndex, amounts };
  });
  for (const row of byMonthMember) {
    const mi = (row._id?.month ?? 1) - 1;
    const mem = row._id?.member;
    if (mi >= 0 && mi < 12 && mem && monthly[mi].amounts[mem] !== undefined) {
      monthly[mi].amounts[mem] = Number(row.total) || 0;
    }
  }

  const bankByMember = {};
  for (const m of members) bankByMember[m] = 0;
  for (const row of totalsByMember) {
    if (row._id && bankByMember[row._id] !== undefined) bankByMember[row._id] = Number(row.total) || 0;
  }

  /** Per member: bank module + direct expense (paid vouchers by payment made from), same as table Total contribution. */
  const totalsTillDate = {};
  for (const m of members) {
    totalsTillDate[m] = (bankByMember[m] || 0) + (Number(expenseByMember[m]) || 0);
  }

  return res.json({ year, members, monthly, totalsTillDate });
});

router.get("/entries", requireAuth, requireTenantContext, requirePermission("contributions", "view"), async (req, res) => {
  const q = { companyId: req.companyId };
  if (req.query.member && CONTRIBUTION_MEMBERS.includes(req.query.member)) {
    q.member = req.query.member;
  }
  if (req.query.toPrimaryHolder === "__none__") {
    q.$or = [{ toPrimaryHolder: null }, { toPrimaryHolder: { $exists: false } }];
  } else if (req.query.toPrimaryHolder && PRIMARY_ACCOUNT_HOLDERS.includes(req.query.toPrimaryHolder)) {
    q.toPrimaryHolder = req.query.toPrimaryHolder;
  }
  if (req.query.transferMode && typeof req.query.transferMode === "string") {
    const tm = req.query.transferMode.trim();
    const allowed = [...CONTRIBUTION_TRANSFER_MODES, ...CONTRIBUTION_TRANSFER_MODES_INTERNAL];
    if (allowed.includes(tm)) q.transferMode = tm;
  }
  if (req.query.from) {
    const d = new Date(req.query.from);
    if (!Number.isNaN(d.getTime())) q.contributedAt = { ...(q.contributedAt || {}), $gte: d };
  }
  if (req.query.to) {
    const d = new Date(req.query.to);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      q.contributedAt = { ...(q.contributedAt || {}), $lte: d };
    }
  }
  const entries = await ContributionEntry.find(q).sort({ contributedAt: -1, createdAt: -1 }).limit(500);
  return res.json(entries);
});

router.post("/bulk", requireAuth, requireTenantContext, requireContributionsBulkUpload, async (req, res) => {
  const entries = req.body?.entries;
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: "Request body must include entries array" });
  }
  if (entries.length > 500) {
    return res.status(400).json({ error: "Maximum 500 contribution rows per bulk import" });
  }
  if (entries.length === 0) {
    return res.status(400).json({ error: "No entries to import" });
  }
  const results = [];
  for (let i = 0; i < entries.length; i++) {
    const parsed = parseContributionEntryPayload(entries[i]);
    if (!parsed.ok) {
      results.push({ index: i, ok: false, error: parsed.error });
      continue;
    }
    try {
      const doc = await ContributionEntry.create({ ...parsed.value, companyId: req.companyId });
      results.push({ index: i, ok: true, id: String(doc._id) });
    } catch (e) {
      results.push({ index: i, ok: false, error: e.message || "Create failed" });
    }
  }
  const imported = results.filter((r) => r.ok).length;
  return res.status(201).json({
    results,
    imported,
    failed: results.length - imported
  });
});

router.post("/bulk-delete", requireAuth, requireTenantContext, requireContributionsBulkDelete, async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }
  if (ids.length > 200) {
    return res.status(400).json({ error: "Maximum 200 contribution records per bulk delete" });
  }
  const results = [];
  for (const raw of ids) {
    const idStr = String(raw || "").trim();
    if (!idStr) {
      results.push({ id: raw, ok: false, error: "Empty id" });
      continue;
    }
    if (!mongoose.Types.ObjectId.isValid(idStr)) {
      results.push({ id: idStr, ok: false, error: "Invalid id" });
      continue;
    }
    const doc = await ContributionEntry.findOneAndDelete({ _id: idStr, companyId: req.companyId });
    if (!doc) {
      results.push({ id: idStr, ok: false, error: "Entry not found" });
    } else {
      results.push({ id: idStr, ok: true });
    }
  }
  const deleted = results.filter((x) => x.ok).length;
  return res.json({ results, deleted, failed: results.length - deleted });
});

router.post("/entries", requireAuth, requireTenantContext, requirePermission("contributions", "create"), async (req, res) => {
  const parsed = parseContributionEntryPayload(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }
  const doc = await ContributionEntry.create({ ...parsed.value, companyId: req.companyId });
  return res.status(201).json(doc);
});

router.put("/entries/:entryId", requireAuth, requireTenantContext, requirePermission("contributions", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.entryId)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const doc = await ContributionEntry.findOne({ _id: req.params.entryId, companyId: req.companyId });
  if (!doc) return res.status(404).json({ error: "Entry not found" });
  if (req.body.member !== undefined) {
    if (!CONTRIBUTION_MEMBERS.includes(req.body.member)) {
      return res.status(400).json({ error: `member must be one of: ${CONTRIBUTION_MEMBERS.join(", ")}` });
    }
    doc.member = req.body.member;
  }
  if (req.body.amount !== undefined) {
    const amt = parseAmount(req.body.amount);
    if (!amt.ok) return res.status(400).json({ error: amt.error });
    doc.amount = amt.value;
  }
  if (req.body.contributedAt !== undefined) {
    const dt = parseDate(req.body.contributedAt, "contributedAt");
    if (!dt.ok) return res.status(400).json({ error: dt.error });
    doc.contributedAt = dt.value;
  }
  if (req.body.transferMode !== undefined) {
    const tm = parseTransferMode(req.body.transferMode, { allowInternal: true });
    if (!tm.ok) return res.status(400).json({ error: tm.error });
    doc.transferMode = tm.value;
  }
  if (req.body.notes !== undefined) {
    doc.notes = typeof req.body.notes === "string" ? req.body.notes.trim().slice(0, 2000) : "";
  }
  if (isPrimaryHolder(doc.member)) {
    doc.toPrimaryHolder = null;
  } else if (req.body.toPrimaryHolder !== undefined) {
    const h = req.body.toPrimaryHolder;
    if (h == null || h === "" || (typeof h === "string" && !h.trim())) {
      return res.status(400).json({
        error: `toPrimaryHolder is required (one of: ${PRIMARY_ACCOUNT_HOLDERS.join(", ")}) for this contributor.`
      });
    }
    const trimmed = String(h).trim();
    if (!PRIMARY_ACCOUNT_HOLDERS.includes(trimmed)) {
      return res.status(400).json({
        error: `toPrimaryHolder must be one of: ${PRIMARY_ACCOUNT_HOLDERS.join(", ")}`
      });
    }
    doc.toPrimaryHolder = trimmed;
  }
  if (!isPrimaryHolder(doc.member)) {
    if (!doc.toPrimaryHolder || !PRIMARY_ACCOUNT_HOLDERS.includes(doc.toPrimaryHolder)) {
      return res.status(400).json({
        error: `toPrimaryHolder is required (one of: ${PRIMARY_ACCOUNT_HOLDERS.join(", ")}) for this contributor.`
      });
    }
  }
  await doc.save();
  return res.json(doc);
});

router.delete("/entries/:entryId", requireAuth, requireTenantContext, requirePermission("contributions", "delete"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.entryId)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const doc = await ContributionEntry.findOneAndDelete({ _id: req.params.entryId, companyId: req.companyId });
  if (!doc) return res.status(404).json({ error: "Entry not found" });
  return res.json({ ok: true });
});

/** Cash withdrawals from the contribution bank picture (list + create). */
router.get("/cash-withdrawals", requireAuth, requireTenantContext, requirePermission("contributions", "view"), async (req, res) => {
  const [rows, { totalWithdrawal, totalCashSpent, cashInHand }] = await Promise.all([
    CashWithdrawalEntry.find({ companyId: req.companyId }).sort({ withdrawnAt: -1 }).lean(),
    computeCashWithdrawalDashMetrics(req.companyId)
  ]);
  return res.json({
    entries: rows,
    totalWithdrawal,
    totalCashSpent,
    cashInHand
  });
});

router.post("/cash-withdrawals", requireAuth, requireTenantContext, requirePermission("contributions", "create"), async (req, res) => {
  const body = req.body || {};
  const amt = parseAmount(body.amount);
  if (!amt.ok) return res.status(400).json({ error: amt.error });
  const dt = parseDate(body.withdrawnAt, "withdrawnAt");
  if (!dt.ok) return res.status(400).json({ error: dt.error });
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
  const doc = await CashWithdrawalEntry.create({
    companyId: req.companyId,
    withdrawnAt: dt.value,
    amount: amt.value,
    notes
  });
  return res.status(201).json(doc);
});

export default router;
