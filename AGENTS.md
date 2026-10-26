# Make My Marriage — agent instructions

Project rules live in `CLAUDE.md`, and the design docs in `docs/` are the source of truth.

## Project status

- **Read `docs/project-status.md` at the start of every session.** It records what is built, what is next, and decisions made during the build.
- **After finishing a feature, phase step or phase, update `docs/project-status.md` in the same commit**: move the work to Done with its commit, update "At a glance" and "Next up", refresh "Last updated", and add any approved decisions or known issues.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
