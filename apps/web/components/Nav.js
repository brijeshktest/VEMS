"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, getToken, setToken } from "../lib/api.js";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/vendors", label: "Vendors" },
  { href: "/materials", label: "Materials" },
  { href: "/vouchers", label: "Vouchers" },
  { href: "/reports", label: "Reports" }
];

function linkClass(pathname, href) {
  if (href === "/admin") {
    return pathname === "/admin" || pathname.startsWith("/admin/") ? "nav-link nav-link--active" : "nav-link";
  }
  return pathname === href ? "nav-link nav-link--active" : "nav-link";
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allowRoomOps, setAllowRoomOps] = useState(false);

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
        <div className="brand">
          <span className="brand-title">Carlson Farms</span>
          <span className="brand-tagline">Vendor &amp; expense management</span>
        </div>
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
