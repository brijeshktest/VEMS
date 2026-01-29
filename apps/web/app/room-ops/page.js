"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";

export default function RoomOpsPage() {
  const [rooms, setRooms] = useState([]);
  const [permissions, setPermissions] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const permData = await apiFetch("/auth/permissions");
      setPermissions(permData.permissions);
      const data = await apiFetch("/rooms/status");
      setRooms(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const canMoveStage =
    permissions === "all" || permissions?.roomStages?.edit || permissions?.roomStages?.view;
  const canEditActivities =
    permissions === "all" || permissions?.roomActivities?.edit || permissions?.roomActivities?.view;

  async function initRoom(roomId) {
    setError("");
    try {
      await apiFetch(`/rooms/${roomId}/init-stage`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function moveRoom(roomId) {
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
        <h1>Room Operations</h1>
        <p>Move stages and mark activities for each growing room.</p>
      </div>

      {error ? <div className="card">{error}</div> : null}

      <div className="card">
        <h3>Rooms</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Room</th>
              <th>Current Stage</th>
              <th>Notes</th>
              <th>Day</th>
              <th>Humidity</th>
              <th>Temperature</th>
              <th>CO2</th>
              <th>Next Stage</th>
              <th>Due</th>
              <th>Activities</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id} className={room.dueNextStage ? "highlight-row" : ""}>
                <td>{room.name}</td>
                <td>{room.currentStage?.name || "-"}</td>
                <td>{room.currentStage?.notes || "-"}</td>
                <td>{room.currentStage ? `Day ${room.daysElapsed}` : "-"}</td>
                <td>{room.currentStage ? `${room.currentStage?.humidity ?? 0}%` : "-"}</td>
                <td>{room.currentStage ? `${room.currentStage?.temperature ?? 0}°C` : "-"}</td>
                <td>{room.currentStage ? `${room.currentStage?.co2Level ?? 0} ppm` : "-"}</td>
                <td>{room.nextStage?.name || "-"}</td>
                <td>{room.dueNextStage ? "Overdue" : "No"}</td>
                <td>
                  {room.currentStage?.activities ? (
                    <div className="grid" style={{ gap: 6 }}>
                      {["watering", "ruffling", "thumping"]
                        .filter((key) => room.currentStage.activities[key])
                        .map((key) => (
                          <label key={key}>
                            <input
                              type="checkbox"
                              checked={Boolean(room.activityStatus?.[key])}
                              onChange={(e) => toggleActivity(room.id, key, e.target.checked)}
                              disabled={!canEditActivities}
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
                  {room.currentStage ? (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => moveRoom(room.id)}
                      disabled={!canMoveStage}
                    >
                      Move to next stage
                    </button>
                  ) : (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => initRoom(room.id)}
                      disabled={!canMoveStage}
                    >
                      Initiate room
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
