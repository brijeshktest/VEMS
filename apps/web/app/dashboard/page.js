"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";

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
    <div className="grid" style={{ gap: 24 }}>
      <div>
        <h1>Dashboard</h1>
        <p>Overview of spend, vendors, materials, and tax totals.</p>
      </div>

      {error ? <div className="card">{error}</div> : null}

      <div className="grid grid-3">
        <div className="card">
          <h3>Total Spend</h3>
          <p>{summary ? summary.totalSpend.toFixed(2) : "-"}</p>
        </div>
        <div className="card">
          <h3>Total Tax</h3>
          <p>{summary ? summary.totalTax.toFixed(2) : "-"}</p>
        </div>
        <div className="card">
          <h3>Vouchers</h3>
          <p>{summary ? summary.voucherCount : "-"}</p>
        </div>
      </div>

      {roomPrompts.length ? (
        <div className="card">
          <h3>Room Stage Prompts</h3>
          <p>These rooms have reached the end of their current stage.</p>
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
      ) : null}

      {roomSummary.length ? (
        <div className="card">
          <h3>Room Ops Summary</h3>
          <p>Current stage status across all rooms.</p>
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
      ) : null}

      <div className="grid grid-2">
        <div className="card">
          <h3>Top Vendors</h3>
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
        <div className="card">
          <h3>Top Materials</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Quantity</th>
                <th>Spend</th>
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

      <div className="card">
        <h3>Payment Summary</h3>
        {tax ? (
          <div className="grid grid-2">
            <div>
              <p className="tag">Total Payable: {tax.tax.totalPayable.toFixed(2)}</p>
              <p className="tag">Total Tax: {tax.tax.totalTax.toFixed(2)}</p>
            </div>
            <div>
              <h4>Payment Status</h4>
              <ul>
                {tax.paymentStatus.map((row) => (
                  <li key={row._id}>
                    {row._id}: {row.total.toFixed(2)} ({row.count})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p>Loading...</p>
        )}
      </div>
    </div>
  );
}
