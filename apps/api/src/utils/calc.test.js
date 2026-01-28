import assert from "node:assert/strict";
import test from "node:test";
import { calculateTotals } from "./calc.js";

test("calculateTotals handles tax and percent discount", () => {
  const items = [
    { quantity: 2, pricePerUnit: 50 },
    { quantity: 1, pricePerUnit: 100 }
  ];
  const result = calculateTotals(items, 10, "percent", 5);
  assert.equal(result.subTotal, 200);
  assert.equal(result.taxAmount, 20);
  assert.equal(Number(result.finalAmount.toFixed(2)), 209.0);
});

test("calculateTotals never returns negative totals", () => {
  const items = [{ quantity: 1, pricePerUnit: 10 }];
  const result = calculateTotals(items, 0, "flat", 999);
  assert.equal(result.finalAmount, 0);
});
