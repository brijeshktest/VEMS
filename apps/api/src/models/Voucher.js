import mongoose from "mongoose";

const VoucherItemSchema = new mongoose.Schema(
  {
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: "Material", required: true },
    quantity: { type: Number, required: true },
    pricePerUnit: { type: Number, required: true },
    comment: { type: String, trim: true }
  },
  { _id: false }
);

const VoucherSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    items: { type: [VoucherItemSchema], required: true },
    dateOfPurchase: { type: Date, required: true },
    subTotal: { type: Number, required: true },
    taxPercent: { type: Number, required: true },
    taxAmount: { type: Number, required: true },
    discountType: { type: String, enum: ["none", "percent", "flat"], default: "none" },
    discountValue: { type: Number, default: 0 },
    finalAmount: { type: Number, required: true },
    paymentMethod: { type: String, required: true },
    paymentStatus: { type: String, enum: ["Paid", "Pending", "Partially Paid"], required: true },
    paymentDate: { type: Date },
    paidByMode: { type: String, trim: true },
    paymentComments: { type: String, trim: true },
    createdByName: { type: String, trim: true },
    statusUpdatedByName: { type: String, trim: true },
    statusUpdatedAt: { type: Date }
  },
  { timestamps: true }
);

export default mongoose.model("Voucher", VoucherSchema);
