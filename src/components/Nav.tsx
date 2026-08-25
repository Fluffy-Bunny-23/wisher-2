"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useOfflineGuard } from "@/lib/useOffline";

export function Nav() {
  const { offline } = useOfflineGuard();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 md:px-8">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            W
          </span>
          Wisher
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {offline && (
            <span
              title="You are offline"
              className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800"
            >
              Offline
            </span>
          )}
          <Link href="/dashboard" title="Go to your wishlists" className="text-slate-600 hover:text-slate-900">
            Lists
          </Link>
          <Link href="/settings" title="Edit your profile and account settings" className="text-slate-600 hover:text-slate-900">
            Settings
          </Link>
          <button
            onClick={() => signOut(auth)}
            title="Sign out of your account"
            className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
