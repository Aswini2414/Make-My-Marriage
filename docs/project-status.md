# Make My Marriage — Project Status

**Last updated:** Oct 26, 2026 · **Branch:** `dev` · **Last feature commit:** `0bba447` (landing page)

This file tracks how far the build has got. It is a progress log, not a design document: the PRD, system design, database design and API design stay the source of truth for _what_ to build. Read it at the start of every session, and update it whenever a feature or phase step is finished (see [How to update](#how-to-update-this-file)).

## At a glance

| Phase (PRD build order) | Status |
| --- | --- |
| 0. Scaffold | ✅ Done |
| Landing page (added outside the PRD phases) | ✅ Done |
| 1. Setup and accounts | 🟡 In progress: scaffold only, accounts not started |
| 2. Events, tasks and dashboard | ⬜ Not started |
| 3. Guests | ⬜ Not started |
| 4. Invitations and RSVP | ⬜ Not started |
| 5. Money: expenses and gifts | ⬜ Not started |
| 6. Vendors | ⬜ Not started |
| 7. Wedding website and live stream | ⬜ Not started |
| 8. Photo sharing | ⬜ Not started |
| 9. Testing and launch | ⬜ Not started |

**Next up:** Phase 1 accounts: signup, login, forgot and reset password, create workspace and wedding details ("Create your wedding" onboarding), member invites and accept invite. Stitch has designs for all of these screens.

## Done

### Scaffold (`0e35f25`)

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 theme tokens in `app/globals.css`.
- Shared library in `lib/`: `db` (cached Mongoose connection), `env` (validated per area), `session` (JWT), `access` (`requireUser`, `requireMember`), `api` (`handler()`, body and query parsing, Origin check), `errors`, `tokens` (hash and AES-GCM), `money`, `dates`, `ids`, `r2`, `mailer`.
- `GET /api/health` checks the database connection.
- Placeholder pages for every route in `(auth)`, `(dashboard)`, `w/[slug]`, `i/[token]`, `u/[token]`.
- Vitest with an in-memory MongoDB replica set; scripts `db:indexes` and `db:seed`.
- No Mongoose models yet (`lib/models.ts` is empty).

### Landing page (`0bba447`)

- Public home page at `/`, built to match the Stitch screen "Unified Luxury Editorial Landing Page". `proxy.ts` sends anyone with a valid session to `/dashboard`.
- Sections: header, hero with dashboard preview, "WhatsApp groups → one calm workspace" band, six feature cards, "For your guests" with two phone mockups, "How it works", roles, privacy, FAQ, final call-to-action, footer. Code in `app/(marketing)/` and `components/landing/`.
- Shared components: `Button`/`ButtonLink`, `Logo`/`Monogram`, Material Symbols icons in `components/icons.tsx`.
- Link-preview image (`app/(marketing)/opengraph-image.tsx`), `robots.txt`, noindex on `(auth)` and `(dashboard)` pages, page rebuilt daily.
- Verified against Stitch by side-by-side measurement: desktop within 2px, tablet within 4px.
- Tests: proxy redirects, landing page links, `appUrl()`.

## Not started yet

Everything in Phases 1–9 beyond the scaffold. In particular, no Mongoose models, services or API routes exist yet, and every `(auth)` and `(dashboard)` page is still a placeholder heading. The landing page's "Log in" and "Create your wedding" buttons lead to those placeholders.

## Decisions made during the build

Approved changes or choices not obvious from the design docs. Newest first.

| Date | Decision |
| --- | --- |
| Oct 26, 2026 | Landing page FAQ answers follow the PRD, not the Stitch placeholder copy (guest uploads are by QR only; every Manager can see Money; no budgets; exports are Excel and a photo zip). |
| Oct 26, 2026 | On phones, the landing page's dashboard preview uses a compact layout (no sidebar, two stat cards per row) instead of Stitch's stacked one. The header also keeps a non-wrapping layout on phones and tablets. |
| Oct 26, 2026 | Landing page footer has no Privacy or Terms links until those pages exist. |
| Oct 25, 2026 | Screens with a Stitch design are built to match it exactly. The landing page uses Stitch's fonts (Cormorant Garamond, Plus Jakarta Sans), shapes and shadows. Other pages keep Instrument Serif and Inter. See CLAUDE.md, UI section. |
| Oct 25, 2026 | Icons are Material Symbols, copied as inline SVG. No icon font or library. |
| Oct 25, 2026 | A public landing page at `/` was added (not in the original PRD); PRD and system design updated. |
| Oct 24, 2026 | `bcryptjs` instead of `bcrypt`, to avoid native builds on Windows and Vercel. |

## Known issues and notes

- `next dev` (Turbopack) sometimes doesn't pick up Tailwind classes from brand-new files. Restart the dev server after adding new component files if styles look missing.
- One Gmail account is shared by every wedding, with a 450-a-day cap (accepted for v1; see CLAUDE.md).
- PRD open questions still unanswered: how long photos are kept after the wedding, and the default RSVP cut-off.

## How to update this file

Update this file in the same commit as the work, whenever you:

- finish a feature, a phase step or a whole phase: move it to **Done** with its commit, and update **At a glance** and **Next up**;
- make or get approval for a decision that changes or interprets the docs: add a row to **Decisions** (and update the docs themselves, as CLAUDE.md requires);
- find a limitation, workaround or open question worth knowing next session: add it to **Known issues and notes**.

Always refresh the **Last updated** line. Keep entries short; link to code paths rather than describing them in detail.
