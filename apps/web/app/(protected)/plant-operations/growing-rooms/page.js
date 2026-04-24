"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../../lib/api.js";
import PageHeader from "../../../../components/PageHeader.js";
import { formatShortDate } from "../../../../lib/compostUi.js";
import { growOverallProgressFraction, maxGrowCycleDay } from "../../../../lib/growingRoomUi.js";

function roomStateLabel(state) {
  const s = String(state || "available");
  if (s === "active_growing") return "Active crop";
  if (s === "cleaning") return "Clean & release";
  return "Available";
}

function roomOperationalPillClass(state) {
  const s = String(state || "available");
  if (s === "active_growing") return "status-pill status-pill--active";
  if (s === "cleaning") return "status-pill status-pill--pending";
  return "status-pill status-pill--inactive";
}

function cycleProgressFraction(ac) {
  if (!ac) return 0;
  if (ac.status === "cleaning") return 1;
  return growOverallProgressFraction(ac.currentCycleDay, Boolean(ac.thirdFlushEnabled));
}

function cycleProgressFoot(ac) {
  if (!ac) return "—";
  if (ac.status === "cleaning") return "Clean & release — finish tasks, then complete cycle";
  const maxD = maxGrowCycleDay(Boolean(ac.thirdFlushEnabled));
  const d = Math.min(Math.max(1, Number(ac.currentCycleDay) || 1), maxD);
  return `Grow calendar · day ${d} of ${maxD}`;
}

export default function GrowingRoomsPage() {
  const router = useRouter();
  const [permissions, setPermissions] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRoomId, setModalRoomId] = useState("");
  const [modalStart, setModalStart] = useState("");
  const [modalThird, setModalThird] = useState(false);
  const [modalBatchId, setModalBatchId] = useState("");
  const [eligibleBatches, setEligibleBatches] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligibleError, setEligibleError] = useState("");
  const [reportRoom, setReportRoom] = useState("");
  const [roomPerf, setRoomPerf] = useState(null);
  const [batchYield, setBatchYield] = useState(null);
  const [monthly, setMonthly] = useState(null);

  const canView = permissions === "all" || Boolean(permissions?.growingRoomOps?.view);
  const canCreate = permissions === "all" || Boolean(permissions?.growingRoomOps?.create);

  const selectedRoom = rooms.find((r) => String(r._id) === String(modalRoomId));

  const load = useCallback(async () => {
    try {
      const permData = await apiFetch("/auth/permissions").catch(() => ({ permissions: {} }));
      setPermissions(permData.permissions ?? {});
      const perms = permData.permissions ?? {};
      const ok =
        perms === "all" ||
        Boolean(perms?.growingRoomOps?.view || perms?.growingRoomOps?.edit || perms?.growingRoomOps?.create);
      if (!ok) {
        router.replace("/work-mode");
        return;
      }
      const [r, s] = await Promise.all([
        apiFetch("/growing-room/rooms"),
        apiFetch("/growing-room/dashboard-summary")
      ]);
      setRooms(Array.isArray(r) ? r : []);
      setSummary(s && typeof s === "object" ? s : null);
    } catch (err) {
      setError(err.message);
      if (String(err.message).includes("Insufficient")) router.replace("/work-mode");
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!modalOpen || !modalRoomId || !canCreate) {
      setEligibleBatches([]);
      setEligibleError("");
      setEligibleLoading(false);
      return;
    }
    let cancelled = false;
    setEligibleLoading(true);
    setEligibleError("");
    (async () => {
      try {
        const rows = await apiFetch(
          `/growing-room/eligible-compost-batches?growingRoomId=${encodeURIComponent(modalRoomId)}`
        );
        if (!cancelled) {
          setEligibleBatches(Array.isArray(rows) ? rows : []);
        }
      } catch (err) {
        if (!cancelled) {
          setEligibleError(err.message || "Could not load batches");
          setEligibleBatches([]);
        }
      } finally {
        if (!cancelled) setEligibleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, modalRoomId, canCreate]);

  function openStartModal(roomId) {
    setModalRoomId(roomId || "");
    const d = new Date();
    setModalStart(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    setModalThird(false);
    setModalBatchId("");
    setModalOpen(true);
    setMessage("");
    setError("");
  }

  async function submitStartCycle(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!modalRoomId) {
      setError("Select a room.");
      return;
    }
    if (!modalBatchId) {
      setError("Select a compost batch that is compost ready and dispatched to this room.");
      return;
    }
    try {
      const body = {
        growingRoomId: modalRoomId,
        compostLifecycleBatchId: modalBatchId,
        cycleStartedAt: modalStart ? `${modalStart}T00:00:00.000Z` : undefined,
        thirdFlushEnabled: modalThird
      };
      const created = await apiFetch("/growing-room/cycles", {
        method: "POST",
        body: JSON.stringify(body)
      });
      setModalOpen(false);
      setMessage("Cycle started.");
      await load();
      if (created?._id) {
        router.push(`/plant-operations/growing-rooms/cycle/${created._id}`);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadReports() {
    setError("");
    try {
      const q = reportRoom ? `?roomId=${encodeURIComponent(reportRoom)}` : "";
      const [rp, by, mo] = await Promise.all([
        apiFetch(`/growing-room/reports/room-performance${q}`),
        apiFetch("/growing-room/reports/batch-yield"),
        apiFetch("/growing-room/reports/monthly-production")
      ]);
      setRoomPerf(Array.isArray(rp) ? rp : []);
      setBatchYield(Array.isArray(by) ? by : []);
      setMonthly(mo && typeof mo === "object" ? mo : null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Compost Units"
        title="Growing rooms"
        description="Scan every configured growing room in one place — like All compost batches on the main plant screen. Each row shows occupancy, the compost batch in crop (when applicable), and progress through the grow calendar."
      >
        <Link href="/dashboard" className="btn btn-ghost">
          ← Dashboard
        </Link>
        <Link href="/plant-operations" className="btn btn-secondary">
          Compost batches
        </Link>
      </PageHeader>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      {summary?.counts ? (
        <div className="grid grid-3" style={{ gap: 12 }}>
          <div className="card card-soft" style={{ padding: 16 }}>
            <span className="stat-hint">Due today</span>
            <div className="stat-value" style={{ fontSize: 24 }}>
              {summary.counts.dueToday}
            </div>
          </div>
          <div className="card card-soft" style={{ padding: 16 }}>
            <span className="stat-hint">Overdue</span>
            <div className="stat-value" style={{ fontSize: 24, color: "var(--danger)" }}>
              {summary.counts.overdue}
            </div>
          </div>
          <div className="card card-soft" style={{ padding: 16 }}>
            <span className="stat-hint">Completed today</span>
            <div className="stat-value" style={{ fontSize: 24 }}>
              {summary.counts.completedToday}
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <h3 className="panel-title">All growing rooms</h3>
        <p className="page-lead" style={{ marginTop: 0, marginBottom: 14, fontSize: 13 }}>
          Only <strong>Room</strong> resources from the catalogue appear here. In Compost Units, the batch must be{" "}
          <strong>compost ready</strong> and the final step set to <strong>Ready for growing room</strong> (not a specific room).
          Then <strong>Start cycle</strong> on an available room and pick the batch. <strong>Open cycle</strong> is the live crop
          (tasks, logs, harvest, cleaning).
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Location</th>
                <th>Occupancy</th>
                <th>Compost batch</th>
                <th>Cycle</th>
                <th style={{ minWidth: 140 }}>Progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <span className="cell-empty">No Room-type resources configured. Add them under Admin → Resources.</span>
                  </td>
                </tr>
              ) : (
                rooms.map((room) => {
                  const ac = room.activeCycle;
                  const pct = Math.round(cycleProgressFraction(ac) * 100);
                  const batchTitle = ac?.compostBatchName?.trim() || "";
                  return (
                    <tr key={String(room._id)}>
                      <td>
                        <strong>{room.name}</strong>
                        {room.capacityTons != null ? (
                          <span className="text-muted" style={{ display: "block", fontSize: 12, marginTop: 4 }}>
                            Capacity: {room.capacityTons} t
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className="text-muted" style={{ fontSize: 13 }}>
                          {room.locationInPlant || "—"}
                        </span>
                      </td>
                      <td>
                        <span className={roomOperationalPillClass(room.growingOperationalState)}>{roomStateLabel(room.growingOperationalState)}</span>
                      </td>
                      <td>
                        {ac ? (
                          <>
                            <span style={{ fontWeight: 600 }}>{batchTitle || "—"}</span>
                            {!batchTitle ? (
                              <span className="text-muted" style={{ display: "block", fontSize: 12, marginTop: 4 }}>
                                Batch linked to cycle
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted" style={{ fontSize: 13 }}>
                            —
                          </span>
                        )}
                      </td>
                      <td>
                        {ac ? (
                          <div className="dashboard-compost-timeline-dates">
                            <div>
                              <span className="dashboard-compost-date-label">Started</span>{" "}
                              <span className="dashboard-compost-date-value">{formatShortDate(ac.cycleStartedAt)}</span>
                            </div>
                            <div>
                              <span className="dashboard-compost-date-label">Stage</span>{" "}
                              <span className="dashboard-compost-date-value">
                                {ac.status === "cleaning" ? "Clean & release" : ac.currentStageLabel || "—"}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted" style={{ fontSize: 13 }}>
                            —
                          </span>
                        )}
                      </td>
                      <td>
                        {ac ? (
                          <div className="compost-progress-wrap">
                            <div className="compost-progress" title={`${pct}%`}>
                              <div className="compost-progress__fill" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="compost-progress-foot">{cycleProgressFoot(ac)}</div>
                          </div>
                        ) : (
                          <span className="text-muted" style={{ fontSize: 13 }}>
                            —
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {ac ? (
                            <Link
                              className="btn btn-secondary"
                              href={`/plant-operations/growing-rooms/cycle/${ac._id}`}
                              style={{ fontSize: 13, padding: "6px 12px", whiteSpace: "nowrap" }}
                            >
                              Open cycle
                            </Link>
                          ) : canCreate ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ fontSize: 13, padding: "6px 12px" }}
                              onClick={() => openStartModal(String(room._id))}
                            >
                              Start cycle
                            </button>
                          ) : (
                            <span className="text-muted" style={{ fontSize: 13 }}>
                              —
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="panel-title">Reports</h3>
        <p className="page-lead">Room-wise history, batch yields, and monthly production totals.</p>
        <div className="flex flex-wrap" style={{ gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
          <div style={{ minWidth: 200 }}>
            <label htmlFor="gr-report-room-filter">Filter by room (optional)</label>
            <select
              id="gr-report-room-filter"
              className="input"
              value={reportRoom}
              onChange={(e) => setReportRoom(e.target.value)}
            >
              <option value="">All rooms</option>
              {rooms.map((r) => (
                <option key={String(r._id)} value={String(r._id)}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-secondary" onClick={loadReports} disabled={!canView}>
            Load reports
          </button>
        </div>
        {roomPerf ? (
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <h4 className="panel-title" style={{ fontSize: 16 }}>
              Room performance (cycles)
            </h4>
            <table className="table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Started</th>
                  <th>Status</th>
                  <th>Yield (kg)</th>
                </tr>
              </thead>
              <tbody>
                {roomPerf.map((row) => (
                  <tr key={String(row.cycleId)}>
                    <td>{row.roomName}</td>
                    <td>{formatShortDate(row.cycleStartedAt)}</td>
                    <td>{row.status}</td>
                    <td>{row.totalYieldKg != null ? Number(row.totalYieldKg).toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {batchYield ? (
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <h4 className="panel-title" style={{ fontSize: 16 }}>
              Batch yield
            </h4>
            <table className="table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Total yield (kg)</th>
                  <th>Entries</th>
                </tr>
              </thead>
              <tbody>
                {batchYield.map((row) => (
                  <tr key={String(row.compostLifecycleBatchId)}>
                    <td>{row.batchName}</td>
                    <td>{row.totalYieldKg != null ? Number(row.totalYieldKg).toFixed(2) : "—"}</td>
                    <td>{row.yieldEntries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {monthly ? (
          <p className="page-lead">
            <strong>Monthly production</strong> ({monthly.year}
            {monthly.month ? `-${String(monthly.month).padStart(2, "0")}` : ""}):{" "}
            <strong>{Number(monthly.totalYieldKg || 0).toFixed(2)} kg</strong> from {monthly.yieldEntryCount}{" "}
            yield entries.
          </p>
        ) : null}
      </div>

      {modalOpen ? (
        <div
          className="voucher-modal-backdrop gr-start-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div
            className="gr-start-shell"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gr-start-cycle-title"
            aria-describedby="gr-start-cycle-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="gr-start-hero">
              <div className="gr-start-hero__text">
                <p className="gr-start-hero__eyebrow">New crop cycle</p>
                <h3 id="gr-start-cycle-title" className="gr-start-hero__title">
                  Start growing cycle
                </h3>
                <p id="gr-start-cycle-desc" className="gr-start-hero__desc">
                  Pick the room first, then a <strong>compost-ready</strong> batch marked <strong>Ready for growing room</strong> in
                  Compost Units. Room choice happens only here — not on the batch final step.
                </p>
              </div>
              <div className="gr-start-hero__mark" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="48" height="48" rx="14" fill="var(--primary-soft)" />
                  <path
                    d="M24 34c0-6 4-9 4-14a4 4 0 10-8 0c0 5 4 8 4 14z"
                    stroke="var(--primary)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path d="M24 20v8" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <button type="button" className="voucher-modal-close gr-start-close" aria-label="Close" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </header>

            <form onSubmit={submitStartCycle} className="gr-start-form">
              <nav className="gr-start-track" aria-label="Setup steps">
                <div className={`gr-start-track__node ${modalRoomId ? "gr-start-track__node--done" : "gr-start-track__node--active"}`}>
                  <span className="gr-start-track__bubble">{modalRoomId ? "✓" : "1"}</span>
                  <span className="gr-start-track__label">Room</span>
                </div>
                <div className="gr-start-track__rail" aria-hidden="true" />
                <div
                  className={`gr-start-track__node ${
                    !modalRoomId
                      ? ""
                      : modalBatchId
                        ? "gr-start-track__node--done"
                        : eligibleLoading
                          ? "gr-start-track__node--wait"
                          : "gr-start-track__node--active"
                  }`}
                >
                  <span className="gr-start-track__bubble">
                    {modalBatchId ? "✓" : eligibleLoading ? "…" : "2"}
                  </span>
                  <span className="gr-start-track__label">Compost</span>
                </div>
                <div className="gr-start-track__rail" aria-hidden="true" />
                <div className="gr-start-track__node gr-start-track__node--tail">
                  <span className="gr-start-track__bubble">3</span>
                  <span className="gr-start-track__label">Schedule</span>
                </div>
              </nav>

              <div className="gr-start-panels">
                <section className="gr-start-panel" aria-labelledby="gr-sec-room">
                  <div className="gr-start-panel__head">
                    <h4 id="gr-sec-room" className="gr-start-panel__title">
                      Room
                    </h4>
                    <span className="gr-start-panel__tag">Step 1</span>
                  </div>
                  <p className="gr-start-panel__lead">Pick an available room for this crop. You will choose which compost batch next.</p>
                  <label className="form-field">
                    <span className="form-label">Growing room</span>
                    <select
                      className="form-control gr-start-select"
                      required
                      value={modalRoomId}
                      onChange={(e) => {
                        setModalRoomId(e.target.value);
                        setModalBatchId("");
                      }}
                    >
                      <option value="">Choose a room…</option>
                      {rooms
                        .filter((r) => (r.growingOperationalState || "available") === "available" && !r.activeCycle)
                        .map((r) => (
                          <option key={String(r._id)} value={String(r._id)}>
                            {r.name}
                            {r.locationInPlant ? ` · ${r.locationInPlant}` : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                  {selectedRoom ? (
                    <p className="gr-start-inline-ok" role="status">
                      <span className="gr-start-inline-ok__icon" aria-hidden="true">
                        ✓
                      </span>
                      <span>
                        <strong>{selectedRoom.name}</strong>
                        {selectedRoom.locationInPlant ? ` · ${selectedRoom.locationInPlant}` : ""}
                      </span>
                    </p>
                  ) : null}
                </section>

                <section className="gr-start-panel" aria-labelledby="gr-sec-batch">
                  <div className="gr-start-panel__head">
                    <h4 id="gr-sec-batch" className="gr-start-panel__title">
                      Compost batch
                    </h4>
                    <span className="gr-start-panel__tag gr-start-panel__tag--req">Required</span>
                  </div>
                  <p className="gr-start-panel__lead">
                    Batches marked <strong>Ready for growing room</strong> in Compost Units (final step). Not tied to a room
                    until you start the cycle here — same batch can be listed for every empty room until one claims it.
                  </p>

                  {!modalRoomId ? (
                    <div className="gr-start-gate">
                      <p className="gr-start-gate__title">Choose a room first</p>
                      <p className="gr-start-gate__text">Then we load compost batches marked ready for growing room (final step in Compost Units).</p>
                    </div>
                  ) : null}

                  {modalRoomId && eligibleLoading ? (
                    <div className="gr-start-skeleton" role="status" aria-live="polite">
                      <span className="visually-hidden">Loading eligible compost batches</span>
                      <div className="gr-start-skeleton__line gr-start-skeleton__line--long" />
                      <div className="gr-start-skeleton__line gr-start-skeleton__line--med" />
                      <div className="gr-start-skeleton__line gr-start-skeleton__line--short" />
                    </div>
                  ) : null}

                  {modalRoomId && eligibleError ? <div className="alert alert-error">{eligibleError}</div> : null}

                  {modalRoomId && !eligibleLoading && !eligibleError && eligibleBatches.length === 0 ? (
                    <div className="gr-start-empty">
                      <div className="gr-start-empty__icon" aria-hidden="true" />
                      <p className="gr-start-empty__title">No eligible batches for this room</p>
                      <p className="gr-start-empty__text">
                        In Compost Units, open the batch → set final step to <strong>Ready for growing room</strong> (you do not
                        pick a room there). Then return here and start the cycle for <strong>{selectedRoom?.name || "this room"}</strong>.
                      </p>
                      <Link href="/plant-operations" className="btn btn-secondary">
                        Go to Compost Units
                      </Link>
                    </div>
                  ) : null}

                  {modalRoomId && !eligibleLoading && eligibleBatches.length > 0 ? (
                    <label className="form-field">
                      <span className="form-label">Compost batch for this cycle</span>
                      <select
                        className="form-control gr-start-select"
                        required
                        value={modalBatchId}
                        onChange={(e) => setModalBatchId(e.target.value)}
                      >
                        <option value="">Select a batch…</option>
                        {eligibleBatches.map((b) => (
                          <option key={String(b._id)} value={String(b._id)}>
                            {b.batchName || b._id} · dispatch {formatShortDate(b.postCompostRecordedAt)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </section>

                <section className="gr-start-panel gr-start-panel--schedule" aria-labelledby="gr-sec-when">
                  <div className="gr-start-panel__head">
                    <h4 id="gr-sec-when" className="gr-start-panel__title">
                      Schedule &amp; flush plan
                    </h4>
                    <span className="gr-start-panel__tag">Step 3</span>
                  </div>
                  <div className="gr-start-schedule">
                    <label className="form-field">
                      <span className="form-label">Cycle start (day 1)</span>
                      <input
                        className="form-control gr-start-date"
                        type="date"
                        value={modalStart}
                        onChange={(e) => setModalStart(e.target.value)}
                        required
                      />
                      <p className="gr-start-microcopy">Intervention calendar counts from this date.</p>
                    </label>
                    <div className="gr-start-flush-card">
                      <label className="gr-start-flush-label">
                        <input type="checkbox" checked={modalThird} onChange={(e) => setModalThird(e.target.checked)} />
                        <span className="gr-start-flush-label__text">
                          <span className="gr-start-flush-label__title">Include third flush</span>
                          <span className="gr-start-flush-label__sub">Adds optional harvest tasks later in the cycle.</span>
                        </span>
                      </label>
                    </div>
                  </div>
                </section>
              </div>

              <footer className="gr-start-footer">
                <div className="gr-start-footer__hint">
                  {(() => {
                    if (!canCreate) return "You do not have permission to start a cycle.";
                    if (!modalRoomId) return "Select a room to continue.";
                    if (eligibleLoading) return "Loading batches…";
                    if (eligibleBatches.length === 0 && !eligibleError)
                      return "No eligible batch yet — compost ready + final step Ready for growing room in Compost Units.";
                    if (!modalBatchId) return "Select the compost batch for this cycle.";
                    return "Ready when you are.";
                  })()}
                </div>
                <div className="gr-start-footer__actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn gr-start-submit"
                    disabled={!canCreate || eligibleLoading || eligibleBatches.length === 0 || !modalBatchId}
                  >
                    Start cycle
                  </button>
                </div>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
