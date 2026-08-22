# Wisher — Wishlist App Specification

Everything the app must do.

## 1. Authentication & accounts

- Email/password sign up with validation and duplicate-email errors
- Email/password sign in
- Google OAuth sign-in
- Sign out from any page
- Persistent sessions across page refreshes and browser restarts
- Password reset via email (handled by Firebase)
- Protected routes: unauthenticated users redirected to `/login`
- First login creates/updates the user's record in Convex (name, email, Google avatar or default avatar)

## 2. Wishlists

- Create a wishlist (title + optional description)
- View your own lists and lists shared with you, each labeled with its owner
- Edit title/description (owner or editor)
- Delete a wishlist (owner only, with confirmation)
- Stable id per list, usable in URLs
- Empty state with a call-to-action when a list has no items

## 3. Sharing & permissions

- Invite a user by email, adding them as a viewer or editor
- Join-by-invite-link flow; an owner can also copy a shareable invite link to send outside the app
- Each invite link embeds a unique, non-guessable random token encoding the target list and role, and optionally the invitee's email address
- Opening an invite link while signed in adds you as a member (matching the token's email if bound, otherwise any signed-in user); while signed out you are redirected to `/login` and the invite completes after sign-in
- Invite links are single-use: the first acceptance creates the membership and burns the token; the owner can revoke an unused invite at any time
- Email invites are informational: the app shows the invite link in-app to share manually; no outbound email delivery is required
- Roles: `owner`, `editor` (add/edit/delete items, edit the list), `viewer` (read-only)
- Owner can change roles and remove members
- Members can leave a list
- All permission checks are enforced server-side in Convex queries/mutations — never client-only

## 4. Items

- Add items manually: name, URL, price, currency, notes, priority (low/medium/high), optional image
- Price is stored as an integer in minor units (e.g. cents) with an ISO 4217 currency code (default `USD`) and displayed with `Intl.NumberFormat`
- Edit item fields
- Delete items (with confirmation)
- Mark items as purchased / unpurchased
- Sort: by priority, by created date, by price, purchased-last — purchased items always sink below unpurchased items, and ties break by most recently created first
- Filter: by priority, purchased/unpurchased
- Summary count (e.g. "3 of 8 purchased")
- Item detail view (modal or page)

## 5. Images (base64 in DB)

- Item images are stored in the `items` table as `data:image/...;base64,...` strings
- Resolution order: an explicit image (from JSON import or manual entry) takes precedence, otherwise auto-fetch the Open Graph image from the item URL, otherwise fall back to a placeholder
- Auto-fetching happens when an item is created or saved with a URL and no explicit image; the fetch runs as a background Convex action and only retries when the item is edited
- Images are compressed/resized client-side (canvas → JPEG/WebP) before storage so Convex documents stay well under the 1 MB limit
- Manual image picker (file/paste) is also compressed before insert
- Users can remove an image or reset it to auto-fetch behavior

## 6. Import / Export

- Export a single list or all lists as JSON (schema-versioned, base64 images included)
- Import via paste or file upload
- Validation against a documented schema with friendly per-field errors
- Import targets a chosen existing or new list, with optional deduplication
- `wishlist.schema.json` is committed to the repo as the canonical template

## 7. UX & reliability

- Loading, error, and toast states for all actions
- Empty states for lists and items
- Responsive layout (mobile + desktop); Progressive Web App (installable, offline-capable)
- Offline scope: the app shell and the most recently viewed lists/items are cached and readable offline; creating, editing, or purchasing requires a connection and surfaces a toast when offline instead of silently failing
- Basic accessibility: labels, keyboard navigation, sufficient contrast
- Graceful handling of image-fetch failures (fallback to placeholder)

## 8. CI / CD

- A local CI toolchain runs lint, typecheck, unit tests, Convex tests, and an end-to-end smoke suite
- CI must be fast even on low-end hardware (caching, parallel jobs, bounded parallelism)
- A green CI result is the gate for merging and for deploying

## 9. Routes & pages

- `/login` — sign in with email/password or Google; link to `/signup`
- `/signup` — create an account
- `/` — authenticated users are redirected to `/dashboard`; unauthenticated users to `/login`
- `/dashboard` — the user's wishlists (owned + shared, each labeled with its owner) with a "New list" action
- `/lists/new` — create a wishlist (title, optional description)
- `/lists/[listId]` — a list's items with sort/filter controls, purchased summary, invite/share controls, and export; empty state when there are no items
- `/lists/[listId]/items/[itemId]` — item detail view
- `/invite/[token]` — accepts an invite link: adds the signed-in user as a member with the token's role and marks the token used; redirects to `/login` first if signed out
- `/settings` — profile (display name, avatar) and account actions
- Every route except `/login`, `/signup`, and `/invite/[token]` requires authentication