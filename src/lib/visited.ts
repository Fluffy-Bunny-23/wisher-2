"use client";

const KEY = "wisher_visited";

export function getVisitedTokens(): string[] {
  if (typeof document === "undefined") return [];
  const raw = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${KEY}=`));
  if (!raw) return [];
  try {
    return decodeURIComponent(raw.split("=").slice(1).join("="))
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function addVisitedToken(token: string): void {
  if (typeof document === "undefined") return;
  const current = getVisitedTokens();
  if (current.includes(token)) return;
  const next = [...current, token].slice(-20); // cap at 20
  const value = encodeURIComponent(next.join(","));
  // 1 year, path-wide
  document.cookie = `${KEY}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}
