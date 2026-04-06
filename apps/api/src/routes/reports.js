import express from "express";
import Voucher from "../models/Voucher.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

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

router.get("/vendor-expenses", requireAuth, requirePermission("reports", "view"), async (req, res) => {
  const dateMatch = buildDateMatch(req.query.start, req.query.end);
  const results = await Voucher.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: "$vendorId",
        totalSpend: { $sum: "$finalAmount" },
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
    { $sort: { totalSpend: -1 } }
  ]);
  return res.json(results);
});

router.get("/material-summary", requireAuth, requirePermission("reports", "view"), async (req, res) => {
  const dateMatch = buildDateMatch(req.query.start, req.query.end);
  // Allocate each voucher's finalAmount (tax- and discount-adjusted) across lines by
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
                $multiply: [{ $divide: ["$linePreTax", "$subTotal"] }, "$finalAmount"]
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

router.get("/expenses", requireAuth, requirePermission("reports", "view"), async (req, res) => {
  const dateMatch = buildDateMatch(req.query.start, req.query.end);
  const [summary] = await Voucher.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: null,
        totalSpend: { $sum: "$finalAmount" },
        totalTax: { $sum: "$taxAmount" },
        voucherCount: { $sum: 1 }
      }
    }
  ]);
  return res.json(summary || { totalSpend: 0, totalTax: 0, voucherCount: 0 });
});

router.get("/tax-payments", requireAuth, requirePermission("reports", "view"), async (req, res) => {
  const dateMatch = buildDateMatch(req.query.start, req.query.end);
  const taxSummary = await Voucher.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: null,
        totalTax: { $sum: "$taxAmount" },
        totalPayable: { $sum: "$finalAmount" }
      }
    }
  ]);
  const paymentStatus = await Voucher.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: "$paymentStatus",
        total: { $sum: "$finalAmount" },
        count: { $sum: 1 }
      }
    }
  ]);
  const paymentMethod = await Voucher.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: "$paymentMethod",
        total: { $sum: "$finalAmount" },
        count: { $sum: 1 }
      }
    }
  ]);
  const vendorPayments = await Voucher.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: "$vendorId",
        totalPayable: { $sum: "$finalAmount" },
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
    { $sort: { totalPayable: -1 } }
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
        finalAmount: 1,
        taxAmount: 1,
        paymentStatus: 1,
        paymentMethod: 1,
        vendorName: "$vendor.name"
      }
    }
  ]);
  return res.json({
    tax: taxSummary[0] || { totalTax: 0, totalPayable: 0 },
    paymentStatus,
    paymentMethod,
    vendorPayments,
    voucherPayments
  });
});

export default router;
