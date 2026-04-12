"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Promise-based confirm modal; render `dialog` inside the page root (e.g. first child of `.page-stack`). */
export function useConfirmDialog() {
  const resolveRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState({
    title: "",
    message: "",
    confirmLabel: "Delete",
    cancelLabel: "Cancel"
  });

  const confirm = useCallback((options = {}) => {
    const merged = {
      title: options.title ?? "Delete this item?",
      message: options.message ?? "This action cannot be undone.",
      confirmLabel: options.confirmLabel ?? "Delete",
      cancelLabel: options.cancelLabel ?? "Cancel"
    };
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOpts(merged);
      setOpen(true);
    });
  }, []);

  const finish = useCallback((value) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  const dialog = open ? (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish(false);
      }}
    >
      <div
        className="confirm-dialog-box"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <h3 id="confirm-dialog-title" className="confirm-dialog-title">
          {opts.title}
        </h3>
        <p id="confirm-dialog-desc" className="confirm-dialog-message">
          {opts.message}
        </p>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => finish(false)}>
            {opts.cancelLabel}
          </button>
          <button type="button" className="btn btn--danger-solid" onClick={() => finish(true)}>
            {opts.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
