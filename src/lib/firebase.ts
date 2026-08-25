import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

const firebaseConfigured = Boolean(firebaseConfig.apiKey);

/**
 * Firebase only initializes in the browser. During server-side rendering we
 * return a stub so pages can be prerendered without a Firebase project.
 * In the browser, if env vars are missing we also return an inert stub so
 * hydration does not throw auth/invalid-api-key and the app can render in
 * guest mode.
 */
function createAuth(): Auth {
  if (typeof window === "undefined") {
    return {} as Auth;
  }
  if (!firebaseConfigured) {
    return {} as Auth;
  }
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}

export const auth: Auth = createAuth();
