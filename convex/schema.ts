import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const ROLES = ["owner", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const MEMBER_ROLES = ["editor", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Single shared runtime validator so every copy of the role union stays in sync. */
export const memberRoleValidator = v.union(
  v.literal("editor"),
  v.literal("viewer"),
);

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const priorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

// Document-size guard: Convex documents are capped at ~1 MiB. Per-field
// caps below prevent huge strings from pushing a wishlist/item document
// past the limit and inflating read/transfer cost for every reader.
export const MAX_WISHLIST_TITLE_LENGTH = 200;
// Aligned with the 2000-char cap historically enforced by createWishlist/
// editWishlist so existing descriptions remain editable.
export const MAX_WISHLIST_DESCRIPTION_LENGTH = 2000;
export const MAX_ITEM_NAME_LENGTH = 200;
export const MAX_ITEM_URL_LENGTH = 2048;
export const MAX_ITEM_NOTES_LENGTH = 2000;
export const MAX_PURCHASED_BY_NAME_LENGTH = 200;
export const MAX_PURCHASED_BY_EMAIL_LENGTH = 320;
export const MAX_PURCHASED_BY_NOTE_LENGTH = 2000;
export const MAX_USER_NAME_LENGTH = 200;
export const MAX_USER_EMAIL_LENGTH = 320;

/** Throw if value exceeds max characters. Call before insert/patch. */
export function assertStringLength(
  value: string | undefined,
  max: number,
  field: string,
) {
  if (value != null && value.length > max) {
    throw new Error(`${field} is too long (max ${max} characters)`);
  }
}

export default defineSchema({
  users: defineTable({
    userId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"]),

  wishlists: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    eventDate: v.optional(v.number()),
    ordered: v.boolean(),
  }).index("by_ownerId", ["ownerId"]),

  wishlistMembers: defineTable({
    wishlistId: v.id("wishlists"),
    userId: v.id("users"),
    role: v.union(v.literal("editor"), v.literal("viewer")),
  })
    .index("by_wishlistId", ["wishlistId"])
    .index("by_userId", ["userId"])
    .index("by_wishlist_user", ["wishlistId", "userId"]),

  wishlistInvites: defineTable({
    wishlistId: v.id("wishlists"),
    token: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    email: v.optional(v.string()),
    createdById: v.id("users"),
    usedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_wishlistId", ["wishlistId"]),

  items: defineTable({
    wishlistId: v.id("wishlists"),
    name: v.string(),
    url: v.optional(v.string()),
    priceMinor: v.optional(v.number()),
    currency: v.string(),
    image: v.optional(v.string()),
    notes: v.optional(v.string()),
    rank: v.optional(v.number()),
    priority: v.optional(priorityValidator),
    purchased: v.boolean(),
    purchasedBy: v.optional(
      v.object({
        name: v.string(),
        email: v.optional(v.string()),
        note: v.optional(v.string()),
      }),
    ),
  }).index("by_wishlistId", ["wishlistId"]),
});
