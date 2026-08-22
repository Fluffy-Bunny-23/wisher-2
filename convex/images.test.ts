import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { parseOgImage } from "./images";

describe("images.parseOgImage", () => {
  it("extracts og:image with property before content", () => {
    const html = `<meta property="og:image" content="https://example.com/img.png" />`;
    expect(parseOgImage(html)).toBe("https://example.com/img.png");
  });

  it("extracts og:image with content before property", () => {
    const html = `<meta content="https://example.com/a.jpg" property="og:image" />`;
    expect(parseOgImage(html)).toBe("https://example.com/a.jpg");
  });

  it("returns null when absent", () => {
    expect(parseOgImage("<html><head></head></html>")).toBeNull();
  });
});

describe("import / export", () => {
  it("imports into a new list and exports it back", async () => {
    const t = convexTest(schema, modules);
    const sarah = t.withIdentity({ name: "Sarah", email: "sarah@example.com", subject: "user-sarah" });
    await sarah.mutation(api.users.storeUser);

    const doc = {
      schemaVersion: 1,
      lists: [
        {
          title: "Travel",
          description: "Gear",
          items: [
            { name: "Backpack", priceMinor: 12000, currency: "USD", purchased: false },
            { name: "Passport holder" },
          ],
        },
      ],
    };

    const res = await sarah.mutation(api.import.importLists, { lists: doc.lists });
    expect(res.created).toBe(1);
    expect(res.importedItems).toBe(2);

    const lists = await sarah.query(api.wishlists.getWishlists);
    expect(lists).toHaveLength(1);
    const exported = await sarah.query(api.export.exportList, { listId: lists[0].id });
    expect(exported.schemaVersion).toBe(1);
    expect(exported.lists[0].title).toBe("Travel");
    expect(exported.lists[0].items).toHaveLength(2);
    expect(exported.lists[0].items[0].priceMinor).toBe(12000);
  });

  it("imports into an existing list and dedupes", async () => {
    const t = convexTest(schema, modules);
    const sarah = t.withIdentity({ name: "Sarah", email: "sarah@example.com", subject: "user-sarah" });
    await sarah.mutation(api.users.storeUser);
    const listId = await sarah.mutation(api.wishlists.createWishlist, { title: "Existing" });
    await sarah.mutation(api.items.addItem, {
      wishlistId: listId,
      item: { name: "Dup", url: "https://example.com/dup" },
    });

    const doc = {
      lists: [
        {
          title: "Ignored",
          items: [
            { name: "Dup", url: "https://example.com/dup" },
            { name: "New", url: "https://example.com/new" },
          ],
        },
      ],
    };

    const res = await sarah.mutation(api.import.importLists, {
      lists: doc.lists,
      targetListId: listId,
      dedupe: true,
    });
    expect(res.created).toBe(0);
    expect(res.importedItems).toBe(1);

    const items = await sarah.query(api.items.listItems, { wishlistId: listId });
    expect(items).toHaveLength(2);
  });
});
