import mongoose from "mongoose";

const GrowingRoomCycleSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    growingRoomId: { type: mongoose.Schema.Types.ObjectId, ref: "GrowingRoom", required: true, index: true },
    compostLifecycleBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompostLifecycleBatch",
      default: null,
      index: true
    },
    cycleStartedAt: { type: Date, required: true },
    /** active → cleaning → completed */
    status: {
      type: String,
      enum: ["active", "cleaning", "completed", "cancelled"],
      default: "active",
      index: true
    },
    thirdFlushEnabled: { type: Boolean, default: false },
    /**
     * Operational grow stage (user advances after completing all tasks in the stage).
     * Calendar `currentCycleDay` / stageForCycleDay remain informational.
     */
    recordedGrowStageKey: { type: String, trim: true, default: null },
    /**
     * Manual activity checklist per stage (watering, ruffling, etc.).
     * Stage advance requires all listed activities for the current stage to be completed when the stage defines any.
     */
    stageActivityCompletions: {
      type: [
        {
          stageKey: { type: String, trim: true, required: true },
          activityKey: { type: String, trim: true, required: true },
          completedAt: { type: Date, default: Date.now },
          completedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
        }
      ],
      default: []
    },
    notes: { type: String, trim: true, default: "" },
    cleaningStartedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

GrowingRoomCycleSchema.index({ growingRoomId: 1, status: 1 });
GrowingRoomCycleSchema.index({ createdAt: -1 });

export default mongoose.model("GrowingRoomCycle", GrowingRoomCycleSchema);
