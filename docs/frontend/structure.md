# Frontend Structure

## Structure

```text
frontend/
├── app/(workspace)/       Routes inside the existing App Shell
├── components/
│   ├── layout/           Shell, header, sidebar and navigation
│   ├── shared/           Reusable UI
│   └── <domain>/         Domain UI, e.g. projects or backlog
├── config/navigation.ts  Project navigation and link helpers
└── lib/                  Preview data and future API helpers
```

Project sections have separate routes under `app/(workspace)/projects/[projectId]/`: `members`, `backlog`, `sprints`, `board` and `progress`.

## Add a page

1. Create or edit the domain's `page.tsx` inside `app/(workspace)`. Keep route parameters, data loading and page composition there.
2. Use the existing shell and `PageHeader`; do not recreate the sidebar, header, main landmark or page container. Reuse `EmptyState`, `DropdownMenu` and existing button styles where applicable.
3. Put domain components in `components/<domain>`. Move components to `shared` only when reuse is established. Keep pages server-rendered; add client components only where browser state or events are needed.
4. Colocate new feature styles in `*.module.css`; use existing theme variables and typography. Do not add feature CSS to `globals.css` or migrate old CSS in unrelated work.
5. Integrate using the [API contracts](../api/README.md); keep request logic outside presentational components. Use `config/navigation.ts` and `projectHref` for project navigation and preserve existing URLs and invalid-project handling.

Current pages and the shell still use `lib/preview-*` fixtures, not real APIs or authorization. Enforce permissions on the server.

## Shared changes

Request review for changes to the shell, shared components, global CSS, navigation or theme behavior. Coordinate overlapping edits first. Do not add dependencies or change architecture without team agreement.

Follow [CONTRIBUTING.md](../../CONTRIBUTING.md) for branches, ownership and pull requests.

## Checks

Run from the repository root:

```sh
npm --prefix frontend run lint
npm --prefix frontend run fmt:check
npm --prefix frontend run build
```

Before requesting review:

- [ ] Check desktop/mobile layouts and light/dark themes.
- [ ] Verify applicable loading, empty, error and saving states.
- [ ] Test API-integrated flows end to end; identify mocks and placeholders.
- [ ] Report check results, checks not run and shared-file changes; include screenshots where helpful.
