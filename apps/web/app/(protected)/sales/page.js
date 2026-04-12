"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api.js";
import PageHeader from "../../../components/PageHeader.js";
import { EditIconButton, DeleteIconButton } from "../../../components/EditDeleteIconButtons.js";
import { useConfirmDialog } from "../../../components/ConfirmDialog.js";
import {
  validateOptionalGstin,
  validateOptionalPan,
  validateOptionalAadhaar
} from "../../../lib/indianValidators.js";

const PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Cheque", "Card", "Other"];

const initialForm = {
  invoiceNumber: "",
  soldAt: new Date().toISOString().slice(0, 10),
  paymentMode: "Cash",
  customerName: "",
  gstin: "",
  pan: "",
  aadhaar: "",
  buyerContact: "",
  productCategory: "mushroom",
  productName: "",
  quantity: "",
  unit: "kg",
  totalAmount: "",
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

export default function SalesPage() {
  const [sales, setSales] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  async function load() {
    try {
      const [saleData, meData] = await Promise.all([apiFetch("/sales"), apiFetch("/auth/me")]);
      setSales(saleData);
      setIsAdmin(meData?.user?.role === "admin");
    } catch (err) {
      setError(err.message);
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

    const quantity = Number(form.quantity);
    const totalAmount = Number(form.totalAmount);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError("Quantity must be a valid non-negative number.");
      return;
    }
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      setError("Total amount must be a valid non-negative number.");
      return;
    }

    const payload = {
      invoiceNumber,
      soldAt: form.soldAt,
      paymentMode: form.paymentMode,
      customerName,
      gstin: form.gstin.trim(),
      pan: form.pan.trim(),
      aadhaar: form.aadhaar.trim(),
      buyerContact: form.buyerContact.trim(),
      productCategory: form.productCategory,
      productName: form.productName.trim(),
      quantity,
      unit: form.unit.trim() || "kg",
      totalAmount,
      notes: form.notes.trim()
    };

    try {
      if (editingId) {
        await apiFetch(`/sales/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch("/sales", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(row) {
    setEditingId(row._id);
    setFieldErrors({});
    setForm({
      invoiceNumber: row.invoiceNumber?.trim() || "",
      soldAt: row.soldAt ? new Date(row.soldAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      paymentMode: PAYMENT_MODES.includes(row.paymentMode) ? row.paymentMode : "Cash",
      customerName: displayCustomer(row) === "—" ? "" : displayCustomer(row),
      gstin: row.gstin || "",
      pan: row.pan || "",
      aadhaar: row.aadhaar || "",
      buyerContact: row.buyerContact || "",
      productCategory: row.productCategory || "mushroom",
      productName: row.productName || "",
      quantity: String(row.quantity ?? ""),
      unit: row.unit || "kg",
      totalAmount: String(row.totalAmount ?? ""),
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
        description="Record sales invoices for mushrooms and compost: customer, tax IDs, invoice number, and how payment was received. Access is set in Admin → Roles (Sales management)."
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
                  <td>{Number(row.totalAmount).toFixed(2)}</td>
                  <td>{row.paymentMode?.trim() ? row.paymentMode : "—"}</td>
                  <td>
                    <div className="row-actions">
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
                  <input
                    id="sale-qty"
                    className="input"
                    inputMode="decimal"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
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
                <div>
                  <label htmlFor="sale-amount">Total amount (invoice)</label>
                  <input
                    id="sale-amount"
                    className="input"
                    inputMode="decimal"
                    value={form.totalAmount}
                    onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
                    required
                  />
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
