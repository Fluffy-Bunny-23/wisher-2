import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireEditor, requireMember } from "./helpers/access";
import { priorityValidator } from "./schema";
import { MAX_BASE64 } from "./images";
import { internal } from "./_generated/api";

const itemInput = () => ({
  name: v.string(),
  url: v.optional(v.string()),
  priceMinor: v.optional(v.number()),
  currency: v.optional(v.string()),
  image: v.optional(v.string()),
  notes: v.optional(v.string()),
  rank: v.optional(v.number()),
  priority: v.optional(priorityValidator),
});

const CURRENCY_RE = /^[A-Za-z]{3}$/;

/** Server-side semantic validation shared by addItem/updateItem/import. */
export function validateItemFields(item: {
  priceMinor?: number;
  currency?: string;
  image?: string;
}) {
  if (
    item.priceMinor != null &&
    (!Number.isFinite(item.priceMinor) ||
      !Number.isInteger(item.priceMinor) ||
      item.priceMinor < 0)
  ) {
    throw new Error("Price must be a non-negative integer of minor units");
  }
  if (item.currency && !CURRENCY_RE.test(item.currency)) {
    throw new Error("Currency must be a 3-letter ISO 4217 code");
  }
  if (item.image && item.image.length > MAX_BASE64) {
    throw new Error("Image is too large (max 900KB)");
  }
}

export const listItems = query({
  args: { wishlistId: v.id("wishlists") },
  handler: async (ctx, args) => {
    try {
      await requireMember(ctx, args.wishlistId);
    } catch {
      return [];
    }
    const items = await ctx.db
      .query("items")
      .withIndex("by_wishlistId", (q) => q.eq("wishlistId", args.wishlistId))
      .collect();
    return items.map((item) => ({
      id: item._id,
      wishlistId: item.wishlistId,
      name: item.name,
      url: item.url ?? null,
      priceMinor: item.priceMinor ?? null,
      currency: item.currency,
      image: item.image ?? null,
      notes: item.notes ?? null,
      rank: item.rank ?? null,
      priority: item.priority ?? "medium",
      purchased: item.purchased,
      purchasedBy: item.purchasedBy ?? null,
      createdTime: item._creationTime,
    }));
  },
});

export const getItem = query({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return null;
    try {
      await requireMember(ctx, item.wishlistId);
    } catch {
      return null;
    }
    return {
      id: item._id,
      wishlistId: item.wishlistId,
      name: item.name,
      url: item.url ?? null,
      priceMinor: item.priceMinor ?? null,
      currency: item.currency,
      image: item.image ?? null,
      notes: item.notes ?? null,
      rank: item.rank ?? null,
      priority: item.priority ?? "medium",
      purchased: item.purchased,
      purchasedBy: item.purchasedBy ?? null,
      createdTime: item._creationTime,
    };
  },
});

function scheduleFetchIfNeeded(ctx: any, itemId: string, url?: string, image?: string) {
  if (url && !image) {
    void ctx.scheduler.runAfter(0, internal.images.fetchOgImage, { itemId });
  }
}

export const addItem = mutation({
  args: { wishlistId: v.id("wishlists"), item: v.object(itemInput()) },
  handler: async (ctx, args) => {
    const access = await requireEditor(ctx, args.wishlistId);
    const item = args.item;
    const name = item.name.trim();
    if (!name) throw new Error("Name is required");
    validateItemFields(item);
    // Collision-safe rank assignment: derive nextRank from the current max rank
    // over the indexed by_wishlistId query within this transactional mutation.
    // Convex mutations run as serializable transactions with OCC — if two
    // concurrent addItem calls read the same max rank, the second to commit
    // retries and recomputes, so no two inserts receive the same rank.
    const siblings = await ctx.db
      .query("items")
      .withIndex("by_wishlistId", (q) => q.eq("wishlistId", access.list._id))
      .collect();
    const nextRank = siblings.reduce((m, s) => Math.max(m, s.rank ?? 0), -1) + 1;
    const id = await ctx.db.insert("items", {
      wishlistId: access.list._id,
      name,
      url: item.url?.trim() || undefined,
      priceMinor: item.priceMinor,
      currency: (item.currency || "USD").toUpperCase(),
      image: item.image || undefined,
      notes: item.notes?.trim() || undefined,
      rank: item.rank ?? nextRank,
      priority: item.priority ?? "medium",
      purchased: false,
    });
    scheduleFetchIfNeeded(ctx, id, item.url, item.image);
    return id;
  },
});

export const updateItem = mutation({
  args: { itemId: v.id("items"), item: v.object(itemInput()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.itemId);
    if (!existing) throw new Error("Item not found");
    await requireEditor(ctx, existing.wishlistId);
    const item = args.item;
    const name = item.name.trim();
    if (!name) throw new Error("Name is required");
    validateItemFields(item);

    const urlChanged = existing.url !== (item.url?.trim() || undefined);
    const explicitImage = item.image;
    const resetImage = urlChanged && !explicitImage;

    await ctx.db.patch(existing._id, {
      name,
      url: item.url?.trim() || undefined,
      priceMinor: item.priceMinor,
      currency: item.currency || existing.currency,
      image: resetImage ? undefined : explicitImage || existing.image,
      notes: item.notes?.trim() || undefined,
      rank: item.rank ?? existing.rank,
      priority: item.priority ?? existing.priority,
    });

    if (resetImage) {
      scheduleFetchIfNeeded(ctx, existing._id, item.url, undefined);
    } else if (urlChanged && explicitImage) {
      // explicit image present; no fetch needed
    } else if (!existing.image && item.url && !explicitImage) {
      scheduleFetchIfNeeded(ctx, existing._id, item.url, undefined);
    }
  },
});

export const deleteItem = mutation({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.itemId);
    if (!existing) throw new Error("Item not found");
    await requireEditor(ctx, existing.wishlistId);
    await ctx.db.delete(existing._id);
  },
});

export const togglePurchased = mutation({
  args: { itemId: v.id("items"), purchased: v.boolean() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.itemId);
    if (!existing) throw new Error("Item not found");
    await requireEditor(ctx, existing.wishlistId);
    if (args.purchased) {
      await ctx.db.patch(existing._id, { purchased: true });
    } else {
      await ctx.db.patch(existing._id, { purchased: false, purchasedBy: undefined });
    }
  },
});

/**
 * Guest (no sign-in) "I bought this" claim, gated by a valid invite token for
 * the item's list. This is intentionally additive: a guest can only mark an
 * item as bought and record who they are — they cannot edit or unpurchase.
 */
export const claimPurchased = mutation({
  args: {
    token: v.string(),
    itemId: v.id("items"),
    name: v.string(),
    email: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    const invite = await ctx.db
      .query("wishlistInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!invite || invite.wishlistId !== item.wishlistId) {
      throw new Error("Invalid invite link for this list");
    }
    if (invite.usedAt) {
      throw new Error("Invite has already been used");
    }
    if (invite.email && invite.email.toLowerCase() !== (args.email ?? "").trim().toLowerCase()) {
      throw new Error("This invite was issued to a different email address");
    }

    const name = args.name.trim();
    if (!name) throw new Error("Please enter your name");

    if (item.purchased) {
      throw new Error("This item has already been bought");
    }

    await ctx.db.patch(item._id, {
      purchased: true,
      purchasedBy: {
        name,
        email: args.email?.trim() || undefined,
        note: args.note?.trim() || undefined,
      },
    });
  },
});

/**
 * Public read: list items for a shared list, given a valid invite token.
 * No sign-in required. Reactive — live-updates as editors add items.
 */
export const listPublicItems = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("wishlistInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!invite) return null;
    if (invite.usedAt) return null;
    const list = await ctx.db.get(invite.wishlistId);
    if (!list) return null;
    const items = await ctx.db
      .query("items")
      .withIndex("by_wishlistId", (q) => q.eq("wishlistId", invite.wishlistId))
      .collect();
    return {
      listId: invite.wishlistId,
      items: items.map((item) => ({
        id: item._id,
        name: item.name,
        url: item.url ?? null,
        priceMinor: item.priceMinor ?? null,
        currency: item.currency,
        image: item.image ?? null,
        notes: item.notes ?? null,
        rank: item.rank ?? null,
        priority: item.priority ?? "medium",
        purchased: item.purchased,
        purchasedBy: item.purchasedBy ?? null,
        createdTime: item._creationTime,
      })),
    };
  },
});

export const removeImage = mutation({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.itemId);
    if (!existing) throw new Error("Item not found");
    await requireEditor(ctx, existing.wishlistId);
    await ctx.db.patch(existing._id, { image: undefined });
    if (existing.url) {
      void ctx.scheduler.runAfter(0, internal.images.fetchOgImage, { itemId: existing._id });
    }
  },
});

// ---- internal helpers used by the og:image action ----

export const getById = internalQuery({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.itemId);
  },
});

export const setFetchedImage = internalMutation({
  args: { itemId: v.id("items"), image: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.itemId);
    if (!existing) return;
    // Only store if the user hasn't since set an explicit image.
    if (!existing.image) {
      await ctx.db.patch(existing._id, { image: args.image });
    }
  },
});

/**
 * Reorder an item within an ordered list to a 0-based target index.
 * Owner/editor only. Reassigns ranks across the list.
 */
export const moveItem = mutation({
  args: { itemId: v.id("items"), toIndex: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.itemId);
    if (!existing) throw new Error("Item not found");
    await requireEditor(ctx, existing.wishlistId);

    const items = await ctx.db
      .query("items")
      .withIndex("by_wishlistId", (q) => q.eq("wishlistId", existing.wishlistId))
      .collect();
    const ordered = [...items].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    const fromIndex = ordered.findIndex((i) => i._id === existing._id);
    if (fromIndex < 0) throw new Error("Item not found");
    const toIndex = Math.max(0, Math.min(ordered.length - 1, args.toIndex));

    const reordered = [...ordered];
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, existing);

    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i]._id !== existing._id || reordered[i].rank !== i) {
        await ctx.db.patch(reordered[i]._id, { rank: i });
      }
    }
  },
});
