"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "../../../components/PageHeader.js";
import { ExcelDownloadIconButton } from "../../../components/EditDeleteIconButtons.js";
import { getWorkMode } from "../../../lib/workMode.js";
import {
  hasExpenseAreaAccess,
  canViewModule,
  canCreateInModule,
  canAccessTunnelOps,
  canAccessRoomOps,
  canEditTunnelBatch
} from "../../../lib/modulePermissions.js";
import { formatIndianRupee } from "../../../lib/formatIndianRupee.js";
import { isPaymentMadeFromVelocity } from "../../../lib/paymentMadeFrom.js";
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
    if (isPaymentMadeFromVelocity(v)) continue;
    const d = voucherPurchaseDate(v);
    if (!d) continue;
    if (d >= start && d <= end) s += voucherSpendAmount(v);
  }
  return s;
}

function sumVouchersForLocalMonth(vouchers, year, monthIndex) {
  let s = 0;
  for (const v of vouchers) {
    if (isPaymentMadeFromVelocity(v)) continue;
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

/** One stable color per contribution member (bar + pie). */
const CONTRIBUTION_MEMBER_CHART_COLORS = ["#6b8cff", "#e891b0", "#e6b422", "#3ec995", "#9b6fe8"];

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
    if (isPaymentMadeFromVelocity(v)) continue;
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

function ContributionMemberMonthlyChart({ year, members, monthly, onYearChange }) {
  const memList = Array.isArray(members) ? members : [];
  const rows = Array.isArray(monthly) ? monthly : [];
  let maxVal = 1;
  for (const row of rows) {
    for (const m of memList) {
      maxVal = Math.max(maxVal, Number(row.amounts?.[m]) || 0);
    }
  }
  const chartW = 900;
  const chartH = 228;
  const padL = 58;
  const padR = 18;
  const padB = 48;
  const padT = 14;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const groupSlotW = innerW / 12;
  const innerGroupW = groupSlotW * 0.92;
  const barGap = 1;
  const nMem = Math.max(1, memList.length);
  const barW = (innerGroupW - barGap * (nMem - 1)) / nMem;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxVal * t);
  const currentChartYear = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentChartYear + 1; y >= currentChartYear - 8; y -= 1) yearOptions.push(y);

  return (
    <div className="dashboard-voucher-chart-card dashboard-voucher-chart-card--compact">
      <div className="dashboard-voucher-chart-card__head">
        <div>
          <h3 className="dashboard-voucher-chart-card__title">Bank contribution by month</h3>
          <p className="dashboard-voucher-chart-card__subtitle">
            Amount (₹) grouped by calendar month; one bar per partner from contribution entries (member field). Primary
            holders only include their own bank rows.
          </p>
        </div>
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
      <div className="dashboard-voucher-chart-card__body">
        <div className="dashboard-voucher-chart__svg-wrap">
          <svg
            className="dashboard-voucher-chart__svg"
            viewBox={`0 0 ${chartW} ${chartH}`}
            role="img"
            aria-label={`Bank contribution by month and member for ${year}`}
          >
            {ticks.map((tv, i) => {
              const yLine = padT + innerH - (tv / maxVal) * innerH;
              return (
                <g key={`grid-${i}`}>
                  <line
                    x1={padL}
                    y1={yLine}
                    x2={chartW - padR}
                    y2={yLine}
                    stroke="rgba(148, 163, 184, 0.35)"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text x={padL - 8} y={yLine + 4} textAnchor="end" className="dashboard-voucher-chart__axis-text">
                    {formatAxisRupeeShort(tv)}
                  </text>
                </g>
              );
            })}
            {MONTH_LABELS.map((label, mi) => {
              const slotLeft = padL + mi * groupSlotW;
              const groupLeft = slotLeft + (groupSlotW - innerGroupW) / 2;
              return (
                <g key={label}>
                  {memList.map((mem, ji) => {
                    const amt = Number(rows[mi]?.amounts?.[mem]) || 0;
                    const h = (amt / maxVal) * innerH;
                    const yBar = padT + innerH - h;
                    const x = groupLeft + ji * (barW + barGap);
                    const fill = CONTRIBUTION_MEMBER_CHART_COLORS[ji % CONTRIBUTION_MEMBER_CHART_COLORS.length];
                    return (
                      <rect
                        key={mem}
                        x={x}
                        y={yBar}
                        width={barW}
                        height={Math.max(h, 0)}
                        rx="3"
                        fill={fill}
                        stroke="rgba(255, 255, 255, 0.55)"
                        strokeWidth="1"
                        className="dashboard-voucher-chart__bar"
                      >
                        <title>{`${mem} · ${label} ${year}: ${formatIndianRupee(amt)}`}</title>
                      </rect>
                    );
                  })}
                  <text
                    x={slotLeft + groupSlotW / 2}
                    y={chartH - padB + 24}
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
        <ul className="dashboard-contribution-bar-legend" aria-label="Member colors">
          {memList.map((mem, ji) => (
            <li key={mem} className="dashboard-contribution-bar-legend__item">
              <span
                className="dashboard-contribution-bar-legend__swatch"
                style={{ background: CONTRIBUTION_MEMBER_CHART_COLORS[ji % CONTRIBUTION_MEMBER_CHART_COLORS.length] }}
              />
              <span>{mem}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ContributionTotalsPie({ members, totalsTillDate }) {
  const memList = Array.isArray(members) ? members : [];
  const slices = memList
    .map((name, i) => ({
      key: name,
      value: Number(totalsTillDate?.[name]) || 0,
      color: CONTRIBUTION_MEMBER_CHART_COLORS[i % CONTRIBUTION_MEMBER_CHART_COLORS.length]
    }))
    .filter((s) => s.value > 0);
  const total = slices.reduce((s, x) => s + x.value, 0);
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
    const title = `${slices[i].key}: ${formatIndianRupee(slices[i].value)}`;
    if (slices.length === 1 && span >= 359.99) {
      paths.push({ key: slices[i].key, full: true, color: slices[i].color, title });
    } else {
      paths.push({
        key: slices[i].key,
        d: pieSlicePath(cx, cySvg, r, start, end),
        color: slices[i].color,
        title
      });
    }
  }

  return (
    <div className="dashboard-raw-mat-pie-card dashboard-voucher-chart-card--compact">
      <div className="dashboard-voucher-chart-card__head dashboard-raw-mat-pie-card__head">
        <div>
          <h3 className="dashboard-voucher-chart-card__title">Total contribution</h3>
          <p className="dashboard-voucher-chart-card__subtitle">
            All-time per member: bank contribution module plus direct expense (paid vouchers, same basis as Total
            contribution in the table).
          </p>
        </div>
      </div>
      <div className="dashboard-voucher-chart-card__body dashboard-raw-mat-pie-card__body">
        {total <= 0 ? (
          <div className="dashboard-raw-mat-pie-card__empty">
            <p>No total contribution data yet.</p>
            <p className="dashboard-raw-mat-pie-card__empty-hint">
              Add bank entries or paid expense vouchers attributed to members.
            </p>
          </div>
        ) : (
          <div className="dashboard-raw-mat-pie-card__chart">
            <svg
              className="dashboard-raw-mat-pie-card__svg"
              viewBox={`0 0 ${pieView.w} ${pieView.h}`}
              role="img"
              aria-label="Total contribution by member"
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
              {memList.map((name, i) => {
                const val = Number(totalsTillDate?.[name]) || 0;
                return (
                  <li key={name} className="dashboard-raw-mat-pie-card__legend-item">
                    <span
                      className="dashboard-raw-mat-pie-card__swatch"
                      style={{ background: CONTRIBUTION_MEMBER_CHART_COLORS[i % CONTRIBUTION_MEMBER_CHART_COLORS.length] }}
                    />
                    <div className="dashboard-raw-mat-pie-card__legend-mid">
                      <span className="dashboard-raw-mat-pie-card__legend-label" title={name}>
                        {name}
                      </span>
                    </div>
                    <span className="dashboard-raw-mat-pie-card__legend-val">
                      {formatIndianRupee(val, { maxDecimals: 0 })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** Point on upper semicircle (opens upward); c in [0,1] from left to right. */
function salesSemiDonutPt(cx, cy, r, c) {
  const th = Math.PI * (1 - c);
  return { x: cx + r * Math.cos(th), y: cy - r * Math.sin(th) };
}

function salesSemiDonutSlicePath(cx, cy, rOut, rIn, c0, c1) {
  if (c1 - c0 < 1e-9) return "";
  const delta = Math.PI * (c1 - c0);
  const largeArc = delta > Math.PI ? 1 : 0;
  const o0 = salesSemiDonutPt(cx, cy, rOut, c0);
  const o1 = salesSemiDonutPt(cx, cy, rOut, c1);
  const i1 = salesSemiDonutPt(cx, cy, rIn, c1);
  const i0 = salesSemiDonutPt(cx, cy, rIn, c0);
  return `M ${o0.x} ${o0.y} A ${rOut} ${rOut} 0 ${largeArc} 1 ${o1.x} ${o1.y} L ${i1.x} ${i1.y} A ${rIn} ${rIn} 0 ${largeArc} 0 ${i0.x} ${i0.y} Z`;
}

const SALES_SEMI_CASH_COLOR = "#34d399";
const SALES_SEMI_NONCASH_COLOR = "#60a5fa";

function SalesYoYMonthlyChart({
  comparisonYear,
  previousYear,
  monthlyThisYear,
  monthlyPreviousYear,
  onComparisonYearChange
}) {
  const thisArr = Array.isArray(monthlyThisYear) ? monthlyThisYear : Array.from({ length: 12 }, () => 0);
  const prevArr = Array.isArray(monthlyPreviousYear) ? monthlyPreviousYear : Array.from({ length: 12 }, () => 0);
  let maxVal = 1;
  for (let i = 0; i < 12; i += 1) {
    maxVal = Math.max(maxVal, Number(thisArr[i]) || 0, Number(prevArr[i]) || 0);
  }
  const chartW = 560;
  const chartH = 228;
  const padL = 52;
  const padR = 20;
  const padB = 52;
  const padT = 14;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const slotW = innerW / 12;
  const barW = slotW * 0.42;
  const barGap = (slotW - barW) / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxVal * t);
  const currentChartYear = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentChartYear + 1; y >= currentChartYear - 8; y -= 1) yearOptions.push(y);

  const linePts = MONTH_LABELS.map((_, mi) => {
    const cx = padL + mi * slotW + slotW / 2;
    const v = Number(prevArr[mi]) || 0;
    const h = (v / maxVal) * innerH;
    const y = padT + innerH - h;
    return `${cx},${y}`;
  }).join(" ");

  return (
    <div className="dashboard-voucher-chart-card dashboard-voucher-chart-card--compact">
      <div className="dashboard-voucher-chart-card__head">
        <div>
          <h3 className="dashboard-voucher-chart-card__title">Monthly sales vs prior year</h3>
          <p className="dashboard-voucher-chart-card__subtitle">
            Bars: total sale in selected year (IST calendar month). Line: same months in {previousYear}.
          </p>
        </div>
        <label className="dashboard-voucher-chart-card__year">
          <span className="dashboard-voucher-chart-card__year-label">Year</span>
          <select
            className="input dashboard-voucher-chart-card__select"
            value={comparisonYear}
            onChange={(e) => onComparisonYearChange(Number(e.target.value))}
          >
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
            aria-label={`Monthly sales ${comparisonYear} vs ${previousYear}`}
          >
            {ticks.map((tv, i) => {
              const yLine = padT + innerH - (tv / maxVal) * innerH;
              return (
                <g key={`grid-${i}`}>
                  <line
                    x1={padL}
                    y1={yLine}
                    x2={chartW - padR}
                    y2={yLine}
                    stroke="rgba(148, 163, 184, 0.35)"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text x={padL - 8} y={yLine + 4} textAnchor="end" className="dashboard-voucher-chart__axis-text">
                    {formatAxisRupeeShort(tv)}
                  </text>
                </g>
              );
            })}
            {MONTH_LABELS.map((label, mi) => {
              const x = padL + mi * slotW + barGap;
              const v = Number(thisArr[mi]) || 0;
              const h = (v / maxVal) * innerH;
              const y = padT + innerH - h;
              return (
                <g key={label}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(h, 0)}
                    rx="4"
                    fill={MONTH_BAR_COLORS[mi % MONTH_BAR_COLORS.length]}
                    stroke="rgba(255, 255, 255, 0.55)"
                    strokeWidth="1"
                    className="dashboard-voucher-chart__bar"
                  >
                    <title>{`${label} ${comparisonYear}: ${formatIndianRupee(v)}`}</title>
                  </rect>
                  <text
                    x={padL + mi * slotW + slotW / 2}
                    y={chartH - padB + 22}
                    textAnchor="middle"
                    className="dashboard-voucher-chart__month-text"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
            <polyline
              fill="none"
              stroke="#b45309"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={linePts}
              opacity="0.92"
            />
            {MONTH_LABELS.map((_, mi) => {
              const cx = padL + mi * slotW + slotW / 2;
              const v = Number(prevArr[mi]) || 0;
              const h = (v / maxVal) * innerH;
              const y = padT + innerH - h;
              return (
                <circle key={`dot-${mi}`} cx={cx} cy={y} r="4" fill="#b45309" stroke="#fff" strokeWidth="1">
                  <title>{`${MONTH_LABELS[mi]} ${previousYear}: ${formatIndianRupee(v)}`}</title>
                </circle>
              );
            })}
            <text x={padL + innerW / 2} y={chartH - 8} textAnchor="middle" className="dashboard-voucher-chart__axis-title">
              Month
            </text>
          </svg>
        </div>
        <div className="dashboard-sales-yoy-legend">
          <span className="dashboard-sales-yoy-legend__item">
            <span className="dashboard-sales-yoy-legend__swatch dashboard-sales-yoy-legend__swatch--bar" />
            {comparisonYear}
          </span>
          <span className="dashboard-sales-yoy-legend__item">
            <span className="dashboard-sales-yoy-legend__line" />
            {previousYear}
          </span>
        </div>
      </div>
    </div>
  );
}

function SalesCashBankSemiPie({ pieYear, pieMonthIndex, pieCash, pieNonCash, onPieYearChange, onPieMonthChange }) {
  const cash = Number(pieCash) || 0;
  const nonCash = Number(pieNonCash) || 0;
  const total = cash + nonCash;
  const fracCash = total > 0 ? cash / total : 0;
  const currentY = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentY + 1; y >= currentY - 8; y -= 1) yearOptions.push(y);

  const vbW = 260;
  const vbH = 200;
  const cx = 130;
  const cy = 138;
  const rOut = 92;
  const rIn = 56;
  const c1 = fracCash;
  const pathCash = total > 0 ? salesSemiDonutSlicePath(cx, cy, rOut, rIn, 0, c1) : "";
  const pathNon = total > 0 ? salesSemiDonutSlicePath(cx, cy, rOut, rIn, c1, 1) : "";

  return (
    <div className="dashboard-raw-mat-pie-card dashboard-voucher-chart-card--compact dashboard-sales-semi-pie-card">
      <div className="dashboard-voucher-chart-card__head dashboard-raw-mat-pie-card__head">
        <div>
          <h3 className="dashboard-voucher-chart-card__title">Cash vs bank / digital</h3>
          <p className="dashboard-voucher-chart-card__subtitle">
            Semicircle split by payment mode for the selected month (IST). Non-cash is UPI, bank transfer, cheque, card,
            and other (everything except Cash).
          </p>
        </div>
        <div className="dashboard-raw-mat-pie-card__controls" aria-label="Month and year">
          <label className="dashboard-voucher-chart-card__year">
            <span className="dashboard-voucher-chart-card__year-label">Month</span>
            <select
              className="input dashboard-voucher-chart-card__select dashboard-raw-mat-pie-card__select--month"
              value={pieMonthIndex}
              onChange={(e) => onPieMonthChange(Number(e.target.value))}
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
              value={pieYear}
              onChange={(e) => onPieYearChange(Number(e.target.value))}
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
      <div className="dashboard-voucher-chart-card__body dashboard-raw-mat-pie-card__body dashboard-sales-semi-pie-card__body">
        {total <= 0 ? (
          <div className="dashboard-raw-mat-pie-card__empty">
            <p>No sales in {MONTH_LABELS[pieMonthIndex]} {pieYear}.</p>
            <p className="dashboard-raw-mat-pie-card__empty-hint">Try another month or add sales lines.</p>
          </div>
        ) : (
          <div className="dashboard-sales-semi-pie-card__chart">
            <svg
              className="dashboard-sales-semi-pie-card__svg"
              viewBox={`0 0 ${vbW} ${vbH}`}
              role="img"
              aria-label="Cash versus non-cash sales semicircle"
            >
              <path
                d={pathCash}
                fill={SALES_SEMI_CASH_COLOR}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="2"
                className="dashboard-raw-mat-pie-card__slice"
              >
                <title>{`Cash: ${formatIndianRupee(cash)}`}</title>
              </path>
              <path
                d={pathNon}
                fill={SALES_SEMI_NONCASH_COLOR}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="2"
                className="dashboard-raw-mat-pie-card__slice"
              >
                <title>{`Bank / digital & other: ${formatIndianRupee(nonCash)}`}</title>
              </path>
              <text x={cx} y={cy - 8} textAnchor="middle" className="dashboard-raw-mat-pie-card__center-total">
                {formatAxisRupeeShort(total)}
              </text>
              <text x={cx} y={cy + 12} textAnchor="middle" className="dashboard-raw-mat-pie-card__center-label">
                month total
              </text>
            </svg>
            <ul className="dashboard-raw-mat-pie-card__legend">
              <li className="dashboard-raw-mat-pie-card__legend-item">
                <span className="dashboard-raw-mat-pie-card__swatch" style={{ background: SALES_SEMI_CASH_COLOR }} />
                <div className="dashboard-raw-mat-pie-card__legend-mid">
                  <span className="dashboard-raw-mat-pie-card__legend-label">Cash</span>
                </div>
                <span className="dashboard-raw-mat-pie-card__legend-val">
                  {formatIndianRupee(cash, { maxDecimals: 0 })}
                </span>
              </li>
              <li className="dashboard-raw-mat-pie-card__legend-item">
                <span className="dashboard-raw-mat-pie-card__swatch" style={{ background: SALES_SEMI_NONCASH_COLOR }} />
                <div className="dashboard-raw-mat-pie-card__legend-mid">
                  <span className="dashboard-raw-mat-pie-card__legend-label" title="Non-cash payment modes">
                    Bank / digital &amp; other
                  </span>
                </div>
                <span className="dashboard-raw-mat-pie-card__legend-val">
                  {formatIndianRupee(nonCash, { maxDecimals: 0 })}
                </span>
              </li>
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
  const [canGrowingRoomOps, setCanGrowingRoomOps] = useState(false);
  const [growingRoomSummary, setGrowingRoomSummary] = useState(null);
  const [expenseVouchers, setExpenseVouchers] = useState([]);
  const [expenseMaterialsCatalog, setExpenseMaterialsCatalog] = useState([]);
  const [expenseChartYear, setExpenseChartYear] = useState(() => new Date().getFullYear());
  const [rawMatPieYear, setRawMatPieYear] = useState(() => new Date().getFullYear());
  const [rawMatPieMonth, setRawMatPieMonth] = useState(() => new Date().getMonth());
  const [contributionChartYear, setContributionChartYear] = useState(() => new Date().getFullYear());
  const [contributionChartsData, setContributionChartsData] = useState(null);
  const [salesComparisonYear, setSalesComparisonYear] = useState(() => new Date().getFullYear());
  const [salesPieYear, setSalesPieYear] = useState(() => new Date().getFullYear());
  const [salesPieMonth, setSalesPieMonth] = useState(() => new Date().getMonth());
  const [salesChartsData, setSalesChartsData] = useState(null);
  const [expensePerm, setExpensePerm] = useState({
    viewReports: false,
    viewVouchers: false,
    viewVendors: false,
    viewMaterials: false,
    createVendors: false,
    createMaterials: false,
    createVouchers: false
  });
  const [canTunnelEditOps, setCanTunnelEditOps] = useState(false);

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
        const p = permissionsData.permissions;
        const admin = p === "all";
        setIsAdmin(admin);
        const canPlant =
          p === "all" ||
          p?.plantOperations?.view ||
          p?.plantOperations?.edit ||
          p?.plantOperations?.create;
        const canGrowing =
          p === "all" ||
          p?.growingRoomOps?.view ||
          p?.growingRoomOps?.edit ||
          p?.growingRoomOps?.create;
        setCanPlantOps(canPlant);
        setCanGrowingRoomOps(canGrowing);

        const ep = {
          viewReports: admin || canViewModule(p, "reports"),
          viewVouchers: admin || canViewModule(p, "vouchers"),
          viewVendors: admin || canViewModule(p, "vendors"),
          viewMaterials: admin || canViewModule(p, "materials"),
          createVendors: admin || canCreateInModule(p, "vendors"),
          createMaterials: admin || canCreateInModule(p, "materials"),
          createVouchers: admin || canCreateInModule(p, "vouchers")
        };
        setExpensePerm(ep);
        setCanTunnelEditOps(canEditTunnelBatch(p));

        if (selectedMode === "admin" && !admin) {
          router.replace("/work-mode");
          return;
        }

        if (selectedMode === "sales") {
          const canSales =
            p === "all" || p?.sales?.view || p?.sales?.edit;
          if (!canSales) {
            router.replace("/work-mode");
            return;
          }
        }

        if (selectedMode === "contributions") {
          const canContr =
            p === "all" || p?.contributions?.view || p?.contributions?.edit;
          if (!canContr) {
            router.replace("/work-mode");
            return;
          }
        }

        if (selectedMode === "plant") {
          if (!canPlant && !canGrowing) {
            router.replace("/work-mode");
            return;
          }
        }

        if (selectedMode === "expense" && !hasExpenseAreaAccess(p)) {
          router.replace("/work-mode");
          return;
        }

        if (selectedMode === "tunnel" && !canAccessTunnelOps(p)) {
          router.replace("/work-mode");
          return;
        }

        if (selectedMode === "expense" || selectedMode === "admin") {
          if (ep.viewReports) {
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
          } else {
            setSummary(null);
            setVendors([]);
            setMaterials([]);
            setTax(null);
            setPaymentMadeByAgg([]);
          }
          if (ep.viewVouchers) {
            const voucherList = await apiFetch("/vouchers").catch(() => null);
            setExpenseVouchers(Array.isArray(voucherList) ? voucherList : []);
          } else {
            setExpenseVouchers([]);
          }
          if (ep.viewMaterials) {
            const allMaterials = await apiFetch("/materials").catch(() => null);
            setExpenseMaterialsCatalog(Array.isArray(allMaterials) ? allMaterials : []);
          } else {
            setExpenseMaterialsCatalog([]);
          }
        } else {
          setExpenseVouchers([]);
          setExpenseMaterialsCatalog([]);
        }
        if (selectedMode === "room") {
          if (!canAccessRoomOps(p)) {
            router.replace("/work-mode");
            return;
          }
        }
        if (selectedMode === "room" || selectedMode === "admin") {
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
            p === "all" || p?.sales?.view || p?.sales?.edit;
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
            p === "all" || p?.contributions?.view || p?.contributions?.edit;
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

        if ((selectedMode === "plant" || selectedMode === "admin") && canGrowing) {
          try {
            const gr = await apiFetch("/growing-room/dashboard-summary");
            setGrowingRoomSummary(gr && typeof gr === "object" ? gr : null);
          } catch {
            setGrowingRoomSummary(null);
          }
        } else {
          setGrowingRoomSummary(null);
        }
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, [router]);

  useEffect(() => {
    const show =
      (workMode === "contributions" || workMode === "admin") && contributionSummary != null;
    if (!show) {
      setContributionChartsData(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await apiFetch(`/contributions/dashboard-charts?year=${contributionChartYear}`);
        if (!cancelled) setContributionChartsData(d);
      } catch {
        if (!cancelled) setContributionChartsData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workMode, contributionSummary, contributionChartYear]);

  useEffect(() => {
    const show = (workMode === "sales" || workMode === "admin") && salesSummary != null;
    if (!show) {
      setSalesChartsData(null);
      return undefined;
    }
    let cancelled = false;
    const q = new URLSearchParams({
      comparisonYear: String(salesComparisonYear),
      pieYear: String(salesPieYear),
      pieMonth: String(salesPieMonth)
    });
    (async () => {
      try {
        const d = await apiFetch(`/sales/dashboard-charts?${q.toString()}`);
        if (!cancelled) setSalesChartsData(d);
      } catch {
        if (!cancelled) setSalesChartsData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workMode, salesSummary, salesComparisonYear, salesPieYear, salesPieMonth]);

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

      {(workMode === "plant" || (workMode === "admin" && canGrowingRoomOps)) && canGrowingRoomOps ? (
        <div className="card card-soft" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <h3 className="panel-title" style={{ margin: 0 }}>
              Growing room tasks
            </h3>
            <Link href="/plant-operations/growing-rooms" className="btn btn-secondary">
              Open growing rooms
            </Link>
          </div>
          <p className="page-lead">
            Interventions by crop stage, daily monitoring, harvest yields, and cleaning between cycles.
          </p>
          <div className="grid grid-3" style={{ gap: 12 }}>
            <div className="stat-card" style={{ padding: 16 }}>
              <span className="stat-hint">Due today</span>
              <span className="stat-value" style={{ fontSize: 22 }}>
                {growingRoomSummary?.counts?.dueToday ?? "—"}
              </span>
            </div>
            <div className="stat-card" style={{ padding: 16 }}>
              <span className="stat-hint">Overdue</span>
              <span className="stat-value" style={{ fontSize: 22, color: "var(--danger)" }}>
                {growingRoomSummary?.counts?.overdue ?? "—"}
              </span>
            </div>
            <div className="stat-card" style={{ padding: 16 }}>
              <span className="stat-hint">Completed today</span>
              <span className="stat-value" style={{ fontSize: 22 }}>
                {growingRoomSummary?.counts?.completedToday ?? "—"}
              </span>
            </div>
          </div>
        </div>
      ) : null}

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
                      {canTunnelEditOps ? (
                        <button className="btn btn-secondary" type="button" onClick={() => moveTunnelBatch(batch)}>
                          Move now
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {(workMode === "expense" || workMode === "admin") &&
      (expensePerm.viewReports || expensePerm.viewVouchers || expensePerm.viewMaterials) ? (
        <>
          {expensePerm.viewReports || expensePerm.viewVouchers ? (
            <section className="saas-section" aria-label="Key metrics">
              <div className="dashboard-expense-dashlets">
                {expensePerm.viewReports && summary ? (
                  <>
                    <Link className="stat-link" href="/reports">
                      <div className="card stat-card stat-dashlet">
                        <div className="stat-dashlet__icon" aria-hidden>
                          <IconStatPaid />
                        </div>
                        <div className="stat-dashlet__body">
                          <span className="stat-label">Total paid amount</span>
                          <span className="stat-value">{formatIndianRupee(summary.totalPaidAmount)}</span>
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
                          <span className="stat-value">{formatIndianRupee(summary.totalTax)}</span>
                          <span className="stat-hint">Open reports →</span>
                        </div>
                      </div>
                    </Link>
                  </>
                ) : null}
                {expensePerm.viewVouchers ? (
                  <>
                    <Link className="stat-link" href="/vouchers">
                      <div className="card stat-card stat-dashlet">
                        <div className="stat-dashlet__icon" aria-hidden>
                          <IconStatVouchers />
                        </div>
                        <div className="stat-dashlet__body">
                          <span className="stat-label">Vouchers</span>
                          <span className="stat-value">
                            {summary ? summary.voucherCount : expenseVouchers.length}
                          </span>
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
                  </>
                ) : null}
              </div>
            </section>
          ) : null}
          {expensePerm.viewVouchers ? (
            <section className="saas-section dashboard-expense-charts-section" aria-label="Monthly voucher spend and raw materials">
              <div className="dashboard-expense-charts-row">
                <div className="dashboard-expense-charts-row__cell">
                  <ExpenseMonthlyChart
                    year={expenseChartYear}
                    monthlyTotals={expenseVoucherDerived.monthlyTotals}
                    onYearChange={setExpenseChartYear}
                  />
                </div>
                {expensePerm.viewMaterials ? (
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
                ) : null}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {(workMode === "sales" || workMode === "admin") && salesSummary ? (
        <section className="saas-section" aria-label="Sales metrics">
          <div className="dashboard-expense-dashlets">
            <Link className="stat-link" href="/sales">
              <div className="card stat-card stat-dashlet">
                <div className="stat-dashlet__icon" aria-hidden>
                  <IconStatPaid />
                </div>
                <div className="stat-dashlet__body">
                  <span className="stat-label">Total sales value</span>
                  <span className="stat-value">{formatIndianRupee(salesSummary.totalAmount)}</span>
                  <span className="stat-hint">All time · View sales →</span>
                </div>
              </div>
            </Link>
            <Link className="stat-link" href="/sales">
              <div className="card stat-card stat-dashlet">
                <div className="stat-dashlet__icon" aria-hidden>
                  <IconStatVouchers />
                </div>
                <div className="stat-dashlet__body">
                  <span className="stat-label">Mushroom sales</span>
                  <span className="stat-value">
                    {formatIndianRupee(salesSummary.byCategory?.mushroom?.totalAmount ?? 0)}
                  </span>
                  <span className="stat-hint">{salesSummary.byCategory?.mushroom?.count ?? 0} line(s) →</span>
                </div>
              </div>
            </Link>
            <Link className="stat-link" href="/sales">
              <div className="card stat-card stat-dashlet">
                <div className="stat-dashlet__icon" aria-hidden>
                  <IconStatTax />
                </div>
                <div className="stat-dashlet__body">
                  <span className="stat-label">Compost sales</span>
                  <span className="stat-value">
                    {formatIndianRupee(salesSummary.byCategory?.compost?.totalAmount ?? 0)}
                  </span>
                  <span className="stat-hint">{salesSummary.byCategory?.compost?.count ?? 0} line(s) →</span>
                </div>
              </div>
            </Link>
            <Link className="stat-link" href="/sales">
              <div className="card stat-card stat-dashlet stat-dashlet--yesterday">
                <div className="stat-dashlet__icon stat-dashlet__icon--yesterday" aria-hidden>
                  <IconStatYesterday />
                </div>
                <div className="stat-dashlet__body">
                  <span className="stat-label">Yesterday sales (IST)</span>
                  <span className="stat-value">
                    {formatIndianRupee(salesSummary.yesterdayTotal ?? 0)}
                  </span>
                  <span className="stat-hint">Calendar day in India →</span>
                </div>
              </div>
            </Link>
            <Link className="stat-link" href="/sales">
              <div className="card stat-card stat-dashlet stat-dashlet--month">
                <div className="stat-dashlet__icon stat-dashlet__icon--month" aria-hidden>
                  <IconStatMonth />
                </div>
                <div className="stat-dashlet__body">
                  <span className="stat-label">Current month sales (IST)</span>
                  <span className="stat-value">
                    {formatIndianRupee(salesSummary.currentMonthTotal ?? 0)}
                  </span>
                  <span className="stat-hint">This calendar month →</span>
                </div>
              </div>
            </Link>
          </div>

          <div className="dashboard-expense-charts-section" aria-label="Sales charts" style={{ marginTop: 16 }}>
            <div className="dashboard-expense-charts-row">
              <div className="dashboard-expense-charts-row__cell">
                {salesChartsData &&
                salesChartsData.comparisonYear === salesComparisonYear &&
                salesChartsData.pieYear === salesPieYear &&
                salesChartsData.pieMonthIndex === salesPieMonth ? (
                  <SalesYoYMonthlyChart
                    comparisonYear={salesComparisonYear}
                    previousYear={salesChartsData.previousYear}
                    monthlyThisYear={salesChartsData.monthlyThisYear}
                    monthlyPreviousYear={salesChartsData.monthlyPreviousYear}
                    onComparisonYearChange={setSalesComparisonYear}
                  />
                ) : (
                  <div className="dashboard-voucher-chart-card dashboard-voucher-chart-card--compact">
                    <div className="dashboard-voucher-chart-card__head">
                      <h3 className="dashboard-voucher-chart-card__title">Monthly sales vs prior year</h3>
                    </div>
                    <div className="dashboard-voucher-chart-card__body">
                      <p className="page-lead" style={{ margin: 0 }}>
                        Loading chart…
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="dashboard-expense-charts-row__cell">
                {salesChartsData &&
                salesChartsData.comparisonYear === salesComparisonYear &&
                salesChartsData.pieYear === salesPieYear &&
                salesChartsData.pieMonthIndex === salesPieMonth ? (
                  <SalesCashBankSemiPie
                    pieYear={salesPieYear}
                    pieMonthIndex={salesPieMonth}
                    pieCash={salesChartsData.pieCash}
                    pieNonCash={salesChartsData.pieNonCash}
                    onPieYearChange={setSalesPieYear}
                    onPieMonthChange={setSalesPieMonth}
                  />
                ) : (
                  <div className="dashboard-raw-mat-pie-card dashboard-voucher-chart-card--compact">
                    <div className="dashboard-voucher-chart-card__head">
                      <h3 className="dashboard-voucher-chart-card__title">Cash vs bank / digital</h3>
                    </div>
                    <div className="dashboard-voucher-chart-card__body">
                      <p className="page-lead" style={{ margin: 0 }}>
                        Loading chart…
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
            <Link className="stat-link" href="/contributions/cash-withdrawals" aria-label="Balance available in bank">
              <div className="card stat-card">
                <span className="stat-label">Balance available in bank</span>
                <span className="stat-value">
                  {formatIndianRupee(contributionSummary.balanceAvailableInBank ?? 0)}
                </span>
                <span className="stat-hint">
                  Routed total − Company Account paid − cash in hand (
                  {formatIndianRupee(contributionSummary.cashInHand ?? 0)}) → Cash withdrawals
                </span>
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

          <div className="dashboard-expense-charts-row" style={{ marginTop: 20 }}>
            <div className="dashboard-expense-charts-row__cell">
              {contributionChartsData ? (
                <ContributionMemberMonthlyChart
                  year={contributionChartYear}
                  members={contributionChartsData.members}
                  monthly={contributionChartsData.monthly}
                  onYearChange={setContributionChartYear}
                />
              ) : (
                <div className="dashboard-voucher-chart-card dashboard-voucher-chart-card--compact">
                  <div className="dashboard-voucher-chart-card__head">
                    <h3 className="dashboard-voucher-chart-card__title">Bank contribution by month</h3>
                  </div>
                  <div className="dashboard-voucher-chart-card__body">
                    <p className="page-lead" style={{ margin: 0 }}>
                      Loading chart…
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="dashboard-expense-charts-row__cell">
              {contributionChartsData ? (
                <ContributionTotalsPie
                  members={contributionChartsData.members}
                  totalsTillDate={contributionChartsData.totalsTillDate}
                />
              ) : (
                <div className="dashboard-raw-mat-pie-card dashboard-voucher-chart-card--compact">
                  <div className="dashboard-voucher-chart-card__head">
                    <h3 className="dashboard-voucher-chart-card__title">Total contribution</h3>
                  </div>
                  <div className="dashboard-voucher-chart-card__body">
                    <p className="page-lead" style={{ margin: 0 }}>
                      Loading chart…
                    </p>
                  </div>
                </div>
              )}
            </div>
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
              {contributionSummary.entryCount} record(s). Balance available in bank (routed total − Company Account paid
              vouchers − cash in hand from Cash withdrawals): {formatIndianRupee(contributionSummary.balanceAvailableInBank ?? 0)}{" "}
              (Company Account paid {formatIndianRupee(contributionSummary.totalExpensePaidFromCompanyAccount ?? 0)} on{" "}
              {contributionSummary.companyAccountPaidVoucherCount ?? 0} voucher(s); cash in hand{" "}
              {formatIndianRupee(contributionSummary.cashInHand ?? 0)}). Direct expense (voucher paid
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

      {(workMode === "expense" || workMode === "admin") && expensePerm.viewReports && vendors.length ? (
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

      {(workMode === "expense" || workMode === "admin") && expensePerm.viewReports ? <div className="card">
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
