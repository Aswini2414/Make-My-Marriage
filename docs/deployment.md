# Deployment

How to put Make My Marriage on Vercel. The design behind it (services, free-tier limits, backups) is in [system-design.md](system-design.md#infrastructure-and-operations); this file is the checklist. Nothing here is done by the code or by Claude: you run each step.

## Before you start

- **MongoDB Atlas:** a production database user and a database named `mmm_prod` (a separate database from `mmm_dev`, ideally its own user). Under **Network Access**, allow `0.0.0.0/0`: Vercel has no fixed IP addresses, so the database user's password is the protection.
- **Gmail:** the dedicated sending account with 2-step verification and an App Password.
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
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Member invites, password reset | First email sent. Only that feature fails, with a clear log line |
| `EMAIL_DAILY_CAP` | Optional | Defaults to `450` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Photo and receipt uploads | Not used yet (Phase 8). Leave unset |

`NODE_ENV` is set to `production` by Vercel. `NEXT_DIST_DIR` is for local testing only: never set it in Vercel.

Generate fresh secrets for production; do not copy the development ones. Keep `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` in a password manager: losing `TOKEN_ENCRYPTION_KEY` breaks every guest link.

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
6. Invite a second address (a plus-address of the sending Gmail works) and accept the invite in a private window.
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
- One Gmail account serves every wedding, capped at 450 emails a day (see CLAUDE.md, Known limitations).
