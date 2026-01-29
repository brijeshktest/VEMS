"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api.js";

const initialForm = {
  name: "",
  maxBagCapacity: "",
  powerBackupSource: ""
};

export default function GrowingRoomsPage() {
  const [rooms, setRooms] = useState([]);
  const [stages, setStages] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [roomData, stageData] = await Promise.all([apiFetch("/rooms"), apiFetch("/stages")]);
      setRooms(roomData);
      setStages(stageData);
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
        maxBagCapacity: Number(form.maxBagCapacity || 0),
        powerBackupSource: form.powerBackupSource
      };
      if (editingId) {
        await apiFetch(`/rooms/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch("/rooms", {
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

  function startEdit(room) {
    setEditingId(room._id);
    setForm({
      name: room.name || "",
      maxBagCapacity: room.maxBagCapacity?.toString?.() || "",
      powerBackupSource: room.powerBackupSource || ""
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function deleteRoom(roomId) {
    setError("");
    try {
      await apiFetch(`/rooms/${roomId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function moveToNextStage(roomId) {
    setError("");
    try {
      await apiFetch(`/rooms/${roomId}/move-stage`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function moveToStage(roomId, stageId) {
    setError("");
    try {
      await apiFetch(`/rooms/${roomId}/move-stage`, {
        method: "POST",
        body: JSON.stringify({ stageId })
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActivity(roomId, activity, done) {
    setError("");
    try {
      await apiFetch(`/rooms/${roomId}/activities`, {
        method: "POST",
        body: JSON.stringify({ activity, done })
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div>
        <h1>Growing Rooms</h1>
        <p>Manage pre-seeded rooms and their attributes.</p>
      </div>

      {error ? <div className="card">{error}</div> : null}

      <div className="card">
        <h3>{editingId ? "Edit Room" : "Add Room"}</h3>
        <form className="grid grid-3" onSubmit={onSubmit}>
          <div>
            <label>Room name</label>
            <input
              className="input"
              placeholder="Room name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label>Max bag capacity</label>
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              value={form.maxBagCapacity}
              onChange={(e) => setForm({ ...form, maxBagCapacity: e.target.value })}
              required
            />
          </div>
          <div>
            <label>Power backup source</label>
            <input
              className="input"
              placeholder="Power backup source"
              value={form.powerBackupSource}
              onChange={(e) => setForm({ ...form, powerBackupSource: e.target.value })}
            />
          </div>
          <button className="btn" type="submit">
            {editingId ? "Update Room" : "Save Room"}
          </button>
          {editingId ? (
            <button className="btn btn-secondary" type="button" onClick={cancelEdit}>
              Cancel
            </button>
          ) : null}
        </form>
      </div>

      <div className="card">
        <h3>Room List</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Max bag capacity</th>
              <th>Power backup</th>
              <th>Current stage</th>
              <th>Stage notes</th>
              <th>Activities</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room._id}>
                <td>{room.name}</td>
                <td>{room.maxBagCapacity}</td>
                <td>{room.powerBackupSource || "-"}</td>
                <td>{room.currentStageId?.name || "Not set"}</td>
                <td>{room.currentStageId?.notes || "-"}</td>
                <td>
                  {room.currentStageId?.activities ? (
                    <div className="grid" style={{ gap: 6 }}>
                      {["watering", "ruffling", "thumping"]
                        .filter((key) => room.currentStageId.activities[key])
                        .map((key) => (
                          <label key={key}>
                            <input
                              type="checkbox"
                              checked={Boolean(room.activityStatus?.[key])}
                              onChange={(e) => toggleActivity(room._id, key, e.target.checked)}
                            />{" "}
                            {key}
                          </label>
                        ))}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  <button className="btn btn-secondary" type="button" onClick={() => startEdit(room)}>
                    Edit
                  </button>{" "}
                  <button className="btn btn-secondary" type="button" onClick={() => moveToNextStage(room._id)}>
                    Move Stage
                  </button>{" "}
                  <button className="btn btn-secondary" type="button" onClick={() => deleteRoom(room._id)}>
                    Delete
                  </button>
                  <div style={{ marginTop: 8 }}>
                    <select
                      className="input"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          moveToStage(room._id, e.target.value);
                        }
                      }}
                    >
                      <option value="">Move to stage...</option>
                      {stages.map((stage) => (
                        <option key={stage._id} value={stage._id}>
                          {stage.sequenceOrder}. {stage.name}
                          {stage.notes ? ` - ${stage.notes}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
