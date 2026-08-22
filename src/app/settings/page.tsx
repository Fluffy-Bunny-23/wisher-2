"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { sendPasswordResetEmail, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

export default function SettingsPage() {
  const toast = useToast();
  const { authed } = useAuth();
  const profile = useQuery(api.users.getProfile, authed ? undefined : "skip");
  const updateProfile = useMutation(api.users.updateProfile);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) setName(profile.name ?? "");
  }, [profile]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateProfile({ name: name.trim() });
      toast("Profile updated", "success");
    } catch (err: any) {
      toast(err?.message ?? "Failed to update profile", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onResetPassword() {
    if (!auth.currentUser?.email) {
      toast("No email on this account", "error");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, auth.currentUser.email);
      toast("Password reset email sent", "success");
    } catch (err: any) {
      toast(err?.message ?? "Failed to send reset email", "error");
    }
  }

  async function onSignOut() {
    await signOut(auth);
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Settings</h1>

      {!profile ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
        </div>
      ) : (
        <div className="space-y-6">
          <form
            onSubmit={onSave}
            className="flex max-w-lg flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="font-semibold text-slate-900">Profile</h2>
            <div className="flex items-center gap-3">
              <div className="text-sm">
                <p className="font-medium text-slate-800">{name || "You"}</p>
                <p className="text-slate-400">{profile.email}</p>
              </div>
            </div>
            <Field label="Display name" htmlFor="name">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" loading={busy}>
              Save profile
            </Button>
          </form>

          <div className="flex max-w-lg flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-slate-900">Account</h2>
            <Button variant="secondary" onClick={onResetPassword}>
              Send password reset email
            </Button>
            <Button variant="danger" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
