/**
 * Indian numbering (lakhs/crores) with "Rs " prefix, e.g. Rs 2,50,000.25
 * @param {unknown} value
 * @param {{ minDecimals?: number, maxDecimals?: number }} [options]
 */
export function formatIndianRupee(value, options = {}) {
  const minDecimals = options.minDecimals ?? 0;
  const maxDecimals = options.maxDecimals ?? 2;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return `Rs ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: minDecimals, maximumFractionDigits: maxDecimals }).format(0)}`;
  }
  return `Rs ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: minDecimals, maximumFractionDigits: maxDecimals }).format(n)}`;
}
