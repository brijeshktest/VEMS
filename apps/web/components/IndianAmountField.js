"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { formatIndianGroupedNumber } from "../lib/indianAmountFormat.js";

function isEmptyValue(v) {
  return v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
}

/**
 * Text input with Indian-style grouping (e.g. 1,00,000.50) while typing.
 * `value` is a number, `null`, or `undefined` (empty). `onChange` receives the same.
 */
export default function IndianAmountField({
  value,
  onChange,
  id,
  className = "input",
  disabled,
  required,
  placeholder = "",
  maxFractionDigits = 2,
  "aria-label": ariaLabel,
  ...rest
}) {
  const [text, setText] = useState(() =>
    isEmptyValue(value) ? "" : formatIndianGroupedNumber(value, maxFractionDigits)
  );
  const lastPropValue = useRef(value);

  const syncFromProp = useCallback(
    (v) => {
      setText(isEmptyValue(v) ? "" : formatIndianGroupedNumber(v, maxFractionDigits));
    },
    [maxFractionDigits]
  );

  useEffect(() => {
    if (value !== lastPropValue.current) {
      lastPropValue.current = value;
      syncFromProp(value);
    }
  }, [value, syncFromProp]);

  function handleChange(e) {
    const raw = e.target.value;
    let normalized = raw.replace(/[^\d.,]/g, "").replace(/,/g, "");
    const dots = (normalized.match(/\./g) || []).length;
    if (dots > 1) {
      const first = normalized.indexOf(".");
      normalized = normalized.slice(0, first + 1) + normalized.slice(first + 1).replace(/\./g, "");
    }
    const hasDot = normalized.includes(".");
    const dotIdx = normalized.indexOf(".");
    const intRaw = hasDot ? normalized.slice(0, dotIdx) : normalized;
    const fracRaw = hasDot ? normalized.slice(dotIdx + 1) : "";
    let intDigits = intRaw.replace(/\D/g, "");
    intDigits = intDigits.replace(/^0+(?=\d)/, "");
    const fracDigits = fracRaw.replace(/\D/g, "").slice(0, maxFractionDigits);
    const trailingDot = hasDot && fracRaw === "" && normalized.endsWith(".");

    if (intDigits === "" && !hasDot) {
      setText("");
      lastPropValue.current = null;
      onChange(null);
      return;
    }

    const intPart = intDigits === "" && hasDot ? "0" : intDigits === "" ? "0" : intDigits;
    const intNum = Number(intPart);
    if (!Number.isFinite(intNum)) {
      setText(raw);
      return;
    }

    const intFormatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(intNum);

    if (trailingDot) {
      setText(`${intFormatted}.`);
      lastPropValue.current = intNum;
      onChange(intNum);
      return;
    }

    if (hasDot) {
      const num = fracDigits.length ? Number(`${intPart}.${fracDigits}`) : intNum;
      setText(
        fracDigits.length ? formatIndianGroupedNumber(num, maxFractionDigits) : `${intFormatted}.`
      );
      lastPropValue.current = num;
      onChange(Number.isFinite(num) ? num : intNum);
      return;
    }

    setText(formatIndianGroupedNumber(intNum, maxFractionDigits));
    lastPropValue.current = intNum;
    onChange(intNum);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      id={id}
      className={className}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      onChange={handleChange}
      {...rest}
    />
  );
}
