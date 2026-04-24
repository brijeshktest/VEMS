"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, API_URL, getActiveCompanyId, setActiveCompanyId, setToken } from "../lib/api.js";
import { setWorkMode } from "../lib/workMode.js";
import {
  PLANT_BUNDLE_ORDER,
  PLANT_BUNDLE_LABELS,
  selectedBundlesFromModuleKeys
} from "../lib/plantModuleBundles.js";
import PageHeader from "./PageHeader.js";
import {
  DeleteIconButton,
  EditIconButton,
  ImpersonateIconButton,
  LoginDefaultClearIconButton,
  LoginDefaultSetIconButton,
  PlantActivateIconButton,
  PlantDeactivateIconButton
} from "./EditDeleteIconButtons.js";

const DEFAULT_SUBTITLE =
  "You operate the software for multiple mushroom plants. Each plant is isolated (data, roles, logos, and operations). Select a plant to work as that site, or add a new plant from here.";

const BUNDLE_CHIP_TITLE = {
  expense: "Expense",
  room: "Rooms",
  tunnel: "Tunnel",
  plant: "Plant operations",
  sales: "Sales",
  contributions: "Partners",
  administration: "Admin"
};

const FORM_ONBOARD_STEP1 = "vems-onboard-step1";
const FORM_ONBOARD_STEP2 = "vems-onboard-step2";
const FORM_EDIT_STEP1 = "vems-edit-plant-step1";
const FORM_EDIT_STEP2 = "vems-edit-plant-step2";

function IconSuperSites({ className = "" }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 21h18" />
      <path d="M6 21V8h4v13M14 21V5h4v16" />
      <path d="M6 8L4 5h4l-2 3M14 5l-2 3h4l-2-3" />
    </svg>
  );
}

function IconSuperPeople({ className = "" }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconSuperRooms({ className = "" }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function IconSuperPlus({ className = "" }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function ModuleBundlePicker({ bundleSet, onToggle }) {
  return (
    <div className="module-bundle-picker" role="group" aria-label="Licensed module bundles">
      {PLANT_BUNDLE_ORDER.map((bid) => {
        const on = bundleSet.has(bid);
        return (
          <button
            key={bid}
            type="button"
            className={"module-bundle-chip " + (on ? "module-bundle-chip--on" : "")}
            aria-pressed={on}
            onClick={() => onToggle(bid)}
          >
            <span className="module-bundle-chip__title">{BUNDLE_CHIP_TITLE[bid] || bid}</span>
            <span className="module-bundle-chip__sub">{PLANT_BUNDLE_LABELS[bid]}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Super Admin: plant network dashlet, active plants, add-plant stepper modal, impersonation.
 * @param {{ hidePageHeader?: boolean, pageTitle?: string, pageSubtitle?: string }} props
 */
export default function PlantNetworkHub({
  hidePageHeader = false,
  pageTitle = "Plant network",
  pageSubtitle = DEFAULT_SUBTITLE
}) {
  const router = useRouter();
  const uid = useId();
  const coNameId = `${uid}-co-name`;
  const adminEmailId = `${uid}-admin-email`;
  const editCoNameId = `${uid}-edit-co-name`;
  const editAdminEmailStep1Id = `${uid}-edit-admin-email-step1`;

  const [plants, setPlants] = useState([]);
  const [totalPlants, setTotalPlants] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardStep, setOnboardStep] = useState(1);
  const [onboardBusy, setOnboardBusy] = useState(false);
  const [name, setName] = useState("");
  const [moduleBundles, setModuleBundles] = useState(() => new Set(PLANT_BUNDLE_ORDER));
  const [adminForm, setAdminForm] = useState({ name: "", email: "", password: "" });

  const [editPlant, setEditPlant] = useState(null);
  const [editStep, setEditStep] = useState(1);
  const [editBusy, setEditBusy] = useState(false);
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editBundles, setEditBundles] = useState(() => new Set(PLANT_BUNDLE_ORDER));
  const [editAdminForm, setEditAdminForm] = useState({ name: "", email: "", password: "" });

  const [impersonatePlant, setImpersonatePlant] = useState(null);
  const [impersonateCandidates, setImpersonateCandidates] = useState([]);
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [impersonateUserId, setImpersonateUserId] = useState("");
  const [impersonateBusy, setImpersonateBusy] = useState(false);
  const [platformDefaultPlantId, setPlatformDefaultPlantId] = useState(null);
  const [defaultPlantBusy, setDefaultPlantBusy] = useState(false);

  const hubStats = useMemo(() => {
    if (loading) return null;
    let users = 0;
    let rooms = 0;
    for (const p of plants) {
      users += Number(p.activity?.usersCount ?? 0);
      rooms += Number(p.activity?.roomResources ?? 0);
    }
    return { users, rooms };
  }, [plants, loading]);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/companies/plant-activity");
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.plants)
          ? data.plants
          : [];
      const total = typeof data?.totalPlants === "number" ? data.totalPlants : list.length;
      setPlants(list);
      setTotalPlants(total);
      const def =
        data?.defaultPlantCompanyId != null && String(data.defaultPlantCompanyId).trim() !== ""
          ? String(data.defaultPlantCompanyId)
          : null;
      setPlatformDefaultPlantId(def);
    } catch (e) {
      setError(e.message || "Failed to load plant network");
      setPlants([]);
      setTotalPlants(0);
      setPlatformDefaultPlantId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  async function persistPlatformDefaultPlant(companyIdOrNull) {
    setDefaultPlantBusy(true);
    setError("");
    try {
      const body =
        companyIdOrNull == null || companyIdOrNull === ""
          ? { companyId: null }
          : { companyId: String(companyIdOrNull) };
      await apiFetch("/settings/platform/default-plant", {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      if (companyIdOrNull != null && companyIdOrNull !== "") {
        setActiveCompanyId(String(companyIdOrNull));
        setMessage("This plant is now the default at sign-in. Your session is scoped to it—open Dashboard after choosing a work area.");
      } else {
        setActiveCompanyId(null);
        setMessage("Default login plant cleared. Sign in again to use the platform hub until you set another default.");
      }
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("vems-user-updated"));
        window.dispatchEvent(new Event("vems-branding-updated"));
      }
    } catch (e) {
      setError(e.message || "Could not update default plant");
    } finally {
      setDefaultPlantBusy(false);
    }
  }

  function toggleModuleBundle(setter, bundleId) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(bundleId)) next.delete(bundleId);
      else next.add(bundleId);
      return next;
    });
  }

  function openOnboardModal() {
    setError("");
    setMessage("");
    setOnboardStep(1);
    setName("");
    setModuleBundles(new Set(PLANT_BUNDLE_ORDER));
    setAdminForm({ name: "", email: "", password: "" });
    setOnboardOpen(true);
  }

  function closeOnboardModal() {
    setOnboardOpen(false);
    setOnboardStep(1);
    setOnboardBusy(false);
  }

  function submitOnboardStep1Continue(e) {
    e.preventDefault();
    setError("");
    const bundles = PLANT_BUNDLE_ORDER.filter((b) => moduleBundles.has(b));
    if (bundles.length === 0) {
      setError("Choose at least one module bundle for this plant.");
      return;
    }
    const nm = name.trim();
    if (!nm) {
      setError("Plant name is required.");
      return;
    }
    const em = adminForm.email.trim();
    if (!em) {
      setError("Administrator email is required before continuing.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError("Enter a valid administrator email address.");
      return;
    }
    setOnboardStep(2);
    setAdminForm((f) => ({ ...f, name: f.name?.trim() ? f.name : "", password: "" }));
  }

  async function submitOnboardCreatePlant(e) {
    e.preventDefault();
    setError("");
    const bundles = PLANT_BUNDLE_ORDER.filter((b) => moduleBundles.has(b));
    const nm = name.trim();
    const em = adminForm.email.trim();
    const adminName = adminForm.name.trim();
    const pwd = adminForm.password;
    if (!nm || bundles.length === 0 || !em || !adminName) {
      setError("Plant name, modules, administrator email, and administrator name are required.");
      return;
    }
    if (pwd.length < 8) {
      setError("Administrator password must be at least 8 characters.");
      return;
    }
    setOnboardBusy(true);
    try {
      await apiFetch("/companies", {
        method: "POST",
        body: JSON.stringify({
          name: nm,
          moduleBundles: bundles,
          admin: {
            name: adminName,
            email: em,
            password: pwd
          }
        })
      });
      setMessage("Plant created with its first administrator.");
      closeOnboardModal();
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("vems-user-updated"));
      }
    } catch (err) {
      setError(err.message || "Could not create plant");
    } finally {
      setOnboardBusy(false);
    }
  }

  async function setPlantActive(plantId, nextActive) {
    setError("");
    try {
      await apiFetch(`/companies/${plantId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: nextActive })
      });
      setMessage(nextActive ? "Plant reactivated. Users can sign in again." : "Plant deactivated. Users at this site cannot sign in until you reactivate.");
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("vems-user-updated"));
      }
    } catch (err) {
      setError(err.message || "Could not update plant status");
    }
  }

  async function deletePlantCompany(plantId, displayName) {
    const ok =
      typeof window !== "undefined" &&
      window.confirm(
        `Permanently delete plant "${displayName}" and ALL of its data? This cannot be undone.`
      );
    if (!ok) return;
    setError("");
    try {
      await apiFetch(`/companies/${plantId}`, { method: "DELETE" });
      if (String(getActiveCompanyId() || "") === String(plantId)) {
        setActiveCompanyId(null);
        setWorkMode("");
      }
      setMessage("Plant and all related data were deleted.");
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("vems-user-updated"));
        window.dispatchEvent(new Event("vems-branding-updated"));
      }
    } catch (err) {
      setError(err.message || "Could not delete plant");
    }
  }

  function openEditPlant(p) {
    setError("");
    setEditStep(1);
    setEditPlant({ id: String(p.id), name: p.name || "", isActive: p.isActive !== false });
    setEditName(String(p.name || ""));
    setEditActive(p.isActive !== false);
    setEditBundles(selectedBundlesFromModuleKeys(p.enabledModules));
    const pa = p.primaryAdmin && typeof p.primaryAdmin === "object" ? p.primaryAdmin : null;
    setEditAdminForm({
      name: pa?.name ? String(pa.name) : "",
      email: pa?.email ? String(pa.email) : "",
      password: ""
    });
  }

  function closeEditPlant() {
    setEditPlant(null);
    setEditStep(1);
    setEditBusy(false);
    setEditAdminForm({ name: "", email: "", password: "" });
  }

  function submitEditStep1Continue(e) {
    e.preventDefault();
    setError("");
    const bundles = PLANT_BUNDLE_ORDER.filter((b) => editBundles.has(b));
    if (bundles.length === 0) {
      setError("Choose at least one module bundle for this plant.");
      return;
    }
    const nm = editName.trim();
    if (!nm) {
      setError("Plant name is required.");
      return;
    }
    const em = editAdminForm.email.trim();
    if (!em) {
      setError("Administrator email is required before continuing.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError("Enter a valid administrator email address.");
      return;
    }
    setEditStep(2);
    setEditAdminForm((f) => ({ ...f, name: f.name?.trim() ? f.name : "", password: "" }));
  }

  async function saveEditPlant(e) {
    e.preventDefault();
    if (!editPlant) return;
    const bundles = PLANT_BUNDLE_ORDER.filter((b) => editBundles.has(b));
    if (bundles.length === 0) {
      setError("Choose at least one module bundle.");
      return;
    }
    const adminName = editAdminForm.name.trim();
    const adminEmail = editAdminForm.email.trim();
    const adminPwd = editAdminForm.password.trim();
    if (!adminEmail) {
      setError("Administrator email is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      setError("Enter a valid administrator email address.");
      return;
    }
    if (!adminName) {
      setError("Administrator name is required.");
      return;
    }
    if (adminPwd.length > 0 && adminPwd.length < 8) {
      setError("Administrator password must be at least 8 characters, or leave blank to keep the current password.");
      return;
    }
    setEditBusy(true);
    setError("");
    try {
      await apiFetch(`/companies/${editPlant.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          isActive: editActive,
          moduleBundles: bundles,
          admin: {
            name: adminName,
            email: adminEmail,
            ...(adminPwd.length > 0 ? { password: adminPwd } : {})
          }
        })
      });
      setMessage("Plant updated.");
      closeEditPlant();
      await load();
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setEditBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!impersonatePlant?.id) {
      setImpersonateCandidates([]);
      setImpersonateUserId("");
      return;
    }
    let cancelled = false;
    (async () => {
      setImpersonateLoading(true);
      setImpersonateUserId("");
      try {
        const rows = await apiFetch(`/auth/impersonation-candidates/${impersonatePlant.id}`);
        if (!cancelled) {
          setImpersonateCandidates(Array.isArray(rows) ? rows : []);
        }
      } catch {
        if (!cancelled) setImpersonateCandidates([]);
      } finally {
        if (!cancelled) setImpersonateLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [impersonatePlant]);

  async function confirmImpersonate(e) {
    e.preventDefault();
    if (!impersonateUserId) {
      setError("Select a user to impersonate.");
      return;
    }
    setImpersonateBusy(true);
    setError("");
    try {
      const data = await apiFetch("/auth/impersonate", {
        method: "POST",
        body: JSON.stringify({ userId: impersonateUserId })
      });
      if (data?.token) setToken(data.token);
      setActiveCompanyId(null);
      setWorkMode("");
      setImpersonatePlant(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("vems-user-updated"));
        window.dispatchEvent(new Event("vems-branding-updated"));
      }
      router.replace("/work-mode");
    } catch (err) {
      setError(err.message || "Impersonation failed");
    } finally {
      setImpersonateBusy(false);
    }
  }

  return (
    <div className="w-full min-w-0 max-w-full">
      {!hidePageHeader ? <PageHeader title={pageTitle} subtitle={pageSubtitle} /> : null}

      {error && !onboardOpen && !editPlant ? (
        <div className="alert alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      {!loading && platformDefaultPlantId ? (
        <div
          className="card card-soft mb-4"
          style={{ padding: "12px 16px", borderLeft: "4px solid var(--brand-green, #16a34a)" }}
          role="status"
        >
          <p className="page-lead" style={{ margin: 0, fontSize: 14 }}>
            <strong>Default login plant:</strong>{" "}
            {plants.find((x) => String(x.id) === platformDefaultPlantId)?.name || "Selected site"}. After sign-in, the
            app scopes to this plant so <strong>Dashboard</strong> shows its data. Clear or change it from that
            plant&apos;s row below.
          </p>
        </div>
      ) : null}

      <section className="saas-section" aria-label="Platform snapshot">
        <div className="dashboard-super-dashlets">
          <div className="card stat-card stat-dashlet">
            <div className="stat-dashlet__icon stat-dashlet__icon--super" aria-hidden>
              <IconSuperSites />
            </div>
            <div className="stat-dashlet__body">
              <span className="stat-label">Plants onboarded</span>
              <span className="stat-value">{loading ? "—" : totalPlants}</span>
              <span className="stat-hint">Isolated tenant workspaces</span>
            </div>
          </div>
          <div className="card stat-card stat-dashlet">
            <div className="stat-dashlet__icon stat-dashlet__icon--super-people" aria-hidden>
              <IconSuperPeople />
            </div>
            <div className="stat-dashlet__body">
              <span className="stat-label">Users</span>
              <span className="stat-value">{hubStats == null ? "—" : hubStats.users}</span>
              <span className="stat-hint">All accounts across plants</span>
            </div>
          </div>
          <div className="card stat-card stat-dashlet">
            <div className="stat-dashlet__icon stat-dashlet__icon--super-muted" aria-hidden>
              <IconSuperRooms />
            </div>
            <div className="stat-dashlet__body">
              <span className="stat-label">Rooms</span>
              <span className="stat-value">{hubStats == null ? "—" : hubStats.rooms}</span>
              <span className="stat-hint">Room-type plant resources</span>
            </div>
          </div>
          <div className="card stat-card stat-dashlet stat-dashlet--super-cta">
            <div className="stat-dashlet__icon stat-dashlet__icon--super" aria-hidden>
              <IconSuperPlus />
            </div>
            <div className="stat-dashlet__body">
              <span className="stat-label">Onboarding</span>
              <span className="stat-hint" style={{ marginTop: 4, color: "var(--muted)" }}>
                Create a workspace with a required first administrator
              </span>
              <button type="button" className="btn" style={{ marginTop: 12 }} onClick={openOnboardModal}>
                Add new plant
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="saas-section" aria-label="Plants">
        <div className="card card-soft" style={{ padding: "20px 22px 22px" }}>
          <header style={{ marginBottom: 18 }}>
            <h2 className="panel-title" style={{ margin: "0 0 6px" }}>
              Plants
            </h2>
            <p className="page-lead" style={{ margin: 0, maxWidth: "52rem" }}>
              Each card is one site. <strong>Deactivate</strong> blocks sign-in for that plant while keeping all data;{" "}
              <strong>Delete</strong> permanently removes the plant and every related record.               Use <strong>edit</strong> for the same two-step flow as Add new plant (plant &amp; modules, then
              administrator), <strong>Impersonate</strong> to pick any user, and <strong>Set login default</strong> for
              where you land after sign-in. With a login default set, click the plant name in the header to open the
              workspace as that plant&apos;s first administrator (no picker).
            </p>
          </header>

          {loading ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Loading plants…
            </p>
          ) : null}
          {!loading && plants.length === 0 ? (
            <div
              className="rounded-xl border border-dashed p-8 text-center"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <p className="page-lead" style={{ margin: "0 0 12px" }}>
                No plants yet
              </p>
              <p className="text-sm" style={{ color: "var(--muted)", marginBottom: 16 }}>
                Onboard your first tenant workspace to appear here.
              </p>
              <button type="button" className="btn" onClick={openOnboardModal}>
                Add new plant
              </button>
            </div>
          ) : null}
          {!loading && plants.length > 0 ? (
            <div className="plant-network-list">
              {plants.map((p) => {
                const a = p.activity || {};
                const active = p.isActive !== false;
                return (
                  <article key={String(p.id)} className="plant-network-card">
                    <div className="plant-network-card__identity">
                      <div className="plant-network-card__logo">
                        {p.hasPlantLogo && p.plantLogoUpdatedAt ? (
                          <img
                            src={`${API_URL}/settings/logo?companyId=${encodeURIComponent(String(p.id))}&t=${p.plantLogoUpdatedAt}`}
                            alt=""
                          />
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>—</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="plant-network-card__name">{p.name}</h3>
                        <div className="plant-network-card__meta">
                          <span className={"status-pill " + (active ? "status-pill--active" : "status-pill--inactive")}>
                            {active ? "Active" : "Inactive"}
                          </span>
                          {platformDefaultPlantId && String(p.id) === platformDefaultPlantId ? (
                            <span
                              className="status-pill status-pill--paid"
                              title="Super Admin signs in scoped to this plant until cleared"
                            >
                              Login default
                            </span>
                          ) : null}
                          {p.slug ? <span className="plant-network-card__slug">{p.slug}</span> : null}
                        </div>
                      </div>
                    </div>
                    <dl className="plant-network-card__metrics">
                      <div className="plant-network-card__metric">
                        <dt>Vouchers</dt>
                        <dd>{a.vouchers ?? "—"}</dd>
                      </div>
                      <div className="plant-network-card__metric">
                        <dt>Rooms</dt>
                        <dd>{a.roomResources ?? "—"}</dd>
                      </div>
                      <div className="plant-network-card__metric">
                        <dt>Tunnel</dt>
                        <dd>{a.tunnelResources ?? "—"}</dd>
                      </div>
                      <div className="plant-network-card__metric">
                        <dt>Bunker</dt>
                        <dd>{a.bunkerResources ?? "—"}</dd>
                      </div>
                      <div className="plant-network-card__metric">
                        <dt>Cycles</dt>
                        <dd>{a.activeGrowingCycles ?? "—"}</dd>
                      </div>
                      <div className="plant-network-card__metric">
                        <dt>Sales</dt>
                        <dd>{a.sales ?? "—"}</dd>
                      </div>
                      <div className="plant-network-card__metric">
                        <dt>Users</dt>
                        <dd>{a.usersCount ?? "—"}</dd>
                      </div>
                    </dl>
                    <div className="plant-network-card__toolbar plant-network-card__toolbar--icons">
                      <EditIconButton
                        onClick={() => openEditPlant(p)}
                        title="Edit plant name, modules, administrator, and active status"
                        aria-label={`Edit ${p.name || "plant"}`}
                      />
                      {active ? (
                        <ImpersonateIconButton
                          onClick={() => setImpersonatePlant({ id: String(p.id), name: p.name })}
                          title="Impersonate — choose a user at this plant (session stays in this tenant only)"
                          aria-label={`Impersonate user at ${p.name || "plant"}`}
                        />
                      ) : null}
                      {active ? (
                        <PlantDeactivateIconButton
                          onClick={() => void setPlantActive(p.id, false)}
                          title="Deactivate — blocks sign-in for this plant; all data is kept"
                          aria-label={`Deactivate ${p.name || "plant"}`}
                        />
                      ) : (
                        <PlantActivateIconButton
                          onClick={() => void setPlantActive(p.id, true)}
                          title="Activate — allow sign-in again for this plant"
                          aria-label={`Activate ${p.name || "plant"}`}
                        />
                      )}
                      <DeleteIconButton
                        onClick={() => void deletePlantCompany(p.id, p.name || "plant")}
                        title="Delete — permanently remove this plant and every related record"
                        aria-label={`Delete ${p.name || "plant"}`}
                      />
                      {platformDefaultPlantId === String(p.id) ? (
                        <LoginDefaultClearIconButton
                          disabled={defaultPlantBusy}
                          onClick={() => void persistPlatformDefaultPlant(null)}
                          title="Clear login default — after sign-in, open the plant hub until you set another default"
                          aria-label={`Clear login default for ${p.name || "plant"}`}
                        />
                      ) : active ? (
                        <LoginDefaultSetIconButton
                          disabled={defaultPlantBusy}
                          onClick={() => void persistPlatformDefaultPlant(p.id)}
                          title="Set login default — after sign-in, land in this plant (header pill opens as its admin)"
                          aria-label={`Set login default to ${p.name || "plant"}`}
                        />
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      <p className="page-lead" style={{ marginTop: 20, maxWidth: "48rem" }}>
        Hover toolbar icons on each plant for a short description. Open the{" "}
        <Link href="/admin" className="font-semibold" style={{ color: "var(--primary)" }}>
          Admin console
        </Link>{" "}
        or use{" "}
        <Link href="/work-mode" className="font-semibold" style={{ color: "var(--primary)" }}>
          Switch area
        </Link>{" "}
        from the header after choosing a work area. Provider branding is under{" "}
        <Link href="/admin/platform" className="font-semibold" style={{ color: "var(--primary)" }}>
          Setting
        </Link>{" "}
        in your account menu.
      </p>

      {onboardOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
          style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboard-dialog-title"
          onClick={() => !onboardBusy && closeOnboardModal()}
        >
          <div className="super-onboard-modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="super-onboard-modal__head">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <p className="stat-label" style={{ marginBottom: 4 }}>
                    Super Admin
                  </p>
                  <h2 id="onboard-dialog-title" className="panel-title" style={{ margin: 0 }}>
                    {onboardStep === 1 ? "Add new plant" : "Create plant administrator"}
                  </h2>
                  <p className="page-lead" style={{ margin: "8px 0 0", fontSize: 14 }}>
                    {onboardStep === 1
                      ? "Step 1 of 2 — tenant details, administrator email, and licensed modules."
                      : "Step 2 of 2 — first administrator name and password (required to finish)."}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-tiny shrink-0"
                  disabled={onboardBusy}
                  onClick={closeOnboardModal}
                  aria-label="Close"
                >
                  Close
                </button>
              </div>
              <div className="super-onboard-steps" aria-hidden={false}>
                <div
                  className={
                    "super-onboard-step " +
                    (onboardStep === 1 ? "super-onboard-step--current " : "") +
                    (onboardStep > 1 ? "super-onboard-step--done" : "")
                  }
                >
                  <span className="super-onboard-step__num">1</span>
                  <span>Plant &amp; modules</span>
                </div>
                <span className="super-onboard-step-join" aria-hidden />
                <div className={"super-onboard-step " + (onboardStep === 2 ? "super-onboard-step--current" : "")}>
                  <span className="super-onboard-step__num">2</span>
                  <span>Administrator</span>
                </div>
              </div>
            </div>

            {error ? (
              <div className="px-5 pt-3">
                <div className="alert alert-error" role="alert">
                  {error}
                </div>
              </div>
            ) : null}

            {onboardStep === 1 ? (
              <>
                <div className="super-onboard-modal__body">
                  <form id={FORM_ONBOARD_STEP1} onSubmit={submitOnboardStep1Continue} className="grid gap-8 lg:grid-cols-2 lg:gap-10">
                    <div className="min-w-0 space-y-4">
                      <p className="text-sm" style={{ color: "var(--muted)" }}>
                        Each plant has its own data, users, and branding. A URL slug is generated automatically from the
                        plant name. The first plant admin&apos;s email is required before you continue.
                      </p>
                      <div>
                        <label className="block" htmlFor={coNameId}>
                          Plant name
                        </label>
                        <input
                          id={coNameId}
                          className="input w-full"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          placeholder="e.g. North growing facility"
                        />
                      </div>
                      <div>
                        <label className="block" htmlFor={adminEmailId}>
                          Administrator email <span className="text-red-600">*</span>
                        </label>
                        <input
                          id={adminEmailId}
                          className="input w-full"
                          type="email"
                          autoComplete="email"
                          value={adminForm.email}
                          onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))}
                          required
                          placeholder="admin@example.com"
                        />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <label className="mb-2 block text-sm font-semibold" style={{ color: "var(--ink)" }}>
                        Licensed modules
                      </label>
                      <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
                        Tap to toggle. Only enabled bundles appear in that plant’s app and APIs.
                      </p>
                      <ModuleBundlePicker
                        bundleSet={moduleBundles}
                        onToggle={(bid) => toggleModuleBundle(setModuleBundles, bid)}
                      />
                    </div>
                  </form>
                </div>
                <div className="super-onboard-modal__foot">
                  <button type="button" className="btn btn-secondary" disabled={onboardBusy} onClick={closeOnboardModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn" form={FORM_ONBOARD_STEP1} disabled={onboardBusy}>
                    Continue to administrator
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="super-onboard-modal__body">
                  <form id={FORM_ONBOARD_STEP2} onSubmit={submitOnboardCreatePlant} className="mx-auto max-w-md space-y-4">
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      This user becomes <strong>admin</strong> for{" "}
                      <strong>{name.trim() || "the new plant"}</strong> only. They can add roles and operators later.
                    </p>
                    <div>
                      <label className="block">Administrator email</label>
                      <input className="input w-full" type="email" value={adminForm.email} readOnly tabIndex={-1} />
                    </div>
                    <div>
                      <label className="block">Administrator name</label>
                      <input
                        className="input w-full"
                        value={adminForm.name}
                        onChange={(e) => setAdminForm((f) => ({ ...f, name: e.target.value }))}
                        required
                        autoComplete="name"
                      />
                    </div>
                    <div>
                      <label className="block">Password</label>
                      <input
                        className="input w-full"
                        type="password"
                        autoComplete="new-password"
                        value={adminForm.password}
                        onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))}
                        required
                        minLength={8}
                      />
                    </div>
                  </form>
                </div>
                <div className="super-onboard-modal__foot">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={onboardBusy}
                    onClick={() => {
                      setOnboardStep(1);
                      setError("");
                    }}
                  >
                    Back
                  </button>
                  <button type="submit" className="btn" form={FORM_ONBOARD_STEP2} disabled={onboardBusy}>
                    {onboardBusy ? "Creating…" : "Create plant"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {editPlant ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
          style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-plant-title"
          onClick={() => !editBusy && closeEditPlant()}
        >
          <div className="super-onboard-modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="super-onboard-modal__head">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <p className="stat-label" style={{ marginBottom: 4 }}>
                    Super Admin
                  </p>
                  <h2 id="edit-plant-title" className="panel-title" style={{ margin: 0 }}>
                    {editStep === 1 ? "Edit plant" : "Plant administrator"}
                  </h2>
                  <p className="page-lead" style={{ margin: "8px 0 0", fontSize: 14 }}>
                    {editStep === 1
                      ? "Step 1 of 2 — tenant details, administrator email, active status, and licensed modules (same flow as Add new plant)."
                      : "Step 2 of 2 — first administrator name and password. Leave password blank to keep the current one."}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-tiny shrink-0"
                  disabled={editBusy}
                  onClick={closeEditPlant}
                  aria-label="Close"
                >
                  Close
                </button>
              </div>
              <div className="super-onboard-steps" aria-hidden={false}>
                <div
                  className={
                    "super-onboard-step " +
                    (editStep === 1 ? "super-onboard-step--current " : "") +
                    (editStep > 1 ? "super-onboard-step--done" : "")
                  }
                >
                  <span className="super-onboard-step__num">1</span>
                  <span>Plant &amp; modules</span>
                </div>
                <span className="super-onboard-step-join" aria-hidden />
                <div className={"super-onboard-step " + (editStep === 2 ? "super-onboard-step--current" : "")}>
                  <span className="super-onboard-step__num">2</span>
                  <span>Administrator</span>
                </div>
              </div>
            </div>
            {error ? (
              <div className="px-5 pt-3">
                <div className="alert alert-error" role="alert">
                  {error}
                </div>
              </div>
            ) : null}

            {editStep === 1 ? (
              <>
                <div className="super-onboard-modal__body">
                  <form id={FORM_EDIT_STEP1} onSubmit={submitEditStep1Continue} className="grid gap-8 lg:grid-cols-2 lg:gap-10">
                    <div className="min-w-0 space-y-4">
                      <p className="text-sm" style={{ color: "var(--muted)" }}>
                        Each plant has its own data, users, and branding. The URL slug is set automatically from the plant
                        name when you save. The first plant admin&apos;s email is required before you continue.
                      </p>
                      <div>
                        <label className="block" htmlFor={editCoNameId}>
                          Plant name
                        </label>
                        <input
                          id={editCoNameId}
                          className="input w-full"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          required
                          placeholder="e.g. North growing facility"
                        />
                      </div>
                      <div>
                        <label className="block" htmlFor={editAdminEmailStep1Id}>
                          Administrator email <span className="text-red-600">*</span>
                        </label>
                        <input
                          id={editAdminEmailStep1Id}
                          className="input w-full"
                          type="email"
                          autoComplete="email"
                          value={editAdminForm.email}
                          onChange={(e) => setEditAdminForm((f) => ({ ...f, email: e.target.value }))}
                          required
                          placeholder="admin@example.com"
                        />
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: "var(--ink)" }}>
                        <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                        Plant is active
                      </label>
                    </div>
                    <div className="min-w-0">
                      <label className="mb-2 block text-sm font-semibold" style={{ color: "var(--ink)" }}>
                        Licensed modules
                      </label>
                      <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
                        Tap to toggle. Only enabled bundles appear in that plant&apos;s app and APIs.
                      </p>
                      <ModuleBundlePicker
                        bundleSet={editBundles}
                        onToggle={(bid) => toggleModuleBundle(setEditBundles, bid)}
                      />
                    </div>
                  </form>
                </div>
                <div className="super-onboard-modal__foot">
                  <button type="button" className="btn btn-secondary" disabled={editBusy} onClick={closeEditPlant}>
                    Cancel
                  </button>
                  <button type="submit" className="btn" form={FORM_EDIT_STEP1} disabled={editBusy}>
                    Continue to administrator
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="super-onboard-modal__body">
                  <form id={FORM_EDIT_STEP2} onSubmit={saveEditPlant} className="mx-auto max-w-md space-y-4">
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      The first <strong>admin</strong> for <strong>{editName.trim() || "this plant"}</strong>. They can
                      add roles and operators later.
                    </p>
                    <div>
                      <label className="block">Administrator email</label>
                      <input
                        className="input w-full"
                        type="email"
                        value={editAdminForm.email}
                        readOnly
                        tabIndex={-1}
                      />
                    </div>
                    <div>
                      <label className="block" htmlFor={`${uid}-edit-admin-name`}>
                        Administrator name
                      </label>
                      <input
                        id={`${uid}-edit-admin-name`}
                        className="input w-full"
                        value={editAdminForm.name}
                        onChange={(e) => setEditAdminForm((f) => ({ ...f, name: e.target.value }))}
                        required
                        autoComplete="name"
                      />
                    </div>
                    <div>
                      <label className="block" htmlFor={`${uid}-edit-admin-password`}>
                        New password
                      </label>
                      <input
                        id={`${uid}-edit-admin-password`}
                        className="input w-full"
                        type="password"
                        autoComplete="new-password"
                        value={editAdminForm.password}
                        onChange={(e) => setEditAdminForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="Leave blank to keep current password"
                        minLength={0}
                      />
                      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                        Optional. Minimum 8 characters when changing.
                      </p>
                    </div>
                  </form>
                </div>
                <div className="super-onboard-modal__foot">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={editBusy}
                    onClick={() => {
                      setEditStep(1);
                      setError("");
                    }}
                  >
                    Back
                  </button>
                  <button type="submit" className="btn" form={FORM_EDIT_STEP2} disabled={editBusy}>
                    {editBusy ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {impersonatePlant ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
          style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="impersonate-dialog-title"
          onClick={() => !impersonateBusy && setImpersonatePlant(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border p-6 shadow-lg"
            style={{ borderColor: "var(--border)", background: "var(--surface-elevated, var(--surface))" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="impersonate-dialog-title" className="panel-title" style={{ margin: "0 0 8px" }}>
              Impersonate user
            </h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Plant: <strong style={{ color: "var(--ink)" }}>{impersonatePlant.name}</strong>. The session uses that
              user&apos;s roles; API access is limited to this plant only.
            </p>
            {impersonateLoading ? (
              <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
                Loading users…
              </p>
            ) : impersonateCandidates.length === 0 ? (
              <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
                No plant users found. Create a plant admin first.
              </p>
            ) : (
              <form onSubmit={confirmImpersonate} className="mt-4 space-y-4">
                <div>
                  <label className="block" htmlFor="impersonate-user-select">
                    User
                  </label>
                  <select
                    id="impersonate-user-select"
                    className="input w-full"
                    value={impersonateUserId}
                    onChange={(e) => setImpersonateUserId(e.target.value)}
                    required
                  >
                    <option value="">Select user</option>
                    {impersonateCandidates.map((u) => (
                      <option key={String(u.id)} value={String(u.id)}>
                        {u.name} ({u.email}) — {u.role}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="btn" disabled={impersonateBusy}>
                    {impersonateBusy ? "Starting…" : "Start impersonation"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={impersonateBusy}
                    onClick={() => setImpersonatePlant(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
