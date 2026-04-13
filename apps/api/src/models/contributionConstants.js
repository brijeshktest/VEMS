/** Fixed individuals for contribution tracking (display order). */
export const CONTRIBUTION_MEMBERS = ["Rahul", "Siddharth", "Sunil", "Brijesh", "Shailendra"];

/** Primary account holders (on paper); every contribution is routed to one of these accounts. */
export const PRIMARY_ACCOUNT_HOLDERS = ["Sunil", "Shailendra"];

/**
 * How funds were sent (same idea as payment mode elsewhere).
 * Internal-only values may exist on migrated rows.
 */
export const CONTRIBUTION_TRANSFER_MODES = [
  "Cash",
  "UPI",
  "NEFT",
  "RTGS",
  "IMPS",
  "Bank transfer",
  "Cheque",
  "Card",
  "Other"
];

export const CONTRIBUTION_TRANSFER_MODES_INTERNAL = ["Migrated_transfer", "Legacy_unspecified"];

export const CONTRIBUTION_ALL_TRANSFER_MODES = [
  ...CONTRIBUTION_TRANSFER_MODES,
  ...CONTRIBUTION_TRANSFER_MODES_INTERNAL
];

export function isPrimaryHolder(name) {
  return PRIMARY_ACCOUNT_HOLDERS.includes(name);
}
