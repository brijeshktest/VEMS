import mongoose from "mongoose";
import GrowingRoom from "../src/models/GrowingRoom.js";
import Stage from "../src/models/Stage.js";

const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/vendor_expense";

const SEED_ROOMS = [
  { name: "Orion", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Nova", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Cosmos", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Nebula", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Pulsar", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Atlas", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Apollo", maxBagCapacity: 0, powerBackupSource: "" },
  { name: "Zenith", maxBagCapacity: 0, powerBackupSource: "" }
];

await mongoose.connect(mongoUrl);

await GrowingRoom.init();
await Stage.init();

const roomCount = await GrowingRoom.countDocuments();
if (roomCount === 0) {
  await GrowingRoom.insertMany(SEED_ROOMS);
  console.log("Seeded growing rooms.");
} else {
  console.log("Growing rooms already exist. Skipping.");
}

const stageCount = await Stage.countDocuments();
if (stageCount === 0) {
  console.log("No stages found. Add stages in Admin → Stages.");
}

await mongoose.disconnect();
