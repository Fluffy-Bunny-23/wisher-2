"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";

function LoginForm() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const redirect = params.get("redirect") || "/dashboard";

  useEffect(() => {
    if (!loading && user) router.replace(redirect);
  }, [loading, user, router, redirect]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      toast("Signed in", "success");
    } catch (err: any) {
      toast(err?.message ?? "Sign in failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      toast("Signed in with Google", "success");
    } catch (err: any) {
      toast(err?.message ?? "Google sign in failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
            W
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Welcome back</h1>
          <p className="text-sm text-slate-500">Sign in to Wisher</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" loading={busy} disabled={!email || !password}>
            Sign in
          </Button>
          <button
            type="button"
            className="text-left text-xs font-medium text-indigo-600 hover:underline"
            onClick={async () => {
              const target = email.trim() || window.prompt("Enter your email for a password reset:")?.trim() || "";
              if (!target) return;
              try {
                await sendPasswordResetEmail(auth, target);
                toast("Password reset email sent", "success");
              } catch (err: any) {
                toast(err?.message ?? "Could not send reset email", "error");
              }
            }}
          >
            Forgot password?
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <Button variant="secondary" className="w-full" onClick={onGoogle} disabled={busy}>
          Continue with Google
        </Button>

        <p className="mt-6 text-center text-sm text-slate-500">
          No account?{" "}
          <Link href="/signup" className="font-medium text-indigo-600 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
