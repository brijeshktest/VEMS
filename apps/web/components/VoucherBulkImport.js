"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { PAYMENT_MADE_FROM_CHOICES } from "../lib/paymentMadeFrom.js";
import { parseFlexibleDateToYmd } from "../lib/parseExcelDate.js";

/** Logical Excel columns → voucher form (one line item per row). */
export const VOUCHER_BULK_FIELD_DEFS = [
  { key: "vendorName", label: "Vendor (name)" },
  { key: "voucherNumber", label: "Voucher number" },
  { key: "dateOfPurchase", label: "Date of purchase" },
  { key: "materialName", label: "Material (name)" },
  { key: "quantity", label: "Quantity" },
  { key: "pricePerUnit", label: "Price per unit" },
  { key: "lineComment", label: "Line comment" },
  { key: "taxPercent", label: "Tax %" },
  { key: "discountType", label: "Discount type (none / percent / flat)" },
  { key: "discountValue", label: "Discount value" },
  { key: "voucherAmount", label: "Voucher amount" },
  { key: "paidAmount", label: "Paid amount" },
  { key: "paymentMethod", label: "Payment method" },
  { key: "paymentStatus", label: "Payment status" },
  { key: "paymentDate", label: "Payment date" },
  { key: "paymentMadeBy", label: "Payment made from" },
  { key: "paidByMode", label: "Paid by mode" },
  { key: "paymentComments", label: "Payment comments" }
];

function colKey(i) {
  return `__c${i}`;
}

function normalizeText(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && v > 20000 && v < 60000) {
    const utc = Math.round((v - 25569) * 86400 * 1000);
    const dt = new Date(utc);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dt.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  return String(v).trim();
}

function parseNumber(v, fallback = 0) {
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function todayYmd() {
  const x = new Date();
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const d = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function guessDefaultMapping(headers) {
  const lower = headers.map((h) => String(h || "").toLowerCase().trim());
  const m = {};
  const pick = (key, tests) => {
    const idx = lower.findIndex((h) => tests.some((t) => h === t || h.includes(t)));
    if (idx >= 0) m[key] = colKey(idx);
  };
  pick("vendorName", ["vendor", "supplier", "party"]);
  pick("voucherNumber", ["voucher", "voucher no", "voucher number", "invoice"]);
  pick("dateOfPurchase", ["date", "purchase date", "bill date"]);
  pick("materialName", ["material", "item", "product"]);
  pick("quantity", ["qty", "quantity"]);
  pick("pricePerUnit", ["price", "rate", "price per"]);
  pick("lineComment", ["comment", "line comment", "remarks"]);
  pick("taxPercent", ["tax", "tax%", "gst"]);
  pick("discountType", ["discount type"]);
  pick("discountValue", ["discount"]);
  pick("voucherAmount", ["voucher amount", "voucher amt", "voucher total", "invoice total", "gross amount", "bill amount"]);
  pick("paidAmount", ["paid amount", "amount paid", "paid"]);
  pick("paymentMethod", ["payment method", "pay mode"]);
  pick("paymentStatus", ["status", "payment status"]);
  pick("paymentDate", ["payment date"]);
  pick("paymentMadeBy", ["payment made", "paid from", "payer"]);
  pick("paidByMode", ["paid by"]);
  pick("paymentComments", ["payment comment"]);
  return m;
}

function rowFingerprint(row, mapping) {
  const parts = [];
  for (const { key } of VOUCHER_BULK_FIELD_DEFS) {
    const ck = mapping[key];
    if (!ck) continue;
    parts.push(`${key}:${normalizeText(row[ck]).toLowerCase()}`);
  }
  return parts.join("\u001f");
}

function isRowEmpty(row, headersLen) {
  for (let i = 0; i < headersLen; i++) {
    if (normalizeText(row[colKey(i)])) return false;
  }
  return true;
}

export function BulkExcelUploadIconButton({ onClick, disabled, title = "Bulk upload from Excel" }) {
  return (
    <button
      type="button"
      className="btn btn-secondary btn-icon btn-icon--bulk-excel"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      title={title}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="2" width="16" height="20" rx="2" fill="#217346" />
        <path d="M7 7h10M7 10h10M7 13h6" stroke="#fff" strokeWidth="1.25" strokeLinecap="round" opacity="0.95" />
        <path
          d="M12 17v-5M9 14l3-3 3 3"
          stroke="#fde68a"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * @param {{ vendors: object[], materials: object[], onImported: () => Promise<void> | void, setError: (s: string) => void, canBulkUpload: boolean }}
 */
export default function VoucherBulkImport({ vendors, materials, onImported, setError, canBulkUpload }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState("idle");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [pendingPayloads, setPendingPayloads] = useState([]);
  const [dupChoice, setDupChoice] = useState("first");
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);

  const headerOptions = useMemo(() => {
    return [{ value: "", label: "— Not mapped —" }].concat(
      headers.map((h, i) => ({ value: colKey(i), label: h || `Column ${i + 1}` }))
    );
  }, [headers]);

  const resetFlow = useCallback(() => {
    setStep("idle");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setDuplicateGroups([]);
    setPendingPayloads([]);
    setDupChoice("first");
    setImporting(false);
    setImportSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const parseWorkbook = useCallback(async (file) => {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("The workbook has no sheets.");
    const sheet = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    if (!data.length) throw new Error("The sheet is empty.");
    const rawHeader = data[0];
    const hdrs = rawHeader.map((h, i) => normalizeText(h) || `Column ${i + 1}`);
    const dataRows = data
      .slice(1)
      .map((cells) => {
        const o = {};
        hdrs.forEach((_, i) => {
          o[colKey(i)] = cells[i] ?? "";
        });
        return o;
      })
      .filter((row) => !isRowEmpty(row, hdrs.length));
    if (!dataRows.length) throw new Error("No data rows found under the header.");
    return { headers: hdrs, rows: dataRows, mapping: guessDefaultMapping(hdrs) };
  }, []);

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !canBulkUpload) return;
    setError("");
    setImportSummary(null);
    try {
      const parsed = await parseWorkbook(file);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(parsed.mapping);
      setStep("mapping");
    } catch (err) {
      setError(err.message || "Could not read Excel file.");
    }
  };

  const buildPayloads = useCallback(async () => {
    const ph = await apiFetch("/vouchers/import-placeholders", {
      method: "POST",
      body: JSON.stringify({
        vendorIds: vendors.map((v) => String(v._id))
      })
    });
    const defaultVendorId = String(ph.defaultVendorId);
    const materialByVendorId = {};
    for (const [k, v] of Object.entries(ph.materialByVendorId || {})) {
      materialByVendorId[k] = String(v);
    }

    const list = [];
    for (const row of rows) {
      const vendorName = mapping.vendorName ? normalizeText(row[mapping.vendorName]) : "";
      let vendorId = defaultVendorId;
      if (vendorName) {
        const vhit = vendors.find((v) => (v.name || "").trim().toLowerCase() === vendorName.toLowerCase());
        if (vhit) vendorId = String(vhit._id);
      }
      const phMatId = materialByVendorId[vendorId] || materialByVendorId[defaultVendorId];
      const matName = mapping.materialName ? normalizeText(row[mapping.materialName]) : "";
      let materialId = phMatId;
      if (matName) {
        const mhit = materials.find(
          (m) =>
            (m.name || "").trim().toLowerCase() === matName.toLowerCase() &&
            (m.vendorIds || []).map(String).includes(vendorId)
        );
        if (mhit) materialId = String(mhit._id);
      }

      const qty = mapping.quantity ? parseNumber(row[mapping.quantity], 0) : 0;
      const pricePerUnit = mapping.pricePerUnit ? parseNumber(row[mapping.pricePerUnit], 0) : 0;
      const lineComment = mapping.lineComment ? normalizeText(row[mapping.lineComment]) : "";

      const rawPurchase = mapping.dateOfPurchase ? row[mapping.dateOfPurchase] : undefined;
      let dateOfPurchase = parseFlexibleDateToYmd(rawPurchase);
      if (!dateOfPurchase) dateOfPurchase = todayYmd();

      const taxPercent = mapping.taxPercent ? parseNumber(row[mapping.taxPercent], 0) : 0;
      let discountType = mapping.discountType ? normalizeText(row[mapping.discountType]).toLowerCase() : "none";
      if (!["none", "percent", "flat"].includes(discountType)) discountType = "none";
      const discountValue = mapping.discountValue ? parseNumber(row[mapping.discountValue], 0) : 0;

      let paymentMethod = mapping.paymentMethod ? normalizeText(row[mapping.paymentMethod]) : "";
      if (!paymentMethod) paymentMethod = "Cash";

      let paymentStatus = mapping.paymentStatus ? normalizeText(row[mapping.paymentStatus]) : "Pending";
      if (!["Paid", "Pending", "Partially Paid"].includes(paymentStatus)) paymentStatus = "Pending";

      let paymentMadeBy = mapping.paymentMadeBy ? normalizeText(row[mapping.paymentMadeBy]) : "";
      if (paymentStatus === "Paid" && !PAYMENT_MADE_FROM_CHOICES.includes(paymentMadeBy)) {
        paymentStatus = "Pending";
        paymentMadeBy = "";
      }

      let paymentDate = "";
      if (mapping.paymentDate && paymentStatus === "Paid") {
        paymentDate = parseFlexibleDateToYmd(row[mapping.paymentDate]);
      }
      if (paymentStatus !== "Paid") paymentDate = "";

      const paidByMode = mapping.paidByMode ? normalizeText(row[mapping.paidByMode]) : "";
      const paymentComments = mapping.paymentComments ? normalizeText(row[mapping.paymentComments]) : "";

      const voucherNumber = mapping.voucherNumber ? normalizeText(row[mapping.voucherNumber]) : "";

      const payload = {
        vendorId,
        voucherNumber,
        dateOfPurchase,
        items: [{ materialId, quantity: qty, pricePerUnit, comment: lineComment }],
        taxPercent,
        discountType,
        discountValue,
        paymentMethod,
        paymentStatus,
        paymentDate: paymentDate || undefined,
        paymentMadeBy,
        paidByMode,
        paymentComments
      };
      if (mapping.voucherAmount && normalizeText(row[mapping.voucherAmount])) {
        const v = parseNumber(row[mapping.voucherAmount], NaN);
        if (Number.isFinite(v) && v >= 0) payload.finalAmount = v;
      }
      if (mapping.paidAmount && normalizeText(row[mapping.paidAmount])) {
        payload.paidAmount = parseNumber(row[mapping.paidAmount], 0);
      }
      list.push(payload);
    }
    return list;
  }, [rows, mapping, vendors, materials]);

  const runBulkImport = useCallback(
    async (payloads, duplicateGroupsLocal, dedupeMode) => {
      const mode = dedupeMode === "all" || dedupeMode === "first" ? dedupeMode : "first";
      setError("");
      setImporting(true);
      setStep("importing");
      try {
        let toSend = payloads;
        if (mode === "first" && duplicateGroupsLocal.length > 0) {
          const drop = new Set();
          for (const g of duplicateGroupsLocal) {
            const sorted = [...g].sort((a, b) => a - b);
            sorted.slice(1).forEach((i) => drop.add(i));
          }
          toSend = payloads.filter((_, i) => !drop.has(i));
        }
        const res = await apiFetch("/vouchers/bulk", {
          method: "POST",
          body: JSON.stringify({ vouchers: toSend })
        });
        const failed = (res.results || []).filter((r) => !r.ok);
        setImportSummary({
          imported: res.imported ?? 0,
          failed: res.failed ?? 0,
          failedDetails: failed.slice(0, 12)
        });
        await onImported();
        setStep("done");
      } catch (err) {
        setError(err.message || "Bulk import failed.");
        setStep("mapping");
      } finally {
        setImporting(false);
      }
    },
    [onImported, setError]
  );

  const runDuplicateScan = useCallback(
    async (payloads) => {
      const map = new Map();
      rows.forEach((row, idx) => {
        const fp = rowFingerprint(row, mapping);
        if (!fp) return;
        if (!map.has(fp)) map.set(fp, []);
        map.get(fp).push(idx);
      });
      const groups = [...map.values()].filter((g) => g.length > 1);
      setPendingPayloads(payloads);
      setDuplicateGroups(groups);
      if (groups.length) {
        setDupChoice("first");
        setStep("duplicates");
      } else {
        await runBulkImport(payloads, [], "first");
      }
    },
    [rows, mapping, runBulkImport]
  );

  const onConfirmMapping = async () => {
    setError("");
    try {
      const payloads = await buildPayloads();
      await runDuplicateScan(payloads);
    } catch (err) {
      setError(err.message || "Could not prepare import.");
    }
  };

  const onConfirmDuplicates = async () => {
    await runBulkImport(pendingPayloads, duplicateGroups, dupChoice);
  };

  if (!canBulkUpload) return null;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="visually-hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void onFileChange(e)}
      />
      <BulkExcelUploadIconButton
        disabled={importing}
        onClick={() => fileRef.current?.click()}
      />

      {step === "importing" ? (
        <div className="voucher-modal-backdrop" role="presentation" aria-busy="true">
          <div className="confirm-dialog-box" role="status">
            <p className="confirm-dialog-message confirm-dialog-message--solo">Importing vouchers…</p>
          </div>
        </div>
      ) : null}

      {step === "mapping" ? (
        <div
          className="voucher-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !importing) resetFlow();
          }}
        >
          <div
            className="voucher-modal-dialog voucher-modal-dialog--bulk"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-map-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="bulk-map-title" className="voucher-modal-title">
                Map Excel columns
              </h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={resetFlow}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body">
              <p className="page-lead">
                Match each voucher field to a column from your file ({rows.length} data rows). Unmapped optional fields
                use safe defaults. Vendor or material names that are not found use placeholder records you can fix by
                editing the voucher.
              </p>
              <div className="bulk-map-grid">
                {VOUCHER_BULK_FIELD_DEFS.map((def) => (
                  <div key={def.key} className="bulk-map-row">
                    <label className="bulk-map-label" htmlFor={`map-${def.key}`}>
                      {def.label}
                    </label>
                    <div className="bulk-map-select-wrap">
                      <select
                        id={`map-${def.key}`}
                        className="input"
                        value={mapping[def.key] || ""}
                        onChange={(e) => setMapping((m) => ({ ...m, [def.key]: e.target.value }))}
                      >
                        {headerOptions.map((o) => (
                          <option key={o.value || "__none"} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              {importing ? <p className="page-lead">Preparing…</p> : null}
            </div>
            <div className="voucher-modal-actions voucher-modal-actions--padded">
              <button type="button" className="btn btn-secondary" onClick={resetFlow} disabled={importing}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={() => void onConfirmMapping()} disabled={importing}>
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "duplicates" ? (
        <div
          className="voucher-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && !importing && setStep("mapping")}
        >
          <div
            className="voucher-modal-dialog voucher-modal-dialog--bulk"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-dup-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="bulk-dup-title" className="voucher-modal-title">
                Duplicate rows
              </h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={() => setStep("mapping")}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body">
              <p className="page-lead">
                Some rows have identical values in all <strong>mapped</strong> columns ({duplicateGroups.length}{" "}
                group{duplicateGroups.length === 1 ? "" : "s"}).
              </p>
              <ul className="bulk-dup-list">
                {duplicateGroups.slice(0, 20).map((g, i) => (
                  <li key={i}>
                    Excel data rows:{" "}
                    <strong>
                      {g.map((idx) => idx + 2).join(", ")}
                    </strong>{" "}
                    ({g.length} rows)
                  </li>
                ))}
              </ul>
              {duplicateGroups.length > 20 ? <p className="page-lead">…and {duplicateGroups.length - 20} more groups.</p> : null}
              <fieldset className="bulk-dup-fieldset">
                <legend className="bulk-dup-legend">How should duplicates be imported?</legend>
                <label className="bulk-dup-radio">
                  <input
                    type="radio"
                    name="dupChoice"
                    checked={dupChoice === "first"}
                    onChange={() => setDupChoice("first")}
                  />{" "}
                  Import <strong>only the first</strong> row in each duplicate group (recommended)
                </label>
                <label className="bulk-dup-radio">
                  <input
                    type="radio"
                    name="dupChoice"
                    checked={dupChoice === "all"}
                    onChange={() => setDupChoice("all")}
                  />{" "}
                  Import <strong>every</strong> row (create separate vouchers for identical rows)
                </label>
              </fieldset>
            </div>
            <div className="voucher-modal-actions voucher-modal-actions--padded">
              <button type="button" className="btn btn-secondary" onClick={() => setStep("mapping")} disabled={importing}>
                Back
              </button>
              <button type="button" className="btn" onClick={() => void onConfirmDuplicates()} disabled={importing}>
                {dupChoice === "all" ? "Import all rows" : "Import (deduplicated)"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "done" && importSummary ? (
        <div
          className="voucher-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && resetFlow()}
        >
          <div
            className="voucher-modal-dialog voucher-modal-dialog--bulk"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-done-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="bulk-done-title" className="voucher-modal-title">
                Import finished
              </h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={resetFlow}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body">
              <p className="page-lead">
                Created <strong>{importSummary.imported}</strong> voucher{importSummary.imported === 1 ? "" : "s"}.
                {importSummary.failed ? (
                  <>
                    {" "}
                    <strong>{importSummary.failed}</strong> row{importSummary.failed === 1 ? "" : "s"} failed validation.
                  </>
                ) : null}
              </p>
              {importSummary.failedDetails?.length ? (
                <ul className="bulk-dup-list">
                  {importSummary.failedDetails.map((r) => (
                    <li key={r.index}>
                      Batch row {r.index + 1}: {r.error}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="voucher-modal-actions voucher-modal-actions--padded">
              <button type="button" className="btn" onClick={resetFlow}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
