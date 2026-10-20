# App Shell

Shared Next.js layout adapted from CinePrime's admin layout: desktop sidebar, sticky header (a presentation-only Search field on the left that collapses to a magnifier button on narrow screens, then theme, notifications and account menu; no breadcrumb), mobile drawer, and persistent Light/Dark appearance.

The sidebar retains CinePrime's 280px width, 60px logo row, unboxed brand mark and blue active treatment. It is global: up to five Active project shortcuts under Projects, followed by a Jira-style “More projects” item. That item opens the project switcher (search, all projects with the current one checked, “View all projects”) as a flyout to the right of the sidebar; in the mobile drawer it drops down below the item. `AppBrand` shares the 32px symbol and 14px two-line wordmark, with compact mobile branding. Inter is bundled through `next/font` with Latin and Vietnamese subsets.

All Projects (`/projects`) keeps the global sidebar and has Active/Archived filters (with counts), name/key search, and a compact responsive table: Project, Key, Project Owner (“You” when it is the viewer), Your role (Scrum accountability) and a row action menu. The range line (“Showing 11–20 of 23”) appears only with pagination. The row menu follows the Use Case specification rather than Jira: Open project (UC-06.2) and View members (UC-07.1) for every project; for an Active project, the Project Owner also sees Project settings (UC-06.3), Transfer ownership (UC-06.5) and Archive project (UC-06.4), and other members see Leave project (UC-07.4), hidden for the current Project Owner, who must transfer ownership first. Archived projects offer only the two navigation items. There is no delete or restore, because neither is specified for Iteration 1. Items without a screen yet are shown muted (`aria-disabled`) and do nothing. The header profile button is the viewer's initials avatar; its menu shows the name and email, then Profile (UC-05.1/05.2), Account settings (UC-05.3) and Log out (UC-03), all muted until those screens and a session exist. Both menus use the shared `DropdownMenu` (Popover API, arrow-key navigation; a mouse click opens without a focus ring, the keyboard focuses the first item). “View all projects” in the More projects switcher opens this directory. Within a project, Overview, Members, Product Backlog, Sprints, Sprint Board and Sprint Progress are horizontal navigation links; the active project remains selected in the sidebar. Notifications is a mock-data dropdown only, with temporary read state; there is no `/notifications` route. Profile remains deferred. The rounded Interlock SVG is shared by the brand mark and favicon.

## Run

The app root and the brand logo open All Projects (`/projects`); there is no `/workspace` route and no remembered last project. Authentication and authorization are not implemented by this shell; the real authenticated API must supply and validate accessible projects later. Create project is disabled; no form, modal or API is included.

In `frontend`, run `npm ci` then `npm run dev`. Open `/` (redirects to `/projects`) for the directory.

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

All Projects and Project Overview use Atlas Platform and Commerce Platform as sample project names. Existing fixture IDs remain stable. Project pages retain their current content. Fixture users and roles are presentation data, not authentication or backend actor identity. Menu visibility is not authorization. Directory filtering/pagination remains local to fixtures; replace it with server querying when connecting the API.

Main content uses the available width with 32px desktop, 24px tablet and 16px mobile horizontal padding. Subtle page-entry, account-dropdown and appearance transitions respect `prefers-reduced-motion`. The shared PageHeader adapts CinePrime's AdminPageHeader: blue 11px eyebrow, 25px title, optional 13px description and right-aligned actions.

Reused the admin layout approach and blue theme concept; replaced React Router with Next.js navigation. Cinema APIs, authentication contexts and command palette were not copied. CinePrime source files remain unchanged.
