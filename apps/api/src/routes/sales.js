import express from "express";
import Sale, { SALE_PRODUCT_CATEGORIES, SALE_PAYMENT_MODES } from "../models/Sale.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { requireFields } from "../utils/validators.js";
import { logChange } from "../utils/changeLog.js";
import {
  validateOptionalGstin,
  validateOptionalPan,
  validateOptionalAadhaar
} from "../utils/indianValidators.js";

const router = express.Router();

function normalizePaymentMode(raw) {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (SALE_PAYMENT_MODES.includes(v)) return v;
  return "";
}

function normalizeDiscountType(raw) {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (v === "percent" || v === "flat") return v;
  return "none";
}

/**
 * Derive line subtotal, discount, tax and grand total (GST exclusive on post-discount amount).
 * Legacy: only totalAmount → used as line base with no discount/tax.
 */
function computeSaleInvoiceAmounts(body, existing = null) {
  const discountType =
    body.discountType !== undefined
      ? normalizeDiscountType(body.discountType)
      : normalizeDiscountType(existing?.discountType);

  let discountValue =
    body.discountValue !== undefined ? Number(body.discountValue) : Number(existing?.discountValue ?? 0);
  if (!Number.isFinite(discountValue) || discountValue < 0) discountValue = 0;

  let taxPercent =
    body.taxPercent !== undefined ? Number(body.taxPercent) : Number(existing?.taxPercent ?? 0);
  if (!Number.isFinite(taxPercent) || taxPercent < 0) taxPercent = 0;
  if (taxPercent > 100) taxPercent = 100;

  const lineNum =
    body.lineSubTotal !== undefined && body.lineSubTotal !== null && body.lineSubTotal !== ""
      ? Number(body.lineSubTotal)
      : NaN;
  const totalNum =
    body.totalAmount !== undefined && body.totalAmount !== null && body.totalAmount !== ""
      ? Number(body.totalAmount)
      : NaN;
  const hasPositiveLine = Number.isFinite(lineNum) && lineNum > 0;

  let base = 0;
  if (hasPositiveLine) {
    base = lineNum;
  } else if (Number.isFinite(totalNum) && totalNum >= 0) {
    base = totalNum;
  } else if (Number.isFinite(lineNum) && lineNum === 0 && !Number.isFinite(totalNum)) {
    base = 0;
  } else if (existing) {
    const line = Number(existing.lineSubTotal);
    const t = Number(existing.totalAmount);
    if (Number.isFinite(line) && line > 0) base = line;
    else if (Number.isFinite(t) && t >= 0) base = t;
  }

  let afterDiscount = base;
  if (discountType === "percent") {
    afterDiscount = base * (1 - Math.min(100, discountValue) / 100);
  } else if (discountType === "flat") {
    afterDiscount = Math.max(0, base - discountValue);
  }

  const taxAmount = afterDiscount * (taxPercent / 100);
  const totalAmount = afterDiscount + taxAmount;

  return {
    lineSubTotal: base,
    discountType,
    discountValue,
    taxPercent,
    taxAmount,
    totalAmount
  };
}

function collectSaleInvoiceFieldErrors(body) {
  const errors = {};
  const gstin = validateOptionalGstin(body.gstin);
  if (!gstin.ok) errors.gstin = gstin.message;
  const pan = validateOptionalPan(body.pan);
  if (!pan.ok) errors.pan = pan.message;
  const uid = validateOptionalAadhaar(body.aadhaar);
  if (!uid.ok) errors.aadhaar = uid.message;
  return errors;
}

router.get("/summary", requireAuth, requirePermission("sales", "view"), async (req, res) => {
  const [agg] = await Sale.aggregate([
    {
      $facet: {
        overall: [{ $group: { _id: null, totalAmount: { $sum: "$totalAmount" }, count: { $sum: 1 } } }],
        byCategory: [
          {
            $group: {
              _id: "$productCategory",
              totalAmount: { $sum: "$totalAmount" },
              count: { $sum: 1 }
            }
          }
        ]
      }
    }
  ]);

  const overall = agg?.overall?.[0] || { totalAmount: 0, count: 0 };
  const byCategory = { mushroom: { totalAmount: 0, count: 0 }, compost: { totalAmount: 0, count: 0 } };
  for (const row of agg?.byCategory || []) {
    if (row._id && byCategory[row._id] !== undefined) {
      byCategory[row._id] = { totalAmount: row.totalAmount, count: row.count };
    }
  }

  return res.json({
    totalAmount: overall.totalAmount,
    count: overall.count,
    byCategory
  });
});

router.get("/", requireAuth, requirePermission("sales", "view"), async (req, res) => {
  const sales = await Sale.find().sort({ soldAt: -1, createdAt: -1 }).limit(500);
  return res.json(sales);
});

router.get("/:id", requireAuth, requirePermission("sales", "view"), async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) {
    return res.status(404).json({ error: "Sale not found" });
  }
  return res.json(sale);
});

router.post("/", requireAuth, requirePermission("sales", "create"), async (req, res) => {
  const missing = requireFields(req.body, [
    "productCategory",
    "quantity",
    "soldAt",
    "invoiceNumber",
    "paymentMode",
    "customerName"
  ]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const hasLine =
    req.body.lineSubTotal !== undefined && req.body.lineSubTotal !== null && req.body.lineSubTotal !== "";
  const hasTotal =
    req.body.totalAmount !== undefined && req.body.totalAmount !== null && req.body.totalAmount !== "";
  if (!hasLine && !hasTotal) {
    return res.status(400).json({ error: "Missing fields: lineSubTotal or totalAmount" });
  }
  const invoiceNumber = typeof req.body.invoiceNumber === "string" ? req.body.invoiceNumber.trim() : "";
  if (!invoiceNumber) {
    return res.status(400).json({ error: "invoiceNumber is required" });
  }
  const customerName = typeof req.body.customerName === "string" ? req.body.customerName.trim() : "";
  if (!customerName) {
    return res.status(400).json({ error: "customerName is required" });
  }
  const paymentMode = normalizePaymentMode(req.body.paymentMode);
  if (!paymentMode) {
    return res.status(400).json({ error: `paymentMode must be one of: ${SALE_PAYMENT_MODES.join(", ")}` });
  }
  const fieldErrors = collectSaleInvoiceFieldErrors(req.body);
  if (Object.keys(fieldErrors).length) {
    return res.status(400).json({ error: "Validation failed", fieldErrors });
  }
  if (!SALE_PRODUCT_CATEGORIES.includes(req.body.productCategory)) {
    return res.status(400).json({ error: "productCategory must be mushroom or compost" });
  }
  const quantity = Number(req.body.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return res.status(400).json({ error: "quantity must be a non-negative number" });
  }
  const soldAt = new Date(req.body.soldAt);
  if (Number.isNaN(soldAt.getTime())) {
    return res.status(400).json({ error: "soldAt must be a valid date" });
  }

  const amounts = computeSaleInvoiceAmounts(req.body, null);
  if (!Number.isFinite(amounts.totalAmount) || amounts.totalAmount < 0) {
    return res.status(400).json({ error: "Invalid invoice amounts" });
  }

  const gstin = validateOptionalGstin(req.body.gstin);
  const pan = validateOptionalPan(req.body.pan);
  const uid = validateOptionalAadhaar(req.body.aadhaar);
  const customerAddress =
    typeof req.body.customerAddress === "string" ? req.body.customerAddress.trim().slice(0, 4000) : "";

  const sale = await Sale.create({
    productCategory: req.body.productCategory,
    productName: req.body.productName || "",
    quantity,
    unit: typeof req.body.unit === "string" && req.body.unit.trim() ? req.body.unit.trim() : "kg",
    lineSubTotal: amounts.lineSubTotal,
    discountType: amounts.discountType,
    discountValue: amounts.discountValue,
    taxPercent: amounts.taxPercent,
    taxAmount: amounts.taxAmount,
    totalAmount: amounts.totalAmount,
    soldAt,
    customerName,
    customerAddress,
    buyerName: customerName,
    buyerContact: req.body.buyerContact || "",
    invoiceNumber,
    paymentMode,
    gstin: gstin.ok ? gstin.value || "" : "",
    pan: pan.ok ? pan.value || "" : "",
    aadhaar: uid.ok ? uid.value || "" : "",
    notes: req.body.notes || ""
  });
  await logChange({
    entityType: "sale",
    entityId: sale._id,
    action: "create",
    user: req.user,
    before: null,
    after: sale.toObject()
  });
  return res.status(201).json(sale);
});

router.put("/:id", requireAuth, requirePermission("sales", "edit"), async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) {
    return res.status(404).json({ error: "Sale not found" });
  }
  const before = sale.toObject();

  if (req.body.productCategory !== undefined) {
    if (!SALE_PRODUCT_CATEGORIES.includes(req.body.productCategory)) {
      return res.status(400).json({ error: "productCategory must be mushroom or compost" });
    }
    sale.productCategory = req.body.productCategory;
  }
  if (req.body.productName !== undefined) sale.productName = req.body.productName;
  if (req.body.quantity !== undefined) {
    const quantity = Number(req.body.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return res.status(400).json({ error: "quantity must be a non-negative number" });
    }
    sale.quantity = quantity;
  }
  if (req.body.unit !== undefined) sale.unit = req.body.unit || "kg";
  if (req.body.lineSubTotal !== undefined) {
    const n = Number(req.body.lineSubTotal);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ error: "lineSubTotal must be a non-negative number" });
    }
    sale.lineSubTotal = n;
  }
  if (req.body.totalAmount !== undefined) {
    const totalAmount = Number(req.body.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return res.status(400).json({ error: "totalAmount must be a non-negative number" });
    }
    sale.totalAmount = totalAmount;
  }
  if (req.body.discountType !== undefined) sale.discountType = normalizeDiscountType(req.body.discountType);
  if (req.body.discountValue !== undefined) {
    const dv = Number(req.body.discountValue);
    sale.discountValue = Number.isFinite(dv) && dv >= 0 ? dv : 0;
  }
  if (req.body.taxPercent !== undefined) {
    let tp = Number(req.body.taxPercent);
    if (!Number.isFinite(tp) || tp < 0) tp = 0;
    if (tp > 100) tp = 100;
    sale.taxPercent = tp;
  }
  if (req.body.customerAddress !== undefined) {
    sale.customerAddress =
      typeof req.body.customerAddress === "string" ? req.body.customerAddress.trim().slice(0, 4000) : "";
  }
  if (req.body.soldAt !== undefined) {
    const soldAt = new Date(req.body.soldAt);
    if (Number.isNaN(soldAt.getTime())) {
      return res.status(400).json({ error: "soldAt must be a valid date" });
    }
    sale.soldAt = soldAt;
  }
  if (req.body.customerName !== undefined) {
    const customerName = typeof req.body.customerName === "string" ? req.body.customerName.trim() : "";
    if (!customerName) {
      return res.status(400).json({ error: "customerName cannot be empty" });
    }
    sale.customerName = customerName;
    sale.buyerName = customerName;
  }
  if (req.body.buyerName !== undefined && req.body.customerName === undefined) {
    sale.buyerName = req.body.buyerName;
    sale.customerName = typeof req.body.buyerName === "string" ? req.body.buyerName.trim() : "";
  }
  if (req.body.buyerContact !== undefined) sale.buyerContact = req.body.buyerContact;
  if (req.body.invoiceNumber !== undefined) {
    const inv = typeof req.body.invoiceNumber === "string" ? req.body.invoiceNumber.trim() : "";
    if (!inv) {
      return res.status(400).json({ error: "invoiceNumber cannot be empty" });
    }
    sale.invoiceNumber = inv;
  }
  if (req.body.paymentMode !== undefined) {
    const paymentMode = normalizePaymentMode(req.body.paymentMode);
    if (!paymentMode) {
      return res.status(400).json({ error: `paymentMode must be one of: ${SALE_PAYMENT_MODES.join(", ")}` });
    }
    sale.paymentMode = paymentMode;
  }
  if (req.body.gstin !== undefined || req.body.pan !== undefined || req.body.aadhaar !== undefined) {
    const fieldErrors = collectSaleInvoiceFieldErrors({
      gstin: req.body.gstin !== undefined ? req.body.gstin : sale.gstin,
      pan: req.body.pan !== undefined ? req.body.pan : sale.pan,
      aadhaar: req.body.aadhaar !== undefined ? req.body.aadhaar : sale.aadhaar
    });
    if (Object.keys(fieldErrors).length) {
      return res.status(400).json({ error: "Validation failed", fieldErrors });
    }
  }
  if (req.body.gstin !== undefined) {
    const g = validateOptionalGstin(req.body.gstin);
    sale.gstin = g.ok ? g.value || "" : sale.gstin;
  }
  if (req.body.pan !== undefined) {
    const p = validateOptionalPan(req.body.pan);
    sale.pan = p.ok ? p.value || "" : sale.pan;
  }
  if (req.body.aadhaar !== undefined) {
    const u = validateOptionalAadhaar(req.body.aadhaar);
    sale.aadhaar = u.ok ? u.value || "" : sale.aadhaar;
  }
  if (req.body.notes !== undefined) sale.notes = req.body.notes;

  const recomputed = computeSaleInvoiceAmounts(
    {
      lineSubTotal: sale.lineSubTotal,
      totalAmount: sale.totalAmount,
      discountType: sale.discountType,
      discountValue: sale.discountValue,
      taxPercent: sale.taxPercent
    },
    null
  );
  sale.lineSubTotal = recomputed.lineSubTotal;
  sale.discountType = recomputed.discountType;
  sale.discountValue = recomputed.discountValue;
  sale.taxPercent = recomputed.taxPercent;
  sale.taxAmount = recomputed.taxAmount;
  sale.totalAmount = recomputed.totalAmount;

  if (!(sale.invoiceNumber || "").trim()) {
    return res.status(400).json({ error: "invoiceNumber is required" });
  }
  if (!(sale.customerName || sale.buyerName || "").trim()) {
    return res.status(400).json({ error: "customerName is required" });
  }
  if (!normalizePaymentMode(sale.paymentMode)) {
    sale.paymentMode = "Cash";
  }

  await sale.save();
  await logChange({
    entityType: "sale",
    entityId: sale._id,
    action: "update",
    user: req.user,
    before,
    after: sale.toObject()
  });
  return res.json(sale);
});

router.delete("/:id", requireAuth, requirePermission("sales", "delete"), async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) {
    return res.status(404).json({ error: "Sale not found" });
  }
  const before = sale.toObject();
  await sale.deleteOne();
  await logChange({
    entityType: "sale",
    entityId: req.params.id,
    action: "delete",
    user: req.user,
    before,
    after: null
  });
  return res.json({ ok: true });
});

export default router;
