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
  formatShortDate,
  formatStockQty
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
  const [manualChoice, setManualChoice] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadBatch = useCallback(async () => {
    if (!batchId) return;
    const data = await apiFetch(`/plant-ops/compost-batches/${batchId}`);
    setBatch(data);
    setManualChoice(data.manualStatus || "");
  }, [batchId]);

  const advanceTarget = batch?.nextOperationalStage;

  const loadResourceOptions = useCallback(async () => {
    if (!batchId || !batch?.isManualOverride || !advanceTarget || advanceTarget === "done") {
      setResourceOptions([]);
      return;
    }
    const data = await apiFetch(
      `/plant-ops/resource-options?status=${encodeURIComponent(advanceTarget)}&excludeBatchId=${encodeURIComponent(batchId)}`
    );
    setResourceOptions((data.resources || []).filter((r) => r.available));
  }, [batchId, batch?.isManualOverride, advanceTarget]);

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
    if (!batch?.isManualOverride || !advanceTarget || advanceTarget === "done") return;
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
  }, [batch?.isManualOverride, advanceTarget, loadResourceOptions]);

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

  async function saveManualOverride(clear) {
    setError("");
    setMessage("");
    try {
      const manualStatus = clear ? null : manualChoice || null;
      if (!clear && !manualStatus) {
        setError("Pick a status to apply, or use Clear override.");
        return;
      }
      await apiFetch(`/plant-ops/compost-batches/${batchId}`, {
        method: "PATCH",
        body: JSON.stringify({ manualStatus })
      });
      setMessage(clear ? "Reverted to automatic timeline." : "Manual status saved.");
      await loadBatch();
    } catch (err) {
      setError(err.message);
    }
  }

  async function advanceStage(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!batch?.isManualOverride) {
      setError("Apply a manual status override first to unlock stage movement.");
      return;
    }
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
    if (!rawMaterials.length) {
      setError(
        "For at least one raw material, choose a catalogue item and enter a positive quantity for one vendor."
      );
      return;
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
    const active = batch.effectiveStatus;
    return batch.timeline.stages.map((s) => {
      const order = STATUS_OPTIONS.indexOf(s.key);
      const activeOrder = STATUS_OPTIONS.indexOf(active);
      let cls = "compost-timeline__step";
      if (s.key === active) cls += " compost-timeline__step--active";
      else if (order < activeOrder) cls += " compost-timeline__step--past";
      return { ...s, cls };
    });
  }, [batch]);

  const clusteredRawMaterials = useMemo(
    () => clusterRawMaterialLines(batch?.rawMaterialLines),
    [batch?.rawMaterialLines]
  );

  if (!batch) {
    return (
      <div className="page-stack">
        <p className="page-lead">{error || "Loading…"}</p>
      </div>
    );
  }

  const atDone = batch.operationalStageKey === "done" || !batch.nextOperationalStage;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Plant operations"
        title={batch.batchName}
        description={`Started ${formatShortDate(batch.startDate)} · Workflow: ${compostStageDisplayLabel(batch.operationalStageKey)} · ${batch.isManualOverride ? "Manual timeline override" : "Automatic timeline"}`}
      >
        <Link href="/plant-operations" className="btn btn-ghost">
          ← All batches
        </Link>
      </PageHeader>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <div className="card">
        <h3 className="panel-title">Status &amp; progress</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <span className={compostStagePillClass(batch.effectiveStatus)}>
            {compostStageDisplayLabel(batch.effectiveStatus)}
          </span>
          <span className={compostStagePillClass(batch.operationalStageKey)}>
            Workflow: {compostStageDisplayLabel(batch.operationalStageKey)}
          </span>
          {batch.isManualOverride ? (
            <span className="tag">
              Manual override (computed would be: {compostStageDisplayLabel(batch.computedStatus)})
            </span>
          ) : (
            <span className="text-muted">Computed from dates: {batch.computedStatus}</span>
          )}
        </div>
        <div className="compost-progress-wrap" style={{ marginTop: 16, maxWidth: 480 }}>
          <div className="compost-progress">
            <div className="compost-progress__fill" style={{ width: `${Math.round((batch.progress || 0) * 100)}%` }} />
          </div>
          <div className="compost-progress-foot">{compostCycleDayDisplay(batch)}</div>
        </div>
        <p className="page-lead" style={{ marginTop: 12, marginBottom: 0 }}>
          Overall span to end of pasteurisation: <strong>{batch.timeline?.totalSpanDays ?? 20}</strong> days.
        </p>
      </div>

      <div className="card">
        <h3 className="panel-title">Stage timeline</h3>
        <p className="page-lead" style={{ marginBottom: 12 }}>
          Expected window for each stage from the batch start date (UTC midnight on the chosen calendar day).
        </p>
        <div className="compost-timeline">
          {timelineSteps.map((s) => (
            <div key={s.key} className={s.cls}>
              <div className="compost-timeline__label">{s.label}</div>
              <div className="compost-timeline__meta">
                {s.days ? `${s.days} day(s)` : "Final"} · start {formatShortDate(s.startsAt)}
                {s.endsAt ? (
                  <>
                    {" "}
                    → end {formatShortDate(s.endsAt)}
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="panel-title">Manual status override</h3>
        <p className="page-lead" style={{ marginBottom: 12 }}>
          Choose the lifecycle stage that matches what you are about to record, then click <strong>Apply override</strong>. That
          unlocks the <strong>Advance workflow</strong> form inside <strong>Stage movements</strong> so you can commit the next
          resource allocation and raw material draw. Clear override when you want to hide that form again.
        </p>
        <div className="grid grid-3" style={{ alignItems: "end" }}>
          <div>
            <label>Status</label>
            <select className="input" value={manualChoice} onChange={(e) => setManualChoice(e.target.value)}>
              <option value="">(automatic)</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {compostStageDisplayLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn" onClick={() => void saveManualOverride(false)}>
            Apply override
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void saveManualOverride(true)}>
            Clear override
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="panel-title">Stage movements</h3>
        <p className="page-lead" style={{ marginBottom: 12 }}>
          History of each workflow step (resources opened and raw material committed). After you apply a{" "}
          <strong>manual status override</strong> above, use <strong>Advance workflow</strong> here to record the next
          movement.
        </p>
        <div className="table-wrap">
          <table className="table">
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

        <div className="panel-inset panel-inset--strong" style={{ marginTop: 20 }}>
          <h4 className="panel-title" style={{ fontSize: 15, marginBottom: 10 }}>
            Advance workflow
          </h4>
          {atDone ? (
            <p className="page-lead" style={{ marginBottom: 0 }}>
              This batch has reached <strong>compost ready</strong>. No further stage movements are available.
            </p>
          ) : !batch.isManualOverride ? (
            <p className="page-lead" style={{ marginBottom: 0 }}>
              To record the next stage movement, set <strong>Manual status override</strong> above to the stage you are working
              in, then click <strong>Apply override</strong>. The advance form will appear here.
            </p>
          ) : (
            <>
              <p className="page-lead" style={{ marginBottom: 12 }}>
                Move the batch from <strong>{compostStageDisplayLabel(batch.operationalStageKey)}</strong> to{" "}
                <strong>{compostStageDisplayLabel(advanceTarget)}</strong>. Record one or more raw materials with quantities per
                vendor;{" "}
                {advanceTarget === "done" ? (
                  <>no new plant resource is required for the final step.</>
                ) : (
                  <>
                    pick one available <strong>{resourceOptions[0]?.resourceType || "plant resource"}</strong> allowed for the
                    next stage.
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
                    <label style={{ marginBottom: 0 }}>Raw materials</label>
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
