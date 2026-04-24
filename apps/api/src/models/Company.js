import mongoose from "mongoose";

const CompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, lowercase: true, default: "" },
    isActive: { type: Boolean, default: true },
    notes: { type: String, trim: true, default: "" },
    /** Flat permission keys this plant is licensed for (see utils/plantModules.js). */
    enabledModules: { type: [String], default: undefined }
  },
  { timestamps: true }
);

CompanySchema.index({ slug: 1 }, { unique: true, sparse: true });

export default mongoose.model("Company", CompanySchema);
