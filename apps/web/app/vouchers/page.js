"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchForm, downloadAttachment } from "../../lib/api.js";
import PageHeader from "../../components/PageHeader.js";
import AttachmentListCell from "../../components/AttachmentListCell.js";

const initialForm = {
  vendorId: "",
  dateOfPurchase: new Date().toISOString().slice(0, 10),
  taxPercent: 0,
  discountType: "none",
  discountValue: 0,
  paymentMethod: "Cash",
  paymentStatus: "Pending",
  paymentDate: "",
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

  async function load() {
    try {
      const [voucherData, vendorData, materialData] = await Promise.all([
        apiFetch("/vouchers"),
        apiFetch("/vendors"),
        apiFetch("/materials")
      ]);
      setVouchers(voucherData);
      setVendors(vendorData);
      setMaterials(materialData);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const availableMaterials = useMemo(() => {
    if (!form.vendorId) return materials;
    return materials.filter((material) => material.vendorIds?.includes(form.vendorId));
  }, [materials, form.vendorId]);

  const totals = computeTotals(items, Number(form.taxPercent), form.discountType, Number(form.discountValue));

  function updateItem(index, field, value) {
    setItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, { materialId: "", quantity: 1, pricePerUnit: 0, comment: "" }]);
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      const payload = {
        ...form,
        items,
        paymentDate: form.paymentStatus === "Paid" ? form.paymentDate : null,
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
      setForm(initialForm);
      setItems([{ materialId: "", quantity: 1, pricePerUnit: 0, comment: "" }]);
      setEditingId(null);
      setPendingFiles([]);
      setRemovedAttachmentIds([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(voucher) {
    setEditingId(voucher._id);
    setForm({
      vendorId: voucher.vendorId?.toString?.() || voucher.vendorId,
      dateOfPurchase: new Date(voucher.dateOfPurchase).toISOString().slice(0, 10),
      taxPercent: voucher.taxPercent ?? 0,
      discountType: voucher.discountType ?? "none",
      discountValue: voucher.discountValue ?? 0,
      paymentMethod: voucher.paymentMethod || "Cash",
      paymentStatus: voucher.paymentStatus || "Pending",
      paymentDate: voucher.paymentDate ? new Date(voucher.paymentDate).toISOString().slice(0, 10) : "",
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
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(initialForm);
    setItems([{ materialId: "", quantity: 1, pricePerUnit: 0, comment: "" }]);
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
  const visibleVoucherAttachments =
    (editingVoucher?.attachments || []).filter((a) => !removedAttachmentIds.includes(a._id)) || [];

  async function downloadVouchersExcel() {
    setError("");
    try {
      const XLSX = await import("xlsx");
      const rows = [];
      for (const voucher of vouchers) {
        const vid = voucher.vendorId?._id ?? voucher.vendorId;
        const vendor = vendors.find((v) => String(v._id) === String(vid));
        const base = {
          Date: new Date(voucher.dateOfPurchase).toLocaleDateString(),
          Vendor: vendor?.name || "Unknown",
          "Payment method": voucher.paymentMethod || "",
          Total: Number(voucher.finalAmount),
          Status: voucher.paymentStatus,
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
      <PageHeader
        eyebrow="Purchasing"
        title="Expense vouchers"
        description="Line items, tax, discounts, and payment details with automatic totals. Attach invoices or receipts as needed."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <h3 className="panel-title">{editingId ? "Edit voucher" : "Create voucher"}</h3>
        <form className="grid" onSubmit={onSubmit} style={{ gap: 16 }}>
          <div className="grid grid-3">
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
            <div>
              <label>Date of purchase</label>
              <input
                className="input"
                type="date"
                value={form.dateOfPurchase}
                onChange={(e) => setForm({ ...form, dateOfPurchase: e.target.value })}
                required
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

          <div className="panel-inset">
            <h4>Line items</h4>
            {items.map((item, index) => (
              <div className="grid grid-3" key={index}>
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
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                      required
                    />
                    <span style={{ minWidth: 60 }}>
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
                    required
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label>Comment</label>
                  <input
                    className="input"
                    type="text"
                    value={item.comment || ""}
                    onChange={(e) => updateItem(index, "comment", e.target.value)}
                    placeholder="Optional notes for this line item"
                  />
                </div>
                {items.length > 1 ? (
                  <button type="button" className="btn btn-secondary" onClick={() => removeItem(index)}>
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            <button type="button" className="btn btn-secondary" onClick={addItem}>
              Add Item
            </button>
          </div>

          <div className="grid grid-3">
            <div>
              <label>Tax %</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.taxPercent}
                onChange={(e) => setForm({ ...form, taxPercent: Number(e.target.value) })}
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
            <div className="grid grid-3">
              <div>
                <label>Payment date</label>
                <input
                  className="input"
                  type="date"
                  value={form.paymentDate}
                  onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                />
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
              <div style={{ gridColumn: "1 / -1" }}>
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

          <div className="panel-inset">
            <p style={{ margin: "0 0 6px", fontSize: 14 }}>
              <strong>Subtotal:</strong> {totals.subTotal.toFixed(2)}
            </p>
            <p style={{ margin: "0 0 6px", fontSize: 14 }}>
              <strong>Tax:</strong> {totals.taxAmount.toFixed(2)}
            </p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
              <strong>Final amount:</strong> {totals.finalAmount.toFixed(2)}
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
              <div style={{ marginTop: 12 }}>
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

          <button className="btn" type="submit">
            {editingId ? "Update Voucher" : "Save Voucher"}
          </button>
          {editingId ? (
            <button className="btn btn-secondary" type="button" onClick={cancelEdit}>
              Cancel
            </button>
          ) : null}
        </form>
      </div>

      <div className="card">
        <div
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}
        >
          <h3 className="panel-title" style={{ margin: 0 }}>
            All vouchers
          </h3>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!vouchers.length}
            onClick={() => void downloadVouchersExcel()}
          >
            Download Excel
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Vendor</th>
              <th>Total</th>
              <th>Documents</th>
              <th>Status</th>
              <th>Created By</th>
              <th>Status Updated By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((voucher) => {
              const vendor = vendors.find((v) => v._id === voucher.vendorId);
              return (
                <tr key={voucher._id}>
                  <td>{new Date(voucher.dateOfPurchase).toLocaleDateString()}</td>
                  <td>{vendor?.name || "Unknown"}</td>
                  <td>{voucher.finalAmount.toFixed(2)}</td>
                  <td>
                    <AttachmentListCell entity={voucher} kind="voucher" />
                  </td>
                  <td>{voucher.paymentStatus}</td>
                  <td>{voucher.createdByName || "-"}</td>
                  <td>{voucher.statusUpdatedByName || "-"}</td>
                  <td>
                    <button className="btn btn-secondary" type="button" onClick={() => startEdit(voucher)}>
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
