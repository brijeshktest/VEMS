export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://ec2-13-233-164-155.ap-south-1.compute.amazonaws.com:4000";

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

export async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error || "Request failed";
    throw new Error(message);
  }
  return data;
}

/** multipart/form-data; do not set Content-Type (browser sets boundary). */
export async function apiFetchForm(path, formData, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    method: options.method || "POST",
    body: formData,
    headers
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error || "Request failed";
    throw new Error(message);
  }
  return data;
}

export async function downloadAttachment(path) {
  const token = getToken();
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Download failed");
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
