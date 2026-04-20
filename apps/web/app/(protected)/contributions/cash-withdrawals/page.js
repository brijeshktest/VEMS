"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../../../lib/api.js";
import PageHeader from "../../../../components/PageHeader.js";
import { formatIndianRupee } from "../../../../lib/formatIndianRupee.js";
import IndianAmountField from "../../../../components/IndianAmountField.js";

const initialWithdrawalForm = {
  withdrawnAt: new Date().toISOString().slice(0, 10),
  amount: null,
  notes: ""
};

export default function CashWithdrawalsPage() {
  const [rows, setRows] = useState([]);
  const [totalWithdrawal, setTotalWithdrawal] = useState(0);
  const [totalCashSpent, setTotalCashSpent] = useState(0);
  const [cashInHand, setCashInHand] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(initialWithdrawalForm);
  const [canCreate, setCanCreate] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [permData, data] = await Promise.all([
        apiFetch("/auth/permissions").catch(() => ({ permissions: {} })),
        apiFetch("/contributions/cash-withdrawals")
      ]);
      const p = permData.permissions;
      const all = p === "all";
      setCanCreate(all || Boolean(p?.contributions?.create));
      if (Array.isArray(data)) {
        setRows(data);
        setTotalWithdrawal(data.reduce((s, r) => s + (Number(r.amount) || 0), 0));
        setTotalCashSpent(0);
        setCashInHand(0);
      } else {
        setRows(Array.isArray(data.entries) ? data.entries : []);
        setTotalWithdrawal(Number(data.totalWithdrawal) || 0);
        setTotalCashSpent(Number(data.totalCashSpent) || 0);
        setCashInHand(Number(data.cashInHand) || 0);
      }
    } catch (err) {
      setError(err.message);
      setRows([]);
      setTotalWithdrawal(0);
      setTotalCashSpent(0);
      setCashInHand(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openAddModal() {
    setMessage("");
    setForm({
      ...initialWithdrawalForm,
      withdrawnAt: new Date().toISOString().slice(0, 10)
    });
    setModalOpen(true);
  }

  async function submitWithdrawal(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    const amount = form.amount;
    if (amount == null || !Number.isFinite(amount) || amount < 0) {
      setError("Amount must be a valid non-negative number.");
      return;
    }
    try {
      await apiFetch("/contributions/cash-withdrawals", {
        method: "POST",
        body: JSON.stringify({
          withdrawnAt: form.withdrawnAt,
          amount,
          notes: form.notes.trim()
        })
      });
      setModalOpen(false);
      setMessage("Withdrawal recorded.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Internal"
        title="Cash withdrawals"
        description="Record cash taken out of the contribution bank view, newest withdrawal first. Dashlets compare withdrawals to paid vouchers (Company Account + Cash paid-by mode) from expenses."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <section className="saas-section" aria-label="Cash withdrawal summary">
        <div className="dashboard-expense-dashlets">
          <div className="card stat-card stat-dashlet">
            <div className="stat-dashlet__body">
              <span className="stat-label">Total withdrawal</span>
              <span className="stat-value">{formatIndianRupee(totalWithdrawal)}</span>
              <span className="stat-hint">Sum of all withdrawal entries</span>
            </div>
          </div>
          <div className="card stat-card stat-dashlet">
            <div className="stat-dashlet__body">
              <span className="stat-label">Total cash spent</span>
              <span className="stat-value">{formatIndianRupee(totalCashSpent)}</span>
              <span className="stat-hint">Paid vouchers · Payment from Company Account · Paid by mode Cash</span>
            </div>
          </div>
          <div className="card stat-card stat-dashlet">
            <div className="stat-dashlet__body">
              <span className="stat-label">Cash in hand</span>
              <span className="stat-value">{formatIndianRupee(cashInHand)}</span>
              <span className="stat-hint">Total withdrawal − total cash spent</span>
            </div>
          </div>
        </div>
      </section>

      <div className="card">
        <div className="card-header-row card-header-row--voucher-toolbar">
          <h3 className="panel-title">Withdrawal log</h3>
          <div className="voucher-table-toolbar-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/contributions" className="btn btn-secondary">
              ← Contributions
            </Link>
            <button className="btn" type="button" onClick={openAddModal} disabled={!canCreate}>
              Add new withdrawal
            </button>
          </div>
        </div>
        {!canCreate ? (
          <p className="page-lead text-muted" style={{ marginBottom: 12, fontSize: 13 }}>
            You need <strong>contributions → create</strong> permission to add withdrawals.
          </p>
        ) : null}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Information</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="cell-empty">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="cell-empty">
                    No withdrawals yet. Use <strong>Add new withdrawal</strong> to create one.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={String(row._id)}>
                    <td>{row.withdrawnAt ? new Date(row.withdrawnAt).toLocaleDateString() : "—"}</td>
                    <td>{formatIndianRupee(row.amount)}</td>
                    <td>{row.notes?.trim() ? row.notes : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <div
          className="voucher-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="voucher-modal-dialog" role="dialog" aria-modal="true" onClick={(ev) => ev.stopPropagation()}>
            <div className="voucher-modal-header">
              <h3 className="voucher-modal-title">Add cash withdrawal</h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body">
              <form className="grid section-stack voucher-modal-form" onSubmit={submitWithdrawal}>
                <div>
                  <label htmlFor="cw-date">Withdrawal date</label>
                  <input
                    id="cw-date"
                    className="input"
                    type="date"
                    value={form.withdrawnAt}
                    onChange={(e) => setForm({ ...form, withdrawnAt: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="cw-amount">Amount (Rs)</label>
                  <IndianAmountField
                    id="cw-amount"
                    className="input"
                    value={form.amount}
                    onChange={(n) => setForm({ ...form, amount: n })}
                    placeholder="e.g. 25,000"
                    required
                  />
                </div>
                <div className="form-span-all">
                  <label htmlFor="cw-notes">Withdrawal information</label>
                  <textarea
                    id="cw-notes"
                    className="input"
                    rows={4}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Purpose, payee, reference, etc."
                  />
                </div>
                <div className="form-span-all" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn" type="submit">
                    Save withdrawal
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={() => setModalOpen(false)}>
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
