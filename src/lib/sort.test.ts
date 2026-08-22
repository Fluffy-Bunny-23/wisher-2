import { describe, expect, it } from "vitest";
import { sortItems, filterItems, type SortableItem } from "./sort";

function item(partial: Partial<SortableItem> & { id: string }): SortableItem {
  return {
    name: "x",
    purchased: false,
    priceMinor: null,
    rank: 0,
    createdTime: 0,
    ...partial,
  };
}

describe("sortItems", () => {
  it("sinks purchased items below unpurchased items", () => {
    const a = item({ id: "a", purchased: false, createdTime: 1 });
    const b = item({ id: "b", purchased: true, createdTime: 2 });
    const sorted = sortItems([a, b], "custom");
    expect(sorted.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("custom order follows the manual rank", () => {
    const a = item({ id: "a", rank: 1, createdTime: 100 });
    const b = item({ id: "b", rank: 0, createdTime: 200 });
    const c = item({ id: "c", rank: 2, createdTime: 300 });
    const sorted = sortItems([a, b, c], "custom");
    expect(sorted.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("priority sorts high > medium > low", () => {
    const low = item({ id: "low", priority: "low", rank: 0 });
    const high = item({ id: "high", priority: "high", rank: 1 });
    const medium = item({ id: "medium", priority: "medium", rank: 2 });
    const unset = item({ id: "unset", rank: 3 });
    const sorted = sortItems([low, medium, unset, high], "priority");
    expect(sorted.map((i) => i.id)).toEqual(["high", "medium", "unset", "low"]);
  });

  it("created sorts newest first", () => {
    const old = item({ id: "old", createdTime: 1 });
    const newer = item({ id: "newer", createdTime: 50 });
    const newest = item({ id: "newest", createdTime: 100 });
    const sorted = sortItems([old, newest, newer], "created");
    expect(sorted.map((i) => i.id)).toEqual(["newest", "newer", "old"]);
  });

  it("sorts by price ascending, nulls last, purchased still sinks", () => {
    const cheap = item({ id: "cheap", priceMinor: 100, createdTime: 1 });
    const expensive = item({ id: "expensive", priceMinor: 500, createdTime: 1 });
    const noPrice = item({ id: "noPrice", priceMinor: null, createdTime: 1 });
    const bought = item({ id: "bought", priceMinor: 1, purchased: true, createdTime: 5 });
    const sorted = sortItems([expensive, noPrice, bought, cheap], "price");
    expect(sorted.map((i) => i.id)).toEqual(["cheap", "expensive", "noPrice", "bought"]);
  });

  it("breaks ties by most recently created first", () => {
    const a = item({ id: "a", rank: 0, createdTime: 10 });
    const b = item({ id: "b", rank: 0, createdTime: 20 });
    const sorted = sortItems([a, b], "custom");
    expect(sorted.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("filterItems", () => {
  it("filters by purchase state", () => {
    const items = [
      item({ id: "a", purchased: true }),
      item({ id: "b", purchased: false }),
    ];
    expect(filterItems(items, { purchased: "purchased" }).map((i) => i.id)).toEqual(["a"]);
    expect(filterItems(items, { purchased: "unpurchased" }).map((i) => i.id)).toEqual(["b"]);
    expect(filterItems(items, { purchased: "all" })).toHaveLength(2);
  });

  it("filters by priority", () => {
    const items = [
      item({ id: "low", priority: "low" }),
      item({ id: "high", priority: "high" }),
      item({ id: "unset" }),
    ];
    expect(filterItems(items, { priority: "high" }).map((i) => i.id)).toEqual(["high"]);
    expect(filterItems(items, { priority: "all" })).toHaveLength(3);
  });
});
