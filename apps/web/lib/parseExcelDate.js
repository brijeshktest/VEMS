/**
 * Parse Excel / user-entered dates into YYYY-MM-DD (local calendar semantics).
 * Treats d/m/y and d-m-y as **day-first (DD/MM/YYYY)** when ambiguous.
 */
export function formatLocalYmdFromDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @param {unknown} raw — string, Date, or Excel serial number
 * @returns {string} YYYY-MM-DD or "" if unparseable
 */
export function parseFlexibleDateToYmd(raw) {
  if (raw === null || raw === undefined || raw === "") return "";
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return formatLocalYmdFromDate(raw);
  }
  if (typeof raw === "number" && raw > 20000 && raw < 60000) {
    const utc = Math.round((raw - 25569) * 86400 * 1000);
    const dt = new Date(utc);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dt.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  const s = String(raw).trim();
  if (!s) return "";
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, mo, da] = s.split("-").map((x) => Number(x));
    const dt = new Date(y, mo - 1, da);
    if (!Number.isNaN(dt.getTime())) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
    }
  }
  const mdm = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (mdm) {
    const a = Number(mdm[1]);
    const b = Number(mdm[2]);
    let y = mdm[3];
    if (String(y).length === 2) {
      y = Number(y) > 50 ? 1900 + Number(y) : 2000 + Number(y);
    } else {
      y = Number(y);
    }
    let day;
    let month;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return "";
    const dt = new Date(y, month - 1, day);
    if (Number.isNaN(dt.getTime())) return "";
    if (dt.getFullYear() !== y || dt.getMonth() !== month - 1 || dt.getDate() !== day) return "";
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const tryD = new Date(s);
  if (!Number.isNaN(tryD.getTime())) {
    return formatLocalYmdFromDate(tryD);
  }
  return "";
}
