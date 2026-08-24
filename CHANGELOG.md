# Changelog

## Unreleased

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
