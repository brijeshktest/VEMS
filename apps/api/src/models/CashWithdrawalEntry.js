import mongoose from "mongoose";

const CashWithdrawalEntrySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    withdrawnAt: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    /** Purpose / reference text for the withdrawal. */
    notes: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

CashWithdrawalEntrySchema.index({ withdrawnAt: -1 });

export default mongoose.model("CashWithdrawalEntry", CashWithdrawalEntrySchema);
