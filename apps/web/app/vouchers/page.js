"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api.js";

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
      if (editingId) {
        await apiFetch(`/vouchers/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({
            ...form,
          items,
          paymentDate: form.paymentStatus === "Paid" ? form.paymentDate : null,
          paidByMode: form.paymentStatus === "Paid" ? form.paidByMode : "",
          paymentComments: form.paymentStatus === "Paid" ? form.paymentComments : ""
          })
        });
      } else {
        await apiFetch("/vouchers", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            items
          })
        });
      }
      setForm(initialForm);
      setItems([{ materialId: "", quantity: 1, pricePerUnit: 0, comment: "" }]);
      setEditingId(null);
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
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(initialForm);
    setItems([{ materialId: "", quantity: 1, pricePerUnit: 0, comment: "" }]);
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div>
        <h1>Expense / Purchase Vouchers</h1>
        <p>Create and track purchases with auto-calculated totals.</p>
      </div>

      {error ? <div className="card">{error}</div> : null}

      <div className="card">
        <h3>{editingId ? "Edit Voucher" : "Create Voucher"}</h3>
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

          <div className="card">
            <h4>Items</h4>
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

          <div className="card">
            <p>Subtotal: {totals.subTotal.toFixed(2)}</p>
            <p>Tax: {totals.taxAmount.toFixed(2)}</p>
            <p>Final Amount: {totals.finalAmount.toFixed(2)}</p>
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
        <h3>Voucher List</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Vendor</th>
              <th>Total</th>
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
  );
}
