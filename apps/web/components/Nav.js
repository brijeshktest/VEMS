"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_URL, apiFetch, getToken, setToken, getActiveCompanyId, setActiveCompanyId } from "../lib/api.js";
import { getWorkMode, setWorkMode } from "../lib/workMode.js";
import {
  canAccessTunnelOps,
  canViewModule,
  isPermissionsAll,
  isPlatformAdminRole
} from "../lib/modulePermissions.js";

/** Fallback when no plant or platform logo is configured (first plant historically Shroom Agritech). */
const DEFAULT_BRAND_LOGO = "https://shroomagritech.com/images/shroom.png";

function linkClass(pathname, href) {
  const path = pathname ?? "";
  if (href === "/admin") {
    return path === "/admin" || path.startsWith("/admin/") ? "nav-link nav-link--active" : "nav-link";
  }
  if (href === "/contributions/cash-withdrawals") {
    return path === href || path.startsWith("/contributions/cash-withdrawals")
      ? "nav-link nav-link--active"
      : "nav-link";
  }
  if (href === "/contributions") {
    return path === "/contributions" ? "nav-link nav-link--active" : "nav-link";
  }
  return path === href ? "nav-link nav-link--active" : "nav-link";
}

function IconMenu({ className }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M5 12h14M5 17h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClose({ className }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function userInitial(profile) {
  const n = (profile?.name || "").trim();
  if (n) return n[0].toUpperCase();
  const e = (profile?.email || "").trim();
  if (e) return e[0].toUpperCase();
  return "?";
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const userMenuRef = useRef(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [workMode, setWorkModeState] = useState("");
  /** Full URL for header logo, or null to use default image. */
  const [brandLogoUrl, setBrandLogoUrl] = useState(null);
  const [density, setDensity] = useState("comfortable");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [defaultPlantImpersonateBusy, setDefaultPlantImpersonateBusy] = useState(false);
  /** @type {[{ isAdmin: boolean, isSuperAdmin?: boolean, permissions: unknown } | null, function]} */
  const [permPayload, setPermPayload] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("vems-ui-density");
    const next = saved === "compact" ? "compact" : "comfortable";
    setDensity(next);
    document.documentElement.setAttribute("data-density", next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadBranding() {
      try {
        if (!isAuthenticated) {
          const pr = await fetch(`${API_URL}/settings/platform/branding`);
          const pd = await pr.json().catch(() => ({}));
          if (!cancelled && pd?.hasLogo && typeof pd.updatedAt === "number") {
            setBrandLogoUrl(`${API_URL}/settings/platform/logo?t=${pd.updatedAt}`);
            return;
          }
          const r = await fetch(`${API_URL}/settings/branding`);
          const d = await r.json().catch(() => ({}));
          if (!cancelled && d?.hasLogo && typeof d.updatedAt === "number") {
            setBrandLogoUrl(`${API_URL}/settings/logo?t=${d.updatedAt}`);
            return;
          }
          if (!cancelled) setBrandLogoUrl(null);
          return;
        }

        const role = userProfile?.role;
        const userCo = userProfile?.companyId ? String(userProfile.companyId) : "";
        const active = getActiveCompanyId() ? String(getActiveCompanyId()) : "";

        if (role === "super_admin" && !active) {
          const pr = await fetch(`${API_URL}/settings/platform/branding`);
          const pd = await pr.json().catch(() => ({}));
          if (!cancelled && pd?.hasLogo && typeof pd.updatedAt === "number") {
            setBrandLogoUrl(`${API_URL}/settings/platform/logo?t=${pd.updatedAt}`);
          } else if (!cancelled) {
            setBrandLogoUrl(null);
          }
          return;
        }

        const plantCid = active || userCo;
        const q = plantCid ? `?companyId=${encodeURIComponent(plantCid)}` : "";
        const res = await fetch(`${API_URL}/settings/branding${q}`);
        const data = await res.json().catch(() => ({}));
        if (!cancelled && data?.hasLogo && typeof data.updatedAt === "number") {
          const qp = plantCid ? `?companyId=${encodeURIComponent(plantCid)}&` : "?";
          setBrandLogoUrl(`${API_URL}/settings/logo${qp}t=${data.updatedAt}`);
        } else if (!cancelled) {
          setBrandLogoUrl(null);
        }
      } catch {
        if (!cancelled) setBrandLogoUrl(null);
      }
    }
    void loadBranding();
    const onBranding = () => void loadBranding();
    if (typeof window !== "undefined") {
      window.addEventListener("vems-branding-updated", onBranding);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("vems-branding-updated", onBranding);
      }
    };
  }, [isAuthenticated, userProfile?.role, userProfile?.companyId, pathname]);

  useEffect(() => {
    const token = getToken();
    setIsAuthenticated(Boolean(token));
    setWorkModeState(getWorkMode());
  }, [pathname]);

  const loadUserProfile = useCallback(async () => {
    if (!isAuthenticated) {
      setUserProfile(null);
      return;
    }
    try {
      const data = await apiFetch("/auth/me");
      if (data?.user) {
        const u = data.user;
        const role = typeof u.role === "string" ? u.role : "";
        const defIdRaw = data.defaultPlantCompanyId;
        const defId =
          role === "super_admin" && defIdRaw != null && String(defIdRaw).trim() !== "" ? String(defIdRaw) : null;
        const companies = Array.isArray(data.companies) ? data.companies : [];
        const defCo = defId ? companies.find((c) => String(c._id ?? c.id) === defId) : null;
        const defName =
          defCo && typeof defCo.name === "string" && defCo.name.trim() ? defCo.name.trim() : defId ? "Default plant" : null;
        const defActive = defCo ? defCo.isActive !== false : false;
        setUserProfile({
          name: typeof u.name === "string" ? u.name : "",
          email: typeof u.email === "string" ? u.email : "",
          role,
          companyId: u.companyId != null ? String(u.companyId) : "",
          impersonation: data.impersonation && typeof data.impersonation === "object" ? data.impersonation : null,
          defaultPlantCompanyId: defId,
          defaultPlantName: defName,
          defaultPlantIsActive: defId ? defActive : null
        });
      }
    } catch {
      setUserProfile({
        name: "",
        email: "",
        role: "",
        companyId: "",
        impersonation: null,
        defaultPlantCompanyId: null,
        defaultPlantName: null,
        defaultPlantIsActive: null
      });
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void loadUserProfile();
  }, [loadUserProfile]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      pathname === "/work-mode" ||
      pathname === "/login" ||
      pathname === "/admin/plant-network" ||
      pathname === "/admin/platform"
    ) {
      setPermPayload(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const [me, perm] = await Promise.all([apiFetch("/auth/me"), apiFetch("/auth/permissions")]);
        if (!cancelled) {
          const pk =
            Array.isArray(perm?.plantModuleKeys) && perm.plantModuleKeys.length > 0 ? perm.plantModuleKeys : null;
          setPermPayload({
            isAdmin: isPlatformAdminRole(me?.user?.role),
            isSuperAdmin: me?.user?.role === "super_admin",
            permissions: perm?.permissions,
            plantModuleKeys: pk
          });
        }
      } catch {
        if (!cancelled) setPermPayload({ isAdmin: false, isSuperAdmin: false, permissions: {} });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onUserUpdated() {
      void loadUserProfile();
    }
    window.addEventListener("vems-user-updated", onUserUpdated);
    return () => window.removeEventListener("vems-user-updated", onUserUpdated);
  }, [loadUserProfile]);

  useEffect(() => {
    setMobileNavOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen && !userMenuOpen) return;
    function onKey(e) {
      if (e.key === "Escape") {
        setMobileNavOpen(false);
        setUserMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, userMenuOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;
    function handlePointerDown(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [userMenuOpen]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (pathname === "/work-mode" || pathname === "/login") return;
    /** Admin shell, dashboard, and account profile resolve work mode themselves (same as AuthGate). */
    if (pathname?.startsWith("/admin") || pathname === "/dashboard" || pathname === "/profile") return;
    const mode = getWorkMode();
    if (!mode) {
      router.replace("/work-mode");
      return;
    }
    setWorkModeState(mode);
  }, [isAuthenticated, pathname, router]);

  async function stopImpersonation() {
    try {
      const data = await apiFetch("/auth/impersonate/stop", { method: "POST" });
      setToken(data.token);
      setActiveCompanyId(null);
      setWorkMode("");
      setWorkModeState("");
      setUserMenuOpen(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("vems-user-updated"));
        window.dispatchEvent(new Event("vems-branding-updated"));
      }
      router.replace("/admin/plant-network");
    } catch {
      /* ignore */
    }
  }

  function handleLogout() {
    setToken(null);
    setActiveCompanyId(null);
    setWorkMode("");
    setIsAuthenticated(false);
    setMobileNavOpen(false);
    setUserMenuOpen(false);
    router.push("/login");
  }

  function toggleDensity() {
    const next = density === "compact" ? "comfortable" : "compact";
    setDensity(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("vems-ui-density", next);
    }
    document.documentElement.setAttribute("data-density", next);
  }

  const closeMobileNav = () => setMobileNavOpen(false);

  const activeCo = getActiveCompanyId() ? String(getActiveCompanyId()) : "";
  const defPlantCo = userProfile?.defaultPlantCompanyId ? String(userProfile.defaultPlantCompanyId) : "";
  const showSuperadminPlatformBtn = Boolean(
    userProfile?.role === "super_admin" &&
      activeCo &&
      defPlantCo &&
      activeCo === defPlantCo &&
      !userProfile?.impersonation &&
      pathname !== "/admin/plant-network" &&
      pathname !== "/admin/platform"
  );

  function goToSuperadminPlatform() {
    setActiveCompanyId(null);
    setWorkMode("");
    setWorkModeState("");
    closeMobileNav();
    setUserMenuOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("vems-branding-updated"));
    }
    router.push("/admin/plant-network");
  }

  async function openDefaultPlantWorkspace() {
    const id = userProfile?.defaultPlantCompanyId;
    if (!id || defaultPlantImpersonateBusy) return;
    setDefaultPlantImpersonateBusy(true);
    try {
      const data = await apiFetch("/auth/impersonate/plant-primary-admin", {
        method: "POST",
        body: JSON.stringify({ companyId: String(id) })
      });
      if (data?.token) setToken(data.token);
      setActiveCompanyId(null);
      setWorkMode("");
      setWorkModeState("");
      setUserMenuOpen(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("vems-branding-updated"));
        window.dispatchEvent(new Event("vems-user-updated"));
      }
      router.replace("/work-mode");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not open plant as administrator.";
      if (typeof window !== "undefined") window.alert(msg);
    } finally {
      setDefaultPlantImpersonateBusy(false);
    }
  }

  const links = useMemo(() => {
    if (pathname === "/admin/plant-network" || pathname === "/admin/platform") return [];
    if (pathname === "/work-mode") return [];
    const p = permPayload?.permissions;
    const pk = permPayload?.plantModuleKeys;
    if (p == null && isAuthenticated) {
      return [{ href: "/dashboard", label: "Dashboard" }];
    }
    const canSalesNav =
      isPermissionsAll(p) || canViewModule(p, "sales", pk) || Boolean(p?.sales?.edit);
    const canContrNav =
      isPermissionsAll(p) || canViewModule(p, "contributions", pk) || Boolean(p?.contributions?.edit);
    const canGrowingNav =
      isPermissionsAll(p) ||
      canViewModule(p, "growingRoomOps", pk) ||
      Boolean(p?.growingRoomOps?.edit || p?.growingRoomOps?.create);

    if (workMode === "room") {
      return [{ href: "/dashboard", label: "Dashboard" }, { href: "/room-ops", label: "Room ops" }];
    }
    if (workMode === "tunnel") {
      return [{ href: "/dashboard", label: "Dashboard" }, { href: "/tunnel-bunker-ops", label: "Tunnel & Bunker Ops" }];
    }
    if (workMode === "plant") {
      const out = [{ href: "/dashboard", label: "Dashboard" }, { href: "/plant-operations", label: "Compost Units" }];
      if (canGrowingNav) {
        out.push({ href: "/plant-operations/growing-rooms", label: "Growing rooms" });
      }
      return out;
    }
    if (workMode === "sales") {
      return [{ href: "/dashboard", label: "Dashboard" }, { href: "/sales", label: "Sales" }];
    }
    if (workMode === "contributions") {
      return [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/contributions", label: "Contributions" },
        { href: "/contributions/cash-withdrawals", label: "Cash withdrawals" }
      ];
    }
    if (workMode === "admin") {
      const out = [{ href: "/dashboard", label: "Dashboard" }];
      if (canSalesNav) out.push({ href: "/sales", label: "Sales" });
      if (canContrNav) {
        out.push({ href: "/contributions", label: "Contributions" });
        out.push({ href: "/contributions/cash-withdrawals", label: "Cash withdrawals" });
      }
      if (canAccessTunnelOps(p, pk)) out.push({ href: "/tunnel-bunker-ops", label: "Tunnel & Bunker Ops" });
      const canPlantNav =
        isPermissionsAll(p) ||
        canViewModule(p, "plantOperations", pk) ||
        Boolean(p?.plantOperations?.edit || p?.plantOperations?.create);
      if (canPlantNav || canGrowingNav) {
        out.push({ href: "/plant-operations", label: "Compost Units" });
      }
      if (canGrowingNav) {
        out.push({ href: "/plant-operations/growing-rooms", label: "Growing rooms" });
      }
      if (permPayload?.isSuperAdmin) {
        out.push({ href: "/admin/plant-network", label: "Plant network" });
      }
      out.push(
        { href: "/admin", label: "Admin" },
        { href: "/admin/rooms", label: "Resources" },
        { href: "/admin/stages", label: "Stages" },
        { href: "/admin/tunnel-bunker", label: "Tunnel settings" }
      );
      return out;
    }
    const out = [{ href: "/dashboard", label: "Dashboard" }];
    if (canViewModule(p, "vendors", pk)) out.push({ href: "/vendors", label: "Vendors" });
    if (canViewModule(p, "materials", pk)) out.push({ href: "/materials", label: "Materials" });
    if (canViewModule(p, "vouchers", pk)) out.push({ href: "/vouchers", label: "Vouchers" });
    if (canViewModule(p, "reports", pk)) out.push({ href: "/reports", label: "Reports" });
    return out;
  }, [pathname, workMode, permPayload, isAuthenticated, permPayload?.isSuperAdmin]);

  const menuDrawerClass = isAuthenticated
    ? "nav-links nav-links--mobile-drawer" + (mobileNavOpen ? " nav-links--mobile-drawer--open" : "")
    : "nav-links";

  /** Work mode (and any screen with no primary links) has nothing for the mobile drawer — hide it entirely. */
  const showPrimaryNavLinks = links.length > 0;

  function renderUserMenu() {
    return (
      <div className="nav-user-dropdown" role="menu">
        <div className="nav-user-dropdown-header">
          <div className="nav-user-dropdown-name">{userProfile?.name?.trim() || "Signed in"}</div>
          <div className="nav-user-dropdown-email">{userProfile?.email || "—"}</div>
        </div>
        <div className="nav-user-dropdown-sep" aria-hidden />
        <button
          type="button"
          role="menuitem"
          className="nav-user-dropdown-item"
          onClick={() => {
            router.push("/profile");
            setUserMenuOpen(false);
          }}
        >
          Profile
        </button>
        {userProfile?.role === "super_admin" && !userProfile?.impersonation && pathname === "/admin/platform" ? (
          <button
            type="button"
            role="menuitem"
            className="nav-user-dropdown-item"
            onClick={() => {
              router.push("/admin/plant-network");
              setUserMenuOpen(false);
            }}
          >
            Plant network
          </button>
        ) : null}
        {userProfile?.role === "super_admin" && !userProfile?.impersonation ? (
          <button
            type="button"
            role="menuitem"
            className="nav-user-dropdown-item"
            onClick={() => {
              router.push("/admin/platform");
              setUserMenuOpen(false);
            }}
          >
            Setting
          </button>
        ) : null}
        <button
          type="button"
          role="menuitem"
          className="nav-user-dropdown-item"
          onClick={() => {
            toggleDensity();
            setUserMenuOpen(false);
          }}
        >
          {density === "compact" ? "Comfortable" : "Compact"}
        </button>
        {userProfile?.impersonation ? (
          <button
            type="button"
            role="menuitem"
            className="nav-user-dropdown-item"
            onClick={() => {
              setUserMenuOpen(false);
              void stopImpersonation();
            }}
          >
            Exit impersonation
          </button>
        ) : null}
        <button
          type="button"
          role="menuitem"
          className="nav-user-dropdown-item nav-user-dropdown-item--danger"
          onClick={() => {
            setUserMenuOpen(false);
            handleLogout();
          }}
        >
          Log out
        </button>
      </div>
    );
  }

  const brandHref =
    isAuthenticated && userProfile?.role === "super_admin" && !userProfile?.impersonation
      ? "/admin/plant-network"
      : isAuthenticated
        ? "/dashboard"
        : "/";

  const brandLink = (
    <Link
      href={brandHref}
      className={
        "nav-cell-brand brand min-w-0 shrink-0 " +
        (isAuthenticated ? "brand--with-logo brand--logo-only" : "brand--with-logo")
      }
    >
      <span className="brand-logo-slot">
        {brandLogoUrl ? (
          <img
            className="brand-logo-img"
            src={brandLogoUrl}
            alt="Application logo"
            width={180}
            height={48}
          />
        ) : (
          <img
            className="brand-logo-img"
            src={DEFAULT_BRAND_LOGO}
            alt=""
            width={200}
            height={67}
          />
        )}
      </span>
      {!isAuthenticated ? (
        <span className="brand-text">
          <span className="brand-title">Mushroom operations platform</span>
          <span className="brand-tagline">Vendor, production &amp; expense workspace</span>
        </span>
      ) : null}
    </Link>
  );

  const navLinksBody = isAuthenticated ? (
    <>
      {links.map((item) => (
        <Link key={item.href} href={item.href} className={linkClass(pathname, item.href)} onClick={closeMobileNav}>
          {item.label}
        </Link>
      ))}
      <span className="nav-actions">
        {pathname !== "/work-mode" ? (
          <button
            className="btn btn-secondary btn-nav-logout"
            type="button"
            onClick={() => {
              setWorkMode("");
              setWorkModeState("");
              closeMobileNav();
              router.push("/work-mode");
            }}
          >
            Switch area
          </button>
        ) : null}
      </span>
    </>
  ) : (
    <Link href="/login" className={linkClass(pathname, "/login")} onClick={closeMobileNav}>
      Sign in
    </Link>
  );

  const imp = userProfile?.impersonation;

  return (
    <Fragment>
      {imp ? (
        <div
          className="w-full border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950"
          role="status"
        >
          <span className="font-semibold">Impersonating</span>{" "}
          <span className="tabular-nums">{userProfile?.email}</span>
          {imp.impersonatorName || imp.impersonatorEmail ? (
            <span className="text-amber-900/90">
              {" "}
              (signed in as {String(imp.impersonatorName || "").trim() || imp.impersonatorEmail})
            </span>
          ) : null}
          . All actions apply to this user&apos;s plant only.{" "}
          <button type="button" className="ml-2 font-semibold text-amber-950 underline" onClick={() => void stopImpersonation()}>
            Exit impersonation
          </button>
        </div>
      ) : null}
      <nav className="nav nav--full-bleed w-full min-w-0 max-w-full pt-[env(safe-area-inset-top,0px)]">
      {isAuthenticated ? (
        <div
          className={
            "nav-page-inner nav-inner nav-inner--app nav-inner--auth-grail" +
            (!showPrimaryNavLinks ? " nav-inner--auth-grail--no-nav-links" : "")
          }
        >
          {brandLink}
          <div className="nav-cell-controls">
            {showPrimaryNavLinks ? (
              <button
                type="button"
                className="nav-hamburger"
                aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileNavOpen}
                aria-controls="nav-primary-menu"
                onClick={() => {
                  setMobileNavOpen((o) => !o);
                  setUserMenuOpen(false);
                }}
              >
                {mobileNavOpen ? <IconClose /> : <IconMenu />}
              </button>
            ) : null}
            {(pathname === "/admin/plant-network" || pathname === "/admin/platform") &&
            userProfile?.role === "super_admin" &&
            !userProfile?.impersonation &&
            userProfile?.defaultPlantCompanyId && userProfile?.defaultPlantIsActive ? (
              <button
                type="button"
                className="nav-default-plant-pill"
                disabled={defaultPlantImpersonateBusy}
                onClick={() => void openDefaultPlantWorkspace()}
                title="Sign in as this plant’s first administrator (same account as login default). No user picker."
              >
                {defaultPlantImpersonateBusy ? "Opening…" : userProfile.defaultPlantName || "Plant"}
              </button>
            ) : null}
            {showSuperadminPlatformBtn ? (
              <button
                type="button"
                className="btn btn-secondary btn-nav-superadmin"
                onClick={() => goToSuperadminPlatform()}
              >
                Superadmin
              </button>
            ) : null}
            <div className="nav-user" ref={userMenuRef}>
              <button
                type="button"
                className="nav-user-trigger"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label="Account menu"
                onClick={() => {
                  setUserMenuOpen((o) => !o);
                  setMobileNavOpen(false);
                }}
              >
                <span className="nav-user-avatar">{userInitial(userProfile)}</span>
              </button>
              {userMenuOpen ? renderUserMenu() : null}
            </div>
          </div>
          {showPrimaryNavLinks ? (
            <div id="nav-primary-menu" className={menuDrawerClass + " nav-cell-links"}>
              {navLinksBody}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="nav-page-inner nav-inner nav-inner--app">
          <div className="nav-top">{brandLink}</div>
          <div id="nav-primary-menu" className={menuDrawerClass}>
            {navLinksBody}
          </div>
        </div>
      )}
    </nav>
    </Fragment>
  );
}
