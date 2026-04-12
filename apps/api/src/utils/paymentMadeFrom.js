/** Fixed "Payment made from" values for vouchers (paid from). */
export const PAYMENT_MADE_FROM_CHOICES = [
  "Rahul",
  "Brijesh",
  "Sunil",
  "Siddharth",
  "Shailendra",
  "Company Account",
  "Velocity"
];

export function isAllowedPaymentMadeBy(value) {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return false;
  return PAYMENT_MADE_FROM_CHOICES.includes(v);
}
