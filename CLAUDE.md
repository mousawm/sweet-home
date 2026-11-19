# Sweet Home: working notes

## Releases (important)

- **Do not release for each fix.** Releases happen once or twice a week, or when the owner says "release".
- Pushing to `main` with a new `version` in `package.json` publishes a GitHub release (`.github/workflows/release.yml`), so **do not bump `version`** in a normal fix or feature change.
- Every fix or change adds a one-line, user-facing note under `## Unreleased` in `CHANGELOG.md` (in `### Fixed`, `### Changed` or `### Added`), in the same commit as the change.
- `dist/` must still be rebuilt (`npm run build`) and committed with each change; CI checks it.

## Pull requests and merging

- When asked to "create a PR and merge it": open the PR, then **wait for its GitHub checks (Build and HACS validation) to finish and pass before merging**. Running `npm test` locally first is still required, but it does not replace CI (CI runs on a clean machine and also checks that `dist/` is up to date).
- If a check fails: find the cause, fix it on the branch, and wait for the checks again. Never merge on red or on checks still running; if it can't be fixed, report why instead of merging.
- After merging, confirm the checks on `main` passed too.

### Cutting a release (only when asked)

1. Bump `version` in `package.json` and `package-lock.json` (patch bump unless told otherwise).
2. In `CHANGELOG.md`, rename `## Unreleased` to `## v<version> — <YYYY-MM-DD>`, drop empty subsections, and add a fresh empty `## Unreleased` block (with the three subsections) above it.
3. `npm run build`, `npm test`, commit as `Release v<version>`.
4. Once merged to `main`, the workflow creates the release with that CHANGELOG section as its notes.
