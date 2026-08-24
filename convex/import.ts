import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./helpers/auth";
import { requireEditor } from "./helpers/access";
import { priorityValidator } from "./schema";
import { validateItemFields } from "./items";
import { internal } from "./_generated/api";

const importItemValidator = {
  name: v.string(),
  url: v.optional(v.string()),
  priceMinor: v.optional(v.number()),
  currency: v.optional(v.string()),
  image: v.optional(v.string()),
  notes: v.optional(v.string()),
  rank: v.optional(v.number()),
  priority: v.optional(priorityValidator),
  purchased: v.optional(v.boolean()),
};

const importListValidator = {
  title: v.string(),
  description: v.optional(v.string()),
  eventDate: v.optional(v.number()),
  ordered: v.optional(v.boolean()),
  items: v.array(v.object(importItemValidator)),
};

export const importLists = mutation({
  args: {
    lists: v.array(v.object(importListValidator)),
    targetListId: v.optional(v.id("wishlists")),
    dedupe: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    if (args.lists.length === 0) return { created: 0, importedItems: 0 };

    let created = 0;
    let importedItems = 0;
    const dedupe = !!args.dedupe;

    const insertInto = async (listId: any, items: typeof args.lists[number]["items"]) => {
      const existingDocs = await ctx.db
        .query("items")
        .withIndex("by_wishlistId", (q) => q.eq("wishlistId", listId))
        .collect();
      let nextRank =
        existingDocs.reduce((m, e) => Math.max(m, e.rank ?? 0), -1) + 1;
      // Dedupe rule: when url is absent dedupe on normalized name alone;
      // when url is present dedupe on name + url (both lower-cased/trimmed).
      const dedupeKey = (name: string, url?: string) => {
        const n = name.trim().toLowerCase();
        const u = url?.trim();
        return u ? `${n}::${u.toLowerCase()}` : n;
      };
      const existingKeys = new Set(
        existingDocs.map((e) => dedupeKey(e.name, e.url)),
      );
      for (const item of items) {
        const name = (item.name ?? "").trim();
        if (!name) continue;
        validateItemFields(item);
        const key = dedupeKey(name, item.url);
        if (dedupe && existingKeys.has(key)) continue;
        existingKeys.add(key);
        const id = await ctx.db.insert("items", {
          wishlistId: listId,
          name,
          url: item.url || undefined,
          priceMinor: item.priceMinor,
          currency: (item.currency || "USD").toUpperCase(),
          image: item.image || undefined,
          notes: item.notes || undefined,
          rank: item.rank ?? nextRank++,
          priority: item.priority ?? "medium",
          purchased: item.purchased ?? false,
        });
        importedItems++;
        if (item.url && !item.image) {
          void ctx.scheduler.runAfter(0, internal.images.fetchOgImage, { itemId: id });
        }
      }
    };

    if (args.targetListId) {
      const access = await requireEditor(ctx, args.targetListId);
      const list = args.lists[0];
      if (list) await insertInto(access.list._id, list.items);
      return { created, importedItems };
    }

    for (const list of args.lists) {
      const title = (list.title ?? "").trim();
      if (!title) continue;
      const listId = await ctx.db.insert("wishlists", {
        ownerId: user._id,
        title,
        description: list.description || undefined,
        eventDate: list.eventDate,
        ordered: list.ordered ?? true,
      });
      created++;
      await insertInto(listId, list.items);
    }

    return { created, importedItems };
  },
});
