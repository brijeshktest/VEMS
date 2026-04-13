"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api.js";
import PageHeader from "../../../components/PageHeader.js";
import { EditIconButton, DeleteIconButton } from "../../../components/EditDeleteIconButtons.js";
import { useConfirmDialog } from "../../../components/ConfirmDialog.js";
import { formatIndianRupee } from "../../../lib/formatIndianRupee.js";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "entries", label: "Contributions" }
];

const initialEntryForm = {
  member: "Rahul",
  amount: "",
  contributedAt: new Date().toISOString().slice(0, 10),
  toPrimaryHolder: "Sunil",
  transferMode: "UPI",
  notes: ""
};

export default function ContributionsPage() {
  const [tab, setTab] = useState("overview");
  const [meta, setMeta] = useState(null);
  const [summary, setSummary] = useState(null);
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
  const { confirm, dialog } = useConfirmDialog();

  const loadSummary = useCallback(async () => {
    const s = await apiFetch("/contributions/summary");
    setSummary(s);
  }, []);

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
      const meData = await apiFetch("/auth/me");
      setIsAdmin(meData?.user?.role === "admin");
      await Promise.all([loadMeta(), loadSummary(), loadEntries()]);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (tab === "entries") void loadEntries().catch((e) => setError(e.message));
  }, [tab, loadEntries]);

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
      amount: String(row.amount ?? ""),
      contributedAt: row.contributedAt ? new Date(row.contributedAt).toISOString().slice(0, 10) : "",
      toPrimaryHolder: row.toPrimaryHolder || "Sunil",
      transferMode: row.transferMode || "UPI",
      notes: row.notes || ""
    });
    setEntryModal(true);
  }

  async function saveEntry(e) {
    e.preventDefault();
    setError("");
    const amount = Number(entryForm.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Amount must be a valid non-negative number.");
      return;
    }
    const payload = {
      member: entryForm.member,
      amount,
      contributedAt: entryForm.contributedAt,
      toPrimaryHolder: entryForm.toPrimaryHolder,
      transferMode: entryForm.transferMode,
      notes: entryForm.notes.trim()
    };
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
      await loadSummary();
      await loadEntries();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteEntry(row) {
    if (!isAdmin) return;
    const ok = await confirm({
      title: "Delete contribution record?",
      message: `${row.member} → ${row.toPrimaryHolder} ${formatIndianRupee(row.amount)} via ${row.transferMode} on ${row.contributedAt ? new Date(row.contributedAt).toLocaleDateString() : "—"}?`
    });
    if (!ok) return;
    try {
      await apiFetch(`/contributions/entries/${row._id}`, { method: "DELETE" });
      await loadSummary();
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
        description="Each contribution is one record: who paid, how much, when, which primary account (Sunil or Shailendra) received it on paper, and the transfer mode (UPI, bank, cash, etc.). Access is set in Admin → Roles (Contribution management)."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header-row card-header-row--voucher-toolbar">
          <h3 className="panel-title">Views</h3>
          <div className="voucher-table-toolbar-actions" style={{ flexWrap: "wrap", gap: 8 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? "btn" : "btn btn-secondary"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "overview" && !summary ? (
        <div className="card">
          <p className="page-lead">Loading summary…</p>
        </div>
      ) : null}

      {tab === "overview" && summary ? (
        <div className="card">
          <h3 className="panel-title">Per-person summary</h3>
          <p className="page-lead" style={{ marginBottom: 16 }}>
            <strong>Sunil</strong> and <strong>Shailendra</strong> are the primary account holders on paper. Every row in the
            log states which holder received that amount and through which mode. <strong>Expense contribution</strong> matches
            the expense dashboard: paid vouchers, <em>Payment made from</em>, total paid (same scope as the payment summary).
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Individual</th>
                  <th>Role</th>
                  <th>Contribution</th>
                  <th>Expense contribution</th>
                  <th>Total contribution</th>
                  <th>Routed to Sunil</th>
                  <th>Routed to bank (from Primary)</th>
                </tr>
              </thead>
              <tbody>
                {summary.members.map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td>{m.isPrimaryHolder ? "Primary account" : "Contributor"}</td>
                    <td>{formatIndianRupee(m.contributionTotal)}</td>
                    <td>{formatIndianRupee(m.expenseContributionTotal ?? 0)}</td>
                    <td>{formatIndianRupee(m.totalContribution ?? m.contributionTotal)}</td>
                    <td>{formatIndianRupee(m.routedToSunil)}</td>
                    <td>
                      {m.receivedOnPaperTotal != null
                        ? `${formatIndianRupee(m.receivedOnPaperTotal)} (${m.receivedOnPaperCount ?? 0} rows)`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="page-lead" style={{ marginTop: 16, fontSize: 13 }}>
            Contribution module (routed to bank): {formatIndianRupee(summary.totalContributions)} · {summary.entryCount}{" "}
            record(s). Expense (voucher paid totals by person):{" "}
            {formatIndianRupee(summary.totalExpenseContribution ?? 0)}. Combined:{" "}
            {formatIndianRupee(summary.totalContributionCombined ?? summary.totalContributions)}.
          </p>
        </div>
      ) : null}

      {tab === "entries" ? (
        <div className="card">
          <div className="card-header-row card-header-row--voucher-toolbar">
            <h3 className="panel-title">Contribution log</h3>
            <button className="btn" type="button" onClick={openCreateEntry}>
              Add contribution
            </button>
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
                    <td>{row.contributedAt ? new Date(row.contributedAt).toLocaleDateString() : "—"}</td>
                    <td>{row.member}</td>
                    <td>{formatIndianRupee(row.amount)}</td>
                    <td>{row.toPrimaryHolder || "—"}</td>
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
      ) : null}

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
                Record where this amount was credited on paper: choose <strong>Sunil</strong> or <strong>Shailendra</strong> and
                the channel used (UPI, bank transfer, cash, etc.).
              </p>
              <form className="grid section-stack voucher-modal-form" onSubmit={saveEntry}>
                <div>
                  <label htmlFor="ce-member">Contributor</label>
                  <select
                    id="ce-member"
                    className="input"
                    value={entryForm.member}
                    onChange={(e) => setEntryForm({ ...entryForm, member: e.target.value })}
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
                  <input
                    id="ce-amount"
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={entryForm.amount}
                    onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })}
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
