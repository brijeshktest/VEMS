"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../../lib/api.js";
import PageHeader from "../../../../components/PageHeader.js";
import {
  compostStagePillClass,
  compostStageDisplayLabel,
  compostCycleDayDisplay,
  compostEstimatedReadyIso,
  formatShortDate,
  formatDateTime,
  formatStockQty,
  compostParameterLogAlerts,
  compostStageAdvanceReminder
} from "../../../../lib/compostUi.js";

const STATUS_OPTIONS = ["wetting", "filling", "turn1", "turn2", "turn3", "pasteurisation", "done"];

/** Local calendar day yyyy-mm-dd for grouping (matches how users read "Recorded" dates). */
function localCalendarDayKey(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Cluster raw material lines that share the same stage, same recorded calendar day, and same material.
 * Quantities for the same vendor are summed. Notes are collected (joined in the UI).
 */
function clusterRawMaterialLines(lines) {
  const list = Array.isArray(lines) ? lines : [];
  const groups = new Map();
  for (const line of list) {
    const stageKey = String(line.stageKey || "").trim();
    const mat = line.materialId;
    const matId =
      mat && typeof mat === "object" && mat._id != null
        ? String(mat._id)
        : mat != null
          ? String(mat)
          : "";
    const dayKey = localCalendarDayKey(line.recordedAt);
    const mapKey = `${stageKey}\0${dayKey}\0${matId}`;
    if (!groups.has(mapKey)) {
      groups.set(mapKey, {
        mapKey,
        stageKey: line.stageKey,
        recordedAt: line.recordedAt,
        material: mat,
        vendorTotals: new Map(),
        notes: new Set()
      });
    }
    const g = groups.get(mapKey);
    const vid =
      line.vendorId && typeof line.vendorId === "object" && line.vendorId._id != null
        ? String(line.vendorId._id)
        : line.vendorId != null
          ? String(line.vendorId)
          : "";
    const q = Number(line.quantity) || 0;
    const prev = g.vendorTotals.get(vid) || { vendor: line.vendorId, quantity: 0 };
    prev.quantity += q;
    prev.vendor = line.vendorId || prev.vendor;
    g.vendorTotals.set(vid, prev);
    if (line.note != null && String(line.note).trim()) {
      g.notes.add(String(line.note).trim());
    }
  }
  const arr = Array.from(groups.values()).map((g) => ({
    mapKey: g.mapKey,
    stageKey: g.stageKey,
    recordedAt: g.recordedAt,
    material: g.material,
    vendors: Array.from(g.vendorTotals.values()),
    notesJoined: g.notes.size === 0 ? "" : [...g.notes].join("; ")
  }));
  arr.sort((a, b) => {
    const ta = new Date(a.recordedAt || 0).getTime();
    const tb = new Date(b.recordedAt || 0).getTime();
    if (ta !== tb) return ta - tb;
    const oa = STATUS_OPTIONS.indexOf(String(a.stageKey || ""));
    const ob = STATUS_OPTIONS.indexOf(String(b.stageKey || ""));
    const ra = oa < 0 ? 99 : oa;
    const rb = ob < 0 ? 99 : ob;
    if (ra !== rb) return ra - rb;
    const na = a.material && typeof a.material === "object" ? a.material.name || "" : "";
    const nb = b.material && typeof b.material === "object" ? b.material.name || "" : "";
    return na.localeCompare(nb);
  });
  return arr;
}

function newAdvanceRawLineId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function newAdvanceRawMaterialLine() {
  return { lineId: newAdvanceRawLineId(), materialId: "", vendorQtyRows: [] };
}

function advanceVendorQtyTemplateFromMaterial(m) {
  if (!m) return [];
  return (m.byVendor || []).map((v) => ({
    vendorId: String(v.vendorId),
    vendorName: v.vendorName,
    maxAvailable: Number(v.availableQuantity) || 0,
    qty: ""
  }));
}

function initialAdvanceRawLines() {
  return [newAdvanceRawMaterialLine()];
}

/** Snapshot list from a daily parameter log (embedded on save). */
function formatAllocatedResourcesFromLog(log) {
  const list = log?.allocatedResources;
  if (!Array.isArray(list) || list.length === 0) return "—";
  return list
    .map((r) => {
      const nm = (r.name || "").trim() || "—";
      const tp = (r.resourceType || "").trim();
      const sk = (r.allocationStageKey || "").trim();
      const label = tp ? `${nm} (${tp})` : nm;
      return sk ? `${label} · ${compostStageDisplayLabel(sk)}` : label;
    })
    .join("; ");
}

export default function CompostBatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = params?.batchId;
  const [batch, setBatch] = useState(null);
  const [resourceOptions, setResourceOptions] = useState([]);
  const [rawMaterialStock, setRawMaterialStock] = useState([]);
  const [resourceId, setResourceId] = useState("");
  const [advanceRawLines, setAdvanceRawLines] = useState(() => initialAdvanceRawLines());
  const [advanceNote, setAdvanceNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dispatchDestination, setDispatchDestination] = useState("growing_room");
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);

  const loadBatch = useCallback(async () => {
    if (!batchId) return;
    const data = await apiFetch(`/plant-ops/compost-batches/${batchId}`);
    setBatch(data);
  }, [batchId]);

  const advanceTarget = batch?.nextOperationalStage;

  const loadResourceOptions = useCallback(async () => {
    if (!batchId || !advanceTarget || advanceTarget === "done") {
      setResourceOptions([]);
      return;
    }
    const data = await apiFetch(
      `/plant-ops/resource-options?status=${encodeURIComponent(advanceTarget)}&excludeBatchId=${encodeURIComponent(batchId)}`
    );
    setResourceOptions((data.resources || []).filter((r) => r.available));
  }, [batchId, advanceTarget]);

  const loadRawMaterialStock = useCallback(async () => {
    const data = await apiFetch("/plant-ops/raw-materials-expense-summary");
    setRawMaterialStock(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    (async () => {
      try {
        setError("");
        await loadBatch();
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          if (String(err.message).includes("not found")) {
            router.replace("/plant-operations");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId, loadBatch, router]);

  useEffect(() => {
    if (!batch || !advanceTarget || advanceTarget === "done") return;
    let cancelled = false;
    (async () => {
      try {
        await loadResourceOptions();
      } catch {
        if (!cancelled) setResourceOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batch, advanceTarget, loadResourceOptions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadRawMaterialStock();
      } catch {
        if (!cancelled) setRawMaterialStock([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadRawMaterialStock]);

  async function submitPostCompostDispatch(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setDispatchSubmitting(true);
    try {
      const body =
        dispatchDestination === "ready_to_sell"
          ? { destination: "ready_to_sell" }
          : { destination: "growing_room" };
      await apiFetch(`/plant-ops/compost-batches/${batchId}/post-compost-dispatch`, {
        method: "POST",
        body: JSON.stringify(body)
      });
      setMessage(
        dispatchDestination === "ready_to_sell"
          ? "Recorded as ready to sell."
          : "Recorded as ready for growing room. Choose the room and batch under Growing rooms when you start a cycle."
      );
      await loadBatch();
    } catch (err) {
      setError(err.message);
    } finally {
      setDispatchSubmitting(false);
    }
  }

  function setAdvanceRawLineMaterial(lineId, materialId) {
    setAdvanceRawLines((prev) =>
      prev.map((ln) => {
        if (ln.lineId !== lineId) return ln;
        const m = rawMaterialStock.find((x) => String(x.materialId || x._id) === String(materialId));
        return {
          ...ln,
          materialId,
          vendorQtyRows: advanceVendorQtyTemplateFromMaterial(m || null)
        };
      })
    );
  }

  function setAdvanceRawLineVendorQty(lineId, rowIdx, qty) {
    setAdvanceRawLines((prev) =>
      prev.map((ln) => {
        if (ln.lineId !== lineId) return ln;
        return {
          ...ln,
          vendorQtyRows: ln.vendorQtyRows.map((r, i) => (i === rowIdx ? { ...r, qty } : r))
        };
      })
    );
  }

  function addAdvanceRawMaterialLine() {
    setAdvanceRawLines((prev) => [...prev, newAdvanceRawMaterialLine()]);
  }

  function removeAdvanceRawMaterialLine(lineId) {
    setAdvanceRawLines((prev) => {
      if (prev.length <= 1) return [newAdvanceRawMaterialLine()];
      return prev.filter((ln) => ln.lineId !== lineId);
    });
  }

  async function advanceStage(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!advanceTarget) {
      setError("No further stage to advance to.");
      return;
    }
    if (advanceTarget !== "done") {
      if (!resourceId) {
        setError("Select a plant resource for the next stage.");
        return;
      }
    }
    const rawMaterials = [];
    for (const ln of advanceRawLines) {
      if (!ln.materialId) continue;
      const m = rawMaterialStock.find((x) => String(x.materialId || x._id) === String(ln.materialId));
      const label = m?.name || "this material";
      for (const row of ln.vendorQtyRows) {
        const q = Number(row.qty) || 0;
        if (q > row.maxAvailable + 1e-6) {
          setError(
            `${label}: quantity for ${row.vendorName} cannot exceed available (${formatStockQty(row.maxAvailable)}).`
          );
          return;
        }
      }
      const allocations = ln.vendorQtyRows
        .map((r) => ({ vendorId: r.vendorId, quantity: Number(r.qty) }))
        .filter((x) => Number.isFinite(x.quantity) && x.quantity > 0);
      if (allocations.length) {
        rawMaterials.push({ materialId: ln.materialId, allocations });
      }
    }
    const payload =
      advanceTarget === "done"
        ? { rawMaterials, note: advanceNote.trim() || undefined }
        : {
            resources: [{ growingRoomId: resourceId }],
            rawMaterials,
            note: advanceNote.trim() || undefined
          };
    try {
      await apiFetch(`/plant-ops/compost-batches/${batchId}/advance-stage`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setResourceId("");
      setAdvanceRawLines(initialAdvanceRawLines());
      setAdvanceNote("");
      setMessage(
        advanceTarget === "done"
          ? "Batch marked compost ready."
          : `Advanced to ${compostStageDisplayLabel(advanceTarget)}.`
      );
      await loadBatch();
      await loadRawMaterialStock();
    } catch (err) {
      setError(err.message);
    }
  }

  const timelineSteps = useMemo(() => {
    if (!batch?.timeline?.stages) return [];
    const active = batch.operationalStageKey || batch.effectiveStatus;
    const activeOrder = STATUS_OPTIONS.indexOf(active);
    return batch.timeline.stages.map((s) => {
      const order = STATUS_OPTIONS.indexOf(s.key);
      let cls = "compost-timeline__step";
      if (s.key === active) cls += " compost-timeline__step--active";
      else if (activeOrder >= 0 && order >= 0 && order < activeOrder) cls += " compost-timeline__step--past";
      const showCompletedTick =
        activeOrder >= 0 &&
        order >= 0 &&
        (order < activeOrder || (active === "done" && s.key === "done"));
      return { ...s, cls, showCompletedTick };
    });
  }, [batch]);

  const clusteredRawMaterials = useMemo(
    () => clusterRawMaterialLines(batch?.rawMaterialLines),
    [batch?.rawMaterialLines]
  );

  /** Same rules as plant operations list: reminder when the next stage movement should be recorded. */
  const stageAdvanceReminder = useMemo(() => compostStageAdvanceReminder(batch), [batch]);

  if (!batch) {
    return (
      <div className="page-stack">
        <p className="page-lead">{error || "Loading…"}</p>
      </div>
    );
  }

  const atDone = batch.operationalStageKey === "done" || !batch.nextOperationalStage;
  const estCompostReadyIso = compostEstimatedReadyIso(batch);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Plant operations"
        title={batch.batchName}
        description={`Started ${formatShortDate(batch.startDate)} · Recorded workflow: ${compostStageDisplayLabel(batch.operationalStageKey)}. Use the workflow and timeline panel plus stage movements below to plan and advance.`}
      >
        <Link href="/plant-operations" className="btn btn-ghost">
          ← All batches
        </Link>
      </PageHeader>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <div className="card compost-lifecycle-card">
        <h3 className="panel-title">Workflow &amp; planned timeline</h3>
        <p className="page-lead compost-lifecycle-card__lead">
          Started <strong>{formatShortDate(batch.startDate)}</strong>. The <strong>workflow</strong> pill is what you have
          recorded; the <strong>calendar</strong> line is where the batch sits on the standard plan by date alone. The strip of
          stages is the full plan through pasteurisation — the highlighted step matches your current workflow. Advance the
          workflow only from <strong>Stage movements</strong> below.
        </p>
        <div className="compost-lifecycle-card__body">
          <section className="compost-lifecycle-card__col compost-lifecycle-card__col--status" aria-labelledby="compost-status-heading">
            <h4 id="compost-status-heading" className="compost-lifecycle-card__subhead">
              Status &amp; calendar progress
            </h4>
            <div className="compost-lifecycle-card__pills">
              <span className={compostStagePillClass(batch.operationalStageKey)}>
                Workflow: {compostStageDisplayLabel(batch.operationalStageKey)}
              </span>
              <div className="compost-lifecycle-card__calendar-line text-muted">
                Calendar (by start date): <strong>{compostStageDisplayLabel(batch.computedStatus)}</strong>
                {batch.isManualOverride ? (
                  <span className="tag" style={{ marginLeft: 8 }}>
                    Display override
                  </span>
                ) : null}
              </div>
            </div>
            <div className="compost-lifecycle-card__progress-block">
              <div className="compost-lifecycle-card__progress-label">Elapsed vs full plan (by calendar)</div>
              <div className="compost-progress-wrap compost-progress-wrap--wide">
                <div className="compost-progress compost-progress--lg">
                  <div className="compost-progress__fill" style={{ width: `${Math.round((batch.progress || 0) * 100)}%` }} />
                </div>
                <div className="compost-progress-foot">{compostCycleDayDisplay(batch)}</div>
              </div>
            </div>
            <dl className="compost-lifecycle-metrics">
              <div>
                <dt>Planned span</dt>
                <dd>{batch.timeline?.totalSpanDays ?? 20} days</dd>
              </div>
              <div>
                <dt>Est. compost ready</dt>
                <dd>{estCompostReadyIso ? formatShortDate(estCompostReadyIso) : "—"}</dd>
              </div>
              <div>
                <dt>Batch start</dt>
                <dd>{formatShortDate(batch.startDate)}</dd>
              </div>
            </dl>
          </section>
          <section className="compost-lifecycle-card__col compost-lifecycle-card__col--timeline" aria-labelledby="compost-plan-heading">
            <h4 id="compost-plan-heading" className="compost-lifecycle-card__subhead">
              Planned stages (reference)
            </h4>
            <div className="compost-timeline compost-timeline--in-card">
              {timelineSteps.map((s) => (
                <div key={s.key} className={s.cls}>
                  <div className="compost-timeline__label-row">
                    {s.showCompletedTick ? (
                      <span className="compost-timeline__tick" title="Completed in workflow" role="img" aria-label="Completed">
                        ✓
                      </span>
                    ) : null}
                    <div className="compost-timeline__label">{s.label}</div>
                  </div>
                  <div className="compost-timeline__meta">
                    {s.days ? `${s.days}d` : "—"} · {formatShortDate(s.startsAt)}
                    {s.endsAt ? (
                      <>
                        {" "}
                        → {formatShortDate(s.endsAt)}
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="compost-latest-params">
              {batch.latestDailyParameters ? (
                <>
                  <h4 className="compost-latest-params__heading">
                    <span className="compost-lifecycle-card__subhead compost-latest-params__heading-label">
                      Latest daily parameters
                    </span>
                    <span className="compost-latest-params__title-meta">
                      (Logged {formatDateTime(batch.latestDailyParameters.loggedAt)}
                      {batch.latestDailyParameters.recordedByName
                        ? ` · ${batch.latestDailyParameters.recordedByName}`
                        : ""}
                      )
                    </span>
                  </h4>
                  <dl className="compost-latest-params__grid compost-latest-params__grid--metrics">
                    <div>
                      <dt>Temperature</dt>
                      <dd>{Number(batch.latestDailyParameters.temperatureC).toFixed(1)}°C</dd>
                    </div>
                    <div>
                      <dt>Moisture</dt>
                      <dd>{Number(batch.latestDailyParameters.moisturePercent).toFixed(1)}%</dd>
                    </div>
                    <div>
                      <dt>Ammonia</dt>
                      <dd>
                        {Number(batch.latestDailyParameters.ammoniaLevel).toLocaleString("en-IN", {
                          maximumFractionDigits: 2
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt>Alerts</dt>
                      <dd>
                        {(() => {
                          const a = compostParameterLogAlerts(batch.latestDailyParameters);
                          return (
                            <div className="compost-param-log-alerts compost-latest-params__alerts-cell">
                              {a.highTemperature ? (
                                <span className="compost-param-alert compost-param-alert--temp" title="Temperature above 75°C">
                                  Temp {">"} 75°C
                                </span>
                              ) : null}
                              {a.lowMoisture ? (
                                <span className="compost-param-alert compost-param-alert--moisture" title="Moisture below 65%">
                                  Moisture {"<"} 65%
                                </span>
                              ) : null}
                              {!a.highTemperature && !a.lowMoisture ? (
                                <span
                                  className="compost-param-alert compost-param-alert--ok"
                                  title="Temperature ≤ 75°C and moisture ≥ 65%"
                                >
                                  OK
                                </span>
                              ) : null}
                            </div>
                          );
                        })()}
                      </dd>
                    </div>
                  </dl>
                  <div className="compost-latest-params__context-row">
                    <strong>Stage</strong>
                    {batch.latestDailyParameters.operationalStageKey ? (
                      <span className={compostStagePillClass(batch.latestDailyParameters.operationalStageKey)}>
                        {compostStageDisplayLabel(batch.latestDailyParameters.operationalStageKey)}
                      </span>
                    ) : (
                      <span>—</span>
                    )}
                    <span className="compost-latest-params__context-sep" aria-hidden>
                      ·
                    </span>
                    <strong>Resources</strong>
                    <span className="compost-latest-params__context-resources">
                      {formatAllocatedResourcesFromLog(batch.latestDailyParameters)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <h4 className="compost-lifecycle-card__subhead" style={{ marginBottom: 10 }}>
                    Latest daily parameters
                  </h4>
                  <p className="text-muted" style={{ marginBottom: 0, fontSize: 13 }}>
                    No daily parameter logs yet. Add logs from <strong>Plant operations</strong> using the log button on the
                    batch row.
                  </p>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {batch.operationalStageKey === "done" ? (
        <div className="card compost-dispatch-card">
          <h3 className="panel-title">Final step: growing room or ready to sell</h3>
          <p className="page-lead" style={{ marginTop: 0, marginBottom: 14, fontSize: 13 }}>
            After compost is ready, choose whether this batch is intended for a <strong>growing room crop</strong> or{" "}
            <strong>ready to sell</strong>. You do <strong>not</strong> pick a room here — go to{" "}
            <Link href="/plant-operations/growing-rooms">Growing rooms</Link>, choose an available room, then select this batch
            when you start the cycle.
          </p>
          {batch.postCompostRecordedAt ? (
            <div className="panel-inset panel-inset--strong">
              {batch.postCompostReadyToSell ? (
                <p className="page-lead" style={{ marginBottom: 0 }}>
                  <strong>Ready to sell</strong> — recorded {formatDateTime(batch.postCompostRecordedAt)}.
                </p>
              ) : batch.postCompostGrowingRoomId &&
                typeof batch.postCompostGrowingRoomId === "object" &&
                batch.postCompostGrowingRoomId.name ? (
                <p className="page-lead" style={{ marginBottom: 0 }}>
                  <strong>Legacy — sent to room:</strong> {batch.postCompostGrowingRoomId.name}
                  {batch.postCompostGrowingRoomId.locationInPlant
                    ? ` · ${batch.postCompostGrowingRoomId.locationInPlant}`
                    : ""}{" "}
                  — recorded {formatDateTime(batch.postCompostRecordedAt)}.
                </p>
              ) : (
                <p className="page-lead" style={{ marginBottom: 0 }}>
                  <strong>Ready for growing room</strong> — recorded {formatDateTime(batch.postCompostRecordedAt)}. Start the
                  crop from <Link href="/plant-operations/growing-rooms">Growing rooms</Link> (pick room, then batch).
                </p>
              )}
            </div>
          ) : (
            <form className="section-stack" style={{ gap: 16 }} onSubmit={submitPostCompostDispatch}>
              <fieldset className="compost-dispatch-fieldset">
                <legend className="visually-hidden">Destination</legend>
                <label className="compost-dispatch-radio">
                  <input
                    type="radio"
                    name="dispatch-dest"
                    checked={dispatchDestination === "growing_room"}
                    onChange={() => setDispatchDestination("growing_room")}
                  />
                  <span>Ready for growing room</span>
                </label>
                <label className="compost-dispatch-radio">
                  <input
                    type="radio"
                    name="dispatch-dest"
                    checked={dispatchDestination === "ready_to_sell"}
                    onChange={() => setDispatchDestination("ready_to_sell")}
                  />
                  <span>Ready to sell</span>
                </label>
              </fieldset>
              {dispatchDestination === "growing_room" ? (
                <p className="page-lead" style={{ marginBottom: 0, fontSize: 13 }}>
                  This batch will appear when you <strong>Start cycle</strong> on any available room. Room and batch are chosen
                  there, not on this screen.
                </p>
              ) : (
                <p className="page-lead" style={{ marginBottom: 0, fontSize: 13 }}>
                  Use this when compost is sold or leaves the plant without occupying a growing room. No growing cycle is
                  created.
                </p>
              )}
              <button className="btn" type="submit" disabled={dispatchSubmitting}>
                {dispatchSubmitting ? "Saving…" : "Confirm dispatch"}
              </button>
            </form>
          )}
        </div>
      ) : null}

      <div className="card compost-movements-card">
        <h3 className="panel-title">Stage movements</h3>
        <p className="page-lead compost-stage-movements__lead">
          Log of each advance: plant resources and any raw material draws. Use <strong>Record next stage movement</strong> when
          you are ready — assign the next resource where required; raw materials are optional unless this step uses stock.
        </p>
        <div className="compost-stage-movements__section">
          <h4 className="compost-lifecycle-card__subhead">History</h4>
          <div className="table-wrap compost-stage-movements__table-wrap">
            <table className="table compost-stage-movements__table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>From → To</th>
                  <th>Resources</th>
                  <th>Raw materials</th>
                </tr>
              </thead>
              <tbody>
                {(batch.stageMovements || []).length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <span className="cell-empty">No stage movements recorded yet.</span>
                    </td>
                  </tr>
                ) : (
                  (batch.stageMovements || []).map((mv) => (
                    <tr key={mv._id}>
                      <td>{formatShortDate(mv.movedAt)}</td>
                      <td>
                        <strong>{compostStageDisplayLabel(mv.fromStage)}</strong>
                        <span className="text-muted"> → </span>
                        <strong>{compostStageDisplayLabel(mv.toStage)}</strong>
                      </td>
                      <td>
                        {(mv.resourcesUsed || []).length ? (
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {(mv.resourcesUsed || []).map((r, i) => (
                              <li key={i}>
                                {r.name} <span className="text-muted">({r.resourceType})</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {(mv.rawMaterialsUsed || []).length ? (
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {(mv.rawMaterialsUsed || []).map((r, i) => (
                              <li key={i}>
                                {r.materialName} · {r.vendorName}: <strong>{formatStockQty(r.quantity)}</strong>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="compost-stage-movements__form-shell">
          <div className="panel-inset panel-inset--strong compost-advance-panel">
            <h4 className="panel-title" style={{ fontSize: 15, marginBottom: 10 }}>
              Record next stage movement
            </h4>
            {atDone ? (
              <p className="page-lead" style={{ marginBottom: 0 }}>
                This batch has reached <strong>compost ready</strong>. No further stage movements are available. Use{" "}
                <strong>Final step: growing room or ready to sell</strong> above for <strong>Ready for growing room</strong> or{" "}
                <strong>Ready to sell</strong> — you choose the actual room later under Growing rooms when starting a cycle.
              </p>
            ) : (
              <>
              {stageAdvanceReminder.due && advanceTarget ? (
                <div className="alert alert-warn" style={{ marginBottom: 16 }}>
                  <strong>Action required — record the next stage.</strong> Advance the workflow to{" "}
                  <strong>{stageAdvanceReminder.nextStageLabel || compostStageDisplayLabel(advanceTarget)}</strong>.
                  {stageAdvanceReminder.endsLabel ? (
                    <>
                      {" "}
                      Planned end of the current recorded stage (<strong>
                        {compostStageDisplayLabel(batch.operationalStageKey)}
                      </strong>
                      ){": "}
                      <strong>{stageAdvanceReminder.endsLabel}</strong>.
                    </>
                  ) : null}
                </div>
              ) : null}
              <p className="page-lead" style={{ marginBottom: 12 }}>
                Advance the recorded workflow from <strong>{compostStageDisplayLabel(batch.operationalStageKey)}</strong> to{" "}
                <strong>{compostStageDisplayLabel(advanceTarget)}</strong>.
                {advanceTarget === "done" ? (
                  <> No new plant resource is required. Raw material draws are optional.</>
                ) : (
                  <>
                    {" "}
                    Select one available <strong>{resourceOptions[0]?.resourceType || "plant resource"}</strong> for the next
                    stage. Raw materials are <strong>optional</strong> — add lines only if this movement uses stock.
                  </>
                )}
              </p>
              <form className="section-stack" onSubmit={advanceStage} style={{ gap: 16 }}>
                {advanceTarget !== "done" ? (
                  <div className="grid grid-3" style={{ alignItems: "end" }}>
                    <div style={{ gridColumn: "span 2" }}>
                      <label>Plant resource for {compostStageDisplayLabel(advanceTarget)}</label>
                      <select className="input" value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
                        <option value="">Select…</option>
                        {resourceOptions.map((r) => (
                          <option key={r._id} value={r._id}>
                            {r.name} ({r.resourceType})
                            {r.locationInPlant ? ` · ${r.locationInPlant}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : null}
                <div className="section-stack" style={{ gap: 14 }}>
                  <div className="flex flex-wrap" style={{ alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <label style={{ marginBottom: 0 }}>Raw materials (optional)</label>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: 13, padding: "6px 12px" }} onClick={addAdvanceRawMaterialLine}>
                      Add material
                    </button>
                  </div>
                  {advanceRawLines.map((ln, lineIdx) => {
                    const mat = ln.materialId
                      ? rawMaterialStock.find((m) => String(m.materialId || m._id) === String(ln.materialId)) || null
                      : null;
                    return (
                      <div key={ln.lineId} className="panel-inset panel-inset--strong">
                        <div className="flex flex-wrap" style={{ alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                          <span className="tag" style={{ marginBottom: 0 }}>
                            Material {lineIdx + 1}
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: 13, padding: "4px 10px" }}
                            onClick={() => removeAdvanceRawMaterialLine(ln.lineId)}
                          >
                            Remove
                          </button>
                        </div>
                        <label className="visually-hidden" htmlFor={`advance-raw-mat-${ln.lineId}`}>
                          Raw material {lineIdx + 1}
                        </label>
                        <select
                          id={`advance-raw-mat-${ln.lineId}`}
                          className="input"
                          value={ln.materialId}
                          onChange={(e) => setAdvanceRawLineMaterial(ln.lineId, e.target.value)}
                        >
                          <option value="">Select…</option>
                          {rawMaterialStock.map((m) => (
                            <option key={String(m.materialId || m._id)} value={String(m.materialId || m._id)}>
                              {m.name}
                              {m.unit ? ` (${m.unit})` : ""} — available {formatStockQty(m.totalAvailableQuantity ?? 0)}
                            </option>
                          ))}
                        </select>
                        {ln.materialId && ln.vendorQtyRows.length ? (
                          <div style={{ marginTop: 12 }}>
                            <p className="tag" style={{ marginBottom: 10 }}>
                              Quantity per vendor (max = available)
                            </p>
                            <div className="section-stack" style={{ gap: 10 }}>
                              {ln.vendorQtyRows.map((row, idx) => (
                                <div key={row.vendorId} className="raw-vendor-qty-row">
                                  <div>
                                    <strong>{row.vendorName}</strong>
                                    <span className="text-muted" style={{ display: "block", fontSize: 12, marginTop: 2 }}>
                                      Available: {formatStockQty(row.maxAvailable)} {mat?.unit || ""}
                                    </span>
                                  </div>
                                  <input
                                    className="input"
                                    type="number"
                                    min="0"
                                    max={row.maxAvailable}
                                    step="any"
                                    placeholder="0"
                                    value={row.qty}
                                    onChange={(e) => setAdvanceRawLineVendorQty(ln.lineId, idx, e.target.value)}
                                    aria-label={`Quantity from ${row.vendorName} for ${mat?.name || "material"}`}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : ln.materialId ? (
                          <p className="cell-empty" style={{ marginBottom: 0, marginTop: 12 }}>
                            No vendor purchases for this material on vouchers — nothing to allocate.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div>
                  <label>Note (optional)</label>
                  <input className="input" value={advanceNote} onChange={(e) => setAdvanceNote(e.target.value)} />
                </div>
                <button
                  className="btn"
                  type="submit"
                  disabled={advanceTarget !== "done" && (!resourceId || !resourceOptions.length)}
                >
                  {advanceTarget === "done" ? "Mark compost ready" : `Advance to ${compostStageDisplayLabel(advanceTarget)}`}
                </button>
              </form>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="panel-title">Resource allocations (by stage)</h3>
        <p className="page-lead" style={{ marginBottom: 12 }}>
          Start and end timestamps are set when a resource is assigned on a movement and when the batch leaves that stage.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Type</th>
                <th>Stage</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {(batch.resourceAllocations || []).length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <span className="cell-empty">No resource allocations yet.</span>
                  </td>
                </tr>
              ) : (
                batch.resourceAllocations.map((a) => (
                  <tr key={a._id}>
                    <td>{a.growingRoomId?.name || "—"}</td>
                    <td>{a.growingRoomId?.resourceType || "—"}</td>
                    <td>{a.stageKey ? compostStageDisplayLabel(a.stageKey) : <span className="text-muted">—</span>}</td>
                    <td>{formatShortDate(a.startDate || a.assignedAt)}</td>
                    <td>{a.endDate ? formatShortDate(a.endDate) : <span className="tag">Open</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="panel-title">Raw material lines</h3>
        <p className="page-lead" style={{ marginBottom: 12 }}>
          Immutable usage recorded on batch creation or stage advances. Rows below are grouped when they share the same{" "}
          <strong>stage</strong>, <strong>recorded date</strong>, and <strong>material</strong>; vendor quantities in that
          group are combined.
        </p>
        {(batch.rawMaterialLines || []).length === 0 ? (
          <p className="cell-empty" style={{ marginBottom: 0 }}>
            No raw material lines yet.
          </p>
        ) : (
          <div className="compost-raw-clusters">
            {clusteredRawMaterials.map((cluster) => {
              const unit =
                cluster.material && typeof cluster.material === "object" ? cluster.material.unit || "" : "";
              const totalQty = cluster.vendors.reduce((s, v) => s + (Number(v.quantity) || 0), 0);
              return (
                <article key={cluster.mapKey} className="compost-raw-cluster">
                  <header className="compost-raw-cluster__head">
                    <div className="compost-raw-cluster__stage-date">
                      <span className={compostStagePillClass(cluster.stageKey)}>
                        {cluster.stageKey ? compostStageDisplayLabel(cluster.stageKey) : "—"}
                      </span>
                      <time className="compost-raw-cluster__recorded" dateTime={cluster.recordedAt || undefined}>
                        Recorded {formatShortDate(cluster.recordedAt)}
                      </time>
                    </div>
                    <div className="compost-raw-cluster__material">
                      <strong>{cluster.material && typeof cluster.material === "object" ? cluster.material.name || "—" : "—"}</strong>
                      {unit ? <span className="text-muted"> ({unit})</span> : null}
                      <span className="compost-raw-cluster__total">
                        Total <strong>{formatStockQty(totalQty)}</strong>
                        {unit ? <span className="text-muted"> {unit}</span> : null}
                      </span>
                    </div>
                  </header>
                  <div className="table-wrap compost-raw-cluster__table-wrap">
                    <table className="table compost-raw-cluster__vendor-table">
                      <thead>
                        <tr>
                          <th>Vendor</th>
                          <th>Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cluster.vendors.map((row, vi) => (
                          <tr key={`${cluster.mapKey}-v-${String(row.vendor?._id || row.vendor || vi)}`}>
                            <td>{row.vendor && typeof row.vendor === "object" ? row.vendor.name || "—" : "—"}</td>
                            <td>{formatStockQty(row.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <footer className="compost-raw-cluster__foot">
                    <span className="compost-raw-cluster__note-label">Note</span>
                    <span className="compost-raw-cluster__note-value">{cluster.notesJoined || "—"}</span>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="panel-title">Daily parameter logs</h3>
        <p className="page-lead" style={{ marginBottom: 12 }}>
          Temperature (°C), moisture (%), and ammonia level recorded over time. Each row stores the <strong>workflow stage</strong>{" "}
          and <strong>open plant resources</strong> from when the log was saved. Rows are sorted by date. The alerts column shows
          a green <strong>OK</strong> when temperature and moisture are in range, or coloured tags when temperature is above 75°C
          or moisture is below 65%.
        </p>
        {!(batch.dailyParameterLogs || []).length ? (
          <p className="cell-empty" style={{ marginBottom: 0 }}>
            No parameter logs yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date / time</th>
                  <th>Stage</th>
                  <th>Allocated resources</th>
                  <th>Temperature</th>
                  <th>Moisture</th>
                  <th>Ammonia</th>
                  <th>Recorded by</th>
                  <th>Alerts</th>
                </tr>
              </thead>
              <tbody>
                {(batch.dailyParameterLogs || []).map((log) => {
                  const a = compostParameterLogAlerts(log);
                  return (
                    <tr key={log._id}>
                      <td>{formatDateTime(log.loggedAt)}</td>
                      <td>
                        {log.operationalStageKey ? (
                          <span className={compostStagePillClass(log.operationalStageKey)}>
                            {compostStageDisplayLabel(log.operationalStageKey)}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td style={{ maxWidth: 280, fontSize: 13 }}>{formatAllocatedResourcesFromLog(log)}</td>
                      <td>{Number(log.temperatureC).toFixed(1)}°C</td>
                      <td>{Number(log.moisturePercent).toFixed(1)}%</td>
                      <td>{Number(log.ammoniaLevel).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                      <td>{log.recordedByName || <span className="text-muted">—</span>}</td>
                      <td>
                        <div className="compost-param-log-alerts">
                          {a.highTemperature ? (
                            <span className="compost-param-alert compost-param-alert--temp" title="Temperature above 75°C">
                              Temp {">"} 75°C
                            </span>
                          ) : null}
                          {a.lowMoisture ? (
                            <span className="compost-param-alert compost-param-alert--moisture" title="Moisture below 65%">
                              Moisture {"<"} 65%
                            </span>
                          ) : null}
                          {!a.highTemperature && !a.lowMoisture ? (
                            <span
                              className="compost-param-alert compost-param-alert--ok"
                              title="Temperature ≤ 75°C and moisture ≥ 65%"
                            >
                              OK
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {batch.notes ? (
        <div className="card card-soft">
          <h3 className="panel-title">Batch notes</h3>
          <p className="page-lead" style={{ marginBottom: 0 }}>
            {batch.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}
