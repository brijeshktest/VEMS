import mongoose from "mongoose";

export const PLANT_RESOURCE_TYPES = ["Lagoon", "Tunnel", "Bunker", "Room"];

const GrowingRoomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    /** Legacy field; kept in sync with capacityTons for existing logic. */
    maxBagCapacity: { type: Number, required: true },
    /** Capacity in metric tons (same numeric value synced to maxBagCapacity). */
    capacityTons: { type: Number, default: 0 },
    resourceType: {
      type: String,
      enum: PLANT_RESOURCE_TYPES,
      default: "Room"
    },
    locationInPlant: { type: String, trim: true, default: "" },
    coordinateX: { type: Number },
    coordinateY: { type: Number },
    powerBackupSource: { type: String, trim: true },
    currentStageId: { type: mongoose.Schema.Types.ObjectId, ref: "Stage" },
    stageStartedAt: { type: Date },
    activityDay: { type: Number, default: 0 },
    activityStatus: {
      watering: { type: Boolean, default: false },
      ruffling: { type: Boolean, default: false },
      thumping: { type: Boolean, default: false },
      ventilation: { type: Boolean, default: false }
    },
    /** Growing-room crop cycle occupancy (denormalized for dashboards). */
    growingOperationalState: {
      type: String,
      enum: ["available", "active_growing", "cleaning"],
      default: "available",
      index: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("GrowingRoom", GrowingRoomSchema);
