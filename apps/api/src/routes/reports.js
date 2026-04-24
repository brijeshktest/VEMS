import express from "express";
import Voucher from "../models/Voucher.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { requireTenantContext } from "../middleware/companyScope.js";
import { matchExcludePaymentMadeFromVelocity, PAYMENT_MADE_FROM_CHOICES } from "../utils/paymentMadeFrom.js";

const router = express.Router();

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

function expenseReportMatch(start, end) {
  const dateMatch = buildDateMatch(start, end);
  return { ...dateMatch, ...matchExcludePaymentMadeFromVelocity() };
}

function tenantVoucherMatch(req, extra = {}) {
  return { companyId: req.companyId, ...extra };
}

router.get("/vendor-expenses", requireAuth, requireTenantContext, requirePermission("reports", "view"), async (req, res) => {
  const dateMatch = tenantVoucherMatch(req, buildDateMatch(req.query.start, req.query.end));
  const results = await Voucher.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: "$vendorId",
        totalVoucherAmount: { $sum: "$finalAmount" },
        totalPaidAmount: { $sum: { $ifNull: ["$paidAmount", "$finalAmount"] } },
        voucherCount: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: "vendors",
        localField: "_id",
        foreignField: "_id",
        as: "vendor"
      }
    },
    { $unwind: "$vendor" },
    { $sort: { totalPaidAmount: -1 } }
  ]);
  return res.json(results);
});

router.get("/material-summary", requireAuth, requireTenantContext, requirePermission("reports", "view"), async (req, res) => {
  const dateMatch = tenantVoucherMatch(req, buildDateMatch(req.query.start, req.query.end));
  // Allocate each voucher's paidAmount across lines by
  // share of subTotal so material totals align with vendor / expense rollups.
  const results = await Voucher.aggregate([
    { $match: dateMatch },
    { $unwind: "$items" },
    {
      $addFields: {
        linePreTax: { $multiply: ["$items.quantity", "$items.pricePerUnit"] }
      }
    },
    {
      $group: {
        _id: "$items.materialId",
        totalQuantity: { $sum: "$items.quantity" },
        totalSpend: {
          $sum: {
            $cond: [
              { $gt: ["$subTotal", 0] },
              {
                $multiply: [{ $divide: ["$linePreTax", "$subTotal"] }, { $ifNull: ["$paidAmount", "$finalAmount"] }]
              },
              0
            ]
          }
        }
      }
    },
    {
      $lookup: {
        from: "materials",
        localField: "_id",
        foreignField: "_id",
        as: "material"
      }
    },
    { $unwind: "$material" },
    { $sort: { totalSpend: -1 } }
  ]);
  return res.json(results);
});

router.get("/expenses", requireAuth, requireTenantContext, requirePermission("reports", "view"), async (req, res) => {
  const dateMatch = tenantVoucherMatch(req, expenseReportMatch(req.query.start, req.query.end));
  const [summary] = await Voucher.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: null,
        totalVoucherAmount: { $sum: "$finalAmount" },
        totalPaidAmount: { $sum: { $ifNull: ["$paidAmount", "$finalAmount"] } },
        totalTax: { $sum: "$taxAmount" },
        voucherCount: { $sum: 1 }
      }
    }
  ]);
  return res.json(summary || { totalVoucherAmount: 0, totalPaidAmount: 0, totalTax: 0, voucherCount: 0 });
});

/** Paid vouchers aggregated by fixed "Payment made from" persons (+ other). */
router.get("/payment-made-from-aggregate", requireAuth, requireTenantContext, requirePermission("reports", "view"), async (req, res) => {
  const dateMatch = tenantVoucherMatch(req, buildDateMatch(req.query.start, req.query.end));
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
        totalPaidAmount: { $sum: { $ifNull: ["$paidAmount", "$finalAmount"] } },
        voucherCount: { $sum: 1 }
      }
    }
  ]);
  const byPayer = Object.fromEntries(
    agg.map((row) => [row._id, { totalPaidAmount: row.totalPaidAmount, voucherCount: row.voucherCount }])
  );
  let otherPaid = 0;
  let otherCount = 0;
  for (const row of agg) {
    if (!PAYMENT_MADE_FROM_CHOICES.includes(row._id)) {
      otherPaid += row.totalPaidAmount;
      otherCount += row.voucherCount;
    }
  }
  const rows = PAYMENT_MADE_FROM_CHOICES.map((name) => ({
    paymentMadeBy: name,
    totalPaidAmount: byPayer[name]?.totalPaidAmount ?? 0,
    voucherCount: byPayer[name]?.voucherCount ?? 0
  }));
  if (otherCount > 0) {
    rows.push({
      paymentMadeBy: "Other (not in fixed list)",
      totalPaidAmount: otherPaid,
      voucherCount: otherCount
    });
  }
  return res.json(rows);
});

router.get("/tax-payments", requireAuth, requireTenantContext, requirePermission("reports", "view"), async (req, res) => {
  const dateMatch = tenantVoucherMatch(req, expenseReportMatch(req.query.start, req.query.end));
  const taxSummary = await Voucher.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: null,
        totalTax: { $sum: "$taxAmount" },
        totalVoucherAmount: { $sum: "$finalAmount" },
        totalPaidAmount: { $sum: { $ifNull: ["$paidAmount", "$finalAmount"] } }
      }
    }
  ]);
  const paymentStatus = await Voucher.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: "$paymentStatus",
        totalVoucherAmount: { $sum: "$finalAmount" },
        totalPaidAmount: { $sum: { $ifNull: ["$paidAmount", "$finalAmount"] } },
        count: { $sum: 1 }
      }
    }
  ]);
  const paymentMethod = await Voucher.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: "$paymentMethod",
        totalVoucherAmount: { $sum: "$finalAmount" },
        totalPaidAmount: { $sum: { $ifNull: ["$paidAmount", "$finalAmount"] } },
        count: { $sum: 1 }
      }
    }
  ]);
  const vendorPayments = await Voucher.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: "$vendorId",
        totalVoucherAmount: { $sum: "$finalAmount" },
        totalPaidAmount: { $sum: { $ifNull: ["$paidAmount", "$finalAmount"] } },
        totalTax: { $sum: "$taxAmount" },
        voucherCount: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: "vendors",
        localField: "_id",
        foreignField: "_id",
        as: "vendor"
      }
    },
    { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
    { $sort: { totalPaidAmount: -1 } }
  ]);
  const voucherPayments = await Voucher.aggregate([
    { $match: dateMatch },
    { $sort: { dateOfPurchase: -1 } },
    { $limit: 30 },
    {
      $lookup: {
        from: "vendors",
        localField: "vendorId",
        foreignField: "_id",
        as: "vendor"
      }
    },
    { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        dateOfPurchase: 1,
        voucherNumber: 1,
        finalAmount: 1,
        paidAmount: { $ifNull: ["$paidAmount", "$finalAmount"] },
        taxAmount: 1,
        paymentStatus: 1,
        paymentMethod: 1,
        vendorName: "$vendor.name"
      }
    }
  ]);
  return res.json({
    tax: taxSummary[0] || { totalTax: 0, totalVoucherAmount: 0, totalPaidAmount: 0 },
    paymentStatus,
    paymentMethod,
    vendorPayments,
    voucherPayments
  });
});

export default router;
