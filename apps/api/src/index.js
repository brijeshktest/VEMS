import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDb } from "./utils/db.js";
import authRoutes, { ensureDefaultAdminPassword } from "./routes/auth.js";
import companyRoutes from "./routes/companies.js";
import vendorRoutes from "./routes/vendors.js";
import materialRoutes from "./routes/materials.js";
import voucherRoutes from "./routes/vouchers.js";
import reportRoutes from "./routes/reports.js";
import roleRoutes from "./routes/roles.js";
import userRoutes from "./routes/users.js";
import roomRoutes, { ensureRoomsSeeded } from "./routes/rooms.js";
import stageRoutes from "./routes/stages.js";
import settingsRoutes from "./routes/settings.js";
import changeLogRoutes from "./routes/changeLogs.js";
import tunnelBunkerRoutes from "./routes/tunnelBunker.js";
import plantOpsRoutes from "./routes/plantOps.js";
import growingRoomRoutes from "./routes/growingRoom.js";
import salesRoutes from "./routes/sales.js";
import contributionsRoutes from "./routes/contributions.js";
import { ensureTenantMigration } from "./utils/tenantMigration.js";
import { ensurePlatformSuperAdmin } from "./utils/platformSuperAdmin.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

/** Set true only after MongoDB connects and startup hooks finish (see connectDb chain below). */
let dbReady = false;

const api = express.Router();
api.get("/health", (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ ok: false, error: "database_not_ready" });
  }
  return res.json({ ok: true });
});

api.use((req, res, next) => {
  if (!dbReady) {
    return res.status(503).json({
      error: "Database is starting; try again in a few seconds."
    });
  }
  return next();
});

api.use("/auth", authRoutes);
api.use("/companies", companyRoutes);
api.use("/vendors", vendorRoutes);
api.use("/materials", materialRoutes);
api.use("/vouchers", voucherRoutes);
api.use("/reports", reportRoutes);
api.use("/roles", roleRoutes);
api.use("/users", userRoutes);
api.use("/rooms", roomRoutes);
api.use("/stages", stageRoutes);
api.use("/settings", settingsRoutes);
api.use("/change-logs", changeLogRoutes);
api.use("/tunnel-bunker", tunnelBunkerRoutes);
api.use("/plant-ops", plantOpsRoutes);
api.use("/growing-room", growingRoomRoutes);
api.use("/sales", salesRoutes);
api.use("/contributions", contributionsRoutes);

app.use("/api", api);

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
});

const port = process.env.PORT || 4000;

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port} (connecting to database...)`);
});
server.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

connectDb()
  .then(() => ensureTenantMigration())
  .then(() => ensurePlatformSuperAdmin())
  .then(() => ensureDefaultAdminPassword())
  .then(() => ensureRoomsSeeded())
  .then(() => {
    dbReady = true;
    // eslint-disable-next-line no-console
    console.log(`API ready (database connected) on http://localhost:${port}`);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  });
