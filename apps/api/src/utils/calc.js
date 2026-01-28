export function calculateTotals(items, taxPercent, discountType, discountValue) {
  const subTotal = items.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0);
  const taxAmount = subTotal * (taxPercent / 100);
  let discounted = subTotal + taxAmount;
  if (discountType === "percent") {
    discounted -= discounted * (discountValue / 100);
  } else if (discountType === "flat") {
    discounted -= discountValue;
  }
  const finalAmount = Math.max(0, discounted);
  return {
    subTotal,
    taxAmount,
    finalAmount
  };
}
