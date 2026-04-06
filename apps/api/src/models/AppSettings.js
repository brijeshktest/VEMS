import mongoose from "mongoose";

/** Singleton-style app settings (single row). */
const AppSettingsSchema = new mongoose.Schema(
  {
    logoStoredName: { type: String, default: "" },
    logoMimeType: { type: String, default: "" }
  },
  { timestamps: true }
);

export default mongoose.model("AppSettings", AppSettingsSchema);
