import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./helpers/auth";
import { requireOwner, requireMember } from "./helpers/access";
import { randomToken } from "./helpers/token";

const roleValidator = v.union(v.literal("editor"), v.literal("viewer"));

/**
 * Invite a user by email. If they already have an account they are added as a
 * member immediately; otherwise a single-use invite link bound to that email is
 * returned for sharing manually. Owner only.
 */
export const inviteByEmail = mutation({
  args: {
    wishlistId: v.id("wishlists"),
    email: v.string(),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const { user, list } = await requireOwner(ctx, args.wishlistId);
    const email = args.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Invalid email address");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing && existing._id !== user._id) {
      const already = await ctx.db
        .query("wishlistMembers")
        .withIndex("by_wishlist_user", (q) =>
          q.eq("wishlistId", list._id).eq("userId", existing._id),
        )
        .first();
      if (!already) {
        await ctx.db.insert("wishlistMembers", {
          wishlistId: list._id,
          userId: existing._id,
          role: args.role,
        });
      }
      return { kind: "added" as const, token: null };
    }

    const token = randomToken();
    await ctx.db.insert("wishlistInvites", {
      wishlistId: list._id,
      token,
      role: args.role,
      email,
      createdById: user._id,
    });
    return { kind: "invited" as const, token };
  },
});

/** Create a shareable single-use invite link for any user. Owner only. */
export const createInviteLink = mutation({
  args: { wishlistId: v.id("wishlists"), role: roleValidator },
  handler: async (ctx, args) => {
    const { user, list } = await requireOwner(ctx, args.wishlistId);
    const token = randomToken();
    await ctx.db.insert("wishlistInvites", {
      wishlistId: list._id,
      token,
      role: args.role,
      createdById: user._id,
    });
    return { token };
  },
});

/** Accept an invite by token, creating membership and burning the token. */
export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const invite = await ctx.db
      .query("wishlistInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!invite) throw new Error("Invite not found or already used");
    if (invite.usedAt) throw new Error("Invite has already been used");

    if (invite.email && (user.email?.toLowerCase() ?? "") !== invite.email.toLowerCase()) {
      throw new Error("This invite was issued to a different email address");
    }

    const list = await ctx.db.get(invite.wishlistId);
    if (!list) throw new Error("Wishlist not found");

    if (list.ownerId !== user._id) {
      const already = await ctx.db
        .query("wishlistMembers")
        .withIndex("by_wishlist_user", (q) =>
          q.eq("wishlistId", invite.wishlistId).eq("userId", user._id),
        )
        .first();
      if (!already) {
        await ctx.db.insert("wishlistMembers", {
          wishlistId: invite.wishlistId,
          userId: user._id,
          role: invite.role,
        });
      }
    }

    await ctx.db.patch(invite._id, { usedAt: Date.now() });
    return { listId: invite.wishlistId, role: invite.role };
  },
});

export const listInvites = query({
  args: { wishlistId: v.id("wishlists") },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.wishlistId);
    const invites = await ctx.db
      .query("wishlistInvites")
      .withIndex("by_wishlistId", (q) => q.eq("wishlistId", args.wishlistId))
      .collect();
    return invites.map((inv) => ({
      token: inv.token,
      role: inv.role,
      email: inv.email ?? null,
      createdAt: inv._creationTime,
      used: !!inv.usedAt,
    }));
  },
});

export const revokeInvite = mutation({
  args: { wishlistId: v.id("wishlists"), token: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.wishlistId);
    const invite = await ctx.db
      .query("wishlistInvites")
      .withIndex("by_wishlistId", (q) => q.eq("wishlistId", args.wishlistId))
      .filter((q) => q.eq(q.field("token"), args.token))
      .first();
    if (invite) await ctx.db.delete(invite._id);
  },
});
