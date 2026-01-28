"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";

const initialForm = {
  name: "",
  address: "",
  contactPerson: "",
  contactNumber: "",
  email: "",
  status: "Active"
};

export default function VendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await apiFetch("/vendors");
      setVendors(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      if (editingId) {
        await apiFetch(`/vendors/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form)
        });
      } else {
        await apiFetch("/vendors", {
          method: "POST",
          body: JSON.stringify(form)
        });
      }
      setForm(initialForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(vendor) {
    setEditingId(vendor._id);
    setForm({
      name: vendor.name || "",
      address: vendor.address || "",
      contactPerson: vendor.contactPerson || "",
      contactNumber: vendor.contactNumber || "",
      email: vendor.email || "",
      status: vendor.status || "Active"
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(initialForm);
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div>
        <h1>Vendors</h1>
        <p>Manage vendors and their contact details.</p>
      </div>

      {error ? <div className="card">{error}</div> : null}

      <div className="card">
        <h3>{editingId ? "Edit Vendor" : "Add Vendor"}</h3>
        <form className="grid grid-3" onSubmit={onSubmit}>
          <input
            className="input"
            placeholder="Vendor name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder="Contact person"
            value={form.contactPerson}
            onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
          />
          <input
            className="input"
            placeholder="Contact number"
            value={form.contactNumber}
            onChange={(e) => setForm({ ...form, contactNumber: e.target.value })}
          />
          <input
            className="input"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className="input"
            placeholder="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <select
            className="input"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <button className="btn" type="submit">
            {editingId ? "Update" : "Save"}
          </button>
          {editingId ? (
            <button className="btn btn-secondary" type="button" onClick={cancelEdit}>
              Cancel
            </button>
          ) : null}
        </form>
      </div>

      <div className="card">
        <h3>Vendor List</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((vendor) => (
              <tr key={vendor._id}>
                <td>{vendor.name}</td>
                <td>{vendor.contactPerson || "-"} ({vendor.contactNumber || "-"})</td>
                <td>{vendor.status}</td>
                <td>
                  <button className="btn btn-secondary" type="button" onClick={() => startEdit(vendor)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
