import type { ReviewEvent } from "./types";
const KEY = "pharma-evidence:review:v1";
export const EMPTY = "[]";
export function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("evidence-review", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("evidence-review", onChange);
  };
}
export function snapshot() {
  try {
    return localStorage.getItem(KEY) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}
export function readEvents(raw: string): ReviewEvent[] {
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a)
      ? a
          .filter(
            (e) =>
              e &&
              typeof e.claimId === "string" &&
              typeof e.sourceVersion === "string" &&
              typeof e.note === "string" &&
              ["reviewed", "reopened", "note"].includes(e.action) &&
              typeof e.at === "string",
          )
          .slice(-500)
      : [];
  } catch {
    return [];
  }
}
export function writeEvents(events: ReviewEvent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(events.slice(-500)));
    window.dispatchEvent(new Event("evidence-review"));
    return true;
  } catch {
    return false;
  }
}
export function download(
  name: string,
  body: string,
  type = "text/csv;charset=utf-8",
) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([body], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
