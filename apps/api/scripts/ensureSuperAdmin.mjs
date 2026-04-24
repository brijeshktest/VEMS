/**
 * One-shot: ensure platform Super Admin exists (same logic as server boot).
 * Usage from repo root:
 *   node apps/api/scripts/ensureSuperAdmin.mjs
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { connectDb } from "../src/utils/db.js";
import { ensurePlatformSuperAdmin } from "../src/utils/platformSuperAdmin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

await connectDb();
await ensurePlatformSuperAdmin();
// eslint-disable-next-line no-console
console.log("Super Admin sync complete.");
process.exit(0);
