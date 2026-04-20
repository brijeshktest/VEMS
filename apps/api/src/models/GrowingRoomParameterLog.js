import mongoose from "mongoose";

const CustomParamSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    value: { type: String, trim: true, default: "" },
    unit: { type: String, trim: true, default: "" }
  },
  { _id: true }
);

const GrowingRoomParameterLogSchema = new mongoose.Schema(
  {
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: "GrowingRoomCycle", required: true, index: true },
    growingRoomId: { type: mongoose.Schema.Types.ObjectId, ref: "GrowingRoom", required: true, index: true },
    compostLifecycleBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompostLifecycleBatch",
      default: null
    },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "GrowingRoomCycleTask", default: null },
    /** Grow stage this reading applies to (operational stage or `cleaning`). */
    growStageKey: { type: String, trim: true, default: "" },
    /** Out-of-range alerts computed at log time (temperature / humidity / CO₂ vs stage targets). */
    parameterAlerts: {
      type: [
        {
          param: { type: String, trim: true },
          level: { type: String, enum: ["high", "low"], required: true },
          message: { type: String, trim: true, default: "" }
        }
      ],
      default: []
    },
    temperatureC: { type: Number, default: null },
    humidityPercent: { type: Number, default: null },
    co2Ppm: { type: Number, default: null },
    customParameters: { type: [CustomParamSchema], default: [] },
    notes: { type: String, trim: true, default: "" },
    loggedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    loggedByName: { type: String, trim: true, default: "" },
    loggedAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

export default mongoose.model("GrowingRoomParameterLog", GrowingRoomParameterLogSchema);
