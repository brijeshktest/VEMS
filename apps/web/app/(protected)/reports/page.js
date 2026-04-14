"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api.js";
import PageHeader from "../../../components/PageHeader.js";
import { formatIndianRupee } from "../../../lib/formatIndianRupee.js";

export default function ReportsPage() {
  const [range, setRange] = useState({ start: "", end: "" });
  const [vendorData, setVendorData] = useState([]);
  const [materialData, setMaterialData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [taxData, setTaxData] = useState(null);
  const [paymentByPerson, setPaymentByPerson] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async (rangeArg) => {
    setError("");
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (rangeArg.start) query.set("start", rangeArg.start);
      if (rangeArg.end) query.set("end", rangeArg.end);
      const qs = query.toString() ? `?${query.toString()}` : "";
      const [vendors, materials, expenseSummary, tax, paidByAgg] = await Promise.all([
        apiFetch(`/reports/vendor-expenses${qs}`),
        apiFetch(`/reports/material-summary${qs}`),
        apiFetch(`/reports/expenses${qs}`),
        apiFetch(`/reports/tax-payments${qs}`),
        apiFetch(`/reports/payment-made-from-aggregate${qs}`)
      ]);
      setVendorData(vendors);
      setMaterialData(materials);
      setSummary(expenseSummary);
      setTaxData(tax);
      setPaymentByPerson(Array.isArray(paidByAgg) ? paidByAgg : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReports({ start: "", end: "" });
  }, [fetchReports]);

  function applyDateFilter() {
    void fetchReports(range);
  }

  function clearDatesAndShowAll() {
    setRange({ start: "", end: "" });
    void fetchReports({ start: "", end: "" });
  }

  return (
    <div className="page-stack reports-page">
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        description="Totals load for all purchase dates by default. Optionally set From / To purchase dates and apply to narrow vendor, material, tax, and payment rollups."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card toolbar-card">
        <div className="toolbar-field">
          <label htmlFor="report-start">From</label>
          <input
            id="report-start"
            className="input"
            type="date"
            value={range.start}
            onChange={(e) => setRange({ ...range, start: e.target.value })}
          />
        </div>
        <div className="toolbar-field">
          <label htmlFor="report-end">To</label>
          <input
            id="report-end"
            className="input"
            type="date"
            value={range.end}
            onChange={(e) => setRange({ ...range, end: e.target.value })}
          />
        </div>
        <button className="btn" type="button" onClick={applyDateFilter} disabled={loading}>
          Apply date filter
        </button>
        <button className="btn btn-secondary" type="button" onClick={clearDatesAndShowAll} disabled={loading}>
          Show all dates
        </button>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 className="panel-title">Vendor-wise expense</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Voucher amount</th>
                  <th>Paid amount</th>
                  <th>Vouchers</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="cell-empty">
                      Loading…
                    </td>
                  </tr>
                ) : vendorData.length ? (
                  vendorData.map((row) => (
                    <tr key={row._id}>
                      <td>{row.vendor?.name}</td>
                      <td>{formatIndianRupee(row.totalVoucherAmount)}</td>
                      <td>{formatIndianRupee(row.totalPaidAmount)}</td>
                      <td>{row.voucherCount}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="cell-empty">
                      No voucher data in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3 className="panel-title">Material-wise summary</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Quantity</th>
                  <th>Paid amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="cell-empty">
                      Loading…
                    </td>
                  </tr>
                ) : materialData.length ? (
                  materialData.map((row) => (
                    <tr key={row._id}>
                      <td>{row.material?.name}</td>
                      <td>
                        {row.totalQuantity}
                        {row.material?.unit ? ` ${String(row.material.unit).trim()}` : ""}
                      </td>
                      <td>{formatIndianRupee(row.totalSpend)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="cell-empty">
                      No voucher data in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="panel-title">Payment made from (paid vouchers only)</h3>
        <p className="page-lead">
          Totals use vouchers with status <strong>Paid</strong>
          {range.start || range.end ? " in the selected purchase date range" : " (all purchase dates)"}, grouped by who the
          payment came from.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Payment made from</th>
                <th>Total paid amount</th>
                <th>Voucher count</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="cell-empty">
                    Loading…
                  </td>
                </tr>
              ) : paymentByPerson.length ? (
                paymentByPerson.map((row) => (
                  <tr key={row.paymentMadeBy}>
                    <td>{row.paymentMadeBy}</td>
                    <td>{formatIndianRupee(row.totalPaidAmount)}</td>
                    <td>{row.voucherCount}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="cell-empty">
                    No paid vouchers with a payer in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 className="panel-title">Expense summary</h3>
          {loading ? (
            <p className="page-lead">Loading…</p>
          ) : summary ? (
            <div className="panel-inset panel-inset--strong totals-list">
              <p className="totals-item">
                <strong>Total voucher amount:</strong> {formatIndianRupee(summary.totalVoucherAmount)}
              </p>
              <p className="totals-item">
                <strong>Total paid amount:</strong> {formatIndianRupee(summary.totalPaidAmount)}
              </p>
              <p className="totals-item">
                <strong>Total tax:</strong> {formatIndianRupee(summary.totalTax)}
              </p>
              <p className="totals-item">
                <strong>Voucher count:</strong> {summary.voucherCount}
              </p>
            </div>
          ) : (
            <p className="page-lead">No expense data in this range.</p>
          )}
        </div>
        <div className="card">
          <h3 className="panel-title">Tax and payment summary</h3>
          {loading ? (
            <p className="page-lead">Loading…</p>
          ) : taxData ? (
            <div className="panel-inset panel-inset--strong totals-list">
              <p className="totals-item">
                <strong>Total tax:</strong> {formatIndianRupee(taxData.tax.totalTax)}
              </p>
              <p className="totals-item">
                <strong>Total voucher amount:</strong> {formatIndianRupee(taxData.tax.totalVoucherAmount)}
              </p>
              <p className="totals-item">
                <strong>Total paid amount:</strong> {formatIndianRupee(taxData.tax.totalPaidAmount)}
              </p>
            </div>
          ) : (
            <p className="page-lead">No tax or payment data in this range.</p>
          )}
        </div>
      </div>
    </div>
  );
}
