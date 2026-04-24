"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../../lib/api.js";
import PageHeader from "../../../../components/PageHeader.js";
import PlatformIdentitySettings from "../../../../components/PlatformIdentitySettings.js";

export default function SuperAdminPlatformSettingsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiFetch("/auth/me");
        if (cancelled) return;
        if (me?.user?.role !== "super_admin") {
          router.replace("/dashboard");
          return;
        }
        setReady(true);
      } catch {
        if (!cancelled) router.replace("/dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-3xl py-8">
      <PageHeader
        eyebrow="Super Admin"
        title="Platform settings"
        description="Branding and identity for the software provider account. This is separate from each plant’s own logo and settings."
      />
      <PlatformIdentitySettings />
    </div>
  );
}
