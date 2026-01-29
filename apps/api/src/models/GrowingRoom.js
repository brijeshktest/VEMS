import mongoose from "mongoose";

const GrowingRoomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    maxBagCapacity: { type: Number, required: true },
    powerBackupSource: { type: String, trim: true },
    currentStageId: { type: mongoose.Schema.Types.ObjectId, ref: "Stage" },
    stageStartedAt: { type: Date },
    activityDay: { type: Number, default: 0 },
    activityStatus: {
      watering: { type: Boolean, default: false },
      ruffling: { type: Boolean, default: false },
      thumping: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

export default mongoose.model("GrowingRoom", GrowingRoomSchema);
