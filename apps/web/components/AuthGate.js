"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, getToken, getActiveCompanyId } from "../lib/api.js";
import { getWorkMode } from "../lib/workMode.js";
import { isPlatformAdminRole } from "../lib/modulePermissions.js";

export default function AuthGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const sessionRef = useRef({ token: null, me: null });

  useEffect(() => {
    const token = getToken();
    if (!token) {
      sessionRef.current = { token: null, me: null };
      router.replace("/login");
      return undefined;
    }

    let cancelled = false;
    const signal =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(12_000)
        : undefined;

    (async () => {
      let me = null;
      try {
        if (sessionRef.current.token === token && sessionRef.current.me) {
          me = sessionRef.current.me;
        } else {
          me = await apiFetch("/auth/me", signal ? { signal } : {});
          if (cancelled) return;
          sessionRef.current = { token, me };
        }
      } catch {
        sessionRef.current = { token: null, me: null };
        if (!cancelled) router.replace("/login");
        return;
      }
      if (cancelled) return;

      /** Allow account profile for every signed-in user without work-mode / tenant routing side effects. */
      const pathNorm = (pathname || "").replace(/\/+$/, "") || "/";
      if (pathNorm === "/profile") {
        if (!cancelled) setReady(true);
        return;
      }

      const isSuperNoTenant = me?.user?.role === "super_admin" && !getActiveCompanyId();

      if (isSuperNoTenant) {
        const onAdmin = pathname != null && pathname.startsWith("/admin");
        const onProfile = pathNorm === "/profile";
        if (!onAdmin && !onProfile) {
          router.replace("/admin/plant-network");
          return;
        }
      }

      if (pathname && pathname !== "/work-mode" && !pathname.startsWith("/admin")) {
        const mode = getWorkMode();
        // Account profile is not tied to a work mode; allow it before /work-mode is chosen.
        if (!mode && pathname !== "/profile") {
          router.replace("/work-mode");
          return;
        }
        if (!mode) {
          if (!cancelled) setReady(true);
          return;
        }
        const expensePaths = ["/dashboard", "/vendors", "/materials", "/vouchers", "/reports", "/profile"];
        if (mode === "expense" && !expensePaths.includes(pathname)) {
          router.replace("/dashboard");
          return;
        }
        if (mode === "room" && pathname !== "/dashboard" && pathname !== "/room-ops" && pathname !== "/profile") {
          router.replace("/dashboard");
          return;
        }
        if (
          mode === "tunnel" &&
          pathname !== "/dashboard" &&
          pathname !== "/tunnel-bunker-ops" &&
          pathname !== "/profile"
        ) {
          router.replace("/dashboard");
          return;
        }
        if (
          mode === "plant" &&
          pathname !== "/dashboard" &&
          pathname !== "/profile" &&
          pathname !== "/plant-operations" &&
          !pathname.startsWith("/plant-operations/")
        ) {
          router.replace("/dashboard");
          return;
        }
        if (mode === "sales" && pathname !== "/dashboard" && pathname !== "/sales" && pathname !== "/profile") {
          router.replace("/dashboard");
          return;
        }
        if (
          mode === "contributions" &&
          pathname !== "/dashboard" &&
          pathname !== "/profile" &&
          !pathname.startsWith("/contributions")
        ) {
          router.replace("/dashboard");
          return;
        }
        if (
          mode === "admin" &&
          pathname !== "/dashboard" &&
          pathname !== "/profile" &&
          pathname !== "/tunnel-bunker-ops" &&
          pathname !== "/plant-operations" &&
          !pathname.startsWith("/plant-operations/") &&
          pathname !== "/sales" &&
          !pathname.startsWith("/contributions") &&
          !(pathname === "/admin" || pathname.startsWith("/admin/"))
        ) {
          router.replace("/dashboard");
          return;
        }
      }

      if (pathname?.startsWith("/admin")) {
        if (!isPlatformAdminRole(me?.user?.role)) {
          router.replace("/dashboard");
          return;
        }
      }

      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
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
