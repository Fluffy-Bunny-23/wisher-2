import { query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { requireUser } from "./helpers/auth";
import { requireMember } from "./helpers/access";

async function collectList(ctx: QueryCtx, list: any) {
  const items = await ctx.db
    .query("items")
    .withIndex("by_wishlistId", (q) => q.eq("wishlistId", list._id))
    .collect();
  return {
    title: list.title,
    description: list.description ?? "",
    items: items.map((item: any) => ({
      name: item.name,
      url: item.url ?? "",
      priceMinor: item.priceMinor ?? null,
      currency: item.currency,
      image: item.image ?? "",
      notes: item.notes ?? "",
      rank: item.rank ?? null,
      priority: item.priority ?? "medium",
      purchased: item.purchased,
    })),
  };
}

export const exportList = query({
  args: { listId: v.id("wishlists") },
  handler: async (ctx, args) => {
    let access;
    try {
      access = await requireMember(ctx, args.listId);
    } catch {
      return { schemaVersion: 1, lists: [] };
    }
    return {
      schemaVersion: 1,
      lists: [await collectList(ctx, access.list)],
    };
  },
});

export const exportAll = query({
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
    const shared = (
      await Promise.all(
        memberships.map(async (m) => {
          const list = await ctx.db.get(m.wishlistId);
          return list;
        }),
      )
    ).filter(Boolean);

    const seen = new Set<string>();
    const lists: any[] = [];
    for (const list of [...owned, ...shared]) {
      if (!list || seen.has(list._id)) continue;
      seen.add(list._id);
      lists.push(await collectList(ctx, list));
    }
    return { schemaVersion: 1, lists };
  },
});
