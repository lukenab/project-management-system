# Frontend Structure

```
frontend/
├── app/                      Next.js App Router
│   ├── layout.tsx            Root HTML, font and metadata
│   ├── page.tsx              Redirects / to /projects
│   ├── not-found.tsx         404 page
│   ├── globals.css           Theme tokens and shared styles
│   ├── icon.svg              Favicon
│   └── (workspace)/          Screens rendered inside the app shell
│       ├── layout.tsx
│       └── projects/
│           ├── page.tsx                  /projects
│           └── [projectId]/
│               ├── page.tsx              /projects/:id (Overview)
│               └── [section]/page.tsx    Members, Backlog, Sprints, Board, Progress (placeholders)
├── components/
│   ├── layout/               App shell: header, sidebar, navigation, menus, theme
│   ├── projects/             All Projects table and row actions
│   ├── shared/               Reusable UI (PageHeader, EmptyState, DropdownMenu)
│   └── icons/                Custom icons
├── config/navigation.ts      Project navigation items
└── lib/                      Preview (mock) data, to be replaced by API calls
```

## Conventions

- Add new screens inside `app/(workspace)` so they use the app shell.
- Give a section its own route folder when implementing it, and remove it from `[section]/page.tsx`.
- Preview data lives only in `lib/`; it is not authentication or authorization.
