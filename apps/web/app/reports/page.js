"use client";

import { useState } from "react";
import { apiFetch } from "../../lib/api.js";

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
    <div className="grid" style={{ gap: 24 }}>
      <div>
        <h1>Reports</h1>
        <p>Vendor-wise and material-wise summaries with date filters.</p>
      </div>

      {error ? <div className="card">{error}</div> : null}

      <div className="card grid grid-3">
        <input
          className="input"
          type="date"
          value={range.start}
          onChange={(e) => setRange({ ...range, start: e.target.value })}
        />
        <input
          className="input"
          type="date"
          value={range.end}
          onChange={(e) => setRange({ ...range, end: e.target.value })}
        />
        <button className="btn" onClick={runReports}>
          Run Reports
        </button>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Vendor-wise Expense</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Total</th>
                <th>Vouchers</th>
              </tr>
            </thead>
            <tbody>
              {vendorData.map((row) => (
                <tr key={row._id}>
                  <td>{row.vendor?.name}</td>
                  <td>{row.totalSpend.toFixed(2)}</td>
                  <td>{row.voucherCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Material-wise Summary</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Quantity</th>
                <th>Spend</th>
              </tr>
            </thead>
            <tbody>
              {materialData.map((row) => (
                <tr key={row._id}>
                  <td>{row.material?.name}</td>
                  <td>{row.totalQuantity}</td>
                  <td>{row.totalSpend.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Expense Summary</h3>
          {summary ? (
            <>
              <p>Total Spend: {summary.totalSpend.toFixed(2)}</p>
              <p>Total Tax: {summary.totalTax.toFixed(2)}</p>
              <p>Voucher Count: {summary.voucherCount}</p>
            </>
          ) : (
            <p>Run a report to see summary.</p>
          )}
        </div>
        <div className="card">
          <h3>Tax & Payment Summary</h3>
          {taxData ? (
            <>
              <p>Total Tax: {taxData.tax.totalTax.toFixed(2)}</p>
              <p>Total Payable: {taxData.tax.totalPayable.toFixed(2)}</p>
            </>
          ) : (
            <p>Run a report to see payment totals.</p>
          )}
        </div>
      </div>
    </div>
  );
}
