"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchForm, downloadAttachment } from "../../../lib/api.js";
import PageHeader from "../../../components/PageHeader.js";
import AttachmentListCell from "../../../components/AttachmentListCell.js";
import { EditIconButton, DeleteIconButton, ExcelDownloadIconButton } from "../../../components/EditDeleteIconButtons.js";
import { useConfirmDialog } from "../../../components/ConfirmDialog.js";
import { PAYMENT_MADE_FROM_CHOICES } from "../../../lib/paymentMadeFrom.js";

const initialForm = {
  vendorId: "",
  voucherNumber: "",
  dateOfPurchase: new Date().toISOString().slice(0, 10),
  taxPercent: 0,
  discountType: "none",
  discountValue: 0,
  paidAmount: 0,
  paymentMethod: "Cash",
  paymentStatus: "Pending",
  paymentDate: "",
  paymentMadeBy: "",
  paidByMode: "",
  paymentComments: ""
};

function computeTotals(items, taxPercent, discountType, discountValue) {
  const subTotal = items.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0);
  const taxAmount = subTotal * (taxPercent / 100);
  let total = subTotal + taxAmount;
  if (discountType === "percent") {
    total -= total * (discountValue / 100);
  } else if (discountType === "flat") {
    total -= discountValue;
  }
  return { subTotal, taxAmount, finalAmount: Math.max(0, total) };
}

/** Select-all on focus so default numeric values (0, 1) are replaced on first keystroke; mousedown guard avoids clearing selection on click. */
function numericFieldMouseDown(e) {
  if (document.activeElement === e.currentTarget) {
    e.preventDefault();
  }
}

function numericFieldFocus(e) {
  const el = e.currentTarget;
  requestAnimationFrame(() => el.select());
}

function dateFieldFocus(e) {
  const el = e.currentTarget;
  requestAnimationFrame(() => el.select());
}

function paymentStatusClass(status) {
  if (status === "Paid") return "status-pill status-pill--paid";
  if (status === "Partially Paid") return "status-pill status-pill--partial";
  return "status-pill status-pill--pending";
}

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [items, setItems] = useState([{ materialId: "", quantity: 1, pricePerUnit: 0, comment: "" }]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState([]);
  const fileInputRef = useRef(null);
  const [paidAmountManuallySet, setPaidAmountManuallySet] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const defaultColumnFilters = {
    date: "",
    voucherNo: "",
    vendor: "",
    voucherAmt: "",
    paidAmt: "",
    madeFrom: "",
    docs: "",
    status: "",
    createdBy: "",
    updatedBy: ""
  };
  const [columnFilters, setColumnFilters] = useState(defaultColumnFilters);
  const { confirm, dialog } = useConfirmDialog();

  async function load() {
    try {
      const [voucherData, vendorData, materialData, meData] = await Promise.all([
        apiFetch("/vouchers"),
        apiFetch("/vendors"),
        apiFetch("/materials"),
        apiFetch("/auth/me")
      ]);
      setVouchers(voucherData);
      setVendors(vendorData);
      setMaterials(materialData);
      setIsAdmin(meData?.user?.role === "admin");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredVouchers = useMemo(() => {
    const inc = (hay, needle) => {
      const n = (needle || "").trim().toLowerCase();
      if (!n) return true;
      return String(hay ?? "")
        .toLowerCase()
        .includes(n);
    };
    return vouchers.filter((voucher) => {
      const vid = voucher.vendorId?._id ?? voucher.vendorId;
      const vendor = vendors.find((v) => String(v._id) === String(vid));
      const vendorName = vendor?.name || "";
      if (!inc(new Date(voucher.dateOfPurchase).toLocaleDateString(), columnFilters.date)) return false;
      if (!inc(voucher.voucherNumber || "", columnFilters.voucherNo)) return false;
      if (!inc(vendorName, columnFilters.vendor)) return false;
      if (!inc(Number(voucher.finalAmount).toFixed(2), columnFilters.voucherAmt)) return false;
      if (!inc(Number(voucher.paidAmount ?? voucher.finalAmount ?? 0).toFixed(2), columnFilters.paidAmt)) return false;
      if (!inc(voucher.paymentMadeBy || "", columnFilters.madeFrom)) return false;
      const hasDocs = (voucher.attachments?.length || 0) > 0;
      if (columnFilters.docs === "yes" && !hasDocs) return false;
      if (columnFilters.docs === "no" && hasDocs) return false;
      if (columnFilters.status && voucher.paymentStatus !== columnFilters.status) return false;
      if (!inc(voucher.createdByName || "", columnFilters.createdBy)) return false;
      if (!inc(voucher.statusUpdatedByName || "", columnFilters.updatedBy)) return false;
      return true;
    });
  }, [vouchers, vendors, columnFilters]);

  const legacyPaymentMadeByOption =
    editingId &&
    (form.paymentMadeBy || "").trim() &&
    !PAYMENT_MADE_FROM_CHOICES.includes((form.paymentMadeBy || "").trim())
      ? (form.paymentMadeBy || "").trim()
      : null;

  const availableMaterials = useMemo(() => {
    if (!form.vendorId) return materials;
    return materials.filter((material) => material.vendorIds?.includes(form.vendorId));
  }, [materials, form.vendorId]);

  const totals = computeTotals(items, Number(form.taxPercent), form.discountType, Number(form.discountValue));

  useEffect(() => {
    if (!paidAmountManuallySet) {
      setForm((prev) => ({ ...prev, paidAmount: Number(totals.finalAmount.toFixed(2)) }));
    }
  }, [totals.finalAmount, paidAmountManuallySet]);

  function updateItem(index, field, value) {
    setItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, { materialId: "", quantity: 1, pricePerUnit: 0, comment: "" }]);
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  const resetVoucherForm = useCallback(() => {
    setEditingId(null);
    setForm(initialForm);
    setPaidAmountManuallySet(false);
    setItems([{ materialId: "", quantity: 1, pricePerUnit: 0, comment: "" }]);
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const cancelEdit = useCallback(() => {
    resetVoucherForm();
    setVoucherModalOpen(false);
  }, [resetVoucherForm]);

  const openCreateVoucherModal = useCallback(() => {
    resetVoucherForm();
    setVoucherModalOpen(true);
  }, [resetVoucherForm]);

  function startEdit(voucher) {
    setEditingId(voucher._id);
    setForm({
      vendorId: voucher.vendorId?.toString?.() || voucher.vendorId,
      voucherNumber: voucher.voucherNumber || "",
      dateOfPurchase: new Date(voucher.dateOfPurchase).toISOString().slice(0, 10),
      taxPercent: voucher.taxPercent ?? 0,
      discountType: voucher.discountType ?? "none",
      discountValue: voucher.discountValue ?? 0,
      paidAmount: voucher.paidAmount ?? voucher.finalAmount ?? 0,
      paymentMethod: voucher.paymentMethod || "Cash",
      paymentStatus: voucher.paymentStatus || "Pending",
      paymentDate: voucher.paymentDate ? new Date(voucher.paymentDate).toISOString().slice(0, 10) : "",
      paymentMadeBy: voucher.paymentMadeBy || "",
      paidByMode: voucher.paidByMode || "",
      paymentComments: voucher.paymentComments || ""
    });
    setItems(
      (voucher.items || []).map((item) => ({
        materialId: item.materialId?._id || item.materialId,
        quantity: Number(item.quantity || 0),
        pricePerUnit: Number(item.pricePerUnit || 0),
        comment: item.comment || ""
      }))
    );
    setPaidAmountManuallySet(true);
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setVoucherModalOpen(true);
  }

  useEffect(() => {
    if (!voucherModalOpen) return undefined;
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
  }, [voucherModalOpen, cancelEdit]);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    if (form.paymentStatus === "Paid") {
      const p = (form.paymentMadeBy || "").trim();
      if (!PAYMENT_MADE_FROM_CHOICES.includes(p)) {
        setError("When status is Paid, choose Payment made from the list.");
        return;
      }
    }
    try {
      const payload = {
        ...form,
        items,
        paymentDate: form.paymentStatus === "Paid" ? form.paymentDate : null,
        paymentMadeBy: form.paymentStatus === "Paid" ? (form.paymentMadeBy || "").trim() : "",
        paidByMode: form.paymentStatus === "Paid" ? form.paidByMode : "",
        paymentComments: form.paymentStatus === "Paid" ? form.paymentComments : ""
      };
      const fd = new FormData();
      fd.append("data", JSON.stringify(payload));
      for (const file of pendingFiles) {
        fd.append("files", file);
      }
      if (editingId && removedAttachmentIds.length) {
        fd.append("removedAttachmentIds", JSON.stringify(removedAttachmentIds));
      }
      if (editingId) {
        await apiFetchForm(`/vouchers/${editingId}`, fd, { method: "PUT" });
      } else {
        await apiFetchForm("/vouchers", fd, { method: "POST" });
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function onFilePick(e) {
    const picked = Array.from(e.target.files || []);
    if (picked.length) {
      setPendingFiles((prev) => [...prev, ...picked]);
    }
    e.target.value = "";
  }

  function removePendingFile(index) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function markAttachmentRemoved(id) {
    setRemovedAttachmentIds((prev) => [...prev, id]);
  }

  const editingVoucher = editingId ? vouchers.find((v) => v._id === editingId) : null;
  async function deleteVoucher(voucher) {
    if (!isAdmin) return;
    const no = (voucher.voucherNumber || "").trim();
    const ok = await confirm({
      title: "Delete voucher?",
      message: no
        ? `Permanently delete voucher ${no}? Line items and attachments will be removed.`
        : "Permanently delete this voucher? Line items and attachments will be removed."
    });
    if (!ok) return;
    const voucherId = voucher._id;
    setError("");
    try {
      await apiFetch(`/vouchers/${voucherId}`, { method: "DELETE" });
      if (editingId === voucherId) {
        cancelEdit();
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const visibleVoucherAttachments =
    (editingVoucher?.attachments || []).filter((a) => !removedAttachmentIds.includes(a._id)) || [];

  async function downloadVouchersExcel() {
    setError("");
    try {
      const XLSX = await import("xlsx");
      const rows = [];
      for (const voucher of filteredVouchers) {
        const vid = voucher.vendorId?._id ?? voucher.vendorId;
        const vendor = vendors.find((v) => String(v._id) === String(vid));
        const base = {
          Date: new Date(voucher.dateOfPurchase).toLocaleDateString(),
          "Voucher no.": voucher.voucherNumber || "",
          Vendor: vendor?.name || "Unknown",
          "Payment method": voucher.paymentMethod || "",
          "Voucher amount": Number(voucher.finalAmount),
          "Paid amount": Number(voucher.paidAmount ?? voucher.finalAmount ?? 0),
          Status: voucher.paymentStatus,
          "Payment made from": voucher.paymentMadeBy || "",
          "Created By": voucher.createdByName || "-",
          "Status Updated By": voucher.statusUpdatedByName || "-"
        };
        const items = voucher.items || [];
        if (!items.length) {
          rows.push({
            ...base,
            Material: "",
            Quantity: "",
            Unit: "",
            "Price per unit": "",
            "Line total": "",
            "Line comment": ""
          });
          continue;
        }
        for (const item of items) {
          const mid = item.materialId?._id ?? item.materialId;
          const material = materials.find((m) => String(m._id) === String(mid));
          const qty = Number(item.quantity || 0);
          const ppu = Number(item.pricePerUnit || 0);
          rows.push({
            ...base,
            Material: material?.name || "Unknown",
            Quantity: qty,
            Unit: material?.unit || "",
            "Price per unit": ppu,
            "Line total": qty * ppu,
            "Line comment": item.comment || ""
          });
        }
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Vouchers");
      const filename = `vouchers-${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      setError(err.message || "Could not generate Excel file");
    }
  }

  return (
    <div className="page-stack">
      {dialog}
      <PageHeader
        eyebrow="Purchasing"
        title="Expense vouchers"
        description="Line items, tax, discounts, and payment details with automatic totals. Attach invoices or receipts as needed."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="card-header-row card-header-row--voucher-toolbar">
          <h3 className="panel-title">All vouchers</h3>
          <div className="voucher-table-toolbar-actions">
            <button className="btn" type="button" onClick={openCreateVoucherModal}>
              Create voucher
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setColumnFilters({ ...defaultColumnFilters })}
            >
              Clear filters
            </button>
            <ExcelDownloadIconButton
              disabled={!filteredVouchers.length}
              onClick={() => void downloadVouchersExcel()}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Voucher no.</th>
              <th>Vendor</th>
              <th>Voucher amount</th>
              <th>Paid amount</th>
              <th>Payment made from</th>
              <th>Documents</th>
              <th>Status</th>
              <th>Created By</th>
              <th>Status Updated By</th>
              <th>Actions</th>
            </tr>
            <tr className="table-filter-row">
              <th>
                <input
                  className="input table-filter-input"
                  type="text"
                  placeholder="Filter…"
                  value={columnFilters.date}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, date: e.target.value }))}
                  aria-label="Filter by date"
                />
              </th>
              <th>
                <input
                  className="input table-filter-input"
                  type="text"
                  placeholder="Filter…"
                  value={columnFilters.voucherNo}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, voucherNo: e.target.value }))}
                  aria-label="Filter by voucher number"
                />
              </th>
              <th>
                <input
                  className="input table-filter-input"
                  type="text"
                  placeholder="Filter…"
                  value={columnFilters.vendor}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, vendor: e.target.value }))}
                  aria-label="Filter by vendor"
                />
              </th>
              <th>
                <input
                  className="input table-filter-input"
                  type="text"
                  placeholder="Filter…"
                  value={columnFilters.voucherAmt}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, voucherAmt: e.target.value }))}
                  aria-label="Filter by voucher amount"
                />
              </th>
              <th>
                <input
                  className="input table-filter-input"
                  type="text"
                  placeholder="Filter…"
                  value={columnFilters.paidAmt}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, paidAmt: e.target.value }))}
                  aria-label="Filter by paid amount"
                />
              </th>
              <th>
                <input
                  className="input table-filter-input"
                  type="text"
                  placeholder="Filter…"
                  value={columnFilters.madeFrom}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, madeFrom: e.target.value }))}
                  aria-label="Filter by payment made from"
                />
              </th>
              <th>
                <select
                  className="input table-filter-input"
                  value={columnFilters.docs}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, docs: e.target.value }))}
                  aria-label="Filter by attachments"
                >
                  <option value="">All</option>
                  <option value="yes">Has files</option>
                  <option value="no">No files</option>
                </select>
              </th>
              <th>
                <select
                  className="input table-filter-input"
                  value={columnFilters.status}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, status: e.target.value }))}
                  aria-label="Filter by status"
                >
                  <option value="">All</option>
                  <option>Paid</option>
                  <option>Pending</option>
                  <option>Partially Paid</option>
                </select>
              </th>
              <th>
                <input
                  className="input table-filter-input"
                  type="text"
                  placeholder="Filter…"
                  value={columnFilters.createdBy}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, createdBy: e.target.value }))}
                  aria-label="Filter by created by"
                />
              </th>
              <th>
                <input
                  className="input table-filter-input"
                  type="text"
                  placeholder="Filter…"
                  value={columnFilters.updatedBy}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, updatedBy: e.target.value }))}
                  aria-label="Filter by status updated by"
                />
              </th>
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {filteredVouchers.map((voucher) => {
              const vid = voucher.vendorId?._id ?? voucher.vendorId;
              const vendor = vendors.find((v) => String(v._id) === String(vid));
              return (
                <tr key={voucher._id}>
                  <td>{new Date(voucher.dateOfPurchase).toLocaleDateString()}</td>
                  <td>{voucher.voucherNumber || "-"}</td>
                  <td>{vendor?.name || "Unknown"}</td>
                  <td>{voucher.finalAmount.toFixed(2)}</td>
                  <td>{Number(voucher.paidAmount ?? voucher.finalAmount ?? 0).toFixed(2)}</td>
                  <td>{voucher.paymentMadeBy?.trim() ? voucher.paymentMadeBy : "—"}</td>
                  <td>
                    <AttachmentListCell entity={voucher} kind="voucher" />
                  </td>
                  <td>
                    <span className={paymentStatusClass(voucher.paymentStatus)}>{voucher.paymentStatus}</span>
                  </td>
                  <td>{voucher.createdByName || "-"}</td>
                  <td>{voucher.statusUpdatedByName || "-"}</td>
                  <td>
                    <div className="row-actions">
                      <EditIconButton onClick={() => startEdit(voucher)} />
                      {isAdmin ? <DeleteIconButton onClick={() => void deleteVoucher(voucher)} /> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {voucherModalOpen ? (
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
            aria-labelledby="voucher-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="voucher-modal-title" className="voucher-modal-title">
                {editingId ? "Edit voucher" : "Create voucher"}
              </h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={cancelEdit}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body">
        <form className="grid section-stack voucher-modal-form" onSubmit={onSubmit}>
          <div className="grid grid-4">
            <div>
              <label>Vendor</label>
              <select
                className="input"
                value={form.vendorId}
                onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
                required
              >
                <option value="">Select vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor._id} value={vendor._id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="voucher-field-date">
              <label>Date of purchase</label>
              <input
                className="input input--date"
                type="date"
                value={form.dateOfPurchase}
                onChange={(e) => setForm({ ...form, dateOfPurchase: e.target.value })}
                onMouseDown={numericFieldMouseDown}
                onFocus={dateFieldFocus}
                required
              />
            </div>
            <div>
              <label>Voucher number</label>
              <input
                className="input"
                type="text"
                value={form.voucherNumber}
                onChange={(e) => setForm({ ...form, voucherNumber: e.target.value })}
              />
            </div>
            <div>
              <label>Payment method</label>
              <select
                className="input"
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
              >
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>UPI</option>
                <option>Credit</option>
              </select>
            </div>
          </div>

          <div className="panel-inset panel-inset--voucher-lines">
            <h4>Line items</h4>
            <div className="voucher-line-items">
            {items.map((item, index) => (
              <div className="grid grid-4 line-item-row" key={index}>
                <div>
                  <label>Material</label>
                  <select
                    className="input"
                    value={item.materialId}
                    onChange={(e) => updateItem(index, "materialId", e.target.value)}
                    required
                  >
                    <option value="">Select material</option>
                    {availableMaterials.map((material) => (
                      <option key={material._id} value={material._id}>
                        {material.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Quantity</label>
                  <div className="line-item-qty">
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                      onMouseDown={numericFieldMouseDown}
                      onFocus={numericFieldFocus}
                      required
                    />
                    <span className="line-item-unit">
                      {availableMaterials.find((mat) => mat._id === item.materialId)?.unit || "-"}
                    </span>
                  </div>
                </div>
                <div>
                  <label>Price per unit</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.pricePerUnit}
                    onChange={(e) => updateItem(index, "pricePerUnit", Number(e.target.value))}
                    onMouseDown={numericFieldMouseDown}
                    onFocus={numericFieldFocus}
                    required
                  />
                </div>
                <div className="line-item-remove-col">
                  {items.length > 1 ? (
                    <button
                      type="button"
                      className="btn btn-secondary line-item-remove-btn"
                      aria-label="Remove line item"
                      onClick={() => removeItem(index)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="form-span-all">
                  <label>Comment</label>
                  <input
                    className="input"
                    type="text"
                    value={item.comment || ""}
                    onChange={(e) => updateItem(index, "comment", e.target.value)}
                    placeholder="Optional notes for this line item"
                  />
                </div>
              </div>
            ))}
            </div>
            <button type="button" className="btn btn-secondary voucher-add-line-btn" onClick={addItem}>
              Add Item
            </button>
          </div>

          <div className="grid grid-4">
            <div>
              <label>Tax %</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.taxPercent}
                onChange={(e) => setForm({ ...form, taxPercent: Number(e.target.value) })}
                onMouseDown={numericFieldMouseDown}
                onFocus={numericFieldFocus}
              />
            </div>
            <div>
              <label>Discount type</label>
              <select
                className="input"
                value={form.discountType}
                onChange={(e) => setForm({ ...form, discountType: e.target.value })}
              >
                <option value="none">No discount</option>
                <option value="percent">Percent</option>
                <option value="flat">Flat</option>
              </select>
            </div>
            <div>
              <label>Discount value</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                onMouseDown={numericFieldMouseDown}
                onFocus={numericFieldFocus}
              />
            </div>
            <div>
              <label>Paid amount</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.paidAmount}
                onChange={(e) => {
                  setPaidAmountManuallySet(true);
                  setForm({ ...form, paidAmount: Number(e.target.value) });
                }}
                onMouseDown={numericFieldMouseDown}
                onFocus={numericFieldFocus}
              />
            </div>
            <div>
              <label>Payment status</label>
              <select
                className="input"
                value={form.paymentStatus}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    paymentStatus: value,
                    paymentDate: value === "Paid" ? prev.paymentDate || prev.dateOfPurchase : "",
                    paymentMadeBy: value === "Paid" ? prev.paymentMadeBy : "",
                    paidByMode: value === "Paid" ? prev.paidByMode || prev.paymentMethod : "",
                    paymentComments: value === "Paid" ? prev.paymentComments : ""
                  }));
                }}
              >
                <option>Paid</option>
                <option>Pending</option>
                <option>Partially Paid</option>
              </select>
            </div>
          </div>

          {form.paymentStatus === "Paid" ? (
            <div className="grid grid-4">
              <div className="voucher-field-date">
                <label>Payment date</label>
                <input
                  className="input input--date"
                  type="date"
                  value={form.paymentDate}
                  onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                  onMouseDown={numericFieldMouseDown}
                  onFocus={dateFieldFocus}
                />
              </div>
              <div className="form-span-2">
                <label htmlFor="voucher-payment-made-from">Payment made from</label>
                <select
                  id="voucher-payment-made-from"
                  className="input"
                  required
                  value={form.paymentMadeBy}
                  onChange={(e) => setForm({ ...form, paymentMadeBy: e.target.value })}
                >
                  <option value="">Select who paid</option>
                  {legacyPaymentMadeByOption ? (
                    <option value={legacyPaymentMadeByOption}>
                      {legacyPaymentMadeByOption} (legacy — replace)
                    </option>
                  ) : null}
                  {PAYMENT_MADE_FROM_CHOICES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Paid by mode</label>
                <select
                  className="input"
                  value={form.paidByMode}
                  onChange={(e) => setForm({ ...form, paidByMode: e.target.value })}
                >
                  <option value="">Select mode</option>
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                  <option>UPI</option>
                  <option>Credit</option>
                </select>
              </div>
              <div className="form-span-all">
                <label>Payment comments</label>
                <input
                  className="input"
                  type="text"
                  value={form.paymentComments}
                  onChange={(e) => setForm({ ...form, paymentComments: e.target.value })}
                  placeholder="Enter URT, transaction number, or reference details"
                />
              </div>
            </div>
          ) : null}

          <div className="panel-inset panel-inset--strong totals-list">
            <p className="totals-item">
              <strong>Subtotal:</strong> {totals.subTotal.toFixed(2)}
            </p>
            <p className="totals-item">
              <strong>Tax:</strong> {totals.taxAmount.toFixed(2)}
            </p>
            <p className="totals-item--strong">
              <strong>Final amount:</strong> {totals.finalAmount.toFixed(2)}
            </p>
            <p className="totals-item">
              <strong>Paid amount:</strong> {Number(form.paidAmount || 0).toFixed(2)}
            </p>
          </div>

          <div>
            <label>Attachments (optional, multiple files)</label>
            <input ref={fileInputRef} className="input" type="file" multiple onChange={onFilePick} />
            {pendingFiles.length ? (
              <ul className="file-chips">
                {pendingFiles.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <span>{file.name}</span>
                    <button type="button" className="btn btn-secondary btn-tiny" onClick={() => removePendingFile(index)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {editingId && visibleVoucherAttachments.length ? (
              <div>
                <label>Current files</label>
                <ul className="file-chips">
                  {visibleVoucherAttachments.map((att) => (
                    <li key={att._id}>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() =>
                          downloadAttachment(`/vouchers/${editingId}/attachments/download/${att.storedName}`)
                        }
                      >
                        {att.originalName}
                      </button>
                      <button type="button" className="btn btn-secondary btn-tiny" onClick={() => markAttachmentRemoved(att._id)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="voucher-modal-actions">
            <button className="btn" type="submit">
              {editingId ? "Update Voucher" : "Save Voucher"}
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
