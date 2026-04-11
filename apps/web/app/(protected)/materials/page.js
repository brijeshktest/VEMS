"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api.js";
import PageHeader from "../../../components/PageHeader.js";
import { EditIconButton, DeleteIconButton } from "../../../components/EditDeleteIconButtons.js";

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const categoryOptions = Array.from(
    new Set(materials.map((material) => (material.category || "").trim()).filter(Boolean))
  );

  async function load() {
    try {
      const [materialData, vendorData, meData] = await Promise.all([
        apiFetch("/materials"),
        apiFetch("/vendors"),
        apiFetch("/auth/me")
      ]);
      setMaterials(materialData);
      setVendors(vendorData);
      setIsAdmin(meData?.user?.role === "admin");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const resetMaterialForm = useCallback(() => {
    setEditingId(null);
    setForm(initialForm);
  }, []);

  const cancelEdit = useCallback(() => {
    resetMaterialForm();
    setMaterialModalOpen(false);
  }, [resetMaterialForm]);

  const openAddMaterialModal = useCallback(() => {
    resetMaterialForm();
    setMaterialModalOpen(true);
  }, [resetMaterialForm]);

  useEffect(() => {
    if (!materialModalOpen) return undefined;
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
  }, [materialModalOpen, cancelEdit]);

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
      cancelEdit();
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
    setMaterialModalOpen(true);
  }

  async function deleteMaterial(materialId) {
    if (!isAdmin) return;
    setError("");
    try {
      await apiFetch(`/materials/${materialId}`, { method: "DELETE" });
      if (editingId === materialId) {
        cancelEdit();
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Catalog"
        title="Materials"
        description="Define items you buy and link them to vendors so vouchers can validate line items."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="card-header-row card-header-row--voucher-toolbar">
          <h3 className="panel-title">All materials</h3>
          <div className="voucher-table-toolbar-actions">
            <button className="btn" type="button" onClick={openAddMaterialModal}>
              Add material
            </button>
          </div>
        </div>
        <div className="table-wrap">
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
                  <div className="row-actions">
                    <EditIconButton onClick={() => startEdit(material)} />
                    {isAdmin ? <DeleteIconButton onClick={() => deleteMaterial(material._id)} /> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {materialModalOpen ? (
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
            aria-labelledby="material-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="material-modal-title" className="voucher-modal-title">
                {editingId ? "Edit material" : "Add material"}
              </h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={cancelEdit}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body">
              <form className="grid section-stack voucher-modal-form" onSubmit={onSubmit}>
                <div className="grid grid-3">
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
                </div>
                <div className="panel-inset panel-inset--strong form-span-all">
                  <h4>Linked vendors</h4>
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
                <div className="voucher-modal-actions">
                  <button className="btn" type="submit">
                    {editingId ? "Update" : "Save"}
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
