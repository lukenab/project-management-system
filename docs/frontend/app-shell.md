# App Shell

Shared Next.js layout adapted from CinePrime's admin layout: desktop sidebar, sticky header, mobile drawer, and persistent Light/Dark appearance.

The sidebar retains CinePrime's 280px width, 60px logo row, unboxed brand mark and blue active treatment. It is global: Workspace entry, Project Switcher, and up to five Active project shortcuts. `AppBrand` shares the 32px symbol and 14px two-line wordmark, with compact mobile branding. Inter is bundled through `next/font` with Latin and Vietnamese subsets.

All Projects (`/projects`) keeps the global sidebar and has Active/Archived filters, name/key search, and a compact responsive table. “View all projects” in the switcher opens this directory. Within a project, Overview, Members, Product Backlog, Sprints, Sprint Board and Sprint Progress are horizontal navigation links; the active project remains selected in the sidebar. Notifications is a mock-data dropdown only, with temporary read state; there is no `/notifications` route. Profile remains deferred. The rounded Interlock SVG is shared by the brand mark and favicon.

## Run

The app root redirects to `/workspace`. This client entry opens the most recently visited Active project in the supplied project list, or the first Active project if the saved preference is unavailable, stale or Archived. With no Active project it opens `/projects`, including its empty state. Only the project ID is remembered in a browser preference scoped to the fixture account. Storage failure does not block navigation. Opening a direct project/section URL is never redirected by this preference. Authentication and authorization are not implemented by this shell; the real authenticated API must supply and validate accessible projects later. Create project is disabled; no form, modal or API is included.

In `frontend`, run `npm ci` then `npm run dev`. Open `/` for workspace entry or `/projects` for the directory.

## Integration

| Location | Purpose |
|---|---|
| `app/(workspace)/layout.tsx` | Wrap workspace screens in the shared shell |
| `components/layout/` | Header, sidebar, responsive shell and theme |
| `config/navigation.ts` | Global and project navigation |
| `lib/preview-data.ts` | Centralized UI fixtures, to replace with API data |
| `app/globals.css` | Shared theme tokens and layout styles |
| `components/shared/` | Reusable page heading and empty state |

Add pages inside `(workspace)` to reuse the shell. Project routes use `/projects/[projectId]/...`. Replace the corresponding entry in `[section]/page.tsx` with a dedicated route when implementing a feature.

All Projects and Project Overview use Atlas Platform and Commerce Platform as sample project names. Existing fixture IDs remain stable. Project pages retain their current content. Fixture users and roles are presentation data, not authentication or backend actor identity. Menu visibility and the remembered project are not authorization. Directory filtering/pagination remains local to fixtures; replace it with server querying when connecting the API.

Main content uses the available width with 32px desktop, 24px tablet and 16px mobile horizontal padding. Subtle page-entry, account-dropdown and appearance transitions respect `prefers-reduced-motion`. The shared PageHeader adapts CinePrime's AdminPageHeader: blue 11px eyebrow, 25px title, optional 13px description and right-aligned actions.

Reused the admin layout approach and blue theme concept; replaced React Router with Next.js navigation. Cinema APIs, authentication contexts and command palette were not copied. CinePrime source files remain unchanged.
