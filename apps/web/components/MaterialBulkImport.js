"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { BulkExcelUploadIconButton } from "./VoucherBulkImport.js";

export const MATERIAL_BULK_FIELD_DEFS = [
  { key: "name", label: "Material name" },
  { key: "category", label: "Category" },
  { key: "unit", label: "Unit" },
  { key: "description", label: "Description" },
  { key: "vendorNames", label: "Vendor names (semicolon-separated)" }
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

/** Headers like "Vendor count" / "# of vendors" must not map to the vendor-names column. */
function isLikelyVendorCountOrStatsHeader(h) {
  return (
    /\b(count|total|number|no\.?|qty|quantity)\b/.test(h) ||
    /\#\s*(of\s*)?/.test(h) ||
    /\bhow\s+many\b/.test(h)
  );
}

function guessDefaultMapping(headers) {
  const lower = headers.map((h) => String(h || "").toLowerCase().trim());
  const m = {};
  const pick = (key, tests, { reject } = {}) => {
    const idx = lower.findIndex((h) => {
      if (reject?.(h)) return false;
      return tests.some((t) => h === t || h.includes(t));
    });
    if (idx >= 0) m[key] = colKey(idx);
  };
  // Do not treat "Vendor name" as the material name column (it contains "name").
  pick("name", ["material", "item", "name", "product"], {
    reject: (h) => h.includes("vendor") || h.includes("supplier")
  });
  pick("category", ["category", "class"]);
  pick("unit", ["unit", "uom"]);
  pick("description", ["description", "desc", "detail"]);
  // Prefer a column that lists vendor names, not "Vendor count" (often left of "Vendors" in exports).
  const vendorIdx = lower.findIndex(
    (h) =>
      (h.includes("vendor") || h.includes("supplier")) && !isLikelyVendorCountOrStatsHeader(h)
  );
  if (vendorIdx >= 0) {
    m.vendorNames = colKey(vendorIdx);
  } else {
    pick("vendorNames", ["suppliers", "vendors"], {
      reject: (h) => isLikelyVendorCountOrStatsHeader(h)
    });
  }
  return m;
}

function rowFingerprint(row, mapping) {
  const parts = [];
  for (const { key } of MATERIAL_BULK_FIELD_DEFS) {
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

/** Excel often stores row indices or stray numbers in a column; digit-only tokens are not vendor names here. */
function isDigitOnlyToken(s) {
  return /^\d+$/.test(String(s).trim());
}

function isMongoIdString(s) {
  return /^[a-f0-9]{24}$/i.test(String(s).trim());
}

function normalizeVendorNameKey(s) {
  return String(s ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeVendorToken(s) {
  let t = String(s ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).replace(/\s+/g, " ").trim();
  }
  return t;
}

/**
 * Split vendor cell: `;` / newline between vendors; comma only when every segment matches a full vendor name
 * (so "Acme, LLC" stays one name if "Acme" and "LLC" are not both vendors).
 */
function splitVendorParts(raw, vendors) {
  const s = normalizeText(raw).replace(/\u00a0/g, " ").trim();
  if (!s) return [];
  const chunks = s.split(/[;\n\r\t]+/).map((c) => normalizeVendorToken(c)).filter(Boolean);
  const out = [];
  for (const chunk of chunks) {
    if (!chunk.includes(",")) {
      out.push(chunk);
      continue;
    }
    const commaParts = chunk.split(/\s*,\s*/).map((c) => normalizeVendorToken(c)).filter(Boolean);
    const allMatch =
      commaParts.length > 0 &&
      commaParts.every((p) =>
        vendors.some((v) => normalizeVendorNameKey(v.name) === normalizeVendorNameKey(p))
      );
    if (allMatch) out.push(...commaParts);
    else out.push(chunk);
  }
  return out;
}

/**
 * @returns {{ vendorIds: string[], unresolvedTokens: string[] }}
 */
function resolveVendorTokens(cell, vendors) {
  const raw = normalizeText(cell);
  if (!raw) return { vendorIds: [], unresolvedTokens: [] };
  const parts = splitVendorParts(raw, vendors);
  const ids = [];
  const unresolved = [];
  for (const part of parts) {
    const token = normalizeVendorToken(part);
    if (!token) continue;
    if (isDigitOnlyToken(token)) {
      continue;
    }
    if (isMongoIdString(token)) {
      const idLower = token.toLowerCase();
      const hit = vendors.find((v) => String(v._id).toLowerCase() === idLower);
      if (hit) {
        ids.push(String(hit._id));
        continue;
      }
      unresolved.push(token);
      continue;
    }
    const byName = vendors.find((v) => normalizeVendorNameKey(v.name) === normalizeVendorNameKey(token));
    if (byName) {
      ids.push(String(byName._id));
      continue;
    }
    unresolved.push(token);
  }
  return { vendorIds: [...new Set(ids)], unresolvedTokens: unresolved };
}

/**
 * @param {{ vendors: object[], onImported: () => Promise<void> | void, setError: (s: string) => void, canBulkUpload: boolean }}
 */
export default function MaterialBulkImport({ vendors, onImported, setError, canBulkUpload }) {
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

  const buildPayloads = useCallback(() => {
    const list = [];
    for (const row of rows) {
      const name = mapping.name ? normalizeText(row[mapping.name]) : "";
      const vendorCell = mapping.vendorNames ? row[mapping.vendorNames] : "";
      const { vendorIds, unresolvedTokens } = resolveVendorTokens(vendorCell, vendors);
      list.push({
        name,
        category: mapping.category ? normalizeText(row[mapping.category]) : "",
        unit: mapping.unit ? normalizeText(row[mapping.unit]) : "",
        description: mapping.description ? normalizeText(row[mapping.description]) : "",
        vendorIds: vendorIds.map(String),
        __vendorUnresolved: unresolvedTokens
      });
    }
    return list;
  }, [rows, mapping, vendors]);

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
        const materials = toSend.map(({ __vendorUnresolved: _u, ...rest }) => rest);
        const res = await apiFetch("/materials/bulk", {
          method: "POST",
          body: JSON.stringify({ materials })
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
    if (!mapping.name) {
      setError("Map the material name column before continuing.");
      return;
    }
    try {
      const payloads = buildPayloads();
      for (let i = 0; i < payloads.length; i++) {
        const p = payloads[i];
        if (!p.name) {
          setError(`Row ${i + 2}: material name is empty.`);
          return;
        }
        if (p.__vendorUnresolved?.length) {
          setError(
            `Row ${i + 2}: no matching vendor for "${p.__vendorUnresolved.join('", "')}". Use vendor names as in the directory (or 24-char id). Separate multiple vendors with ; or newline, or comma only when each part is a full vendor name. Plain numbers are ignored.`
          );
          return;
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
        title="Bulk upload materials from Excel"
      />

      {step === "importing" ? (
        <div className="voucher-modal-backdrop" role="presentation" aria-busy="true">
          <div className="confirm-dialog-box" role="status">
            <p className="confirm-dialog-message confirm-dialog-message--solo">Importing materials…</p>
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
            aria-labelledby="material-bulk-map-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="material-bulk-map-title" className="voucher-modal-title">
                Map Excel columns (materials)
              </h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={resetFlow}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body">
              <p className="page-lead">
                Match each field to a column ({rows.length} data rows).                 For vendors, list names separated by{" "}
                <strong>;</strong>, newline, or <strong>tab</strong> between vendors. You can use commas only when each
                comma-separated value is a full vendor name (e.g. <code>Alpha; Beta</code> or two names that both exist
                exactly). Names are matched case-insensitive; non-breaking spaces from Excel are handled. You may paste a
                24-char vendor id. Numeric-only tokens are ignored. Leave the column unmapped for materials with no vendor
                link.
              </p>
              <div className="bulk-map-grid">
                {MATERIAL_BULK_FIELD_DEFS.map((def) => (
                  <div key={def.key} className="bulk-map-row">
                    <label className="bulk-map-label" htmlFor={`material-map-${def.key}`}>
                      {def.label}
                    </label>
                    <div className="bulk-map-select-wrap">
                      <select
                        id={`material-map-${def.key}`}
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
            aria-labelledby="material-bulk-dup-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="material-bulk-dup-title" className="voucher-modal-title">
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
                    Excel data rows: <strong>{g.map((idx) => idx + 2).join(", ")}</strong> ({g.length} rows)
                  </li>
                ))}
              </ul>
              {duplicateGroups.length > 20 ? <p className="page-lead">…and {duplicateGroups.length - 20} more groups.</p> : null}
              <fieldset className="bulk-dup-fieldset">
                <legend className="bulk-dup-legend">How should duplicates be imported?</legend>
                <label className="bulk-dup-radio">
                  <input
                    type="radio"
                    name="materialDupChoice"
                    checked={dupChoice === "first"}
                    onChange={() => setDupChoice("first")}
                  />{" "}
                  Import <strong>only the first</strong> row in each group
                </label>
                <label className="bulk-dup-radio">
                  <input
                    type="radio"
                    name="materialDupChoice"
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
            aria-labelledby="material-bulk-done-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="material-bulk-done-title" className="voucher-modal-title">
                Import finished
              </h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={resetFlow}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body">
              <p className="page-lead">
                Created <strong>{importSummary.imported}</strong> material{importSummary.imported === 1 ? "" : "s"}.
                {importSummary.failed ? (
                  <>
                    {" "}
                    <strong>{importSummary.failed}</strong> row{importSummary.failed === 1 ? "" : "s"} failed.
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
