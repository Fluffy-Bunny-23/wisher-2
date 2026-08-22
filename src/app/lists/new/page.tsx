"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useOfflineGuard } from "@/lib/useOffline";

export default function NewListPage() {
  const router = useRouter();
  const toast = useToast();
  const { guard } = useOfflineGuard();
  const create = useMutation(api.wishlists.createWishlist);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast("Title is required", "error");
      return;
    }
    if (!guard()) return;
    setBusy(true);
    try {
      const eventDateMs = eventDate ? new Date(`${eventDate}T00:00:00`).getTime() : undefined;
      const id = await create({ title, description, eventDate: eventDateMs });
      toast("Wishlist created", "success");
      router.push(`/lists/${id}`);
    } catch (err: any) {
      toast(err?.message ?? "Failed to create wishlist", "error");
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to lists
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-slate-900">New wishlist</h1>
      <form
        onSubmit={onSubmit}
        className="flex max-w-lg flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <Field label="Title" htmlFor="title">
          <Input
            id="title"
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Birthday 2026"
          />
        </Field>
        <Field label="Description (optional)" htmlFor="description">
          <Textarea
            id="description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short note about this list"
          />
        </Field>
        <Field label="Event date (optional)" htmlFor="eventDate">
          <Input id="eventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </Field>
        <div className="flex gap-3">
          <Button type="submit" loading={busy} disabled={!title.trim()}>
            Create
          </Button>
          <Link href="/dashboard">
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </AppShell>
  );
}
