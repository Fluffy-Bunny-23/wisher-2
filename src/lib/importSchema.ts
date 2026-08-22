import { z } from "zod";

export const importItemSchema = z
  .object({
    name: z.string({ required_error: "name is required" }).min(1, "name is required"),
    url: z.string().optional(),
    priceMinor: z
      .number()
      .int("priceMinor must be an integer (minor currency units)")
      .nonnegative("priceMinor must be non-negative")
      .optional(),
    currency: z.string().regex(/^[A-Za-z]{3}$/, "currency must be a 3-letter ISO 4217 code").optional(),
    image: z.string().optional(),
    notes: z.string().optional(),
    rank: z.number().int().optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    purchased: z.boolean().optional(),
  })
  .strict();

export const importListSchema = z
  .object({
    title: z.string({ required_error: "title is required" }).min(1, "title is required"),
    description: z.string().optional(),
    eventDate: z.number().optional(),
    ordered: z.boolean().optional(),
    items: z.array(importItemSchema).default([]),
  })
  .strict();

export const wishlistDocumentSchema = z
  .object({
    schemaVersion: z.number().int().default(1),
    lists: z.array(importListSchema),
  })
  .strict();

export type WishlistDocument = z.infer<typeof wishlistDocumentSchema>;

/**
 * Parse and validate an imported JSON string, returning friendly per-field
 * error messages. Throws an Error with a readable message on invalid input.
 */
export function parseWishlistDocument(json: string): WishlistDocument {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON: could not parse the imported text.");
  }
  const result = wishlistDocumentSchema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path?.join(".") || "document";
    throw new Error(
      `Validation failed at "${path}": ${first?.message ?? "invalid value"}.`,
    );
  }
  return result.data;
}
