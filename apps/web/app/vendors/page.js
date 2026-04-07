"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, apiFetchForm, downloadAttachment } from "../../lib/api.js";
import PageHeader from "../../components/PageHeader.js";
import AttachmentListCell from "../../components/AttachmentListCell.js";
import {
  validateOptionalEmail,
  validateOptionalGstin,
  validateOptionalPan,
  validateOptionalAadhaar,
  validateOptionalIndianMobile
} from "../../lib/indianValidators.js";

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
  const fileInputRef = useRef(null);

  async function load() {
    try {
      const [data, me] = await Promise.all([apiFetch("/vendors"), apiFetch("/auth/me")]);
      setVendors(data);
      setIsAdmin(me?.user?.role === "admin");
    } catch (err) {
      setError(err.message);
    }
  }
  async function deleteVendor(vendorId) {
    if (!isAdmin) return;
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
      setForm(initialForm);
      setEditingId(null);
      setPendingFiles([]);
      setRemovedAttachmentIds([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
  }

  function cancelEdit() {
    setFieldErrors({});
    setEditingId(null);
    setForm(initialForm);
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

  const editingVendor = editingId ? vendors.find((v) => v._id === editingId) : null;
  const visibleAttachments =
    (editingVendor?.attachments || []).filter((a) => !removedAttachmentIds.includes(a._id)) || [];
  const vendorTypeOptions = Array.from(
    new Set(vendors.map((vendor) => (vendor.vendorType || "").trim()).filter(Boolean))
  ).sort();

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Directory"
        title="Vendors"
        description="Contact details, optional PAN and Aadhaar, and supporting documents. Map materials from the Materials screen."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <h3 className="panel-title">{editingId ? "Edit vendor" : "Add vendor"}</h3>
        <form className="grid grid-3" onSubmit={onSubmit}>
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
            <span className="field-hint">10-digit Indian mobile; must start with 6–9. +91 or leading 0 accepted.</span>
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
            <span className="field-hint">Format AAAAA9999A; 4th letter is holder type (e.g. P individual, C company).</span>
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
            className="input"
            placeholder="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            style={{ gridColumn: "1 / -1" }}
          />
          <select
            className="input"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Attachments (optional, multiple files)</label>
            <input
              ref={fileInputRef}
              className="input"
              type="file"
              multiple
              onChange={onFilePick}
            />
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
            {editingId && visibleAttachments.length ? (
              <div style={{ marginTop: 12 }}>
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
        <h3 className="panel-title">All vendors</h3>
        <div className="table-wrap">
          <table className="table">
          <thead>
            <tr>
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
                <td>{vendor.name}</td>
                <td>
                  {vendor.contactPerson || "-"} ({vendor.contactNumber || "-"})
                </td>
                <td>
                  <AttachmentListCell entity={vendor} kind="vendor" />
                </td>
                <td>{vendor.status}</td>
                <td>
                  <button className="btn btn-secondary" type="button" onClick={() => startEdit(vendor)}>
                    Edit
                  </button>
                  {isAdmin ? (
                    <button className="btn btn-secondary" type="button" onClick={() => deleteVendor(vendor._id)}>
                      Delete
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
