import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireIdentity, requireUser } from "./helpers/auth";

export const storeUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const subject = (identity as any).tokenIdentifier ?? identity.subject;
    const name = identity.name ?? identity.email ?? undefined;
    const email = identity.email?.toLowerCase() ?? undefined;
    const picture = (identity as any).pictureUrl ?? (identity as any).picture;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", subject))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        email,
        ...(typeof picture === "string" && picture ? { avatarUrl: picture } : {}),
      });
      return existing._id;
    }

    const id = await ctx.db.insert("users", {
      userId: subject,
      name,
      email,
      avatarUrl: typeof picture === "string" && picture ? picture : undefined,
    });
    return id;
  },
});

export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    return {
      userId: user.userId,
      name: user.name ?? null,
      email: user.email ?? null,
    };
  },
});

export const updateProfile = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    await ctx.db.patch(user._id, {
      name: args.name || undefined,
    });
  },
});
