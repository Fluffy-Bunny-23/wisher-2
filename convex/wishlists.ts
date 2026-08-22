import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./helpers/auth";
import { requireOwner, getAccess, requireMember } from "./helpers/access";

async function ownerSummary(ctx: QueryCtx, ownerId: Id<"users">) {
  const owner = await ctx.db.get(ownerId);
  return {
    name: owner?.name ?? "Unknown",
    email: owner?.email ?? "",
  };
}

async function listCounts(ctx: QueryCtx, wishlistId: Id<"wishlists">) {
  const items = await ctx.db
    .query("items")
    .withIndex("by_wishlistId", (q) => q.eq("wishlistId", wishlistId))
    .collect();
  return {
    itemCount: items.length,
    purchasedCount: items.filter((i) => i.purchased).length,
  };
}

export const createWishlist = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    eventDate: v.optional(v.number()),
    ordered: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("Title is required");
    const id = await ctx.db.insert("wishlists", {
      ownerId: user._id,
      title,
      description: args.description?.trim() || undefined,
      eventDate: args.eventDate,
      ordered: args.ordered ?? true,
    });
    return id;
  },
});

export const getWishlists = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);

    const owned = await ctx.db
      .query("wishlists")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .collect();

    const memberships = await ctx.db
      .query("wishlistMembers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const memberLists = await Promise.all(
      memberships.map(async (m) => {
        const list = await ctx.db.get(m.wishlistId);
        return list ? { list, role: m.role } : null;
      }),
    );

    const ownedWithRole = owned.map((l) => ({ list: l, role: "owner" as const }));

    const all = [...ownedWithRole, ...memberLists.filter(Boolean)].filter(
      (entry, i, arr) =>
        arr.findIndex((e) => e!.list._id === entry!.list._id) === i,
    );

    return Promise.all(
      all.map(async (entry) => {
        const list = entry!.list;
        const owner = await ownerSummary(ctx, list.ownerId);
        const counts = await listCounts(ctx, list._id);
        return {
          id: list._id,
          title: list.title,
          description: list.description ?? "",
          eventDate: list.eventDate ?? null,
          ordered: list.ordered,
          ownerName: owner.name,
          ownerEmail: owner.email,
          role: entry!.role,
          isOwner: list.ownerId === user._id,
          createdTime: list._creationTime,
          ...counts,
        };
      }),
    );
  },
});

export const getWishlist = query({
  args: { listId: v.id("wishlists") },
  handler: async (ctx, args) => {
    let access;
    try {
      access = await requireMember(ctx, args.listId);
    } catch {
      return null;
    }
    const owner = await ownerSummary(ctx, access.list.ownerId);
    const counts = await listCounts(ctx, access.list._id);
    return {
      id: access.list._id,
      title: access.list.title,
      description: access.list.description ?? "",
      eventDate: access.list.eventDate ?? null,
      ordered: access.list.ordered,
      ownerName: owner.name,
      ownerEmail: owner.email,
      role: access.role,
      isOwner: access.role === "owner",
      createdTime: access.list._creationTime,
      ...counts,
    };
  },
});

export const editWishlist = mutation({
  args: {
    listId: v.id("wishlists"),
    title: v.string(),
    description: v.optional(v.string()),
    eventDate: v.optional(v.number()),
    ordered: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { list, role } = await getAccess(ctx, args.listId);
    if (role !== "owner" && role !== "editor") {
      throw new Error("Editor or owner role required");
    }
    const title = args.title.trim();
    if (!title) throw new Error("Title is required");
    await ctx.db.patch(list._id, {
      title,
      description: args.description?.trim() || undefined,
      eventDate: args.eventDate,
      ordered: args.ordered ?? list.ordered,
    });
  },
});

export const deleteWishlist = mutation({
  args: { listId: v.id("wishlists") },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.listId);
    const items = await ctx.db
      .query("items")
      .withIndex("by_wishlistId", (q) => q.eq("wishlistId", args.listId))
      .collect();
    for (const item of items) await ctx.db.delete(item._id);
    const members = await ctx.db
      .query("wishlistMembers")
      .withIndex("by_wishlistId", (q) => q.eq("wishlistId", args.listId))
      .collect();
    for (const m of members) await ctx.db.delete(m._id);
    const invites = await ctx.db
      .query("wishlistInvites")
      .withIndex("by_wishlistId", (q) => q.eq("wishlistId", args.listId))
      .collect();
    for (const inv of invites) await ctx.db.delete(inv._id);
    await ctx.db.delete(args.listId);
  },
});

/**
 * Public read: summary of a shared list, given a valid invite token.
 * No sign-in required.
 */
export const getPublicList = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("wishlistInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!invite) return null;
    const list = await ctx.db.get(invite.wishlistId);
    if (!list) return null;
    const owner = await ownerSummary(ctx, list.ownerId);
    return {
      id: list._id,
      title: list.title,
      description: list.description ?? "",
      eventDate: list.eventDate ?? null,
      ordered: list.ordered,
      ownerName: owner.name,
      role: invite.role,
      token: invite.token,
    };
  },
});

/**
 * Public read: summaries for several lists given their invite tokens (used by
 * the visitor dashboard to show recently-viewed lists from a cookie). No sign-in.
 */
export const getPublicListsByTokens = query({
  args: { tokens: v.array(v.string()) },
  handler: async (ctx, args) => {
    const seen = new Set<string>();
    const result = [];
    for (const token of args.tokens) {
      if (!token || seen.has(token)) continue;
      seen.add(token);
      const invite = await ctx.db
        .query("wishlistInvites")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();
      if (!invite) continue;
      const list = await ctx.db.get(invite.wishlistId);
      if (!list) continue;
      const owner = await ownerSummary(ctx, list.ownerId);
      result.push({
        id: list._id,
        token,
        title: list.title,
        description: list.description ?? "",
        eventDate: list.eventDate ?? null,
        ordered: list.ordered,
        ownerName: owner.name,
      });
    }
    return result;
  },
});
