# Make My Marriage — Product Requirements Document (v1)

Oct 14, 2026 · @Leela Manikanta Cheekatla

## Overview

Make My Marriage is a web application that lets a bride and groom plan and run their whole Indian wedding in one place: events, guests, invitations, money, vendors, a wedding website, live streaming and shared photos.

**Problem.** Indian weddings run over several events and days, with hundreds of guests, two families and many vendors. Most families manage this through WhatsApp groups, notebooks and spreadsheets. Information is scattered, money is hard to track, and guests are hard to reach.

**Product type.** A free learning project, built solo with Next.js and MongoDB. It supports many couples, each with their own private wedding. The first real use will be the builder's own family wedding.

### Goals for version 1

- One dashboard where the couple sees the wedding at a glance: countdown, events, RSVP counts, total spent and task progress.
- Plan every event (haldi, mehendi, sangeet, muhurtham, reception and others) with its own details and guest list.
- Send email invitations in English and collect RSVPs without guests logging in.
- Record every expense and gift received, visible to Admins and Managers only.
- Find vendors via Google Maps and a shared community directory, at zero cost.
- Publish a wedding website with the bride's and groom's names, cover photo, events with maps, and an optional live stream and gallery.
- Let guests and photographers upload photos by scanning a QR code.

### Non-goals for version 1

- No payments, subscriptions or fees.
- No bride's side or groom's side split. One combined guest list and one set of events.
- No budgets. Expenses are a log of what was spent, not a plan.
- No WhatsApp or SMS messages.
- No guest travel, accommodation or pickup management, in any version.
- No in-app streaming. Only YouTube Live links.
- No mobile app. It comes after the web app is complete.

## Users and roles

Each wedding workspace has two logged-in roles, Admin and Manager. Guests and photographers never log in.

| Role | Who it is | Logs in? | What they can do |
| --- | --- | --- | --- |
| Admin | The person who creates the workspace, plus anyone they make Admin, such as the bride and the groom | Yes | Everything in every module, plus adding and removing members and changing roles. |
| Manager | Family members and helpers added by an Admin | Yes | Everything in every module, including Money, except member management. |
| Guest | Invited guests and photographers | No | View their invitation and invited events, RSVP with number attending, view the wedding website and gallery, upload photos by QR code. |

Bride and groom are not roles. Their names are details of the wedding, entered by an Admin.

### Creating a workspace

1. A person signs up with name, email and password.
2. They create a wedding workspace and become its first Admin.
3. They enter the wedding details: wedding date, bride's name, groom's name and cover photo. Venues are set per event, not on the wedding.

### Adding members

1. An Admin enters the new member's name, email and role (Admin or Manager).
2. The app emails them an invite link.
3. They open the link, set a password and land in the workspace. Until then they show as **Invited**.
4. If the email already belongs to another workspace, the invite is blocked with a message. If it has an account with no workspace, the workspace is added to that account.

### Member rules

- A workspace can have several Admins.
- Only Admins can add members, remove members and change roles, including promoting a Manager to Admin.
- There must always be at least one Admin. The last Admin can't be removed or demoted.
- The person who created the workspace can't be removed.
- Managers have full access to all modules in version 1. Per-module permissions are planned for a later version.
- A person can belong to only one workspace at a time. After a wedding, they can leave the workspace, or an Admin can delete it, and their account is then free to join or create another.

## Feature requirements

Version 1 has ten modules. Each is listed with what it must do.

### 1. Wedding dashboard

- Shows the bride's and groom's names, wedding date and a countdown in days.
- Lists upcoming events in date order, with venue and time.
- Shows RSVP counts: total invited, attending, declined and not replied, for the whole wedding and per event.
- Shows **total spent so far**, from the expense log, with a link to Money.
- Shows a **task summary**: total, completed, pending and overdue, plus "My tasks" for the logged-in member.
- Shows Admins any members who haven't accepted their invite yet.

### 2. Events

- Create, edit and delete events.
- Event type is a dropdown with these defaults: Engagement, Haldi, Mehendi, Sangeet, Pellikuthuru / Pellikoduku, Wedding (Muhurtham), Reception, Vratham / Pooja.
- The dropdown has a **+ Add new type** option. A custom type stays in that workspace's dropdown for future events.
- Each event has: name, type, date, time, venue name, address, Google Maps link, dress code, notes and an optional YouTube Live link.
- Each event has its own guest list, picked from the wedding's guest list.
- Events show in date and time order everywhere.

### 3. Guests, invitations and RSVP

**Guest list**

- Add guests one by one with: name, phone, email, relation and household or family group.
- Import guests from CSV or Excel using a downloadable template with the same columns. Show errors per row, such as a missing name or a bad email, before saving.
- Assign each guest to one or more events.
- Search and filter by event, RSVP status and household.

**Invitations**

- Send email invitations with one click, either for one event or for all events a guest is invited to.
- Invitation templates are in English only in version 1.
- Each invitation includes the couple's names, event details, a map link, the wedding website link and the guest's personal invitation link.
- Track per guest: invitation sent, opened (where email allows) and RSVP status.

**RSVP**

- Each guest gets a personal, hard-to-guess invitation link. No login needed. It opens a page with their invitation, the events they're invited to and the RSVP form.
- For each event they're invited to, the guest answers attending or not, and the number of people coming.
- Guests can change their answer until a cut-off date the couple sets.
- Send reminder emails to everyone who hasn't replied, with one click.
- Headcount per event comes from RSVPs and is used for catering. Food is veg only, so there's no food preference question.

### 4. Money

The Money module holds expenses and gifts. Admins and Managers can open it. Guests never see it.

**Expense log**

- Record each expense with: amount (₹), date, category (such as decoration, catering, clothing, jewellery), event, vendor (optional, from My vendors), paid by (person's name), payment mode (cash, UPI, card, bank transfer), note and receipt photo.
- No budgets. The module is a log of what was spent.
- Summary of total spent, by category, by event and by who paid.
- Export the log to Excel.

**Gifts and cash received**

- Record each gift with: giver's name (or a guest picked from the list), cash amount or item description, event and note.
- Track return gifts: what was given back and whether it's done.
- Summary of total cash received and gift count.
- Export to Excel.

### 5. Vendors

Vendors are found in two ways at no cost. No Google Cloud account or API is used.

**Find vendors**

- The user picks a category (photography, videography, decoration, catering, bridal makeup, mehendi artist, venue, tent house, priest (pandit), music and DJ, and others; the full list is in the Database Design) and a city.
- A **Search on Google Maps** button opens a Google Maps search for that category and city in a new tab.
- A **Browse shared vendors** tab shows the community directory, filtered by category and city.

**My vendors**

- Add a vendor with: name, category, city, contact person, phone, email, Google Maps link, website or Instagram link, and notes.
- When adding, the user can tick **Share with other couples**. This publishes only the business details (name, category, city, phone, links) to the community directory. Quotes, notes and payments are never shared.
- Adding from the shared directory copies its details into the wedding's own vendor list.
- Each vendor has a status: shortlisted, contacted, booked or rejected.
- Record the quote received, such as "₹80,000 for 2 events". Payments to a vendor are recorded as expenses in Money, linked to that vendor.
- A vendor detail page shows all fields, with **View on Google Maps** and **Visit website** buttons that open in a new tab.
- Link a booked vendor to the events they serve.

### 6. Wedding website

- Each wedding gets a website at an address built from the bride's and groom's names, such as `make-my-marriage.vercel.app/w/priya-weds-ravi`. Admins can adjust the address.
- Shows the bride's and groom's names, the cover photo and the wedding date.
- Lists every event with its name, date, time, venue, dress code and map.
- If a YouTube Live link is set for an event, the live stream shows under that event.
- If gallery sharing is enabled, the photo gallery shows.
- No RSVP, guest list, headcounts, contact details or money information. RSVP happens only through each guest's personal invitation link.
- Anyone with the link can view it. It's hidden from search engines, and Admins can unpublish it.
- 3 to 4 themes to choose from, with traditional and modern styles.

### 7. Live streaming

- An Admin or Manager pastes a YouTube Live link per event.
- The stream is embedded on the wedding website under that event.
- A **Live now** badge shows during the event's scheduled time.
- After the event, the same link plays the recording, if the couple keeps it on YouTube.

### 8. Photo sharing

- The app generates a QR code per event, plus one for the whole wedding, as a printable PNG or PDF.
- Scanning opens an upload page. No login needed. The uploader can enter their name, which is optional.
- Multiple photos per upload. Limits: images only, up to 15 MB each before compression in the browser, and 50 per upload.
- Photos are compressed and stored with the event and upload time.
- If gallery sharing is enabled, the gallery shows on the wedding website, filterable by event.
- Admins and Managers can hide or delete any photo.
- Admins and Managers can turn uploads on or off per QR code, for example to close uploads after the wedding.
- Admins and Managers can download all photos as a zip.

### 9. Tasks

- Admins and Managers create tasks with: title, assignee (any member), due date, linked event (optional) and note.
- Status is **To do** or **Done**. The assignee or any Admin can mark a task done.
- A task list page with filters: all tasks, my tasks, by event, by status and overdue.
- Overdue tasks, past their due date and not done, are highlighted.
- The dashboard shows the task summary.

### 10. Accounts and access

- Sign up and log in with name, email and password. Password reset by email.
- Create a workspace, invite members and manage roles as set out in Users and roles.
- A member list showing each person's role and status (invited or active).
- Members can leave their workspace, and Admins can delete it. The account stays and can join or create a new workspace.

## Technical approach

The app is one Next.js app in TypeScript with MongoDB Atlas, using free-tier services for email, photo storage and hosting. Full details are in the System Design document.

### Stack

| Layer | Choice | Purpose |
| --- | --- | --- |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, our own components | Logged-in app, public wedding website, RSVP and photo upload pages |
| Backend | Next.js route handlers on Node.js | REST API, permission checks, email sending |
| Database | MongoDB (Atlas free tier) with Mongoose | All wedding data |
| Auth | JWT with bcrypt-hashed passwords | Login, sessions, password reset |
| Photo storage | Cloudflare R2 | Store photos and receipts, compressed in the browser before upload |
| Email | Nodemailer with Gmail SMTP | Invitations, RSVP reminders, password reset |
| QR codes | `qrcode` npm package | Printable upload QR codes |
| Excel and CSV | `exceljs` and `papaparse` | Guest import, Money exports |
| Hosting | Vercel, one deploy for the whole app | Free hosting for a learning project |

### Main data entities

| Entity | Key fields |
| --- | --- |
| User | name, email, password hash |
| Wedding | bride's name, groom's name, wedding date, cover photo, website address, theme, gallery on or off |
| Membership | user, wedding, role (Admin or Manager), status (active, removed), invited by |
| MemberInvite | wedding, email, role, invite link, expiry. A pending invite, shown as **Invited**, until accepted |
| Event | wedding, name, type, date, time, venue, map link, dress code, notes, YouTube link |
| Guest | wedding, name, phone, email, relation, household, events invited to |
| RSVP | guest, event, attending, number of people, RSVP token, answered at |
| Invitation | guest, event(s), sent at, status |
| Vendor | wedding, business details, status, quote, notes, linked events, shared-directory link |
| SharedVendor | business details only, city, category, added by wedding |
| Task | wedding, title, assignee, due date, linked event, status, note |
| Expense | wedding, amount, date, category, event, vendor, paid by, mode, receipt |
| Gift | wedding, giver, cash amount or item, event, return gift, note |
| Photo | wedding, event, image URL, uploader name, hidden flag, uploaded at |

Membership is the core of security. Every logged-in API call checks that the user is an active member of that wedding. Member management calls also check that the user is an Admin.

### Non-functional requirements

- **Security.** All permission checks happen on the server, not only in the UI. RSVP links and QR upload links use long random tokens. Uploads are rate-limited to stop abuse.
- **Privacy.** Guest phone numbers and emails are used only for that wedding's invitations. Deleting a wedding deletes all its data. This follows the spirit of India's DPDP Act 2023.
- **Responsive design.** Every page works on a phone browser, since guests will RSVP and upload photos from phones.
- **Performance.** Pages load in under 3 seconds on a 4G connection. Gallery images load as thumbnails first.
- **Data safety.** Weekly database backup, for example through MongoDB Atlas export.
- **Cost.** Zero cost for normal family use, staying within free tiers.

## Build order

Build in nine phases. Each phase ends with something usable, so the project stays useful even if it stops early.

1. **Setup and accounts.** Project structure, database, sign-up and login, create workspace and wedding details, member invites and roles.
2. **Events, tasks and dashboard.** Event create and edit with the type dropdown, the task list, and the dashboard with countdown, upcoming events and task summary.
3. **Guests.** Manual entry, CSV and Excel import, households, assigning guests to events.
4. **Invitations and RSVP.** English email templates, one-click sending, RSVP links, reminders, headcounts.
5. **Money: expenses and gifts.** Expense log with receipts, gifts and return gifts, summaries, Excel export.
6. **Vendors.** My vendors, Google Maps search link, shared directory, quotes, linking expenses to vendors.
7. **Wedding website and live stream.** Public page, themes, sections, YouTube embed and Live now badge.
8. **Photo sharing.** QR codes, upload page, gallery, moderation, zip download.
9. **Testing and launch.** Permission tests, phone testing, deployment, then a pilot on the family wedding.

## Later versions

- Per-module permissions for Managers, such as hiding the Money module.
- WhatsApp and SMS invitations and reminders, and invitations in regional languages such as Telugu, Hindi and Tamil.
- Find My Photos, where guests upload a selfie to find photos of themselves.
- Vendor payment schedules with installments, due dates and payment reminders.
- Mobile app, after the web app is complete.
- Vendor logins, so vendors can list and update their own profiles.

Guest travel, accommodation and pickup management is out of scope in all versions.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Invitation emails land in spam | Guests miss invitations | Send from a verified address, keep templates simple, test with Gmail and Outlook first |
| Free email services cap daily sends | Large guest lists can't go out in one day | Gmail allows about 500 a day, so the app sends in batches and resumes the next day |
| One Gmail account is shared by every wedding | One large send can use up the 450-a-day cap for all couples | Accepted for v1. Future fix: a custom domain plus a transactional email service |
| Open photo uploads attract junk | Bad photos on the public gallery | Long random QR tokens, rate limits, moderation, uploads switchable off |
| Photos exceed free storage | Uploads stop working | Compress on upload, monitor usage, set per-wedding limits |
| Website is viewable by anyone with the link | Event venues and maps, including a home address, are visible to strangers | Hidden from search engines, website can be unpublished, Admins choose what each event's venue and map show |
| Ten modules is a lot for one builder | Project stalls | Phase order delivers usable value early |

## Open questions

- [ ] Decided: invitations send from a dedicated Gmail account.
- [ ] How long should photos be kept after the wedding before Admins are asked to download them?
- [ ] What is the default RSVP cut-off, for example 7 days before the first event?
