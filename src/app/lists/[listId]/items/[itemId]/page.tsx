"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useOfflineGuard } from "@/lib/useOffline";
import { ItemForm } from "@/components/items/ItemForm";
import { formatPrice, formatDate } from "@/lib/format";

export default function ItemDetailPage() {
  const params = useParams<{ listId: string; itemId: string }>();
  const router = useRouter();
  const toast = useToast();
  const { guard } = useOfflineGuard();
  const { listId, itemId } = params as any;

  const { authed } = useAuth();
  const item = useQuery(api.items.getItem, authed ? { itemId } : "skip");
  const list = useQuery(api.wishlists.getWishlist, authed ? { listId } : "skip");
  const toggle = useMutation(api.items.togglePurchased);
  const remove = useMutation(api.items.deleteItem);

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const missing = item === null || list === null;
  useEffect(() => {
    if (missing) router.replace("/dashboard");
  }, [missing, router]);

  if (item === undefined || list === undefined) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
        </div>
      </AppShell>
    );
  }

  if (item === null || list === null) {
    return (
      <AppShell>
        <div className="py-20 text-center text-sm text-slate-500">
          Redirecting to your lists…
        </div>
      </AppShell>
    );
  }

  const canEdit = list.role === "owner" || list.role === "editor";

  async function onToggle() {
    if (!guard()) return;
    setBusy(true);
    try {
      await toggle({ itemId, purchased: !item!.purchased });
    } catch (err: any) {
      toast(err?.message ?? "Failed to update", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!guard()) return;
    setBusy(true);
    try {
      await remove({ itemId });
      toast("Item deleted", "success");
      router.push(`/lists/${listId}`);
    } catch (err: any) {
      toast(err?.message ?? "Failed to delete", "error");
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <Link
        href={`/lists/${listId}`}
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to {list.title}
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
        {item.image && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.image}
            alt={item.name}
            className="aspect-[4/3] w-full rounded-2xl border border-slate-200 object-cover"
          />
        )}

        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1
                className={`text-2xl font-bold ${item.purchased ? "text-slate-400 line-through" : "text-slate-900"}`}
              >
                {item.name}
              </h1>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
              {item.priceMinor != null
                ? formatPrice(item.priceMinor, item.currency)
                : "—"}
            </span>
          </div>

          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block break-all text-sm text-indigo-600 hover:underline"
            >
              {item.url}
            </a>
          )}

          {item.notes && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{item.notes}</p>
          )}

          <p className="mt-3 text-xs text-slate-400">
            Added {formatDate(item.createdTime)} · {item.purchased ? "Purchased" : "Not purchased"}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={onToggle} loading={busy} variant={item.purchased ? "secondary" : "primary"}>
              {item.purchased ? "Mark as unpurchased" : "Mark as purchased"}
            </Button>
            {canEdit && (
              <Button variant="secondary" onClick={() => setEditing((s) => !s)}>
                Edit
              </Button>
            )}
            {canEdit && (
              <Button
                variant="ghost"
                className="text-rose-600"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}
          </div>

          {editing && canEdit && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <ItemForm
                listId={listId}
                canEdit
                initial={{
                  id: item.id,
                  name: item.name,
                  url: item.url ?? "",
                  priceMinor: item.priceMinor ?? undefined,
                  currency: item.currency,
                  notes: item.notes ?? "",
                  image: item.image ?? undefined,
                  priority: (item as any).priority ?? "medium",
                }}
                onDone={() => setEditing(false)}
                onCancel={() => setEditing(false)}
              />
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this item?"
          message={`This will permanently remove "${item.name}" from the wishlist.`}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={onDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </AppShell>
  );
}
