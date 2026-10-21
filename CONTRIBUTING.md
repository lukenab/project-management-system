# Contribution Guidelines

Follow these guidelines when contributing to Project Management Website.

## Branching Strategy

Use `main` for stable releases and `develop` for integrating reviewed changes.

| Branch | Purpose |
|---|---|
| `main` | Stable releases |
| `develop` | Integration of reviewed changes |
| `feature/*` | New features and related changes |
| `fix/*` | Routine bug fixes |
| `hotfix/*` | Critical fixes for a released version |

Create working branches from `develop`, except hotfix branches, which start from `main`.

Use lowercase, hyphen-separated names:

```text
feature/create-project
fix/task-assignment
hotfix/prevent-data-loss
```

Include related documentation, tests, and refactoring in the branch for the relevant change. For standalone maintenance or documentation work, use a descriptively named `feature/*` branch.

Do not push directly to `main` or `develop`, force-push them, or delete them. There is no separate release branch.

### Branch Overview

```text
main        ●────────────────────────────────●
             \                              /
develop      ●─────●────────●────────●─────●
                    \      / \      /
feature/*            ●────●   \    /
fix/*                          ●──●
```

This diagram illustrates branch flow rather than exact commit history.

- Working branch → `develop`: **Squash and merge** through a pull request.
- `develop` → `main`: **Create a merge commit** through a release pull request.

## GitHub Workflow

### Work Tracking

Use Jira to manage the backlog, assignments, acceptance criteria, and work status. Use GitHub for source control, pull requests, code review, and automated checks.

Before coding, select a Jira work item, agree on its scope and acceptance criteria, and assign it to yourself. Use the [Jira work item template](docs/workflow/jira-work-item-template.md) for the description.

Organize feature work end to end, from backend to frontend, with one contributor responsible for delivery. Foundation tasks such as App Shell only need the relevant layers.

For planned work, include the Jira key in the pull request title and link the work item under `Related Work`. For example:

```text
feat: add app shell and navigation (PROJ-123)
```

For small, unplanned changes without a Jira work item, explain the omission under `Related Work`. Jira keys in branch names and individual commit messages remain optional; existing branches and commits do not need to be renamed or rewritten.

Update Jira as work progresses. Move work to Done only after approval from at least one other contributor, successful applicable checks, merge, and verification of its acceptance criteria. A linked or merged pull request alone does not mean the work is Done.

### Workflow Overview

```text
Select work in Jira
        ↓
Create a branch from develop
        ↓
Implement → Check locally → Push
        ↓
Open a pull request to develop
        ↓
Review + CI + Verification
        ↓
Squash merge → Update Jira
```

### Daily Development

1. Select the Jira work item, confirm its scope and acceptance criteria, and assign it to yourself.
2. Start from a clean working tree and create a branch from the latest remote `develop`:

   ```sh
   git fetch origin
   git switch -c feature/create-project origin/develop
   ```

3. Implement the change and run the relevant checks.
4. Stage the relevant files and commit:

   ```sh
   git add path/to/changed-file
   git commit -m "feat: add project creation"
   ```

5. Push the branch:

   ```sh
   git push -u origin feature/create-project
   ```

6. Open a pull request targeting `develop`, include its Jira reference, and select at least one other contributor under `Reviewers`.
7. Update Jira to reflect review, address feedback, complete verification, and obtain approval from at least one other contributor.
8. Use **Squash and merge**, delete the working branch, and confirm the acceptance criteria before moving the Jira work item to Done.

To incorporate changes from `develop` into your working branch:

```sh
git fetch origin
git switch feature/create-project
git merge origin/develop
# Resolve conflicts if needed and rerun the relevant checks.
git push
```

Do not rewrite a shared branch's history without coordinating with everyone using it.

## Pull Requests and Code Review

### Pull Request Requirements

- Keep each pull request focused on one related change.
- Use a clear title describing the result, including the Jira key for planned work.
- Explain what changed and why.
- Link the relevant Jira work item under `Related Work`, or explain why no work item applies. Keep acceptance criteria in Jira rather than duplicating them in the pull request.
- Describe how the change was verified, including any checks not run.
- Include screenshots for visible interface changes when helpful.

### Review and Merge

Before merging:

- Obtain at least one approval from someone other than the author.
- Resolve review conversations and conflicts.
- Ensure applicable automated checks pass.
- Verify the acceptance criteria.
- Request another review after substantial changes.

Authors should review their own changes before requesting review. Reviewers should focus on correctness, business rules, data integrity, error handling, and relevant tests.

Use the pull request's `Reviewers` selector to request review from at least one other contributor; assigning the pull request is not a substitute for requesting review.

Resolve conflicts on the working branch. Do not merge locally and push directly to `main` or `develop`.

### Checks and Verification

Run the relevant checks from the repository root:

```sh
npm --prefix backend run lint
npm --prefix backend run fmt:check
npm --prefix frontend run lint
npm --prefix frontend run fmt:check
```

For application changes, also run the affected package's build and relevant tests where available. For documentation changes, check accuracy, formatting, and links.

GitHub Actions runs the configured automated checks. These checks support review but do not replace verification of the expected behavior.

Never commit secrets, credentials, or private test data.

## Commit Messages

Use the format:

```text
type: short description
```

Write descriptions in English using an imperative verb.

| Type | Purpose |
|---|---|
| `feat` | New functionality |
| `fix` | Bug fixes |
| `docs` | Documentation |
| `test` | Tests |
| `refactor` | Code restructuring without behavior changes |
| `chore` | Maintenance and configuration |

Examples:

```text
feat: add project creation
fix: prevent duplicate task claims
docs: update setup instructions
```

Commit types describe changes; they do not require matching branch prefixes. Use the same format for squash commit titles.

## Releases and Hotfixes

### Releases

When changes are ready for release:

1. Verify the integrated changes on `develop`.
2. Open a pull request from `develop` to `main`.
3. Summarize the release and verification results.
4. Obtain approval and ensure applicable checks pass.
5. Use **Create a merge commit**.

Do not squash or rebase release pull requests. Keep both `main` and `develop`.

### Hotfixes

Use `hotfix/*` only for critical bugs affecting the released version. Use `fix/*` from `develop` for routine bugs.

```text
main        ●────────────────●───────────────
             \              / \
hotfix/*      ●─────────────●   \
                                \
develop     ─────────────────────●──────────
```

1. Record the bug in Jira.
2. Create a hotfix branch from `main`:

   ```sh
   git fetch origin
   git switch -c hotfix/prevent-data-loss origin/main
   ```

3. Apply and verify the fix.
4. Push the branch and open a pull request to `main`.
5. After approval and successful checks, use **Squash and merge**.
6. Open a synchronization pull request from `main` to `develop` and use **Create a merge commit**.
7. Verify the correction in both branches, delete the hotfix branch, and update Jira.

Hotfix and synchronization pull requests follow the same review and verification requirements as other changes.
