# Vendor & Expense Management

Full-stack system for vendor, material, and expense tracking with a dashboard and reports.

## Tech Stack
- Frontend: Next.js
- Backend: Node.js (Express)
- Database: MongoDB (local)

## Getting Started

1. Start local MongoDB
2. Install dependencies:
   - `npm install --workspace apps/api`
   - `npm install --workspace apps/web`
3. Copy env files:
   - `apps/api/.env.example` -> `apps/api/.env`
   - `apps/web/.env.example` -> `apps/web/.env.local`
4. Run API:
   - `npm run dev:api`
5. Run Web:
   - `npm run dev:web`

## Seed First Admin
Use the Login page to create the first admin on a fresh database:
`POST /auth/seed` is called from the UI in the Login screen.

## Features
- Vendor and material management with mapping validation
- Expense vouchers with automatic totals, tax, and discounts
- Role-based access (admin/accountant/viewer)
- Reports: vendor-wise, material-wise, date range, tax/payment summary
- Dashboard with top vendors/materials and spend summaries

## Tests
Run API utility tests:
- `npm --workspace apps/api run test`
