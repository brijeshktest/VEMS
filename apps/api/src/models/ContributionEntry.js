import mongoose from "mongoose";
import {
  CONTRIBUTION_MEMBERS,
  PRIMARY_ACCOUNT_HOLDERS,
  CONTRIBUTION_ALL_TRANSFER_MODES
} from "./contributionConstants.js";

const ContributionEntrySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    member: { type: String, required: true, enum: CONTRIBUTION_MEMBERS },
    amount: { type: Number, required: true, min: 0 },
    contributedAt: { type: Date, required: true },
    /**
     * Which primary holder's account (on paper) received this contribution.
     * Omitted / null when the contributor is a primary holder (not applicable).
     */
    toPrimaryHolder: {
      type: String,
      required: false,
      default: null,
      validate: {
        validator(v) {
          if (v == null || v === "") return true;
          return PRIMARY_ACCOUNT_HOLDERS.includes(v);
        }
      }
    },
    /** Channel used (UPI, bank, cash, etc.). */
    transferMode: { type: String, required: true, enum: CONTRIBUTION_ALL_TRANSFER_MODES },
    notes: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

ContributionEntrySchema.index({ member: 1, contributedAt: -1 });
ContributionEntrySchema.index({ contributedAt: -1 });
ContributionEntrySchema.index({ toPrimaryHolder: 1, contributedAt: -1 });
ContributionEntrySchema.index({ transferMode: 1 });

export default mongoose.model("ContributionEntry", ContributionEntrySchema);
