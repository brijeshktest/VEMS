"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";

const initialForm = {
  name: "",
  category: "",
  unit: "",
  description: "",
  vendorIds: []
};

export default function MaterialsPage() {
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const categoryOptions = Array.from(
    new Set(materials.map((material) => (material.category || "").trim()).filter(Boolean))
  );

  async function load() {
    try {
      const [materialData, vendorData] = await Promise.all([
        apiFetch("/materials"),
        apiFetch("/vendors")
      ]);
      setMaterials(materialData);
      setVendors(vendorData);
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
        await apiFetch(`/materials/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form)
        });
      } else {
        await apiFetch("/materials", {
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

  function toggleVendor(id) {
    setForm((prev) => {
      const exists = prev.vendorIds.includes(id);
      return {
        ...prev,
        vendorIds: exists ? prev.vendorIds.filter((vid) => vid !== id) : [...prev.vendorIds, id]
      };
    });
  }

  function startEdit(material) {
    setEditingId(material._id);
    setForm({
      name: material.name || "",
      category: material.category || "",
      unit: material.unit || "",
      description: material.description || "",
      vendorIds: material.vendorIds || []
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(initialForm);
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div>
        <h1>Materials</h1>
        <p>Manage materials and vendor associations.</p>
      </div>

      {error ? <div className="card">{error}</div> : null}

      <div className="card">
        <h3>{editingId ? "Edit Material" : "Add Material"}</h3>
        <form className="grid grid-3" onSubmit={onSubmit}>
          <input
            className="input"
            placeholder="Material name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            list="material-category-options"
          />
          <datalist id="material-category-options">
            {categoryOptions.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          <input
            className="input"
            placeholder="Unit (e.g., kg, pcs)"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
          <input
            className="input"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <p>Vendors</p>
            <div className="grid grid-3">
              {vendors.map((vendor) => (
                <label key={vendor._id}>
                  <input
                    type="checkbox"
                    checked={form.vendorIds.includes(vendor._id)}
                    onChange={() => toggleVendor(vendor._id)}
                  />{" "}
                  {vendor.name}
                </label>
              ))}
            </div>
          </div>
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
        <h3>Material List</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Description</th>
              <th>Vendor Count</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((material) => (
              <tr key={material._id}>
                <td>{material.name}</td>
                <td>{material.category || "-"}</td>
                <td>{material.unit || "-"}</td>
                <td>{material.description || "-"}</td>
                <td>{material.vendorIds?.length || 0}</td>
                <td>
                  <button className="btn btn-secondary" type="button" onClick={() => startEdit(material)}>
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
