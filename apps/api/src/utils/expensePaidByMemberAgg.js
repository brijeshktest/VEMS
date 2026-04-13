import Voucher from "../models/Voucher.js";
import { CONTRIBUTION_MEMBERS } from "../models/contributionConstants.js";

function buildDateMatch(start, end) {
  const match = {};
  if (start) {
    match.$gte = new Date(start);
  }
  if (end) {
    match.$lte = new Date(end);
  }
  return Object.keys(match).length ? { dateOfPurchase: match } : {};
}

/**
 * Total paid amount per contribution-tracked individual from expense vouchers
 * (same basis as GET /reports/payment-made-from-aggregate: Paid, paymentMadeFrom).
 */
export async function expensePaidTotalsByContributionMember(query = {}) {
  const dateMatch = buildDateMatch(query.start, query.end);
  const match = {
    ...dateMatch,
    paymentStatus: "Paid",
    paymentMadeBy: { $exists: true, $nin: [null, ""] }
  };
  const agg = await Voucher.aggregate([
    { $match: match },
    {
      $addFields: {
        payer: { $trim: { input: { $toString: "$paymentMadeBy" } } }
      }
    },
    {
      $group: {
        _id: "$payer",
        totalPaidAmount: { $sum: { $ifNull: ["$paidAmount", "$finalAmount"] } }
      }
    }
  ]);
  const byPayer = Object.fromEntries(
    agg.map((row) => [row._id, Number(row.totalPaidAmount) || 0])
  );
  const totals = {};
  for (const m of CONTRIBUTION_MEMBERS) {
    totals[m] = byPayer[m] ?? 0;
  }
  return totals;
}
