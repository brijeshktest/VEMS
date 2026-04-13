/**
 * Indian numbering (lakhs/crores) for plain amounts — no "Rs" prefix.
 * Used for display/parse of editable amount fields.
 */

export function formatIndianGroupedNumber(value, maxFractionDigits = 2) {
  if (value === null || value === undefined) return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits
  }).format(num);
}

/** Parse a user string that may include Indian-style commas. */
export function parseIndianGroupedNumber(str) {
  if (str == null) return NaN;
  const t = String(str).replace(/,/g, "").trim();
  if (t === "" || t === ".") return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
