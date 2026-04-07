"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { API_URL, getToken, setToken } from "../lib/api.js";
import { getWorkMode, setWorkMode } from "../lib/workMode.js";

function linkClass(pathname, href) {
  const path = pathname ?? "";
  if (href === "/admin") {
    return path === "/admin" || path.startsWith("/admin/") ? "nav-link nav-link--active" : "nav-link";
  }
  return path === href ? "nav-link nav-link--active" : "nav-link";
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [workMode, setWorkModeState] = useState("");
  const [logoUpdatedAt, setLogoUpdatedAt] = useState(null);

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
    if (!isAuthenticated) return;
    if (pathname === "/work-mode") return;
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
    router.push("/login");
  }

  const links = pathname === "/work-mode"
    ? []
    :
    workMode === "room"
      ? [{ href: "/dashboard", label: "Dashboard" }, { href: "/room-ops", label: "Room ops" }]
      : workMode === "admin"
        ? [
            { href: "/dashboard", label: "Dashboard" },
            { href: "/admin", label: "Admin" },
            { href: "/admin/rooms", label: "Rooms" },
            { href: "/admin/stages", label: "Stages" }
          ]
        : [
            { href: "/dashboard", label: "Dashboard" },
            { href: "/vendors", label: "Vendors" },
            { href: "/materials", label: "Materials" },
            { href: "/vouchers", label: "Vouchers" },
            { href: "/reports", label: "Reports" }
          ];

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link href={isAuthenticated ? "/dashboard" : "/"} className="brand brand--with-logo">
          <span className="brand-logo-slot" aria-hidden={!logoUpdatedAt}>
            {logoUpdatedAt ? (
              <img
                className="brand-logo-img"
                src={`${API_URL}/settings/logo?t=${logoUpdatedAt}`}
                alt="Organization logo"
                width={44}
                height={44}
              />
            ) : (
              <span className="brand-logo-placeholder" title="Logo can be set in Admin" />
            )}
          </span>
          <span className="brand-text">
            <span className="brand-title">Shroom Agritech LLP</span>
            <span className="brand-tagline">Vendor &amp; expense management</span>
          </span>
        </Link>
        <div className="nav-links">
          {isAuthenticated ? (
            <>
              {links.map((item) => (
                <Link key={item.href} href={item.href} className={linkClass(pathname, item.href)}>
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
                      router.push("/work-mode");
                    }}
                  >
                    Switch area
                  </button>
                ) : null}
                <button className="btn btn-secondary btn-nav-logout" type="button" onClick={handleLogout}>
                  Log out
                </button>
              </span>
            </>
          ) : (
            <Link href="/login" className={linkClass(pathname, "/login")}>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
