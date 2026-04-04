/**
 * India-specific validation (PAN, Aadhaar / UID, mobile, email) for vendor records.
 * Aadhaar: 12 digits with Verhoeff checksum (UIDAI).
 * PAN: Income Tax format AAAAA9999A with valid 4th-character type.
 * Mobile: 10-digit Indian mobile (starts with 6–9), optional +91 / 91 / leading 0.
 */

const d = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

const p = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

function invArray(value) {
  const arr = String(value)
    .split("")
    .map((ch) => parseInt(ch, 10));
  return arr.reverse();
}

export function verhoeffValidTwelveDigitUid(digits12) {
  if (!/^\d{12}$/.test(digits12)) return false;
  let c = 0;
  const invertedArray = invArray(digits12);
  for (let i = 0; i < invertedArray.length; i++) {
    c = d[c][p[i % 8][invertedArray[i]]];
  }
  return c === 0;
}

/** Fourth character: holder type per Income Tax (P, C, H, F, A, T, B, L, J, G). */
const PAN_TYPE_CHAR = "PCHFABLTJG";
const PAN_REGEX = new RegExp(`^[A-Z]{3}[${PAN_TYPE_CHAR}][A-Z]\\d{4}[A-Z]$`);

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function normalizeEmail(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
}

export function normalizePan(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s/g, "").toUpperCase();
}

export function normalizeAadhaarDigits(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\D/g, "");
}

export function normalizeIndianMobile(value) {
  if (value === undefined || value === null) return "";
  let s = String(value).trim().replace(/[\s().-]/g, "");
  if (!s) return "";
  if (s.startsWith("+91")) s = s.slice(3);
  else if (s.startsWith("91") && s.length === 12) s = s.slice(2);
  else if (s.startsWith("0") && s.length === 11) s = s.slice(1);
  return s.replace(/\D/g, "");
}

export function validateOptionalEmail(raw) {
  const email = normalizeEmail(raw);
  if (!email) return { ok: true, value: "" };
  if (email.length > 254) {
    return { ok: false, message: "Email must be at most 254 characters." };
  }
  if (!EMAIL_REGEX.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  return { ok: true, value: email };
}

export function validateOptionalPan(raw) {
  const pan = normalizePan(raw);
  if (!pan) return { ok: true, value: "" };
  if (pan.length !== 10) {
    return { ok: false, message: "PAN must be exactly 10 characters (e.g. ABCDE1234F)." };
  }
  if (!PAN_REGEX.test(pan)) {
    return {
      ok: false,
      message:
        "Invalid PAN format. Use 5 letters, 4 digits, 1 letter (4th letter must be a valid holder type: P, C, H, F, A, T, B, L, J, G)."
    };
  }
  return { ok: true, value: pan };
}

export function validateOptionalAadhaar(raw) {
  const digits = normalizeAadhaarDigits(raw);
  if (!digits) return { ok: true, value: "" };
  if (digits.length !== 12) {
    return { ok: false, message: "Aadhaar must be 12 digits (spaces allowed for readability)." };
  }
  if (!verhoeffValidTwelveDigitUid(digits)) {
    return { ok: false, message: "Aadhaar number is invalid (checksum failed)." };
  }
  return { ok: true, value: digits };
}

export function validateOptionalIndianMobile(raw) {
  const mobile = normalizeIndianMobile(raw);
  if (!mobile) return { ok: true, value: "" };
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    return {
      ok: false,
      message: "Mobile must be a valid 10-digit Indian number (starts with 6–9). Use +91 or leading 0 if needed."
    };
  }
  return { ok: true, value: mobile };
}

/**
 * Validate optional vendor contact fields; returns normalized strings for persistence.
 */
export function validateRequiredEmail(raw) {
  const r = validateOptionalEmail(raw);
  if (!r.ok) return r;
  if (!r.value) {
    return { ok: false, message: "Email is required." };
  }
  return r;
}

export function validateVendorContactPayload(body) {
  const email = validateOptionalEmail(body.email);
  if (!email.ok) return email;

  const pan = validateOptionalPan(body.pan);
  if (!pan.ok) return pan;

  const aadhaar = validateOptionalAadhaar(body.aadhaar);
  if (!aadhaar.ok) return aadhaar;

  const mobile = validateOptionalIndianMobile(body.contactNumber);
  if (!mobile.ok) return mobile;

  return {
    ok: true,
    normalized: {
      email: email.value,
      pan: pan.value,
      aadhaar: aadhaar.value,
      contactNumber: mobile.value
    }
  };
}
