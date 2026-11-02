# Make My Marriage — Project Status

**Last updated:** Nov 2, 2026 · **Branch:** `dev` · **Last feature commit:** `715c68d` (Phase 1)

This file tracks how far the build has got. It is a progress log, not a design document: the PRD, system design, database design and API design stay the source of truth for _what_ to build. Read it at the start of every session, and update it whenever a feature or phase step is finished (see [How to update](#how-to-update-this-file)).

## At a glance

| Phase (PRD build order) | Status |
| --- | --- |
| 0. Scaffold | ✅ Done |
| Landing page (added outside the PRD phases) | ✅ Done |
| 1. Setup and accounts | ✅ Done (1A–1E) |
| 2. Events, tasks and dashboard | ⬜ Not started (next) |
| 3. Guests | ⬜ Not started |
| 4. Invitations and RSVP | ⬜ Not started |
| 5. Money: expenses and gifts | ⬜ Not started |
| 6. Vendors | ⬜ Not started |
| 7. Wedding website and live stream | ⬜ Not started |
| 8. Photo sharing | ⬜ Not started |
| 9. Testing and launch | ⬜ Not started |

**Next up:** Phase 2: events (default types, custom types, create and edit), tasks, and the real dashboard numbers (countdown is already live). Open decision from 1D: build cover-photo upload with the files module, or earlier.

## Done

### Phase 1, manual-test fixes

A manual end-to-end test found 15 problems; all are fixed and re-checked in Chrome on a production build.

- Security: `change-password` allows 5 wrong current passwords per 15 minutes per account, then 429. `GET /api/auth/clear` only clears a session that is really dead, so another site can't log anyone out. Logout always clears the cookie. JSON bodies over 100 KB (counted in bytes while reading) are refused. Forgot-password is also limited to 10 per hour per IP. The daily email cap reserves its slot before sending, so concurrent sends can't pass 450. A reset link survives a failed password save.
- Validation: names can't contain control characters; wedding dates must be within 2 years back and 10 years ahead (`weddingDateBounds` in `lib/dates.ts`); the RSVP cut-off can't be after the wedding date.
- Wedding details page `/settings` (any member edits names and date; Admins can delete the wedding by typing its address), reached from the account menu. `DELETE /api/wedding` is built: it deletes the wedding, QR codes and invites and sets memberships to removed, in one transaction. **Every module that adds a wedding collection must add its delete to `deleteWedding`**, and the R2 files must be deleted after it (Phase 8).
- Phones and tablets: below 1024px the sidebar becomes a top bar with a menu drawer (`components/dashboard/MobileNav.tsx`); long names wrap instead of widening the page.
- Pages left open: an API answer of `NOT_AUTHENTICATED` or `NO_WORKSPACE` now sends the browser to log in or to onboarding (`lib/api-client.ts`).
- Accept-invite warns when someone else is logged in; creating a wedding from a second tab says so before opening the dashboard; the date picker has year buttons, Page Up/Down, and disables dates out of range, with a note for past dates.
- Contrast: text on light backgrounds that used champagne now uses `champagne-deep` (4.6:1); `champagne-dark` was removed. The landing page keeps the Stitch colours.
- Added `app/error.tsx`, `(dashboard)/loading.tsx`, page titles on the placeholder pages, and `/w/<unknown>` now answers 404.
- `next.config.ts` takes `NEXT_DIST_DIR`, so a production build can be tested while `next dev` runs.
- Tests: 175 (13 new). Run the suite on a quiet machine: bcrypt-heavy tests time out at 5 s if a dev server and a browser are running too.

### Phase 1, step 1E: members

- API: `GET /api/members` (everyone; pending invites for Admins only), `POST /api/members/invites`, `POST /api/members/invites/:id/resend`, `DELETE /api/members/invites/:id`, `GET` and `POST /api/members/accept` (public, token is the credential), `PATCH` and `DELETE /api/members/:id`, `POST /api/members/leave`. Logic in `modules/members/service.ts`; the invite email is `modules/members/emails.ts`.
- Rules enforced and tested: Admin-only routes answer 403 to a Manager, ids from another wedding answer 404, `ALREADY_MEMBER`, `IN_OTHER_WORKSPACE` (active membership or a pending invite elsewhere), `LAST_ADMIN`, `CREATOR_PROTECTED`, links work once and for 7 days, re-inviting an email replaces the earlier link, a failed email leaves no invite behind, a removed member loses access at once and can be invited back.
- Two Admins demoting or removing each other at the same moment can't leave a wedding with no Admin: member changes run in a transaction that also touches the wedding document, so one of them is retried and sees the other's result (the test fails without this).
- Accepting with an existing account goes through the same email and IP limits as login (`checkCredentials`), so an invite link can't be used to guess passwords faster.
- `/accept-invite`: built to match the Stitch screen "Desktop Accept Invite (All States)": new account, existing account, wrong password, link expired (card shown faded), already in another wedding. Code in `components/auth/` (`InvitePanel`, `AcceptInviteForm`).
- `/members`: member list with role selector and Remove (Admins), pending invites with Resend and Cancel, an invite form, and Leave wedding. Managers get a read-only list and Leave. Code in `components/members/`.
- Tests: `tests/modules/members.test.ts` (42 tests). About 53 checks in Chrome (desktop and phone), including two real invite emails to a plus-address of the project Gmail.

### Phase 1, step 1D: create workspace and dashboard shell

- API: `POST /api/weddings` (creates the wedding, the creator's Admin membership and the whole-wedding QR code in one transaction; slug from the names, `-2`, `-3` if taken; 409 `ALREADY_IN_WORKSPACE`), `GET` and `PATCH /api/wedding` (any member; slug, theme, publish and gallery switches, RSVP cut-off), `GET /api/wedding/slug-available`. Logic in `modules/weddings/` (`schema`, `slug`, `service`); new `qrCodes` model in `modules/qr/model.ts`.
- `/onboarding`: the three-step "Create your wedding" flow with live website preview, calendar picker and the "Your wedding is ready" screen, built to match the Stitch screen "Desktop Onboarding (All States)". Code in `components/onboarding/`.
- Logged-in shell: `app/(dashboard)/layout.tsx` with the sidebar (couple, sections, signed-in person with Log out) and the dashboard page in its "new wedding" state (real countdown, empty cards, setup list), matching the Stitch "Desktop Dashboard (All States)" new-wedding frame. Code in `components/dashboard/`.
- `lib/page-access.ts` gives server pages the same checks as the API (`pageUser`, `pageMember`). A dead session (account deleted, or ended by a password change) is sent to `GET /api/auth/clear`, which removes the cookie and goes to `/login`, so the proxy's redirect from `/login` can't loop.
- Tests: `tests/modules/weddings.test.ts` (slugs, create, race between two requests, permissions, other weddings' data, slug check) and a proxy test for `/onboarding`.
- Checked in Chrome (about 55 checks, desktop and phone) and side by side with the Stitch screens.
### Phase 1, step 1C: auth pages

- `/login`, `/signup`, `/forgot-password` and `/reset-password`, built to match the Stitch screens "Desktop Login", "Create Account (All States)" and "Forgot Password (All States)". Every state is covered: validation errors, email already used, too many attempts (inputs and button lock), email sent with resend, set new password, link expired.
- Shared pieces: `components/auth/` (`AuthShell`, `panels`, `AuthHeading`, the four forms), `components/form/` (`TextField`, `PasswordField`, `FormBanner`, `SubmitButton`), `lib/api-client.ts` (`postJson`, `safeNext`, `waitText`). The forms reuse the Zod schemas from `modules/auth/schema.ts`, so the browser and server check the same rules.
- Checked by rendering in Chrome next to the Stitch screenshots at 1280 px wide: login positions match within 2 px.
- After login or signup, people with no wedding go to `/onboarding` (built in 1D).
- Tests: `tests/lib/api-client.test.ts`.
- After a manual test pass (about 110 checks in Chrome, desktop and phone), fixed: password no longer reaches the URL if a form is submitted before JavaScript loads (`method="post"`), a flag stops double submits, small links and the show-password button have bigger tap areas (`tap-area` utility, 48px button), logged-in people are sent from `/login`, `/signup` and `/forgot-password` to `/dashboard` (reset links still open), and the "Log in instead" link no longer wraps.

### Phase 1, steps 1A and 1B: models and auth API

- Mongoose models: `users`, `passwordResets` (`modules/auth/model.ts`), `memberships`, `memberInvites` (`modules/members/model.ts`), `weddings` (`modules/weddings/model.ts`), `rateLimits` (`lib/rate-limit.ts`), all registered in `lib/models.ts`, with the indexes from the database design.
- `lib/rate-limit.ts` (`assertUnderLimit`, `recordHit`, `consume`) and the 450-a-day Gmail cap inside `sendMail()` (`EMAIL_CAP_REACHED`).
- `requireUser` and `requireMember` in `lib/access.ts` are implemented: the membership is loaded fresh on every request.
- Routes under `app/api/auth/`: `signup`, `login`, `logout`, `me`, `forgot-password`, `reset-password`, `change-password`. Logic is in `modules/auth/service.ts`.
- Tests: models, auth routes, access checks, rate limits and the email cap.

### Scaffold (`0e35f25`)

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 theme tokens in `app/globals.css`.
- Shared library in `lib/`: `db` (cached Mongoose connection), `env` (validated per area), `session` (JWT), `access` (`requireUser`, `requireMember`), `api` (`handler()`, body and query parsing, Origin check), `errors`, `tokens` (hash and AES-GCM), `money`, `dates`, `ids`, `r2`, `mailer`.
- `GET /api/health` checks the database connection.
- Placeholder pages for every route in `(auth)`, `(dashboard)`, `w/[slug]`, `i/[token]`, `u/[token]`.
- Vitest with an in-memory MongoDB replica set; scripts `db:indexes` and `db:seed`.

### Landing page (`0bba447`)

- Public home page at `/`, built to match the Stitch screen "Unified Luxury Editorial Landing Page". `proxy.ts` sends anyone with a valid session to `/dashboard`.
- Sections: header, hero with dashboard preview, "WhatsApp groups → one calm workspace" band, six feature cards, "For your guests" with two phone mockups, "How it works", roles, privacy, FAQ, final call-to-action, footer. Code in `app/(marketing)/` and `components/landing/`.
- Shared components: `Button`/`ButtonLink`, `Logo`/`Monogram`, Material Symbols icons in `components/icons.tsx`.
- Link-preview image (`app/(marketing)/opengraph-image.tsx`), `robots.txt`, noindex on `(auth)` and `(dashboard)` pages, page rebuilt daily.
- Verified against Stitch by side-by-side measurement: desktop within 2px, tablet within 4px.
- Tests: proxy redirects, landing page links, `appUrl()`.

## Not started yet

Phases 2–9. Every `(dashboard)` page except the dashboard and Members is still a placeholder heading, and so are the public pages (`/w`, `/i`, `/u`).

## Decisions made during the build

Approved changes or choices not obvious from the design docs. Newest first.

| Date | Decision |
| --- | --- |
| Nov 1, 2026 | Stitch has no Members page, so `/members` follows the dashboard's look (cards, hairline borders, pills). If a Members design is added later, restyle to it. |
| Nov 1, 2026 | The accept-invite page uses the app's date style ("14 February 2027") and Instrument Serif, not the design's "February 14, 2027" and default serif, so it matches the rest of the app. It omits the "agree to Terms and Privacy" line until those pages exist (same as signup). |
| Nov 1, 2026 | Accepting an invite adds `invitedBy` and `weddingDate` to the `GET /api/members/accept` answer, and an expired link is still described on the page (not by the API). api-design.md updated. |
| Nov 1, 2026 | Removing yourself with `DELETE /api/members/:id` behaves like Leave (the creator rule only protects against _other_ members). The creator can leave once another Admin exists. |
| Nov 1, 2026 | Onboarding step 3 shows the cover-photo drop zone from the design but it can't upload yet: the `PATCH /api/wedding` check that a `coverPhotoKey` was issued for this wedding needs the files module (`POST /api/files/upload-url`). "Skip for now" and "Create wedding" therefore do the same thing for now, and the zone says upload is coming. Needs a decision: build upload with the files module, or build it into onboarding earlier. |
| Nov 2, 2026 | `DELETE /api/wedding` is built now, covering the collections that exist. Each later phase adds its own collections to `deleteWedding`. |
| Nov 1, 2026 | The onboarding "live" dot and the amber waiting dot use the theme's muted success and warning colours, not Stitch's bright emerald and amber, because bright colours are not allowed by the palette. Added two tokens for design colours not in the palette: `mauve` and `plum-soft`; and `champagne-dark` for the role badge. |
| Nov 2, 2026 | A wedding date must be within 2 years back and 10 years ahead of today (past dates in that range are allowed, with a note). The countdown says "N days ago" afterwards. |
| Nov 1, 2026 | Approved: a password reset or change ends every other session. `users.passwordChangedAt` is set, `requireUser` refuses a session issued before it (401), and the person who changed it gets a new cookie. Added to database-design, system-design and api-design. |
| Nov 1, 2026 | The per-IP login and signup limits are skipped for local addresses (`::1`, `127.0.0.1`, none) outside production, so one person's mistakes can't lock everyone out while developing. Per-email limits still apply, and production always counts every address. |
| Nov 1, 2026 | Auth pages: the plum side panel is hidden on phones and becomes a brand bar; all four pages use the login screen's 45/55 split (Stitch's signup and forgot frames used slightly different splits inside a review wrapper). |
| Nov 1, 2026 | Signup page has no "By creating an account you agree to the Terms and Privacy Policy" line, because those pages don't exist yet (same reason as the landing footer). Add it back when they do. |
| Nov 1, 2026 | Inter now loads weight 600 as well as 400 and 500, because the Stitch auth screens use semibold for eyebrows and the guest note. |
| Nov 1, 2026 | Approved: `POST /api/auth/change-password` answers a wrong current password with `INVALID_CREDENTIALS` as 401, following the error-code table. The endpoint text in api-design.md still says 400 and should be corrected. |
| Nov 1, 2026 | Approved: 8-character minimum. Passwords are also limited to 72 bytes, because bcrypt ignores the rest. |
| Oct 26, 2026 | Landing page FAQ answers follow the PRD, not the Stitch placeholder copy (guest uploads are by QR only; every Manager can see Money; no budgets; exports are Excel and a photo zip). |
| Oct 26, 2026 | On phones, the landing page's dashboard preview uses a compact layout (no sidebar, two stat cards per row) instead of Stitch's stacked one. The header also keeps a non-wrapping layout on phones and tablets. |
| Oct 26, 2026 | Landing page footer has no Privacy or Terms links until those pages exist. |
| Oct 25, 2026 | Screens with a Stitch design are built to match it exactly. The landing page uses Stitch's fonts (Cormorant Garamond, Plus Jakarta Sans), shapes and shadows. Other pages keep Instrument Serif and Inter. See CLAUDE.md, UI section. |
| Oct 25, 2026 | Icons are Material Symbols, copied as inline SVG. No icon font or library. |
| Oct 25, 2026 | A public landing page at `/` was added (not in the original PRD); PRD and system design updated. |
| Oct 24, 2026 | `bcryptjs` instead of `bcrypt`, to avoid native builds on Windows and Vercel. |

## Known issues and notes

- Reset emails can't be received locally until `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set in `.env.local`. The reset link is deliberately never logged (CLAUDE.md: never log a token).
- The reset link's token stays in the address bar while the page is open. Removing it would make a page refresh show "link expired", so it was left as is.
- Turbopack can also keep serving old CSS after `globals.css` changes in a long-running `next dev`. Restart it if a style change doesn't show.
- After a Mongoose schema change, restart `next dev`: the hot-reloaded server keeps the old model (`models.X ?? model(...)`), so a new field is silently ignored until then.
- Server pages call `pageUser()`/`pageMember()` (not only the proxy) because `proxy.ts` redirects `/login` to `/dashboard` for anyone with a valid-looking cookie. A dead session is cleared through `/api/auth/clear`.
- Don't call `router.refresh()` on `/onboarding` after creating the wedding: the page redirects anyone who has a wedding to the dashboard, which cuts the ready screen short.
- The address shown on the onboarding preview is the base address. If it is taken, the real one gets a number (`-2`). Nothing shows the final address yet; Website settings (Phase 7) will.
- `next dev` (Turbopack) sometimes doesn't pick up Tailwind classes from brand-new files. Restart the dev server after adding new component files if styles look missing.
- One Gmail account is shared by every wedding, with a 450-a-day cap (accepted for v1; see CLAUDE.md).
- PRD open questions still unanswered: how long photos are kept after the wedding, and the default RSVP cut-off.

## How to update this file

Update this file in the same commit as the work, whenever you:

- finish a feature, a phase step or a whole phase: move it to **Done** with its commit, and update **At a glance** and **Next up**;
- make or get approval for a decision that changes or interprets the docs: add a row to **Decisions** (and update the docs themselves, as CLAUDE.md requires);
- find a limitation, workaround or open question worth knowing next session: add it to **Known issues and notes**.

Always refresh the **Last updated** line. Keep entries short; link to code paths rather than describing them in detail.
