"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../../lib/api.js";
import PageHeader from "../../../components/PageHeader.js";
import { EditIconButton, DeleteIconButton, ExcelDownloadIconButton } from "../../../components/EditDeleteIconButtons.js";
import { useConfirmDialog } from "../../../components/ConfirmDialog.js";
import { formatIndianRupee } from "../../../lib/formatIndianRupee.js";
import IndianAmountField from "../../../components/IndianAmountField.js";
import { downloadContributionEntriesXlsx } from "../../../lib/exportContributionsExcel.js";
import ContributionBulkImport from "../../../components/ContributionBulkImport.js";

const initialEntryForm = {
  member: "Rahul",
  amount: null,
  contributedAt: new Date().toISOString().slice(0, 10),
  toPrimaryHolder: "Sunil",
  transferMode: "UPI",
  notes: ""
};

function isPrimaryMember(member) {
  return member === "Sunil" || member === "Shailendra";
}

export default function ContributionsPage() {
  const [meta, setMeta] = useState(null);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [filterMember, setFilterMember] = useState("");
  const [filterToHolder, setFilterToHolder] = useState("");
  const [filterMode, setFilterMode] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [entryModal, setEntryModal] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [entryForm, setEntryForm] = useState(initialEntryForm);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [canBulkUpload, setCanBulkUpload] = useState(false);
  const [canBulkDelete, setCanBulkDelete] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const selectAllCheckboxRef = useRef(null);
  const { confirm, dialog } = useConfirmDialog();

  const loadMeta = useCallback(async () => {
    const m = await apiFetch("/contributions/meta");
    setMeta(m);
  }, []);

  const loadEntries = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterMember) params.set("member", filterMember);
    if (filterToHolder) params.set("toPrimaryHolder", filterToHolder);
    if (filterMode) params.set("transferMode", filterMode);
    if (filterFrom) params.set("from", filterFrom);
    if (filterTo) params.set("to", filterTo);
    const q = params.toString();
    const data = await apiFetch(`/contributions/entries${q ? `?${q}` : ""}`);
    setEntries(data);
  }, [filterMember, filterToHolder, filterMode, filterFrom, filterTo]);

  async function loadAll() {
    setError("");
    try {
      const [meData, permData] = await Promise.all([
        apiFetch("/auth/me"),
        apiFetch("/auth/permissions").catch(() => ({ permissions: {} }))
      ]);
      const admin = meData?.user?.role === "admin";
      setIsAdmin(admin);
      const p = permData.permissions;
      const all = p === "all";
      setCanBulkUpload(admin || all || Boolean(p?.contributions?.bulkUpload));
      setCanBulkDelete(admin || all || Boolean(p?.contributions?.bulkDelete));
      await Promise.all([loadMeta(), loadEntries()]);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const entryIdsKey = useMemo(() => entries.map((e) => String(e._id)).join(","), [entries]);

  useEffect(() => {
    const allowed = new Set(entryIdsKey.split(",").filter(Boolean));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
        else changed = true;
      }
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [entryIdsKey]);

  useLayoutEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el || !canBulkDelete) return;
    const ids = entryIdsKey.split(",").filter(Boolean);
    const n = ids.length;
    const sel = ids.filter((id) => selectedIds.has(id)).length;
    el.indeterminate = n > 0 && sel > 0 && sel < n;
    el.checked = n > 0 && sel === n;
  }, [canBulkDelete, selectedIds, entryIdsKey]);

  function toggleSelectAllContributions() {
    const ids = entries.map((e) => String(e._id));
    if (!ids.length) return;
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }

  function toggleSelectContribution(id) {
    const sid = String(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }

  async function bulkDeleteSelectedContributions() {
    const ids = [...selectedIds];
    if (!ids.length || !canBulkDelete) return;
    const ok = await confirm({
      title: "Delete selected contributions?",
      message:
        ids.length === 1
          ? "Permanently delete this contribution record?"
          : `Permanently delete ${ids.length} contribution records?`
    });
    if (!ok) return;
    setError("");
    try {
      await apiFetch("/contributions/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids })
      });
      setSelectedIds(new Set());
      if (editingEntryId && ids.includes(String(editingEntryId))) {
        setEditingEntryId(null);
        setEntryModal(false);
      }
      await loadEntries();
    } catch (err) {
      setError(err.message);
    }
  }

  function openCreateEntry() {
    setEditingEntryId(null);
    setEntryForm({
      ...initialEntryForm,
      contributedAt: new Date().toISOString().slice(0, 10)
    });
    setEntryModal(true);
  }

  function startEditEntry(row) {
    setEditingEntryId(row._id);
    setEntryForm({
      member: row.member,
      amount: Number(row.amount ?? 0),
      contributedAt: row.contributedAt ? new Date(row.contributedAt).toISOString().slice(0, 10) : "",
      toPrimaryHolder: isPrimaryMember(row.member) ? "" : row.toPrimaryHolder || "Sunil",
      transferMode: row.transferMode || "UPI",
      notes: row.notes || ""
    });
    setEntryModal(true);
  }

  function onMemberFieldChange(member) {
    setEntryForm((prev) => {
      const toPrimaryHolder = isPrimaryMember(member) ? "" : isPrimaryMember(prev.member) ? "Sunil" : prev.toPrimaryHolder;
      return { ...prev, member, toPrimaryHolder };
    });
  }

  async function saveEntry(e) {
    e.preventDefault();
    setError("");
    const amount = entryForm.amount;
    if (amount == null || !Number.isFinite(amount) || amount < 0) {
      setError("Amount must be a valid non-negative number.");
      return;
    }
    const payload = {
      member: entryForm.member,
      amount,
      contributedAt: entryForm.contributedAt,
      transferMode: entryForm.transferMode,
      notes: entryForm.notes.trim()
    };
    if (!isPrimaryMember(entryForm.member)) {
      payload.toPrimaryHolder = entryForm.toPrimaryHolder;
    } else {
      payload.toPrimaryHolder = null;
    }
    try {
      if (editingEntryId) {
        await apiFetch(`/contributions/entries/${editingEntryId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch("/contributions/entries", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      setEntryModal(false);
      await loadEntries();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDownloadEntriesExcel() {
    setError("");
    setExportingExcel(true);
    try {
      const all = await apiFetch("/contributions/entries");
      downloadContributionEntriesXlsx(all);
    } catch (err) {
      setError(err.message);
    } finally {
      setExportingExcel(false);
    }
  }

  async function deleteEntry(row) {
    if (!isAdmin) return;
    const recv =
      row.toPrimaryHolder != null && row.toPrimaryHolder !== ""
        ? ` → ${row.toPrimaryHolder}`
        : " (received by N/A)";
    const ok = await confirm({
      title: "Delete contribution record?",
      message: `${row.member}${recv} ${formatIndianRupee(row.amount)} via ${row.transferMode} on ${row.contributedAt ? new Date(row.contributedAt).toLocaleDateString() : "—"}?`
    });
    if (!ok) return;
    try {
      await apiFetch(`/contributions/entries/${row._id}`, { method: "DELETE" });
      await loadEntries();
    } catch (err) {
      setError(err.message);
    }
  }

  const memberNames = meta?.members?.map((m) => m.name) || ["Rahul", "Siddharth", "Sunil", "Brijesh", "Shailendra"];
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
  const modeOptionsForForm =
    entryForm.transferMode && !transferModes.includes(entryForm.transferMode)
      ? [entryForm.transferMode, ...transferModes]
      : transferModes;

  return (
    <div className="page-stack">
      {dialog}
      <PageHeader
        eyebrow="Internal"
        title="Contribution management"
        description="Add and filter contribution records (who paid, amount, date, primary recipient when applicable, transfer mode). Per-person summary with expense totals is on the Dashboard when Contribution management or Admin mode is selected."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="card-header-row card-header-row--voucher-toolbar">
          <h3 className="panel-title">All Account Contributions</h3>
          <div className="voucher-table-toolbar-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={openCreateEntry}>
              Add contribution
            </button>
            {canBulkDelete ? (
              <DeleteIconButton
                disabled={!selectedIds.size}
                onClick={() => void bulkDeleteSelectedContributions()}
                title={
                  selectedIds.size
                    ? `Delete ${selectedIds.size} selected contribution${selectedIds.size === 1 ? "" : "s"}`
                    : "Select contributions to delete"
                }
                aria-label={
                  selectedIds.size
                    ? `Delete ${selectedIds.size} selected contribution${selectedIds.size === 1 ? "" : "s"}`
                    : "Delete selected (choose contributions first)"
                }
              />
            ) : null}
            <ExcelDownloadIconButton
              disabled={exportingExcel}
              onClick={() => void handleDownloadEntriesExcel()}
              title={exportingExcel ? "Preparing…" : "Download all account contributions as Excel"}
              aria-label={exportingExcel ? "Preparing Excel export" : "Download all account contributions as Excel"}
            />
            <ContributionBulkImport
              meta={meta}
              canBulkUpload={canBulkUpload}
              setError={setError}
              onImported={async () => {
                await loadEntries();
              }}
            />
          </div>
        </div>
        <div className="grid grid-3" style={{ marginBottom: 16, gap: 12 }}>
          <div>
            <label htmlFor="flt-entry-member">Contributor</label>
            <select
              id="flt-entry-member"
              className="input"
              value={filterMember}
              onChange={(e) => setFilterMember(e.target.value)}
            >
              <option value="">All</option>
              {memberNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="flt-to-holder">Received by (primary)</label>
            <select
              id="flt-to-holder"
              className="input"
              value={filterToHolder}
              onChange={(e) => setFilterToHolder(e.target.value)}
            >
              <option value="">All</option>
              <option value="__none__">Not applicable</option>
              {primaryHolders.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="flt-mode">Mode</label>
            <select id="flt-mode" className="input" value={filterMode} onChange={(e) => setFilterMode(e.target.value)}>
              <option value="">All</option>
              {transferModes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="flt-from">From date</label>
            <input
              id="flt-from"
              className="input"
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="flt-to">To date</label>
            <input id="flt-to" className="input" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <button className="btn btn-secondary" type="button" onClick={() => void loadEntries()}>
            Apply filters
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {canBulkDelete ? (
                  <th className="col-select" scope="col">
                    <input
                      ref={selectAllCheckboxRef}
                      type="checkbox"
                      onChange={toggleSelectAllContributions}
                      aria-label="Select all visible contributions"
                    />
                  </th>
                ) : null}
                <th>Date</th>
                <th>Contributor</th>
                <th>Amount</th>
                <th>Received by</th>
                <th>Mode</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row._id}>
                  {canBulkDelete ? (
                    <td className="col-select">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(String(row._id))}
                        onChange={() => toggleSelectContribution(row._id)}
                        aria-label={`Select contribution ${row.member} ${row.contributedAt ? new Date(row.contributedAt).toLocaleDateString() : ""}`}
                      />
                    </td>
                  ) : null}
                  <td>{row.contributedAt ? new Date(row.contributedAt).toLocaleDateString() : "—"}</td>
                  <td>{row.member}</td>
                  <td>{formatIndianRupee(row.amount)}</td>
                  <td>{row.toPrimaryHolder != null && row.toPrimaryHolder !== "" ? row.toPrimaryHolder : "—"}</td>
                  <td>{row.transferMode || "—"}</td>
                  <td>{row.notes?.trim() ? row.notes : "—"}</td>
                  <td>
                    <div className="row-actions">
                      <EditIconButton onClick={() => startEditEntry(row)} />
                      {isAdmin ? <DeleteIconButton onClick={() => void deleteEntry(row)} /> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {entryModal ? (
        <div
          className="voucher-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEntryModal(false);
          }}
        >
          <div className="voucher-modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="voucher-modal-header">
              <h3 className="voucher-modal-title">{editingEntryId ? "Edit contribution" : "Add contribution"}</h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={() => setEntryModal(false)}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body">
              <p className="page-lead" style={{ marginBottom: 12, fontSize: 13 }}>
                For contributors who are not primary account holders, choose which primary account (on paper) received the
                amount and the transfer mode (UPI, bank transfer, cash, etc.).
                {isPrimaryMember(entryForm.member) ? (
                  <>
                    {" "}
                    As a <strong>primary account holder</strong>, <strong>Received by (primary account)</strong> does not
                    apply and is left blank.
                  </>
                ) : null}
              </p>
              <form className="grid section-stack voucher-modal-form" onSubmit={saveEntry}>
                <div>
                  <label htmlFor="ce-member">Contributor</label>
                  <select
                    id="ce-member"
                    className="input"
                    value={entryForm.member}
                    onChange={(e) => onMemberFieldChange(e.target.value)}
                    required
                  >
                    {memberNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ce-amount">Amount (Rs)</label>
                  <IndianAmountField
                    id="ce-amount"
                    className="input"
                    value={entryForm.amount}
                    onChange={(n) => setEntryForm({ ...entryForm, amount: n })}
                    placeholder="e.g. 1,00,000"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="ce-date">Contribution date</label>
                  <input
                    id="ce-date"
                    className="input"
                    type="date"
                    value={entryForm.contributedAt}
                    onChange={(e) => setEntryForm({ ...entryForm, contributedAt: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="ce-holder">Received by (primary account)</label>
                  {isPrimaryMember(entryForm.member) ? (
                    <input
                      id="ce-holder"
                      className="input"
                      type="text"
                      value=""
                      disabled
                      readOnly
                      placeholder="Not applicable"
                      aria-label="Received by (primary account), not applicable for primary contributors"
                    />
                  ) : (
                    <select
                      id="ce-holder"
                      className="input"
                      value={entryForm.toPrimaryHolder}
                      onChange={(e) => setEntryForm({ ...entryForm, toPrimaryHolder: e.target.value })}
                      required
                    >
                      {primaryHolders.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label htmlFor="ce-mode">Transfer mode</label>
                  <select
                    id="ce-mode"
                    className="input"
                    value={entryForm.transferMode}
                    onChange={(e) => setEntryForm({ ...entryForm, transferMode: e.target.value })}
                    required
                  >
                    {modeOptionsForForm.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-span-all">
                  <label htmlFor="ce-notes">Notes (optional)</label>
                  <input
                    id="ce-notes"
                    className="input"
                    value={entryForm.notes}
                    onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })}
                  />
                </div>
                <div className="form-span-all" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn" type="submit">
                    {editingEntryId ? "Save" : "Create"}
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={() => setEntryModal(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
