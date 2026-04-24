"use client";

import { useEffect, useId, useRef, useState } from "react";
import { apiFetch, apiFetchForm, API_URL } from "../lib/api.js";

/**
 * Super Admin: platform logo (sign-in / header when no plant selected).
 */
export default function PlatformIdentitySettings() {
  const uid = useId();
  const platformFileId = `${uid}-platform-logo`;
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [platformBrandingTs, setPlatformBrandingTs] = useState(null);
  const platformLogoInputRef = useRef(null);

  async function refreshPlatformBranding() {
    try {
      const res = await fetch(`${API_URL}/settings/platform/branding`);
      const data = await res.json().catch(() => ({}));
      if (data?.hasLogo && typeof data.updatedAt === "number") {
        setPlatformBrandingTs(data.updatedAt);
      } else {
        setPlatformBrandingTs(null);
      }
    } catch {
      setPlatformBrandingTs(null);
    }
  }

  useEffect(() => {
    void refreshPlatformBranding();
  }, []);

  async function onUploadPlatformLogo(e) {
    e.preventDefault();
    const file = platformLogoInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose an image file for the platform logo.");
      return;
    }
    setError("");
    setMessage("");
    try {
      const fd = new FormData();
      fd.append("logo", file);
      await apiFetchForm("/settings/platform/logo", fd);
      if (platformLogoInputRef.current) platformLogoInputRef.current.value = "";
      setMessage("Platform logo updated.");
      await refreshPlatformBranding();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("vems-branding-updated"));
      }
    } catch (err) {
      setError(err.message || "Upload failed");
    }
  }

  async function onRemovePlatformLogo() {
    setError("");
    setMessage("");
    try {
      await apiFetch("/settings/platform/logo", { method: "DELETE" });
      setMessage("Platform logo removed.");
      await refreshPlatformBranding();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("vems-branding-updated"));
      }
    } catch (err) {
      setError(err.message || "Remove failed");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">Platform identity</h2>
      <p className="mb-4 text-sm text-slate-600">
        Logo for your software company (shown on sign-in and in the header when no plant is selected). Each plant sets
        its own logo under Admin → Plant logo after opening that site.
      </p>
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}
      {message ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}
      {platformBrandingTs ? (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Current platform logo</p>
          <img
            src={`${API_URL}/settings/platform/logo?t=${platformBrandingTs}`}
            alt=""
            className="max-h-16 max-w-[220px] rounded-lg border border-slate-200 object-contain"
          />
        </div>
      ) : null}
      <form className="flex flex-wrap items-end gap-4" onSubmit={onUploadPlatformLogo}>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor={platformFileId}>
            Logo file
          </label>
          <input
            id={platformFileId}
            ref={platformLogoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
            className="input w-full"
          />
        </div>
        <button type="submit" className="btn">
          Upload platform logo
        </button>
        {platformBrandingTs ? (
          <button type="button" className="btn btn-secondary" onClick={() => void onRemovePlatformLogo()}>
            Remove platform logo
          </button>
        ) : null}
      </form>
    </section>
  );
}
