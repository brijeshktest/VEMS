import mongoose from "mongoose";

/**
 * Singleton document (findOne) — admin overrides for default intervention templates.
 * additionalTemplates follow TaskTemplate shape from growingRoomStages.js (dayStart/dayEnd, recurrence, etc.)
 */
const GrowingRoomRulesOverrideSchema = new mongoose.Schema(
  {
    disabledKeys: {
      type: [String],
      default: []
    },
    /** Full template objects merged into DEFAULT_TASK_TEMPLATES at generation time */
    additionalTemplates: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    updatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

export default mongoose.model("GrowingRoomRulesOverride", GrowingRoomRulesOverrideSchema);
