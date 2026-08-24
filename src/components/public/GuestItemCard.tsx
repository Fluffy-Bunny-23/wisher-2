"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/format";
import { useOfflineGuard } from "@/lib/useOffline";

interface PublicItem {
  id: string;
  name: string;
  url: string | null;
  priceMinor: number | null;
  currency: string;
  image: string | null;
  notes: string | null;
  purchased: boolean;
  purchasedBy: { name: string; email?: string | null; note?: string | null } | null;
}

export function GuestItemCard({
  item,
  token,
  inviteEmail,
  onChanged,
}: {
  item: PublicItem;
  token: string;
  /** Set when the invite is bound to an address: claims must come from it. */
  inviteEmail?: string | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { guard } = useOfflineGuard();
  const claim = useMutation(api.items.claimPurchased);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(inviteEmail ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast("Please enter your name", "error");
      return;
    }
    // Fail fast instead of after a round-trip: email-bound invites reject
    // any other address server-side.
    if (inviteEmail && email.trim().toLowerCase() !== inviteEmail.toLowerCase()) {
      toast(`This wishlist only accepts purchases claimed as ${inviteEmail}`, "error");
      return;
    }
    if (!guard()) return;
    setBusy(true);
    try {
      await claim({
        token,
        itemId: item.id as any,
        name,
        email: email.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast("Thanks! You're all set", "success");
      setOpen(false);
      setName("");
      setEmail("");
      setNote("");
      onChanged();
    } catch (err: any) {
      toast(err?.message ?? "Could not mark as bought", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`flex gap-3 rounded-2xl border bg-white p-3 shadow-sm ${
        item.purchased ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"
      }`}
    >
      {item.image && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={item.image}
          alt={item.name}
          className="h-16 w-16 shrink-0 rounded-lg border border-slate-100 object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span
            className={`truncate font-medium ${
              item.purchased ? "text-slate-600 line-through" : "text-slate-900"
            }`}
          >
            {item.name}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-sm">
          {item.priceMinor != null && (
            <span className="font-medium text-slate-700">
              {formatPrice(item.priceMinor, item.currency)}
            </span>
          )}
          {item.url && <span className="truncate text-xs text-slate-400">{item.url}</span>}
        </div>
        {item.notes && <p className="mt-1 line-clamp-1 text-xs text-slate-500">{item.notes}</p>}

        {item.purchased ? (
          <p className="mt-2 text-sm font-medium text-emerald-700">
            Bought by {item.purchasedBy?.name ?? "someone"}
            {item.purchasedBy?.note ? ` — "${item.purchasedBy.note}"` : ""}
          </p>
        ) : (
          <div className="mt-2">
            {!open ? (
              <Button
                variant="primary"
                className="!px-3 !py-1.5 text-xs"
                title="Let the gift-giver know you bought this"
                onClick={() => setOpen(true)}
              >
                I bought this
              </Button>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700">
                  Tell us who&apos;s buying {item.name}
                </p>
                <Field label="Your name" htmlFor={`name-${item.id}`}>
                  <Input
                    id={`name-${item.id}`}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Grandma"
                  />
                </Field>
                <Field
                  label={inviteEmail ? `Email (${inviteEmail})` : "Email (optional)"}
                  htmlFor={`email-${item.id}`}
                >
                  <Input
                    id={`email-${item.id}`}
                    type="email"
                    required={Boolean(inviteEmail)}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </Field>
                <Field label="Note (optional)" htmlFor={`note-${item.id}`}>
                  <Textarea
                    id={`note-${item.id}`}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Anything to add?"
                  />
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" loading={busy}>
                    Confirm
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
