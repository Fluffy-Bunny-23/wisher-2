import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("wisher backend", () => {
  it("requires auth and creates wishlists and items", async () => {
    const t = convexTest(schema, modules);
    const sarah = t.withIdentity({ name: "Sarah", email: "sarah@example.com", subject: "user-sarah" });

    await sarah.mutation(api.users.storeUser);
    const listId = await sarah.mutation(api.wishlists.createWishlist, {
      title: "Birthday",
      description: "Gifts",
    });

    const lists = await sarah.query(api.wishlists.getWishlists);
    expect(lists).toHaveLength(1);
    expect(lists[0].title).toBe("Birthday");
    expect(lists[0].role).toBe("owner");

    const itemId = await sarah.mutation(api.items.addItem, {
      wishlistId: listId,
      item: { name: "Book", priceMinor: 1999, currency: "USD" },
    });

    const items = await sarah.query(api.items.listItems, { wishlistId: listId });
    expect(items).toHaveLength(1);
    expect(items[0].priceMinor).toBe(1999);
    expect(items[0].currency).toBe("USD");
    expect(items[0].purchased).toBe(false);
    expect(itemId).toBe(items[0].id);
  });

  it("rejects unauthenticated access", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.wishlists.getWishlists),
    ).rejects.toThrowError("Not authenticated");
  });

  it("enforces editor role for item writes and viewer read-only", async () => {
    const t = convexTest(schema, modules);
    const sarah = t.withIdentity({ name: "Sarah", email: "sarah@example.com", subject: "user-sarah" });
    const lee = t.withIdentity({ name: "Lee", email: "lee@example.com", subject: "user-lee" });

    await sarah.mutation(api.users.storeUser);
    const listId = await sarah.mutation(api.wishlists.createWishlist, { title: "Shared" });

    // Viewer cannot add items
    await lee.mutation(api.users.storeUser);
    const viewer = await sarah.mutation(api.wishlistInvites.createInviteLink, { wishlistId: listId, role: "viewer" });
    await lee.mutation(api.wishlistInvites.acceptInvite, { token: viewer.token });

    await expect(
      lee.mutation(api.items.addItem, { wishlistId: listId, item: { name: "Nope" } }),
    ).rejects.toThrowError(/Editor or owner/);

    // Viewer can read
    const items = await lee.query(api.items.listItems, { wishlistId: listId });
    expect(items).toEqual([]);

    // Owner can add
    await sarah.mutation(api.items.addItem, { wishlistId: listId, item: { name: "Yes" } });
    const items2 = await lee.query(api.items.listItems, { wishlistId: listId });
    expect(items2).toHaveLength(1);
  });

  it("invite links are single use and email-bound", async () => {
    const t = convexTest(schema, modules);
    const sarah = t.withIdentity({ name: "Sarah", email: "sarah@example.com", subject: "user-sarah" });
    const lee = t.withIdentity({ name: "Lee", email: "lee@example.com", subject: "user-lee" });

    await sarah.mutation(api.users.storeUser);
    await lee.mutation(api.users.storeUser);
    const listId = await sarah.mutation(api.wishlists.createWishlist, { title: "List" });

    const invite = await sarah.mutation(api.wishlistInvites.inviteByEmail, {
      wishlistId: listId,
      email: "lee@example.com",
      role: "editor",
    });
    expect(invite.kind).toBe("added");

    const link = await sarah.mutation(api.wishlistInvites.createInviteLink, {
      wishlistId: listId,
      role: "viewer",
    });
    await lee.mutation(api.wishlistInvites.acceptInvite, { token: link.token });

    await expect(
      t.withIdentity({ name: "Sam", email: "sam@example.com", subject: "user-sam" }).mutation(
        api.wishlistInvites.acceptInvite,
        { token: link.token },
      ),
    ).rejects.toThrowError(/already been used|not found/i);
  });
});

describe("public view + guest claiming (no sign-in)", () => {
  it("lets a guest view via invite token and claim an item, but not edit", async () => {
    const t = convexTest(schema, modules);
    const sarah = t.withIdentity({ name: "Sarah", email: "sarah@example.com", subject: "user-sarah" });
    await sarah.mutation(api.users.storeUser);
    const listId = await sarah.mutation(api.wishlists.createWishlist, { title: "Public" });
    await sarah.mutation(api.items.addItem, {
      wishlistId: listId,
      item: { name: "Mug", priceMinor: 1000, currency: "USD" },
    });
    const { token } = await sarah.mutation(api.wishlistInvites.createInviteLink, {
      wishlistId: listId,
      role: "viewer",
    });

    // Guest, no auth identity at all
    const publicList = await t.query(api.wishlists.getPublicList, { token });
    expect(publicList).toMatchObject({ title: "Public", role: "viewer" });

    const publicItems = await t.query(api.items.listPublicItems, { token });
    expect(publicItems?.items).toHaveLength(1);
    expect(publicItems?.items[0].name).toBe("Mug");

    // Guest claims the item
    await t.mutation(api.items.claimPurchased, {
      token,
      itemId: publicItems!.items[0].id,
      name: "Grandma",
      email: "grandma@example.com",
      note: "For the holidays",
    });

    const after = await t.query(api.items.listPublicItems, { token });
    expect(after?.items[0].purchased).toBe(true);
    expect(after?.items[0].purchasedBy).toMatchObject({ name: "Grandma", note: "For the holidays" });

    // Guest cannot use the authenticated edit paths (no identity -> Not authenticated)
    await expect(
      t.mutation(api.items.togglePurchased, { itemId: after!.items[0].id, purchased: false }),
    ).rejects.toThrowError(/Not authenticated/i);
  });

  it("rejects a claim with a token that does not match the item's list", async () => {
    const t = convexTest(schema, modules);
    const sarah = t.withIdentity({ name: "Sarah", email: "sarah@example.com", subject: "user-sarah" });
    await sarah.mutation(api.users.storeUser);
    const listA = await sarah.mutation(api.wishlists.createWishlist, { title: "A" });
    const listB = await sarah.mutation(api.wishlists.createWishlist, { title: "B" });
    const itemId = await sarah.mutation(api.items.addItem, { wishlistId: listA, item: { name: "X" } });
    const { token } = await sarah.mutation(api.wishlistInvites.createInviteLink, {
      wishlistId: listB,
      role: "viewer",
    });
    await expect(
      t.mutation(api.items.claimPurchased, { token, itemId, name: "Grandma" }),
    ).rejects.toThrowError(/Invalid invite/);
  });
});
