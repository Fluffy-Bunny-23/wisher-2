import { v } from "convex/values";
import type { MutationCtx, QueryCtx, ActionCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx | ActionCtx;

export async function requireIdentity(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

/**
 * Resolve the authenticated user's Convex document (stored by `storeUser`).
 * Throws if the user has not been stored yet.
 */
export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const identity = await requireIdentity(ctx);
  const identifier = (identity as any).tokenIdentifier ?? identity.subject;
  const user = await ctx.db
    .query("users")
    .withIndex("by_userId", (q) => q.eq("userId", identifier))
    .first();
  if (!user) {
    throw new Error("User profile not found");
  }
  return { identity, user };
}

export const userFields = {
  name: v.optional(v.string()),
  email: v.optional(v.string()),
};
