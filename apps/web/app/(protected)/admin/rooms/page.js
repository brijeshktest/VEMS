"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../../../lib/api.js";
import PageHeader from "../../../../components/PageHeader.js";
import { EditIconButton, DeleteIconButton } from "../../../../components/EditDeleteIconButtons.js";
import { useConfirmDialog } from "../../../../components/ConfirmDialog.js";

const RESOURCE_TYPES = ["Lagoon", "Tunnel", "Bunker", "Room"];

const initialForm = {
  resourceType: "Room",
  name: "",
  capacityTons: "",
  powerBackupSource: "",
  locationInPlant: "",
  coordinateX: "",
  coordinateY: ""
};

function capacityTonsDisplay(room) {
  if (room.capacityTons != null) return room.capacityTons;
  return room.maxBagCapacity ?? "-";
}

function coordinatesDisplay(room) {
  const hasX = room.coordinateX != null && !Number.isNaN(Number(room.coordinateX));
  const hasY = room.coordinateY != null && !Number.isNaN(Number(room.coordinateY));
  if (hasX && hasY) return `${room.coordinateX}, ${room.coordinateY}`;
  if (hasX) return `${room.coordinateX}, —`;
  if (hasY) return `—, ${room.coordinateY}`;
  return "—";
}

export default function GrowingRoomsPage() {
  const [rooms, setRooms] = useState([]);
  const [stages, setStages] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const { confirm, dialog } = useConfirmDialog();

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
        resourceType: form.resourceType,
        capacityTons: Number(form.capacityTons || 0),
        powerBackupSource: form.powerBackupSource,
        locationInPlant: form.locationInPlant,
        coordinateX: form.coordinateX,
        coordinateY: form.coordinateY
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
      resourceType: RESOURCE_TYPES.includes(room.resourceType) ? room.resourceType : "Room",
      name: room.name || "",
      capacityTons:
        room.capacityTons != null
          ? String(room.capacityTons)
          : room.maxBagCapacity != null
            ? String(room.maxBagCapacity)
            : "",
      powerBackupSource: room.powerBackupSource || "",
      locationInPlant: room.locationInPlant || "",
      coordinateX:
        room.coordinateX != null && !Number.isNaN(Number(room.coordinateX))
          ? String(room.coordinateX)
          : "",
      coordinateY:
        room.coordinateY != null && !Number.isNaN(Number(room.coordinateY))
          ? String(room.coordinateY)
          : ""
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function deleteRoom(room) {
    const label = (room.name || "").trim() || "this resource";
    const ok = await confirm({
      title: "Delete resource?",
      message: `Remove “${label}”? Related growing data may be affected. This cannot be undone.`
    });
    if (!ok) return;
    const roomId = room._id;
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
    <div className="page-stack">
      {dialog}
      <PageHeader
        eyebrow="Administration"
        title="Plant resources"
        description="Create lagoons, tunnels, bunkers, and growing rooms with capacity, backup power, plant location, and optional map coordinates. Stage and activity controls apply to all resource records."
      >
        <Link href="/admin" className="btn btn-ghost">
          ← Admin home
        </Link>
      </PageHeader>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <h3 className="panel-title">{editingId ? "Edit resource" : "Create plant resource"}</h3>
        <form className="grid grid-3" onSubmit={onSubmit}>
          <div>
            <label>Resource type</label>
            <select
              className="input"
              value={form.resourceType}
              onChange={(e) => setForm({ ...form, resourceType: e.target.value })}
              required
            >
              {RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Name</label>
            <input
              className="input"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label>Capacity (tons)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={form.capacityTons}
              onChange={(e) => setForm({ ...form, capacityTons: e.target.value })}
              required
            />
          </div>
          <div>
            <label>Power backup source</label>
            <input
              className="input"
              placeholder="e.g. DG set, grid, UPS"
              value={form.powerBackupSource}
              onChange={(e) => setForm({ ...form, powerBackupSource: e.target.value })}
            />
          </div>
          <div>
            <label>Location in plant</label>
            <input
              className="input"
              placeholder="Area or building reference"
              value={form.locationInPlant}
              onChange={(e) => setForm({ ...form, locationInPlant: e.target.value })}
            />
          </div>
          <div>
            <label>X coordinate (optional)</label>
            <input
              className="input"
              type="number"
              step="any"
              placeholder="Plant map X"
              value={form.coordinateX}
              onChange={(e) => setForm({ ...form, coordinateX: e.target.value })}
            />
          </div>
          <div>
            <label>Y coordinate (optional)</label>
            <input
              className="input"
              type="number"
              step="any"
              placeholder="Plant map Y"
              value={form.coordinateY}
              onChange={(e) => setForm({ ...form, coordinateY: e.target.value })}
            />
          </div>
          <button className="btn" type="submit">
            {editingId ? "Update resource" : "Create resource"}
          </button>
          {editingId ? (
            <button className="btn btn-secondary" type="button" onClick={cancelEdit}>
              Cancel
            </button>
          ) : null}
        </form>
      </div>

      <div className="card">
        <h3 className="panel-title">All resources</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Capacity (tons)</th>
                <th>Power backup</th>
                <th>Location</th>
                <th>X, Y</th>
                <th>Current stage</th>
                <th>Stage notes</th>
                <th>Activities</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room._id}>
                  <td>{room.resourceType || "Room"}</td>
                  <td>{room.name}</td>
                  <td>{capacityTonsDisplay(room)}</td>
                  <td>{room.powerBackupSource || "—"}</td>
                  <td>{room.locationInPlant?.trim() ? room.locationInPlant : "—"}</td>
                  <td>{coordinatesDisplay(room)}</td>
                  <td>{room.currentStageId?.name || "Not set"}</td>
                  <td>{room.currentStageId?.notes || "—"}</td>
                  <td>
                    {room.currentStageId?.activities ? (
                      <div className="grid" style={{ gap: 6 }}>
                        {["watering", "ruffling", "thumping", "ventilation"]
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
                      "—"
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <EditIconButton onClick={() => startEdit(room)} />
                      <button className="btn btn-secondary" type="button" onClick={() => moveToNextStage(room._id)}>
                        Move stage
                      </button>
                      <DeleteIconButton onClick={() => void deleteRoom(room)} />
                    </div>
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
                        <option value="">Move to stage…</option>
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
    </div>
  );
}
