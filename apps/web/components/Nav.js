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
      } catch (error) {
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
          <span className="brand-title">Vendor and Expense Management System</span>
        </div>
        <div className="nav-links">
          {isAuthenticated ? (
            <>
              {links.map((link) => (
                <Link key={link.href} href={link.href}>
                  <span style={{ fontWeight: pathname === link.href ? 700 : 400 }}>{link.label}</span>
                </Link>
              ))}
              {isAdmin ? (
                <Link href="/admin">
                  <span style={{ fontWeight: pathname === "/admin" ? 700 : 400 }}>Admin</span>
                </Link>
              ) : null}
              {allowRoomOps ? (
                <Link href="/room-ops">
                  <span style={{ fontWeight: pathname === "/room-ops" ? 700 : 400 }}>Room Ops</span>
                </Link>
              ) : null}
              <button className="btn btn-secondary" type="button" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <Link href="/login">
              <span style={{ fontWeight: pathname === "/login" ? 700 : 400 }}>Login</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
