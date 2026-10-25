# Make My Marriage — rules for every session

Read @AGENTS.md: this is Next.js 16. Check `node_modules/next/dist/docs/` before using a Next.js API.

## Source of truth

- `docs/` is the source of truth. When docs disagree: **api-design > database-design > system-design > prd**.
- Ask before contradicting them. If a decision changes, update the docs in the same change.
- Build in the PRD's phase order. One phase at a time, in small steps.

## Stack (pinned, exact versions)

- Next.js 16.4 App Router, React 19, TypeScript 6 (strict), Node 24.
- Tailwind CSS 4: theme tokens live in `app/globals.css` under `@theme`. There is no tailwind.config.
- Mongoose, Zod 4, jose (JWT), Nodemailer (Gmail SMTP), `@aws-sdk/client-s3` for Cloudflare R2, exceljs, papaparse, qrcode, browser-image-compression. jszip arrives in Phase 8.
- **bcryptjs, not bcrypt**: an approved change from the docs, to avoid native builds on Windows and Vercel. Cost 12.
- No auth libraries and no UI component libraries. Our own components live in `components/`.
- Next 16 specifics: `proxy.ts`, not middleware.ts. `params`, `cookies()` and `headers()` are async. Use the global `PageProps<"/route">`, `LayoutProps` and `RouteContext<"/api/route">` types.

## Structure

- `app/` holds routes only. Pages: `(auth)`, `(dashboard)`, `w/[slug]`, `i/[token]`, `u/[token]`. API: `app/api/<module>/`.
- `modules/<module>/` holds `model.ts` (Mongoose), `schema.ts` (Zod) and `service.ts` (logic). Register each model in `lib/models.ts`.
- Route handlers stay thin: `handler()` from `lib/api.ts` → `requireUser` / `requireMember` → Zod parse → service.
- Files that hold secrets or touch the DB start with `import "server-only"`. `lib/session.ts` must stay importable by `proxy.ts`, so it has no DB or server-only imports.

## Data rules

- Every query on a wedding-scoped collection filters by `weddingId`. Services take `weddingId` as their first argument.
- `weddingId` comes from the session (`requireMember`), never from the URL or the body.
- Another wedding's record answers 404 `NOT_FOUND`, exactly like a missing one.
- In `aggregate()` `$match`, wrap IDs with `toObjectId()` from `lib/ids.ts`. Mongoose doesn't cast IDs there.
- Money is integer **paise** in fields ending `Paise`. Convert only with `lib/money.ts`.
- Calendar dates are `"YYYY-MM-DD"`, times are `"HH:mm"`, and moments are UTC `Date`s. "Today" is `todayIST()` from `lib/dates.ts`.
- Tokens are stored as a SHA-256 hash only (`lib/tokens.ts`). Guest invitation and QR tokens also keep an AES-256-GCM encrypted copy. Never log or return a token.
- `passwordHash`, `tokenHash`, `inviteTokenEnc` and `tokenEnc` are `select: false`. Never return them from an API.
- Files live in R2; MongoDB stores only keys, under `weddings/<weddingId>/`.
- Use `.lean()` for reads. Use transactions for invite accept, Admin role change, remove and leave, event delete and wedding delete.
- Memberships are `active` or `removed` only and are never deleted. Pending invites live in `memberInvites`.

## API rules

- Errors are thrown as `ApiError(code)` from `lib/errors.ts`. The shape is `{ error: { code, message, fields? } }`, and `fields` appears only on 400 responses.
- Use only the error codes listed in `lib/errors.ts`; they mirror api-design.md.
- Every POST, PATCH and DELETE checks that `Origin` equals `APP_URL` (done in `handler()`).
- Lists return `{ items }`, and paginated lists add `nextCursor`. A DELETE returns 204 with no body.
- Never return stack traces. Logs include the route and `weddingId`, never passwords or tokens.

## Security

- Never commit `.env.local` or any secret. Every new environment variable goes in `.env.example` and `lib/env.ts`.
- Permission checks always happen on the server. Checks in the UI are only for display.
- These are rate-limited through the `rateLimits` collection: login, signup, forgot-password, RSVP, upload URLs, and every email sent (`gmail:daily`).

## Known limitations (v1)

- **One Gmail account is shared by every wedding**, with a single cap of 450 emails a day (`EMAIL_DAILY_CAP`). One large send can use up the day for all couples. Future fix: a custom domain plus a transactional email service. Don't build anything extra for it in v1.
- QR codes are PNG only in v1.

## UI

- Light mode only. Colours come only from the `@theme` tokens; Tailwind's default palette is removed.
  - The page background is ivory and cards are surface. Plum is for primary actions, active states and key numbers.
  - Champagne is an accent only.
  - Never use bright red, pink, green, yellow or blue.
- Instrument Serif (`font-display`) is for headings and large numbers. Inter (`font-sans`, 400/500) is for everything else.
- Shapes:
  - inputs `h-12 rounded-input` with a 1px border and a plum focus ring
  - cards `rounded-card border border-border`, with at most `shadow-card`
  - buttons are `rounded-full` pills with single-line labels
  - small labels use the `label` utility
- Every page must work on a phone browser.

## Before saying a step is done

Run `npm run typecheck && npm run lint && npm test`. Every new route gets a permission test: no session, a Manager calling an Admin route, and another wedding's ID.
