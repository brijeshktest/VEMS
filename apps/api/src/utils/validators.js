export function requireFields(payload, fields) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === "");
  return missing;
}

export function ensureNumber(value, fieldName) {
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) {
    return { ok: false, message: `${fieldName} must be a number` };
  }
  return { ok: true, value: numberValue };
}

export function ensurePositive(value, fieldName) {
  const numberValue = Number(value);
  if (Number.isNaN(numberValue) || numberValue < 0) {
    return { ok: false, message: `${fieldName} must be a non-negative number` };
  }
  return { ok: true, value: numberValue };
}
