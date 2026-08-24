"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ImportDialog } from "@/components/import/ImportDialog";
import { getVisitedTokens } from "@/lib/visited";

function ListRow({
  href,
  title,
  description,
  ownerName,
  countLabel,
}: {
  href: string;
  title: string;
  description?: string;
  ownerName: string;
  countLabel?: string | null;
}) {
  return (
    <li>
      <Link
        href={href}
        title={`Open ${title}`}
        className="block h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
      >
        <h2 className="truncate font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 truncate text-sm text-slate-500">{description}</p>}
        <div className="mt-3 flex items-end justify-between gap-2">
          {countLabel ? (
            <span className="text-sm font-medium text-emerald-700">{countLabel}</span>
          ) : (
            <span />
          )}
          <span className="truncate text-xs text-slate-400">{ownerName}</span>
        </div>
      </Link>
    </li>
  );
}

function SignedInDashboard() {
  const lists = useQuery(api.wishlists.getWishlists);
  const [showImport, setShowImport] = useState(false);
  const loading = lists === undefined;

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Your wishlists</h1>
          <p className="text-sm text-slate-500">Owned and shared with you</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" title="Import wishlists from a JSON file" onClick={() => setShowImport(true)}>
            Import
          </Button>
          <Link href="/lists/new">
            <Button>New list</Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
        </div>
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <div className="mb-3 text-4xl">🎁</div>
          <h2 className="text-lg font-semibold text-slate-800">No wishlists yet</h2>
          <p className="mb-4 max-w-sm text-sm text-slate-500">
            Create your first wishlist to start adding items and sharing with friends.
          </p>
          <Link href="/lists/new">
            <Button>Create a wishlist</Button>
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list: (typeof lists)[number]) => {
            const showCount =
              list.role !== "owner" ||
              (list.eventDate != null && list.eventDate <= Date.now());
            return (
              <ListRow
                key={list.id}
                href={`/lists/${list.id}`}
                title={list.title}
                description={list.description}
                ownerName={list.isOwner ? `${list.ownerName} (you)` : list.ownerName}
                countLabel={showCount ? `${list.purchasedCount} of ${list.itemCount} bought` : null}
              />
            );
          })}
        </ul>
      )}

      {showImport && (
        <ImportDialog onClose={() => setShowImport(false)} onImported={() => setShowImport(false)} />
      )}
    </AppShell>
  );
}

function GuestDashboard() {
  const [tokens, setTokens] = useState<string[]>(() => getVisitedTokens());
  useEffect(() => {
    // The visited cookie only changes in other tabs/documents, so re-syncing
    // on focus and visibility changes covers it without polling forever.
    const sync = () => setTokens(getVisitedTokens());
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  const visited = useQuery(
    api.wishlists.getPublicListsByTokens,
    tokens.length > 0 ? { tokens } : "skip",
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              W
            </span>
            Wisher
          </span>
          <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900">Lists you&apos;ve visited</h1>
        <p className="mb-6 text-sm text-slate-500">
          Wishlists you&apos;ve opened from a shared link.
        </p>

        {visited === undefined ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
          </div>
        ) : visited.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <p className="text-sm text-slate-500">
              You haven&apos;t opened any shared wishlists yet.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visited.map((list: (typeof visited)[number]) => (
              <ListRow
                key={list.token}
                href={`/invite/${list.token}`}
                title={list.title}
                description={list.description}
                ownerName={list.ownerName}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  const { authed, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      </div>
    );
  }

  return authed ? <SignedInDashboard /> : <GuestDashboard />;
}
