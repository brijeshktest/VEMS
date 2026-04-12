import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDb } from "./utils/db.js";
import authRoutes, { ensureDefaultAdminPassword } from "./routes/auth.js";
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
import salesRoutes from "./routes/sales.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const api = express.Router();
api.get("/health", (req, res) => {
  res.json({ ok: true });
});

api.use("/auth", authRoutes);
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
api.use("/sales", salesRoutes);

app.use("/api", api);

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
});

const port = process.env.PORT || 4000;

connectDb()
  .then(() => {
    return ensureDefaultAdminPassword();
  })
  .then(() => {
    return ensureRoomsSeeded();
  })
  .then(() => {
    const server = app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`API running on http://localhost:${port}`);
    });
    server.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  });
