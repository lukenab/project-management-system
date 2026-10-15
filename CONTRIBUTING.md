# Contribution Guidelines

This is your guide to contribute to this project

## Workflow

We will use the Gitflow workflow, which means that we have a protected `main` branch.
Most of the developments happen on another branch called `dev`. Changes must
be merged to `dev` first, then after a group of features is finished, we merge them
to `release`. After the changes in `release` is tested, we merge them to `main`

When you want to add any new feature, create a separate branch and make your changes
there. After you have finished, you can create a pull request to merge it to `dev`.
You must not push changes to `dev` directly.

We expect to have 5 kind of core branches:

1. `main` <- This is our main stable branch
2. `dev` <- Development branch
3. `release` <- Staging branch for release
4. `feature` <- Where you write your new changes
5. `hotfix` <- Branch for hotfix issues

## Feature Branches

Feature branches are the branches that you create to write your changes. It must
have the prefix `feature` in its name, for example `feature/add_login`. Feature
branches must be forked from `dev` (not `main`), and later will be merged into
`dev`.

To create a feature branch, do:

```sh
git checkout feature/{your-branch-name} dev
```

After you committed all changes, merge with `dev`:

```sh
git switch dev
git merge feature/{your-branch-name}
```

## Release Branches

Release branches are used to finalize a set of features before merging into `main`.
So, a release branch must be forked from `dev` branch. Here we try to thoroughly
test the code and write sufficient documentation. No new features are allowed in
a release branch, only bugfixes and documentation. After a release branch is
finalized, we must merge to both `main` and `dev`.

To create a release branch, do:

```sh
git checkout release/{number} dev
```

After committed all needed changes, merge with `dev` and `main`:

```sh
git switch dev
git merge release/{number}
git switch main
git merge release/{number}
```

## Hotfix Branches

Hotfix branches are for fixing bugs that appear in `main`, and so it must be forked
from `main`. After the bug is fixed, it must be merged to both `main` and `dev`, or the
ongoing `release` branch.

To create a hotfix branch, do:

```sh
git checkout hotfix/{your-branch-name} main
```

After committed all changes, merge with `dev` and `main`:

```sh
git switch main
git merge hotfix/{your-branch-name}
git switch dev
git merge hotfix/{your-branch-name}
```
