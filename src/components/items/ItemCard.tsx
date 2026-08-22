"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { formatPrice } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useOfflineGuard } from "@/lib/useOffline";
import { ItemForm } from "./ItemForm";

interface Item {
  id: string;
  name: string;
  url: string | null;
  priceMinor: number | null;
  currency: string;
  image: string | null;
  notes: string | null;
  rank: number | null;
  purchased: boolean;
  purchasedBy?: { name: string; email?: string | null; note?: string | null } | null;
}

export function ItemCard({
  item,
  listId,
  canEdit,
  position,
  total,
  showPurchased,
}: {
  item: Item;
  listId: string;
  canEdit: boolean;
  position: number;
  total: number;
  showPurchased: boolean;
}) {
  const toast = useToast();
  const { guard } = useOfflineGuard();
  const toggle = useMutation(api.items.togglePurchased);
  const remove = useMutation(api.items.deleteItem);
  const moveItem = useMutation(api.items.moveItem);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onToggle() {
    if (!guard()) return;
    setBusy(true);
    try {
      await toggle({ itemId: item.id as any, purchased: !item.purchased });
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
      await remove({ itemId: item.id as any });
      toast("Item deleted", "success");
    } catch (err: any) {
      toast(err?.message ?? "Failed to delete", "error");
      setBusy(false);
    } finally {
      setConfirmDelete(false);
    }
  }

  async function onMove(dir: "up" | "down") {
    if (!guard()) return;
    try {
      await moveItem({ itemId: item.id as any, toIndex: dir === "up" ? position - 1 : position + 1 });
    } catch (err: any) {
      toast(err?.message ?? "Could not reorder", "error");
    }
  }

  if (editing) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <ItemForm
          listId={listId}
          canEdit={canEdit}
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
    );
  }

  return (
    <div
      className={`flex gap-3 rounded-2xl border bg-white p-3 shadow-sm ${
        item.purchased ? "border-slate-200 opacity-60" : "border-slate-200"
      }`}
    >
      {item.image && (
        <Link
          href={`/lists/${listId}/items/${item.id}`}
          title="Open this item for details and options"
          className="shrink-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image}
            alt=""
            className="h-16 w-16 rounded-lg border border-slate-100 object-cover"
          />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-500">
              #{position + 1}
            </span>
            <Link
              href={`/lists/${listId}/items/${item.id}`}
              title="Open this item for details and options"
              className={`truncate font-medium ${
                item.purchased ? "text-slate-400 line-through" : "text-slate-900"
              }`}
            >
              {item.name}
            </Link>
          </div>
          {canEdit && (
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                className="!px-1.5 !py-0.5 text-xs"
                title="Move this item up"
                disabled={position === 0}
                onClick={() => onMove("up")}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                className="!px-1.5 !py-0.5 text-xs"
                title="Move this item down"
                disabled={position === total - 1}
                onClick={() => onMove("down")}
              >
                ↓
              </Button>
            </div>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-sm">
          {item.priceMinor != null && (
            <span className="font-medium text-slate-700">
              {formatPrice(item.priceMinor, item.currency)}
            </span>
          )}
          {item.url && (
            <span className="truncate text-xs text-slate-400">{item.url}</span>
          )}
        </div>
        {item.notes && (
          <p className="mt-1 line-clamp-1 text-xs text-slate-500">{item.notes}</p>
        )}
        {showPurchased && item.purchased && item.purchasedBy && (
          <p className="mt-1 text-xs font-medium text-emerald-700">
            Bought by {item.purchasedBy.name}
            {item.purchasedBy.note ? ` — "${item.purchasedBy.note}"` : ""}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {showPurchased && (
            <Button
              variant={item.purchased ? "secondary" : "primary"}
              className="!px-2.5 !py-1 text-xs"
              title={
                item.purchased
                  ? "Click to mark this item as not bought yet"
                  : "Click to mark this item as bought"
              }
              onClick={onToggle}
              loading={busy}
            >
              {item.purchased ? "Unpurchase" : "Purchased"}
            </Button>
          )}
          {canEdit && (
            <>
              <Button
                variant="secondary"
                className="!px-2.5 !py-1 text-xs"
                title="Edit this item's details"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                className="!px-2.5 !py-1 text-xs text-rose-600"
                title="Delete this item"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            </>
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
    </div>
  );
}
