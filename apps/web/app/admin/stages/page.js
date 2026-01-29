"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api.js";

const initialForm = {
  name: "",
  sequenceOrder: "",
  intervalDays: "",
  humidity: "",
  temperature: "",
  co2Level: "",
  notes: "",
  activities: {
    watering: false,
    ruffling: false,
    thumping: false
  }
};

export default function StagesPage() {
  const [stages, setStages] = useState([]);
  const [summary, setSummary] = useState({ totalDays: 0, isValid: false });
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [stageData, summaryData] = await Promise.all([
        apiFetch("/stages"),
        apiFetch("/stages/summary")
      ]);
      setStages(stageData);
      setSummary(summaryData);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      const payload = {
        name: form.name,
        sequenceOrder: Number(form.sequenceOrder),
        intervalDays: Number(form.intervalDays),
        humidity: Number(form.humidity || 0),
        temperature: Number(form.temperature || 0),
        co2Level: Number(form.co2Level || 0),
        notes: form.notes,
        activities: form.activities
      };
      if (editingId) {
        await apiFetch(`/stages/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch("/stages", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      setForm(initialForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(stage) {
    setEditingId(stage._id);
    setForm({
      name: stage.name || "",
      sequenceOrder: stage.sequenceOrder?.toString?.() || "",
      intervalDays: stage.intervalDays?.toString?.() || "",
      humidity: stage.humidity?.toString?.() || "",
      temperature: stage.temperature?.toString?.() || "",
      co2Level: stage.co2Level?.toString?.() || "",
      notes: stage.notes || "",
      activities: {
        watering: Boolean(stage.activities?.watering),
        ruffling: Boolean(stage.activities?.ruffling),
        thumping: Boolean(stage.activities?.thumping)
      }
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function deleteStage(stageId) {
    setError("");
    try {
      await apiFetch(`/stages/${stageId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleActivity(key) {
    setForm((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [key]: !prev.activities[key]
      }
    }));
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div>
        <h1>Room Stages</h1>
        <p>Define stage order, duration, and activities for the 60-day cycle.</p>
      </div>

      {error ? <div className="card">{error}</div> : null}

      <div className="card">
        <h3>Cycle Summary</h3>
        <p>
          Total days: <strong>{summary.totalDays}</strong>{" "}
          {summary.isValid ? "(valid cycle)" : "(target 60 days)"}
        </p>
      </div>

      <div className="card">
        <h3>{editingId ? "Edit Stage" : "Create Stage"}</h3>
        <form className="grid grid-3" onSubmit={onSubmit}>
          <div>
            <label>Stage name</label>
            <input
              className="input"
              placeholder="Stage name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label>Sequence order</label>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={form.sequenceOrder}
              onChange={(e) => setForm({ ...form, sequenceOrder: e.target.value })}
              required
            />
          </div>
          <div>
            <label>Interval (days)</label>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={form.intervalDays}
              onChange={(e) => setForm({ ...form, intervalDays: e.target.value })}
              required
            />
          </div>
          <div>
            <label>Humidity (%)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.1"
              value={form.humidity}
              onChange={(e) => setForm({ ...form, humidity: e.target.value })}
            />
          </div>
          <div>
            <label>Temperature (°C)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.1"
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: e.target.value })}
            />
          </div>
          <div>
            <label>CO2 Level (ppm)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.1"
              value={form.co2Level}
              onChange={(e) => setForm({ ...form, co2Level: e.target.value })}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Notes</label>
            <textarea
              className="input"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Add stage notes..."
            />
          </div>
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <h4>Activities</h4>
            <div className="grid grid-3">
              <label>
                <input
                  type="checkbox"
                  checked={form.activities.watering}
                  onChange={() => toggleActivity("watering")}
                />{" "}
                Watering
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.activities.ruffling}
                  onChange={() => toggleActivity("ruffling")}
                />{" "}
                Ruffling
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.activities.thumping}
                  onChange={() => toggleActivity("thumping")}
                />{" "}
                Thumping
              </label>
            </div>
          </div>
          <button className="btn" type="submit">
            {editingId ? "Update Stage" : "Save Stage"}
          </button>
          {editingId ? (
            <button className="btn btn-secondary" type="button" onClick={cancelEdit}>
              Cancel
            </button>
          ) : null}
        </form>
      </div>

      <div className="card">
        <h3>Stage List</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Order</th>
              <th>Interval</th>
              <th>Humidity</th>
              <th>Temperature</th>
              <th>CO2</th>
              <th>Notes</th>
              <th>Activities</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <tr key={stage._id}>
                <td>{stage.name}</td>
                <td>{stage.sequenceOrder}</td>
                <td>{stage.intervalDays} days</td>
                <td>{stage.humidity ?? 0}%</td>
                <td>{stage.temperature ?? 0}°C</td>
                <td>{stage.co2Level ?? 0} ppm</td>
                <td>{stage.notes || "-"}</td>
                <td>
                  {["watering", "ruffling", "thumping"].filter((key) => stage.activities?.[key]).join(", ") || "-"}
                </td>
                <td>
                  <button className="btn btn-secondary" type="button" onClick={() => startEdit(stage)}>
                    Edit
                  </button>{" "}
                  <button className="btn btn-secondary" type="button" onClick={() => deleteStage(stage._id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
