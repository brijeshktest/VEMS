"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api.js";
import PageHeader from "../../../components/PageHeader.js";
import {
  compostStagePillClass,
  compostStageDisplayLabel,
  compostCycleDayDisplay,
  compostEstimatedReadyIso,
  formatShortDate,
  formatStockQty
} from "../../../lib/compostUi.js";
import { useConfirmDialog } from "../../../components/ConfirmDialog.js";
import { DeleteIconButton, ParameterLogIconButton, ViewIconLink } from "../../../components/EditDeleteIconButtons.js";

function newRawMaterialLineId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** One compost raw material + per-vendor qty rows (filled when material is chosen). */
function newRawMaterialLine() {
  return { lineId: newRawMaterialLineId(), materialId: "", vendorQtyRows: [] };
}

function getInitialForm() {
  return {
    batchName: "",
    startDate: "",
    quantity: "",
    notes: "",
    growingRoomId: "",
    rawMaterialLines: [newRawMaterialLine()],
    rawMaterialNote: ""
  };
}

/** `yyyy-mm-dd` in local time for `<input type="date" />`. */
function todayLocalDateInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextShCompostBatchNameFromList(batchList) {
  let max = 0;
  const re = /^SH-C-#(\d+)$/i;
  for (const b of batchList || []) {
    const m = re.exec(String(b.batchName || "").trim());
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return `SH-C-#${String(max + 1).padStart(3, "0")}`;
}

function vendorQtyTemplateFromMaterial(m) {
  if (!m) return [];
  return (m.byVendor || []).map((v) => ({
    vendorId: String(v.vendorId),
    vendorName: v.vendorName,
    maxAvailable: Number(v.availableQuantity) || 0,
    qty: ""
  }));
}

const LOW_STOCK_THRESHOLD = 15;

/**
 * Second detail line under location: fixed single-line height on every card so busy “Est.” text
 * does not change overall card height vs available slots.
 */
function PlantSlotMetaSecondLine({ room }) {
  if (!room) {
    return <div className="plant-capacity-slot__meta-row" aria-hidden />;
  }
  if (room.available) {
    return (
      <div className="plant-capacity-slot__meta-row plant-capacity-slot__meta-row--dim">
        <span className="visually-hidden">No occupancy estimate for an available room.</span>
      </div>
    );
  }
  if (room.availableFrom) {
    const full = [
      `Est. available from ${formatShortDate(room.availableFrom)}`,
      room.holdingBatchName || ""
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <div className="plant-capacity-slot__meta-row" title={full}>
        <span className="plant-capacity-slot__avail-est-label">Est. from </span>
        <strong>{formatShortDate(room.availableFrom)}</strong>
        {room.holdingBatchName ? (
          <span className="plant-capacity-slot__avail-est-meta"> · {room.holdingBatchName}</span>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className="plant-capacity-slot__meta-row plant-capacity-slot__meta-row--muted"
      title="Estimate appears when this room is tied to a batch stage on the compost calendar."
    >
      Estimate pending
    </div>
  );
}

/** Out when total available is 0; low when total is under 15 or any vendor has available under 15 (but not zero). */
function rawMaterialAvailabilityTag(m) {
  const total = Number(m.totalAvailableQuantity) || 0;
  if (!Number.isFinite(total) || total <= 0) return "out";
  if (total < LOW_STOCK_THRESHOLD) return "low";
  const vendors = m.byVendor || [];
  if (
    vendors.some((v) => {
      const a = Number(v.availableQuantity) || 0;
      return a > 0 && a < LOW_STOCK_THRESHOLD;
    })
  ) {
    return "low";
  }
  return null;
}

/** Sort by name; fill `count` slots (null = vacant). */
function fillResourceSlots(rooms, count) {
  const sorted = [...(rooms || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const slots = [];
  for (let i = 0; i < count; i += 1) {
    slots.push(sorted[i] ?? null);
  }
  return { slots, overflow: Math.max(0, sorted.length - count) };
}

export default function PlantOperationsPage() {
  const router = useRouter();
  const [batches, setBatches] = useState([]);
  const [rawExpenseSummary, setRawExpenseSummary] = useState([]);
  const [availablePlant, setAvailablePlant] = useState(null);
  const [wettingResources, setWettingResources] = useState([]);
  const [form, setForm] = useState(() => getInitialForm());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState(null);
  const [logModalBatch, setLogModalBatch] = useState(null);
  const [logForm, setLogForm] = useState({ temperatureC: "", moisturePercent: "", ammoniaLevel: "" });
  const [logModalError, setLogModalError] = useState("");
  const [logSaving, setLogSaving] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const canPlantEdit = permissions === "all" || Boolean(permissions?.plantOperations?.edit);

  const lagoonStats = useMemo(() => {
    const list = availablePlant?.byType?.Lagoon || [];
    const total = list.length;
    const free = list.filter((r) => r.available).length;
    return {
      total,
      free,
      allBusy: total > 0 && free === 0,
      noneConfigured: total === 0
    };
  }, [availablePlant]);

  /** Fixed plant layout: 1 lagoon, 3 bunkers, 2 tunnels (first N rooms by name). */
  const plantSlotBoard = useMemo(() => {
    if (!availablePlant?.byType) return null;
    return {
      lagoon: fillResourceSlots(availablePlant.byType.Lagoon || [], 1),
      bunker: fillResourceSlots(availablePlant.byType.Bunker || [], 3),
      tunnel: fillResourceSlots(availablePlant.byType.Tunnel || [], 2)
    };
  }, [availablePlant]);

  const load = useCallback(async () => {
    try {
      const [meData, permData, batchData, rawSummary, apr, wetting] = await Promise.all([
        apiFetch("/auth/me").catch(() => ({})),
        apiFetch("/auth/permissions").catch(() => ({ permissions: {} })),
        apiFetch("/plant-ops/compost-batches"),
        apiFetch("/plant-ops/raw-materials-expense-summary").catch(() => []),
        apiFetch("/plant-ops/available-plant-resources").catch(() => null),
        apiFetch("/plant-ops/resource-options?status=wetting").catch(() => ({ resources: [] }))
      ]);
      setIsAdmin(meData.user?.role === "admin");
      setPermissions(permData.permissions ?? {});
      setBatches(Array.isArray(batchData) ? batchData : []);
      setRawExpenseSummary(Array.isArray(rawSummary) ? rawSummary : []);
      setAvailablePlant(apr && apr.byType ? apr : null);
      setWettingResources(Array.isArray(wetting.resources) ? wetting.resources.filter((r) => r.available) : []);
    } catch (err) {
      setError(err.message);
      if (String(err.message).includes("Insufficient")) {
        router.replace("/work-mode");
      }
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function openCreateModal() {
    setModalError("");
    const startDate = todayLocalDateInputValue();
    let batchName = nextShCompostBatchNameFromList(batches);
    try {
      const next = await apiFetch("/plant-ops/compost-batches/next-batch-code");
      if (next && typeof next.batchName === "string" && next.batchName.trim()) {
        batchName = next.batchName.trim();
      }
    } catch {
      /* use client-derived batchName from batches list */
    }
    setForm({
      ...getInitialForm(),
      batchName,
      startDate
    });
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
    setModalError("");
  }

  function openLogModal(batch) {
    setLogModalError("");
    setLogForm({ temperatureC: "", moisturePercent: "", ammoniaLevel: "" });
    setLogModalBatch(batch);
  }

  function closeLogModal() {
    setLogModalBatch(null);
    setLogModalError("");
    setLogSaving(false);
  }

  async function submitDailyParameterLog(e) {
    e.preventDefault();
    if (!logModalBatch?._id) return;
    setLogModalError("");
    const temp = Number(logForm.temperatureC);
    const moisture = Number(logForm.moisturePercent);
    const ammonia = Number(logForm.ammoniaLevel);
    if (!Number.isFinite(temp)) {
      setLogModalError("Enter a valid temperature (°C).");
      return;
    }
    if (!Number.isFinite(moisture) || moisture < 0 || moisture > 100) {
      setLogModalError("Moisture must be between 0 and 100%.");
      return;
    }
    if (!Number.isFinite(ammonia) || ammonia < 0) {
      setLogModalError("Enter a valid ammonia level (0 or greater).");
      return;
    }
    setLogSaving(true);
    try {
      await apiFetch(`/plant-ops/compost-batches/${logModalBatch._id}/daily-parameter-logs`, {
        method: "POST",
        body: JSON.stringify({
          temperatureC: temp,
          moisturePercent: moisture,
          ammoniaLevel: ammonia
        })
      });
      setMessage("Daily parameter log saved.");
      closeLogModal();
      await load();
    } catch (err) {
      setLogModalError(err.message || "Could not save log.");
    } finally {
      setLogSaving(false);
    }
  }

  function setRawLineMaterial(lineId, materialId) {
    setForm((prev) => ({
      ...prev,
      rawMaterialLines: prev.rawMaterialLines.map((ln) => {
        if (ln.lineId !== lineId) return ln;
        const m = rawExpenseSummary.find((x) => String(x.materialId || x._id) === String(materialId));
        return {
          ...ln,
          materialId,
          vendorQtyRows: vendorQtyTemplateFromMaterial(m || null)
        };
      })
    }));
  }

  function setRawLineVendorQty(lineId, rowIdx, qty) {
    setForm((prev) => ({
      ...prev,
      rawMaterialLines: prev.rawMaterialLines.map((ln) => {
        if (ln.lineId !== lineId) return ln;
        return {
          ...ln,
          vendorQtyRows: ln.vendorQtyRows.map((r, i) => (i === rowIdx ? { ...r, qty } : r))
        };
      })
    }));
  }

  function addRawMaterialLine() {
    setForm((prev) => ({ ...prev, rawMaterialLines: [...prev.rawMaterialLines, newRawMaterialLine()] }));
  }

  function removeRawMaterialLine(lineId) {
    setForm((prev) => {
      if (prev.rawMaterialLines.length <= 1) {
        return { ...prev, rawMaterialLines: [newRawMaterialLine()] };
      }
      return { ...prev, rawMaterialLines: prev.rawMaterialLines.filter((ln) => ln.lineId !== lineId) };
    });
  }

  async function onCreate(e) {
    e.preventDefault();
    setModalError("");
    if (lagoonStats.allBusy) {
      setModalError("The lagoon is currently in use. You cannot initiate a new batch.");
      return;
    }
    if (!form.growingRoomId) {
      setModalError("Select an available Lagoon for wetting.");
      return;
    }
    const rawMaterials = [];
    for (const ln of form.rawMaterialLines) {
      if (!ln.materialId) continue;
      const m = rawExpenseSummary.find((x) => String(x.materialId || x._id) === String(ln.materialId));
      const label = m?.name || "this material";
      for (const row of ln.vendorQtyRows) {
        const q = Number(row.qty) || 0;
        if (q > row.maxAvailable + 1e-6) {
          setModalError(
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
      setModalError("For at least one raw material, choose a catalogue item and enter a positive quantity for one vendor.");
      return;
    }
    try {
      await apiFetch("/plant-ops/compost-batches", {
        method: "POST",
        body: JSON.stringify({
          batchName: form.batchName.trim(),
          startDate: form.startDate,
          quantity: form.quantity === "" ? undefined : Number(form.quantity),
          notes: form.notes.trim() || undefined,
          resources: [{ growingRoomId: form.growingRoomId }],
          rawMaterials,
          rawMaterialNote: form.rawMaterialNote.trim() || undefined
        })
      });
      setForm(getInitialForm());
      setMessage("Batch created with wetting resources and raw material usage recorded.");
      closeCreateModal();
      await load();
    } catch (err) {
      setModalError(err.message);
    }
  }

  async function deleteBatch(b) {
    const label = (b.batchName || "").trim() || "this batch";
    const ok = await confirm({
      title: "Delete compost batch?",
      message: `Permanently remove “${label}”? Raw material allocations on this batch will be released back to available stock. This cannot be undone.`
    });
    if (!ok) return;
    setError("");
    setMessage("");
    try {
      await apiFetch(`/plant-ops/compost-batches/${b._id}`, { method: "DELETE" });
      setMessage("Batch deleted.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page-stack">
      {dialog}
      <PageHeader
        eyebrow="Operations"
        title="Plant operations"
        description="Compost batch lifecycle: wetting through pasteurisation with a planned calendar for reference, manual stage advances on each batch, resource allocation per movement, and raw material tracking from the expense catalogue."
      >
        <Link href="/dashboard" className="btn btn-ghost">
          ← Dashboard
        </Link>
        <button type="button" className="btn" onClick={openCreateModal}>
          Create compost batch
        </button>
      </PageHeader>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <div className="card">
        <h3 className="panel-title">Available raw material stock</h3>
        <p className="page-lead" style={{ marginBottom: 16 }}>
          Quantities from <strong>vouchers</strong> (expense module) minus amounts <strong>committed on compost batches</strong>,
          split by vendor. Use this as the live picture before allocating material to a batch.
        </p>
        {rawExpenseSummary.length === 0 ? (
          <p className="cell-empty" style={{ marginBottom: 0 }}>
            No raw materials in the catalogue.
          </p>
        ) : (
          <div className="raw-stock-grid">
            {rawExpenseSummary.map((m) => {
              const stockTag = rawMaterialAvailabilityTag(m);
              return (
              <div key={String(m.materialId || m._id)} className="raw-stock-card">
                <div className="raw-stock-card__head">
                  <h4 className="raw-stock-card__title">{m.name}</h4>
                  <div className="raw-stock-card__head-aside">
                    {stockTag === "out" ? (
                      <span className="raw-stock-tag raw-stock-tag--out">Out of stock</span>
                    ) : stockTag === "low" ? (
                      <span className="raw-stock-tag raw-stock-tag--low">Low stock</span>
                    ) : null}
                    <span className="raw-stock-card__unit">{m.unit || "—"}</span>
                  </div>
                </div>
                <div className="raw-stock-card__metrics">
                  <div className="raw-stock-metric raw-stock-metric--avail">
                    <span className="raw-stock-metric__label">Available</span>
                    <span className="raw-stock-metric__value">{formatStockQty(m.totalAvailableQuantity ?? 0)}</span>
                  </div>
                  <div className="raw-stock-metric">
                    <span className="raw-stock-metric__label">Purchased (vouchers)</span>
                    <span className="raw-stock-metric__value">{formatStockQty(m.totalExpenseQuantity ?? 0)}</span>
                  </div>
                  <div className="raw-stock-metric">
                    <span className="raw-stock-metric__label">On batches</span>
                    <span className="raw-stock-metric__value">{formatStockQty(m.totalCompostUsed ?? 0)}</span>
                  </div>
                </div>
                {m.totalExpenseQuantity > 0 ? (
                  <div
                    className="raw-stock-card__bar"
                    title={`${Math.round(((m.totalAvailableQuantity ?? 0) / m.totalExpenseQuantity) * 100)}% available`}
                  >
                    <div
                      className="raw-stock-card__bar-fill"
                      style={{
                        width: `${Math.min(100, Math.round(((m.totalAvailableQuantity ?? 0) / m.totalExpenseQuantity) * 100))}%`
                      }}
                    />
                  </div>
                ) : null}
                {(m.byVendor || []).length ? (
                  <ul className="raw-stock-vendor-list">
                    {m.byVendor.map((v) => (
                      <li key={String(v.vendorId)} className="raw-stock-vendor-row">
                        <span className="raw-stock-vendor-name">{v.vendorName}</span>
                        <span className="raw-stock-vendor-nums">
                          <strong>{formatStockQty(v.availableQuantity ?? 0)}</strong>
                          <span className="text-muted"> avail</span>
                          <span className="text-muted"> · {formatStockQty(v.compostUsed ?? 0)} on batches</span>
                          <span className="text-muted"> · {formatStockQty(v.expenseQuantity ?? 0)} bought</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cell-empty" style={{ marginBottom: 0, fontSize: 13 }}>
                    No voucher purchases for this material.
                  </p>
                )}
              </div>
            );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="panel-title">Available plant resources</h3>
        <p className="page-lead" style={{ marginBottom: 16 }}>
          Fixed layout for this site: <strong>1 lagoon</strong> (wetting), <strong>3 bunkers</strong>, <strong>2 tunnels</strong>.
          Rooms are shown in name order; extra catalogue entries beyond these slots are noted under each group.{" "}
          <strong>Available</strong> means no open allocation on an active batch. When a room is in use,{" "}
          <strong>Est. available from</strong> is the planned end of that allocation&apos;s compost stage from the holding
          batch&apos;s start date (standard timeline). On wide screens the three groups appear in one row.
        </p>
        {!availablePlant || !plantSlotBoard ? (
          <p className="cell-empty" style={{ marginBottom: 0 }}>
            Could not load plant resource availability.
          </p>
        ) : (
          <div className="plant-capacity-board">
            <div className="plant-capacity-board__strip">
            <section className="plant-capacity-row">
              <header className="plant-capacity-row__head">
                <h4 className="plant-capacity-row__title">Lagoon</h4>
                <span className="plant-capacity-row__meta">
                  {(() => {
                    const r = plantSlotBoard.lagoon.slots[0];
                    if (!r) return "1 slot · not configured";
                    return `1 slot · wetting · ${r.available ? "free" : "in use"}`;
                  })()}
                </span>
              </header>
              <div className="plant-capacity-slots plant-capacity-slots--1">
                {plantSlotBoard.lagoon.slots.map((room, idx) =>
                  room ? (
                    <div
                      key={String(room._id)}
                      className={`plant-capacity-slot ${room.available ? "plant-capacity-slot--free" : "plant-capacity-slot--busy"}`}
                    >
                      <div className="plant-capacity-slot__head">
                        <span className="plant-capacity-slot__title">{room.name}</span>
                      </div>
                      <div className="plant-capacity-slot__body">
                        <div className="plant-capacity-slot__loc">{room.locationInPlant || "No location set"}</div>
                        <PlantSlotMetaSecondLine room={room} />
                      </div>
                      <span className="plant-capacity-slot__status">{room.available ? "Available" : "In use"}</span>
                    </div>
                  ) : (
                    <div key={`lagoon-empty-${idx}`} className="plant-capacity-slot plant-capacity-slot--vacant">
                      <span className="plant-capacity-slot__badge">Lagoon</span>
                      <p className="plant-capacity-slot__vacant-msg">No lagoon configured in the catalogue.</p>
                    </div>
                  )
                )}
              </div>
              {plantSlotBoard.lagoon.overflow > 0 ? (
                <p className="plant-capacity-overflow">
                  +{plantSlotBoard.lagoon.overflow} other Lagoon room(s) in the catalogue are not shown in this single slot.
                </p>
              ) : null}
            </section>

            <section className="plant-capacity-row">
              <header className="plant-capacity-row__head">
                <h4 className="plant-capacity-row__title">Bunkers</h4>
                <span className="plant-capacity-row__meta">
                  {(() => {
                    const s = plantSlotBoard.bunker.slots;
                    const filled = s.filter(Boolean);
                    const free = filled.filter((r) => r.available).length;
                    const busy = filled.length - free;
                    const vacant = s.filter((r) => !r).length;
                    return `3 slots · ${free} free · ${busy} in use${vacant ? ` · ${vacant} vacant` : ""}`;
                  })()}
                </span>
              </header>
              <div className="plant-capacity-slots plant-capacity-slots--3">
                {plantSlotBoard.bunker.slots.map((room, idx) =>
                  room ? (
                    <div
                      key={String(room._id)}
                      className={`plant-capacity-slot ${room.available ? "plant-capacity-slot--free" : "plant-capacity-slot--busy"}`}
                    >
                      <div className="plant-capacity-slot__head">
                        <span className="plant-capacity-slot__slot-idx" title={`Bunker slot ${idx + 1}`}>
                          {idx + 1}
                        </span>
                        <span className="plant-capacity-slot__title">{room.name}</span>
                      </div>
                      <div className="plant-capacity-slot__body">
                        <div className="plant-capacity-slot__loc">{room.locationInPlant || "No location set"}</div>
                        <PlantSlotMetaSecondLine room={room} />
                      </div>
                      <span className="plant-capacity-slot__status">{room.available ? "Available" : "In use"}</span>
                    </div>
                  ) : (
                    <div key={`bunker-vacant-${idx}`} className="plant-capacity-slot plant-capacity-slot--vacant">
                      <span className="plant-capacity-slot__badge">Bunker {idx + 1}</span>
                      <p className="plant-capacity-slot__vacant-msg">Vacant — add a Bunker room in admin or leave unused.</p>
                    </div>
                  )
                )}
              </div>
              {plantSlotBoard.bunker.overflow > 0 ? (
                <p className="plant-capacity-overflow">
                  +{plantSlotBoard.bunker.overflow} other Bunker room(s) exist in the catalogue (not shown in these 3 slots).
                </p>
              ) : null}
            </section>

            <section className="plant-capacity-row">
              <header className="plant-capacity-row__head">
                <h4 className="plant-capacity-row__title">Tunnels</h4>
                <span className="plant-capacity-row__meta">
                  {(() => {
                    const s = plantSlotBoard.tunnel.slots;
                    const filled = s.filter(Boolean);
                    const free = filled.filter((r) => r.available).length;
                    const busy = filled.length - free;
                    const vacant = s.filter((r) => !r).length;
                    return `2 slots · ${free} free · ${busy} in use${vacant ? ` · ${vacant} vacant` : ""}`;
                  })()}
                </span>
              </header>
              <div className="plant-capacity-slots plant-capacity-slots--2">
                {plantSlotBoard.tunnel.slots.map((room, idx) =>
                  room ? (
                    <div
                      key={String(room._id)}
                      className={`plant-capacity-slot ${room.available ? "plant-capacity-slot--free" : "plant-capacity-slot--busy"}`}
                    >
                      <div className="plant-capacity-slot__head">
                        <span className="plant-capacity-slot__slot-idx" title={`Tunnel slot ${idx + 1}`}>
                          {idx + 1}
                        </span>
                        <span className="plant-capacity-slot__title">{room.name}</span>
                      </div>
                      <div className="plant-capacity-slot__body">
                        <div className="plant-capacity-slot__loc">{room.locationInPlant || "No location set"}</div>
                        <PlantSlotMetaSecondLine room={room} />
                      </div>
                      <span className="plant-capacity-slot__status">{room.available ? "Available" : "In use"}</span>
                    </div>
                  ) : (
                    <div key={`tunnel-vacant-${idx}`} className="plant-capacity-slot plant-capacity-slot--vacant">
                      <span className="plant-capacity-slot__badge">Tunnel {idx + 1}</span>
                      <p className="plant-capacity-slot__vacant-msg">Vacant — add a Tunnel room in admin or leave unused.</p>
                    </div>
                  )
                )}
              </div>
              {plantSlotBoard.tunnel.overflow > 0 ? (
                <p className="plant-capacity-overflow">
                  +{plantSlotBoard.tunnel.overflow} other Tunnel room(s) exist in the catalogue (not shown in these 2 slots).
                </p>
              ) : null}
            </section>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="panel-title">All compost batches</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Batch</th>
                <th style={{ minWidth: 200 }}>Start · est. compost ready</th>
                <th>Status</th>
                <th>Workflow</th>
                <th>Progress</th>
                <th>Timeline display</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <span className="cell-empty">No batches yet. Use “Create compost batch” to add one.</span>
                  </td>
                </tr>
              ) : (
                batches.map((b) => {
                  const estReadyIso = compostEstimatedReadyIso(b);
                  return (
                  <tr key={b._id}>
                    <td>
                      <strong>{b.batchName}</strong>
                      {b.quantity != null ? (
                        <span className="text-muted" style={{ display: "block", fontSize: 12, marginTop: 4 }}>
                          Qty: {b.quantity}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <div className="dashboard-compost-timeline-dates">
                        <div>
                          <span className="dashboard-compost-date-label">Started</span>{" "}
                          <span className="dashboard-compost-date-value">{formatShortDate(b.startDate)}</span>
                        </div>
                        <div>
                          <span className="dashboard-compost-date-label">Est. ready</span>{" "}
                          <span className="dashboard-compost-date-value">
                            {estReadyIso ? formatShortDate(estReadyIso) : "—"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={compostStagePillClass(b.effectiveStatus)}>
                        {compostStageDisplayLabel(b.effectiveStatus)}
                      </span>
                    </td>
                    <td>
                      <span className="text-muted" style={{ fontSize: 13 }}>
                        {compostStageDisplayLabel(b.operationalStageKey)}
                        {b.nextOperationalStage ? (
                          <>
                            {" "}
                            → next: <strong>{compostStageDisplayLabel(b.nextOperationalStage)}</strong>
                          </>
                        ) : null}
                      </span>
                    </td>
                    <td style={{ minWidth: 140 }}>
                      <div className="compost-progress-wrap">
                        <div className="compost-progress" title={`${Math.round((b.progress || 0) * 100)}%`}>
                          <div className="compost-progress__fill" style={{ width: `${Math.round((b.progress || 0) * 100)}%` }} />
                        </div>
                        <div className="compost-progress-foot">{compostCycleDayDisplay(b)}</div>
                      </div>
                    </td>
                    <td>
                      {b.isManualOverride ? (
                        <span className="tag">Override</span>
                      ) : (
                        <span className="text-muted">From dates</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <ViewIconLink href={`/plant-operations/${b._id}`} title="View batch" aria-label="View batch details" />
                        {canPlantEdit && b.operationalStageKey !== "done" ? (
                          <ParameterLogIconButton
                            onClick={() => openLogModal(b)}
                            title="Add daily parameter log"
                            aria-label={`Add daily parameter log for ${b.batchName}`}
                          />
                        ) : null}
                        {isAdmin && b.operationalStageKey !== "done" ? (
                          <DeleteIconButton onClick={() => void deleteBatch(b)} title="Delete batch (admin)" />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {isAdmin ? (
          <p className="page-lead" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
            Admins can delete a batch only until workflow has <strong>not</strong> reached compost ready.
          </p>
        ) : null}
      </div>

      {createModalOpen ? (
        <div
          className="voucher-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCreateModal();
          }}
        >
          <div
            className="voucher-modal-dialog voucher-modal-dialog--narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compost-create-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="compost-create-modal-title" className="voucher-modal-title">
                Create compost batch
              </h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={closeCreateModal}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body" style={{ overflow: "auto" }}>
              {lagoonStats.allBusy ? (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  The lagoon is currently in use. You cannot initiate a new batch.
                </div>
              ) : null}
              {lagoonStats.noneConfigured ? (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  No Lagoon rooms are configured. Add Lagoon resources under admin before starting a batch.
                </div>
              ) : null}
              <p className="page-lead" style={{ marginBottom: 16 }}>
                New batches start in <strong>Wetting</strong>. Choose a free <strong>Lagoon</strong> and record one or more{" "}
                <strong>raw materials</strong> with quantities per vendor.
              </p>
              {modalError ? <div className="alert alert-error" style={{ marginBottom: 12 }}>{modalError}</div> : null}
              <form className="section-stack voucher-modal-form" onSubmit={onCreate} style={{ gap: 16 }}>
                <div className="grid grid-3">
                  <div>
                    <label>Batch name / ID</label>
                    <input
                      className="input"
                      placeholder="SH-C-#001"
                      value={form.batchName}
                      onChange={(e) => setForm({ ...form, batchName: e.target.value })}
                      required
                    />
                    <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                      Auto-filled as <strong>SH-C-#001</strong>, <strong>SH-C-#002</strong>, … from existing batches. You can edit
                      if needed.
                    </p>
                  </div>
                  <div>
                    <label>Start date</label>
                    <input
                      className="input"
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      required
                    />
                    <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                      Defaults to <strong>today</strong>; change if the batch actually started on another day.
                    </p>
                  </div>
                  <div>
                    <label>Quantity (optional)</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. tons or m³"
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label>Wetting lagoon</label>
                  <select
                    className="input"
                    value={form.growingRoomId}
                    onChange={(e) => setForm({ ...form, growingRoomId: e.target.value })}
                    required
                    disabled={lagoonStats.allBusy || lagoonStats.noneConfigured}
                  >
                    <option value="">Select an available Lagoon…</option>
                    {wettingResources.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.name}
                        {r.locationInPlant ? ` · ${r.locationInPlant}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="section-stack" style={{ gap: 14 }}>
                  <div className="flex flex-wrap" style={{ alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <label style={{ marginBottom: 0 }}>Raw materials</label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: 13, padding: "6px 12px" }}
                      disabled={lagoonStats.allBusy || lagoonStats.noneConfigured}
                      onClick={addRawMaterialLine}
                    >
                      Add material
                    </button>
                  </div>
                  {form.rawMaterialLines.map((ln, lineIdx) => {
                    const mat = ln.materialId
                      ? rawExpenseSummary.find((m) => String(m.materialId || m._id) === String(ln.materialId)) || null
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
                            disabled={lagoonStats.allBusy || lagoonStats.noneConfigured}
                            onClick={() => removeRawMaterialLine(ln.lineId)}
                          >
                            Remove
                          </button>
                        </div>
                        <label className="visually-hidden" htmlFor={`compost-raw-mat-${ln.lineId}`}>
                          Raw material {lineIdx + 1}
                        </label>
                        <select
                          id={`compost-raw-mat-${ln.lineId}`}
                          className="input"
                          value={ln.materialId}
                          onChange={(e) => setRawLineMaterial(ln.lineId, e.target.value)}
                          disabled={lagoonStats.allBusy || lagoonStats.noneConfigured}
                        >
                          <option value="">Select…</option>
                          {rawExpenseSummary.map((m) => (
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
                                    onChange={(e) => setRawLineVendorQty(ln.lineId, idx, e.target.value)}
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
                  <label>Raw material note (optional)</label>
                  <input
                    className="input"
                    value={form.rawMaterialNote}
                    onChange={(e) => setForm({ ...form, rawMaterialNote: e.target.value })}
                  />
                </div>
                <div>
                  <label>Batch notes (optional)</label>
                  <input
                    className="input"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Any notes for this batch"
                  />
                </div>
                <div className="voucher-modal-actions" style={{ paddingTop: 8 }}>
                  <button
                    className="btn"
                    type="submit"
                    disabled={!wettingResources.length || lagoonStats.allBusy || lagoonStats.noneConfigured}
                  >
                    Create batch
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closeCreateModal}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {logModalBatch ? (
        <div
          className="voucher-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLogModal();
          }}
        >
          <div
            className="voucher-modal-dialog voucher-modal-dialog--narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compost-daily-log-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="compost-daily-log-modal-title" className="voucher-modal-title">
                Daily parameter log — {logModalBatch.batchName}
              </h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={closeLogModal}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body" style={{ overflow: "auto" }}>
              <p className="page-lead" style={{ marginBottom: 16 }}>
                Record <strong>temperature</strong> (°C), <strong>moisture</strong> (%), and <strong>ammonia level</strong> (ppm
                or your site standard). Alerts appear if temperature is above 75°C or moisture is below 65%. The current{" "}
                <strong>workflow stage</strong> and <strong>open plant resource allocations</strong> are stored automatically
                with this log.
              </p>
              {logModalError ? <div className="alert alert-error" style={{ marginBottom: 12 }}>{logModalError}</div> : null}
              <form className="section-stack voucher-modal-form" onSubmit={submitDailyParameterLog} style={{ gap: 14 }}>
                <div className="grid grid-3">
                  <div>
                    <label>Temperature (°C)</label>
                    <input
                      className="input"
                      type="number"
                      step="any"
                      required
                      value={logForm.temperatureC}
                      onChange={(e) => setLogForm((f) => ({ ...f, temperatureC: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>Moisture (%)</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      required
                      value={logForm.moisturePercent}
                      onChange={(e) => setLogForm((f) => ({ ...f, moisturePercent: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>Ammonia level</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={logForm.ammoniaLevel}
                      onChange={(e) => setLogForm((f) => ({ ...f, ammoniaLevel: e.target.value }))}
                      placeholder="e.g. ppm"
                    />
                  </div>
                </div>
                <div className="voucher-modal-actions" style={{ paddingTop: 8 }}>
                  <button className="btn" type="submit" disabled={logSaving}>
                    {logSaving ? "Saving…" : "Save log"}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closeLogModal} disabled={logSaving}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
