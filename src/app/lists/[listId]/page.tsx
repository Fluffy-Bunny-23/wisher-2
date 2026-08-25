"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useOfflineGuard } from "@/lib/useOffline";
import { ItemCard } from "@/components/items/ItemCard";
import { ItemForm } from "@/components/items/ItemForm";
import { ShareDialog } from "@/components/sharing/ShareDialog";
import { ImportDialog } from "@/components/import/ImportDialog";
import { downloadJson } from "@/lib/export";
import { sortItems, filterItems, type SortBy, type PriorityFilter } from "@/lib/sort";

function toDateInput(ts: number | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ListPage() {
  const params = useParams<{ listId: string }>();
  const router = useRouter();
  const toast = useToast();
  const { guard } = useOfflineGuard();
  const listId = params.listId as any;

  const { authed } = useAuth();
  const convex = useConvex();
  const list = useQuery(api.wishlists.getWishlist, authed ? { listId } : "skip");
  const items = useQuery(api.items.listItems, authed ? { wishlistId: listId } : "skip");
  const deleteList = useMutation(api.wishlists.deleteWishlist);
  const editWishlist = useMutation(api.wishlists.editWishlist);
  const leave = useMutation(api.wishlistMembers.leaveList);

  const [sortBy, setSortBy] = useState<SortBy>("custom");
  const [purchaseFilter, setPurchaseFilter] = useState<"all" | "purchased" | "unpurchased">("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDate, setEditDate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [visitorMode, setVisitorMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loading = list === undefined || items === undefined;

  const canEdit = list?.role === "owner" || list?.role === "editor";
  const isOwner = list?.role === "owner";
  const showPurchased = !isOwner || visitorMode;

  const processed = useMemo(() => {
    if (!items) return [];
    const filtered = filterItems(items, { purchased: purchaseFilter, priority: priorityFilter });
    return sortItems(filtered, sortBy);
  }, [items, sortBy, purchaseFilter, priorityFilter]);

  const purchasedCount = items?.filter((i: NonNullable<typeof items>[number]) => i.purchased).length ?? 0;

  async function onExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await convex.query(api.export.exportList, { listId });
      if (!data) return;
      downloadJson(data, `wisher-${list?.title ?? "list"}.json`);
      toast("Exported", "success");
    } catch (err: any) {
      toast(err?.message ?? "Failed to export", "error");
    } finally {
      setExporting(false);
    }
  }

  async function onDelete() {
    if (!guard()) return;
    setBusy(true);
    try {
      await deleteList({ listId });
      toast("Wishlist deleted", "success");
      router.push("/dashboard");
    } catch (err: any) {
      toast(err?.message ?? "Failed to delete", "error");
      setBusy(false);
    } finally {
      setConfirmDelete(false);
    }
  }

  async function onLeave() {
    if (!guard()) return;
    setBusy(true);
    try {
      await leave({ wishlistId: listId });
      toast("Left the list", "success");
      router.push("/dashboard");
    } catch (err: any) {
      toast(err?.message ?? "Failed to leave", "error");
      setBusy(false);
    }
  }

  function openEdit() {
    setEditTitle(list!.title);
    setEditDesc(list!.description ?? "");
    setEditDate(toDateInput(list!.eventDate));
    setShowEdit(true);
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTitle.trim()) {
      toast("Title is required", "error");
      return;
    }
    if (!guard()) return;
    setBusy(true);
    const eventDate = editDate ? new Date(`${editDate}T00:00:00`).getTime() : undefined;
    try {
      await editWishlist({ listId, title: editTitle, description: editDesc, eventDate });
      toast("Wishlist updated", "success");
      setShowEdit(false);
    } catch (err: any) {
      toast(err?.message ?? "Failed to update", "error");
    } finally {
      setBusy(false);
    }
  }

  const listMissing = list === null;
  useEffect(() => {
    if (listMissing) router.replace("/dashboard");
  }, [listMissing, router]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
        </div>
      </AppShell>
    );
  }

  if (list === null) {
    return (
      <AppShell>
        <div className="py-20 text-center text-sm text-slate-500">Redirecting to your lists…</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to lists
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{list!.title}</h1>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium capitalize text-indigo-700">
              {list!.role}
            </span>
          </div>
          {list!.description && <p className="mt-1 text-sm text-slate-500">{list!.description}</p>}
          <p className="mt-1 text-xs text-slate-400">Owned by {list!.ownerName}</p>
          {list!.eventDate && (
            <p className="mt-1 text-xs text-slate-400">
              Event date: {new Date(list!.eventDate).toLocaleDateString()}
            </p>
          )}
          {showPurchased && (
            <p className="mt-2 text-sm font-medium text-slate-700">
              {purchasedCount} of {items!.length} purchased
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button onClick={() => setShowAdd((s) => !s)}>
              {showAdd ? "Close" : "Add item"}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowShare(true)}>
            Share
          </Button>
          {canEdit && (
            <Button variant="secondary" onClick={onExport} loading={exporting}>
              Export
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            Import
          </Button>
          {canEdit && (
            <Button variant="secondary" onClick={openEdit}>
              Edit list
            </Button>
          )}
          {isOwner && (
            <label
              title="See the list the way a visitor does, including what's been bought"
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={visitorMode}
                onChange={(e) => setVisitorMode(e.target.checked)}
              />
              Visitor mode
            </label>
          )}
          {isOwner && (
            <Button
              variant="ghost"
              className="text-rose-600"
              title="Delete this wishlist permanently"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          )}
          {!isOwner && (
            <Button variant="secondary" onClick={onLeave} loading={busy}>
              Leave list
            </Button>
          )}
        </div>
      </div>

      {showAdd && canEdit && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <ItemForm listId={listId} canEdit onDone={() => setShowAdd(false)} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {showEdit && (
        <form
          onSubmit={onSaveEdit}
          className="mt-4 flex max-w-lg flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Title</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Description</span>
            <textarea
              rows={3}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Event date (optional)</span>
            <input
              type="date"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
          </label>
          <div className="flex gap-3">
            <Button type="submit" loading={busy}>
              Save
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowEdit(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="mt-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Sort
            <Select
              className="!w-auto"
              value={sortBy}
              title="Choose how to order the items. Resets to Custom on reload."
              onChange={(e) => setSortBy(e.target.value as SortBy)}
            >
              <option value="priority">Priority</option>
              <option value="custom">Custom (manual)</option>
              <option value="created">Newest</option>
              <option value="price">Price</option>
            </Select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Priority
            <Select
              className="!w-auto"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
            >
              <option value="all">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </label>
          {showPurchased && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Status
              <Select
                className="!w-auto"
                value={purchaseFilter}
                onChange={(e) => setPurchaseFilter(e.target.value as any)}
              >
                <option value="all">All</option>
                <option value="unpurchased">Unpurchased</option>
                <option value="purchased">Purchased</option>
              </Select>
            </label>
          )}
        </div>

        {items!.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <div className="mb-3 text-4xl">🛍️</div>
            <h2 className="text-lg font-semibold text-slate-800">No items yet</h2>
            <p className="mb-4 max-w-sm text-sm text-slate-500">
              Add your first item to this wishlist.
            </p>
            {canEdit && <Button onClick={() => setShowAdd(true)}>Add an item</Button>}
          </div>
        ) : processed.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">No items match the current filters.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {processed.map((item, idx) => (
              <li key={item.id}>
                <ItemCard
                  item={item}
                  listId={listId}
                  canEdit={canEdit}
                  position={idx}
                  total={processed.length}
                  showPurchased={showPurchased}
                  canReorder={sortBy === "custom" && purchaseFilter === "all" && priorityFilter === "all"}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {showImport && (
        <ImportDialog
          listId={listId}
          onClose={() => setShowImport(false)}
          onImported={() => setShowImport(false)}
        />
      )}
      {showShare && (
        <ShareDialog listId={listId} isOwner={isOwner} onClose={() => setShowShare(false)} />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this wishlist?"
          message={`This will permanently delete "${list!.title}" and all its items.`}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={onDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </AppShell>
  );
}
