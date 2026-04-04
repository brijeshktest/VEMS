import test from "node:test";
import assert from "node:assert/strict";
import {
  verhoeffValidTwelveDigitUid,
  validateOptionalPan,
  validateOptionalAadhaar,
  validateOptionalIndianMobile,
  validateOptionalEmail,
  validateVendorContactPayload
} from "./indianValidators.js";

test("PAN accepts valid Income Tax format", () => {
  const r = validateOptionalPan("ABCPA1234F");
  assert.equal(r.ok, true);
  assert.equal(r.value, "ABCPA1234F");
});

test("PAN rejects wrong length", () => {
  const r = validateOptionalPan("ABCDE123");
  assert.equal(r.ok, false);
});

test("PAN rejects invalid 4th character type", () => {
  const r = validateOptionalPan("ABCDX1234F");
  assert.equal(r.ok, false);
});

test("Aadhaar Verhoeff accepts generated-valid number", () => {
  assert.equal(verhoeffValidTwelveDigitUid("123456789010"), true);
});

test("Aadhaar rejects wrong length", () => {
  const r = validateOptionalAadhaar("12345678901");
  assert.equal(r.ok, false);
});

test("Indian mobile accepts +91 prefix", () => {
  const r = validateOptionalIndianMobile("+91 9876543210");
  assert.equal(r.ok, true);
  assert.equal(r.value, "9876543210");
});

test("Indian mobile rejects invalid start digit", () => {
  const r = validateOptionalIndianMobile("5876543210");
  assert.equal(r.ok, false);
});

test("Email normalizes case", () => {
  const r = validateOptionalEmail(" Test@Example.COM ");
  assert.equal(r.ok, true);
  assert.equal(r.value, "test@example.com");
});

test("validateVendorContactPayload aggregates optional fields", () => {
  const r = validateVendorContactPayload({
    email: "a@b.co",
    pan: "",
    aadhaar: "",
    contactNumber: ""
  });
  assert.equal(r.ok, true);
});
