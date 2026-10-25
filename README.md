# Make My Marriage

A web app for Indian couples and their families to plan the whole wedding in one place.
See `docs/` for the product, system, database and API design.

## Local development

Requires Node.js 24.

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (development database `mmm_dev`, bucket `mmm-dev`).
3. `npm run dev` and open http://localhost:3000

| Script               | Does                                                 |
| -------------------- | ---------------------------------------------------- |
| `npm run dev`        | Development server                                   |
| `npm run build`      | Production build                                     |
| `npm run lint`       | ESLint                                               |
| `npm run format`     | Prettier                                             |
| `npm run typecheck`  | TypeScript, no output                                |
| `npm test`           | Vitest, with an in-memory MongoDB replica set        |
| `npm run db:indexes` | Create all indexes in the database from `.env.local` |
| `npm run db:seed`    | Fill `mmm_dev` with sample data                      |
