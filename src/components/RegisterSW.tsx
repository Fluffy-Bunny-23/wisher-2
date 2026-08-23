"use client";

import { useEffect } from "react";

function isLocalhost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

export function RegisterSW() {
  useEffect(() => {
    // Never register in dev — avoids console spam and HMR churn.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (isLocalhost(window.location.hostname)) return;
    if (!("serviceWorker" in navigator)) return;
    // Failures are non-fatal (offline, unsupported context, etc.) and
    // intentionally silent — no console.error spam.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
