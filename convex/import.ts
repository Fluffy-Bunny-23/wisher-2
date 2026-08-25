import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./helpers/auth";
import { requireEditor } from "./helpers/access";
import { priorityValidator } from "./schema";
import { validateItemFields } from "./items";
import { MAX_BASE64 } from "./images";
import { internal } from "./_generated/api";

const MAX_IMPORT_LISTS = 20;
const MAX_ITEMS_PER_LIST = 200;
const MAX_TOTAL_ITEMS = 500;

const ALLOWED_IMAGE_RE =
  /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

function validateImageFormat(image?: string) {
  if (!image) return;
  if (image.length > MAX_BASE64) {
    throw new Error("Image is too large (max 900KB)");
  }
  if (!ALLOWED_IMAGE_RE.test(image)) {
    throw new Error(
      "Invalid image format: must be a JPEG, PNG, WebP, or GIF data URL",
    );
  }
}

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
    if (args.lists.length > MAX_IMPORT_LISTS) {
      throw new Error(
        `Too many lists: ${args.lists.length} exceeds limit of ${MAX_IMPORT_LISTS}`,
      );
    }
    if (args.targetListId && args.lists.length > 1) {
      throw new Error("targetListId only supports a single list");
    }
    let totalItems = 0;
    for (const list of args.lists) {
      if (list.items.length > MAX_ITEMS_PER_LIST) {
        throw new Error(
          `Too many items in list "${list.title}": ${list.items.length} exceeds limit of ${MAX_ITEMS_PER_LIST}`,
        );
      }
      totalItems += list.items.length;
    }
    if (totalItems > MAX_TOTAL_ITEMS) {
      throw new Error(
        `Too many total items: ${totalItems} exceeds limit of ${MAX_TOTAL_ITEMS}`,
      );
    }

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
        validateImageFormat(item.image);
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
