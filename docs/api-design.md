# Make My Marriage — API Design (v1)

Oct 21, 2026 · @Leela Manikanta Cheekatla

## Overview and conventions

This document specifies every API endpoint in version 1 of Make My Marriage: what each one takes, what it returns, who can call it, and how it fails. It builds on the System Design and Database Design documents.

All endpoints are Next.js route handlers under `/api`. They take and return JSON unless stated otherwise.

### Access levels

| Level | Who | How it's checked |
| --- | --- | --- |
| **Public** | Anyone | Nothing |
| **User** | Logged in, with or without a wedding | Valid session cookie |
| **Member** | Admin or Manager with an active membership | Session cookie plus active membership |
| **Admin** | Admin with an active membership | Session cookie plus active membership with role `admin` |
| **Token** | A guest or uploader with a valid link | Invitation or QR token in the URL path |

For Member and Admin routes, the wedding always comes from the session, never from the URL or the body.

### Authentication

- Login sets a cookie named `mmm_session` holding the JWT, set as `httpOnly`, `secure`, `sameSite=lax`, `path=/`, and lasting 7 days.
- The browser sends it automatically. API calls from the app's own pages need no extra header.
- Every `POST`, `PATCH` and `DELETE` checks that the `Origin` header matches the app's own address. Requests from other sites get 403 `FORBIDDEN_ORIGIN`.

### Data formats

| Data | Format | Example |
| --- | --- | --- |
| IDs | 24-character hex string | `"6718f2a9c1e4b5a3d2f10a77"` |
| Money | Whole number of paise, in a field ending `Paise` | `"amountPaise": 8000000` is ₹80,000 |
| Calendar dates | `YYYY-MM-DD` string | `"2027-02-14"` |
| Times of day | `HH:mm`, 24-hour | `"18:30"` |
| Moments in time | ISO 8601 in UTC | `"2026-10-21T13:05:00.000Z"` |
| Empty optional field | Left out of the response, or sent as `null` to clear it in a `PATCH` | `"eventId": null` |

### Response shapes

- A single record is returned as an object: `{ "event": { … } }`.
- A list is returned as `{ "items": [ … ] }`.
- A paginated list adds a cursor: `{ "items": [ … ], "nextCursor": "…" }`. Pass it back as `?cursor=…` for the next page. `nextCursor` is missing on the last page.
- Paginated lists take `?limit=`, from 1 to 100, default 50. Guests, expenses, gifts, photos and shared vendors are paginated. Events, vendors, tasks, members and QR codes are small and return everything.
- A successful `DELETE` returns `204` with no body.

### Status codes

| Code | Meaning |
| --- | --- |
| 200 | Success |
| 201 | Created. The body holds the new record |
| 204 | Deleted, no body |
| 400 | Bad input. `fields` says which fields and why |
| 401 | Not logged in, or the session has expired |
| 403 | Logged in but not allowed, such as a Manager calling an Admin route |
| 404 | Not found, or belongs to another wedding. The two look the same on purpose |
| 409 | Conflict, such as a duplicate email or slug |
| 413 | Too large, such as an upload over the size limit |
| 429 | Rate limit reached. The `Retry-After` header gives seconds to wait |
| 500 | Server error. The body never includes details of the failure |

### Error shape

Every error uses one shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Some fields need fixing.",
    "fields": { "email": "Enter a valid email address." }
  }
}
```

- `code` is a fixed string the UI can act on. The full list is in Error codes, at the end.
- `message` is written for people and safe to show in the UI.
- `fields` appears only on 400 errors, keyed by field name.

### Validation

Each endpoint's body and query are checked with a Zod schema that matches the field rules in the Database Design. Unknown fields are dropped. Text is trimmed and emails are lowercased before saving.

### Notation in this document

Each endpoint is listed with its method, path and access level. Request and response examples show the main fields. Fields marked `?` are optional.

## Auth

| Method | Path | Access | Does |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | Public | Create an account and log in |
| POST | `/api/auth/login` | Public | Log in |
| POST | `/api/auth/logout` | User | Log out |
| GET | `/api/auth/me` | User | Current user, wedding and role |
| POST | `/api/auth/forgot-password` | Public | Email a reset link |
| POST | `/api/auth/reset-password` | Public | Set a new password with a reset token |
| POST | `/api/auth/change-password` | User | Change password while logged in |

### POST /api/auth/signup

```json
// Request
{ "name": "Leela", "email": "leela@example.com", "password": "at-least-8-chars" }

// 201 Response, and sets the mmm_session cookie
{ "user": { "id": "…", "name": "Leela", "email": "leela@example.com" }, "wedding": null }
```

- 409 `EMAIL_TAKEN` if the email already has an account.
- Rate limit: 5 signups per IP per hour.
- After signup, the app sends the user to create a workspace, `POST /api/weddings`.

### POST /api/auth/login

```json
// Request
{ "email": "leela@example.com", "password": "…" }

// 200 Response, and sets the mmm_session cookie
{
  "user": { "id": "…", "name": "Leela", "email": "leela@example.com" },
  "wedding": { "id": "…", "brideName": "Priya", "groomName": "Ravi", "role": "admin" }
}
```

- 401 `INVALID_CREDENTIALS` for a wrong email or a wrong password. The message is the same for both.
- `wedding` is `null` if the user has no active membership.
- Rate limit: 5 failed attempts per email, and per IP, in 15 minutes.

### POST /api/auth/logout

Clears the cookie. Returns `204`.

### GET /api/auth/me

Returns the same shape as login. Pages call it on load to know who is logged in and which wedding they belong to. 401 `NOT_AUTHENTICATED` without a valid session.

### POST /api/auth/forgot-password

```json
// Request
{ "email": "leela@example.com" }

// 200 Response, always the same
{ "ok": true }
```

If the account exists, a reset link valid for 1 hour is emailed. The response is identical either way, so it can't be used to find out who has an account. Rate limit: 3 requests per email per hour.

### POST /api/auth/reset-password

```json
// Request
{ "token": "…", "password": "new-password" }

// 200 Response, and sets the mmm_session cookie
{ "user": { … }, "wedding": { … } }
```

400 `TOKEN_INVALID` if the token is unknown, expired or already used. Every session issued before the reset stops working, and the response logs the caller in with a new one.

### POST /api/auth/change-password

```json
// Request
{ "currentPassword": "…", "newPassword": "…" }
```

Returns `204` and sets a new session cookie. Every other session stops working. 401 `INVALID_CREDENTIALS` if the current password is wrong; after 5 wrong tries in 15 minutes, 429 `RATE_LIMITED`.

## Wedding and members

| Method | Path | Access | Does |
| --- | --- | --- | --- |
| POST | `/api/weddings` | User, with no wedding | Create a workspace and become its first Admin |
| GET | `/api/wedding` | Member | Wedding details and website settings |
| PATCH | `/api/wedding` | Member | Update details and website settings |
| GET | `/api/wedding/slug-available?slug=` | Member | Check a website address before saving |
| DELETE | `/api/wedding` | Admin | Delete the workspace and all its data |
| GET | `/api/members` | Member | Members and pending invites |
| POST | `/api/members/invites` | Admin | Invite someone by email |
| POST | `/api/members/invites/:id/resend` | Admin | Resend an invite with a fresh link |
| DELETE | `/api/members/invites/:id` | Admin | Cancel a pending invite |
| GET | `/api/members/accept?token=` | Public | Check an invite link before accepting |
| POST | `/api/members/accept` | Public | Accept an invite |
| PATCH | `/api/members/:id` | Admin | Change a member's role |
| DELETE | `/api/members/:id` | Admin | Remove a member |
| POST | `/api/members/leave` | Member | Leave the workspace |

### POST /api/weddings

```json
// Request
{ "brideName": "Priya", "groomName": "Ravi", "weddingDate": "2027-02-14" }

// 201 Response
{ "wedding": { "id": "…", "brideName": "Priya", "groomName": "Ravi", "weddingDate": "2027-02-14",
  "slug": "priya-weds-ravi", "theme": "classic", "websitePublished": false, "galleryEnabled": false } }
```

- The slug is made from the names. If taken, a number is added, such as `priya-weds-ravi-2`.
- Also creates the creator's Admin membership and the whole-wedding QR code.
- 409 `ALREADY_IN_WORKSPACE` if the user already has an active membership.

### PATCH /api/wedding

Any of these fields can be sent:

```json
{
  "brideName"?: "Priya", "groomName"?: "Ravi", "weddingDate"?: "2027-02-14",
  "coverPhotoKey"?: "weddings/…/cover.jpg",
  "slug"?: "priya-and-ravi", "theme"?: "floral",
  "websitePublished"?: true, "galleryEnabled"?: true,
  "rsvpCutoffDate"?: "2027-02-01"
}
```

- Returns `{ "wedding": { … } }`.
- 409 `SLUG_TAKEN` if the address is used by another wedding. 400 `SLUG_RESERVED` for reserved words such as `api` or `dashboard`.
- `coverPhotoKey` must be a key issued for this wedding by `POST /api/files/upload-url`.
- 400 `VALIDATION_FAILED` if `weddingDate` is more than 2 years back or 10 years ahead, if a name has control characters, or if `rsvpCutoffDate` is after `weddingDate` (checked against the saved value when only one is sent).

### GET /api/wedding/slug-available

Returns `{ "available": true }` or `{ "available": false, "suggestion": "priya-weds-ravi-2" }`.

### DELETE /api/wedding

```json
// Request, to confirm
{ "confirmSlug": "priya-weds-ravi" }
```

The Admin must type the website address to confirm (400 `VALIDATION_FAILED` with `fields.confirmSlug` if it doesn't match; 403 for a Manager). Deletes everything, as set out in the Database Design under Data lifecycle. Returns `204`.

### GET /api/members

```json
{
  "items": [
    { "id": "…", "userId": "…", "name": "Leela", "email": "leela@example.com",
      "role": "admin", "isCreator": true, "joinedAt": "…" }
  ],
  "pendingInvites": [
    { "id": "…", "name": "Anil", "email": "anil@example.com", "role": "manager", "expiresAt": "…" }
  ]
}
```

`pendingInvites` is included for Admins only. Removed members aren't listed.

### POST /api/members/invites

```json
// Request
{ "name": "Anil", "email": "anil@example.com", "role": "manager" }

// 201 Response
{ "invite": { "id": "…", "name": "Anil", "email": "anil@example.com", "role": "manager", "expiresAt": "…" } }
```

- Emails an invite link valid for 7 days.
- 409 `ALREADY_MEMBER` if they're already in this wedding.
- 409 `IN_OTHER_WORKSPACE` if they have an active membership, or a pending invite, in another wedding.
- Counts toward the daily email cap. 429 `EMAIL_CAP_REACHED` when it's hit.

### GET /api/members/accept?token=…

```json
{ "weddingName": "Priya & Ravi", "weddingDate": "2027-02-14", "invitedBy": "Leela",
  "invitedName": "Anil", "email": "anil@example.com", "role": "manager", "hasAccount": false }
```

The accept page uses `hasAccount` to show either **Set up your account** or **Log in and join**, and the rest to describe the invitation. (The page itself, when rendered on the server, also describes an _expired_ link, so it can say whose wedding it was for. This endpoint still answers 400 for those.) 400 `TOKEN_INVALID` for an unknown, expired or used link.

### POST /api/members/accept

```json
// Request
{ "token": "…", "password": "…", "name"?: "Anil Kumar" }

// 200 Response, and sets the mmm_session cookie
{ "user": { … }, "wedding": { … } }
```

- New account: creates it with this password.
- Existing account: checks the password, which logs them in.
- 409 `IN_OTHER_WORKSPACE` if they joined another wedding since the invite was sent.

### PATCH /api/members/:id

```json
{ "role": "admin" }
```

Returns `{ "member": { … } }`. 409 `LAST_ADMIN` if this would leave the wedding with no Admin.

### DELETE /api/members/:id

Sets the membership to `removed`. Returns `204`.

- 409 `LAST_ADMIN` if they're the only Admin.
- 403 `CREATOR_PROTECTED` for the workspace creator.

### POST /api/members/leave

Returns `204` and clears the session's wedding. The account stays. 409 `LAST_ADMIN` if the caller is the only Admin.

## Events

All event endpoints need **Member** access.

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/events` | All events, sorted by date then time |
| POST | `/api/events` | Create an event |
| GET | `/api/events/:id` | One event, with its RSVP counts |
| PATCH | `/api/events/:id` | Update an event |
| GET | `/api/events/:id/delete-impact` | What deleting would touch, for the confirmation |
| DELETE | `/api/events/:id` | Delete an event and clean up related data |
| GET | `/api/events/types` | Default and custom event types for the dropdown |
| POST | `/api/events/types` | Add a custom event type |

### The event object

```json
{
  "id": "…",
  "name": "Sangeet Night",
  "type": "Sangeet",
  "date": "2027-02-12",
  "time": "18:30",
  "venueName": "Novotel Varun Beach",
  "address": "Beach Road, Visakhapatnam",
  "mapLink": "https://maps.google.com/…",
  "dressCode": "Indo-western",
  "notes": "Dinner served after 8 pm",
  "youtubeLink": "https://youtube.com/live/…",
  "guestCount": 180
}
```

`guestCount` is how many guests are invited, worked out on read. It isn't sent when creating or updating.

### POST /api/events

Takes the event object without `id` and `guestCount`. `name`, `type`, `date`, `time` and `venueName` are required. Returns `201` with `{ "event": { … } }`.

400 `UNKNOWN_EVENT_TYPE` if `type` isn't a default type or one of the wedding's custom types.

### GET /api/events/:id

Returns the event, plus its RSVP counts:

```json
{
  "event": { … },
  "rsvp": { "invited": 180, "attending": 120, "declined": 15, "notReplied": 45, "headcount": 310 }
}
```

### PATCH /api/events/:id

Takes any event fields. Send `null` to clear an optional field, such as `"youtubeLink": null`. Returns `{ "event": { … } }`.

### GET /api/events/:id/delete-impact

```json
{ "guests": 180, "rsvps": 135, "expenses": 4, "gifts": 2, "tasks": 3, "vendors": 2, "qrCodes": 1, "photos": 240 }
```

The UI shows these numbers in the confirmation before deleting.

### DELETE /api/events/:id

Deletes the event and makes the clean-up changes set out in the Database Design, in one transaction. Returns `204`.

### GET /api/events/types

```json
{
  "default": ["Engagement", "Haldi", "Mehendi", "Sangeet", "Pellikuthuru / Pellikoduku",
              "Wedding (Muhurtham)", "Reception", "Vratham / Pooja"],
  "custom": ["Nalugu"]
}
```

### POST /api/events/types

```json
// Request
{ "name": "Nalugu" }
```

Returns `201` with the updated `custom` list.

- 409 `TYPE_EXISTS` if it matches a default or custom type, ignoring case.
- 400 `TOO_MANY_TYPES` beyond 30 custom types.

## Guests

All guest endpoints need **Member** access.

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/guests` | Guest list, paginated, with search and filters |
| POST | `/api/guests` | Add a guest |
| GET | `/api/guests/:id` | One guest, with their RSVPs |
| PATCH | `/api/guests/:id` | Update a guest |
| DELETE | `/api/guests/:id` | Delete a guest and their RSVPs |
| POST | `/api/guests/bulk-events` | Add or remove events for many guests at once |
| POST | `/api/guests/:id/regenerate-link` | Replace a guest's invitation link |
| GET | `/api/guests/:id/link` | The guest's current invitation link, to copy and share by hand |
| GET | `/api/guests/import/template` | Download the CSV template |
| POST | `/api/guests/import/preview` | Check an uploaded file and show row errors |
| POST | `/api/guests/import/commit` | Save the checked rows |

### The guest object

```json
{
  "id": "…",
  "name": "Lakshmi Rao",
  "email": "lakshmi@example.com",
  "phone": "+91 98480 12345",
  "relation": "Mother's cousin",
  "household": "Rao family, Vizag",
  "eventIds": ["…", "…"],
  "inviteStatus": "sent",
  "lastInviteSentAt": "…",
  "inviteOpenedAt": "…",
  "rsvp": { "replied": 2, "of": 2 }
}
```

- `inviteStatus` is worked out on read: `not_sent`, `sent` or `opened`.
- `rsvp` counts how many of the guest's events have an answer.
- The token itself is never in this object. It's only returned by `GET /api/guests/:id/link`.

### GET /api/guests

| Query | Meaning |
| --- | --- |
| `q` | Search name, email, phone or household |
| `eventId` | Only guests invited to this event |
| `rsvpStatus` | `attending`, `declined` or `not_replied`. Needs `eventId` |
| `inviteStatus` | `not_sent`, `sent` or `opened` |
| `household` | Exact household name |
| `sort` | `name` (default) or `-createdAt` |
| `limit`, `cursor` | Pagination |

Returns `{ "items": [ … ], "nextCursor": "…", "total": 412 }`. `total` is the count matching the filters, for showing "412 guests".

### POST /api/guests

```json
{ "name": "Lakshmi Rao", "email"?: "…", "phone"?: "…", "relation"?: "…",
  "household"?: "…", "eventIds"?: ["…"] }
```

Returns `201` with `{ "guest": { … } }`. Creates the invitation token. 409 `GUEST_EMAIL_EXISTS` if another guest in this wedding has the same email.

### GET /api/guests/:id

Returns `{ "guest": { … }, "rsvps": [ { "eventId": "…", "attending": true, "headcount": 3, "respondedAt": "…" } ] }`.

### PATCH /api/guests/:id

Takes any guest fields. Removing an event from `eventIds` also deletes the guest's RSVP for it.

### POST /api/guests/bulk-events

```json
{ "guestIds": ["…", "…"], "add"?: ["<eventId>"], "remove"?: ["<eventId>"] }
```

Up to 500 guests per call. Returns `{ "updated": 120 }`.

### POST /api/guests/:id/regenerate-link

Makes a new token. The old link stops working at once. Returns `{ "link": "https://…/i/<token>" }`.

### Import

Import is two steps, so the member sees errors before anything is saved.

**1. Preview**, `POST /api/guests/import/preview`, sent as `multipart/form-data` with one field, `file`: a `.csv` or `.xlsx` file of up to 2 MB and 2,000 rows.

```json
{
  "rows": [
    { "row": 2, "data": { "name": "Lakshmi Rao", "email": "…", "eventIds": ["…"] }, "errors": {} },
    { "row": 3, "data": { "name": "", "email": "bad-email" },
      "errors": { "name": "Name is required.", "email": "Enter a valid email address." } },
    { "row": 4, "data": { … }, "errors": { "events": "No event called \"Sangit\"." } }
  ],
  "valid": 410, "invalid": 2, "duplicates": 3
}
```

- The `events` column is matched to event names, ignoring case.
- `duplicates` counts rows whose email already belongs to a guest in this wedding, or appears twice in the file.
- Nothing is saved at this step.

**2. Commit**, `POST /api/guests/import/commit`:

```json
{ "rows": [ { "name": "Lakshmi Rao", "email": "…", "eventIds": ["…"] } ], "onDuplicate": "skip" }
```

- `rows` holds the valid rows from the preview, sent back by the page.
- `onDuplicate` is `skip` or `update`. `update` merges the new details into the existing guest.
- Every row is validated again on the server. Returns `{ "created": 405, "updated": 0, "skipped": 5 }`.

### GET /api/guests/import/template

Returns a `.csv` file with the header row `name,email,phone,relation,household,events` and one example row.

## Invitations

All invitation endpoints need **Member** access. Sending works in batches that the browser drives, as set out in the System Design under Key flows.

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/invitations/preview` | The email a guest would receive, as HTML |
| POST | `/api/invitations/test` | Send a test email to the logged-in member |
| POST | `/api/invitations/sends` | Start a send |
| GET | `/api/invitations/sends` | Recent sends, with any still in progress |
| GET | `/api/invitations/sends/:id` | Progress of one send |
| POST | `/api/invitations/sends/:id/next` | Send the next batch |
| POST | `/api/invitations/sends/:id/retry-failed` | Try failed addresses again |
| POST | `/api/invitations/sends/:id/cancel` | Stop a send |
| GET | `/api/invitations/quota` | Emails left today under the daily cap |

### GET /api/invitations/preview

`?guestId=…&kind=invite` or `kind=reminder`. Returns `{ "subject": "…", "html": "…" }`, built from the English template with that guest's events and link. The page shows it before sending.

### POST /api/invitations/test

```json
{ "kind": "invite", "guestId": "…" }
```

Sends the preview to the member's own email, with "\[Test\]" in the subject. Returns `{ "ok": true }`. Counts toward the daily cap.

### POST /api/invitations/sends

```json
// Request
{
  "kind": "invite",
  "eventIds": ["…", "…"],
  "guestFilter": { "guestIds"?: ["…"], "inviteStatus"?: "not_sent", "rsvpStatus"?: "not_replied" }
}

// 201 Response
{
  "send": {
    "id": "…", "kind": "invite", "status": "in_progress",
    "total": 400, "sent": 0, "failed": 0,
    "skippedNoEmail": 12
  }
}
```

- The guest list is fixed at this moment. Guests added later aren't included.
- Only guests invited to at least one of `eventIds` are included. Each email lists only that guest's events.
- For a reminder, `rsvpStatus: "not_replied"` picks only guests who haven't answered for at least one of the events.
- `skippedNoEmail` counts guests left out because they have no email address.
- 409 `SEND_IN_PROGRESS` if this wedding already has a send in progress. Finish or cancel it first.

### POST /api/invitations/sends/:id/next

Sends the next 20 emails. The browser calls this repeatedly until `status` is no longer `in_progress`.

```json
{
  "send": { "id": "…", "status": "in_progress", "total": 400, "sent": 260, "failed": 2 },
  "quota": { "remainingToday": 190 }
}
```

| `status` after the call | Meaning | What the page does |
| --- | --- | --- |
| `in_progress` | More to send | Calls `next` again |
| `paused_daily_limit` | Daily cap reached | Shows "Daily limit reached. Resume tomorrow." |
| `completed` | Everyone has been tried | Shows the result, and failed addresses if any |
| `cancelled` | A member stopped it | Shows how many were sent |

Calling `next` on a paused send resumes it once the cap allows. Only one batch runs at a time: `next` first sets the send's `lockedUntil` to one minute ahead, and only if no lock is active. A second call meanwhile gets 409 `SEND_BUSY` and the page simply waits and tries again, so nobody gets two emails.

### GET /api/invitations/sends/:id

Returns the same `send` object, plus `failedGuests`: `[ { "id": "…", "name": "…", "email": "…" } ]`.

### POST /api/invitations/sends/:id/retry-failed

Moves failed guests back into the queue and sets the status to `in_progress`. The browser then calls `next` again.

### GET /api/invitations/quota

```json
{ "cap": 450, "usedLast24h": 260, "remainingToday": 190 }
```

## Money

All Money endpoints need **Member** access.

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/expenses` | Expense log, paginated, newest first |
| POST | `/api/expenses` | Add an expense |
| GET | `/api/expenses/:id` | One expense, with a signed receipt link |
| PATCH | `/api/expenses/:id` | Update an expense |
| DELETE | `/api/expenses/:id` | Delete an expense and its receipt |
| GET | `/api/expenses/summary` | Total spent, and totals by category, event and payer |
| GET | `/api/expenses/export` | Download the log as an Excel file |
| GET | `/api/gifts` | Gift list, paginated |
| POST | `/api/gifts` | Record a gift |
| PATCH | `/api/gifts/:id` | Update a gift or mark the return gift done |
| DELETE | `/api/gifts/:id` | Delete a gift |
| GET | `/api/gifts/summary` | Total cash, gift count and return gifts pending |
| GET | `/api/gifts/export` | Download the gift list as an Excel file |
| POST | `/api/files/upload-url` | Signed upload URL for a receipt or the cover photo |

### The expense object

```json
{
  "id": "…",
  "amountPaise": 4500000,
  "date": "2027-01-20",
  "category": "decoration",
  "description": "Stage flowers advance",
  "eventId": "…",
  "vendorId": "…",
  "paidBy": "Ravi's father",
  "mode": "upi",
  "note": "Balance due on the day",
  "receiptKey": "weddings/…/receipts/….jpg",
  "createdBy": { "id": "…", "name": "Leela" }
}
```

`GET /api/expenses/:id` adds `receiptUrl`, a signed view link valid for 1 hour.

### GET /api/expenses

| Query | Meaning |
| --- | --- |
| `category` | One category |
| `eventId` | One event |
| `vendorId` | One vendor |
| `from`, `to` | Date range, `YYYY-MM-DD`, inclusive |
| `q` | Search description, paid by and note |
| `limit`, `cursor` | Pagination |

Returns `{ "items": [ … ], "nextCursor": "…", "totalPaise": 125000000 }`. `totalPaise` is the sum for the current filters, not only this page.

### POST /api/expenses

Takes the expense object without `id` and `createdBy`. `amountPaise`, `date`, `category`, `paidBy` and `mode` are required. Returns `201` with `{ "expense": { … } }`.

- `receiptKey` must be a key issued for this wedding with `purpose: "receipt"`. The server checks the file exists in R2 and records its size.
- 400 `UNKNOWN_CATEGORY` for a category not in the list.

### GET /api/expenses/summary

```json
{
  "totalPaise": 125000000,
  "byCategory": [ { "category": "catering", "totalPaise": 60000000 } ],
  "byEvent":    [ { "eventId": "…", "name": "Reception", "totalPaise": 40000000 },
                  { "eventId": null, "name": "No event", "totalPaise": 5000000 } ],
  "byPaidBy":   [ { "paidBy": "Ravi's father", "totalPaise": 70000000 } ]
}
```

Each list is sorted by total, largest first.

### GET /api/expenses/export

Returns an `.xlsx` file with the same filters as the list. Amounts are in rupees in the file, with a total row at the bottom.

### The gift object

```json
{
  "id": "…",
  "giverName": "Lakshmi Rao",
  "guestId": "…",
  "cashPaise": 1100100,
  "itemDescription": "Silver lamp pair",
  "eventId": "…",
  "returnGift": "Silk saree",
  "returnGiftDone": false,
  "note": ""
}
```

- `POST /api/gifts` needs `giverName`, plus `cashPaise` or `itemDescription` or both. 400 `GIFT_EMPTY` if both are missing.
- When `guestId` is sent without `giverName`, the guest's name is used.
- `GET /api/gifts` takes `eventId`, `returnGiftDone` and `q`, and returns `totalCashPaise` for the filters.

### GET /api/gifts/summary

```json
{ "totalCashPaise": 45000000, "giftCount": 210, "itemCount": 64, "returnGiftsPending": 38 }
```

### POST /api/files/upload-url

```json
// Request
{ "purpose": "receipt", "contentType": "image/jpeg", "sizeBytes": 850000 }

// 200 Response
{ "key": "weddings/…/receipts/….jpg", "uploadUrl": "https://…r2.cloudflarestorage.com/…", "expiresIn": 600 }
```

| `purpose` | Allowed types | Size limit |
| --- | --- | --- |
| `receipt` | JPEG, PNG, WebP, PDF | 5 MB |
| `cover` | JPEG, PNG, WebP | 5 MB |

- The browser uploads with `PUT` to `uploadUrl`, sending the same `Content-Type`, within 10 minutes.
- The key is then saved on the expense, or on the wedding as `coverPhotoKey`.
- 413 `FILE_TOO_LARGE` over the limit. 400 `FILE_TYPE_NOT_ALLOWED` for other types. 409 `STORAGE_FULL` if the wedding has reached its storage cap.

## Vendors

All vendor endpoints need **Member** access.

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/vendors` | The wedding's vendors, with total paid to each |
| POST | `/api/vendors` | Add a vendor |
| GET | `/api/vendors/:id` | One vendor, with their linked expenses |
| PATCH | `/api/vendors/:id` | Update a vendor or change its status |
| DELETE | `/api/vendors/:id` | Delete a vendor. Its expenses stay |
| POST | `/api/vendors/:id/share` | Publish to the shared directory |
| GET | `/api/vendors/maps-search-link` | A Google Maps search link for a category and city |
| GET | `/api/shared-vendors` | Browse the shared directory, paginated |
| GET | `/api/shared-vendors/cities` | Cities that have shared vendors, for the filter |
| POST | `/api/shared-vendors/:id/add` | Copy a shared vendor into this wedding's list |

### The vendor object

```json
{
  "id": "…",
  "name": "Lens & Light Studio",
  "category": "photography",
  "city": "Visakhapatnam",
  "contactPerson": "Suresh",
  "phone": "+91 90000 00000",
  "email": "…",
  "mapsLink": "https://maps.app.goo.gl/…",
  "websiteLink": "https://instagram.com/…",
  "status": "booked",
  "quote": "₹80,000 for 2 events",
  "notes": "Includes drone",
  "eventIds": ["…"],
  "isShared": true,
  "paidPaise": 3000000
}
```

- `isShared` is true when the vendor is linked to a shared directory entry.
- `paidPaise` is the total of expenses with this `vendorId`, worked out on read.

### GET /api/vendors

Takes `category` and `status` filters. Returns `{ "items": [ … ] }`, grouped by the UI by category.

### POST /api/vendors

`name`, `category` and `city` are required. Add `"share": true` to publish to the directory at the same time. Returns `201` with `{ "vendor": { … } }`.

### POST /api/vendors/:id/share

Publishes the business details only: name, category, city, phone and links. If a matching entry exists, by phone or by name and city, the vendor is linked to it instead of making a duplicate. Returns `{ "sharedVendorId": "…", "linkedExisting": true }`.

400 `SHARE_NEEDS_CONTACT` if the vendor has neither a phone nor a maps link, since a directory entry with no way to reach it isn't useful.

### GET /api/vendors/maps-search-link

`?category=bridal makeup&city=Visakhapatnam`. Returns:

```json
{ "url": "https://www.google.com/maps/search/?api=1&query=bridal%20makeup%20Visakhapatnam" }
```

The page opens it in a new tab. Built on the server so the category wording stays consistent. No Google account or key is used.

### GET /api/shared-vendors

| Query | Meaning |
| --- | --- |
| `category` | One vendor category. Required |
| `city` | One city. Required |
| `q` | Search by name |
| `limit`, `cursor` | Pagination |

```json
{
  "items": [
    { "id": "…", "name": "Lens & Light Studio", "category": "photography", "city": "Visakhapatnam",
      "phone": "…", "mapsLink": "…", "websiteLink": "…", "useCount": 7, "inMyList": false }
  ],
  "nextCursor": "…"
}
```

- Sorted by `useCount`, most used first.
- `inMyList` is true if this wedding already has the vendor.
- The publishing wedding is never shown. Hidden entries aren't returned.

### POST /api/shared-vendors/:id/add

Copies the entry into this wedding's vendors with status `shortlisted`, links it with `sharedVendorId`, and raises the entry's `useCount` by 1. Returns `201` with `{ "vendor": { … } }`.

409 `VENDOR_ALREADY_ADDED` if this wedding already has it.

### Platform owner

Removing spam from the directory is done directly in the database by the platform owner in v1, by setting `hidden: true`. There's no endpoint for it, so no wedding member can do it.

## Tasks and dashboard

All endpoints here need **Member** access.

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/tasks` | Task list with filters |
| POST | `/api/tasks` | Create a task |
| PATCH | `/api/tasks/:id` | Update a task |
| POST | `/api/tasks/:id/done` | Mark a task done |
| POST | `/api/tasks/:id/reopen` | Set a done task back to to do |
| DELETE | `/api/tasks/:id` | Delete a task |
| GET | `/api/dashboard` | Everything the dashboard shows, in one call |

### The task object

```json
{
  "id": "…",
  "title": "Confirm caterer headcount",
  "assignee": { "id": "…", "name": "Anil", "removed": false },
  "dueDate": "2027-02-05",
  "eventId": "…",
  "status": "todo",
  "overdue": false,
  "note": "Use RSVP numbers from the Reception",
  "completedAt": null,
  "completedBy": null,
  "createdBy": { "id": "…", "name": "Leela" }
}
```

- `overdue` is worked out on read: status `todo` and `dueDate` before today in India Standard Time.
- `assignee.removed` is true when the assignee has left the workspace, so the UI can flag the task for reassigning.

### GET /api/tasks

| Query | Meaning |
| --- | --- |
| `view` | `all` (default), `mine` or `overdue` |
| `status` | `todo` or `done` |
| `eventId` | One event |
| `assigneeId` | One member |

Returns `{ "items": [ … ] }`, sorted by `dueDate`, earliest first, with done tasks after open ones.

### POST /api/tasks

```json
{ "title": "Confirm caterer headcount", "assigneeId": "…", "dueDate": "2027-02-05",
  "eventId"?: "…", "note"?: "…" }
```

Returns `201` with `{ "task": { … } }`. 400 `ASSIGNEE_NOT_MEMBER` if the assignee isn't an active member of this wedding.

### POST /api/tasks/:id/done

Sets `status` to `done`, with `completedAt` and `completedBy`. Allowed for the assignee and for any Admin. 403 `NOT_ASSIGNEE` for any other Manager. Returns `{ "task": { … } }`.

`POST /api/tasks/:id/reopen` follows the same rule, and clears `completedAt` and `completedBy`.

### GET /api/dashboard

```json
{
  "wedding": { "brideName": "Priya", "groomName": "Ravi", "weddingDate": "2027-02-14", "daysToGo": 116 },
  "upcomingEvents": [
    { "id": "…", "name": "Haldi", "date": "2027-02-11", "time": "09:00", "venueName": "Home" }
  ],
  "rsvp": {
    "overall": { "invited": 412, "attending": 260, "declined": 30, "notReplied": 122 },
    "byEvent": [ { "eventId": "…", "name": "Reception", "invited": 380, "attending": 240,
                   "declined": 25, "notReplied": 115, "headcount": 610 } ]
  },
  "money": { "totalSpentPaise": 125000000 },
  "tasks": { "total": 48, "done": 30, "pending": 18, "overdue": 3,
             "mine": [ { "id": "…", "title": "…", "dueDate": "…", "overdue": true } ] },
  "pendingInvites": 2
}
```

- `daysToGo` is counted in India Standard Time, and is 0 on the wedding day.
- `upcomingEvents` holds the next 5 events from today.
- `rsvp.overall` counts each guest once: **attending** if they're coming to at least one event, **declined** if they declined everything they answered, and **not replied** if they haven't answered any.
- `tasks.mine` holds the logged-in member's next 5 open tasks.
- `pendingInvites` is included for Admins only.

## QR codes and photos

All endpoints here need **Member** access.

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/qr-codes` | All QR codes, with upload counts |
| POST | `/api/qr-codes` | Create a QR code for an event |
| PATCH | `/api/qr-codes/:id` | Rename it, or turn uploads on or off |
| POST | `/api/qr-codes/:id/regenerate` | Replace the token. Printed copies stop working |
| GET | `/api/qr-codes/:id/image` | The QR code as a PNG to print |
| DELETE | `/api/qr-codes/:id` | Delete a QR code. Its photos stay |
| GET | `/api/photos` | All photos, including hidden, paginated |
| PATCH | `/api/photos/:id` | Hide or show a photo, or move it to another event |
| DELETE | `/api/photos/:id` | Delete a photo and its files |
| POST | `/api/photos/bulk` | Hide, show or delete many photos at once |
| GET | `/api/photos/download-links` | Signed links for every photo, to build a zip in the browser |
| GET | `/api/storage` | Storage used against the wedding's cap |

### The QR code object

```json
{
  "id": "…",
  "label": "Reception",
  "eventId": "…",
  "uploadsEnabled": true,
  "uploadUrl": "https://make-my-marriage.vercel.app/u/<token>",
  "photoCount": 240
}
```

`uploadUrl` is shown so members can copy the link and share it by text as well as by QR code.

### POST /api/qr-codes

```json
{ "eventId": "…", "label"?: "Reception" }
```

`label` defaults to the event's name. Returns `201` with `{ "qrCode": { … } }`. 409 `QR_EXISTS_FOR_EVENT` if that event already has one. Regenerate it instead.

The whole-wedding QR code is made with the wedding and can't be deleted, only regenerated or switched off.

### GET /api/qr-codes/:id/image

Returns `image/png`, 1024 pixels square, with the wedding's names and the label printed under the code. `?download=1` sets the file name, such as `priya-weds-ravi-reception-qr.png`.

### GET /api/photos

| Query | Meaning |
| --- | --- |
| `eventId` | One event, or `none` for whole-wedding uploads |
| `hidden` | `true` or `false` |
| `limit`, `cursor` | Pagination, newest first |

```json
{
  "items": [
    { "id": "…", "eventId": "…", "uploaderName": "Kiran", "hidden": false,
      "width": 2000, "height": 1500, "createdAt": "…",
      "thumbUrl": "https://…", "fullUrl": "https://…" }
  ],
  "nextCursor": "…"
}
```

`thumbUrl` and `fullUrl` are signed view links valid for 1 hour. The page asks again for a fresh page of results if they expire.

### POST /api/photos/bulk

```json
{ "photoIds": ["…", "…"], "action": "hide" }
```

`action` is `hide`, `show` or `delete`. Up to 200 photos per call. Returns `{ "updated": 35 }`.

### GET /api/photos/download-links

Returns `{ "items": [ { "fileName": "reception/0001-kiran.jpg", "url": "https://…" } ] }` for every photo that isn't hidden, grouped into folders by event. Links last 1 hour. The browser fetches each one and builds the zip with JSZip, so no server request runs long. `?includeHidden=true` adds hidden photos.

### GET /api/storage

```json
{ "usedBytes": 1288490188, "capBytes": 2147483648, "photoCount": 612 }
```

## Guest-facing endpoints

These serve guests and photographers, who never log in. They live under `/api/public/` and carry no session cookie. Pages at `/w/<slug>`, `/i/<token>` and `/u/<token>` are rendered on the server with the same data, so these endpoints are mainly for actions and for loading more.

| Method | Path | Access | Does |
| --- | --- | --- | --- |
| GET | `/api/public/w/:slug` | Public | Wedding website content |
| GET | `/api/public/w/:slug/photos` | Public | Gallery photos, paginated, if the gallery is on |
| GET | `/api/public/invite/:token` | Token | The guest's invitation, events and current answers |
| POST | `/api/public/invite/:token/rsvp` | Token | Save RSVP answers |
| GET | `/api/public/upload/:token` | Token | Upload page details |
| POST | `/api/public/upload/:token/urls` | Token | Signed upload URLs for a batch of photos |
| POST | `/api/public/upload/:token/complete` | Token | Save the photos that uploaded |

An unknown or regenerated token always answers 404 `LINK_NOT_FOUND`, with the same message, so links can't be guessed by trying.

### GET /api/public/w/:slug

```json
{
  "wedding": { "brideName": "Priya", "groomName": "Ravi", "weddingDate": "2027-02-14",
               "coverPhotoUrl": "https://…", "theme": "floral", "galleryEnabled": true },
  "events": [
    { "name": "Sangeet Night", "type": "Sangeet", "date": "2027-02-12", "time": "18:30",
      "venueName": "…", "address": "…", "mapLink": "…", "dressCode": "…",
      "youtubeLink": "…", "isLiveNow": false }
  ]
}
```

- 404 `WEDDING_NOT_FOUND` if the slug is unknown or the website isn't published.
- Event IDs and notes aren't included. Notes are for members only.
- `isLiveNow` is true from 30 minutes before the event's time until 6 hours after, when a `youtubeLink` is set.
- `coverPhotoUrl` is a signed link valid for 1 hour.
- Sent with `X-Robots-Tag: noindex`.

### GET /api/public/w/:slug/photos

`?event=<event name>&limit=40&cursor=…`. Returns photos that aren't hidden, newest first, each with `thumbUrl`, `fullUrl`, `width` and `height`. 404 `GALLERY_OFF` if the gallery is turned off.

### GET /api/public/invite/:token

```json
{
  "guest": { "name": "Lakshmi Rao" },
  "wedding": { "brideName": "Priya", "groomName": "Ravi", "weddingDate": "2027-02-14",
               "slug": "priya-weds-ravi", "rsvpCutoffDate": "2027-02-01", "rsvpOpen": true },
  "events": [
    { "id": "…", "name": "Reception", "date": "2027-02-14", "time": "19:00",
      "venueName": "…", "address": "…", "mapLink": "…", "dressCode": "…",
      "rsvp": { "attending": true, "headcount": 3 } }
  ]
}
```

- Only the events this guest is invited to are listed.
- `rsvp` is `null` for events not yet answered.
- `rsvpOpen` is false after the cut-off date.
- Opening the page sets `inviteOpenedAt` the first time.

### POST /api/public/invite/:token/rsvp

```json
// Request
{ "answers": [
    { "eventId": "…", "attending": true, "headcount": 3 },
    { "eventId": "…", "attending": false }
] }

// 200 Response
{ "saved": 2 }
```

- Each `eventId` must be one the guest is invited to. 400 `EVENT_NOT_INVITED` otherwise.
- `headcount` is required when attending, from 1 to 20. It's set to 0 when not attending.
- 403 `RSVP_CLOSED` after the cut-off date.
- Rate limit: 20 saves per guest per hour.

### GET /api/public/upload/:token

```json
{ "weddingName": "Priya & Ravi", "label": "Reception", "uploadsEnabled": true,
  "limits": { "maxFiles": 50, "maxBytesPerFile": 2097152, "maxThumbBytes": 409600 } }
```

### POST /api/public/upload/:token/urls

```json
// Request
{ "files": [ { "sizeBytes": 1800000, "thumbSizeBytes": 90000, "width": 2000, "height": 1500 } ] }

// 200 Response
{ "uploads": [
    { "photoId": "…", "uploadUrl": "https://…", "thumbUploadUrl": "https://…" }
], "expiresIn": 600 }
```

- Up to 50 files per request. All uploads are JPEG, since the browser converts during compression.
- 403 `UPLOADS_OFF` if uploads are switched off for this QR code.
- 413 `FILE_TOO_LARGE` if a file is over the limit. 409 `STORAGE_FULL` if the wedding has reached its cap.
- Rate limit: 10 requests per QR code per IP in 10 minutes.

### POST /api/public/upload/:token/complete

```json
// Request
{ "uploaderName"?: "Kiran", "photoIds": ["…", "…"] }

// 200 Response
{ "saved": 48, "missing": ["…"] }
```

- The server checks each file and its thumbnail exist in R2 before saving the photo record.
- `missing` lists photo IDs whose upload didn't arrive, so the page can offer a retry.
- A photo ID is only accepted if its file exists in this wedding's folder in R2, which only a signed URL issued for this wedding can create.

## Error codes

Every error code the API returns, grouped by area. The UI matches on `code`, and shows `message` to the person.

### General

| Code | Status | When |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | Input failed the Zod schema. `fields` says which and why |
| `NOT_AUTHENTICATED` | 401 | No session, or it has expired |
| `NO_WORKSPACE` | 403 | Logged in but not a member of any wedding |
| `FORBIDDEN` | 403 | The member's role can't do this, such as a Manager on an Admin route |
| `FORBIDDEN_ORIGIN` | 403 | A write request came from another site |
| `NOT_FOUND` | 404 | The record doesn't exist, or belongs to another wedding |
| `RATE_LIMITED` | 429 | Too many attempts. `Retry-After` gives the wait in seconds |
| `SERVER_ERROR` | 500 | Something failed on the server. Details are only in the logs |

### Auth and members

| Code | Status | When |
| --- | --- | --- |
| `EMAIL_TAKEN` | 409 | Signup with an email that already has an account |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password, or a wrong current password |
| `TOKEN_INVALID` | 400 | Reset or invite link unknown, expired or used |
| `ALREADY_IN_WORKSPACE` | 409 | Creating a wedding while already in one |
| `ALREADY_MEMBER` | 409 | Inviting someone already in this wedding |
| `IN_OTHER_WORKSPACE` | 409 | Inviting or accepting for someone in, or invited to, another wedding |
| `LAST_ADMIN` | 409 | A change that would leave no Admin |
| `CREATOR_PROTECTED` | 403 | Removing the workspace creator |

### Wedding and events

| Code | Status | When |
| --- | --- | --- |
| `SLUG_TAKEN` | 409 | Website address used by another wedding |
| `SLUG_RESERVED` | 400 | Website address is a reserved word |
| `UNKNOWN_EVENT_TYPE` | 400 | Event type isn't a default or custom type |
| `TYPE_EXISTS` | 409 | Adding a custom type that already exists |
| `TOO_MANY_TYPES` | 400 | More than 30 custom types |

### Guests and invitations

| Code | Status | When |
| --- | --- | --- |
| `GUEST_EMAIL_EXISTS` | 409 | Another guest in this wedding has the email |
| `IMPORT_FILE_INVALID` | 400 | Not a `.csv` or `.xlsx`, missing the header row, or over 2,000 rows |
| `SEND_IN_PROGRESS` | 409 | Starting a send while another is in progress |
| `SEND_BUSY` | 409 | A batch for this send is already running. Try again shortly |
| `EMAIL_CAP_REACHED` | 429 | The daily email cap is used up |

### Money, vendors and tasks

| Code | Status | When |
| --- | --- | --- |
| `UNKNOWN_CATEGORY` | 400 | Expense or vendor category not in the list |
| `GIFT_EMPTY` | 400 | A gift with neither cash nor an item |
| `SHARE_NEEDS_CONTACT` | 400 | Sharing a vendor with no phone or maps link |
| `VENDOR_ALREADY_ADDED` | 409 | Adding a shared vendor already in the list |
| `ASSIGNEE_NOT_MEMBER` | 400 | Assigning a task to someone not in the wedding |
| `NOT_ASSIGNEE` | 403 | A Manager completing someone else's task |

### Files, photos and QR codes

| Code | Status | When |
| --- | --- | --- |
| `FILE_TOO_LARGE` | 413 | A file over its size limit |
| `FILE_TYPE_NOT_ALLOWED` | 400 | A file type that isn't allowed for its purpose |
| `STORAGE_FULL` | 409 | The wedding has reached its storage cap |
| `QR_EXISTS_FOR_EVENT` | 409 | Creating a second QR code for one event |
| `UPLOADS_OFF` | 403 | Uploading through a switched-off QR code |

### Guest-facing

| Code | Status | When |
| --- | --- | --- |
| `LINK_NOT_FOUND` | 404 | Unknown or regenerated invitation or QR link |
| `WEDDING_NOT_FOUND` | 404 | Unknown slug, or the website isn't published |
| `GALLERY_OFF` | 404 | The gallery is turned off |
| `EVENT_NOT_INVITED` | 400 | An RSVP for an event the guest isn't invited to |
| `RSVP_CLOSED` | 403 | An RSVP after the cut-off date |
