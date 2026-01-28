import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDb } from "./utils/db.js";
import authRoutes from "./routes/auth.js";
import vendorRoutes from "./routes/vendors.js";
import materialRoutes from "./routes/materials.js";
import voucherRoutes from "./routes/vouchers.js";
import reportRoutes from "./routes/reports.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRoutes);
app.use("/vendors", vendorRoutes);
app.use("/materials", materialRoutes);
app.use("/vouchers", voucherRoutes);
app.use("/reports", reportRoutes);

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
});

const port = process.env.PORT || 4000;

connectDb()
  .then(() => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`API running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  });
