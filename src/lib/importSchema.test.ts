import { describe, expect, it } from "vitest";
import { parseWishlistDocument } from "./importSchema";

const validDoc = {
  schemaVersion: 1,
  lists: [
    {
      title: "Birthday",
      description: "My birthday list",
      eventDate: 1767225600000,
      ordered: true,
      items: [
        {
          name: "Book",
          url: "https://example.com/book",
          priceMinor: 1999,
          currency: "USD",
          rank: 0,
          purchased: false,
        },
      ],
    },
  ],
};

describe("parseWishlistDocument", () => {
  it("parses a valid document", () => {
    const doc = parseWishlistDocument(JSON.stringify(validDoc));
    expect(doc.schemaVersion).toBe(1);
    expect(doc.lists).toHaveLength(1);
    expect(doc.lists[0].ordered).toBe(true);
    expect(doc.lists[0].eventDate).toBe(1767225600000);
    expect(doc.lists[0].items[0].name).toBe("Book");
  });

  it("defaults missing optional fields", () => {
    const doc = parseWishlistDocument(
      JSON.stringify({ schemaVersion: 1, lists: [{ title: "X", items: [{ name: "Y" }] }] }),
    );
    expect(doc.lists[0].items[0].rank).toBeUndefined();
    expect(doc.lists[0].ordered).toBeUndefined();
  });

  it("throws friendly error on invalid JSON", () => {
    expect(() => parseWishlistDocument("{ not json")).toThrowError(/Invalid JSON/);
  });

  it("throws friendly error on missing required field", () => {
    expect(() =>
      parseWishlistDocument(JSON.stringify({ schemaVersion: 1, lists: [{ items: [] }] })),
    ).toThrowError(/Validation failed at "lists.0.title"/);
  });

  it("rejects non-integer priceMinor", () => {
    const bad = {
      schemaVersion: 1,
      lists: [{ title: "X", items: [{ name: "Y", priceMinor: 19.99 }] }],
    };
    expect(() => parseWishlistDocument(JSON.stringify(bad))).toThrowError(/priceMinor/);
  });

  it("rejects unknown extra fields", () => {
    const bad = {
      schemaVersion: 1,
      lists: [{ title: "X", items: [{ name: "Y", priority: "urgent" }] }],
    };
    expect(() => parseWishlistDocument(JSON.stringify(bad))).toThrowError(/priority/);
  });
});
