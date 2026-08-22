"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { GuestItemCard } from "@/components/public/GuestItemCard";
import { addVisitedToken } from "@/lib/visited";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user, loading } = useAuth();
  const token = params.token;

  const list = useQuery(api.wishlists.getPublicList, { token });
  const itemsData = useQuery(api.items.listPublicItems, { token });
  const accept = useMutation(api.wishlistInvites.acceptInvite);
  const [joinBusy, setJoinBusy] = useState(false);

  // While still loading auth, wait before showing join controls.
  const ready = !loading;

  // Remember this list for the visitor dashboard (cookie for guests).
  useEffect(() => {
    if (token) addVisitedToken(token);
  }, [token]);

  async function onJoin() {
    setJoinBusy(true);
    try {
      const res = await accept({ token });
      toast("You&apos;ve joined the wishlist", "success");
      router.push(`/lists/${res.listId}`);
    } catch (err: any) {
      toast(err?.message ?? "Could not join", "error");
      setJoinBusy(false);
    }
  }

  if (list === undefined || itemsData === undefined || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      </div>
    );
  }

  if (list === null || itemsData === null) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Invite not found</h1>
          <p className="mt-2 text-sm text-slate-500">
            This link may have been revoked or is invalid.
          </p>
          <Link href="/" className="mt-4 inline-block">
            <Button variant="secondary">Go home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const items = itemsData.items;
  const purchasedCount = items.filter((i) => i.purchased).length;

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
          {user ? (
            <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">
              Go to my lists →
            </Link>
          ) : (
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">{list.title}</h1>
          {list.description && (
            <p className="mt-1 text-slate-500">{list.description}</p>
          )}
          <p className="mt-2 text-sm text-slate-400">
            {list.ownerName}&apos;s wishlist · {purchasedCount} of {items.length} bought
          </p>          {user && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
              <p className="text-sm text-indigo-900">
                You&apos;re signed in. Join this wishlist as {list.role}.
              </p>
              <Button onClick={onJoin} loading={joinBusy}>
                Join as {list.role}
              </Button>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <p className="text-sm text-slate-500">
              No items on this wishlist yet — check back soon!
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <GuestItemCard item={item} token={token} onChanged={() => {}} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
