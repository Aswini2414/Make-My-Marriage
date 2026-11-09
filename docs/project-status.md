# Make My Marriage — Project Status

**Last updated:** Nov 9, 2026 · **Branch:** `dev` · **Last feature commit:** Phase 2D, the dashboard numbers (see `git log`), followed by the first-deploy preparation (see Done). 2C (tasks backend and Tasks page) is `d8c14dc`, 2A and 2B are `3eb6ea0`, Phase 1 is `715c68d`.

This file tracks how far the build has got. It is a progress log, not a design document: the PRD, system design, database design and API design stay the source of truth for _what_ to build. Read it at the start of every session, and update it whenever a feature or phase step is finished (see [How to update](#how-to-update-this-file)).

## At a glance

| Phase (PRD build order) | Status |
| --- | --- |
| 0. Scaffold | ✅ Done |
| Landing page (added outside the PRD phases) | ✅ Done |
| 1. Setup and accounts | ✅ Done (1A–1E) |
| 2. Events, tasks and dashboard | ✅ Done (2A–2D) |
| 3. Guests | ⬜ Not started |
| 4. Invitations and RSVP | ⬜ Not started |
| 5. Money: expenses and gifts | ⬜ Not started |
| 6. Vendors | ⬜ Not started |
| 7. Wedding website and live stream | ⬜ Not started |
| 8. Photo sharing | ⬜ Not started |
| 9. Testing and launch | ⬜ Not started |

**Next up:** Phase 3, Guests: the guest list, CSV and Excel import, assigning guests to events, and the guest counts that fill the dashboard's RSVP card and the events' invited numbers (each place has a `TODO(Phase 3)`). Open decision from 1D: build cover-photo upload with the files module (Phase 8), or earlier. Cover-photo upload is still waiting for that module.

## Done

### Preparing the first production deploy to Vercel (not deployed yet)

- Build, lint, typecheck and the whole suite pass. [docs/deployment.md](deployment.md) is the checklist: accounts, variables (names only), first deploy, smoke test, rollback. `vercel.json` sets the function region to `bom1`.
- `.env.example` now gives the exact format and generator for every variable, and says which are needed when. **`APP_URL` is needed at build time** (the root layout's `metadataBase` reads it, and `/` is prerendered): a build with a bad `APP_URL` fails. A build needs no database, JWT, encryption, Gmail or R2 variables. R2 is not needed until Phase 8.
- Env checks are lazy, per area (`coreEnv`, `mailEnv`, `r2Env`): nothing is validated at server start. New `mongoUri()` in `lib/env.ts` reads only `MONGODB_URI`, so `npm run db:indexes` needs nothing else. The db scripts use `--env-file-if-exists`, so they run without a `.env.local`, and a `MONGODB_URI` set in the shell wins over the file.
- `db:seed` now also refuses when `NODE_ENV=production`, before it connects (it already refused database names not ending in `_dev`).
- Checked on a real production build with throwaway values: `mmm_session` is `Secure; HttpOnly; SameSite=lax` (also when cleared); a write with a missing or foreign `Origin` answers 403 `FORBIDDEN_ORIGIN`; `/w`, `/i`, `/u` send `X-Robots-Tag: noindex, nofollow` and a robots meta tag, and the `(auth)`, `(dashboard)` and onboarding pages carry the meta tag; an unexpected error answers `SERVER_ERROR` with no details; the server log held no password, token or secret.
- Tests: 2 new in `tests/lib/env.test.ts` (313 in all).

### Phase 2, step 2D: the dashboard shows real numbers

- `GET /api/dashboard` (any active member), `modules/dashboard/service.ts`. It returns the countdown inputs, the next 5 events from today on (new `listUpcomingEvents` in the events service: name, type, date, time, venue, invited count), the task summary and "my tasks" from the existing `listTasks` (so the overdue rule is still only `taskOverdue`), the setup flags, and for Admins the names of pending invites (only 3 of the member's open tasks are loaded; counts still cover all). `rsvp` and `money` are `null` with TODOs (Phase 3 and 4 for RSVP, Phase 5 for money): nothing is invented.
- `/dashboard` follows the Stitch screen "Desktop Dashboard (All States)": a stat row (Countdown, RSVP, Total spent, Tasks "N of M done" with a plum bar and "N pending / N overdue"), then "Upcoming events" (up to 5 rows, type chip, "View all events") beside "My tasks" (the member's next 3 open tasks, "View all tasks" to `/tasks?view=mine`), an Admin-only strip "2 invites waiting to be accepted: Sita and Ravi", and the setup checklist. RSVP and Total spent stay as quiet "not started" cards with a link ("Add your guests to see replies here", "Record your first expense to see the total"). Empty events and empty tasks have their own empty states with "Add event" and "Add task". No payments-due card.
- The setup checklist is now four items (events, first task, guests, invite family) ticked from real data, each still linking to its page. It disappears once every item that can be done yet is done (guests are not built, so they do not hold it open until Phase 3); a pending invite does not tick "invite family", only a member who has joined does.
- Admins and Managers see the same page, except the invites strip (Admin only, as in the PRD and the design). Phones: one column, all links and buttons at least 44px tall.
- Checked in Chrome at 1280 and 390 px beside the Stitch crops, for a brand-new wedding, a wedding with events and tasks (with a past event, which is left out), an Admin, a Manager with their own tasks, and overdue tasks. Not covered: a production build.
- Cover-photo upload was not touched: it still waits for the files module (Phase 8).
- Tests: `tests/modules/dashboard.test.ts` (14, service and route against the real database) and `dashboard-ui.test.ts` (6).

### Phase 2, step 2C-2: Tasks page

- `/tasks`, built to the Stitch screen "Desktop Tasks (All States)": header "Your tasks", four stat cards (Total tasks, To do, Done, Overdue), the tabs All tasks | My tasks | Overdue (the overdue count shows on the tab when above 0), Event and Status dropdowns, a search box, and one white card listing the tasks. Rows have a round check, title, event chip ("All events" when none), initials circle and name ("(removed)" for someone who left), due date with an Overdue tag (on the Overdue tab "N days overdue" or "Due yesterday"), To do / Done pill and an edit pencil. Done rows are muted and struck through. Below 1024px a row is two lines.
- The server page loads everything once (`listTasks`, `listMembers`, `listEvents`, `todayIST()`); `components/tasks/TasksView.tsx` filters in the browser and keeps tab, event, status and search in the address bar with the native History API, so refresh and Back work. `filterTasks`, `summarize` and `sortTasks` in `modules/tasks/format.ts` give the same answers as the API (a test compares them with the real service for every filter).
- The check circle marks done or reopens at once and rolls back with a message if the server refuses (403 shows "Only the assignee or an Admin can mark this done."). For a Manager who is not the assignee it is disabled, with that text as tooltip and screen-reader label. Add and Edit use one 480px drawer (`TaskDrawer.tsx`): Title*, Assigned to*, Due date*, Linked event, Note; the edit drawer adds "Status is currently …" with Mark as done / Reopen, the lock line for people who cannot change the status, and "Delete task" with a confirm. Edit sends only the changed fields, so a task whose assignee has left can still be renamed. Empty state has the four template chips; a filtered list with no hits says "No tasks match these filters" with Clear filters.
- Shared pieces made along the way: `components/form/DatePicker.tsx` (the onboarding calendar, moved here with optional `min` and `max`), `DateField.tsx` (a date field that opens it), `InlineSelect.tsx` (the compact "Event: All events" dropdown), `components/ui/useDiscardGuard.ts` and `DiscardPrompt.tsx` (the "Discard your changes?" logic that was inline in `EventDrawer`, now shared by both drawers), and a `width="narrow"` option on `Drawer`.
- Checked in Chrome at 1280 and 390 px beside the Stitch crops, as an Admin, as a Manager who is the assignee, and as a Manager who is not (including a forced 403 to see the rollback). Also checked after the shared changes: the Events drawer's discard prompt and the onboarding calendar. Found nothing broken in the app. Not covered: a production build.
- Tests: `tests/modules/tasks-ui.test.ts` (12 tests).

### Phase 2, step 2C-1: tasks backend

- API (all Member access): `GET` and `POST /api/tasks`, `GET`, `PATCH` and `DELETE /api/tasks/:id`, `POST /api/tasks/:id/done` and `/reopen`. Logic in `modules/tasks/service.ts`; browser-safe schemas in `modules/tasks/schema.ts` (the title error reads "Please give the task a title."); the shapes the page will use in `modules/tasks/types.ts` (`TaskItem`, `TaskList`, `TaskCounts`); model in `modules/tasks/model.ts` with the two indexes from the database design.
- The list takes `view` (`all`, `mine`, `overdue`), `status`, `eventId`, `assigneeId` and `q` (title search, any case, regex characters are plain text). It answers `{ items, summary, mine }`: `summary` is `{ total, todo, done, overdue }` for the whole wedding and `mine` is the same for the logged-in member, both ignoring the filters. Order: open tasks by due date (so overdue first), then Done tasks. Each task carries the assignee's name and initial, `removed`, the event name, `overdue` and `daysOverdue`.
- Rules, all tested: the assignee must be an active member of this wedding (400 `ASSIGNEE_NOT_MEMBER`); a linked event must be this wedding's (400 with `fields.eventId`, the same answer for an unknown id); the assignee or any Admin can mark done or reopen, any other Manager gets 403 `NOT_ASSIGNEE`; done and reopen are safe to repeat and keep the first finisher; `PATCH` can't change the status; any Admin or Manager can create, edit and delete.
- One overdue rule: `taskOverdue` in `modules/tasks/overdue.ts` (To do and due before today in India Standard Time, via `todayIST()`). The list's overdue filter and the summary use the same `today`.
- Deleting an event keeps its tasks and clears their event link (`modules/events/dependents.ts`; the delete-impact preview's `tasks` count is real, and the existing delete modal already words it "kept, but unlinked"). `deleteWedding` deletes the wedding's tasks in the same transaction.
- `docs/api-design.md` is updated for `q`, `summary`, `mine`, `GET /api/tasks/:id`, and the extra task fields.
- Tests: `tests/modules/tasks.test.ts` (36 tests, real database).

### Phase 2, step 2B: Events page

- `/events` (built to match the Stitch screen "Desktop Events (All States)"): server page loads the list and the wedding's custom types (`listEvents`, `getEventTypes`), `components/events/EventsView.tsx` handles the rest. Events are grouped under a date heading ("Friday, 12 February 2027 · 1 event", or "Wedding Day" when the day has the Wedding event). Cards show the date tile, name, type chip, time, venue with a Map link, dress code, address, "Live link added", "N invited", Edit and a three-dot menu (Edit, Delete). Empty state has the default-type chips; a chip opens the Add drawer with that type chosen.
- Add and edit are one drawer (`EventDrawer.tsx`) using the same Zod schemas as the API; server `fields` errors show under each field. **+ Add new type** reveals an inline field that calls `POST /api/events/types`, then selects the new type; a duplicate shows "This type already exists." Delete (from the card menu or the edit drawer) opens `DeleteEventModal.tsx`, which lists only what the delete-impact API says would change.
- After a save or delete the page updates its own list from the API answer. It does not call `router.refresh()`.
- Shared pieces for the next modules: `components/ui/Drawer.tsx`, `Modal.tsx` and `useFocusTrap.ts` (Tab stays inside, Escape closes, focus returns to the opener, page scroll locked), `components/form/Select.tsx` (native select), `TextArea.tsx`, and `caps` / `optional` options on `TextField`. `lib/api-client.ts` gained `getJson`. Pure helpers in `modules/events/format.ts` (`groupEventsByDate`, `eventTypeOptions`, `typeChipLabel`) and `formatTime12` / `dateTileParts` in `lib/dates.ts`.
- Checked in Chrome at 1280 and 390 px against the Stitch screenshot: every state except the Manager view (same page, no role-specific UI). Found and fixed: a long unbroken dress code widened the page on phones. Keyboard checked: Escape, Tab trap, focus return, three-dot menu arrow keys.
- Tests: `tests/modules/events-ui.test.ts` (17: grouping, time and date formats, the type dropdown, the shared form schemas). The test setup is node-only, so drawer and modal behaviour was checked in the browser, not in unit tests.
- 2A and 2B went in as one commit, because the 2A service now shares its types with `modules/events/format.ts` from 2B.
- Manual test pass (a real Chrome window against a throwaway database, email sending turned off): landing, route guards, signup, the three onboarding steps, dashboard, log in and out, wrong-password and rate-limit messages, forgot and reset password screens, settings, Members as Admin and as Manager, all Events states at 1280 and 390 px, a second couple's data staying separate (404 on every route), and deleting a wedding. No application bugs found. Not covered: real email delivery (invites, reset links). Check those once with the real Gmail.

### Phase 2, step 2B review fixes

- Deleting an event that is already gone (another tab or member) now drops it from the list instead of showing an error forever. A save or delete in progress can't be closed or started twice (Escape, backdrop, Cancel and Delete are held until the answer arrives), so a late answer can't close a different panel.
- The Add and Edit drawer asks "Discard your changes?" (focus on **Keep editing**) before Escape, the backdrop, Cancel or the close button throws away typing. A clean drawer still closes at once.
- Adding a custom type: duplicates are decided in one place in JavaScript (`sameType`: ignores case and Unicode composition), and the write only succeeds if the list is still exactly what was checked, retrying otherwise. This fixes accented and non-Latin names being misreported as "too many types". The page now takes the saved list from the API answer, so the dropdown always matches what the server stores (and picks up types added by someone else).
- `PATCH /api/events/:id` answers 404 for a missing event before it checks the type.
- `useFocusTrap` skips hidden controls when wrapping Tab. The event and delete-impact types are shared by server and browser (`EventItem`, `Impact`, `IMPACT_KEYS` in `modules/events/format.ts`), so a later phase that adds a key can't silently drift. Tests: 4 new in `tests/modules/events.test.ts`.

### Phase 2, manual-test fixes

A manual end-to-end test of events and tasks (about 190 API checks, 24 in Chrome on desktop and phone) found three small issues, now fixed:

- Tasks page filters (tab, event, status) are React state mirrored to the address bar, so the list changes at once on click instead of after the router catches up. Back and Forward still work (`popstate`), and so does a link to `/tasks` from elsewhere.
- Missing or wrong-type required fields on events, tasks and calendar dates answer with the app’s plain wording ("Enter the event name.") instead of Zod’s "Invalid input: expected string…".
- A task `dueDate` must be within five years back and ten ahead of today, in the API as well as in the date picker (`DUE_YEARS_BACK` and `DUE_YEARS_AHEAD` in `modules/tasks/schema.ts`). Editing another field of an older task doesn’t re-check its date. Event dates are still unbounded (see Decisions).

### Phase 2, step 2A review fixes

- Event `mapLink` and `youtubeLink`: `HTTPS://…` is accepted, and `https:host` (no `//`) is refused with a 400. Before, Zod and the model disagreed and these crashed as a 500. Two new tests in `tests/modules/events.test.ts` (35 now).
- `reserve()` in `lib/rate-limit.ts` counts only hits up to its own (`_id <= hit._id`), so concurrent sends near the 450 email cap no longer all refuse together: the first ones in line get the free places.
- Fixed the `RequestInit` type error in `tests/lib/api.test.ts`. Typecheck, lint and all 231 tests pass.

### Phase 2, step 2A: events backend

- API (all Member access): `GET` and `POST /api/events`, `GET`, `PATCH` and `DELETE /api/events/:id`, `GET /api/events/:id/delete-impact`, `GET` and `POST /api/events/types`. Logic in `modules/events/service.ts`; shared Zod schemas (browser-safe, for the 2B form) in `modules/events/schema.ts`; model in `modules/events/model.ts`.
- Events list in date then time order. Time is `HH:mm`; map links must be `https`; live links must be `https` on `youtube.com`, `www.`, `m.` or `youtu.be`. `null` clears an optional field on PATCH. Other wedding's ids answer 404.
- Custom event types are `weddings.customEventTypes` (as in database-design.md), not a collection. Adding is a checked write (see the 2B review fixes): duplicates (case-insensitive, also against the 8 defaults) answer 409 `TYPE_EXISTS`, the 31st answers `TOO_MANY_TYPES`, even with several requests at once.
- `modules/events/dependents.ts` is where every module that points at an event plugs in a `count` (for delete-impact) and a `cleanup` (run in the delete transaction). Today only `qrCodes` is real; `guests`, `rsvps`, `expenses`, `gifts`, `tasks`, `vendors` and `photos` are zero stubs, each marked with the phase that fills it in. `guestCounts` and `rsvpCounts` in the same file are stubs for `guestCount` and the `rsvp` block of `GET /api/events/:id`.
- `deleteWedding` also deletes the wedding's events; the comment above it states the rule for event-pointing modules.
- Tests: `tests/modules/events.test.ts` (39 tests with the 2A and 2B review fixes).

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
| Nov 9, 2026 | First deploy: Preview deployments get their own address, so writes there fail the Origin check (`APP_URL` is one fixed address). Production variables are set for the Production scope only, so a preview never touches the production database. Indexes are created by hand with `db:indexes` before the first signup (production has `autoIndex` off). |
| Nov 5, 2026 | Dashboard: `tasks.mine` in `GET /api/dashboard` is `{ pending, overdue, next }` with the next 3 open tasks (api-design.md said an array of 5); upcoming events also carry `type` and `guestCount`; `pendingInviteNames` and `setup` are new. A brand-new wedding shows the empty Upcoming events and My tasks cards above the checklist (Stitch's new-wedding frame hid them). Done checklist items show a tick and a struck-through title instead of disappearing one by one. The tasks progress track uses the `mist` token (#E5DEE8), the design's value. |
| Nov 5, 2026 | Tasks page: filtering happens in the browser on the full list (the API's `listTasks` is called once, unfiltered), and the filters live in the address bar (`?view=mine&status=todo&event=…&q=…`). Tab, event and status changes add a history entry; typing in search replaces it. The page's counts come from the same list, never from the filtered rows. |
| Nov 5, 2026 | Tasks page follows its Stitch screen where it differs from the Events page: the title is the larger size (`text-4xl sm:text-5xl`), event chips are not upper-case, and the My tasks tab shows the "Showing tasks assigned to you · N pending · N completed" strip. Not built: the design's "Active filter: Event … ✕" strip (the Event dropdown already shows and clears it), a "Nudge" button, and a date-grouped list (the design has none). Avatars use one lilac tint instead of the design's per-person colours (palette rule). |
| Nov 5, 2026 | Task rows' check circle is `aria-disabled` rather than `disabled` for people who may not change the task, so keyboard and screen-reader users can still reach the reason. The edit drawer shows a removed assignee as "Name (removed)" and only sends changed fields. |
| Nov 5, 2026 | Overdue means status To do and due date before today in India Standard Time (`todayIST()`). A task due today is not overdue; it becomes overdue at midnight IST. One helper, `taskOverdue`, feeds the flag, the list filter and the summary, so there is no second rule. |
| Nov 5, 2026 | When a member is removed or leaves, their tasks are not deleted. The list keeps their name with `removed: true`, they still count in the totals, and any Admin or Manager can reassign the task (only to an active member). If they rejoin, they show as active again. |
| Nov 5, 2026 | Deleting an event keeps its tasks and clears their event link. The task fields stay `completedAt` and `completedBy` as in the database design (not `doneAt`). A linked event from another wedding is a 400 field error, the same as an unknown id, so nothing leaks. |
| Nov 5, 2026 | Added to the task API beyond the first api-design text, and documented there: `GET /api/tasks/:id`, `q` (title search), and the `summary` and `mine` counts on the list. Task lists are not paginated. |
| Nov 5, 2026 | Task `dueDate` is limited to five years back and ten ahead, in the API too, matching the date picker. Event dates keep no bounds, as decided for 2A. api-design.md updated. |
| Nov 4, 2026 | Events page: dates and times use the browser's native date and time inputs, and the type dropdown is a native select (with a divider line and "+ Add new type" last), instead of Stitch's custom pickers. They are keyboard- and phone-friendly and already produce `YYYY-MM-DD` and `HH:mm`. |
| Nov 4, 2026 | Events page copy follows the app's wording, not the design's: "Select event type…", "Or start with an event type", "It will stay in your list for future events.", "This type already exists." (the design said ritual, ceremony and catalog). Form inputs stay `h-12 rounded-input` (CLAUDE.md), the drawer's labels use Stitch's small grey capitals, and the italic accent words use `champagne-deep`. |
| Nov 4, 2026 | Managers see exactly the same Events page as Admins: Stitch's "same access as Admins, except…" note and any role badge are not built. The type chip for "Wedding (Muhurtham)" reads "Wedding", as in the design. Dress code and address lines are left out when empty. The delete modal also lists tasks, vendors and photos when those exist (the design shows guests, RSVPs, expenses, gifts and the QR code). |
| Nov 4, 2026 | Custom event types are the embedded `weddings.customEventTypes` array from database-design.md, not a separate collection (the 2A brief mentioned a model for them). No new collection was added. |
| Nov 4, 2026 | Event `mapLink` must be an `https` URL (any host, as the database design says); `youtubeLink` must be `https` on a YouTube host. An event `type` must match a default or the wedding's custom type exactly as spelled. Event dates only need to be real calendar dates (no wedding-date bounds). |
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

- The test suite starts an in-memory MongoDB, which can exceed Vitest's default 10 s hook timeout on a slow machine. If `beforeAll` times out, run `npx vitest run --hookTimeout=120000 --testTimeout=60000`.
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
