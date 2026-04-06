"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, API_URL, getToken, setToken } from "../lib/api.js";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/vendors", label: "Vendors" },
  { href: "/materials", label: "Materials" },
  { href: "/vouchers", label: "Vouchers" },
  { href: "/reports", label: "Reports" }
];

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [allowRoomOps, setAllowRoomOps] = useState(false);
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
    if (!token) {
      setIsAdmin(false);
      setAllowRoomOps(false);
      return;
    }
    async function loadAccess() {
      try {
        const meData = await apiFetch("/auth/me");
        const admin = meData.user?.role === "admin";
        setIsAdmin(admin);
        if (admin) {
          setAllowRoomOps(true);
          return;
        }
        const permData = await apiFetch("/auth/permissions");
        if (permData.permissions === "all") {
          setAllowRoomOps(true);
          return;
        }
        const canRoomStages = Boolean(permData.permissions?.roomStages?.view || permData.permissions?.roomStages?.edit);
        const canRoomActivities = Boolean(
          permData.permissions?.roomActivities?.view || permData.permissions?.roomActivities?.edit
        );
        setAllowRoomOps(canRoomStages || canRoomActivities);
      } catch {
        setIsAdmin(false);
        setAllowRoomOps(false);
      }
    }

    loadAccess();
  }, [pathname]);

  function handleLogout() {
    setToken(null);
    setIsAuthenticated(false);
    router.push("/login");
  }

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
              {isAdmin ? (
                <Link href="/admin" className={linkClass(pathname, "/admin")}>
                  Admin
                </Link>
              ) : null}
              {allowRoomOps ? (
                <Link href="/room-ops" className={linkClass(pathname, "/room-ops")}>
                  Room ops
                </Link>
              ) : null}
              <span className="nav-actions">
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
