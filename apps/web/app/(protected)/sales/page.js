"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api.js";
import PageHeader from "../../../components/PageHeader.js";
import { EditIconButton, DeleteIconButton, PdfDownloadIconButton } from "../../../components/EditDeleteIconButtons.js";
import { useConfirmDialog } from "../../../components/ConfirmDialog.js";
import {
  validateOptionalGstin,
  validateOptionalPan,
  validateOptionalAadhaar
} from "../../../lib/indianValidators.js";
import { formatIndianRupee } from "../../../lib/formatIndianRupee.js";
import IndianAmountField from "../../../components/IndianAmountField.js";
import { downloadSaleInvoicePdf } from "../../../lib/saleInvoicePdf.js";

const PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Cheque", "Card", "Other"];

const initialForm = {
  invoiceNumber: "",
  soldAt: new Date().toISOString().slice(0, 10),
  paymentMode: "Cash",
  customerName: "",
  customerAddress: "",
  gstin: "",
  pan: "",
  aadhaar: "",
  buyerContact: "",
  productCategory: "mushroom",
  productName: "",
  quantity: null,
  unit: "kg",
  lineSubTotal: null,
  discountType: "none",
  discountValue: null,
  taxPercent: 0,
  notes: ""
};

function categoryLabel(cat) {
  if (cat === "compost") return "Compost";
  return "Mushrooms";
}

function collectSaleInvoiceFieldErrors(f) {
  const errors = {};
  const g = validateOptionalGstin(f.gstin);
  if (!g.ok) errors.gstin = g.message;
  const p = validateOptionalPan(f.pan);
  if (!p.ok) errors.pan = p.message;
  const uid = validateOptionalAadhaar(f.aadhaar);
  if (!uid.ok) errors.aadhaar = uid.message;
  return errors;
}

function displayCustomer(row) {
  const n = (row.customerName || row.buyerName || "").trim();
  return n || "—";
}

function normalizeDiscountType(v) {
  const s = String(v || "").trim();
  if (s === "percent" || s === "flat") return s;
  return "none";
}

/** Mirror API computeSaleInvoiceAmounts for live preview (GST on post-discount amount). */
function computeSaleAmountsPreview(f) {
  const discountType = normalizeDiscountType(f.discountType);
  let discountValue = Number(f.discountValue);
  if (!Number.isFinite(discountValue) || discountValue < 0) discountValue = 0;
  let taxPercent = Number(f.taxPercent);
  if (!Number.isFinite(taxPercent) || taxPercent < 0) taxPercent = 0;
  if (taxPercent > 100) taxPercent = 100;

  const lineNum = f.lineSubTotal != null && f.lineSubTotal !== "" ? Number(f.lineSubTotal) : NaN;
  const hasPositiveLine = Number.isFinite(lineNum) && lineNum > 0;
  const base = hasPositiveLine ? lineNum : 0;

  let afterDiscount = base;
  if (discountType === "percent") {
    afterDiscount = base * (1 - Math.min(100, discountValue) / 100);
  } else if (discountType === "flat") {
    afterDiscount = Math.max(0, base - discountValue);
  }

  const taxAmount = afterDiscount * (taxPercent / 100);
  const totalAmount = afterDiscount + taxAmount;
  return { base, afterDiscount, taxAmount, totalAmount, discountType, discountValue, taxPercent };
}

export default function SalesPage() {
  const [sales, setSales] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const amountPreview = useMemo(() => computeSaleAmountsPreview(form), [form]);

  async function load() {
    try {
      const [saleData, meData] = await Promise.all([apiFetch("/sales"), apiFetch("/auth/me")]);
      setSales(saleData);
      setIsAdmin(meData?.user?.role === "admin");
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadLetterhead() {
    try {
      return await apiFetch("/settings/invoice-letterhead");
    } catch {
      return null;
    }
  }

  useEffect(() => {
    load();
  }, []);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFieldErrors({});
    setForm({ ...initialForm, soldAt: new Date().toISOString().slice(0, 10) });
  }, []);

  const cancelEdit = useCallback(() => {
    resetForm();
    setModalOpen(false);
  }, [resetForm]);

  const openCreate = useCallback(() => {
    resetForm();
    setModalOpen(true);
  }, [resetForm]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [modalOpen, cancelEdit]);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    const localErrors = collectSaleInvoiceFieldErrors(form);
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      return;
    }
    setFieldErrors({});

    const invoiceNumber = form.invoiceNumber.trim();
    const customerName = form.customerName.trim();
    if (!invoiceNumber) {
      setError("Invoice number is required.");
      return;
    }
    if (!customerName) {
      setError("Customer name is required.");
      return;
    }
    if (!PAYMENT_MODES.includes(form.paymentMode)) {
      setError("Choose a valid payment mode.");
      return;
    }

    const quantity = form.quantity;
    if (quantity == null || !Number.isFinite(quantity) || quantity < 0) {
      setError("Quantity must be a valid non-negative number.");
      return;
    }
    const lineSubTotal = form.lineSubTotal;
    if (lineSubTotal == null || !Number.isFinite(Number(lineSubTotal)) || Number(lineSubTotal) <= 0) {
      setError("Line amount (before discount & GST) must be a positive number.");
      return;
    }
    if (!Number.isFinite(amountPreview.totalAmount) || amountPreview.totalAmount < 0) {
      setError("Invalid totals from discount or GST.");
      return;
    }

    const payload = {
      invoiceNumber,
      soldAt: form.soldAt,
      paymentMode: form.paymentMode,
      customerName,
      customerAddress: form.customerAddress.trim(),
      gstin: form.gstin.trim(),
      pan: form.pan.trim(),
      aadhaar: form.aadhaar.trim(),
      buyerContact: form.buyerContact.trim(),
      productCategory: form.productCategory,
      productName: form.productName.trim(),
      quantity,
      unit: form.unit.trim() || "kg",
      lineSubTotal: Number(lineSubTotal),
      discountType: amountPreview.discountType,
      discountValue: amountPreview.discountValue,
      taxPercent: amountPreview.taxPercent,
      notes: form.notes.trim()
    };

    try {
      const wasCreate = !editingId;
      let saved;
      if (editingId) {
        saved = await apiFetch(`/sales/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        saved = await apiFetch("/sales", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      cancelEdit();
      await load();
      if (wasCreate) {
        try {
          const lh = await loadLetterhead();
          await downloadSaleInvoicePdf(saved, lh);
        } catch (pdfErr) {
          setError(pdfErr?.message || "Invoice saved, but PDF download failed.");
        }
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(row) {
    setEditingId(row._id);
    setFieldErrors({});
    const line =
      row.lineSubTotal != null && Number(row.lineSubTotal) > 0
        ? Number(row.lineSubTotal)
        : Number(row.totalAmount ?? 0) || null;
    setForm({
      invoiceNumber: row.invoiceNumber?.trim() || "",
      soldAt: row.soldAt ? new Date(row.soldAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      paymentMode: PAYMENT_MODES.includes(row.paymentMode) ? row.paymentMode : "Cash",
      customerName: displayCustomer(row) === "—" ? "" : displayCustomer(row),
      customerAddress: row.customerAddress || "",
      gstin: row.gstin || "",
      pan: row.pan || "",
      aadhaar: row.aadhaar || "",
      buyerContact: row.buyerContact || "",
      productCategory: row.productCategory || "mushroom",
      productName: row.productName || "",
      quantity: Number(row.quantity ?? 0) || null,
      unit: row.unit || "kg",
      lineSubTotal: line,
      discountType: normalizeDiscountType(row.discountType),
      discountValue:
        row.discountValue != null && Number.isFinite(Number(row.discountValue))
          ? Number(row.discountValue)
          : null,
      taxPercent: Number(row.taxPercent ?? 0) || 0,
      notes: row.notes || ""
    });
    setModalOpen(true);
  }

  async function deleteSale(row) {
    if (!isAdmin) return;
    const inv = (row.invoiceNumber || "").trim();
    const ok = await confirm({
      title: "Delete sale invoice?",
      message: inv
        ? `Permanently delete invoice ${inv}? This cannot be undone.`
        : "Permanently delete this sale invoice? This cannot be undone."
    });
    if (!ok) return;
    const id = row._id;
    setError("");
    try {
      await apiFetch(`/sales/${id}`, { method: "DELETE" });
      if (editingId === id) cancelEdit();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page-stack">
      {dialog}
      <PageHeader
        eyebrow="Revenue"
        title="Sales invoices"
        description="Record sales invoices for mushrooms and compost: customer, address, GST %, optional discount, line amount and totals, tax IDs, invoice number, and payment mode. Access is set in Admin → Roles (Sales management)."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="card-header-row card-header-row--voucher-toolbar">
          <h3 className="panel-title">All sales invoices</h3>
          <div className="voucher-table-toolbar-actions">
            <button className="btn" type="button" onClick={openCreate}>
              Add sales invoice
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Category</th>
                <th>Product</th>
                <th>Quantity</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((row) => (
                <tr key={row._id}>
                  <td>{row.invoiceNumber?.trim() ? row.invoiceNumber : "—"}</td>
                  <td>{row.soldAt ? new Date(row.soldAt).toLocaleDateString() : "—"}</td>
                  <td>{displayCustomer(row)}</td>
                  <td>{categoryLabel(row.productCategory)}</td>
                  <td>{row.productName?.trim() ? row.productName : "—"}</td>
                  <td>
                    {row.quantity}
                    {row.unit ? ` ${row.unit}` : ""}
                  </td>
                  <td>{formatIndianRupee(row.totalAmount)}</td>
                  <td>{row.paymentMode?.trim() ? row.paymentMode : "—"}</td>
                  <td>
                    <div className="row-actions">
                      <PdfDownloadIconButton
                        title="Download invoice PDF"
                        aria-label="Download invoice PDF"
                        onClick={() =>
                          void (async () => {
                            try {
                              const lh = await loadLetterhead();
                              await downloadSaleInvoicePdf(row, lh);
                            } catch (pdfErr) {
                              setError(pdfErr?.message || "PDF download failed.");
                            }
                          })()
                        }
                      />
                      <EditIconButton onClick={() => startEdit(row)} />
                      {isAdmin ? <DeleteIconButton onClick={() => void deleteSale(row)} /> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <div
          className="voucher-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) cancelEdit();
          }}
        >
          <div
            className="voucher-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="sale-modal-title" className="voucher-modal-title">
                {editingId ? "Edit sales invoice" : "Add sales invoice"}
              </h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={cancelEdit}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body">
              <form className="grid grid-3 section-stack voucher-modal-form" onSubmit={onSubmit}>
                <div className="form-span-all">
                  <h4 className="panel-title" style={{ marginBottom: 12 }}>
                    Invoice
                  </h4>
                </div>
                <div>
                  <label htmlFor="sale-invoice-number">Invoice number</label>
                  <input
                    id="sale-invoice-number"
                    className="input"
                    placeholder="e.g. INV-2026-0042"
                    value={form.invoiceNumber}
                    onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="sale-date">Invoice date</label>
                  <input
                    id="sale-date"
                    className="input"
                    type="date"
                    value={form.soldAt}
                    onChange={(e) => setForm({ ...form, soldAt: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="sale-payment-mode">Payment received as</label>
                  <select
                    id="sale-payment-mode"
                    className="input"
                    value={form.paymentMode}
                    onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
                    required
                  >
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-span-all">
                  <h4 className="panel-title" style={{ margin: "8px 0 12px" }}>
                    Customer
                  </h4>
                </div>
                <div className="form-span-all">
                  <label htmlFor="sale-customer">Customer name</label>
                  <input
                    id="sale-customer"
                    className="input"
                    placeholder="Legal or trading name"
                    value={form.customerName}
                    onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                    required
                  />
                </div>
                <div className="form-span-all">
                  <label htmlFor="sale-customer-address">Customer address (optional)</label>
                  <textarea
                    id="sale-customer-address"
                    className="input sales-invoice-address"
                    rows={3}
                    placeholder="Billing / delivery address"
                    value={form.customerAddress}
                    onChange={(e) => setForm({ ...form, customerAddress: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="sale-gstin">GSTIN (optional)</label>
                  <input
                    id="sale-gstin"
                    className={`input${fieldErrors.gstin ? " input--error" : ""}`}
                    placeholder="15 character GSTIN"
                    maxLength={15}
                    value={form.gstin}
                    onChange={(e) => {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.gstin;
                        return next;
                      });
                      setForm({ ...form, gstin: e.target.value.toUpperCase() });
                    }}
                  />
                  {fieldErrors.gstin ? <span className="field-error">{fieldErrors.gstin}</span> : null}
                </div>
                <div>
                  <label htmlFor="sale-pan">PAN (optional)</label>
                  <input
                    id="sale-pan"
                    className={`input${fieldErrors.pan ? " input--error" : ""}`}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    value={form.pan}
                    onChange={(e) => {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.pan;
                        return next;
                      });
                      setForm({ ...form, pan: e.target.value.toUpperCase() });
                    }}
                  />
                  {fieldErrors.pan ? <span className="field-error">{fieldErrors.pan}</span> : null}
                </div>
                <div>
                  <label htmlFor="sale-aadhaar">Aadhaar (optional)</label>
                  <input
                    id="sale-aadhaar"
                    className={`input${fieldErrors.aadhaar ? " input--error" : ""}`}
                    placeholder="12 digits"
                    inputMode="numeric"
                    value={form.aadhaar}
                    onChange={(e) => {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.aadhaar;
                        return next;
                      });
                      setForm({ ...form, aadhaar: e.target.value });
                    }}
                  />
                  {fieldErrors.aadhaar ? <span className="field-error">{fieldErrors.aadhaar}</span> : null}
                </div>
                <div className="form-span-all">
                  <label htmlFor="sale-contact">Customer contact / phone (optional)</label>
                  <input
                    id="sale-contact"
                    className="input"
                    placeholder="Mobile or alternate contact"
                    value={form.buyerContact}
                    onChange={(e) => setForm({ ...form, buyerContact: e.target.value })}
                  />
                </div>

                <div className="form-span-all">
                  <h4 className="panel-title" style={{ margin: "8px 0 12px" }}>
                    Line items
                  </h4>
                </div>
                <div>
                  <label htmlFor="sale-category">Product category</label>
                  <select
                    id="sale-category"
                    className="input"
                    value={form.productCategory}
                    onChange={(e) => setForm({ ...form, productCategory: e.target.value })}
                  >
                    <option value="mushroom">Mushrooms</option>
                    <option value="compost">Compost</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="sale-product-name">Product name (optional)</label>
                  <input
                    id="sale-product-name"
                    className="input"
                    placeholder="e.g. Button oyster, bulk compost"
                    value={form.productName}
                    onChange={(e) => setForm({ ...form, productName: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="sale-qty">Quantity</label>
                  <IndianAmountField
                    id="sale-qty"
                    className="input"
                    value={form.quantity}
                    onChange={(n) => setForm({ ...form, quantity: n })}
                    placeholder="e.g. 1,250.5"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="sale-unit">Unit</label>
                  <input
                    id="sale-unit"
                    className="input"
                    placeholder="kg, bags, trays…"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  />
                </div>
                <div className="form-span-all">
                  <label htmlFor="sale-line-subtotal">Line amount (before discount &amp; GST)</label>
                  <IndianAmountField
                    id="sale-line-subtotal"
                    className="input"
                    value={form.lineSubTotal}
                    onChange={(n) => setForm({ ...form, lineSubTotal: n })}
                    placeholder="Taxable value for this line"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="sale-discount-type">Discount</label>
                  <select
                    id="sale-discount-type"
                    className="input"
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                  >
                    <option value="none">None</option>
                    <option value="percent">Percent (%)</option>
                    <option value="flat">Flat (Rs)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="sale-discount-value">
                    {form.discountType === "percent" ? "Discount %" : "Discount amount (Rs)"}
                  </label>
                  {form.discountType === "flat" ? (
                    <IndianAmountField
                      id="sale-discount-value"
                      className="input"
                      value={form.discountValue}
                      onChange={(n) => setForm({ ...form, discountValue: n })}
                      placeholder="0"
                      disabled={form.discountType === "none"}
                    />
                  ) : (
                    <input
                      id="sale-discount-value"
                      className="input"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={form.discountType === "none" ? "" : form.discountValue ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          discountValue: e.target.value === "" ? null : Number(e.target.value)
                        })
                      }
                      placeholder="0"
                      disabled={form.discountType === "none"}
                    />
                  )}
                </div>
                <div>
                  <label htmlFor="sale-tax-percent">GST % (on amount after discount)</label>
                  <input
                    id="sale-tax-percent"
                    className="input"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.taxPercent === 0 ? "" : form.taxPercent}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        taxPercent: e.target.value === "" ? 0 : Number(e.target.value)
                      })
                    }
                    placeholder="0"
                  />
                </div>
                <div className="form-span-all sales-invoice-totals-preview">
                  <div className="sales-invoice-totals-preview__inner">
                    <span>After discount</span>
                    <strong>{formatIndianRupee(amountPreview.afterDiscount)}</strong>
                    <span>GST</span>
                    <strong>{formatIndianRupee(amountPreview.taxAmount)}</strong>
                    <span>Grand total</span>
                    <strong className="sales-invoice-totals-preview__grand">
                      {formatIndianRupee(amountPreview.totalAmount)}
                    </strong>
                  </div>
                </div>
                <div className="form-span-all">
                  <label htmlFor="sale-notes">Notes (optional)</label>
                  <input
                    id="sale-notes"
                    className="input"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <div className="voucher-modal-actions form-span-all">
                  <button className="btn" type="submit">
                    {editingId ? "Update invoice" : "Save invoice"}
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={cancelEdit}>
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
