"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { canViewModule, canCreateInModule, canEditInModule } from "../../../lib/modulePermissions.js";
import { apiFetch, apiFetchForm, downloadAttachment } from "../../../lib/api.js";
import PageHeader from "../../../components/PageHeader.js";
import AttachmentListCell from "../../../components/AttachmentListCell.js";
import {
  EditIconButton,
  DeleteIconButton,
  ExcelDownloadIconButton,
  ClearFiltersIconButton
} from "../../../components/EditDeleteIconButtons.js";
import { useConfirmDialog } from "../../../components/ConfirmDialog.js";
import VoucherBulkImport from "../../../components/VoucherBulkImport.js";
import { isPaymentMadeFromVelocity, PAYMENT_MADE_FROM_CHOICES } from "../../../lib/paymentMadeFrom.js";
import { formatIndianRupee } from "../../../lib/formatIndianRupee.js";
import IndianAmountField from "../../../components/IndianAmountField.js";

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

/** Native tooltip: voucher payment comments + each line (material + line comment). */
function voucherRowHoverTitle(voucher, materialsList) {
  const parts = [];
  const pc = (voucher.paymentComments || "").trim();
  if (pc) parts.push(`Voucher: ${pc}`);
  for (const item of voucher.items || []) {
    const mid = item.materialId?._id ?? item.materialId;
    const m = materialsList.find((x) => String(x._id) === String(mid));
    const mn = m?.name || "Item";
    const ic = (item.comment || "").trim();
    parts.push(ic ? `${mn}: ${ic}` : mn);
  }
  return parts.join("\n");
}

function voucherMaterialsCellLabel(voucher, materialsList) {
  const names = (voucher.items || []).map((item) => {
    const mid = item.materialId?._id ?? item.materialId;
    const m = materialsList.find((x) => String(x._id) === String(mid));
    return m?.name || "—";
  });
  return names.length ? names.join("; ") : "—";
}

function voucherMaterialNamesForFilter(voucher, materialsList) {
  return (voucher.items || [])
    .map((item) => {
      const mid = item.materialId?._id ?? item.materialId;
      const m = materialsList.find((x) => String(x._id) === String(mid));
      return m?.name || "";
    })
    .filter(Boolean)
    .join(" ");
}

/** Local calendar YYYY-MM-DD for dashboard deep-links (?dateRange=yesterday | month). */
function formatLocalYmd(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function purchaseDateRangeForPreset(preset) {
  const now = new Date();
  if (preset === "yesterday") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const key = formatLocalYmd(d);
    return { dateFrom: key, dateTo: key };
  }
  if (preset === "month") {
    const y = now.getFullYear();
    const m = now.getMonth();
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    return { dateFrom: formatLocalYmd(start), dateTo: formatLocalYmd(end) };
  }
  return { dateFrom: "", dateTo: "" };
}

function VouchersPageContent() {
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
  const [canBulkUpload, setCanBulkUpload] = useState(false);
  const [canBulkDelete, setCanBulkDelete] = useState(false);
  const [canCreateVoucher, setCanCreateVoucher] = useState(false);
  const [canEditVoucher, setCanEditVoucher] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const selectAllCheckboxRef = useRef(null);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const defaultColumnFilters = {
    dateFrom: "",
    dateTo: "",
    voucherNo: "",
    vendor: "",
    material: "",
    paidAmt: "",
    madeFrom: "",
    docs: "",
    status: "",
    createdBy: "",
    paidByMode: ""
  };
  const [columnFilters, setColumnFilters] = useState(defaultColumnFilters);
  const { confirm, dialog } = useConfirmDialog();

  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [dateDraftFrom, setDateDraftFrom] = useState("");
  const [dateDraftTo, setDateDraftTo] = useState("");
  const [datePopoverStyle, setDatePopoverStyle] = useState({ top: 0, left: 0, width: 280 });
  const dateFilterTriggerRef = useRef(null);
  const dateFilterPanelRef = useRef(null);

  const dateFilterActive = Boolean(columnFilters.dateFrom || columnFilters.dateTo);
  const router = useRouter();
  const searchParams = useSearchParams();

  function openDateFilterPopover() {
    setDateDraftFrom(columnFilters.dateFrom || "");
    setDateDraftTo(columnFilters.dateTo || "");
    setDateFilterOpen(true);
  }

  function applyDateFilter() {
    setColumnFilters((f) => ({ ...f, dateFrom: dateDraftFrom, dateTo: dateDraftTo }));
    setDateFilterOpen(false);
  }

  function clearDateFilterInPopover() {
    setDateDraftFrom("");
    setDateDraftTo("");
    setColumnFilters((f) => ({ ...f, dateFrom: "", dateTo: "" }));
    setDateFilterOpen(false);
    if (
      searchParams.get("dateRange") ||
      searchParams.get("dateFrom") ||
      searchParams.get("dateTo")
    ) {
      router.replace("/vouchers");
    }
  }

  useEffect(() => {
    const preset = searchParams.get("dateRange");
    const qDf = searchParams.get("dateFrom") || "";
    const qDt = searchParams.get("dateTo") || "";
    let dateFrom = "";
    let dateTo = "";
    if (preset === "yesterday" || preset === "month") {
      const r = purchaseDateRangeForPreset(preset);
      dateFrom = r.dateFrom;
      dateTo = r.dateTo;
    } else if (qDf || qDt) {
      dateFrom = qDf;
      dateTo = qDt;
    }
    if (!dateFrom && !dateTo) return;
    setColumnFilters((f) => ({ ...f, dateFrom, dateTo }));
    setDateDraftFrom(dateFrom);
    setDateDraftTo(dateTo);
  }, [searchParams]);

  useLayoutEffect(() => {
    if (!dateFilterOpen || typeof window === "undefined") return;
    function updatePos() {
      const el = dateFilterTriggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = Math.min(300, Math.max(260, window.innerWidth - 24));
      let left = rect.left + rect.width / 2 - width / 2;
      const margin = 10;
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      let top = rect.bottom + 8;
      const estHeight = 220;
      if (top + estHeight > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - estHeight - 8);
      }
      setDatePopoverStyle({ top, left, width });
    }
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [dateFilterOpen]);

  useEffect(() => {
    if (!dateFilterOpen) return undefined;
    function onKey(e) {
      if (e.key === "Escape") setDateFilterOpen(false);
    }
    function onPointerDown(e) {
      const t = e.target;
      if (dateFilterTriggerRef.current?.contains(t)) return;
      if (dateFilterPanelRef.current?.contains(t)) return;
      setDateFilterOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [dateFilterOpen]);

  useEffect(() => {
    if (!dateFilterOpen) return undefined;
    const t = window.setTimeout(() => {
      const first = dateFilterPanelRef.current?.querySelector('input[type="date"]');
      first?.focus?.();
    }, 0);
    return () => window.clearTimeout(t);
  }, [dateFilterOpen]);

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
      if (!canViewModule(p, "vouchers", pk)) {
        router.replace("/dashboard");
        return;
      }
      setCanCreateVoucher(admin || all || canCreateInModule(p, "vouchers", pk));
      setCanEditVoucher(admin || all || canEditInModule(p, "vouchers", pk));
      setCanBulkUpload(admin || all || Boolean(p?.vouchers?.bulkUpload));
      setCanBulkDelete(admin || all || Boolean(p?.vouchers?.bulkDelete));
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

  const filteredVouchers = useMemo(() => {
    const inc = (hay, needle) => {
      const n = (needle || "").trim().toLowerCase();
      if (!n) return true;
      return String(hay ?? "")
        .toLowerCase()
        .includes(n);
    };
    const purchaseDateKey = (d) => {
      const x = new Date(d);
      if (Number.isNaN(x.getTime())) return "";
      const y = x.getFullYear();
      const m = String(x.getMonth() + 1).padStart(2, "0");
      const day = String(x.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    return vouchers.filter((voucher) => {
      const vid = voucher.vendorId?._id ?? voucher.vendorId;
      const vendor = vendors.find((v) => String(v._id) === String(vid));
      const vendorName = vendor?.name || "";
      const pKey = purchaseDateKey(voucher.dateOfPurchase);
      if ((columnFilters.dateFrom || columnFilters.dateTo) && !pKey) return false;
      if (columnFilters.dateFrom && pKey < columnFilters.dateFrom) return false;
      if (columnFilters.dateTo && pKey > columnFilters.dateTo) return false;
      if (!inc(voucher.voucherNumber || "", columnFilters.voucherNo)) return false;
      if (!inc(vendorName, columnFilters.vendor)) return false;
      if (!inc(voucherMaterialNamesForFilter(voucher, materials), columnFilters.material)) return false;
      if (!inc(Number(voucher.paidAmount ?? voucher.finalAmount ?? 0).toFixed(2), columnFilters.paidAmt)) return false;
      if (!inc(voucher.paymentMadeBy || "", columnFilters.madeFrom)) return false;
      const hasDocs = (voucher.attachments?.length || 0) > 0;
      if (columnFilters.docs === "yes" && !hasDocs) return false;
      if (columnFilters.docs === "no" && hasDocs) return false;
      if (columnFilters.status && voucher.paymentStatus !== columnFilters.status) return false;
      if (!inc(voucher.createdByName || "", columnFilters.createdBy)) return false;
      if (!inc(voucher.paidByMode || "", columnFilters.paidByMode)) return false;
      return true;
    });
  }, [vouchers, vendors, materials, columnFilters]);

  const vendorColumnFilterActive = Boolean((columnFilters.vendor || "").trim());
  const paymentMadeFromFilterActive = Boolean((columnFilters.madeFrom || "").trim());

  const filteredListTotals = useMemo(() => {
    const excludeVelocityFromTotals =
      !vendorColumnFilterActive && !paymentMadeFromFilterActive;
    let voucherSum = 0;
    let paidSum = 0;
    for (const v of filteredVouchers) {
      if (excludeVelocityFromTotals && isPaymentMadeFromVelocity(v)) continue;
      voucherSum += Number(v.finalAmount) || 0;
      paidSum += Number(v.paidAmount ?? v.finalAmount ?? 0) || 0;
    }
    return { voucherSum, paidSum };
  }, [filteredVouchers, vendorColumnFilterActive, paymentMadeFromFilterActive]);

  const velocityRowsInFilteredList = useMemo(
    () => filteredVouchers.filter((v) => isPaymentMadeFromVelocity(v)),
    [filteredVouchers]
  );

  const filteredIdsKey = useMemo(
    () => filteredVouchers.map((v) => String(v._id)).join(","),
    [filteredVouchers]
  );

  useEffect(() => {
    const allowed = new Set(filteredIdsKey.split(",").filter(Boolean));
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
  }, [filteredIdsKey]);

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el || !canBulkDelete) return;
    const ids = filteredIdsKey.split(",").filter(Boolean);
    const n = ids.length;
    const sel = ids.filter((id) => selectedIds.has(id)).length;
    el.indeterminate = n > 0 && sel > 0 && sel < n;
    el.checked = n > 0 && sel === n;
  }, [canBulkDelete, selectedIds, filteredIdsKey]);

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

  function toggleSelectAll() {
    const ids = filteredVouchers.map((v) => String(v._id));
    if (!ids.length) return;
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }

  function toggleSelectOne(id) {
    const sid = String(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }

  async function bulkDeleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length || !canBulkDelete) return;
    const ok = await confirm({
      title: "Delete selected vouchers?",
      message:
        ids.length === 1
          ? "Permanently delete this voucher? Line items and attachments will be removed."
          : `Permanently delete ${ids.length} vouchers? Line items and attachments will be removed.`
    });
    if (!ok) return;
    setError("");
    try {
      await apiFetch("/vouchers/bulk-delete", {
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
        const payDate = voucher.paymentDate
          ? new Date(voucher.paymentDate).toLocaleDateString()
          : "";
        const statusUpdatedAt = voucher.statusUpdatedAt
          ? new Date(voucher.statusUpdatedAt).toLocaleString()
          : "";
        const attNames = (voucher.attachments || [])
          .map((a) => a.originalName || a.storedName || "")
          .filter(Boolean)
          .join("; ");
        const base = {
          Date: new Date(voucher.dateOfPurchase).toLocaleDateString(),
          "Voucher no.": voucher.voucherNumber || "",
          Vendor: vendor?.name || "Unknown",
          "Materials (all lines)": voucherMaterialsCellLabel(voucher, materials),
          "Sub total": Number(voucher.subTotal ?? 0),
          "Tax %": Number(voucher.taxPercent ?? 0),
          "Tax amount": Number(voucher.taxAmount ?? 0),
          "Discount type": voucher.discountType || "none",
          "Discount value": Number(voucher.discountValue ?? 0),
          "Voucher amount": Number(voucher.finalAmount),
          "Paid amount": Number(voucher.paidAmount ?? voucher.finalAmount ?? 0),
          "Payment method": voucher.paymentMethod || "",
          "Payment status": voucher.paymentStatus,
          "Payment date": payDate,
          "Payment made from": voucher.paymentMadeBy || "",
          "Paid by mode": voucher.paidByMode || "",
          "Payment comments": voucher.paymentComments || "",
          "Created By": voucher.createdByName || "-",
          "Status Updated By": voucher.statusUpdatedByName || "-",
          "Status Updated At": statusUpdatedAt || "-",
          "Attachment count": voucher.attachments?.length || 0,
          "Attachment names": attNames
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
            {canCreateVoucher ? (
              <button className="btn" type="button" onClick={openCreateVoucherModal}>
                Create voucher
              </button>
            ) : null}
            <ClearFiltersIconButton
              onClick={() => {
                setColumnFilters({ ...defaultColumnFilters });
                router.replace("/vouchers");
              }}
              title="Clear all column filters"
            />
            {canBulkDelete ? (
              <DeleteIconButton
                disabled={!selectedIds.size}
                onClick={() => void bulkDeleteSelected()}
                title={
                  selectedIds.size
                    ? `Delete ${selectedIds.size} selected voucher${selectedIds.size === 1 ? "" : "s"}`
                    : "Select vouchers to delete"
                }
                aria-label={
                  selectedIds.size
                    ? `Delete ${selectedIds.size} selected voucher${selectedIds.size === 1 ? "" : "s"}`
                    : "Delete selected (choose vouchers first)"
                }
              />
            ) : null}
            <VoucherBulkImport
              vendors={vendors}
              materials={materials}
              onImported={load}
              setError={setError}
              canBulkUpload={canBulkUpload}
            />
            <ExcelDownloadIconButton
              disabled={!filteredVouchers.length}
              onClick={() => void downloadVouchersExcel()}
            />
          </div>
        </div>
        <div className="voucher-table-totals" aria-live="polite">
          <span>
            Total voucher amount: <strong>{formatIndianRupee(filteredListTotals.voucherSum)}</strong>
          </span>
          <span>
            Total paid: <strong>{formatIndianRupee(filteredListTotals.paidSum)}</strong>
          </span>
          <span className="voucher-table-totals__count">
            {filteredVouchers.length} voucher{filteredVouchers.length === 1 ? "" : "s"}
            {vouchers.length !== filteredVouchers.length ? ` (of ${vouchers.length})` : ""}
          </span>
          {!vendorColumnFilterActive &&
          !paymentMadeFromFilterActive &&
          velocityRowsInFilteredList.length > 0 ? (
            <span className="text-muted" style={{ display: "block", fontSize: 12, marginTop: 6, width: "100%" }}>
              Totals exclude {velocityRowsInFilteredList.length} voucher
              {velocityRowsInFilteredList.length === 1 ? "" : "s"} with <strong>Payment made from: Velocity</strong>. Use the{" "}
              <strong>Vendor</strong> or <strong>Payment made from</strong> column filters to include those amounts in the
              totals above.
            </span>
          ) : null}
        </div>
        <div className="table-wrap">
          <table className="table table--voucher-filters">
          <thead>
            <tr>
              {canBulkDelete ? (
                <th className="col-select" scope="col">
                  <input
                    ref={selectAllCheckboxRef}
                    type="checkbox"
                    onChange={toggleSelectAll}
                    aria-label="Select all visible vouchers"
                  />
                </th>
              ) : null}
              <th>Date</th>
              <th>Voucher no.</th>
              <th>Vendor</th>
              <th>Material</th>
              <th>Paid amount</th>
              <th>Payment made from</th>
              <th>Paid by mode</th>
              <th>Documents</th>
              <th>Status</th>
              <th>Created By</th>
              <th className="col-actions">Actions</th>
            </tr>
            <tr className="table-filter-row">
              {canBulkDelete ? <th className="col-select" aria-hidden /> : null}
              <th className="th-date-filter-cell">
                <div className="th-date-filter-cell__inner">
                  <button
                    ref={dateFilterTriggerRef}
                    type="button"
                    className={`btn btn-secondary btn-icon btn-icon--table-date-filter${dateFilterActive ? " is-active" : ""}`}
                    aria-expanded={dateFilterOpen}
                    aria-haspopup="dialog"
                    aria-controls={dateFilterOpen ? "voucher-date-filter-popover" : undefined}
                    aria-label="Filter by purchase date range"
                    title="Filter by purchase date range"
                    onClick={() => (dateFilterOpen ? setDateFilterOpen(false) : openDateFilterPopover())}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
                      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                      <circle cx="17" cy="8" r="3.5" fill="var(--surface-elevated)" stroke="currentColor" strokeWidth="1.25" />
                      <path d="M16 8h2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
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
                  value={columnFilters.material}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, material: e.target.value }))}
                  aria-label="Filter by material"
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
                <input
                  className="input table-filter-input"
                  type="text"
                  placeholder="Filter…"
                  value={columnFilters.paidByMode}
                  onChange={(e) => setColumnFilters((f) => ({ ...f, paidByMode: e.target.value }))}
                  aria-label="Filter by paid by mode"
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
              <th className="col-actions" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {filteredVouchers.map((voucher) => {
              const vid = voucher.vendorId?._id ?? voucher.vendorId;
              const vendor = vendors.find((v) => String(v._id) === String(vid));
              const hoverTitle = voucherRowHoverTitle(voucher, materials);
              const matLabel = voucherMaterialsCellLabel(voucher, materials);
              return (
                <tr
                  key={voucher._id}
                  title={hoverTitle || undefined}
                  className={hoverTitle ? "table-row--has-hover-title" : undefined}
                >
                  {canBulkDelete ? (
                    <td className="col-select">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(String(voucher._id))}
                        onChange={() => toggleSelectOne(voucher._id)}
                        aria-label={`Select voucher ${(voucher.voucherNumber || "").trim() || String(voucher._id)}`}
                      />
                    </td>
                  ) : null}
                  <td className="td-date">{new Date(voucher.dateOfPurchase).toLocaleDateString()}</td>
                  <td>{voucher.voucherNumber || "-"}</td>
                  <td>{vendor?.name || "Unknown"}</td>
                  <td className="td-voucher-materials" title={matLabel !== "—" ? matLabel : undefined}>
                    {matLabel}
                  </td>
                  <td>{formatIndianRupee(voucher.paidAmount ?? voucher.finalAmount ?? 0)}</td>
                  <td>{voucher.paymentMadeBy?.trim() ? voucher.paymentMadeBy : "—"}</td>
                  <td>{voucher.paidByMode?.trim() ? voucher.paidByMode : "—"}</td>
                  <td>
                    <AttachmentListCell entity={voucher} kind="voucher" />
                  </td>
                  <td>
                    <span className={paymentStatusClass(voucher.paymentStatus)}>{voucher.paymentStatus}</span>
                  </td>
                  <td>{voucher.createdByName || "-"}</td>
                  <td className="col-actions">
                    <div className="row-actions">
                      {canEditVoucher ? <EditIconButton onClick={() => startEdit(voucher)} /> : null}
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
                    <IndianAmountField
                      className="input"
                      value={item.quantity}
                      onChange={(n) => updateItem(index, "quantity", n == null ? 0 : n)}
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
                  <IndianAmountField
                    className="input"
                    value={item.pricePerUnit}
                    onChange={(n) => updateItem(index, "pricePerUnit", n == null ? 0 : n)}
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
              <IndianAmountField
                className="input"
                value={form.taxPercent}
                onChange={(n) => setForm({ ...form, taxPercent: n == null ? 0 : n })}
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
              <IndianAmountField
                className="input"
                value={form.discountValue}
                onChange={(n) => setForm({ ...form, discountValue: n == null ? 0 : n })}
                onMouseDown={numericFieldMouseDown}
                onFocus={numericFieldFocus}
              />
            </div>
            <div>
              <label>Paid amount</label>
              <IndianAmountField
                className="input"
                value={form.paidAmount}
                onChange={(n) => {
                  setPaidAmountManuallySet(true);
                  setForm({ ...form, paidAmount: n == null ? 0 : n });
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
              <strong>Subtotal:</strong> {formatIndianRupee(totals.subTotal)}
            </p>
            <p className="totals-item">
              <strong>Tax:</strong> {formatIndianRupee(totals.taxAmount)}
            </p>
            <p className="totals-item--strong">
              <strong>Final amount:</strong> {formatIndianRupee(totals.finalAmount)}
            </p>
            <p className="totals-item">
              <strong>Paid amount:</strong> {formatIndianRupee(form.paidAmount || 0)}
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

      {dateFilterOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              id="voucher-date-filter-popover"
              ref={dateFilterPanelRef}
              className="date-filter-popover"
              role="dialog"
              aria-modal="true"
              aria-labelledby="date-filter-popover-title"
              style={{
                position: "fixed",
                top: datePopoverStyle.top,
                left: datePopoverStyle.left,
                width: datePopoverStyle.width,
                zIndex: 12600
              }}
            >
              <h4 id="date-filter-popover-title" className="date-filter-popover__title">
                Purchase date range
              </h4>
              <p className="date-filter-popover__hint">Leave a field empty for no bound on that side.</p>
              <div className="date-filter-popover__fields">
                <label className="date-filter-popover__field">
                  <span className="date-filter-popover__label">From</span>
                  <input
                    className="input"
                    type="date"
                    value={dateDraftFrom}
                    onChange={(e) => setDateDraftFrom(e.target.value)}
                  />
                </label>
                <label className="date-filter-popover__field">
                  <span className="date-filter-popover__label">To</span>
                  <input
                    className="input"
                    type="date"
                    value={dateDraftTo}
                    onChange={(e) => setDateDraftTo(e.target.value)}
                  />
                </label>
              </div>
              <div className="date-filter-popover__actions">
                <button type="button" className="btn btn-secondary" onClick={() => setDateFilterOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="btn" onClick={applyDateFilter}>
                  Apply
                </button>
              </div>
              <button type="button" className="date-filter-popover__clear link-btn" onClick={clearDateFilterInPopover}>
                Clear date range
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export default function VouchersPage() {
  return (
    <Suspense
      fallback={
        <div className="page-stack">
          <PageHeader
            eyebrow="Purchasing"
            title="Expense vouchers"
            description="Line items, tax, discounts, and payment details with automatic totals. Attach invoices or receipts as needed."
          />
        </div>
      }
    >
      <VouchersPageContent />
    </Suspense>
  );
}
