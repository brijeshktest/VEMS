"use client";

import { useState } from "react";
import { apiFetch } from "../../lib/api.js";
import PageHeader from "../../components/PageHeader.js";

export default function ReportsPage() {
  const [range, setRange] = useState({ start: "", end: "" });
  const [vendorData, setVendorData] = useState([]);
  const [materialData, setMaterialData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [taxData, setTaxData] = useState(null);
  const [error, setError] = useState("");

  async function runReports() {
    setError("");
    try {
      const query = new URLSearchParams();
      if (range.start) query.set("start", range.start);
      if (range.end) query.set("end", range.end);
      const qs = query.toString() ? `?${query.toString()}` : "";
      const [vendors, materials, expenseSummary, tax] = await Promise.all([
        apiFetch(`/reports/vendor-expenses${qs}`),
        apiFetch(`/reports/material-summary${qs}`),
        apiFetch(`/reports/expenses${qs}`),
        apiFetch(`/reports/tax-payments${qs}`)
      ]);
      setVendorData(vendors);
      setMaterialData(materials);
      setSummary(expenseSummary);
      setTaxData(tax);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        description="Filter by purchase date, then refresh vendor spend, material usage, and tax and payment rollups."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card toolbar-card">
        <div style={{ flex: "1 1 200px" }}>
          <label htmlFor="report-start">From</label>
          <input
            id="report-start"
            className="input"
            type="date"
            value={range.start}
            onChange={(e) => setRange({ ...range, start: e.target.value })}
          />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label htmlFor="report-end">To</label>
          <input
            id="report-end"
            className="input"
            type="date"
            value={range.end}
            onChange={(e) => setRange({ ...range, end: e.target.value })}
          />
        </div>
        <button className="btn" type="button" onClick={runReports}>
          Run reports
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
                  <th>Total</th>
                  <th>Vouchers</th>
                </tr>
              </thead>
              <tbody>
                {vendorData.length ? (
                  vendorData.map((row) => (
                    <tr key={row._id}>
                      <td>{row.vendor?.name}</td>
                      <td>{row.totalSpend.toFixed(2)}</td>
                      <td>{row.voucherCount}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} style={{ color: "var(--muted)" }}>
                      Run reports to load data.
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
                  <th>Spend (incl. tax)</th>
                </tr>
              </thead>
              <tbody>
                {materialData.length ? (
                  materialData.map((row) => (
                    <tr key={row._id}>
                      <td>{row.material?.name}</td>
                      <td>{row.totalQuantity}</td>
                      <td>{row.totalSpend.toFixed(2)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} style={{ color: "var(--muted)" }}>
                      Run reports to load data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 className="panel-title">Expense summary</h3>
          {summary ? (
            <div className="panel-inset">
              <p style={{ margin: "0 0 8px", fontSize: 14 }}>
                <strong>Total spend:</strong> {summary.totalSpend.toFixed(2)}
              </p>
              <p style={{ margin: "0 0 8px", fontSize: 14 }}>
                <strong>Total tax:</strong> {summary.totalTax.toFixed(2)}
              </p>
              <p style={{ margin: 0, fontSize: 14 }}>
                <strong>Voucher count:</strong> {summary.voucherCount}
              </p>
            </div>
          ) : (
            <p className="page-lead">Run reports to see totals for the selected range.</p>
          )}
        </div>
        <div className="card">
          <h3 className="panel-title">Tax and payment summary</h3>
          {taxData ? (
            <div className="panel-inset">
              <p style={{ margin: "0 0 8px", fontSize: 14 }}>
                <strong>Total tax:</strong> {taxData.tax.totalTax.toFixed(2)}
              </p>
              <p style={{ margin: 0, fontSize: 14 }}>
                <strong>Total (incl. tax):</strong> {taxData.tax.totalPayable.toFixed(2)}
              </p>
            </div>
          ) : (
            <p className="page-lead">Run reports to see payment rollups.</p>
          )}
        </div>
      </div>
    </div>
  );
}
