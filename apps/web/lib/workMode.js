export const WORK_MODE_KEY = "vems_work_mode";

export function getWorkMode() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(WORK_MODE_KEY) || "";
}

export function setWorkMode(mode) {
  if (typeof window === "undefined") return;
  if (mode) {
    localStorage.setItem(WORK_MODE_KEY, mode);
  } else {
    localStorage.removeItem(WORK_MODE_KEY);
  }
}
