"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";

/**
 * Tracks online/offline state and provides a guard that surfaces a toast when
 * the user attempts a write while offline (instead of silently buffering it).
 */
export function useOfflineGuard() {
  const toast = useToast();
  // Always render the same on server and on first client paint to avoid
  // hydration mismatch; sync to the real navigator state in an effect.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const guard = useCallback(() => {
    if (offline) {
      toast("You're offline — reconnect to save changes", "error");
      return false;
    }
    return true;
  }, [offline, toast]);

  return { offline, guard };
}
