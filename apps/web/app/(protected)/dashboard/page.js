"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "../../../components/PageHeader.js";
import { ExcelDownloadIconButton } from "../../../components/EditDeleteIconButtons.js";
import { getWorkMode } from "../../../lib/workMode.js";
import { formatIndianRupee } from "../../../lib/formatIndianRupee.js";
import { downloadPerPersonContributionSummaryXlsx } from "../../../lib/exportContributionsExcel.js";

function paymentStatusClass(status) {
  if (status === "Paid") return "status-pill status-pill--paid";
  if (status === "Partially Paid") return "status-pill status-pill--partial";
  return "status-pill status-pill--pending";
}

/** Card / paid amount — bank card */
function IconStatPaid({ className = "" }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="1.5" y="5" width="21" height="14" rx="2" />
      <line x1="1.5" y1="10" x2="22.5" y2="10" />
    </svg>
  );
}

/** Tax — document with folded corner */
function IconStatTax({ className = "" }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="14" y2="17" />
    </svg>
  );
}

/** Vouchers — stacked slips */
function IconStatVouchers({ className = "" }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="4" width="14" height="11" rx="1" strokeOpacity="0.38" />
      <rect x="6" y="7" width="14" height="11" rx="1" />
      <line x1="9" y1="11" x2="17" y2="11" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [tax, setTax] = useState(null);
  const [roomPrompts, setRoomPrompts] = useState([]);
  const [roomSummary, setRoomSummary] = useState([]);
  const [tunnelPrompts, setTunnelPrompts] = useState([]);
  const [vendorTaxOpen, setVendorTaxOpen] = useState(false);
  const [voucherLatestOpen, setVoucherLatestOpen] = useState(false);
  const [paymentMadeByAgg, setPaymentMadeByAgg] = useState([]);
  const [paymentMadeByOpen, setPaymentMadeByOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [workMode, setWorkMode] = useState("");
  const [error, setError] = useState("");
  const [salesSummary, setSalesSummary] = useState(null);
  const [contributionSummary, setContributionSummary] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const selectedMode = getWorkMode();
        if (!selectedMode) {
          router.replace("/work-mode");
          return;
        }
        setWorkMode(selectedMode);
        const permissionsData = await apiFetch("/auth/permissions");
        const allowRoomStages =
          permissionsData.permissions === "all" ||
          permissionsData.permissions?.roomStages?.edit ||
          permissionsData.permissions?.roomStages?.view;
        const admin = permissionsData.permissions === "all";
        setIsAdmin(admin);
        if (selectedMode === "admin" && !admin) {
          router.replace("/work-mode");
          return;
        }

        if (selectedMode === "sales") {
          const canSales =
            permissionsData.permissions === "all" ||
            permissionsData.permissions?.sales?.view ||
            permissionsData.permissions?.sales?.edit;
          if (!canSales) {
            router.replace("/work-mode");
            return;
          }
        }

        if (selectedMode === "contributions") {
          const canContr =
            permissionsData.permissions === "all" ||
            permissionsData.permissions?.contributions?.view ||
            permissionsData.permissions?.contributions?.edit;
          if (!canContr) {
            router.replace("/work-mode");
            return;
          }
        }

        if (selectedMode === "expense" || selectedMode === "admin") {
          const [summaryData, vendorData, materialData, taxData, payerAgg] = await Promise.all([
            apiFetch("/reports/expenses"),
            apiFetch("/reports/vendor-expenses"),
            apiFetch("/reports/material-summary"),
            apiFetch("/reports/tax-payments"),
            apiFetch("/reports/payment-made-from-aggregate").catch(() => [])
          ]);
          setSummary(summaryData);
          setVendors(vendorData.slice(0, 5));
          setMaterials(materialData.slice(0, 5));
          setTax(taxData);
          setPaymentMadeByAgg(Array.isArray(payerAgg) ? payerAgg : []);
        }
        if (selectedMode === "room" || selectedMode === "admin") {
          if (!allowRoomStages) {
            router.replace("/work-mode");
            return;
          }
          const [roomData, tunnelAlerts] = await Promise.all([
            apiFetch("/rooms/status"),
            apiFetch("/tunnel-bunker/alerts").catch(() => ({ dueItems: [] }))
          ]);
          setRoomPrompts(roomData.filter((room) => room.dueNextStage));
          setRoomSummary(roomData);
          setTunnelPrompts(tunnelAlerts?.dueItems || []);
        }
        if (selectedMode === "tunnel") {
          const tunnelAlerts = await apiFetch("/tunnel-bunker/alerts");
          setTunnelPrompts(tunnelAlerts?.dueItems || []);
        }

        if (selectedMode === "sales" || selectedMode === "admin") {
          const canSales =
            permissionsData.permissions === "all" ||
            permissionsData.permissions?.sales?.view ||
            permissionsData.permissions?.sales?.edit;
          if (canSales) {
            try {
              const sm = await apiFetch("/sales/summary");
              setSalesSummary(sm);
            } catch {
              setSalesSummary(null);
            }
          } else {
            setSalesSummary(null);
          }
        }

        if (selectedMode === "contributions" || selectedMode === "admin") {
          const canContr =
            permissionsData.permissions === "all" ||
            permissionsData.permissions?.contributions?.view ||
            permissionsData.permissions?.contributions?.edit;
          if (canContr) {
            try {
              const cm = await apiFetch("/contributions/summary");
              setContributionSummary(cm);
            } catch {
              setContributionSummary(null);
            }
          } else {
            setContributionSummary(null);
          }
        }
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, [router]);

  const paymentMadeByRows = useMemo(
    () =>
      (paymentMadeByAgg || []).filter(
        (r) => (Number(r.totalPaidAmount) || 0) > 0 || (Number(r.voucherCount) || 0) > 0
      ),
    [paymentMadeByAgg]
  );

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

  async function moveTunnelBatch(batch) {
    try {
      const payload = {};
      if (batch.requiresTunnelSelection) {
        const selected = window.prompt("Enter tunnel number for this batch:");
        if (!selected) return;
        payload.tunnelNumber = Number(selected);
      }
      await apiFetch(`/tunnel-bunker/batches/${batch.id}/move-next`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const tunnelAlerts = await apiFetch("/tunnel-bunker/alerts");
      setTunnelPrompts(tunnelAlerts?.dueItems || []);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description={
          workMode === "room"
            ? "Room operations summary and stage movement status."
            : workMode === "tunnel"
              ? "Tunnel and bunker compost movement alerts and quick actions."
              : workMode === "admin"
              ? "Administrative overview with operations and financial visibility."
              : workMode === "sales"
                ? "Mushroom and compost sales totals and quick access to records."
                : workMode === "contributions"
                  ? "Partner contributions: each record shows amount, primary recipient, and transfer mode."
                  : "Spend, tax, and voucher activity at a glance."
        }
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      {(workMode === "room" || workMode === "admin" || workMode === "tunnel") && tunnelPrompts.length ? (
        <div className="card card-soft">
          <h3 className="panel-title">Compost movement alerts</h3>
          <p className="page-lead">
            These batches are due for turning/movement to the next bunker, into a single tunnel, or into growing rooms.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Current stage</th>
                  <th>Next stage</th>
                  <th>Due at</th>
                  <th>Overdue</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {tunnelPrompts.map((batch) => (
                  <tr key={batch.id} className="highlight-row">
                    <td>{batch.batchCode}</td>
                    <td>{batch.currentStageLabel}</td>
                    <td>{batch.nextStageLabel}</td>
                    <td>{batch.dueAt ? new Date(batch.dueAt).toLocaleString() : "-"}</td>
                    <td>{batch.overdueDays} day(s)</td>
                    <td>
                      <button className="btn btn-secondary" type="button" onClick={() => moveTunnelBatch(batch)}>
                        Move now
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {(workMode === "expense" || workMode === "admin") && summary ? (
        <section className="saas-section" aria-label="Key metrics">
          <div className="grid grid-3">
            <Link className="stat-link" href="/reports">
              <div className="card stat-card stat-dashlet">
                <div className="stat-dashlet__icon" aria-hidden>
                  <IconStatPaid />
                </div>
                <div className="stat-dashlet__body">
                  <span className="stat-label">Total paid amount</span>
                  <span className="stat-value">{summary ? formatIndianRupee(summary.totalPaidAmount) : "—"}</span>
                  <span className="stat-hint">Open reports →</span>
                </div>
              </div>
            </Link>
            <Link className="stat-link" href="/reports">
              <div className="card stat-card stat-dashlet">
                <div className="stat-dashlet__icon" aria-hidden>
                  <IconStatTax />
                </div>
                <div className="stat-dashlet__body">
                  <span className="stat-label">Total tax</span>
                  <span className="stat-value">{summary ? formatIndianRupee(summary.totalTax) : "—"}</span>
                  <span className="stat-hint">Open reports →</span>
                </div>
              </div>
            </Link>
            <Link className="stat-link" href="/vouchers">
              <div className="card stat-card stat-dashlet">
                <div className="stat-dashlet__icon" aria-hidden>
                  <IconStatVouchers />
                </div>
                <div className="stat-dashlet__body">
                  <span className="stat-label">Vouchers</span>
                  <span className="stat-value">{summary ? summary.voucherCount : "—"}</span>
                  <span className="stat-hint">View vouchers →</span>
                </div>
              </div>
            </Link>
          </div>
        </section>
      ) : null}

      {(workMode === "sales" || workMode === "admin") && salesSummary ? (
        <section className="saas-section" aria-label="Sales metrics">
          <div className="grid grid-3">
            <Link className="stat-link" href="/sales">
              <div className="card stat-card">
                <span className="stat-label">Total sales value</span>
                <span className="stat-value">{formatIndianRupee(salesSummary.totalAmount)}</span>
                <span className="stat-hint">View sales →</span>
              </div>
            </Link>
            <Link className="stat-link" href="/sales">
              <div className="card stat-card">
                <span className="stat-label">Mushroom sales</span>
                <span className="stat-value">
                  {formatIndianRupee(salesSummary.byCategory?.mushroom?.totalAmount ?? 0)}
                </span>
                <span className="stat-hint">{salesSummary.byCategory?.mushroom?.count ?? 0} line(s) →</span>
              </div>
            </Link>
            <Link className="stat-link" href="/sales">
              <div className="card stat-card">
                <span className="stat-label">Compost sales</span>
                <span className="stat-value">
                  {formatIndianRupee(salesSummary.byCategory?.compost?.totalAmount ?? 0)}
                </span>
                <span className="stat-hint">{salesSummary.byCategory?.compost?.count ?? 0} line(s) →</span>
              </div>
            </Link>
          </div>
        </section>
      ) : null}

      {(workMode === "contributions" || workMode === "admin") && contributionSummary ? (
        <section className="saas-section" aria-label="Contribution metrics">
          <div className="grid grid-3">
            <Link className="stat-link" href="/contributions">
              <div className="card stat-card">
                <span className="stat-label">Total Routed to Bank</span>
                <span className="stat-value">{formatIndianRupee(contributionSummary.totalContributions)}</span>
                <span className="stat-hint">{contributionSummary.entryCount} record(s) →</span>
              </div>
            </Link>
            <Link className="stat-link" href="/contributions">
              <div className="card stat-card">
                <span className="stat-label">{"Sunil's Contribution (Sunil + contributors)"}</span>
                <span className="stat-value">
                  {formatIndianRupee(contributionSummary.receivedByPrimary?.Sunil?.totalAmount ?? 0)}
                </span>
                <span className="stat-hint">{contributionSummary.receivedByPrimary?.Sunil?.count ?? 0} row(s) →</span>
              </div>
            </Link>
            <Link className="stat-link" href="/contributions">
              <div className="card stat-card">
                <span className="stat-label">{"Shailendra's contribution"}</span>
                <span className="stat-value">
                  {formatIndianRupee(contributionSummary.receivedByPrimary?.Shailendra?.totalAmount ?? 0)}
                </span>
                <span className="stat-hint">{contributionSummary.receivedByPrimary?.Shailendra?.count ?? 0} row(s) →</span>
              </div>
            </Link>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header-row card-header-row--voucher-toolbar">
              <h3 className="panel-title">Per-person summary</h3>
              <div className="voucher-table-toolbar-actions">
                <ExcelDownloadIconButton
                  disabled={!contributionSummary?.members?.length}
                  onClick={() => downloadPerPersonContributionSummaryXlsx(contributionSummary)}
                  title="Download per-person summary as Excel"
                  aria-label="Download per-person summary as Excel"
                />
              </div>
            </div>
            <p className="page-lead" style={{ marginBottom: 16 }}>
              <strong>Sunil</strong> and <strong>Shailendra</strong> are the primary account holders on paper.{" "}
              <strong>Direct expense</strong> uses paid vouchers with <em>Payment made from</em> (same basis as the expense
              payment summary). Use <Link href="/contributions">Contribution management</Link> to add or edit contribution
              records.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Individual</th>
                    <th>Role</th>
                    <th>Bank Contribution</th>
                    <th>Direct expense</th>
                    <th>Total contribution</th>
                    <th>Routed to Sunil</th>
                    <th>Routed to bank (from Primary)</th>
                  </tr>
                </thead>
                <tbody>
                  {contributionSummary.members.map((m) => (
                    <tr key={m.name}>
                      <td>{m.name}</td>
                      <td>{m.isPrimaryHolder ? "Primary account" : "Contributor"}</td>
                      <td>{formatIndianRupee(m.contributionTotal)}</td>
                      <td>{formatIndianRupee(m.expenseContributionTotal ?? 0)}</td>
                      <td>{formatIndianRupee(m.totalContribution ?? m.contributionTotal)}</td>
                      <td>{formatIndianRupee(m.routedToSunil)}</td>
                      <td>
                        {m.receivedOnPaperTotal != null
                          ? `${formatIndianRupee(m.receivedOnPaperTotal)} (${m.receivedOnPaperCount ?? 0} rows)`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="page-lead" style={{ marginTop: 16, fontSize: 13 }}>
              Bank contribution module (routed to bank): {formatIndianRupee(contributionSummary.totalContributions)} ·{" "}
              {contributionSummary.entryCount} record(s). Direct expense (voucher paid totals by person):{" "}
              {formatIndianRupee(contributionSummary.totalExpenseContribution ?? 0)}. Combined:{" "}
              {formatIndianRupee(
                contributionSummary.totalContributionCombined ?? contributionSummary.totalContributions
              )}
              .
            </p>
          </div>
        </section>
      ) : null}

      {(workMode === "room" || workMode === "admin") && roomPrompts.length ? (
        <div className="card card-soft">
          <h3 className="panel-title">Room stage prompts</h3>
          <p className="page-lead">
            These rooms are due to advance to the next stage.
          </p>
          <div className="table-wrap">
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
        </div>
      ) : null}

      {(workMode === "room" || workMode === "admin") && roomSummary.length ? (
        <div className="card card-soft">
          <h3 className="panel-title">Room operations summary</h3>
          <p className="page-lead">
            Current stage and timing across all growing rooms.
          </p>
          <div className="table-wrap">
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
                    <td>
                      <span className={room.dueNextStage ? "status-pill status-pill--pending" : "status-pill status-pill--active"}>
                        {room.dueNextStage ? "Overdue" : "On track"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {(workMode === "expense" || workMode === "admin") && vendors.length ? (
        <section className="saas-section" aria-label="Top vendors and materials">
          <div className="grid grid-2">
        <div className="dashboard-table-block">
          <h3 className="panel-title">Top vendors</h3>
          <div className="table-wrap">
            <table className="table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Paid amount</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((row) => (
                <tr key={row._id}>
                  <td>{row.vendor?.name}</td>
                  <td>{formatIndianRupee(row.totalPaidAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        <div className="dashboard-table-block">
          <h3 className="panel-title">Top materials</h3>
          <div className="table-wrap">
            <table className="table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Quantity</th>
                <th>Paid amount</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((row) => (
                <tr key={row._id}>
                  <td>{row.material?.name}</td>
                  <td>
                    {row.totalQuantity}
                    {row.material?.unit ? ` ${row.material.unit}` : ""}
                  </td>
                  <td>{formatIndianRupee(row.totalSpend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
          </div>
        </section>
      ) : null}

      {(workMode === "expense" || workMode === "admin") ? <div className="card">
        <h3 className="panel-title">Payment summary</h3>
        {tax ? (
          <div className="panel-inset panel-inset--strong section-stack">
            <div className="grid grid-2">
              <div>
                <p className="tag">Paid amount: {formatIndianRupee(tax.tax.totalPaidAmount)}</p>
                <p className="tag">Tax: {formatIndianRupee(tax.tax.totalTax)}</p>
              </div>
              <div>
                <h4 className="panel-title">Payment status</h4>
                <ul className="inline-note">
                  {(tax.paymentStatus || []).map((row) => (
                    <li key={row._id ?? "unknown"}>
                      {row._id}: {formatIndianRupee(row.totalPaidAmount)} paid ({row.count} vouchers)
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div>
              <button
                type="button"
                className="section-toggle"
                onClick={() => setVendorTaxOpen((o) => !o)}
                aria-expanded={vendorTaxOpen}
              >
                <span className="section-toggle__title">Vendor-wise spend and tax</span>
                <span className="section-toggle__chevron" aria-hidden>
                  {vendorTaxOpen ? "▼" : "▶"}
                </span>
              </button>
              {vendorTaxOpen ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Vendor</th>
                        <th>Vouchers</th>
                        <th>Tax</th>
                        <th>Paid amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(tax.vendorPayments || []).length ? (
                        (tax.vendorPayments || []).map((row) => (
                          <tr key={String(row._id)}>
                            <td>{row.vendor?.name || "—"}</td>
                            <td>{row.voucherCount}</td>
                            <td>{formatIndianRupee(row.totalTax)}</td>
                            <td>{formatIndianRupee(row.totalPaidAmount)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4}>
                            <span className="cell-empty">
                              No vouchers in range.
                            </span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div>
              <button
                type="button"
                className="section-toggle"
                onClick={() => setVoucherLatestOpen((o) => !o)}
                aria-expanded={voucherLatestOpen}
              >
                <span className="section-toggle__title">Voucher-wise (latest 30)</span>
                <span className="section-toggle__chevron" aria-hidden>
                  {voucherLatestOpen ? "▼" : "▶"}
                </span>
              </button>
              {voucherLatestOpen ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Voucher no.</th>
                        <th>Vendor</th>
                        <th>Paid amount</th>
                        <th>Tax</th>
                        <th>Status</th>
                        <th>Method</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(tax.voucherPayments || []).length ? (
                        (tax.voucherPayments || []).map((row) => (
                          <tr key={String(row._id)}>
                            <td>{new Date(row.dateOfPurchase).toLocaleDateString()}</td>
                            <td>{row.voucherNumber || "-"}</td>
                            <td>{row.vendorName || "—"}</td>
                            <td>{formatIndianRupee(row.paidAmount)}</td>
                            <td>{formatIndianRupee(row.taxAmount)}</td>
                            <td>
                              <span className={paymentStatusClass(row.paymentStatus)}>{row.paymentStatus}</span>
                            </td>
                            <td>{row.paymentMethod}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7}>
                            <span className="cell-empty">
                              No vouchers in range.
                            </span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div>
              <button
                type="button"
                className="section-toggle"
                onClick={() => setPaymentMadeByOpen((o) => !o)}
                aria-expanded={paymentMadeByOpen}
              >
                <span className="section-toggle__title">Payments made by</span>
                <span className="section-toggle__chevron" aria-hidden>
                  {paymentMadeByOpen ? "▼" : "▶"}
                </span>
              </button>
              {paymentMadeByOpen ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Payment made from</th>
                        <th>Vouchers</th>
                        <th>Total paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentMadeByRows.length ? (
                        paymentMadeByRows.map((row) => (
                          <tr key={row.paymentMadeBy}>
                            <td>{row.paymentMadeBy}</td>
                            <td>{row.voucherCount}</td>
                            <td>{formatIndianRupee(row.totalPaidAmount)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3}>
                            <span className="cell-empty">No paid vouchers with a payer recorded.</span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="page-lead">Loading payment data…</p>
        )}
      </div> : null}
    </div>
  );
}
