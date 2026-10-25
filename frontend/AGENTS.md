<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project frontend rules

- Read [Frontend Structure](../docs/frontend/structure.md) before changing frontend code.
- Keep workspace pages inside the existing workspace layout; do not duplicate the App Shell, sidebar, header or page container.
- Keep route files focused on page composition. Put domain UI in `components/<domain>` and genuinely reusable UI in `components/shared`.
- Reuse `PageHeader`, `EmptyState`, `DropdownMenu`, theme variables and existing button styles before creating alternatives.
- Use colocated CSS Modules for new feature styles. Do not add feature-specific selectors to `app/globals.css` or rewrite existing CSS as part of unrelated work.
- Keep preview data in `lib/preview-*`; it is temporary and is not authentication, authorization or an API contract.
- Changes to the App Shell, navigation, global styles or shared components require focused review by the frontend maintainer. Do not introduce new dependencies without team agreement.
- Run frontend lint, format checks and build before handoff. Report checks that could not run; do not claim mock screens are API-integrated.
