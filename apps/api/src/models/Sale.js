import mongoose from "mongoose";

export const SALE_PRODUCT_CATEGORIES = ["mushroom", "compost"];

export const SALE_PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Cheque", "Card", "Other"];

const SaleSchema = new mongoose.Schema(
  {
    productCategory: {
      type: String,
      enum: SALE_PRODUCT_CATEGORIES,
      required: true
    },
    productName: { type: String, trim: true, default: "" },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, trim: true, default: "kg" },
    totalAmount: { type: Number, required: true, min: 0 },
    soldAt: { type: Date, required: true },
    /** @deprecated legacy; prefer customerName */
    buyerName: { type: String, trim: true, default: "" },
    buyerContact: { type: String, trim: true, default: "" },
    customerName: { type: String, trim: true, default: "" },
    /** Multi-line billing / delivery address for the customer. */
    customerAddress: { type: String, trim: true, default: "" },
    invoiceNumber: { type: String, trim: true, default: "" },
    paymentMode: { type: String, trim: true, default: "Cash" },
    /** Line value before discount and before GST (exclusive). */
    lineSubTotal: { type: Number, default: 0, min: 0 },
    discountType: { type: String, enum: ["none", "percent", "flat"], default: "none" },
    discountValue: { type: Number, default: 0, min: 0 },
    /** GST % applied on amount after discount. */
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0, min: 0 },
    gstin: { type: String, trim: true, default: "" },
    pan: { type: String, trim: true, default: "" },
    aadhaar: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

SaleSchema.index({ soldAt: -1 });
SaleSchema.index({ productCategory: 1, soldAt: -1 });
SaleSchema.index({ invoiceNumber: 1 });

export default mongoose.model("Sale", SaleSchema);
