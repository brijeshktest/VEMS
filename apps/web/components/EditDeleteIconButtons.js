"use client";

import Link from "next/link";

function IconEye({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Icon-only button (e.g. open workspace). */
export function ViewIconButton({
  onClick,
  disabled,
  className = "",
  "aria-label": ariaLabel = "View",
  title = "View"
}) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <IconEye />
    </button>
  );
}

/** Icon-only link (e.g. open row detail). */
export function ViewIconLink({
  href,
  className = "",
  title = "View",
  "aria-label": ariaLabel = "View details"
}) {
  return (
    <Link href={href} className={`btn btn-secondary btn-icon ${className}`.trim()} aria-label={ariaLabel} title={title}>
      <IconEye />
    </Link>
  );
}

function IconPencil({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EditIconButton({ onClick, disabled, className = "", "aria-label": ariaLabel = "Edit", title = "Edit" }) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <IconPencil />
    </button>
  );
}

export function DeleteIconButton({
  onClick,
  disabled,
  className = "",
  "aria-label": ariaLabel = "Delete",
  title = "Delete"
}) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon btn-icon--danger ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <IconTrash />
    </button>
  );
}

/** Super Admin plant list: open impersonation picker for this plant. */
function IconImpersonate({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.85" />
      <path d="M3 20v-1c0-2.2 2.2-4 5-4h1" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.85" />
      <path d="M13 20v-1c0-1.6 1.5-2.8 3.5-3" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
    </svg>
  );
}

export function ImpersonateIconButton({
  onClick,
  disabled,
  className = "",
  "aria-label": ariaLabel = "Impersonate user",
  title = "Impersonate"
}) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <IconImpersonate />
    </button>
  );
}

function IconPlantActivate({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlantActivateIconButton({
  onClick,
  disabled,
  className = "",
  "aria-label": ariaLabel = "Activate plant",
  title = "Activate plant"
}) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <IconPlantActivate />
    </button>
  );
}

function IconPlantDeactivate({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M9 15l6-6M15 15L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PlantDeactivateIconButton({
  onClick,
  disabled,
  className = "",
  "aria-label": ariaLabel = "Deactivate plant",
  title = "Deactivate plant"
}) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <IconPlantDeactivate />
    </button>
  );
}

function IconLoginDefaultSet({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2.5l2.38 7.32h7.7l-6.24 4.53 2.38 7.32L12 17.14l-6.22 4.53 2.38-7.32-6.24-4.53h7.7L12 2.5z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LoginDefaultSetIconButton({
  onClick,
  disabled,
  className = "",
  "aria-label": ariaLabel = "Set login default plant",
  title = "Set as login default"
}) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <IconLoginDefaultSet />
    </button>
  );
}

function IconLoginDefaultClear({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2.5l2.38 7.32h7.7l-6.24 4.53 2.38 7.32L12 17.14l-6.22 4.53 2.38-7.32-6.24-4.53h7.7L12 2.5z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <path d="M5 19L19 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function LoginDefaultClearIconButton({
  onClick,
  disabled,
  className = "",
  "aria-label": ariaLabel = "Clear login default plant",
  title = "Clear login default"
}) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <IconLoginDefaultClear />
    </button>
  );
}

/** Spreadsheet / Excel-style workbook icon (generic, not a trademarked logo). */
function IconExcelSheet({ className }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="2" width="16" height="20" rx="2" fill="#217346" />
      <path d="M7 7h10M7 10h10M7 13h10M7 16h7" stroke="#ffffff" strokeWidth="1.25" strokeLinecap="round" opacity="0.95" />
      <path d="M16 2h3.5a1.5 1.5 0 011.5 1.5V7H16V2z" fill="#185c37" />
    </svg>
  );
}

export function ExcelDownloadIconButton({
  onClick,
  disabled,
  className = "",
  "aria-label": ariaLabel = "Download Excel",
  title = "Download Excel"
}) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon btn-icon--excel ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <IconExcelSheet />
    </button>
  );
}

/** Document with arrow — download PDF invoice. */
function IconPdfDocument({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M12 18v-6m0 0l-2.5 2.5M12 12l2.5 2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PdfDownloadIconButton({
  onClick,
  disabled,
  className = "",
  "aria-label": ariaLabel = "Download PDF",
  title = "Download PDF"
}) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <IconPdfDocument />
    </button>
  );
}

function IconFilterClear({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16l-5 7v6l-2 1v-7L4 6z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M5 20L19 6" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
    </svg>
  );
}

export function ClearFiltersIconButton({
  onClick,
  disabled,
  className = "",
  "aria-label": ariaLabel = "Clear filters",
  title = "Clear filters"
}) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon btn-icon--clear-filters ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <IconFilterClear />
    </button>
  );
}

/** Thermometer + list — daily compost parameter log. */
function IconParameterLog({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 18.5V5a2 2 0 114 0v13.5"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 18.5h8a2.5 2.5 0 01-8 0z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 8h4M15 11h4M15 14h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ParameterLogIconButton({
  onClick,
  disabled,
  className = "",
  "aria-label": ariaLabel = "Log daily parameters",
  title = "Log daily parameters"
}) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <IconParameterLog />
    </button>
  );
}
