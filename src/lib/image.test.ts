import { describe, expect, it } from "vitest";
import { downscaleDimensions } from "./image";

describe("downscaleDimensions", () => {
  it("leaves small images unchanged", () => {
    expect(downscaleDimensions(100, 80, 500)).toEqual({ width: 100, height: 80 });
  });

  it("scales large images down to the max dimension preserving aspect ratio", () => {
    const result = downscaleDimensions(1200, 600, 500);
    expect(result).toEqual({ width: 500, height: 250 });
  });

  it("never returns zero dimensions", () => {
    expect(downscaleDimensions(1, 1, 500)).toEqual({ width: 1, height: 1 });
  });

  it("handles zero input gracefully", () => {
    expect(downscaleDimensions(0, 0)).toEqual({ width: 0, height: 0 });
  });
});
