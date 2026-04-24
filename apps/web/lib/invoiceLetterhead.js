import { API_URL } from "./api.js";

/**
 * Normalised letterhead for PDF rendering.
 * @typedef {{ legalName: string, addressLines: string[], phone: string, gstin: string, website: string, email: string, logoUrl: string | null }} InvoiceLetterheadPdf
 */

/** @param {Record<string, unknown>} raw */
export function normalizeInvoiceLetterhead(raw) {
  const legalName = String(raw?.legalName || "").trim() || "Shroom Agritech LLP";
  const addressLines = Array.isArray(raw?.addressLines)
    ? raw.addressLines.map((s) => String(s).trim()).filter(Boolean)
    : [];
  return {
    legalName,
    addressLines,
    phone: String(raw?.phone || "").trim(),
    gstin: String(raw?.gstin || "").trim(),
    website: String(raw?.website || "").trim(),
    email: String(raw?.email || "").trim(),
    logoUrl: raw?.logoUrl ? String(raw.logoUrl) : null
  };
}

/**
 * Map GET /settings/invoice-letterhead JSON into PDF input (including logo URL).
 * @param {Record<string, unknown> | null | undefined} apiResponse
 * @returns {InvoiceLetterheadPdf}
 */
export function buildLetterheadForPdf(apiResponse) {
  if (!apiResponse) {
    return normalizeInvoiceLetterhead({});
  }
  const hasLogo = Boolean(apiResponse.hasLogo);
  const key = apiResponse.logoCacheKey;
  const cid = apiResponse.companyId != null ? String(apiResponse.companyId).trim() : "";
  const qp = cid ? `companyId=${encodeURIComponent(cid)}&` : "";
  const logoUrl =
    hasLogo && (typeof key === "number" || typeof key === "string")
      ? `${API_URL}/settings/logo?${qp}t=${key}`
      : null;
  return normalizeInvoiceLetterhead({
    legalName: apiResponse.legalName,
    addressLines: apiResponse.addressLines,
    phone: apiResponse.phone,
    gstin: apiResponse.gstin,
    website: apiResponse.website,
    email: apiResponse.email,
    logoUrl
  });
}
