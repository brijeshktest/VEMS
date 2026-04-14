"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { parseFlexibleDateToYmd } from "../lib/parseExcelDate.js";
import { BulkExcelUploadIconButton } from "./VoucherBulkImport.js";

/** Logical Excel columns → contribution entry (one row per record). */
export const CONTRIBUTION_BULK_FIELD_DEFS = [
  { key: "member", label: "Contributor (name)" },
  { key: "amount", label: "Amount" },
  { key: "contributedAt", label: "Contribution date" },
  { key: "toPrimaryHolder", label: "Received by (primary)" },
  { key: "transferMode", label: "Transfer mode" },
  { key: "notes", label: "Notes" }
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
  pick("member", ["contributor", "member", "name", "person", "paid by"]);
  pick("amount", ["amount", "value", "sum", "rupees"]);
  pick("contributedAt", ["date", "contribution", "contributed"]);
  pick("toPrimaryHolder", ["received", "primary", "holder", "to sunil", "recipient"]);
  pick("transferMode", ["transfer", "mode", "payment", "upi", "method"]);
  pick("notes", ["note", "remark", "comment"]);
  return m;
}

function rowFingerprint(row, mapping) {
  const parts = [];
  for (const { key } of CONTRIBUTION_BULK_FIELD_DEFS) {
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

function isPrimaryMemberName(name, primaryNames) {
  return primaryNames.some((p) => p.toLowerCase() === String(name || "").trim().toLowerCase());
}

function matchCanonicalMember(raw, memberNames) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const hit = memberNames.find((n) => n.toLowerCase() === t.toLowerCase());
  return hit || "";
}

function matchPrimaryHolder(raw, holders) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const hit = holders.find((n) => n.toLowerCase() === t.toLowerCase());
  return hit || "";
}

function matchTransferMode(raw, modes) {
  const t = String(raw || "").trim();
  if (!t) return "UPI";
  const hit = modes.find((m) => m.toLowerCase() === t.toLowerCase());
  return hit || t;
}

/**
 * @param {{ meta: { members?: { name: string }[], primaryAccountHolders?: string[], transferModes?: string[] } | null, onImported: () => Promise<void> | void, setError: (s: string) => void, canBulkUpload: boolean }}
 */
export default function ContributionBulkImport({ meta, onImported, setError, canBulkUpload }) {
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

  const memberNames = useMemo(() => (meta?.members || []).map((x) => x.name).filter(Boolean), [meta]);
  const primaryHolders = meta?.primaryAccountHolders || ["Sunil", "Shailendra"];
  const transferModes = meta?.transferModes || [
    "Cash",
    "UPI",
    "NEFT",
    "RTGS",
    "IMPS",
    "Bank transfer",
    "Cheque",
    "Card",
    "Other"
  ];

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

  const buildPayloads = useCallback(() => {
    const list = [];
    for (const row of rows) {
      const rawMember = mapping.member ? normalizeText(row[mapping.member]) : "";
      const member = matchCanonicalMember(rawMember, memberNames);
      const rawAmt = mapping.amount ? row[mapping.amount] : "";
      const amount = parseNumber(rawAmt, NaN);

      const rawDate = mapping.contributedAt ? row[mapping.contributedAt] : undefined;
      let contributedAt = parseFlexibleDateToYmd(rawDate);
      if (!contributedAt) contributedAt = todayYmd();

      const rawHolder = mapping.toPrimaryHolder ? normalizeText(row[mapping.toPrimaryHolder]) : "";
      const toPrimaryResolved = matchPrimaryHolder(rawHolder, primaryHolders);

      const rawMode = mapping.transferMode ? normalizeText(row[mapping.transferMode]) : "";
      const transferMode = matchTransferMode(rawMode, transferModes);

      const notes = mapping.notes ? normalizeText(row[mapping.notes]) : "";

      const payload = {
        member: member || rawMember,
        amount,
        contributedAt,
        transferMode,
        notes
      };
      if (!isPrimaryMemberName(payload.member, primaryHolders)) {
        payload.toPrimaryHolder = toPrimaryResolved || rawHolder;
      }
      list.push(payload);
    }
    return list;
  }, [rows, mapping, memberNames, primaryHolders, transferModes]);

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
        const res = await apiFetch("/contributions/bulk", {
          method: "POST",
          body: JSON.stringify({ entries: toSend })
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
    if (!mapping.member) {
      setError("Map the contributor column before continuing.");
      return;
    }
    if (!mapping.amount) {
      setError("Map the amount column before continuing.");
      return;
    }
    try {
      const payloads = buildPayloads();
      for (let i = 0; i < payloads.length; i++) {
        const p = payloads[i];
        if (!memberNames.includes(p.member)) {
          setError(`Row ${i + 2}: contributor must match a known name (${memberNames.join(", ")}).`);
          return;
        }
        if (!Number.isFinite(p.amount) || p.amount < 0) {
          setError(`Row ${i + 2}: amount must be a valid non-negative number.`);
          return;
        }
        if (!isPrimaryMemberName(p.member, primaryHolders)) {
          if (!p.toPrimaryHolder || !primaryHolders.includes(p.toPrimaryHolder)) {
            setError(
              `Row ${i + 2}: received by (primary) is required for ${p.member} (${primaryHolders.join(" or ")}).`
            );
            return;
          }
        }
      }
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
        title="Bulk upload contributions from Excel"
      />

      {step === "importing" ? (
        <div className="voucher-modal-backdrop" role="presentation" aria-busy="true">
          <div className="confirm-dialog-box" role="status">
            <p className="confirm-dialog-message confirm-dialog-message--solo">Importing contributions…</p>
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
            aria-labelledby="contrib-bulk-map-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="contrib-bulk-map-title" className="voucher-modal-title">
                Map Excel columns (contributions)
              </h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={resetFlow}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body">
              <p className="page-lead">
                Match each field to a column ({rows.length} data rows). Contributor names must match exactly (case
                ignored): {memberNames.join(", ")}. For non-primary contributors, map <strong>Received by</strong> (
                {primaryHolders.join(" or ")}). Default transfer mode when the column is empty: UPI.
              </p>
              <div className="bulk-map-grid">
                {CONTRIBUTION_BULK_FIELD_DEFS.map((def) => (
                  <div key={def.key} className="bulk-map-row">
                    <label className="bulk-map-label" htmlFor={`contrib-map-${def.key}`}>
                      {def.label}
                    </label>
                    <div className="bulk-map-select-wrap">
                      <select
                        id={`contrib-map-${def.key}`}
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
            aria-labelledby="contrib-bulk-dup-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="contrib-bulk-dup-title" className="voucher-modal-title">
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
                    <strong>{g.map((idx) => idx + 2).join(", ")}</strong> ({g.length} rows)
                  </li>
                ))}
              </ul>
              {duplicateGroups.length > 20 ? <p className="page-lead">…and {duplicateGroups.length - 20} more groups.</p> : null}
              <fieldset className="bulk-dup-fieldset">
                <legend className="bulk-dup-legend">How should duplicates be imported?</legend>
                <label className="bulk-dup-radio">
                  <input
                    type="radio"
                    name="contribDupChoice"
                    checked={dupChoice === "first"}
                    onChange={() => setDupChoice("first")}
                  />{" "}
                  Import <strong>only the first</strong> row in each duplicate group (recommended)
                </label>
                <label className="bulk-dup-radio">
                  <input
                    type="radio"
                    name="contribDupChoice"
                    checked={dupChoice === "all"}
                    onChange={() => setDupChoice("all")}
                  />{" "}
                  Import <strong>every</strong> row
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
            aria-labelledby="contrib-bulk-done-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="contrib-bulk-done-title" className="voucher-modal-title">
                Import finished
              </h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={resetFlow}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body">
              <p className="page-lead">
                Created <strong>{importSummary.imported}</strong> contribution
                {importSummary.imported === 1 ? "" : "s"}.
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
