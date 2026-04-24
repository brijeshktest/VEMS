"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api.js";
import {
  canAccessTunnelOps,
  canCreateTunnelBatch,
  canEditTunnelBatch
} from "../../../lib/modulePermissions.js";
import PageHeader from "../../../components/PageHeader.js";

const newBatchDefault = { batchCode: "", compostType: "Mushroom compost", notes: "" };

function ConfiguredFlowLead({ config }) {
  const bunkerPhaseDays = config.bunkerCount * config.bunkerIntervalDays;
  const totalCycleDays = bunkerPhaseDays + config.tunnelIntervalDays;
  return (
    <p className="page-lead">
      {config.bunkerCount} bunkers × {config.bunkerIntervalDays} day(s) = {bunkerPhaseDays} day(s) in bunkers, then 1
      tunnel × {config.tunnelIntervalDays} day(s). Total cycle {totalCycleDays} day(s). Compost is then ready and
      shifted to growing rooms.
      {config.tunnelCount > 1 ? (
        <>
          {" "}
          The site has {config.tunnelCount} tunnel line(s) for parallel batches; each batch still occupies only one
          tunnel before growing rooms.
        </>
      ) : null}
    </p>
  );
}

export default function TunnelBunkerOpsPage() {
  const router = useRouter();
  const [config, setConfig] = useState(null);
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState(newBatchDefault);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tunnelSelections, setTunnelSelections] = useState({});
  const [perm, setPerm] = useState(null);
  const [plantModuleKeys, setPlantModuleKeys] = useState(null);

  async function load() {
    try {
      const permData = await apiFetch("/auth/permissions").catch(() => ({ permissions: {} }));
      const p = permData.permissions;
      const pk =
        Array.isArray(permData.plantModuleKeys) && permData.plantModuleKeys.length > 0
          ? permData.plantModuleKeys
          : null;
      setPerm(p);
      setPlantModuleKeys(pk);
      if (!canAccessTunnelOps(p, pk)) {
        router.replace("/dashboard");
        return;
      }
      const data = await apiFetch("/tunnel-bunker/batches");
      setConfig(data.config);
      setBatches(data.batches || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createBatch(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await apiFetch("/tunnel-bunker/batches", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setForm(newBatchDefault);
      setMessage("Batch started in Bunker 1.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function moveNext(batch) {
    setError("");
    setMessage("");
    try {
      const payload = {};
      if (batch.requiresTunnelSelection) {
        const selected = Number(tunnelSelections[batch.id]);
        payload.tunnelNumber = selected;
      }
      await apiFetch(`/tunnel-bunker/batches/${batch.id}/move-next`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setMessage("Batch moved to next stage.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function autoAdvanceDue() {
    setError("");
    setMessage("");
    try {
      const data = await apiFetch("/tunnel-bunker/auto-advance", {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage(`Auto-advance complete. ${data.moved || 0} batch(es) moved.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const active = batches.filter((batch) => batch.status === "active");
  const shifted = batches.filter((batch) => batch.status !== "active");

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operations"
        title="Tunnel & Bunker Ops"
        description="Track compost through the bunker chain, then a single tunnel stay per batch, then growing rooms, with due-time movement alerts."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      {config ? (
        <div className="card">
          <h3 className="panel-title">Configured flow</h3>
          <ConfiguredFlowLead config={config} />
        </div>
      ) : null}

      {perm != null && canCreateTunnelBatch(perm, plantModuleKeys) ? (
      <div className="card">
        <h3 className="panel-title">Start new compost batch</h3>
        <form className="grid grid-3" onSubmit={createBatch}>
          <div>
            <label>Batch code</label>
            <input
              className="input"
              placeholder="e.g. MC-2026-0410-A"
              value={form.batchCode}
              onChange={(e) => setForm((prev) => ({ ...prev, batchCode: e.target.value }))}
              required
            />
          </div>
          <div>
            <label>Compost type</label>
            <input
              className="input"
              value={form.compostType}
              onChange={(e) => setForm((prev) => ({ ...prev, compostType: e.target.value }))}
            />
          </div>
          <div>
            <label>Notes</label>
            <input
              className="input"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          <button className="btn" type="submit">
            Start batch
          </button>
          {canEditTunnelBatch(perm, plantModuleKeys) ? (
            <button className="btn btn-secondary" type="button" onClick={() => void autoAdvanceDue()}>
              Run auto-advance now
            </button>
          ) : null}
        </form>
      </div>
      ) : null}

      <div className="card card-soft">
        <h3 className="panel-title">Active batches</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Current stage</th>
                  <th>Tunnel selection</th>
                <th>Day</th>
                <th>Due at</th>
                <th>Status</th>
                <th>Next stage</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {active.length ? (
                active.map((batch) => (
                  <tr key={batch.id} className={batch.due ? "highlight-row" : ""}>
                    <td>{batch.batchCode}</td>
                    <td>{batch.currentStageLabel}</td>
                    <td>
                      {batch.requiresTunnelSelection ? (
                        <select
                          className="input"
                          value={tunnelSelections[batch.id] || ""}
                          onChange={(e) =>
                            setTunnelSelections((prev) => ({
                              ...prev,
                              [batch.id]: e.target.value
                            }))
                          }
                        >
                          <option value="">Select tunnel</option>
                          {(batch.availableTunnels || []).map((item) => (
                            <option key={item.tunnelNumber} value={item.tunnelNumber} disabled={item.occupied}>
                              Tunnel {item.tunnelNumber}
                              {item.occupied ? ` (occupied by ${item.occupiedByBatchCode})` : " (available)"}
                            </option>
                          ))}
                        </select>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>Day {batch.daysElapsed}</td>
                    <td>{batch.dueAt ? new Date(batch.dueAt).toLocaleString() : "-"}</td>
                    <td>
                      <span className={batch.due ? "status-pill status-pill--pending" : "status-pill status-pill--active"}>
                        {batch.due ? "Due" : `In ${batch.daysRemaining} day(s)`}
                      </span>
                    </td>
                    <td>{batch.nextStageLabel}</td>
                    <td>
                      {perm != null && canEditTunnelBatch(perm, plantModuleKeys) ? (
                        <button className="btn btn-secondary" type="button" onClick={() => moveNext(batch)}>
                          Move next
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>No active compost batches.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="panel-title">Shifted to growing room</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Shifted at</th>
              </tr>
            </thead>
            <tbody>
              {shifted.length ? (
                shifted.map((batch) => (
                  <tr key={batch.id}>
                    <td>{batch.batchCode}</td>
                    <td>{batch.shiftedToGrowingRoomAt ? new Date(batch.shiftedToGrowingRoomAt).toLocaleString() : "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2}>No shifted batches yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
