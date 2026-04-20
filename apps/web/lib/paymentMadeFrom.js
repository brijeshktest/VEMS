/** Fixed "Payment made from" values (must match API `paymentMadeFrom.js`). */
export const PAYMENT_MADE_FROM_CHOICES = [
  "Rahul",
  "Brijesh",
  "Sunil",
  "Siddharth",
  "Shailendra",
  "Company Account",
  "Velocity"
];

/** True when voucher / row has Payment made from Velocity (case-insensitive). */
export function isPaymentMadeFromVelocity(voucherOrDoc) {
  const s =
    voucherOrDoc != null && typeof voucherOrDoc === "object"
      ? String(voucherOrDoc.paymentMadeBy ?? "")
      : String(voucherOrDoc ?? "");
  return s.trim().toLowerCase() === "velocity";
}
