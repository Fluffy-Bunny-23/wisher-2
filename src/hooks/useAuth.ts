"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(!auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        localStorage.setItem("authState", JSON.stringify({ uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL, lastSignIn: new Date().toISOString() }));
      } else {
        localStorage.removeItem("authState");
      }
    });
    return () => unsub();
  }, []);

  return { user, loading };
}
