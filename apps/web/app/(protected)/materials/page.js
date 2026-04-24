"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api.js";
import PageHeader from "../../../components/PageHeader.js";
import { EditIconButton, DeleteIconButton, ExcelDownloadIconButton } from "../../../components/EditDeleteIconButtons.js";
import { useConfirmDialog } from "../../../components/ConfirmDialog.js";
import MaterialBulkImport from "../../../components/MaterialBulkImport.js";
import { canViewModule, canCreateInModule, canEditInModule } from "../../../lib/modulePermissions.js";

const initialForm = {
  name: "",
  category: "",
  unit: "",
  description: "",
  vendorIds: []
};

/** API may return ObjectId or string; form + checkboxes always use string ids. */
function normalizeMaterialVendorIds(ids) {
  return (ids || [])
    .map((x) => {
      if (x == null) return "";
      if (typeof x === "object" && x._id != null) return String(x._id);
      return String(x);
    })
    .filter(Boolean);
}

export default function MaterialsPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [canBulkDelete, setCanBulkDelete] = useState(false);
  const [canBulkUpload, setCanBulkUpload] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const selectAllCheckboxRef = useRef(null);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [canCreateMaterial, setCanCreateMaterial] = useState(false);
  const [canEditMaterial, setCanEditMaterial] = useState(false);
  const { confirm, dialog } = useConfirmDialog();
  const categoryOptions = Array.from(
    new Set(materials.map((material) => (material.category || "").trim()).filter(Boolean))
  );

  const formVendorIdSet = useMemo(
    () => new Set(normalizeMaterialVendorIds(form.vendorIds)),
    [form.vendorIds]
  );

  async function load() {
    try {
      const [meData, permData] = await Promise.all([
        apiFetch("/auth/me"),
        apiFetch("/auth/permissions").catch(() => ({ permissions: {} }))
      ]);
      const admin = meData?.user?.role === "admin";
      setIsAdmin(admin);
      const p = permData.permissions;
      const all = p === "all";
      const pk =
        Array.isArray(permData.plantModuleKeys) && permData.plantModuleKeys.length > 0
          ? permData.plantModuleKeys
          : null;
      if (!canViewModule(p, "materials", pk)) {
        router.replace("/dashboard");
        return;
      }
      setCanCreateMaterial(admin || all || canCreateInModule(p, "materials", pk));
      setCanEditMaterial(admin || all || canEditInModule(p, "materials", pk));
      setCanBulkDelete(admin || all || Boolean(p?.materials?.bulkDelete));
      setCanBulkUpload(admin || all || Boolean(p?.materials?.bulkUpload));
      const [materialData, vendorData] = await Promise.all([apiFetch("/materials"), apiFetch("/vendors")]);
      setMaterials(materialData);
      setVendors(vendorData);
    } catch (err) {
      setError(err.message);
    }
  }

  const materialIdsKey = useMemo(() => materials.map((m) => String(m._id)).join(","), [materials]);

  useEffect(() => {
    const allowed = new Set(materialIdsKey.split(",").filter(Boolean));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
        else changed = true;
      }
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [materialIdsKey]);

  useLayoutEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el || !canBulkDelete) return;
    const ids = materialIdsKey.split(",").filter(Boolean);
    const n = ids.length;
    const sel = ids.filter((id) => selectedIds.has(id)).length;
    el.indeterminate = n > 0 && sel > 0 && sel < n;
    el.checked = n > 0 && sel === n;
  }, [canBulkDelete, selectedIds, materialIdsKey]);

  function toggleSelectAllMaterials() {
    const ids = materials.map((m) => String(m._id));
    if (!ids.length) return;
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }

  function toggleSelectMaterial(id) {
    const sid = String(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }

  async function bulkDeleteSelectedMaterials() {
    const ids = [...selectedIds];
    if (!ids.length || !canBulkDelete) return;
    const ok = await confirm({
      title: "Delete selected materials?",
      message:
        ids.length === 1
          ? "Permanently delete this material? Vendor catalog links will be updated. Materials used on vouchers cannot be deleted."
          : `Permanently delete ${ids.length} materials? Vendor catalog links will be updated. Any material used on a voucher will be skipped.`
    });
    if (!ok) return;
    setError("");
    try {
      await apiFetch("/materials/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids })
      });
      setSelectedIds(new Set());
      if (editingId && ids.includes(String(editingId))) cancelEdit();
      await load();
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
    const sid = String(id);
    setForm((prev) => {
      const vids = normalizeMaterialVendorIds(prev.vendorIds);
      const exists = vids.includes(sid);
      return {
        ...prev,
        vendorIds: exists ? vids.filter((vid) => vid !== sid) : [...vids, sid]
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
      vendorIds: normalizeMaterialVendorIds(material.vendorIds)
    });
    setMaterialModalOpen(true);
  }

  function vendorNamesForMaterialExport(material) {
    return (material.vendorIds || [])
      .map((id) => {
        const vid = id && typeof id === "object" && "_id" in id ? id._id : id;
        const v = vendors.find((x) => String(x._id) === String(vid));
        return v?.name || String(vid || "");
      })
      .filter(Boolean)
      .join("; ");
  }

  async function downloadMaterialsExcel() {
    setError("");
    try {
      const XLSX = await import("xlsx");
      const rows = materials.map((m) => ({
        Name: m.name || "",
        Category: m.category || "",
        Unit: m.unit || "",
        Description: m.description || "",
        "Vendor count": normalizeMaterialVendorIds(m.vendorIds).length,
        Vendors: vendorNamesForMaterialExport(m),
        "Created at": m.createdAt ? new Date(m.createdAt).toISOString().slice(0, 10) : "",
        "Updated at": m.updatedAt ? new Date(m.updatedAt).toISOString().slice(0, 10) : ""
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Materials");
      const filename = `materials-${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      setError(err.message || "Could not generate Excel file");
    }
  }

  async function deleteMaterial(material) {
    if (!isAdmin) return;
    const label = (material.name || "").trim() || "this material";
    const ok = await confirm({
      title: "Delete material?",
      message: `Remove “${label}” from the catalog? This cannot be undone.`
    });
    if (!ok) return;
    const materialId = material._id;
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
      {dialog}
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
            {canCreateMaterial ? (
              <button className="btn" type="button" onClick={openAddMaterialModal}>
                Add material
              </button>
            ) : null}
            {canBulkDelete ? (
              <DeleteIconButton
                disabled={!selectedIds.size}
                onClick={() => void bulkDeleteSelectedMaterials()}
                title={
                  selectedIds.size
                    ? `Delete ${selectedIds.size} selected material${selectedIds.size === 1 ? "" : "s"}`
                    : "Select materials to delete"
                }
                aria-label={
                  selectedIds.size
                    ? `Delete ${selectedIds.size} selected material${selectedIds.size === 1 ? "" : "s"}`
                    : "Delete selected (choose materials first)"
                }
              />
            ) : null}
            <ExcelDownloadIconButton
              disabled={!materials.length}
              onClick={() => void downloadMaterialsExcel()}
            />
            <MaterialBulkImport
              vendors={vendors}
              canBulkUpload={canBulkUpload}
              setError={setError}
              onImported={async () => {
                await load();
              }}
            />
          </div>
        </div>
        <div className="voucher-table-totals" aria-live="polite">
          <span className="voucher-table-totals__count">
            Total materials: <strong>{materials.length}</strong>
          </span>
        </div>
        <div className="table-wrap">
          <table className="table">
          <thead>
            <tr>
              {canBulkDelete ? (
                <th className="col-select" scope="col">
                  <input
                    ref={selectAllCheckboxRef}
                    type="checkbox"
                    onChange={toggleSelectAllMaterials}
                    aria-label="Select all materials"
                  />
                </th>
              ) : null}
              <th>Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Description</th>
              <th>Vendor count</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((material) => (
              <tr key={material._id}>
                {canBulkDelete ? (
                  <td className="col-select">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(String(material._id))}
                      onChange={() => toggleSelectMaterial(material._id)}
                      aria-label={`Select material ${(material.name || "").trim() || String(material._id)}`}
                    />
                  </td>
                ) : null}
                <td>{material.name}</td>
                <td>{material.category || "-"}</td>
                <td>{material.unit || "-"}</td>
                <td>{material.description || "-"}</td>
                <td>{normalizeMaterialVendorIds(material.vendorIds).length}</td>
                <td>
                  <div className="row-actions">
                    {canEditMaterial ? <EditIconButton onClick={() => startEdit(material)} /> : null}
                    {isAdmin ? <DeleteIconButton onClick={() => void deleteMaterial(material)} /> : null}
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
                          checked={formVendorIdSet.has(String(vendor._id))}
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
