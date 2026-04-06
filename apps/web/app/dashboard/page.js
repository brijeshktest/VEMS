"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import Link from "next/link";
import PageHeader from "../../components/PageHeader.js";

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [tax, setTax] = useState(null);
  const [roomPrompts, setRoomPrompts] = useState([]);
  const [roomSummary, setRoomSummary] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const permissionsData = await apiFetch("/auth/permissions");
        const [summaryData, vendorData, materialData, taxData] = await Promise.all([
          apiFetch("/reports/expenses"),
          apiFetch("/reports/vendor-expenses"),
          apiFetch("/reports/material-summary"),
          apiFetch("/reports/tax-payments")
        ]);
        setSummary(summaryData);
        setVendors(vendorData.slice(0, 5));
        setMaterials(materialData.slice(0, 5));
        setTax(taxData);
        const allowRoomStages =
          permissionsData.permissions === "all" ||
          permissionsData.permissions?.roomStages?.edit ||
          permissionsData.permissions?.roomStages?.view;
        if (allowRoomStages) {
          const roomData = await apiFetch("/rooms/status");
          setRoomPrompts(roomData.filter((room) => room.dueNextStage));
          setRoomSummary(roomData);
        } else {
          setRoomPrompts([]);
          setRoomSummary([]);
        }
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, []);

  async function moveRoom(roomId) {
    try {
      await apiFetch(`/rooms/${roomId}/move-stage`, {
        method: "POST",
        body: JSON.stringify({})
      });
      const roomData = await apiFetch("/rooms/status");
      setRoomPrompts(roomData.filter((room) => room.dueNextStage));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Spend, tax, and voucher activity at a glance. Jump to reports or vouchers for detail."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="grid grid-3">
        <Link className="stat-link" href="/reports">
          <div className="card stat-card">
            <span className="stat-label">Total spend</span>
            <span className="stat-value">{summary ? summary.totalSpend.toFixed(2) : "—"}</span>
            <span className="stat-hint">Open reports →</span>
          </div>
        </Link>
        <Link className="stat-link" href="/reports">
          <div className="card stat-card">
            <span className="stat-label">Total tax</span>
            <span className="stat-value">{summary ? summary.totalTax.toFixed(2) : "—"}</span>
            <span className="stat-hint">Open reports →</span>
          </div>
        </Link>
        <Link className="stat-link" href="/vouchers">
          <div className="card stat-card">
            <span className="stat-label">Vouchers</span>
            <span className="stat-value">{summary ? summary.voucherCount : "—"}</span>
            <span className="stat-hint">View vouchers →</span>
          </div>
        </Link>
      </div>

      {roomPrompts.length ? (
        <div className="card">
          <h3 className="panel-title">Room stage prompts</h3>
          <p className="page-lead" style={{ marginBottom: 16 }}>
            These rooms are due to advance to the next stage.
          </p>
          <div className="table-wrap">
            <table className="table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Current Stage</th>
                <th>Notes</th>
                <th>Next Stage</th>
                <th>Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {roomPrompts.map((room) => (
                <tr key={room.id} className="highlight-row">
                  <td>{room.name}</td>
                  <td>{room.currentStage?.name || "-"}</td>
                  <td>{room.currentStage?.notes || "-"}</td>
                  <td>{room.nextStage?.name || "-"}</td>
                  <td>{room.nextStage?.notes || "-"}</td>
                  <td>
                    <button className="btn btn-secondary" type="button" onClick={() => moveRoom(room.id)}>
                      Move to next stage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : null}

      {roomSummary.length ? (
        <div className="card">
          <h3 className="panel-title">Room operations summary</h3>
          <p className="page-lead" style={{ marginBottom: 16 }}>
            Current stage and timing across all growing rooms.
          </p>
          <div className="table-wrap">
            <table className="table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Current Stage</th>
                <th>Day</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {roomSummary.map((room) => (
                <tr key={room.id} className={room.dueNextStage ? "highlight-row" : ""}>
                  <td>{room.name}</td>
                  <td>{room.currentStage?.name || "-"}</td>
                  <td>{room.currentStage ? `Day ${room.daysElapsed}` : "-"}</td>
                  <td>{room.dueNextStage ? "Overdue" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : null}

      <div className="grid grid-2">
        <div className="card">
          <h3 className="panel-title">Top vendors</h3>
          <div className="table-wrap">
            <table className="table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Total Spend</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((row) => (
                <tr key={row._id}>
                  <td>{row.vendor?.name}</td>
                  <td>{row.totalSpend.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        <div className="card">
          <h3 className="panel-title">Top materials</h3>
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
              {materials.map((row) => (
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
      </div>

      <div className="card">
        <h3 className="panel-title">Payment summary</h3>
        {tax ? (
          <div className="panel-inset" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="grid grid-2">
              <div>
                <p className="tag">Total (incl. tax): {tax.tax.totalPayable.toFixed(2)}</p>
                <p className="tag">Tax: {tax.tax.totalTax.toFixed(2)}</p>
              </div>
              <div>
                <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Payment status</h4>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                  {(tax.paymentStatus || []).map((row) => (
                    <li key={row._id ?? "unknown"}>
                      {row._id}: {row.total.toFixed(2)} ({row.count} vouchers)
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div>
              <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Vendor-wise spend and tax</h4>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th>Vouchers</th>
                      <th>Tax</th>
                      <th>Total (incl. tax)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tax.vendorPayments || []).length ? (
                      (tax.vendorPayments || []).map((row) => (
                        <tr key={String(row._id)}>
                          <td>{row.vendor?.name || "—"}</td>
                          <td>{row.voucherCount}</td>
                          <td>{row.totalTax.toFixed(2)}</td>
                          <td>{row.totalPayable.toFixed(2)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4}>
                          <span className="page-lead" style={{ margin: 0 }}>
                            No vouchers in range.
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Voucher-wise (latest 30)</h4>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Vendor</th>
                      <th>Total (incl. tax)</th>
                      <th>Tax</th>
                      <th>Status</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tax.voucherPayments || []).length ? (
                      (tax.voucherPayments || []).map((row) => (
                        <tr key={String(row._id)}>
                          <td>{new Date(row.dateOfPurchase).toLocaleDateString()}</td>
                          <td>{row.vendorName || "—"}</td>
                          <td>{row.finalAmount.toFixed(2)}</td>
                          <td>{row.taxAmount.toFixed(2)}</td>
                          <td>{row.paymentStatus}</td>
                          <td>{row.paymentMethod}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6}>
                          <span className="page-lead" style={{ margin: 0 }}>
                            No vouchers in range.
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <p className="page-lead">Loading payment data…</p>
        )}
      </div>
    </div>
  );
}
