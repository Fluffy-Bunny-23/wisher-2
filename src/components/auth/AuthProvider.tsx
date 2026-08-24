"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ConvexProvider, useMutation } from "convex/react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { convex } from "@/lib/convex";
import { api } from "@convex/_generated/api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** True once Convex auth has been attached (setAuth/clearAuth settled). */
  ready: boolean;
  /** True only when authenticated: Convex auth attached AND a Firebase user is present. */
  authed: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  ready: false,
  authed: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Lives inside ConvexProvider so it can call mutations. Awaits Convex auth
 * setup before signalling readiness, so protected queries never fire before a
 * token is attached.
 */
function AuthBridge({
  children,
  onReady,
}: {
  children: ReactNode;
  onReady: () => void;
}) {
  const storeUser = useMutation(api.users.storeUser);
  const readyRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const storeUserRef = useRef(storeUser);
  storeUserRef.current = storeUser;

  // Run exactly once on mount. Using refs keeps this stable so it never
  // re-runs (and never clears Convex auth) on unrelated re-renders.
  useEffect(() => {
    const markReady = () => {
      if (!readyRef.current) {
        readyRef.current = true;
        onReadyRef.current();
      }
    };

    if (typeof (auth as any).onAuthStateChanged !== "function") {
      markReady();
      return;
    }
    let cancelled = false;
    const unsub = onAuthStateChanged(
      auth,
      async (user) => {
        try {
          if (user) {
            convex.setAuth(async ({ forceRefreshToken }) => {
              const cur = auth.currentUser;
              if (!cur) return null;
              return cur.getIdToken(forceRefreshToken);
            });
            await storeUserRef.current();
          } else {
            await convex.clearAuth();
          }
        } catch {
          // still considered "ready"; the app shows the login screen
        }
        if (!cancelled) markReady();
      },
      () => {
        if (!cancelled) markReady();
      },
    );
    return () => {
      cancelled = true;
      unsub();
      void convex.clearAuth();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return children;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseLoading, setFirebaseLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (typeof (auth as any).onAuthStateChanged !== "function") {
      setUser(null);
      setFirebaseLoading(false);
      return;
    }
    let unsub: (() => void) | undefined;
    try {
      unsub = onAuthStateChanged(
        auth,
        (u) => {
          setUser(u);
          setFirebaseLoading(false);
        },
        () => {
          // Firebase auth unavailable: treat as signed out.
          setUser(null);
          setFirebaseLoading(false);
        },
      );
    } catch {
      setUser(null);
      setFirebaseLoading(false);
    }
    return () => unsub?.();
  }, []);

  const loading = firebaseLoading || !authReady;
  const authed = authReady && !!user;

  return (
    <AuthContext.Provider value={{ user, loading, ready: authReady, authed }}>
      <ConvexProvider client={convex}>
        <AuthBridge onReady={() => setAuthReady(true)}>{children}</AuthBridge>
      </ConvexProvider>
    </AuthContext.Provider>
  );
}
