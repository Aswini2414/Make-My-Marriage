# Make My Marriage — System Design (v1)

Oct 19, 2026 · @Leela Manikanta Cheekatla

## Overview

This document describes how version 1 of Make My Marriage is built. It turns the requirements in the PRD into an architecture, a data model, an API and the key technical flows. It's written for one developer building alone on free-tier services.

### Design decisions

| Area | Decision | Why |
| --- | --- | --- |
| Architecture | One Next.js app (App Router), a monolith | One codebase, one deploy, one language. Next.js route handlers replace a separate Express server. |
| Language | TypeScript throughout | Catches mistakes early when building alone. |
| UI | Tailwind CSS with our own components, no component library | Full control and fewer dependencies. |
| Database | MongoDB Atlas, with Mongoose | Managed cluster, flexible documents, free tier. |
| Validation | Zod on every form and API input | One schema checks both the browser and the server. |
| Login | Our own email and password login with JWT, no auth library | Simple, and fully understood. |
| Photos and receipts | Cloudflare R2, private bucket | 10 GB free and no download fees, which suits a busy gallery. |
| Email | Gmail SMTP through Nodemailer, with an App Password | Free, no domain needed, about 500 recipients a day. |
| Hosting | Vercel free plan | Built for Next.js, no server to manage. |
| Organisation | Code grouped by module | Each module's pages, API and models live together. |

### What's not in this design

- No microservices, message queues or separate backend server.
- No custom domain in v1. The app runs on a `vercel.app` address, and a domain can be added later without code changes.
- No real-time features such as live chat or push notifications.

## Architecture

The whole product is one Next.js app. Pages and the API live in the same codebase and deploy together to Vercel. The app talks to three outside services: MongoDB Atlas for data, Gmail SMTP for email, and Cloudflare R2 for files.

&#91;embedded content: system architecture · 1 app, 3 services\]

Photos are the one exception to everything going through the app. They upload straight from the browser to R2, because Vercel limits a single request to about 4.5 MB and phone photos are often larger.

### Parts of the app

| Part | What it does |
| --- | --- |
| Pages and UI | React pages for the dashboard and every module, the public wedding website, the guest invitation and RSVP page, and the QR upload page |
| Route handlers | The API, under `/api`, grouped by module. Each handler validates input with Zod, checks access, then reads or writes data |
| Shared library | Code every module uses: database connection, Mongoose models, JWT and password helpers, access checks, and the R2 and email clients |
| Proxy (formerly middleware) | Runs before every request to logged-in pages, and sends anyone without a valid session to the login page |

### How a request flows

1. A member clicks something in the dashboard, for example "Add expense".
2. The browser sends the request to a route handler, with the session cookie attached.
3. The handler reads the JWT from the cookie and finds the member's wedding and role.
4. It validates the input with Zod and rejects anything malformed.
5. It reads or writes MongoDB, always filtered by that member's `weddingId`.
6. It returns JSON, and the page updates.

### Rendering

| Page | How it renders | Why |
| --- | --- | --- |
| Wedding website | On the server | Loads fast and shows a proper link preview when shared. Marked `noindex` so search engines skip it |
| Guest invitation and RSVP page | On the server, using the token in the link | No login needed, and the guest sees only their own events |
| QR upload page | On the server for the shell, then in the browser for uploads | Uploading and compressing happen in the browser |
| Dashboard and modules | In the browser, behind login | Interactive pages with forms, filters and tables |

## Project structure

Routes live in `app/`, as Next.js requires. Everything else is grouped by module in `modules/`, so each module's models, validation and logic sit together.

```
make-my-marriage/
├── app/
│   ├── (auth)/                 login, signup, forgot and reset password, accept invite
│   ├── (dashboard)/            logged-in area, protected by middleware
│   │   ├── dashboard/
│   │   ├── events/
│   │   ├── guests/
│   │   ├── invitations/
│   │   ├── money/
│   │   ├── vendors/
│   │   ├── tasks/
│   │   ├── website/            website settings
│   │   ├── photos/
│   │   └── members/
│   ├── w/[slug]/               public wedding website
│   ├── i/[token]/              guest invitation and RSVP page
│   ├── u/[token]/              QR photo upload page
│   └── api/                    route handlers, one folder per module
├── modules/
│   ├── auth/                   password hashing, JWT, session helpers
│   ├── members/
│   ├── weddings/
│   ├── events/
│   ├── guests/
│   ├── invitations/            email templates, batch sending
│   ├── money/                  expenses, gifts
│   ├── vendors/
│   ├── tasks/
│   └── photos/
│       ├── model.ts            Mongoose schema
│       ├── schema.ts           Zod schemas
│       └── service.ts          business logic used by route handlers
├── components/                 our own UI components, built with Tailwind
├── lib/
│   ├── db.ts                   cached MongoDB connection
│   ├── access.ts               membership and Admin checks
│   ├── r2.ts                   signed upload and view URLs
│   ├── mailer.ts               Nodemailer with Gmail SMTP
│   └── tokens.ts               random tokens for invites, RSVP, QR
├── proxy.ts                    redirects to login without a valid session (Next.js 16 name for middleware.ts)
└── .env.local                  secrets, never committed
```

Each module folder has the same three files as `photos/`: `model.ts`, `schema.ts` and `service.ts`. Route handlers stay thin. They parse the request, call `access.ts`, then call the module's service.

### Our own components

The `components/` folder holds a small set of reusable pieces, styled with Tailwind:

- Button, Input, Select, Textarea, Checkbox
- Modal, ConfirmDialog, Toast
- Table with sorting and an empty state
- Card, Badge, Tabs
- FileDrop for uploads
- PageHeader and Sidebar for the dashboard layout

## Data model

MongoDB stores everything except files. Every collection except `users`, `passwordResets`, `sharedVendors` and `rateLimits` carries a `weddingId`, and every query on those collections filters by it.

### Rules for all collections

- **Money is stored in paise as whole numbers.** ₹80,000 is stored as `8000000`. This avoids rounding errors from decimals, and the UI formats it back to rupees.
- **Every document has `createdAt` and `updatedAt`**, through Mongoose timestamps.
- **Files are never stored in MongoDB.** A document keeps only the R2 object key, such as `weddings/<weddingId>/photos/<photoId>.jpg`.
- **Tokens are stored as hashes.** Invite, RSVP, QR and password-reset tokens are random strings sent in links. MongoDB keeps their SHA-256 hash for lookup. Guest invitation and QR tokens are also kept encrypted, so they can be re-sent or re-printed. A database leak alone doesn't expose working links.

### Collections

| Collection | Key fields | Notes |
| --- | --- | --- |
| `users` | name, email, passwordHash | Email is unique and stored lowercase |
| `weddings` | brideName, groomName, weddingDate, coverPhotoKey, slug, theme, websitePublished, galleryEnabled, customEventTypes, createdBy | `slug` is unique, for example `priya-weds-ravi` |
| `memberships` | weddingId, userId, role (admin or manager), status (active or removed), invitedBy | Links a user to their one wedding |
| `memberInvites` | weddingId, email, role, tokenHash, expiresAt, acceptedAt | Pending invites to join as Admin or Manager |
| `events` | weddingId, name, type, date, time, venueName, address, mapLink, dressCode, notes, youtubeLink | `date` and `time` are kept separate, matching the form |
| `guests` | weddingId, name, phone, email, relation, household, eventIds, inviteTokenHash | One personal invitation link per guest |
| `rsvps` | weddingId, guestId, eventId, attending, headcount, respondedAt | One document per guest per event |
| `invitationSends` | weddingId, kind (invite or reminder), eventIds, guestIds, sentCount, failedGuestIds, status, startedBy | Tracks batched sending and progress |
| `expenses` | weddingId, amountPaise, date, category, eventId, vendorId, paidBy, mode, note, receiptKey | `eventId` and `vendorId` are optional |
| `gifts` | weddingId, giverName, guestId, cashPaise, itemDescription, eventId, returnGift, returnGiftDone, note | Either cash or an item, or both |
| `vendors` | weddingId, name, category, city, contactPerson, phone, email, mapsLink, websiteLink, status, quote, notes, eventIds, sharedVendorId | Private to the wedding |
| `sharedVendors` | name, category, city, phone, mapsLink, websiteLink, addedByWeddingId | The community directory. Business details only, no `weddingId` filter on reads |
| `tasks` | weddingId, title, assigneeId, dueDate, eventId, status (todo or done), note, completedAt |  |
| `qrCodes` | weddingId, eventId, tokenHash, uploadsEnabled | `eventId` is empty for the whole-wedding QR code |
| `photos` | weddingId, eventId, key, thumbKey, uploaderName, hidden, sizeBytes | `sizeBytes` tracks storage use per wedding |
| `passwordResets` | userId, tokenHash, expiresAt, usedAt | Expires after 1 hour |

### Indexes

| Collection | Index | Purpose |
| --- | --- | --- |
| `users` | `email`, unique | Login lookup, no duplicate accounts |
| `weddings` | `slug`, unique | Website address lookup |
| `memberships` | `userId`, unique where status is active | Enforces one workspace per person at the database level. Pending invites live in `memberInvites` and are checked in code |
| `memberships` | `weddingId, role` | Member list and the at-least-one-Admin check |
| `guests` | `weddingId, name`; `inviteTokenHash`, unique | Guest list; invitation link lookup |
| `rsvps` | `guestId, eventId`, unique; `weddingId, eventId` | One answer per guest per event; headcounts |
| `expenses` | `weddingId, date` | Expense log in date order, total spent |
| `tasks` | `weddingId, status, dueDate`; `assigneeId` | Task summary, overdue list, My tasks |
| `photos` | `weddingId, eventId, createdAt` | Gallery by event |
| `sharedVendors` | `category, city` | Directory browsing |
| `memberInvites`, `passwordResets` | `tokenHash`, unique; `expiresAt` with a TTL | Link lookup; MongoDB deletes expired documents automatically |

## API design

All routes live under `/api` as Next.js route handlers and return JSON. The wedding is never passed in the URL for logged-in routes. It comes from the member's session, so one wedding can't reach another's data by changing an ID.

**Access levels:**

- **Public** needs nothing.
- **User** needs a valid session, with or without a wedding.
- **Token** needs a valid invitation or QR token in the URL.
- **Member** needs an active Admin or Manager.
- **Admin** needs an active Admin.

**Errors** use one shape: `{ "error": { "code": "VALIDATION_FAILED", "message": "…", "fields": {…} } }`, with status 400 for bad input, 401 for not logged in, 403 for not allowed, 404 for not found and 409 for conflicts like a duplicate email.

### Auth and members

| Method | Route | Access | Does |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | Public | Create an account |
| POST | `/api/auth/login` | Public | Check password, set the session cookie |
| POST | `/api/auth/logout` | User | Clear the session cookie |
| GET | `/api/auth/me` | User | Current user, wedding and role |
| POST | `/api/auth/forgot-password` | Public | Email a reset link. Always answers the same way, so it doesn't reveal which emails exist |
| POST | `/api/auth/reset-password` | Public | Set a new password with a reset token |
| POST | `/api/weddings` | Logged in, no wedding | Create a workspace and become its first Admin |
| GET, PATCH | `/api/wedding` | Member | Read or update wedding details |
| DELETE | `/api/wedding` | Admin | Delete the workspace and all its data |
| GET | `/api/members` | Member | Member list |
| POST | `/api/members/invites` | Admin | Invite by name, email and role |
| POST | `/api/members/accept` | Public | Accept an invite with its token and set a password |
| PATCH | `/api/members/:id` | Admin | Change role |
| DELETE | `/api/members/:id` | Admin | Remove a member |
| POST | `/api/members/leave` | Member | Leave the workspace |

### Wedding modules

Each of these modules has the usual list, create, read, update and delete routes, all with **Member** access:

| Module | Routes | Extra routes |
| --- | --- | --- |
| Events | `/api/events`, `/api/events/:id` | `POST /api/events/types` adds a custom event type |
| Guests | `/api/guests`, `/api/guests/:id` | `POST /api/guests/import` checks and saves a CSV or Excel upload |
| Expenses | `/api/expenses`, `/api/expenses/:id` | `GET /api/expenses/summary`, `GET /api/expenses/export` |
| Gifts | `/api/gifts`, `/api/gifts/:id` | `GET /api/gifts/summary`, `GET /api/gifts/export` |
| Vendors | `/api/vendors`, `/api/vendors/:id` | `POST /api/vendors/:id/share` publishes to the directory |
| Shared vendors | `GET /api/shared-vendors` | Filter by `category` and `city` |
| Tasks | `/api/tasks`, `/api/tasks/:id` | `POST /api/tasks/:id/done`, `POST /api/tasks/:id/reopen` |
| Dashboard | `GET /api/dashboard` | One call returns countdown, upcoming events, RSVP counts, total spent, task summary and pending invites |

### Invitations, photos and files

| Method | Route | Access | Does |
| --- | --- | --- | --- |
| POST | `/api/invitations/sends` | Member | Start a send for chosen guests and events, invites or reminders |
| POST | `/api/invitations/sends/:id/next` | Member | Send the next batch of a send in progress |
| GET | `/api/invitations/sends/:id` | Member | Progress, such as 250 of 400 sent |
| GET, POST | `/api/qr-codes` | Member | List or create QR codes |
| PATCH | `/api/qr-codes/:id` | Member | Turn uploads on or off |
| GET | `/api/photos` | Member | All photos, including hidden ones |
| PATCH, DELETE | `/api/photos/:id` | Member | Hide or delete a photo |
| GET | `/api/photos/download-links` | Member | Signed links for all photos. The browser downloads them and builds the zip, so no request runs too long |
| POST | `/api/files/upload-url` | Member | Signed upload URL for a receipt or the cover photo, chosen by `purpose` |

### Guest-facing routes

| Method | Route | Access | Does |
| --- | --- | --- | --- |
| GET | `/api/public/invite/:token` | Token | The guest's invitation and events |
| POST | `/api/public/invite/:token/rsvp` | Token | Save RSVP answers per event |
| POST | `/api/public/upload/:token/urls` | Token | Signed upload URLs for up to 50 photos |
| POST | `/api/public/upload/:token/complete` | Token | Save photo records after the upload |
| GET | `/api/public/w/:slug/photos` | Public | Gallery photos with signed view links, if the gallery is on |

## Authentication and access control

Login is built in-house with no auth library: bcrypt for passwords and a signed JWT for the session.

### Passwords

- Hashed with **bcrypt** at cost 12, using the pure-JavaScript `bcryptjs` package to avoid native builds on Windows and Vercel. Plain passwords are never stored or logged.
- At least 8 characters, checked by Zod on both the form and the server.
- Login answers "Email or password is incorrect" for both a wrong email and a wrong password, so it doesn't reveal which accounts exist.
- Login, signup and forgot-password are rate-limited per email and IP, for example 5 tries in 15 minutes, to slow down password guessing.

### Sessions

- On login, the server signs a **JWT** with `jose` (works in both middleware and route handlers) and a secret from the environment.
- The JWT holds only `userId` and an expiry of 7 days. Role and wedding are looked up fresh on each request, so a removed member loses access immediately.
- It's stored in a cookie set as `httpOnly`, `secure`, `sameSite=lax` and `path=/`. Browser scripts can't read it.
- Logout clears the cookie. There are no refresh tokens in v1. After 7 days, the member logs in again.

### Access checks

Every logged-in route handler starts with one helper from `lib/access.ts`:

```ts
const { user, membership } = await requireMember(req);          // any active member
const { user, membership } = await requireMember(req, "admin"); // Admins only
```

`requireMember` does three things:

1. Verifies the JWT from the cookie, or answers 401.
2. Loads the member's active membership, or answers 403.
3. If a role is required, checks it, or answers 403.

Every database query then filters by `membership.weddingId`. A small wrapper in each module's service takes `weddingId` as its first argument, so a query without it can't be written by accident.

### Member rules enforced on the server

| Rule | Where it's enforced |
| --- | --- |
| One workspace per person | Partial unique index on `memberships.userId`, plus a check before sending an invite |
| At least one Admin | Before demoting or removing an Admin, or an Admin leaving, count the active Admins and refuse if it would drop to zero |
| Workspace creator can't be removed | `weddings.createdBy` is checked before removing a member |
| Only Admins manage members | `requireMember(req, "admin")` on every members route except list, leave and accept (accept is public, using the invite token) |

### Guest tokens

- Invitation and QR tokens are 32 random bytes from Node's `crypto`, encoded as a URL-safe string.
- MongoDB stores the SHA-256 hash for lookup, plus an encrypted copy so reminder emails and QR images can reuse the same token. A lookup hashes the token from the URL and finds the match.
- An invitation token only reaches that guest's own invitation, events and RSVP. A QR token only reaches the upload routes for its wedding and event.
- An Admin or Manager can regenerate a guest's link or a QR code if it's shared too widely. The old token stops working at once.

### Member invites and password reset

- Both use the same token pattern, with an expiry: 7 days for invites, 1 hour for password reset.
- A token can be used once. `acceptedAt` or `usedAt` is set on use.
- Accepting an invite creates the user (or links an existing user with no workspace), creates the membership as active, and logs them in.

## Key flows

### Sending invitations in batches

Gmail allows roughly 500 recipients a day, and a single Vercel request can't run for long. So the browser drives the sending in small batches, and the server records progress after each one.

1. A member picks the guests, the events, and invite or reminder, then clicks **Send**.
2. `POST /api/invitations/sends` creates an `invitationSends` record listing every guest to email, with status `in_progress`.
3. The browser calls `POST /api/invitations/sends/:id/next` in a loop. Each call sends the next **20 emails** through Nodemailer, records who succeeded or failed, and returns the progress.
4. The page shows a progress bar, such as "250 of 400 sent".
5. Before each batch, the server counts emails sent by this app in the last 24 hours. At **450**, a safety margin under Gmail's limit, it stops and sets the status to `paused_daily_limit`. The page says "Daily limit reached. Resume tomorrow."
6. If the member closes the tab, the send just pauses. Opening Invitations shows a **Resume** button for any send in progress.
7. Failed addresses are listed at the end with a **Retry failed** button.

Each email is built from one English template. It includes the couple's names, the events the guest is invited to with date, time, venue and map link, the wedding website link, and the guest's personal invitation link.

### Guest RSVP

1. The guest opens their personal link, `/i/<token>`.
2. The server hashes the token, finds the guest, and renders their invitation with only the events they're invited to.
3. For each event, the guest picks attending or not, and how many people are coming.
4. `POST /api/public/invite/:token/rsvp` validates the answers and saves one `rsvps` document per event, replacing any earlier answer.
5. After the RSVP cut-off date the form becomes read-only, showing the guest's last answers.
6. Headcounts per event are a sum over `rsvps`, used by the dashboard and the guest list.

### Photo upload by QR code

1. The guest scans the QR code and opens `/u/<token>`. The server checks the token and that uploads are on, then shows the upload page with an optional name field.
2. The guest picks up to 50 photos. In the browser, `browser-image-compression` makes two versions of each: a full image at about 2000px wide and under 2 MB, and a thumbnail at about 400px wide.
3. The browser calls `POST /api/public/upload/:token/urls` with the file count and sizes. The server checks limits and returns two **signed upload URLs** per photo, valid for 10 minutes.
4. The browser uploads each file straight to R2 with a `PUT` to its signed URL, showing progress per photo.
5. The browser calls `POST /api/public/upload/:token/complete` with the keys that uploaded. The server confirms each object exists in R2, then saves the `photos` records.
6. If gallery sharing is on, the photos appear on the wedding website straight away.

### Viewing photos

- The R2 bucket is private. Nothing in it can be opened without a signed link.
- The gallery page asks the API for photos. The API returns each photo with a **signed view URL**, valid for 1 hour.
- The gallery loads thumbnails first and opens the full image when one is tapped.
- Hidden photos are never returned to the public gallery, only to members.

### Receipts in Money

1. While adding an expense, the member attaches a receipt photo or PDF.
2. The browser compresses images and calls `POST /api/files/upload-url` with `purpose: "receipt"` for a signed upload URL.
3. The browser uploads straight to R2, then saves the expense with the `receiptKey`.
4. Opening the expense requests a signed view URL, so receipts are only ever visible to members.

### Adding a member

1. An Admin enters a name, email and role.
2. The server checks that the email isn't already active or invited in another workspace, then creates a `memberInvites` record.
3. Nodemailer emails the invite link, `/accept-invite?token=…`.
4. The person opens it, sets a password (or logs in, if they already have an account with no workspace), and lands on the dashboard as an active member.

## Infrastructure and operations

### Services and setup

| Service | Setup | Notes |
| --- | --- | --- |
| Vercel | Free plan, connected to the GitHub repo. Every push to `main` deploys; every pull request gets a preview link | Set the function region to Mumbai (`bom1`), close to the database |
| MongoDB Atlas | Free M0 cluster in the Mumbai region if offered, otherwise Singapore | Separate databases for development and production. Allow Vercel's access with a database user and password |
| Cloudflare R2 | One private bucket per environment, such as `mmm-dev` and `mmm-prod` | API token limited to that bucket. CORS allows `PUT` and `GET` from the app's own address only |
| Gmail | A dedicated account with 2-step verification and an App Password | Used only for sending. Never your personal Gmail |

### Environment variables

Kept in `.env.local` for development and in Vercel's project settings for production. Never committed to Git.

| Variable | Holds |
| --- | --- |
| `MONGODB_URI` | Atlas connection string |
| `JWT_SECRET` | Long random string for signing sessions |
| `TOKEN_ENCRYPTION_KEY` | 32-byte key for encrypting guest invitation and QR tokens |
| `APP_URL` | The app's base address, used in email links |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | R2 access |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Sending account |
| `EMAIL_DAILY_CAP` | Daily send stop, default `450` |

### Cached database connection

`lib/db.ts` keeps one Mongoose connection on a global variable and reuses it on every request. Without this, each request on Vercel could open a new connection and quickly hit Atlas's connection limit.

### Security

- **Rate limiting** is stored in a small `rateLimits` collection with a TTL index, because Vercel doesn't keep memory between requests. It covers login, signup, forgot-password, RSVP and upload routes.
- **Cross-site request protection:** the session cookie is `sameSite=lax`, and every write request checks that the `Origin` header matches `APP_URL`.
- **Input** is validated by Zod on every route. Mongoose is set to `strictQuery` so unexpected fields are ignored.
- **Uploads** are limited to image types for photos, and images or PDF for receipts, with size checks before signed URLs are issued.
- **Security headers** set in `next.config`: Content-Security-Policy, X-Frame-Options and Referrer-Policy.
- **The wedding website** sends `noindex` so search engines don't list it.
- **Secrets** live only in environment variables. Errors returned to the browser never include stack traces.
- **Deleting a wedding** removes all its documents and every R2 object under `weddings/<weddingId>/`.

### Limits and free tiers

| Limit | Value | How the app stays within it |
| --- | --- | --- |
| Gmail sending | About 500 recipients a day | Daily cap of 450 and batched sending that resumes the next day |
| Vercel request body | About 4.5 MB | Files upload straight to R2, never through the app |
| R2 free storage | 10 GB across all weddings | Browser compression, and a per-wedding cap such as 2 GB, tracked through `photos.sizeBytes` |
| Atlas free cluster | 512 MB | Only text data in MongoDB. Files stay in R2 |

### Monitoring and backups

- Vercel's logs show every request and error. Each route logs failures with the route name and `weddingId`, never passwords or tokens.
- Export the production database weekly with `mongodump`, since the free cluster has no automatic backups.
- R2 objects aren't backed up separately in v1. Admins and Managers can download the full gallery as a zip after the wedding.

### Local development

1. Clone the repo, run `npm install`, and copy `.env.example` to `.env.local`.
2. Point `MONGODB_URI` at the development database and `R2_BUCKET` at the development bucket.
3. Run `npm run dev` and open `localhost:3000`.
4. Add `localhost:3000` to the development bucket's CORS rules so uploads work locally.

A note on versions: the app is pinned to Next.js 16, where the `middleware.ts` file is called `proxy.ts`. Development and Vercel both run Node.js 24 LTS.
