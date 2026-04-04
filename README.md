# Shroom Agritech LLP — Vendor & Expense Management

Full-stack system for **Shroom Agritech LLP** (button mushroom production, compost sales, and related operations): vendor and material management, expense vouchers, role-based access, reports, and a dashboard with spend and **payment breakdowns** (vendor-wise and voucher-wise).

## Tech stack

- **Frontend:** Next.js (App Router)
- **Backend:** Node.js (Express)
- **Database:** MongoDB

## Getting started (local development)

1. **Start MongoDB** (local or remote URI in `.env`).
2. **Install dependencies** (root installs all workspaces):

   ```bash
   npm install
   ```

3. **Environment files**

   | Copy from | To |
   |-----------|-----|
   | `apps/api/.env.example` | `apps/api/.env` |
   | `apps/web/.env.example` | `apps/web/.env.local` |

   Typical values:

   - `apps/api/.env`: `MONGO_URL`, `JWT_SECRET`, `PORT` (e.g. `4000`).
   - `apps/web/.env.local`: `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:4000`).

4. **Run the API** (from repo root):

   ```bash
   npm run dev:api
   ```

5. **Run the web app:**

   ```bash
   npm run dev:web
   ```

6. Open **http://localhost:3000**. The sign-in screen includes Shroom Agritech–specific copy and imagery.

## First admin user

- On a **fresh database**, use the **First-time setup** block on the login page (calls `POST /auth/seed`).
- Default suggested admin email in the app and in `apps/api/scripts/seedAdmin.mjs` is **`admin@shroomagritechllp.com`** (override with `ADMIN_EMAIL` / `ADMIN_PASSWORD` when running the seed script or in `apps/api/.env`).
- You can also create the admin via:

  ```bash
  node apps/api/scripts/seedAdmin.mjs
  ```

  (Loads `MONGO_URL` and optional `ADMIN_*` from the environment; use a sourced `apps/api/.env` or export variables first.)

## Production-style deploy

Ensure `apps/api/.env` and `apps/web/.env.local` exist and **`NEXT_PUBLIC_API_URL` points at the API URL users will call** before building (Next.js bakes public env vars at build time).

### Linux / macOS

```bash
chmod +x deploy.sh
./deploy.sh
```

The script installs dependencies, builds the web app, runs master-data and admin seeds, then starts the API and Next.js in the background with `nohup`. Logs: `api.out.log` and `web.out.log` in the project root. Override ports with `PORT` (API) and `WEB_PORT` (web), e.g. `WEB_PORT=8080 ./deploy.sh`.

If `apps/api/.env` exists, it is **sourced** before seeding so `MONGO_URL` and `ADMIN_*` apply to the seed scripts.

### Windows

Use **`deploy.bat`** from the repository root (separate console windows for API and web; same build and seed steps).

## Features

- Vendor and material management with mapping validation
- Expense vouchers with totals, tax, discounts, attachments, payment status
- Role-based access (admin / accountant / viewer) and admin configuration
- Reports: vendor-wise, material-wise, date range, tax and payment summary
- Dashboard: top vendors/materials, spend summaries, **payment summary with vendor-wise aggregates and a voucher-wise table** (latest vouchers)

## Tests

API utility tests:

```bash
npm --workspace apps/api run test
```
