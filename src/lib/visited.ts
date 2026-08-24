"use client";

const KEY = "wisher_visited";
const MAX_VISITED = 50;

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
  if (!token || typeof token !== "string") return;
  const trimmed = token.trim();
  if (!trimmed) return;
  const current = getVisitedTokens();
  if (current.includes(trimmed)) return;
  const next = [...current, trimmed].slice(-MAX_VISITED);
  const value = encodeURIComponent(next.join(","));
  // 1 year, path-wide
  document.cookie = `${KEY}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}
