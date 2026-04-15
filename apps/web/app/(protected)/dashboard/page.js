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
import {
  compostStagePillClass,
  compostStageDisplayLabel,
  compostEstimatedReadyIso,
  formatShortDate
} from "../../../lib/compostUi.js";

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

/** Yesterday — sun over horizon */
function IconStatYesterday({ className = "" }) {
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
      <path d="M12 3v1M5.6 5.6l.7.7M3 12h1M19 12h1M18.3 5.6l-.7.7M16 16h2a4 4 0 0 1-8 0h2" />
      <path d="M8 14a4 4 0 0 1 8 0" opacity="0.35" />
    </svg>
  );
}

/** Calendar month */
function IconStatMonth({ className = "" }) {
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
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function voucherSpendAmount(v) {
  const p = Number(v?.paidAmount);
  if (Number.isFinite(p)) return p;
  return Number(v?.finalAmount) || 0;
}

function voucherPurchaseDate(v) {
  if (!v?.dateOfPurchase) return null;
  const d = new Date(v.dateOfPurchase);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sumVouchersForLocalCalendarDay(vouchers, day) {
  const start = startOfLocalDay(day);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  let s = 0;
  for (const v of vouchers) {
    const d = voucherPurchaseDate(v);
    if (!d) continue;
    if (d >= start && d <= end) s += voucherSpendAmount(v);
  }
  return s;
}

function sumVouchersForLocalMonth(vouchers, year, monthIndex) {
  let s = 0;
  for (const v of vouchers) {
    const d = voucherPurchaseDate(v);
    if (!d) continue;
    if (d.getFullYear() === year && d.getMonth() === monthIndex) s += voucherSpendAmount(v);
  }
  return s;
}

function monthlyTotalsForYear(vouchers, year) {
  return Array.from({ length: 12 }, (_, m) => sumVouchersForLocalMonth(vouchers, year, m));
}

function formatAxisRupeeShort(n) {
  const v = Math.abs(Number(n));
  if (!Number.isFinite(v)) return "0";
  if (v >= 1e7) return `${(v / 1e7).toFixed(1)} Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(1)} L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return String(Math.round(v));
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Pastel wheel for raw-material pie slices */
const RAW_MATERIAL_PIE_COLORS = [
  "#b8e0d4",
  "#f6cac9",
  "#c9daf8",
  "#fff3bf",
  "#e2d5f6",
  "#fcd5ce",
  "#d0ebff",
  "#ffecb8",
  "#c4f1f9",
  "#ffc9e8",
  "#d5f5e3",
  "#fde2e4"
];

/** Distinct pastel bars per month (cohesive expense palette) */
const MONTH_BAR_COLORS = [
  "#a5b4fc",
  "#fbcfe8",
  "#fde68a",
  "#bbf7d0",
  "#bae6fd",
  "#e9d5ff",
  "#fecdd3",
  "#a5f3fc",
  "#ddd6fe",
  "#fed7aa",
  "#d9f99d",
  "#99f6e4"
];

function materialsByIdMap(catalog) {
  const m = new Map();
  for (const mat of catalog || []) {
    if (mat?._id) m.set(String(mat._id), mat);
  }
  return m;
}

function formatQuantityWithUnit(quantity, unit) {
  const n = Number(quantity);
  if (!Number.isFinite(n)) return "—";
  const u = String(unit || "").trim();
  const s = Number.isInteger(n)
    ? String(n)
    : n.toLocaleString("en-IN", { maximumFractionDigits: 3, minimumFractionDigits: 0 });
  return u ? `${s} ${u}` : s;
}

/** Allocates voucher paid amount to lines by pre-tax share; only category Raw Material. Sums line quantities per material. */
function rawMaterialLineSpendSlices(vouchers, materialsCatalog, year, monthIndex) {
  const byId = materialsByIdMap(materialsCatalog);
  /** @type {Map<string, { label: string, value: number, quantity: number, unit: string }>} */
  const agg = new Map();
  for (const v of vouchers) {
    const d = voucherPurchaseDate(v);
    if (!d || d.getFullYear() !== year || d.getMonth() !== monthIndex) continue;
    const subTotal = Number(v.subTotal) || 0;
    const paid = Number(v?.paidAmount);
    const paidAmt = Number.isFinite(paid) ? paid : Number(v?.finalAmount) || 0;
    if (subTotal <= 0 || paidAmt <= 0) continue;
    for (const item of v.items || []) {
      const mid = item.materialId?._id ?? item.materialId;
      const midStr = String(mid);
      const mat = byId.get(midStr);
      if (!mat || String(mat.category || "").trim() !== "Raw Material") continue;
      const linePreTax = (Number(item.quantity) || 0) * (Number(item.pricePerUnit) || 0);
      const alloc = (linePreTax / subTotal) * paidAmt;
      if (alloc <= 0) continue;
      const lineQty = Number(item.quantity) || 0;
      const name = (mat.name || "Unknown").trim() || "Unknown";
      const unit = String(mat.unit || "").trim();
      const cur = agg.get(midStr) || { label: name, value: 0, quantity: 0, unit };
      cur.label = name;
      cur.value += alloc;
      cur.quantity += lineQty;
      if (unit) cur.unit = unit;
      agg.set(midStr, cur);
    }
  }
  return [...agg.entries()]
    .map(([materialId, row]) => ({ materialId, ...row }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

function pieSlicePath(cx, cy, r, startAngleDeg, endAngleDeg) {
  const rad = Math.PI / 180;
  const a1 = (startAngleDeg - 90) * rad;
  const a2 = (endAngleDeg - 90) * rad;
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2);
  const y2 = cy + r * Math.sin(a2);
  const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function ExpenseMonthlyChart({ year, monthlyTotals, onYearChange }) {
  const maxVal = Math.max(1, ...monthlyTotals);
  const chartW = 520;
  const chartH = 210;
  const padL = 52;
  const padR = 16;
  const padB = 38;
  const padT = 14;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const barGap = 5;
  const barW = (innerW - barGap * 11) / 12;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxVal * t);

  const currentChartYear = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentChartYear + 1; y >= currentChartYear - 8; y -= 1) yearOptions.push(y);

  return (
    <div className="dashboard-voucher-chart-card dashboard-voucher-chart-card--compact">
      <div className="dashboard-voucher-chart-card__head">
        <div>
          <h3 className="dashboard-voucher-chart-card__title">Voucher spend by month</h3>
          <p className="dashboard-voucher-chart-card__subtitle">
            Paid amount by purchase month (local dates).
          </p>
        </div>
        <label className="dashboard-voucher-chart-card__year">
          <span className="dashboard-voucher-chart-card__year-label">Year</span>
          <select className="input dashboard-voucher-chart-card__select" value={year} onChange={(e) => onYearChange(Number(e.target.value))}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="dashboard-voucher-chart-card__body">
        <div className="dashboard-voucher-chart__svg-wrap">
          <svg
            className="dashboard-voucher-chart__svg"
            viewBox={`0 0 ${chartW} ${chartH}`}
            role="img"
            aria-label={`Voucher spend by month for ${year}`}
          >
            {ticks.map((tv, i) => {
              const y = padT + innerH - (tv / maxVal) * innerH;
              return (
                <g key={`grid-${i}`}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={chartW - padR}
                    y2={y}
                    stroke="rgba(148, 163, 184, 0.35)"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text x={padL - 8} y={y + 4} textAnchor="end" className="dashboard-voucher-chart__axis-text">
                    {formatAxisRupeeShort(tv)}
                  </text>
                </g>
              );
            })}
            {MONTH_LABELS.map((label, mi) => {
              const x = padL + mi * (barW + barGap);
              const h = (monthlyTotals[mi] / maxVal) * innerH;
              const y = padT + innerH - h;
              return (
                <g key={label}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(h, 0)}
                    rx="5"
                    fill={MONTH_BAR_COLORS[mi % MONTH_BAR_COLORS.length]}
                    stroke="rgba(255, 255, 255, 0.55)"
                    strokeWidth="1"
                    className="dashboard-voucher-chart__bar"
                  >
                    <title>{`${label} ${year}: ${formatIndianRupee(monthlyTotals[mi])}`}</title>
                  </rect>
                  <text
                    x={x + barW / 2}
                    y={chartH - padB + 22}
                    textAnchor="middle"
                    className="dashboard-voucher-chart__month-text"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
            <text x={padL + innerW / 2} y={chartH - 6} textAnchor="middle" className="dashboard-voucher-chart__axis-title">
              Month
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}

function RawMaterialSpendPie({ vouchers, materialsCatalog, year, monthIndex, onYearChange, onMonthChange }) {
  const slices = useMemo(
    () => rawMaterialLineSpendSlices(vouchers, materialsCatalog, year, monthIndex),
    [vouchers, materialsCatalog, year, monthIndex]
  );
  const total = useMemo(() => slices.reduce((s, x) => s + x.value, 0), [slices]);
  const currentY = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentY + 1; y >= currentY - 8; y -= 1) yearOptions.push(y);

  /** Sized to align visually with the bar chart plot (~210px) in the paired column. */
  const pieView = { w: 230, h: 230, cx: 115, cy: 115, r: 96 };
  const { cx, cy: cySvg, r } = pieView;
  let angle = 0;
  const paths = [];
  for (let i = 0; i < slices.length; i += 1) {
    const frac = total > 0 ? slices[i].value / total : 0;
    const span = frac * 360;
    const start = angle;
    const end = i === slices.length - 1 ? 360 : angle + span;
    angle = end;
    const color = RAW_MATERIAL_PIE_COLORS[i % RAW_MATERIAL_PIE_COLORS.length];
    const qtyStr = formatQuantityWithUnit(slices[i].quantity, slices[i].unit);
    const title = `${slices[i].label}: ${formatIndianRupee(slices[i].value)} · ${qtyStr}`;
    if (slices.length === 1 && span >= 359.99) {
      paths.push({ key: slices[i].label, full: true, color, title });
    } else {
      paths.push({
        key: slices[i].label,
        d: pieSlicePath(cx, cySvg, r, start, end),
        color,
        title
      });
    }
  }

  return (
    <div className="dashboard-raw-mat-pie-card dashboard-voucher-chart-card--compact">
      <div className="dashboard-voucher-chart-card__head dashboard-raw-mat-pie-card__head">
        <div>
          <h3 className="dashboard-voucher-chart-card__title">Raw material spend</h3>
          <p className="dashboard-voucher-chart-card__subtitle">
            Paid amount (pie) and total voucher line quantities for materials in category &quot;Raw Material&quot;
            (allocated spend uses each line&apos;s share of voucher subtotal).
          </p>
        </div>
        <div className="dashboard-raw-mat-pie-card__controls" aria-label="Month and year">
          <label className="dashboard-voucher-chart-card__year">
            <span className="dashboard-voucher-chart-card__year-label">Month</span>
            <select
              className="input dashboard-voucher-chart-card__select dashboard-raw-mat-pie-card__select--month"
              value={monthIndex}
              onChange={(e) => onMonthChange(Number(e.target.value))}
            >
              {MONTH_LABELS.map((label, idx) => (
                <option key={label} value={idx}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="dashboard-voucher-chart-card__year">
            <span className="dashboard-voucher-chart-card__year-label">Year</span>
            <select
              className="input dashboard-voucher-chart-card__select"
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="dashboard-voucher-chart-card__body dashboard-raw-mat-pie-card__body">
        {total <= 0 ? (
          <div className="dashboard-raw-mat-pie-card__empty">
            <p>No Raw Material line spend in {MONTH_LABELS[monthIndex]} {year}.</p>
            <p className="dashboard-raw-mat-pie-card__empty-hint">Try another month or confirm vouchers use Raw Material categories.</p>
          </div>
        ) : (
          <div className="dashboard-raw-mat-pie-card__chart">
            <svg
              className="dashboard-raw-mat-pie-card__svg"
              viewBox={`0 0 ${pieView.w} ${pieView.h}`}
              role="img"
              aria-label="Raw material spend pie chart"
            >
              <circle cx={cx} cy={cySvg} r={r} fill="var(--surface)" stroke="var(--border)" strokeWidth="1" />
              {paths.map((p) =>
                p.full ? (
                  <circle key={p.key} cx={cx} cy={cySvg} r={r} fill={p.color} className="dashboard-raw-mat-pie-card__slice">
                    <title>{p.title}</title>
                  </circle>
                ) : (
                  <path
                    key={p.key}
                    d={p.d}
                    fill={p.color}
                    stroke="rgba(255, 255, 255, 0.92)"
                    strokeWidth="2"
                    className="dashboard-raw-mat-pie-card__slice"
                  >
                    <title>{p.title}</title>
                  </path>
                )
              )}
              <text x={cx} y={cySvg - 2} textAnchor="middle" className="dashboard-raw-mat-pie-card__center-total">
                {formatAxisRupeeShort(total)}
              </text>
              <text x={cx} y={cySvg + 18} textAnchor="middle" className="dashboard-raw-mat-pie-card__center-label">
                total
              </text>
            </svg>
            <ul className="dashboard-raw-mat-pie-card__legend">
              {slices.map((s, i) => (
                <li key={s.materialId} className="dashboard-raw-mat-pie-card__legend-item">
                  <span className="dashboard-raw-mat-pie-card__swatch" style={{ background: RAW_MATERIAL_PIE_COLORS[i % RAW_MATERIAL_PIE_COLORS.length] }} />
                  <div className="dashboard-raw-mat-pie-card__legend-mid">
                    <span className="dashboard-raw-mat-pie-card__legend-label" title={s.label}>
                      {s.label}
                    </span>
                    <span className="dashboard-raw-mat-pie-card__legend-qty" title="Total quantity on vouchers this month">
                      {formatQuantityWithUnit(s.quantity, s.unit)}
                    </span>
                  </div>
                  <span className="dashboard-raw-mat-pie-card__legend-val">{formatIndianRupee(s.value, { maxDecimals: 0 })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
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
  const [compostBatches, setCompostBatches] = useState([]);
  const [canPlantOps, setCanPlantOps] = useState(false);
  const [expenseVouchers, setExpenseVouchers] = useState([]);
  const [expenseMaterialsCatalog, setExpenseMaterialsCatalog] = useState([]);
  const [expenseChartYear, setExpenseChartYear] = useState(() => new Date().getFullYear());
  const [rawMatPieYear, setRawMatPieYear] = useState(() => new Date().getFullYear());
  const [rawMatPieMonth, setRawMatPieMonth] = useState(() => new Date().getMonth());

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
        const canPlant =
          permissionsData.permissions === "all" ||
          permissionsData.permissions?.plantOperations?.view ||
          permissionsData.permissions?.plantOperations?.edit ||
          permissionsData.permissions?.plantOperations?.create;
        setCanPlantOps(canPlant);
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

        if (selectedMode === "plant") {
          if (!canPlant) {
            router.replace("/work-mode");
            return;
          }
        }

        if (selectedMode === "expense" || selectedMode === "admin") {
          const [summaryData, vendorData, materialData, taxData, payerAgg, voucherList, allMaterials] =
            await Promise.all([
              apiFetch("/reports/expenses"),
              apiFetch("/reports/vendor-expenses"),
              apiFetch("/reports/material-summary"),
              apiFetch("/reports/tax-payments"),
              apiFetch("/reports/payment-made-from-aggregate").catch(() => []),
              apiFetch("/vouchers").catch(() => null),
              apiFetch("/materials").catch(() => null)
            ]);
          setSummary(summaryData);
          setVendors(vendorData.slice(0, 5));
          setMaterials(materialData.slice(0, 5));
          setTax(taxData);
          setPaymentMadeByAgg(Array.isArray(payerAgg) ? payerAgg : []);
          setExpenseVouchers(Array.isArray(voucherList) ? voucherList : []);
          setExpenseMaterialsCatalog(Array.isArray(allMaterials) ? allMaterials : []);
        } else {
          setExpenseVouchers([]);
          setExpenseMaterialsCatalog([]);
        }
        if (selectedMode === "room" || selectedMode === "admin") {
          if (!allowRoomStages) {
            router.replace("/work-mode");
            return;
          }
          const [roomData, tunnelAlerts] = await Promise.all([
            apiFetch("/rooms/status?onlyRoomResources=true"),
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

        if (selectedMode === "plant" || (selectedMode === "admin" && canPlant)) {
          try {
            const cb = await apiFetch("/plant-ops/compost-batches");
            setCompostBatches(Array.isArray(cb) ? cb : []);
          } catch {
            setCompostBatches([]);
          }
        } else {
          setCompostBatches([]);
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

  const expenseVoucherDerived = useMemo(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayTotal = sumVouchersForLocalCalendarDay(expenseVouchers, yesterday);
    const currentMonthTotal = sumVouchersForLocalMonth(expenseVouchers, now.getFullYear(), now.getMonth());
    const monthlyTotals = monthlyTotalsForYear(expenseVouchers, expenseChartYear);
    return { yesterdayTotal, currentMonthTotal, monthlyTotals };
  }, [expenseVouchers, expenseChartYear]);

  async function moveRoom(roomId) {
    try {
      await apiFetch(`/rooms/${roomId}/move-stage`, {
        method: "POST",
        body: JSON.stringify({})
      });
      const roomData = await apiFetch("/rooms/status?onlyRoomResources=true");
      setRoomPrompts(roomData.filter((room) => room.dueNextStage));
      setRoomSummary(roomData);
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
              : workMode === "plant"
                ? "Compost batch lifecycle status, progress, and quick access to plant operations."
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

      {(workMode === "plant" || (workMode === "admin" && canPlantOps)) ? (
        <div className="card card-soft">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <h3 className="panel-title" style={{ margin: 0 }}>
              Compost lifecycle batches
            </h3>
            <Link href="/plant-operations" className="btn btn-secondary">
              Open plant operations
            </Link>
          </div>
          <p className="page-lead">
            Fixed timeline: wetting (3d) → filling (1d) → three turns (2d each) → pasteurisation (10d) → compost ready. Status updates
            from the batch start date unless manually overridden.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th style={{ minWidth: 200 }}>Start · est. compost ready</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {compostBatches.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <span className="cell-empty">No batches yet. Create one in Plant operations.</span>
                    </td>
                  </tr>
                ) : (
                  compostBatches.map((b) => {
                    const estReadyIso = compostEstimatedReadyIso(b);
                    return (
                    <tr key={b._id}>
                      <td>
                        <strong>{b.batchName}</strong>
                        {b.isManualOverride ? (
                          <span className="tag" style={{ marginLeft: 8 }}>
                            Manual
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
                      <td style={{ minWidth: 160 }}>
                        <div className="compost-progress">
                          <div
                            className="compost-progress__fill"
                            style={{ width: `${Math.round((b.progress || 0) * 100)}%` }}
                          />
                        </div>
                      </td>
                      <td>
                        <Link className="btn btn-secondary" href={`/plant-operations/${b._id}`}>
                          Detail
                        </Link>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

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
        <>
          <section className="saas-section" aria-label="Key metrics">
            <div className="dashboard-expense-dashlets">
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
              <Link className="stat-link" href="/vouchers?dateRange=yesterday">
                <div className="card stat-card stat-dashlet stat-dashlet--yesterday">
                  <div className="stat-dashlet__icon stat-dashlet__icon--yesterday" aria-hidden>
                    <IconStatYesterday />
                  </div>
                  <div className="stat-dashlet__body">
                    <span className="stat-label">Yesterday expense</span>
                    <span className="stat-value">{formatIndianRupee(expenseVoucherDerived.yesterdayTotal)}</span>
                    <span className="stat-hint">Vouchers of previous day →</span>
                  </div>
                </div>
              </Link>
              <Link className="stat-link" href="/vouchers?dateRange=month">
                <div className="card stat-card stat-dashlet stat-dashlet--month">
                  <div className="stat-dashlet__icon stat-dashlet__icon--month" aria-hidden>
                    <IconStatMonth />
                  </div>
                  <div className="stat-dashlet__body">
                    <span className="stat-label">Current month expense</span>
                    <span className="stat-value">{formatIndianRupee(expenseVoucherDerived.currentMonthTotal)}</span>
                    <span className="stat-hint">Vouchers of this month →</span>
                  </div>
                </div>
              </Link>
            </div>
          </section>
          <section className="saas-section dashboard-expense-charts-section" aria-label="Monthly voucher spend and raw materials">
            <div className="dashboard-expense-charts-row">
              <div className="dashboard-expense-charts-row__cell">
                <ExpenseMonthlyChart
                  year={expenseChartYear}
                  monthlyTotals={expenseVoucherDerived.monthlyTotals}
                  onYearChange={setExpenseChartYear}
                />
              </div>
              <div className="dashboard-expense-charts-row__cell">
                <RawMaterialSpendPie
                  vouchers={expenseVouchers}
                  materialsCatalog={expenseMaterialsCatalog}
                  year={rawMatPieYear}
                  monthIndex={rawMatPieMonth}
                  onYearChange={setRawMatPieYear}
                  onMonthChange={setRawMatPieMonth}
                />
              </div>
            </div>
          </section>
        </>
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
          <div className="grid grid-4">
            <Link className="stat-link" href="/contributions">
              <div className="card stat-card">
                <span className="stat-label">Total Routed to Bank</span>
                <span className="stat-value">{formatIndianRupee(contributionSummary.totalContributions)}</span>
                <span className="stat-hint">{contributionSummary.entryCount} record(s) →</span>
              </div>
            </Link>
            <div className="stat-link" role="group" aria-label="Balance available in bank">
              <div className="card stat-card">
                <span className="stat-label">Balance available in bank</span>
                <span className="stat-value">
                  {formatIndianRupee(contributionSummary.balanceAvailableInBank ?? 0)}
                </span>
                <span className="stat-hint">
                  Routed total − paid vouchers (Payment made from: Company Account):{" "}
                  {formatIndianRupee(contributionSummary.totalExpensePaidFromCompanyAccount ?? 0)} ·{" "}
                  {contributionSummary.companyAccountPaidVoucherCount ?? 0} voucher(s)
                </span>
              </div>
            </div>
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
              {contributionSummary.entryCount} record(s). Balance available in bank (routed total minus paid expenses from
              Company Account): {formatIndianRupee(contributionSummary.balanceAvailableInBank ?? 0)} (
              {formatIndianRupee(contributionSummary.totalExpensePaidFromCompanyAccount ?? 0)} on{" "}
              {contributionSummary.companyAccountPaidVoucherCount ?? 0} paid voucher(s)). Direct expense (voucher paid
              totals by person): {formatIndianRupee(contributionSummary.totalExpenseContribution ?? 0)}. Combined:{" "}
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
