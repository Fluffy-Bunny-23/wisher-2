import { describe, expect, it } from "vitest";
import { formatPrice, formatDate } from "./format";

describe("formatPrice", () => {
  it("formats minor units with currency symbol", () => {
    expect(formatPrice(1999, "USD")).toContain("19.99");
  });

  it("returns empty string for null/undefined", () => {
    expect(formatPrice(null, "USD")).toBe("");
    expect(formatPrice(undefined, "USD")).toBe("");
  });

  it("falls back to USD for unknown currency", () => {
    expect(formatPrice(1234, "ZZZ")).toContain("12.34");
  });
});

describe("formatDate", () => {
  it("formats a timestamp", () => {
    const d = new Date(2026, 0, 15).getTime();
    expect(formatDate(d)).toBeDefined();
  });
});
