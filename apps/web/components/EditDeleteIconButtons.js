"use client";

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
