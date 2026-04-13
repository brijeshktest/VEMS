"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchForm, downloadAttachment } from "../../../lib/api.js";
import PageHeader from "../../../components/PageHeader.js";
import { EditIconButton, DeleteIconButton, ExcelDownloadIconButton } from "../../../components/EditDeleteIconButtons.js";
import { useConfirmDialog } from "../../../components/ConfirmDialog.js";
import AttachmentListCell from "../../../components/AttachmentListCell.js";
import {
  validateOptionalEmail,
  validateOptionalGstin,
  validateOptionalPan,
  validateOptionalAadhaar,
  validateOptionalIndianMobile
} from "../../../lib/indianValidators.js";

function collectVendorFieldErrors(f) {
  const errors = {};
  const em = validateOptionalEmail(f.email);
  if (!em.ok) errors.email = em.message;
  const gstin = validateOptionalGstin(f.gstin);
  if (!gstin.ok) errors.gstin = gstin.message;
  const pan = validateOptionalPan(f.pan);
  if (!pan.ok) errors.pan = pan.message;
  const uid = validateOptionalAadhaar(f.aadhaar);
  if (!uid.ok) errors.aadhaar = uid.message;
  const mob = validateOptionalIndianMobile(f.contactNumber);
  if (!mob.ok) errors.contactNumber = mob.message;
  return errors;
}

const initialForm = {
  name: "",
  vendorType: "",
  gstin: "",
  address: "",
  contactPerson: "",
  contactNumber: "",
  email: "",
  pan: "",
  aadhaar: "",
  status: "Active"
};

export default function VendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [pendingFiles, setPendingFiles] = useState([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canBulkDelete, setCanBulkDelete] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const selectAllCheckboxRef = useRef(null);
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const { confirm, dialog } = useConfirmDialog();
  const fileInputRef = useRef(null);

  const resetVendorForm = useCallback(() => {
    setFieldErrors({});
    setEditingId(null);
    setForm(initialForm);
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const cancelEdit = useCallback(() => {
    resetVendorForm();
    setVendorModalOpen(false);
  }, [resetVendorForm]);

  const openAddVendorModal = useCallback(() => {
    resetVendorForm();
    setVendorModalOpen(true);
  }, [resetVendorForm]);

  async function load() {
    try {
      const [data, me, permData] = await Promise.all([
        apiFetch("/vendors"),
        apiFetch("/auth/me"),
        apiFetch("/auth/permissions").catch(() => ({ permissions: {} }))
      ]);
      setVendors(data);
      const admin = me?.user?.role === "admin";
      setIsAdmin(admin);
      const p = permData.permissions;
      const all = p === "all";
      setCanBulkDelete(admin || all || Boolean(p?.vendors?.bulkDelete));
    } catch (err) {
      setError(err.message);
    }
  }

  const vendorIdsKey = useMemo(() => vendors.map((v) => String(v._id)).join(","), [vendors]);

  useEffect(() => {
    const allowed = new Set(vendorIdsKey.split(",").filter(Boolean));
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
  }, [vendorIdsKey]);

  useLayoutEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el || !canBulkDelete) return;
    const ids = vendorIdsKey.split(",").filter(Boolean);
    const n = ids.length;
    const sel = ids.filter((id) => selectedIds.has(id)).length;
    el.indeterminate = n > 0 && sel > 0 && sel < n;
    el.checked = n > 0 && sel === n;
  }, [canBulkDelete, selectedIds, vendorIdsKey]);

  function toggleSelectAllVendors() {
    const ids = vendors.map((v) => String(v._id));
    if (!ids.length) return;
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }

  function toggleSelectVendor(id) {
    const sid = String(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }

  async function bulkDeleteSelectedVendors() {
    const ids = [...selectedIds];
    if (!ids.length || !canBulkDelete) return;
    const ok = await confirm({
      title: "Delete selected vendors?",
      message:
        ids.length === 1
          ? "Permanently delete this vendor? Related files and catalog links will be removed where safe. Vendors referenced by vouchers cannot be deleted."
          : `Permanently delete ${ids.length} vendors? Related files and catalog links will be removed where safe. Any vendor referenced by vouchers will be skipped.`
    });
    if (!ok) return;
    setError("");
    try {
      await apiFetch("/vendors/bulk-delete", {
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

  async function deleteVendor(vendor) {
    if (!isAdmin) return;
    const label = (vendor.name || "").trim() || "this vendor";
    const ok = await confirm({
      title: "Delete vendor?",
      message: `Remove “${label}” and related records may be affected. This cannot be undone.`
    });
    if (!ok) return;
    const vendorId = vendor._id;
    setError("");
    try {
      await apiFetch(`/vendors/${vendorId}`, { method: "DELETE" });
      if (editingId === vendorId) {
        cancelEdit();
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!vendorModalOpen) return undefined;
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
  }, [vendorModalOpen, cancelEdit]);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    const localErrors = collectVendorFieldErrors(form);
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      return;
    }
    setFieldErrors({});
    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("address", form.address || "");
      fd.append("contactPerson", form.contactPerson || "");
      fd.append("contactNumber", form.contactNumber || "");
      fd.append("email", form.email || "");
      fd.append("vendorType", form.vendorType || "");
      fd.append("gstin", form.gstin || "");
      fd.append("pan", form.pan || "");
      fd.append("aadhaar", form.aadhaar || "");
      fd.append("status", form.status || "Active");
      for (const file of pendingFiles) {
        fd.append("files", file);
      }
      if (editingId && removedAttachmentIds.length) {
        fd.append("removedAttachmentIds", JSON.stringify(removedAttachmentIds));
      }
      if (editingId) {
        await apiFetchForm(`/vendors/${editingId}`, fd, { method: "PUT" });
      } else {
        await apiFetchForm("/vendors", fd, { method: "POST" });
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(vendor) {
    setFieldErrors({});
    setEditingId(vendor._id);
    setForm({
      name: vendor.name || "",
      vendorType: vendor.vendorType || "",
      gstin: vendor.gstin || "",
      address: vendor.address || "",
      contactPerson: vendor.contactPerson || "",
      contactNumber: vendor.contactNumber || "",
      email: vendor.email || "",
      pan: vendor.pan || "",
      aadhaar: vendor.aadhaar || "",
      status: vendor.status || "Active"
    });
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setVendorModalOpen(true);
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

  const editingVendor = editingId ? vendors.find((v) => v._id === editingId) : null;
  const visibleAttachments =
    (editingVendor?.attachments || []).filter((a) => !removedAttachmentIds.includes(a._id)) || [];
  const vendorTypeOptions = Array.from(
    new Set(vendors.map((vendor) => (vendor.vendorType || "").trim()).filter(Boolean))
  ).sort();

  function materialNamesForVendorExport(vendor, materialsList) {
    const raw = vendor.materialsSupplied || [];
    return raw
      .map((mid) => {
        const id = mid && typeof mid === "object" && "_id" in mid ? mid._id : mid;
        const m = materialsList.find((x) => String(x._id) === String(id));
        return m?.name || String(id || "");
      })
      .filter(Boolean)
      .join("; ");
  }

  async function downloadVendorsExcel() {
    setError("");
    try {
      const XLSX = await import("xlsx");
      const materialsList = await apiFetch("/materials").catch(() => []);
      const rows = vendors.map((vendor) => ({
        Name: vendor.name || "",
        "Vendor type": vendor.vendorType || "",
        GSTIN: vendor.gstin || "",
        Address: vendor.address || "",
        "Contact person": vendor.contactPerson || "",
        "Contact number": vendor.contactNumber || "",
        Email: vendor.email || "",
        PAN: vendor.pan || "",
        Aadhaar: vendor.aadhaar || "",
        Status: vendor.status || "",
        "Attachment count": vendor.attachments?.length || 0,
        "Attachment file names": (vendor.attachments || [])
          .map((a) => a.originalName || a.storedName || "")
          .filter(Boolean)
          .join("; "),
        "Linked materials": materialNamesForVendorExport(vendor, materialsList),
        "Created at": vendor.createdAt ? new Date(vendor.createdAt).toISOString().slice(0, 10) : "",
        "Updated at": vendor.updatedAt ? new Date(vendor.updatedAt).toISOString().slice(0, 10) : ""
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Vendors");
      const filename = `vendors-${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      setError(err.message || "Could not generate Excel file");
    }
  }

  return (
    <div className="page-stack">
      {dialog}
      <PageHeader
        eyebrow="Directory"
        title="Vendors"
        description="Contact details, optional PAN and Aadhaar, and supporting documents. Map materials from the Materials screen."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="card-header-row card-header-row--voucher-toolbar">
          <h3 className="panel-title">All vendors</h3>
          <div className="voucher-table-toolbar-actions">
            <button className="btn" type="button" onClick={openAddVendorModal}>
              Add vendor
            </button>
            {canBulkDelete ? (
              <DeleteIconButton
                disabled={!selectedIds.size}
                onClick={() => void bulkDeleteSelectedVendors()}
                title={
                  selectedIds.size
                    ? `Delete ${selectedIds.size} selected vendor${selectedIds.size === 1 ? "" : "s"}`
                    : "Select vendors to delete"
                }
                aria-label={
                  selectedIds.size
                    ? `Delete ${selectedIds.size} selected vendor${selectedIds.size === 1 ? "" : "s"}`
                    : "Delete selected (choose vendors first)"
                }
              />
            ) : null}
            <ExcelDownloadIconButton
              disabled={!vendors.length}
              onClick={() => void downloadVendorsExcel()}
            />
          </div>
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
                      onChange={toggleSelectAllVendors}
                      aria-label="Select all vendors"
                    />
                  </th>
                ) : null}
                <th>Name</th>
                <th>Contact</th>
                <th>Documents</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr key={vendor._id}>
                  {canBulkDelete ? (
                    <td className="col-select">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(String(vendor._id))}
                        onChange={() => toggleSelectVendor(vendor._id)}
                        aria-label={`Select vendor ${(vendor.name || "").trim() || String(vendor._id)}`}
                      />
                    </td>
                  ) : null}
                  <td>{vendor.name}</td>
                  <td>
                    {vendor.contactPerson || "-"} ({vendor.contactNumber || "-"})
                  </td>
                  <td>
                    <AttachmentListCell entity={vendor} kind="vendor" />
                  </td>
                  <td>
                    <span
                      className={
                        vendor.status === "Active"
                          ? "status-pill status-pill--active"
                          : "status-pill status-pill--inactive"
                      }
                    >
                      {vendor.status}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <EditIconButton onClick={() => startEdit(vendor)} />
                      {isAdmin ? <DeleteIconButton onClick={() => void deleteVendor(vendor)} /> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {vendorModalOpen ? (
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
            aria-labelledby="vendor-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="voucher-modal-header">
              <h3 id="vendor-modal-title" className="voucher-modal-title">
                {editingId ? "Edit vendor" : "Add vendor"}
              </h3>
              <button type="button" className="voucher-modal-close" aria-label="Close" onClick={cancelEdit}>
                ×
              </button>
            </div>
            <div className="voucher-modal-body">
              <form className="grid grid-3 section-stack voucher-modal-form" onSubmit={onSubmit}>
                <div>
                  <label htmlFor="vendor-name">Vendor name</label>
                  <input
                    id="vendor-name"
                    className="input"
                    placeholder="Legal or trading name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="vendor-contact-person">Contact person</label>
                  <input
                    id="vendor-contact-person"
                    className="input"
                    placeholder="Name"
                    value={form.contactPerson}
                    onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="vendor-type">Vendor type (optional)</label>
                  <input
                    id="vendor-type"
                    className="input"
                    list="vendor-type-options"
                    placeholder="Type and select/add"
                    value={form.vendorType}
                    onChange={(e) => setForm({ ...form, vendorType: e.target.value })}
                  />
                  <datalist id="vendor-type-options">
                    {vendorTypeOptions.map((type) => (
                      <option key={type} value={type} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label htmlFor="vendor-gstin">GSTIN (optional)</label>
                  <input
                    id="vendor-gstin"
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
                  <span className="field-hint">Format: 27ABCDE1234F1Z5 (15 characters).</span>
                  {fieldErrors.gstin ? <span className="field-error">{fieldErrors.gstin}</span> : null}
                </div>
                <div>
                  <label htmlFor="vendor-mobile">Mobile (optional)</label>
                  <input
                    id="vendor-mobile"
                    className={`input${fieldErrors.contactNumber ? " input--error" : ""}`}
                    placeholder="9876543210 or +91 9876543210"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.contactNumber}
                    onChange={(e) => {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.contactNumber;
                        return next;
                      });
                      setForm({ ...form, contactNumber: e.target.value });
                    }}
                  />
                  <span className="field-hint">
                    10-digit Indian mobile; must start with 6–9. +91 or leading 0 accepted.
                  </span>
                  {fieldErrors.contactNumber ? <span className="field-error">{fieldErrors.contactNumber}</span> : null}
                </div>
                <div>
                  <label htmlFor="vendor-email">Email (optional)</label>
                  <input
                    id="vendor-email"
                    type="email"
                    className={`input${fieldErrors.email ? " input--error" : ""}`}
                    placeholder="vendor@example.com"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.email;
                        return next;
                      });
                      setForm({ ...form, email: e.target.value });
                    }}
                  />
                  <span className="field-hint">Standard email format; stored in lowercase.</span>
                  {fieldErrors.email ? <span className="field-error">{fieldErrors.email}</span> : null}
                </div>
                <div>
                  <label htmlFor="vendor-pan">PAN (optional)</label>
                  <input
                    id="vendor-pan"
                    className={`input${fieldErrors.pan ? " input--error" : ""}`}
                    placeholder="ABCDE1234F"
                    autoCapitalize="characters"
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
                  <span className="field-hint">
                    Format AAAAA9999A; 4th letter is holder type (e.g. P individual, C company).
                  </span>
                  {fieldErrors.pan ? <span className="field-error">{fieldErrors.pan}</span> : null}
                </div>
                <div>
                  <label htmlFor="vendor-aadhaar">Aadhaar (optional)</label>
                  <input
                    id="vendor-aadhaar"
                    className={`input${fieldErrors.aadhaar ? " input--error" : ""}`}
                    placeholder="12 digits (spaces ok)"
                    inputMode="numeric"
                    autoComplete="off"
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
                  <span className="field-hint">12 digits; UIDAI Verhoeff checksum is verified.</span>
                  {fieldErrors.aadhaar ? <span className="field-error">{fieldErrors.aadhaar}</span> : null}
                </div>
                <input
                  className="input form-span-all"
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
                <div className="form-span-all">
                  <label>Attachments (optional, multiple files)</label>
                  <input ref={fileInputRef} className="input" type="file" multiple onChange={onFilePick} />
                  {pendingFiles.length ? (
                    <ul className="file-chips">
                      {pendingFiles.map((file, index) => (
                        <li key={`${file.name}-${index}`}>
                          <span>{file.name}</span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-tiny"
                            onClick={() => removePendingFile(index)}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {editingId && visibleAttachments.length ? (
                    <div>
                      <label>Current files</label>
                      <ul className="file-chips">
                        {visibleAttachments.map((att) => (
                          <li key={att._id}>
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() =>
                                downloadAttachment(`/vendors/${editingId}/attachments/download/${att.storedName}`)
                              }
                            >
                              {att.originalName}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-tiny"
                              onClick={() => markAttachmentRemoved(att._id)}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="voucher-modal-actions form-span-all">
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
