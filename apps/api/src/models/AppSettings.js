import mongoose from "mongoose";

/** Singleton-style app settings (single row). */
const AppSettingsSchema = new mongoose.Schema(
  {
    logoStoredName: { type: String, default: "" },
    logoMimeType: { type: String, default: "" },
    bunkerCount: { type: Number, default: 3 },
    tunnelCount: { type: Number, default: 2 },
    bunkerIntervalDays: { type: Number, default: 2 },
    tunnelIntervalDays: { type: Number, default: 10 },
    autoAdvanceEnabled: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model("AppSettings", AppSettingsSchema);
