# Wisher — Implementation Plan

## Overview

Wisher is a multi-user wishlist web app: users create wishlists, add items (manually or by importing JSON), share lists with friends and family, and mark items as purchased.

- Shared lists support permissions: owners, editors (can add/edit/delete items), and viewers (read-only).
- Item images are stored in the database as base64 strings, auto-fetched from the product URL when not provided explicitly.
- The app is a Progressive Web App: installable, responsive, mobile + desktop.
- Deployed to Vercel; backend and database hosted by Convex; authentication via Firebase (email/password + Google).

## Stack

- Next.js (App Router, TypeScript, Tailwind CSS) on Vercel
- Convex: database, queries/mutations/actions, JWT auth via Firebase
- Firebase Auth (email/password + Google); Convex verifies the Firebase JWT
- No other datastore — images are base64 strings inside Convex documents
- `pnpm` as the package manager for speed and reproducible installs
- Node.js 20 LTS (>= 20.0.0) and `pnpm` (>= 9) are the pinned toolchain; enforced via `engines` in `package.json`

## Repository structure

```
wisher-2/
  convex/
    auth.config.ts        # Firebase JWT provider
    schema.ts             # tables + indexes
    users.ts              # storeUser / getProfile
    wishlists.ts
    wishlistMembers.ts
    wishlistInvites.ts
    items.ts
    helpers/              # requireAuth, membership/role checks
    images.ts             # og:image fetch + compress
    export.ts, import.ts
  src/
    app/                  # Next.js routes
    components/
    lib/                  # firebase client, convex client, image utils
  wishlist.schema.json
  package.json
  vitest.config.ts
  Makefile                # convenience wrapper for local CI
```

## Auth flow

- Client: Firebase signs in → `onAuthStateChanged` → send the ID token to the Convex client
- `convex/auth.config.ts`: Firebase JWT provider (issuer `https://securetoken.google.com/<projectId>`)
- `ctx.auth.getUserIdentity()` guards every protected query/mutation
- `storeUser` action upserts the user's profile after login

## Data model (`convex/schema.ts`)

- `users`: userId, name, email, avatarUrl
- `wishlists`: ownerId, title, description, timestamps — index on ownerId
- `wishlistMembers`: wishlistId, userId, role (`viewer`|`editor`) — composite index (wishlistId, userId)
- `wishlistInvites`: wishlistId, token (random 128-bit, unique index), role, email?, createdById, createdAt, usedAt? — backing store for single-use invite links
- `items`: wishlistId, name, url, priceMinor? (integer in minor currency units), currency (ISO 4217, default `USD`), image (base64 dataUrl or null), notes, priority (`low`|`medium`|`high`), purchased, timestamps — index on wishlistId

## Authorization pattern

- `requireAuth(ctx)` → identity or throw
- `getListAccess(ctx, listId)` → returns role or throws; owner implied by `wishlists.ownerId`
- Item mutations require editor/owner; item queries require any member; all checks server-side

## Image pipeline

- Resolution: existing `item.image` → else fetch `og:image` from the item URL (Convex action with timeout) → else placeholder
- Compression: client-side canvas, max dimension ~500 px, JPEG/WebP q≈0.8, base64-encoded
- Guard: reject any payload that would push the document past ~900 KB base64

## Import / Export

- Export produces a JSON document conforming to `wishlist.schema.json` (images included as base64 data URLs)
- `wishlist.schema.json` is a JSON Schema (draft-07) committed at the repo root and used at runtime for validation; canonical shape:

```json
{
  "schemaVersion": 1,
  "lists": [
    {
      "title": "string",
      "description": "string (optional)",
      "items": [
        {
          "name": "string",
          "url": "string (optional)",
          "priceMinor": "integer (optional, minor currency units)",
          "currency": "string, ISO 4217, default USD",
          "image": "string (optional, data:image/...;base64,...)",
          "notes": "string (optional)",
          "priority": "low | medium | high (default medium)",
          "purchased": "boolean (default false)"
        }
      ]
    }
  ]
}
```

- Exporting a single list emits the same shape with one `lists` entry; exporting all lists emits one entry per list
- Import: client parses and validates with Zod against `wishlist.schema.json`, compresses any raw image blobs, and batch-inserts via a mutation
- Import targets either an existing list (items appended, optional dedupe by name + url) or a newly created list

## Testing

- Vitest unit tests: image utils, import validation, sort/filter/priority logic
- Convex tests (Vitest-based): queries/mutations with mocked auth identity
- A small Playwright smoke suite (few critical flows) covering sign-up, list creation, sharing, and import/export

## CI — local, fast on low-end hardware

No hosted CI (no GitHub Actions). CI is a local toolchain that runs identically in a developer's checkout.

- Driven by `package.json` scripts plus a thin `Makefile` wrapper:
  - `make ci` → runs lint, typecheck, unit tests, Convex tests, and the Playwright smoke suite end-to-end
  - `make ci-fast` → lint + typecheck + unit + Convex tests only (skips browser E2E)
  - Individual targets: `make lint`, `make typecheck`, `make test-unit`, `make test-convex`, `make test-e2e`
- Required `package.json` scripts (must exist, pinned):
  - `lint` → `eslint .`
  - `typecheck` → `tsc --noEmit`
  - `test:unit` → `vitest run`
  - `test:convex` → `npx convex test` (Vitest-based Convex tests)
  - `test:e2e` → `playwright test`
  - `ci:fast` → runs `lint`, `typecheck`, `test:unit`, and `test:convex` in parallel via `concurrently`
  - `ci` → runs `ci:fast`, then `test:e2e`
- The `Makefile` targets are thin wrappers over these scripts so `make ci` and `make ci-fast` are unambiguous on any machine
- Everything runs with `pnpm`; the pnpm store and Next/Convex build caches are reused between runs
- Parallelism: lint/typecheck/unit/Convex jobs run concurrently (via `concurrently`), E2E last since it needs a built app
- Performance budget: full `make ci` under ~5 min on a 2-core dev machine; `make ci-fast` under ~2 min
- Use bounded workers in Vitest and 2 capped browser workers in Playwright so low-core machines don't thrash
- Lint and typecheck are fast static passes and are always included, even in the fast path
- A green result is the exact gate for merging and for a local release before `vercel deploy`

## Deployment

- Required environment variables (identical names in `.env.local` locally and in the Vercel project):
  - `NEXT_PUBLIC_CONVEX_URL` — Convex deployment URL
  - `CONVEX_URL` — same URL for server-side use
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- Firebase setup: enable Email/Password and Google sign-in; add the deployed domain and `localhost` to Firebase Auth's authorized domains; the Google provider needs OAuth client credentials from Google Cloud
- Vercel: framework preset Next.js; wire the env vars above into the project
- Convex: cloud deployment; production + dev environments; `npx convex deploy` for promotion