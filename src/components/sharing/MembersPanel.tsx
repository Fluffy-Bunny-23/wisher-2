"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useOfflineGuard } from "@/lib/useOffline";
import { useAuth } from "@/components/auth/AuthProvider";

export function MembersPanel({
  listId,
  isOwner,
}: {
  listId: string;
  isOwner: boolean;
}) {
  const toast = useToast();
  const { guard } = useOfflineGuard();
  const { authed } = useAuth();
  // Route params arrive as plain strings; Convex validators want branded ids.
  const wid = listId as Id<"wishlists">;
  const members = useQuery(api.wishlistMembers.listMembers, authed ? { wishlistId: wid } : "skip");
  const invites = useQuery(api.wishlistInvites.listInvites, authed ? { wishlistId: wid } : "skip");

  const inviteByEmail = useMutation(api.wishlistInvites.inviteByEmail);
  const createLink = useMutation(api.wishlistInvites.createInviteLink);
  const updateRole = useMutation(api.wishlistMembers.updateMemberRole);
  const removeMember = useMutation(api.wishlistMembers.removeMember);
  const revokeInvite = useMutation(api.wishlistInvites.revokeInvite);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [busy, setBusy] = useState(false);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!guard()) return;
    setBusy(true);
    try {
      const res = await inviteByEmail({ wishlistId: wid, email, role });
      if (res.kind === "added") {
        toast(`${email} added as ${role}`, "success");
      } else if (res.token) {
        await navigator.clipboard?.writeText(
          `${window.location.origin}/invite/${res.token}`,
        );
        toast(`Invite link for ${email} copied to clipboard`, "success");
      }
      setEmail("");
    } catch (err: any) {
      toast(err?.message ?? "Invite failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onCopyLink() {
    if (!guard()) return;
    setBusy(true);
    try {
      const { token } = await createLink({ wishlistId: wid, role });
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
      toast("Invite link copied", "success");
    } catch (err: any) {
      toast(err?.message ?? "Failed to create invite link", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(
    memberId: Id<"users">,
    newRole: "editor" | "viewer",
  ) {
    if (!guard()) return;
    setPendingMemberId(memberId);
    try {
      await updateRole({
        wishlistId: wid,
        memberId,
        role: newRole,
      });
      toast("Role updated", "success");
    } catch (err: any) {
      toast(err?.message ?? "Failed to update role", "error");
    } finally {
      setPendingMemberId(null);
    }
  }

  async function handleRemove(memberId: Id<"users">) {
    if (!guard()) return;
    setPendingMemberId(memberId);
    try {
      await removeMember({ wishlistId: wid, memberId });
      toast("Member removed", "success");
    } catch (err: any) {
      toast(err?.message ?? "Failed to remove member", "error");
    } finally {
      setPendingMemberId(null);
    }
  }

  async function handleRevoke(token: string) {
    if (!guard()) return;
    setPendingInviteToken(token);
    try {
      await revokeInvite({ wishlistId: wid, token });
      toast("Invite revoked", "success");
    } catch (err: any) {
      toast(err?.message ?? "Failed to revoke invite", "error");
    } finally {
      setPendingInviteToken(null);
    }
  }

  if (!members || !invites) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 font-semibold text-slate-900">Share &amp; invite</h3>

      {isOwner && (
        <form onSubmit={onInvite} className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Email" htmlFor="invite-email">
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
            />
          </Field>
          <Field label="Role" htmlFor="invite-role">
            <Select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </Select>
          </Field>
          <Button type="submit" loading={busy} disabled={!email.trim()}>
            Invite
          </Button>
        </form>
      )}

      {isOwner && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">Invite link role:</span>
          <Select
            className="!w-auto"
            value={role}
            onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </Select>
          <Button variant="secondary" onClick={onCopyLink} loading={busy}>
            Copy invite link
          </Button>
        </div>
      )}

      <div className="mb-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Members
        </h4>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{m.name}</p>
                  <p className="truncate text-xs text-slate-400">{m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {m.role === "owner" ? (
                  <span className="text-xs font-medium text-slate-500">Owner</span>
                ) : isOwner ? (
                  <>
                    <Select
                      className="!w-auto !py-1 text-xs"
                      value={m.role}
                      disabled={pendingMemberId === m.id}
                      onChange={(e) =>
                        handleRoleChange(m.id, e.target.value as "editor" | "viewer")
                      }
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </Select>
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1 text-xs text-rose-600"
                      loading={pendingMemberId === m.id}
                      disabled={pendingMemberId === m.id}
                      onClick={() => handleRemove(m.id)}
                    >
                      Remove
                    </Button>
                  </>
                ) : (
                  <span className="text-xs capitalize text-slate-500">{m.role}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {isOwner && invites.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Pending invites
          </h4>
          <ul className="divide-y divide-slate-100">
            {invites.map((inv) => (
              <li key={inv.token} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate text-slate-700">
                  {inv.email ?? "Anyone with link"}
                  <span className="ml-1 capitalize text-slate-400">({inv.role})</span>
                  {inv.used && <span className="ml-1 text-slate-400">used</span>}
                </span>
                <Button
                  variant="ghost"
                  className="!px-2 !py-1 text-xs text-rose-600"
                  loading={pendingInviteToken === inv.token}
                  disabled={pendingInviteToken === inv.token}
                  onClick={() => handleRevoke(inv.token)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
