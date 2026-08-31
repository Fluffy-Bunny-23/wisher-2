import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBrYt9QTTYlUCvHSg972wZKDAI2VeByYrA",
  authDomain: "wisher-lists.firebaseapp.com",
  projectId: "wisher-lists",
  storageBucket: "wisher-lists.firebasestorage.app",
  messagingSenderId: "1064489993372",
  appId: "1:1064489993372:web:21238cc6ed82bf48c05959",
  measurementId: "G-WKD3PGQ61E",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("profile");
googleProvider.addScope("email");

// Connect to emulator if requested (set NEXT_PUBLIC_USE_EMULATOR=1 and run firebase emulators)
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_USE_EMULATOR === "1") {
  // dynamic import to avoid SSR issues
  import("firebase/firestore").then(({ connectFirestoreEmulator }) => {
    try { connectFirestoreEmulator(db, "localhost", 8080); } catch {}
  });
  import("firebase/auth").then(({ connectAuthEmulator }) => {
    try { connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true }); } catch {}
  });
}
