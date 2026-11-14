# Deployment

How to put Make My Marriage on Vercel. The design behind it (services, free-tier limits, backups) is in [system-design.md](system-design.md#infrastructure-and-operations); this file is the checklist. Nothing here is done by the code or by Claude: you run each step.

## Before you start

- **MongoDB Atlas:** a production database user and a database named `mmm_prod` (a separate database from `mmm_dev`, ideally its own user). Under **Network Access**, allow `0.0.0.0/0`: Vercel has no fixed IP addresses, so the database user's password is the protection.
- **Email:** a Resend account with the domain `makemymarriage.cyou` verified (see [Sending email from our own domain](#sending-email-from-our-own-domain)). The old Gmail sending account still works as a fallback until it is removed.
- **Git:** Vercel deploys the project's **Production Branch**, which is `main` by default. This repo has only `dev` so far, so either create `main` or set the Production Branch to `dev` under Project Settings > Git.
- **Node:** set Project Settings > Node.js Version to 24.x (`package.json` asks for 24 or newer).
- The region (`bom1`, Mumbai) comes from `vercel.json`; nothing to set.

## Variables

Set each one in Vercel under Project Settings > Environment Variables, for the **Production** scope only. Do not give Preview deployments the production values: they would write to the production database. Formats and how to generate each one are in `.env.example`.

| Variable | Needed for | When it is checked |
| --- | --- | --- |
| `APP_URL` | Everything | **At build time** (the build fails without it) and on every write (Origin check) |
| `MONGODB_URI` | Everything | First database use. Point it at `mmm_prod` |
| `JWT_SECRET` | Login sessions | First login. Without it nobody can log in, and logged-in pages quietly act as logged out |
| `TOKEN_ENCRYPTION_KEY` | Guest invitation and QR tokens | First use (Phase 3 onwards) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS` | Every email: invitations, reminders, member invites, password reset | First email sent. Only that feature fails, with a clear log line naming the missing variable (never its value) |
| `EMAIL_FROM_NAME` | Optional | Defaults to `Make My Marriage` |
| `EMAIL_DAILY_CAP` | Optional | One stop for every email the app sends. Recommended `90` with Resend's free plan; defaults to `90` with the SMTP settings and `450` with Gmail. Must stay below the provider's own daily limit |
| `EMAIL_REPLY_TO`, `EMAIL_SENDS_PER_SECOND` | Optional | Reply-To address; sends per second (default `2`) |
| `EMAIL_DEV_REDIRECT` | Do not set | Development and tests only. Ignored in production (a warning is logged), so a leftover value cannot redirect guests' email |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | **Deprecated** fallback | Used only when `SMTP_HOST` is not set. When both are set, the SMTP settings win. Remove once Resend works |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Photo and receipt uploads | Not used yet (Phase 8). Leave unset |

`NODE_ENV` is set to `production` by Vercel. `NEXT_DIST_DIR` is for local testing only: never set it in Vercel.

Generate fresh secrets for production; do not copy the development ones. Keep `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` in a password manager: losing `TOKEN_ENCRYPTION_KEY` breaks every guest link.

## Sending email from our own domain

Production sends through Resend over SMTP, from `invitations@makemymarriage.cyou`. Do this once, before the first real invitation:

1. **Add the domain in Resend:** Domains > Add Domain > `makemymarriage.cyou`. Pick the region closest to your guests (for India, a Singapore or Mumbai region if offered).
2. **Add the DNS records Resend shows**, exactly as it displays them, at the place your domain's DNS is managed:
   - **SPF:** a `TXT` record (Resend shows the name and value).
   - **DKIM:** a `TXT` record (a long key, named like `resend._domainkey`).
   - **MX:** the `MX` record Resend lists for bounces and complaints (on its `send` sub-domain), with the priority it shows.

   Copy each name and value without retyping, and do not add a second SPF record on the same name (merge into one if one exists).
3. **Add a DMARC record:** a `TXT` record named `_dmarc` with the value `v=DMARC1; p=none;`. This only asks mail providers to send reports; it blocks nothing yet.
4. **Verify:** click Verify in Resend. DNS can take a few minutes, sometimes hours. Wait for every record to show Verified.
5. **Create an API key:** API Keys > Create > permission **Sending access**, limited to the domain `makemymarriage.cyou`. Copy it once; it is shown only at creation. This is `SMTP_PASSWORD`.
6. **Use separate keys for production and for local.** Create one key for Vercel Production and a different one for your own `.env.local`, so a leaked or deleted local key never breaks production. Never paste a key into the repo, a screenshot or a chat.
7. **Set the variables** in Vercel Production (table above): `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend` (the literal word), `SMTP_PASSWORD=<the key>`, `EMAIL_FROM_ADDRESS=invitations@makemymarriage.cyou`, `EMAIL_FROM_NAME`, and `EMAIL_DAILY_CAP=90`. Redeploy.
8. **Test after the change:** from the production app, send a test invitation (`POST /api/invitations/test`, until the Invitations page has a button for it) and a password reset to each of a **Gmail**, an **Outlook** and a **Yahoo** address. For each, check whether it landed in the inbox or in spam, then open the message's raw source (Gmail: **Show original**; Outlook: **View message source**; Yahoo: **View raw message**) and confirm `SPF: PASS`, `DKIM: PASS` and `DMARC: PASS`. If one is not a pass, fix the DNS record before sending real invitations.

**Limits to keep in mind.** Resend's free plan allows about 100 emails a day and about 3,000 a month, plus a low requests-per-second limit. `EMAIL_DAILY_CAP` counts every email the app sends (invitations, reminders, member invites and password resets) across all weddings, so keep it below the provider's daily limit (Gmail is about 500 a day, Resend free is 100). The app does **not** count the month: watch the monthly total in Resend yourself. A batch of invitations sends at most 2 emails a second. If the provider answers that it is busy or rate limited, the send waits (a minute unless the provider says otherwise), does not mark anyone failed, and carries on from the same guest afterwards.

Emails are transactional only: invitations, reminders, member invites and password resets, each the direct result of someone's action. There is no marketing content and no unsubscribe machinery.

**No-reply by design.** Nobody reads the From address (`EMAIL_REPLY_TO` stays unset), and every email says "This is an automatic email, so replies are not read." Guests use the invitation page; members use the app.

**Also check in Resend, once:**

- **Tracking stays off.** Open and click tracking are not enabled for the domain (confirmed). Keep it that way: click tracking would send every guest's personal link through a third-party address, and open tracking is a tracking pixel; the app promises neither.
- **`APP_URL` must be the public https address** (for example `https://makemymarriage.cyou`). In production the first email refuses to send with a clear message otherwise, because every link in every email is built from it.
- **For local work**, emails go to their real recipients unless you set `EMAIL_DEV_REDIRECT=<your own address>` in `.env.local` (then every email goes to you). Setting it is optional; it is ignored in production.

**When something is wrong, the app says so.** A refused login, an unverified domain or a key that may not send stops a send **without failing any guest** (the page says the email settings need fixing; the logs name only a short code, never the key or an address). The provider's own daily or monthly allowance pauses the send like our cap does. A member invite or a test email that cannot be sent answers a plain "can't send email right now, try again in a few minutes" (503), or says the address was refused (400).

## First deploy

1. In Vercel, import the GitHub repo. Framework is detected as Next.js.
2. Choose the project name first: the default address is `https://<project-name>.vercel.app`. Set `APP_URL` to the exact address people will use (the custom domain, if you have one), with `https://` and no trailing slash.
3. Add the other variables (above).
4. **Create the indexes before any real traffic.** The app does not build indexes in production, and the unique ones (such as one account per email) must exist before the first signup. From your computer, with the production string only in this one command:
   - PowerShell: `$env:MONGODB_URI = "mongodb+srv://…/mmm_prod"; npm run db:indexes; Remove-Item Env:MONGODB_URI`
   - Bash: `MONGODB_URI="mongodb+srv://…/mmm_prod" npm run db:indexes`

   The first line printed is `Database: …`. Check that it says `mmm_prod`. The script only adds missing indexes and never removes any, so it is safe to run again. Run it again after any deploy that adds a model or an index.
5. Deploy. Then open the deployment's address and run the smoke test.

`npm run db:seed` refuses to run when `NODE_ENV=production` or against any database whose name does not end in `_dev`. Never seed production.

## Smoke test

After the first deploy, and after any later one that touches auth or the database:

1. `https://<APP_URL>/api/health` answers `{"ok":true,"db":"up"}`. A `503` with `"db":"down"` means `MONGODB_URI` or Atlas Network Access is wrong; the reason is in Vercel's logs.
2. The landing page loads. Response headers include `Content-Security-Policy` and `X-Frame-Options: DENY`.
3. Sign up with a throwaway address. In the browser's developer tools (Application > Cookies) `mmm_session` is `HttpOnly`, `Secure` and `SameSite=Lax`.
4. Create a wedding (onboarding), add an event and a task, and open the dashboard.
5. Log out, then use **Forgot password**: the email arrives and its link starts with `APP_URL`.
6. Invite a second address (a plus-address of a mailbox you own works) and accept the invite in a private window.
7. `curl -I https://<APP_URL>/w/anything` shows `X-Robots-Tag: noindex, nofollow` (same for `/i/…` and `/u/…`).
8. A write from another origin is refused: `curl -i -X POST https://<APP_URL>/api/auth/login -H "Origin: https://example.com" -H "content-type: application/json" -d "{}"` answers `403 FORBIDDEN_ORIGIN`.
9. In Atlas, `mmm_prod` shows the collections, each with its indexes.
10. Clean up: delete the test wedding from **Settings**. The test accounts stay in the database until removed in Atlas.

## Rolling back

- **Bad deploy:** Vercel > Deployments, open the last good production deployment, then **Instant Rollback** (or **Promote to Production**). Or `git revert` the bad commit and push.
- A rollback restores that deployment's code and the variable values it was built with. Changing a variable in Vercel only takes effect on the next deploy, so redeploy after changing one. A wrong `APP_URL` needs a redeploy, not only an edit.
- Indexes only ever get added, so old code runs fine against a database that has newer indexes. Data written by the newer code stays; there is no automatic undo for it. Before any deploy that changes stored data, take a `mongodump` of `mmm_prod` (the free Atlas cluster has no automatic backups; dump weekly as well).
- Do not "roll back" by rotating `JWT_SECRET` (logs everyone out) or `TOKEN_ENCRYPTION_KEY` (breaks every guest link).

## Known limits to remember

- Preview deployments get a different address from `APP_URL`, so every write on a preview answers `403 FORBIDDEN_ORIGIN`. Use previews for looking at pages only.
- One email account (Resend, or the Gmail fallback) serves every wedding, with one shared daily cap (see CLAUDE.md, Known limitations).
