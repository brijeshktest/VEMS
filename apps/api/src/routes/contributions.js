import express from "express";
import mongoose from "mongoose";
import ContributionEntry from "../models/ContributionEntry.js";
import {
  CONTRIBUTION_MEMBERS,
  PRIMARY_ACCOUNT_HOLDERS,
  CONTRIBUTION_TRANSFER_MODES,
  CONTRIBUTION_TRANSFER_MODES_INTERNAL,
  isPrimaryHolder
} from "../models/contributionConstants.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { requireFields } from "../utils/validators.js";
import { expensePaidTotalsByContributionMember } from "../utils/expensePaidByMemberAgg.js";

const router = express.Router();

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
  const n = Number(raw);
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

router.use(async (_req, _res, next) => {
  try {
    await ensureContributionsMigrated();
    next();
  } catch (e) {
    next(e);
  }
});

router.get("/meta", requireAuth, requirePermission("contributions", "view"), (_req, res) => {
  return res.json({
    members: CONTRIBUTION_MEMBERS.map((name) => ({
      name,
      isPrimaryHolder: isPrimaryHolder(name)
    })),
    primaryAccountHolders: [...PRIMARY_ACCOUNT_HOLDERS],
    transferModes: [...CONTRIBUTION_TRANSFER_MODES]
  });
});

router.get("/summary", requireAuth, requirePermission("contributions", "view"), async (_req, res) => {
  const [entryAgg, byMemberAndHolder, entryCount, expensePaidByMember] = await Promise.all([
    ContributionEntry.aggregate([
      { $group: { _id: "$member", totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } }
    ]),
    ContributionEntry.aggregate([
      {
        $group: {
          _id: { member: "$member", toPrimaryHolder: "$toPrimaryHolder" },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]),
    ContributionEntry.countDocuments(),
    expensePaidTotalsByContributionMember({})
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

  return res.json({
    members,
    receivedByPrimary,
    totalContributions,
    totalExpenseContribution,
    totalContributionCombined: totalContributions + totalExpenseContribution,
    entryCount
  });
});

router.get("/entries", requireAuth, requirePermission("contributions", "view"), async (req, res) => {
  const q = {};
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

router.post("/entries", requireAuth, requirePermission("contributions", "create"), async (req, res) => {
  const missing = requireFields(req.body, ["member", "amount", "contributedAt", "transferMode"]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  if (!CONTRIBUTION_MEMBERS.includes(req.body.member)) {
    return res.status(400).json({ error: `member must be one of: ${CONTRIBUTION_MEMBERS.join(", ")}` });
  }
  let toPrimaryHolder = null;
  if (!isPrimaryHolder(req.body.member)) {
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
    toPrimaryHolder = trimmed;
  }
  const tm = parseTransferMode(req.body.transferMode, { allowInternal: false });
  if (!tm.ok) return res.status(400).json({ error: tm.error });
  const amt = parseAmount(req.body.amount);
  if (!amt.ok) return res.status(400).json({ error: amt.error });
  const dt = parseDate(req.body.contributedAt, "contributedAt");
  if (!dt.ok) return res.status(400).json({ error: dt.error });
  const notes = typeof req.body.notes === "string" ? req.body.notes.trim().slice(0, 2000) : "";
  const doc = await ContributionEntry.create({
    member: req.body.member,
    amount: amt.value,
    contributedAt: dt.value,
    toPrimaryHolder,
    transferMode: tm.value,
    notes
  });
  return res.status(201).json(doc);
});

router.put("/entries/:entryId", requireAuth, requirePermission("contributions", "edit"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.entryId)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const doc = await ContributionEntry.findById(req.params.entryId);
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

router.delete("/entries/:entryId", requireAuth, requirePermission("contributions", "delete"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.entryId)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const doc = await ContributionEntry.findByIdAndDelete(req.params.entryId);
  if (!doc) return res.status(404).json({ error: "Entry not found" });
  return res.json({ ok: true });
});

export default router;
