# Changelog

## Unreleased

### Security hardening

- Item URLs are now validated server-side (`http`/`https` only) in
  `addItem`/`updateItem`/import, closing a stored-XSS vector via
  `javascript:`/`data:` URLs; the item detail page additionally renders
  untrusted URLs as plain text unless they pass the shared SSRF guard
  (`src/lib/urlGuard.ts`, now single-sourced across client, import
  validation, and the og:image fetcher).
- The og:image fetcher resolves hostnames via DNS-over-HTTPS and re-checks
  every resolved IP against the private-address blocklist, defending against
  DNS-rebinding SSRF (best effort; see `convex/images.ts` notes).
- Login redirect param is validated (same-origin path only) — open redirect
  fixed.
- Import size limits: max 20 lists / 200 items per list / 500 total items,
  image data URLs restricted to jpeg/png/webp/gif within the 900 KB budget.
- Per-field string length caps enforced on all user-controlled fields
  (wishlist title/description, item name/url/notes, purchaser name/email/note,
  profile name, invite email).
- Guest item lists no longer leak purchaser email addresses.
- Access errors are uniform ("Wishlist not found or access denied") to remove
  the existence oracle.
- Visited-tokens cookie values are format-checked and marked `Secure` on https;
  re-inviting an existing member now updates their role instead of silently
  ignoring it.

### Performance

- Dashboard/guest queries no longer serialize per-list DB round-trips;
  owner summaries and counts run concurrently, list dedup is O(n), guest
  token fan-out is parallel.
- Reordering an item only patches ranks inside the moved window and skips
  work entirely when position is unchanged; large-list reorder guard added.
- `addItem` skips the max-rank scan when an explicit rank is supplied.
- Export responses cap total inline image bytes (800 KB) with an opt-out
  `includeImages` flag; the list page no longer eagerly subscribes to export.

### Cleanups

- Dead code removed: `addMemberByEmail`, `exportAll`, `userFields`,
  `ROLES`/`MEMBER_ROLES` value exports, unused imports.
- Role validators deduplicated into one shared `memberRoleValidator`.
- Nav's hand-rolled offline listener replaced by `useOfflineGuard`.
- `wishlist.schema.json` re-aligned with the Zod schema (the runtime
  validator).

### Breaking: stricter JSON import validation

Import validation (`wishlist.schema.json` / `src/lib/importSchema.ts`) was
tightened to match what the app actually exports. Files exported by the
previously shipped version may fail validation on re-import:

- `schemaVersion` must be exactly `1` (it previously defaulted silently when
  missing).
- Item `url`, when present, must be a valid `http://` or `https://` URL —
  empty strings are rejected.
- `priceMinor` must be an integer when present — `null` is rejected.
- `rank` / `eventDate`, when present, must be non-negative integers.

Exports produced by the fixed version are unaffected (absent optional fields
are omitted rather than written as `null`/`""`). To repair an old export by
hand:

1. Delete every `"url": ""` field.
2. Replace every `"priceMinor": null` by deleting the field.
3. Add `"schemaVersion": 1` at the top level if it is missing.
