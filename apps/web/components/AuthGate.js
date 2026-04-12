"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, getToken } from "../lib/api.js";
import { getWorkMode } from "../lib/workMode.js";

export default function AuthGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    if (pathname && pathname !== "/work-mode") {
      const mode = getWorkMode();
      if (!mode) {
        router.replace("/work-mode");
        return;
      }
      const expensePaths = ["/dashboard", "/vendors", "/materials", "/vouchers", "/reports"];
      if (mode === "expense" && !expensePaths.includes(pathname)) {
        router.replace("/dashboard");
        return;
      }
      if (mode === "room" && pathname !== "/dashboard" && pathname !== "/room-ops") {
        router.replace("/dashboard");
        return;
      }
      if (mode === "tunnel" && pathname !== "/dashboard" && pathname !== "/tunnel-bunker-ops") {
        router.replace("/dashboard");
        return;
      }
      if (mode === "sales" && pathname !== "/dashboard" && pathname !== "/sales") {
        router.replace("/dashboard");
        return;
      }
      if (
        mode === "admin" &&
        pathname !== "/dashboard" &&
        pathname !== "/tunnel-bunker-ops" &&
        pathname !== "/sales" &&
        !(pathname === "/admin" || pathname.startsWith("/admin/"))
      ) {
        router.replace("/dashboard");
        return;
      }
    }
    if (token && pathname?.startsWith("/admin")) {
      const signal =
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(12_000)
          : undefined;
      apiFetch("/auth/me", signal ? { signal } : {})
        .then((data) => {
          if (data.user?.role !== "admin") {
            router.replace("/dashboard");
            return;
          }
          setReady(true);
        })
        .catch(() => {
          router.replace("/login");
        });
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (!ready) {
    return (
      <main className="main-surface saas-main auth-gate-loading w-full min-w-0 max-w-full flex-1">
        <div className="container saas-container flex min-h-[50dvh] items-center justify-center">
          <p className="text-sm text-[var(--muted)]" role="status" aria-live="polite">
            Loading…
          </p>
        </div>
      </main>
    );
  }

  return children;
}
