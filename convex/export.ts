import { query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { requireMember } from "./helpers/access";

const MAX_EXPORT_IMAGE_BYTES = 800 * 1024;

async function collectList(ctx: QueryCtx, list: any, includeImages: boolean) {
  const items = await ctx.db
    .query("items")
    .withIndex("by_wishlistId", (q) => q.eq("wishlistId", list._id))
    .collect();
  let imageBytes = 0;
  return {
    title: list.title,
    ...(list.description ? { description: list.description } : {}),
    ...(typeof list.eventDate === "number" ? { eventDate: list.eventDate } : {}),
    ...(typeof list.ordered === "boolean" ? { ordered: list.ordered } : {}),
    items: items.map((item: any) => {
      const out: Record<string, unknown> = {
        name: item.name,
      };
      if (item.url) out.url = item.url;
      if (typeof item.priceMinor === "number") out.priceMinor = item.priceMinor;
      if (item.currency) out.currency = item.currency;
      if (includeImages && item.image) {
        const len = item.image.length;
        // Always include at least one image even if it alone exceeds the cap,
        // so a single-item export round-trips. This intentionally lets the
        // first image violate the 800 KiB aggregate budget.
        if (imageBytes + len <= MAX_EXPORT_IMAGE_BYTES || imageBytes === 0) {
          out.image = item.image;
          imageBytes += len;
        }
      }
      if (item.notes) out.notes = item.notes;
      if (typeof item.rank === "number") out.rank = item.rank;
      if (item.priority) out.priority = item.priority;
      out.purchased = item.purchased;
      return out;
    }),
  };
}

export const exportList = query({
  args: { listId: v.id("wishlists"), includeImages: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    let access;
    try {
      access = await requireMember(ctx, args.listId);
    } catch {
      return { schemaVersion: 1, lists: [] };
    }
    const includeImages = args.includeImages ?? true;
    return {
      schemaVersion: 1,
      lists: [await collectList(ctx, access.list, includeImages)],
    };
  },
});
