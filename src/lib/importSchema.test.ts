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

  it("rejects null priceMinor (must be omitted, not null)", () => {
    const bad = {
      schemaVersion: 1,
      lists: [{ title: "X", items: [{ name: "Y", priceMinor: null }] }],
    };
    expect(() => parseWishlistDocument(JSON.stringify(bad))).toThrowError(/priceMinor/);
  });

  it("round-trips doc with omitted optional fields", () => {
    const minimal = {
      schemaVersion: 1,
      lists: [{ title: "Minimal", items: [{ name: "OnlyName" }] }],
    };
    const doc = parseWishlistDocument(JSON.stringify(minimal));
    expect(doc.lists[0].title).toBe("Minimal");
    expect(doc.lists[0].items[0].name).toBe("OnlyName");
    expect(doc.lists[0].description).toBeUndefined();
    expect(doc.lists[0].eventDate).toBeUndefined();
    expect(doc.lists[0].ordered).toBeUndefined();
    expect(doc.lists[0].items[0].url).toBeUndefined();
    expect(doc.lists[0].items[0].priceMinor).toBeUndefined();
    expect(doc.lists[0].items[0].rank).toBeUndefined();
  });

  it("rejects non-http url", () => {
    const bad = {
      schemaVersion: 1,
      lists: [{ title: "X", items: [{ name: "Y", url: "ftp://example.com/file" }] }],
    };
    expect(() => parseWishlistDocument(JSON.stringify(bad))).toThrowError(/url/i);
  });

  it("rejects negative rank", () => {
    const bad = {
      schemaVersion: 1,
      lists: [{ title: "X", items: [{ name: "Y", rank: -1 }] }],
    };
    expect(() => parseWishlistDocument(JSON.stringify(bad))).toThrowError(/rank/);
  });

  it("rejects negative eventDate", () => {
    const bad = {
      schemaVersion: 1,
      lists: [{ title: "X", eventDate: -100, items: [{ name: "Y" }] }],
    };
    expect(() => parseWishlistDocument(JSON.stringify(bad))).toThrowError(/eventDate/);
  });

  it("rejects non-integer eventDate", () => {
    const bad = {
      schemaVersion: 1,
      lists: [{ title: "X", eventDate: 123.45, items: [{ name: "Y" }] }],
    };
    expect(() => parseWishlistDocument(JSON.stringify(bad))).toThrowError(/eventDate/);
  });

  it("rejects unknown extra fields", () => {
    const bad = {
      schemaVersion: 1,
      lists: [{ title: "X", items: [{ name: "Y", priority: "urgent" }] }],
    };
    expect(() => parseWishlistDocument(JSON.stringify(bad))).toThrowError(/priority/);
  });
});
