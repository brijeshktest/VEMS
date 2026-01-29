import mongoose from "mongoose";

const ActivitySchema = new mongoose.Schema(
  {
    watering: { type: Boolean, default: false },
    ruffling: { type: Boolean, default: false },
    thumping: { type: Boolean, default: false }
  },
  { _id: false }
);

const StageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    sequenceOrder: { type: Number, required: true },
    intervalDays: { type: Number, required: true },
    humidity: { type: Number, default: 0 },
    temperature: { type: Number, default: 0 },
    co2Level: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    activities: { type: ActivitySchema, default: {} }
  },
  { timestamps: true }
);

export default mongoose.model("Stage", StageSchema);
