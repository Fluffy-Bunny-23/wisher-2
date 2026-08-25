import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { Role } from "../schema";
import { requireUser } from "./auth";

type DbCtx = QueryCtx | MutationCtx;

/**
 * Resolve the current user and their role on a wishlist.
 * Throws unless the user is a member or owner.
 * All permission checks happen here, server-side, for every access.
 */
export async function getAccess(ctx: DbCtx, wishlistId: Id<"wishlists">) {
  const { user } = await requireUser(ctx);
  const list = await ctx.db.get(wishlistId);
  if (!list) {
    console.log(`getAccess denied: wishlist ${wishlistId} not found for user ${user._id}`);
    throw new Error("Wishlist not found or access denied");
  }

  let role: Role;
  if (list.ownerId === user._id) {
    role = "owner";
  } else {
    const member = await ctx.db
      .query("wishlistMembers")
      .withIndex("by_wishlist_user", (q) =>
        q.eq("wishlistId", list._id).eq("userId", user._id),
      )
      .first();
    if (!member) {
      console.log(
        `getAccess denied: user ${user._id} not a member of wishlist ${wishlistId}`,
      );
      throw new Error("Wishlist not found or access denied");
    }
    role = member.role;
  }

  return { user, list, role };
}

/** Requires owner or editor role for write access to the list itself / items. */
export async function requireEditor(ctx: DbCtx, wishlistId: Id<"wishlists">) {
  const access = await getAccess(ctx, wishlistId);
  if (access.role !== "owner" && access.role !== "editor") {
    throw new Error("Editor or owner role required");
  }
  return access;
}

/** Requires owner role. */
export async function requireOwner(ctx: DbCtx, wishlistId: Id<"wishlists">) {
  const access = await getAccess(ctx, wishlistId);
  if (access.role !== "owner") {
    throw new Error("Owner role required");
  }
  return access;
}

/** Any member (including owner) may view. */
export async function requireMember(ctx: DbCtx, wishlistId: Id<"wishlists">) {
  return getAccess(ctx, wishlistId);
}
