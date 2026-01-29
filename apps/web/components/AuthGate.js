"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, getToken } from "../lib/api.js";

export default function AuthGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token && pathname !== "/login") {
      router.replace("/login");
      return;
    }
    if (token && pathname.startsWith("/admin")) {
      apiFetch("/auth/me")
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

  if (!ready && pathname !== "/login") {
    return null;
  }

  return children;
}
