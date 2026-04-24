/**
 * Base URL for API calls (must include `/api` path; Express mounts the router there).
 * - Production builds default to same-origin `/api` (proxied by Next rewrites to the API server).
 * - Development defaults to the API process on port 4000.
 * Override anytime with `NEXT_PUBLIC_API_URL` at **build** time for client bundles.
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? "/api" : "http://127.0.0.1:4000/api");

const ACTIVE_COMPANY_KEY = "vems_active_company_id";

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("vem_token");
}

export function setToken(token) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("vem_token", token);
  } else {
    localStorage.removeItem("vem_token");
  }
}

/** Active plant for Super Admin (sent as X-Company-Id). Plant admins do not need this. */
export function getActiveCompanyId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_COMPANY_KEY);
}

export function setActiveCompanyId(id) {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem(ACTIVE_COMPANY_KEY, String(id));
  } else {
    localStorage.removeItem(ACTIVE_COMPANY_KEY);
  }
  try {
    window.dispatchEvent(new Event("vems-branding-updated"));
  } catch {
    /* ignore */
  }
}

function tenantHeaders() {
  const cid = getActiveCompanyId();
  if (!cid) return {};
  return { "X-Company-Id": cid };
}

/** Human-readable message when the response is not JSON (e.g. HTML error page from proxy). */
function summarizeNonJsonErrorBody(text, status) {
  const t = (text || "").trim();
  if (!t) {
    const hint =
      typeof window !== "undefined" && String(API_URL || "").startsWith("/")
        ? " Check that vems-api is running and Next.js rewrites /api to it."
        : " Check that vems-api is running (port 4000) or NEXT_PUBLIC_API_URL.";
    return `No response from server (HTTP ${status}).${hint}`;
  }
  if (t.startsWith("<") || t.startsWith("<!")) {
    return `Server error (HTTP ${status}). The API may be unreachable—check that vems-api is running and /api is proxied to it.`;
  }
  // Next.js rewrites used to return plain-text "Internal Server Error" when the upstream was unreachable.
  if (/^(internal server error|bad gateway|gateway timeout|service unavailable)$/i.test(t)) {
    const hint =
      typeof window !== "undefined" && String(API_URL || "").startsWith("/")
        ? " Start vems-api and confirm API_PROXY_TARGET (default http://127.0.0.1:4000)."
        : " Start vems-api or fix NEXT_PUBLIC_API_URL.";
    return `Could not reach the API (HTTP ${status}).${hint}`;
  }
  return t.length > 400 ? `${t.slice(0, 400)}…` : t;
}

function messageFromErrorPayload(data, rawText, status) {
  if (data && typeof data === "object") {
    const direct =
      (typeof data.error === "string" && data.error.trim()) ||
      (typeof data.message === "string" && data.message.trim()) ||
      (typeof data.msg === "string" && data.msg.trim()) ||
      (typeof data.detail === "string" && data.detail.trim());
    if (direct) {
      if (/^(internal server error|bad gateway|gateway timeout|service unavailable)$/i.test(direct)) {
        return summarizeNonJsonErrorBody(direct, status);
      }
      return direct;
    }
    const errs = data.errors;
    if (Array.isArray(errs) && errs.length) {
      const first = errs[0];
      if (typeof first === "string" && first.trim()) return first.trim();
      if (first && typeof first.msg === "string" && first.msg.trim()) return first.msg.trim();
      if (first && typeof first.message === "string" && first.message.trim()) return first.message.trim();
    }
  }
  return summarizeNonJsonErrorBody(rawText, status);
}

export async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...tenantHeaders(), ...(options.headers || {}) };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const url = `${API_URL}${path}`;
  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (e) {
    const hint =
      typeof window !== "undefined" && String(API_URL || "").startsWith("/")
        ? " Start vems-api and ensure Next.js rewrites /api to that server."
        : " Start vems-api (port 4000) or set NEXT_PUBLIC_API_URL to a reachable API base URL.";
    throw new Error(`${e?.message || "Network error"}.${hint}`);
  }
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(summarizeNonJsonErrorBody(text, res.status));
      }
      throw new Error("Invalid JSON from server.");
    }
  }
  if (!res.ok) {
    throw new Error(messageFromErrorPayload(data, text, res.status));
  }
  return data;
}

/** multipart/form-data; do not set Content-Type (browser sets boundary). */
export async function apiFetchForm(path, formData, options = {}) {
  const headers = { ...(options.headers || {}), ...tenantHeaders() };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const url = `${API_URL}${path}`;
  let res;
  try {
    res = await fetch(url, {
      ...options,
      method: options.method || "POST",
      body: formData,
      headers
    });
  } catch (e) {
    throw new Error((e && e.message) || "Network error");
  }
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(summarizeNonJsonErrorBody(text, res.status));
      }
      throw new Error("Invalid JSON from server.");
    }
  }
  if (!res.ok) {
    throw new Error(messageFromErrorPayload(data, text, res.status));
  }
  return data;
}

export async function downloadAttachment(path) {
  const token = getToken();
  const headers = { ...tenantHeaders() };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { headers });
  } catch (e) {
    throw new Error((e && e.message) || "Network error");
  }
  if (!res.ok) {
    const text = await res.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(summarizeNonJsonErrorBody(text, res.status));
      }
    }
    throw new Error(messageFromErrorPayload(data, text, res.status));
  }
  const blob = await res.blob();
  const dispo = res.headers.get("Content-Disposition") || "";
  let filename = "download";
  const star = /filename\*=UTF-8''([^;\s]+)/i.exec(dispo);
  const plain = /filename="([^"]+)"/i.exec(dispo);
  if (star?.[1]) {
    try {
      filename = decodeURIComponent(star[1]);
    } catch {
      filename = star[1];
    }
  } else if (plain?.[1]) {
    filename = plain[1];
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
