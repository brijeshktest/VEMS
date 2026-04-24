import mongoose from "mongoose";

/** Singleton document: software provider (Super Admin) branding — not tied to a plant. */
const PlatformSettingsSchema = new mongoose.Schema(
  {
    logoStoredName: { type: String, default: "" },
    logoMimeType: { type: String, default: "" },
    /** Super Admin: after login, client scopes API as this plant so /dashboard shows tenant data. */
    defaultPlantCompanyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null }
  },
  { timestamps: true }
);

export default mongoose.model("PlatformSettings", PlatformSettingsSchema);
