"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getToken, setToken } from "../lib/api.js";

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

  useEffect(() => {
    setIsAuthenticated(Boolean(getToken()));
  }, [pathname]);

  function handleLogout() {
    setToken(null);
    setIsAuthenticated(false);
    router.push("/login");
  }

  return (
    <nav className="nav">
      <div className="container">
        <div className="nav-links">
          {isAuthenticated ? (
            <>
              {links.map((link) => (
                <Link key={link.href} href={link.href}>
                  <span style={{ fontWeight: pathname === link.href ? 700 : 400 }}>{link.label}</span>
                </Link>
              ))}
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
