import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAccess, requireOwner, requireMember } from "./helpers/access";

const roleValidator = v.union(v.literal("editor"), v.literal("viewer"));

/** Add an existing user to a list by their email as a member. Owner only. */
export const addMemberByEmail = mutation({
  args: {
    wishlistId: v.id("wishlists"),
    email: v.string(),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const { user, list } = await requireOwner(ctx, args.wishlistId);
    const email = args.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Invalid email address");
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!existing) return { added: false as const };
    if (existing._id === user._id) return { added: false as const };

    const already = await ctx.db
      .query("wishlistMembers")
      .withIndex("by_wishlist_user", (q) =>
        q.eq("wishlistId", list._id).eq("userId", existing._id),
      )
      .first();
    if (!already) {
      await ctx.db.insert("wishlistMembers", {
        wishlistId: list._id,
        userId: existing._id,
        role: args.role,
      });
    }
    return { added: true as const };
  },
});

export const updateMemberRole = mutation({
  args: {
    wishlistId: v.id("wishlists"),
    memberId: v.id("users"),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const { list } = await requireOwner(ctx, args.wishlistId);
    if (args.memberId === list.ownerId) {
      throw new Error("Cannot change the owner's role");
    }
    const member = await ctx.db
      .query("wishlistMembers")
      .withIndex("by_wishlist_user", (q) =>
        q.eq("wishlistId", args.wishlistId).eq("userId", args.memberId),
      )
      .first();
    if (!member) throw new Error("Member not found");
    await ctx.db.patch(member._id, { role: args.role });
  },
});

export const removeMember = mutation({
  args: { wishlistId: v.id("wishlists"), memberId: v.id("users") },
  handler: async (ctx, args) => {
    const { list } = await requireOwner(ctx, args.wishlistId);
    if (args.memberId === list.ownerId) {
      throw new Error("Cannot remove the owner");
    }
    const member = await ctx.db
      .query("wishlistMembers")
      .withIndex("by_wishlist_user", (q) =>
        q.eq("wishlistId", args.wishlistId).eq("userId", args.memberId),
      )
      .first();
    if (!member) throw new Error("Member not found");
    await ctx.db.delete(member._id);
  },
});

export const leaveList = mutation({
  args: { wishlistId: v.id("wishlists") },
  handler: async (ctx, args) => {
    const { user, list, role } = await getAccess(ctx, args.wishlistId);
    if (role === "owner") throw new Error("Owners cannot leave; delete the list instead");
    const member = await ctx.db
      .query("wishlistMembers")
      .withIndex("by_wishlist_user", (q) =>
        q.eq("wishlistId", list._id).eq("userId", user._id),
      )
      .first();
    if (member) await ctx.db.delete(member._id);
  },
});

export const listMembers = query({
  args: { wishlistId: v.id("wishlists") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.wishlistId);
    const list = await ctx.db.get(args.wishlistId);
    const memberships = await ctx.db
      .query("wishlistMembers")
      .withIndex("by_wishlistId", (q) => q.eq("wishlistId", args.wishlistId))
      .collect();
    const owner = await ctx.db.get(list!.ownerId);
    const memberRows = await Promise.all(
      memberships.map(async (m) => {
        const u = await ctx.db.get(m.userId);
        return {
          id: m.userId,
          name: u?.name ?? "Unknown",
          email: u?.email ?? "",
          role: m.role,
        };
      }),
    );
    return [
      {
        id: owner!._id,
        name: owner?.name ?? "Unknown",
        email: owner?.email ?? "",
        role: "owner" as const,
      },
      ...memberRows,
    ];
  },
});
