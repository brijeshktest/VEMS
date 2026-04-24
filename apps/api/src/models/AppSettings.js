import mongoose from "mongoose";

/** Singleton-style app settings (single row). */
const AppSettingsSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, unique: true, index: true },
    logoStoredName: { type: String, default: "" },
    logoMimeType: { type: String, default: "" },
    /** Sales invoice PDF letterhead (admin-maintained). */
    companyLegalName: { type: String, default: "" },
    companyAddressLines: { type: [String], default: [] },
    companyPhone: { type: String, default: "" },
    companyGstin: { type: String, default: "" },
    companyWebsite: { type: String, default: "" },
    companyEmail: { type: String, default: "" },
    bunkerCount: { type: Number, default: 3 },
    tunnelCount: { type: Number, default: 2 },
    bunkerIntervalDays: { type: Number, default: 2 },
    tunnelIntervalDays: { type: Number, default: 10 },
    autoAdvanceEnabled: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model("AppSettings", AppSettingsSchema);
