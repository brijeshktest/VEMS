"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { API_URL, apiFetch, getToken, setToken } from "../lib/api.js";
import { getWorkMode, setWorkMode } from "../lib/workMode.js";

const DEFAULT_BRAND_LOGO = "https://shroomagritech.com/images/shroom.png";

function linkClass(pathname, href) {
  const path = pathname ?? "";
  if (href === "/admin") {
    return path === "/admin" || path.startsWith("/admin/") ? "nav-link nav-link--active" : "nav-link";
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
  const [logoUpdatedAt, setLogoUpdatedAt] = useState(null);
  const [density, setDensity] = useState("comfortable");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(null);

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
        const res = await fetch(`${API_URL}/settings/branding`);
        const data = await res.json().catch(() => ({}));
        if (!cancelled && data?.hasLogo) {
          setLogoUpdatedAt(typeof data.updatedAt === "number" ? data.updatedAt : Date.now());
        } else if (!cancelled) {
          setLogoUpdatedAt(null);
        }
      } catch {
        if (!cancelled) setLogoUpdatedAt(null);
      }
    }
    loadBranding();
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
  }, []);

  useEffect(() => {
    const token = getToken();
    setIsAuthenticated(Boolean(token));
    setWorkModeState(getWorkMode());
  }, [pathname]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUserProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch("/auth/me");
        if (!cancelled && data?.user) {
          setUserProfile({
            name: typeof data.user.name === "string" ? data.user.name : "",
            email: typeof data.user.email === "string" ? data.user.email : ""
          });
        }
      } catch {
        if (!cancelled) setUserProfile({ name: "", email: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

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
    const mode = getWorkMode();
    if (!mode) {
      router.replace("/work-mode");
      return;
    }
    setWorkModeState(mode);
  }, [isAuthenticated, pathname, router]);

  function handleLogout() {
    setToken(null);
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

  const links =
    pathname === "/work-mode"
      ? []
      : workMode === "room"
        ? [{ href: "/dashboard", label: "Dashboard" }, { href: "/room-ops", label: "Room ops" }]
        : workMode === "tunnel"
          ? [{ href: "/dashboard", label: "Dashboard" }, { href: "/tunnel-bunker-ops", label: "Tunnel & Bunker Ops" }]
          : workMode === "sales"
            ? [{ href: "/dashboard", label: "Dashboard" }, { href: "/sales", label: "Sales" }]
            : workMode === "admin"
            ? [
                { href: "/dashboard", label: "Dashboard" },
                { href: "/sales", label: "Sales" },
                { href: "/tunnel-bunker-ops", label: "Tunnel & Bunker Ops" },
                { href: "/admin", label: "Admin" },
                { href: "/admin/rooms", label: "Rooms" },
                { href: "/admin/stages", label: "Stages" },
                { href: "/admin/tunnel-bunker", label: "Tunnel settings" }
              ]
            : [
                { href: "/dashboard", label: "Dashboard" },
                { href: "/vendors", label: "Vendors" },
                { href: "/materials", label: "Materials" },
                { href: "/vouchers", label: "Vouchers" },
                { href: "/reports", label: "Reports" }
              ];

  const menuDrawerClass = isAuthenticated
    ? "nav-links nav-links--mobile-drawer" + (mobileNavOpen ? " nav-links--mobile-drawer--open" : "")
    : "nav-links";

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
            toggleDensity();
            setUserMenuOpen(false);
          }}
        >
          {density === "compact" ? "Comfortable" : "Compact"}
        </button>
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

  const brandLink = (
    <Link
      href={isAuthenticated ? "/dashboard" : "/"}
      className={
        "nav-cell-brand brand min-w-0 shrink-0 " +
        (isAuthenticated ? "brand--with-logo brand--logo-only" : "brand--with-logo")
      }
    >
      <span className="brand-logo-slot">
        {logoUpdatedAt ? (
          <img
            className="brand-logo-img"
            src={`${API_URL}/settings/logo?t=${logoUpdatedAt}`}
            alt="Organization logo"
            width={180}
            height={48}
          />
        ) : (
          <img
            className="brand-logo-img"
            src={DEFAULT_BRAND_LOGO}
            alt="Shroom Agritech"
            width={200}
            height={67}
          />
        )}
      </span>
      {!isAuthenticated ? (
        <span className="brand-text">
          <span className="brand-title">Shroom Agritech LLP</span>
          <span className="brand-tagline">Vendor &amp; expense management</span>
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

  return (
    <nav className="nav nav--full-bleed w-full min-w-0 max-w-full pt-[env(safe-area-inset-top,0px)]">
      {isAuthenticated ? (
        <div className="nav-page-inner nav-inner nav-inner--app nav-inner--auth-grail">
          {brandLink}
          <div className="nav-cell-controls">
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
          <div id="nav-primary-menu" className={menuDrawerClass + " nav-cell-links"}>
            {navLinksBody}
          </div>
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
  );
}
