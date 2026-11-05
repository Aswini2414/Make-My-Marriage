# Make My Marriage — Database Design (v1)

Oct 21, 2026 · @Leela Manikanta Cheekatla

## Overview and conventions

This document defines every MongoDB collection for version 1 of Make My Marriage: fields, types, rules, references, indexes, the main queries, and what happens when data is deleted. It expands the data model in the System Design document and is the reference for writing the Mongoose models.

**Database:** one MongoDB Atlas database per environment, `mmm_dev` and `mmm_prod`. There are 17 collections.

### Conventions

| Topic | Rule |
| --- | --- |
| IDs | Every document uses MongoDB's default `_id` (ObjectId). References to other documents are ObjectIds named `<thing>Id`, such as `weddingId` or `eventId` |
| Names | Collections are plural camelCase (`memberInvites`). Fields are camelCase |
| Wedding scope | Every collection except `users`, `passwordResets`, `sharedVendors` and `rateLimits` has a required, indexed `weddingId`. Every query on those collections filters by it |
| Timestamps | Every collection has `createdAt` and `updatedAt`, set by Mongoose's `timestamps: true`. They're not repeated in the field tables below |
| Money | Stored in **paise** as whole numbers (`Int`). ₹80,000 is `8000000`. Never stored as a decimal |
| Dates | A calendar date with no time of day, such as an event date, is stored as a string `YYYY-MM-DD`. A moment in time, such as `respondedAt`, is a `Date` in UTC. The UI shows times in India Standard Time |
| Times of day | Stored as a string `HH:mm` in 24-hour time, such as `18:30` |
| Text | Trimmed on save. Emails are stored lowercase |
| Enums | Stored as lowercase strings, such as `admin` or `manager`. The allowed values are listed with each field |
| Tokens | Never stored in plain form. Every token is looked up by its SHA-256 hash, a 64-character hex string. Guest invitation and QR tokens, which must be re-sent or re-printed, are also stored encrypted with AES-256-GCM using a server key. Member invite and password reset tokens are hash only |
| Files | Never stored in MongoDB. Documents keep the R2 object key only |
| Deletes | Records are deleted outright, except `memberships`, which change to status `removed` so the history of who was in a workspace is kept |

### Field table legend

Each collection below has a table with these columns:

- **Field** is the name in the document.
- **Type** is the MongoDB type: `ObjectId`, `String`, `Int`, `Boolean`, `Date`, or an array such as `[ObjectId]`.
- **Req** says whether the field must be present: **Yes** or **No**.
- **Rules** lists validation, defaults and allowed values. The same rules are written in the Zod schema for that module.

## Relationships

The `weddings` document is the centre of the data. Twelve collections point to it through `weddingId`, so deleting a wedding means deleting everything that carries its ID.

&#91;embedded content: collections by group · linked by weddingId\]

The dashed line shows that `sharedVendors` isn't owned by one wedding. A wedding's vendor can be copied from it, or published to it. Two collections sit outside the picture: `passwordResets` belongs to a user, and `rateLimits` belongs to no one.

### References

| From | Field | Points to | Kind |
| --- | --- | --- | --- |
| `memberships` | `userId` | `users` | Each user has at most one active or invited membership |
| `memberships` | `invitedBy` | `users` | Optional. Empty for the workspace creator |
| `weddings` | `createdBy` | `users` | The creator, who can't be removed |
| `memberInvites` | `invitedBy` | `users` | The Admin who sent the invite |
| `passwordResets` | `userId` | `users` |  |
| `guests` | `eventIds` | `events` | Array. The events a guest is invited to |
| `rsvps` | `guestId`, `eventId` | `guests`, `events` | One answer per guest per event |
| `invitationSends` | `guestIds`, `eventIds` | `guests`, `events` | Arrays fixed when the send starts |
| `expenses` | `eventId`, `vendorId` | `events`, `vendors` | Both optional |
| `gifts` | `guestId`, `eventId` | `guests`, `events` | Both optional. A giver doesn't have to be on the guest list |
| `vendors` | `eventIds` | `events` | Array. Events the vendor serves |
| `vendors` | `sharedVendorId` | `sharedVendors` | Optional. Set when copied from, or published to, the directory |
| `sharedVendors` | `addedByWeddingId` | `weddings` | Who published it. Kept as a plain ID, not cascaded |
| `tasks` | `assigneeId`, `eventId` | `users`, `events` | `eventId` is optional |
| `qrCodes` | `eventId` | `events` | Optional. Empty means the whole-wedding QR code |
| `photos` | `eventId`, `qrCodeId` | `events`, `qrCodes` | `eventId` is optional |

**Why references and not embedding:** guests, RSVPs, expenses and photos grow into the hundreds or thousands per wedding, and each is listed, filtered and edited on its own. Separate collections keep every document small and every query simple. The two small, fixed lists, a guest's `eventIds` and a wedding's `customEventTypes`, are embedded as arrays.

## Accounts and members

### users

One document per person who can log in. Guests and photographers never have one.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `name` | String | Yes | 1 to 80 characters |
| `email` | String | Yes | Valid email, lowercase, unique |
| `passwordHash` | String | Yes | bcrypt hash, cost 12. Never returned by any API |
| `lastLoginAt` | Date | No | Set on each successful login |
| `passwordChangedAt` | Date | No | Set when the password is reset or changed. A session issued before this moment is refused, so a reset ends every other session |

### memberships

Links a user to the one wedding they belong to, with their role.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `weddingId` | ObjectId | Yes | Refers to `weddings` |
| `userId` | ObjectId | Yes | Refers to `users` |
| `role` | String | Yes | `admin` or `manager` |
| `status` | String | Yes | `active` or `removed`. Default `active`. A pending invite lives in `memberInvites` until accepted |
| `invitedBy` | ObjectId | No | Refers to `users`. Empty for the creator |
| `joinedAt` | Date | No | Set when the status becomes `active` |
| `removedAt` | Date | No | Set when the status becomes `removed`, or when the member leaves |

**Rules the app enforces:**

- A user can have only one `active` membership. A partial unique index guarantees it. An invite is also refused if the email already has a pending, unexpired invite from another wedding.
- A wedding must always have at least one `active` membership with role `admin`.
- The membership of `weddings.createdBy` can't be set to `removed` by another member.

### memberInvites

An invitation to join a wedding, sent by email. It becomes a membership when accepted.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `weddingId` | ObjectId | Yes | Refers to `weddings` |
| `name` | String | Yes | 1 to 80 characters, used to pre-fill signup |
| `email` | String | Yes | Valid email, lowercase |
| `role` | String | Yes | `admin` or `manager` |
| `tokenHash` | String | Yes | SHA-256 hex, unique |
| `invitedBy` | ObjectId | Yes | Refers to `users` |
| `expiresAt` | Date | Yes | 7 days after sending. TTL index deletes it after this time |
| `acceptedAt` | Date | No | Set on use. An accepted invite can't be used again |

Resending an invite to the same email replaces the earlier unaccepted invite for that wedding, so only one link works at a time.

### passwordResets

A one-time password reset link.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `userId` | ObjectId | Yes | Refers to `users` |
| `tokenHash` | String | Yes | SHA-256 hex, unique |
| `expiresAt` | Date | Yes | 1 hour after the request. TTL index deletes it after this time |
| `usedAt` | Date | No | Set on use |

A new reset request deletes any earlier unused reset for that user.

## Wedding and events

### weddings

One document per workspace. It holds the wedding details and the website settings.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `brideName` | String | Yes | 1 to 60 characters |
| `groomName` | String | Yes | 1 to 60 characters |
| `weddingDate` | String | Yes | `YYYY-MM-DD`. Drives the dashboard countdown |
| `coverPhotoKey` | String | No | R2 key of the cover photo |
| `slug` | String | Yes | Unique. Lowercase letters, digits and hyphens, 3 to 60 characters. Suggested from the names, such as `priya-weds-ravi`, and editable by Admins |
| `theme` | String | Yes | `classic`, `floral`, `modern` or `royal`. Default `classic` |
| `websitePublished` | Boolean | Yes | Default `false`. When false, the website address shows "not available" |
| `galleryEnabled` | Boolean | Yes | Default `false`. When true, the gallery shows on the website |
| `rsvpCutoffDate` | String | No | `YYYY-MM-DD`. After it, RSVP answers become read-only |
| `customEventTypes` | \[String\] | Yes | Default empty. Event types added with **+ Add new type**, up to 30, each 1 to 40 characters |
| `storageUsedBytes` | Int | Yes | Default `0`. Sum of `photos.sizeBytes` and receipt sizes, checked against the per-wedding cap |
| `createdBy` | ObjectId | Yes | Refers to `users`. Can't be changed |

Website slugs that clash with app routes are reserved and refused, such as `api`, `login`, `dashboard` and `admin`.

### events

One document per event in the wedding.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `weddingId` | ObjectId | Yes | Refers to `weddings` |
| `name` | String | Yes | 1 to 80 characters, such as "Sangeet Night" |
| `type` | String | Yes | One of the default types or one of the wedding's `customEventTypes` |
| `date` | String | Yes | `YYYY-MM-DD` |
| `time` | String | Yes | `HH:mm` |
| `venueName` | String | Yes | 1 to 120 characters |
| `address` | String | No | Up to 300 characters |
| `mapLink` | String | No | Must be an `https` URL |
| `dressCode` | String | No | Up to 120 characters |
| `notes` | String | No | Up to 1,000 characters |
| `youtubeLink` | String | No | Must be a `youtube.com` or `youtu.be` URL. Shown as the live stream on the website |

**Default event types**, defined in code rather than in the database: Engagement, Haldi, Mehendi, Sangeet, Pellikuthuru / Pellikoduku, Wedding (Muhurtham), Reception, Vratham / Pooja. The type dropdown shows these first, then the wedding's custom types.

Events are always sorted by `date`, then `time`. Because both are fixed-width strings, sorting them as text gives the right order.

## Guests, RSVPs and invitations

### guests

One document per invited person or family contact.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `weddingId` | ObjectId | Yes | Refers to `weddings` |
| `name` | String | Yes | 1 to 100 characters |
| `email` | String | No | Valid email, lowercase. Needed to receive an emailed invitation |
| `phone` | String | No | Digits, spaces and `+` only, up to 20 characters |
| `relation` | String | No | Up to 60 characters, such as "Mother's cousin" |
| `household` | String | No | Up to 80 characters. Groups guests from one family, such as "Rao family, Vizag" |
| `eventIds` | \[ObjectId\] | Yes | Refers to `events`. Default empty |
| `inviteTokenHash` | String | Yes | SHA-256 hex, unique. Created with the guest |
| `lastInviteSentAt` | Date | No | Set when an invitation email goes out |
| `lastReminderSentAt` | Date | No | Set when a reminder email goes out |
| `inviteOpenedAt` | Date | No | Set the first time the guest opens their link |

**The guest's link** is also stored as `inviteTokenEnc` (String, required): the token encrypted with `TOKEN_ENCRYPTION_KEY`. Reminder emails decrypt it to include the same link again. A database leak alone doesn't expose working links, because the key lives only in the environment.

**Import from CSV or Excel:** the template's columns are `name`, `email`, `phone`, `relation`, `household` and `events`. The `events` column lists event names separated by commas, matched to the wedding's events. Each row is validated with the same Zod schema before anything is saved, and the import shows errors per row.

**Duplicates:** two guests in the same wedding with the same email are refused, through a partial unique index on `weddingId` and `email` where `email` exists.

### rsvps

One guest's answer for one event.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `weddingId` | ObjectId | Yes | Refers to `weddings` |
| `guestId` | ObjectId | Yes | Refers to `guests` |
| `eventId` | ObjectId | Yes | Refers to `events`. Must be in the guest's `eventIds` |
| `attending` | Boolean | Yes |  |
| `headcount` | Int | Yes | 0 when not attending, otherwise 1 to 20 |
| `respondedAt` | Date | Yes | Updated on every change |

A guest with no `rsvps` document for an event counts as **not replied**. Saving an answer is an upsert on `guestId` and `eventId`, so changing an answer replaces the old one.

### invitationSends

One batched send of invitations or reminders, with its progress.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `weddingId` | ObjectId | Yes | Refers to `weddings` |
| `kind` | String | Yes | `invite` or `reminder` |
| `eventIds` | \[ObjectId\] | Yes | Events the emails cover |
| `guestIds` | \[ObjectId\] | Yes | Every guest to email, fixed when the send starts. Guests without an email are left out up front. A separate optional Date field, lockedUntil, is set for one minute while a batch is sending, so only one batch runs at a time |
| `sentGuestIds` | \[ObjectId\] | Yes | Default empty. Guests emailed so far |
| `failedGuestIds` | \[ObjectId\] | Yes | Default empty. Guests whose email failed |
| `status` | String | Yes | `in_progress`, `paused_daily_limit`, `completed` or `cancelled` |
| `startedBy` | ObjectId | Yes | Refers to `users` |
| `completedAt` | Date | No | Set when the status becomes `completed` |

**Next batch:** the next 20 guests are those in `guestIds` that are in neither `sentGuestIds` nor `failedGuestIds`. Progress is `sentGuestIds` plus `failedGuestIds` against the length of `guestIds`.

**Daily cap:** before each batch, the server adds up emails sent across all of the app's sends in the last 24 hours. Every sent email is logged with a timestamp in the `rateLimits` collection under the key `gmail:daily`, so the count is one query.

**Size:** a wedding of 1,000 guests gives three arrays of up to 1,000 ObjectIds, about 36 KB in all. That is well under MongoDB's 16 MB document limit.

## Money and vendors

### expenses

One line in the expense log.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `weddingId` | ObjectId | Yes | Refers to `weddings` |
| `amountPaise` | Int | Yes | 1 to 100,000,000,000 (₹1 to ₹100 crore) |
| `date` | String | Yes | `YYYY-MM-DD`, the day it was paid |
| `category` | String | Yes | One of the categories below |
| `description` | String | No | Up to 200 characters, such as "Stage flowers advance" |
| `eventId` | ObjectId | No | Refers to `events` |
| `vendorId` | ObjectId | No | Refers to `vendors` |
| `paidBy` | String | Yes | 1 to 80 characters. The person's name, typed in, since the payer may not be a member |
| `mode` | String | Yes | `cash`, `upi`, `card` or `bank_transfer` |
| `note` | String | No | Up to 500 characters |
| `receiptKey` | String | No | R2 key of the receipt image or PDF |
| `receiptSizeBytes` | Int | No | Added to `weddings.storageUsedBytes` |
| `createdBy` | ObjectId | Yes | Refers to `users`. Who recorded it |

**Categories**, defined in code: venue, catering, decoration, photography and video, clothing, jewellery, makeup and mehendi, music and entertainment, invitations and printing, gifts and return gifts, priest and rituals, travel, other.

### gifts

One gift or cash amount received.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `weddingId` | ObjectId | Yes | Refers to `weddings` |
| `giverName` | String | Yes | 1 to 100 characters. Filled from the guest when `guestId` is set |
| `guestId` | ObjectId | No | Refers to `guests` |
| `cashPaise` | Int | No | 1 or more |
| `itemDescription` | String | No | Up to 200 characters, such as "Silver lamp pair" |
| `eventId` | ObjectId | No | Refers to `events` |
| `returnGift` | String | No | Up to 200 characters. What was given back |
| `returnGiftDone` | Boolean | Yes | Default `false` |
| `note` | String | No | Up to 500 characters |
| `createdBy` | ObjectId | Yes | Refers to `users` |

A gift must have `cashPaise`, `itemDescription`, or both. Zod checks this, since MongoDB can't require one of two fields on its own.

### vendors

A vendor in this wedding's list. Private to the wedding.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `weddingId` | ObjectId | Yes | Refers to `weddings` |
| `name` | String | Yes | 1 to 120 characters |
| `category` | String | Yes | One of the vendor categories below |
| `city` | String | Yes | 1 to 60 characters |
| `contactPerson` | String | No | Up to 80 characters |
| `phone` | String | No | Up to 20 characters |
| `email` | String | No | Valid email |
| `mapsLink` | String | No | `https` URL, usually a Google Maps link |
| `websiteLink` | String | No | `https` URL, such as a website or Instagram page |
| `status` | String | Yes | `shortlisted`, `contacted`, `booked` or `rejected`. Default `shortlisted` |
| `quote` | String | No | Up to 200 characters, free text such as "₹80,000 for 2 events" |
| `notes` | String | No | Up to 1,000 characters |
| `eventIds` | \[ObjectId\] | Yes | Refers to `events`. Default empty |
| `sharedVendorId` | ObjectId | No | Refers to `sharedVendors` |

**Quote is text, not a number,** because quotes come in forms like "₹80,000 for 2 events" or "₹1,200 per plate". Actual payments are recorded as `expenses` with `vendorId` set, and the vendor page shows their total.

**Vendor categories**, defined in code: photography, videography, decoration, catering, bridal makeup, mehendi artist, venue, tent house, priest, music and DJ, invitations and printing, transport, other.

### sharedVendors

The community vendor directory. Readable by every wedding, and holds business details only.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `name` | String | Yes | 1 to 120 characters |
| `category` | String | Yes | One of the vendor categories |
| `city` | String | Yes | 1 to 60 characters. Stored in title case so filters match |
| `phone` | String | No | Up to 20 characters |
| `mapsLink` | String | No | `https` URL |
| `websiteLink` | String | No | `https` URL |
| `addedByWeddingId` | ObjectId | Yes | Refers to `weddings`. Never shown to other weddings |
| `useCount` | Int | Yes | Default `1`. Goes up when another wedding adds it to their list, used to sort the directory |
| `hidden` | Boolean | Yes | Default `false`. Set by the platform owner to remove spam or wrong entries |

Publishing a vendor that matches an existing entry by phone number, or by name and city, links to that entry instead of creating a duplicate.

## Tasks, QR codes and photos

### tasks

One task in the wedding's task list.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `weddingId` | ObjectId | Yes | Refers to `weddings` |
| `title` | String | Yes | 1 to 150 characters |
| `assigneeId` | ObjectId | Yes | Refers to `users`. Must have an active membership in this wedding |
| `dueDate` | String | Yes | `YYYY-MM-DD` |
| `eventId` | ObjectId | No | Refers to `events` |
| `status` | String | Yes | `todo` or `done`. Default `todo` |
| `note` | String | No | Up to 1,000 characters |
| `completedAt` | Date | No | Set when the status becomes `done`, cleared if set back to `todo` |
| `completedBy` | ObjectId | No | Refers to `users` |
| `createdBy` | ObjectId | Yes | Refers to `users` |

**Overdue** isn't stored. A task is overdue when `status` is `todo` and `dueDate` is before today's date in India Standard Time. Working it out at query time means it can never go stale.

### qrCodes

One QR code that opens the photo upload page.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `weddingId` | ObjectId | Yes | Refers to `weddings` |
| `eventId` | ObjectId | No | Refers to `events`. Empty for the whole-wedding code |
| `label` | String | Yes | 1 to 80 characters, such as "Reception" or "Whole wedding" |
| `tokenHash` | String | Yes | SHA-256 hex, unique |
| `uploadsEnabled` | Boolean | Yes | Default `true` |

One whole-wedding code is created with the wedding. Members can add one per event. Regenerating a code replaces `tokenHash`, so printed copies of the old one stop working.

**The plain token** is also stored as `tokenEnc` (String, required), encrypted with `TOKEN_ENCRYPTION_KEY`. The QR image is drawn on request from the decrypted token, so members can download the PNG again at any time.

### photos

One uploaded photo.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `weddingId` | ObjectId | Yes | Refers to `weddings` |
| `qrCodeId` | ObjectId | Yes | Refers to `qrCodes`. The code it was uploaded through, kept even if that code is later deleted |
| `eventId` | ObjectId | No | Copied from the QR code. Empty for whole-wedding uploads |
| `key` | String | Yes | R2 key, `weddings/<weddingId>/photos/<photoId>.jpg` |
| `thumbKey` | String | Yes | R2 key, `weddings/<weddingId>/photos/<photoId>_thumb.jpg` |
| `uploaderName` | String | No | Up to 60 characters, typed by the guest |
| `sizeBytes` | Int | Yes | Full image plus thumbnail, up to 2.5 MB |
| `width`, `height` | Int | No | Pixels, so the gallery can lay out before images load |
| `hidden` | Boolean | Yes | Default `false`. Hidden photos never reach the public gallery |

The `photoId` is created by the server before upload, when it issues the signed URLs, so the R2 key and the document share one ID.

## System collections

### rateLimits

One document per counted action: a login attempt, an RSVP save, an upload request, or an email sent. Vercel keeps no memory between requests, so counts live here. Counting documents with one key inside a time window gives the rate.

| Field | Type | Req | Rules |
| --- | --- | --- | --- |
| `key` | String | Yes | What is being counted, in the form below |
| `expiresAt` | Date | Yes | When the record stops mattering. A TTL index deletes it after this time |

| Key | Counts | Limit | Window |
| --- | --- | --- | --- |
| `login:<email>` and `login:ip:<ip>` | Failed login attempts | 5 | 15 minutes |
| `signup:ip:<ip>` | Signups | 5 | 1 hour |
| `forgot:<email>` | Password reset requests | 3 | 1 hour |
| `rsvp:<guestId>` | RSVP saves | 20 | 1 hour |
| `upload:<qrCodeId>:<ip>` | Upload URL requests | 10 | 10 minutes |
| `gmail:daily` | Every email the app sends: invitations, reminders, member invites, password resets | 450 | 24 hours |

**How a check works:**

1. Count documents with that `key` and `createdAt` inside the window.
2. If the count is at the limit, refuse the request with status 429 and a "Try again later" message.
3. Otherwise, do the action and insert one document with that `key`, with `expiresAt` at the end of the window.

The IP address comes from Vercel's `x-forwarded-for` header. Keys never hold passwords or tokens.

**Size:** at the Gmail cap, `gmail:daily` holds at most 450 small documents at a time, and the TTL index clears the rest. The whole collection stays at a few thousand documents.

## Indexes

Every index below is declared in its Mongoose schema and created when the app starts in development. In production, indexes are created once with a script, `npm run db:indexes`, so a deploy never rebuilds them by surprise. MongoDB's automatic `_id` index isn't listed.

| Collection | Index | Options | Serves |
| --- | --- | --- | --- |
| `users` | `{ email: 1 }` | unique | Login, signup duplicate check |
| `memberships` | `{ userId: 1 }` | unique, partial where `status` is `active` | One workspace per person; loading the session's wedding |
| `memberships` | `{ weddingId: 1, status: 1, role: 1 }` |  | Member list; counting active Admins |
| `memberInvites` | `{ tokenHash: 1 }` | unique | Accepting an invite |
| `memberInvites` | `{ email: 1, acceptedAt: 1 }` |  | Pending-invite check across weddings |
| `memberInvites` | `{ expiresAt: 1 }` | TTL, `expireAfterSeconds: 0` | Deleting expired invites |
| `passwordResets` | `{ tokenHash: 1 }` | unique | Using a reset link |
| `passwordResets` | `{ expiresAt: 1 }` | TTL, `expireAfterSeconds: 0` | Deleting expired resets |
| `weddings` | `{ slug: 1 }` | unique | Opening the wedding website |
| `events` | `{ weddingId: 1, date: 1, time: 1 }` |  | Events in order; upcoming events on the dashboard |
| `guests` | `{ weddingId: 1, name: 1 }` |  | Guest list sorted by name |
| `guests` | `{ weddingId: 1, email: 1 }` | unique, partial where `email` exists | No duplicate guest emails |
| `guests` | `{ weddingId: 1, eventIds: 1 }` |  | Guests invited to an event |
| `guests` | `{ inviteTokenHash: 1 }` | unique | Opening a guest's invitation link |
| `rsvps` | `{ guestId: 1, eventId: 1 }` | unique | Saving and reading a guest's answers |
| `rsvps` | `{ weddingId: 1, eventId: 1, attending: 1 }` |  | Headcounts and RSVP counts per event |
| `invitationSends` | `{ weddingId: 1, status: 1 }` |  | Finding sends to resume |
| `expenses` | `{ weddingId: 1, date: -1 }` |  | Expense log, newest first; total spent |
| `expenses` | `{ weddingId: 1, vendorId: 1 }` |  | Total paid to a vendor |
| `gifts` | `{ weddingId: 1, createdAt: -1 }` |  | Gift list; totals |
| `vendors` | `{ weddingId: 1, category: 1, status: 1 }` |  | Vendor list by category and status |
| `sharedVendors` | `{ category: 1, city: 1, hidden: 1, useCount: -1 }` |  | Browsing the directory, most used first |
| `sharedVendors` | `{ phone: 1 }` | partial where `phone` exists | Duplicate check when publishing |
| `tasks` | `{ weddingId: 1, status: 1, dueDate: 1 }` |  | Task summary, overdue tasks, task list |
| `tasks` | `{ weddingId: 1, assigneeId: 1, status: 1 }` |  | My tasks |
| `qrCodes` | `{ tokenHash: 1 }` | unique | Opening the upload page |
| `qrCodes` | `{ weddingId: 1 }` |  | QR code list |
| `photos` | `{ weddingId: 1, hidden: 1, eventId: 1, createdAt: -1 }` |  | Gallery by event, newest first |
| `rateLimits` | `{ key: 1, createdAt: 1 }` |  | Counting actions in a window |
| `rateLimits` | `{ expiresAt: 1 }` | TTL, `expireAfterSeconds: 0` | Deleting old records |

The TTL deleter in MongoDB runs about once a minute, so an expired document can linger briefly. The app always checks `expiresAt` itself as well, and never relies on the deletion having happened.

## Main queries

Each query below runs inside a module's service, always with the member's `weddingId`. `today` is today's date in India Standard Time as `YYYY-MM-DD`.

### Dashboard

`GET /api/dashboard` runs these in parallel with `Promise.all`, so the page waits for the slowest one rather than all of them in turn:

| Card | Query | Index used |
| --- | --- | --- |
| Countdown | `weddings.findById(weddingId)` | `_id` |
| Upcoming events | `events.find({ weddingId, date: { $gte: today } }).sort({ date: 1, time: 1 }).limit(5)` | `events` by date |
| RSVP counts | The RSVP aggregation below | `rsvps` by event |
| Total spent | The total-spent aggregation below | `expenses` by date |
| Task summary and my tasks | The task aggregation (the same one `GET /api/tasks` uses for `summary` and `mine`) | `tasks` by status |
| Pending invites | `memberInvites.countDocuments({ weddingId, acceptedAt: null, expiresAt: { $gt: now } })`, Admins only | `memberInvites` |

### RSVP counts and headcount per event

```ts
rsvps.aggregate([
  { $match: { weddingId } },
  { $group: {
      _id: "$eventId",
      attending: { $sum: { $cond: ["$attending", 1, 0] } },
      declined:  { $sum: { $cond: ["$attending", 0, 1] } },
      headcount: { $sum: "$headcount" },
  } },
]);
```

**Invited** per event comes from `guests.countDocuments({ weddingId, eventIds: eventId })`. **Not replied** is invited minus attending minus declined. Headcount is the number used for catering.

### Total spent

```ts
expenses.aggregate([
  { $match: { weddingId } },
  { $group: { _id: null, totalPaise: { $sum: "$amountPaise" } } },
]);
```

The Money module's summary uses the same pipeline with `_id` set to `"$category"`, `"$eventId"` or `"$paidBy"` for the three breakdowns.

### Task summary

```ts
tasks.aggregate([
  { $match: { weddingId } },
  { $group: {
      _id: null,
      total:   { $sum: 1 },
      done:    { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
      overdue: { $sum: { $cond: [{ $and: [
        { $eq: ["$status", "todo"] }, { $lt: ["$dueDate", today] },
      ] }, 1, 0] } },
  } },
]);
```

**Pending** is total minus done. **My tasks** is `tasks.find({ weddingId, assigneeId: userId, status: "todo" }).sort({ dueDate: 1 })`.

### Guest's invitation page

1. `guests.findOne({ inviteTokenHash: sha256(token) })` finds the guest and their `weddingId`.
2. `events.find({ _id: { $in: guest.eventIds } }).sort({ date: 1, time: 1 })` loads only their events.
3. `rsvps.find({ guestId: guest._id })` loads their current answers.
4. On the first visit, `inviteOpenedAt` is set.

### Public gallery

`photos.find({ weddingId, hidden: false, eventId })` sorted by `createdAt` newest first, 40 at a time. The next page uses the last photo's `createdAt` and `_id` as a cursor, which stays fast however many photos there are. Each photo gets a signed thumbnail URL before the response goes out.

### Totals per vendor

```ts
expenses.aggregate([
  { $match: { weddingId, vendorId: { $ne: null } } },
  { $group: { _id: "$vendorId", paidPaise: { $sum: "$amountPaise" } } },
]);
```

The vendor list joins these totals in code, by `vendorId`.

## Data lifecycle and integrity

MongoDB doesn't enforce references between collections, so the app keeps them consistent itself. These rules say what happens to related data when something is deleted or changed.

### What a delete affects

| When this is deleted | The app also |
| --- | --- |
| A wedding | Deletes every document with its `weddingId` in all 12 wedding collections, deletes every R2 object under `weddings/<weddingId>/`, and sets its members' memberships to `removed`. Entries it published to `sharedVendors` stay, since other weddings may use them |
| An event | Removes it from every `guests.eventIds` and `vendors.eventIds`, deletes its `rsvps`, clears `eventId` on its expenses, gifts and tasks, and deletes its QR code. Its photos keep their place, with `eventId` cleared |
| A guest | Deletes their `rsvps`, and clears `guestId` on their gifts. The gift's `giverName` stays |
| A vendor | Clears `vendorId` on its expenses. The expenses themselves stay, since the money was spent |
| A photo | Deletes the full image and thumbnail from R2, and lowers `weddings.storageUsedBytes` |
| A receipt, or an expense with one | Deletes the file from R2, and lowers `weddings.storageUsedBytes` |
| A member (set to `removed`) | Leaves their tasks assigned to them, so the task list shows a removed member who needs reassigning. Records they created keep `createdBy` |

Deleting an event shows a confirmation with what it touches, such as "Removes 120 RSVPs and 1 QR code".

### Transactions

Atlas clusters, the free one included, support multi-document transactions. The app uses them where two writes must succeed or fail together:

- **Accepting a member invite:** create or find the user, create the membership, and mark the invite accepted.
- **Changing or removing an Admin:** count active Admins and update the membership in one transaction, so two Admins demoting each other at once can't leave the wedding with none.
- **Deleting an event:** all the clean-up writes above.
- **Deleting a wedding:** all database deletes in one transaction. The R2 files are deleted after it commits. If that step fails, the leftover keys are logged for a retry, since files with no record are harmless.

Everything else is a single write and needs no transaction.

### Keeping counters correct

`weddings.storageUsedBytes` is updated with `$inc` in the same step as each photo or receipt is added or removed. A script, `npm run db:recount-storage`, recalculates it from `photos` and `expenses` in case it ever drifts.

### Common mistakes to avoid

- **Aggregations don't convert IDs.** Mongoose turns string IDs into ObjectIds in `find`, but not in `aggregate`. Pass `new Types.ObjectId(weddingId)` in every `$match`.
- **Never return internal fields.** `passwordHash`, `tokenHash`, `inviteTokenEnc` and `tokenEnc` are set to `select: false` in the schema, so they only load when a query asks for them by name.
- **Use `lean()` for reads.** List pages read plain objects with `.lean()`, which is faster and uses less memory than full Mongoose documents.

### Environments and changes to the schema

- **Development and production use separate databases**, `mmm_dev` and `mmm_prod`, with separate database users. The development user can't reach production.
- **Seed data:** `npm run db:seed` fills the development database with one sample wedding, 5 events, 60 guests, RSVPs, expenses, gifts, vendors, tasks and sample photos.
- **Schema changes:** a new optional field needs nothing, because old documents simply don't have it. A change that renames, removes or reshapes a field gets a script in `scripts/migrations/`, numbered and dated, run once against production after a backup.
- **Backups:** a weekly `mongodump` of production, kept for 4 weeks. Restore it into `mmm_dev` once a month to check it works.
