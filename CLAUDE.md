# Sweet Home: working notes

## Releases (important)

- **Do not release for each fix.** Releases happen once or twice a week, or when the owner says "release".
- Pushing to `main` with a new `version` in `package.json` publishes a GitHub release (`.github/workflows/release.yml`), so **do not bump `version`** in a normal fix or feature change.
- Every fix or change adds a one-line, user-facing note under `## Unreleased` in `CHANGELOG.md` (in `### Fixed`, `### Changed` or `### Added`), in the same commit as the change.
- `dist/` must still be rebuilt (`npm run build`) and committed with each change; CI checks it.

### Cutting a release (only when asked)

1. Bump `version` in `package.json` and `package-lock.json` (patch bump unless told otherwise).
2. In `CHANGELOG.md`, rename `## Unreleased` to `## v<version> — <YYYY-MM-DD>`, drop empty subsections, and add a fresh empty `## Unreleased` block (with the three subsections) above it.
3. `npm run build`, `npm test`, commit as `Release v<version>`.
4. Once merged to `main`, the workflow creates the release with that CHANGELOG section as its notes.
5. A **beta** ("beta release"): version `<next>-beta.N` (e.g. `0.6.63-beta.1`). Any version with a `-` is published as a
   GitHub pre-release, which HACS shows only with "Show beta versions" on. When the full version is released later, its
   CHANGELOG section lists everything since the last full release (the beta sections' notes included).

## Pull requests and merging

- When asked to "create a PR and merge it": open the PR, then **wait for its GitHub checks (Build and HACS validation) to finish and pass before merging**. Running `npm test` locally first is still required, but it does not replace CI (CI runs on a clean machine and also checks that `dist/` is up to date).
- If a check fails: find the cause, fix it on the branch, and wait for the checks again. Never merge on red or on checks still running; if it can't be fixed, report why instead of merging.
- After merging, confirm the checks on `main` passed too.

## Code layout

- `src/card.js`: the card element (config, hass, build, tabs, clicks, room selection, sheets) and `SweetHome3DCard`.
- `src/panels/*.js`: one file per area (home, security, energy, water, media, system, zigbee, rename). Each exports a class
  whose methods are installed on `SweetHomeCard.prototype` in `card.js`, so `this` is the card.
- `src/scene.js`: the Three.js scene (`HouseScene`). `src/styles.js`: the stylesheet. `src/core.js`: shared helpers
  and the current model (`MODEL`, `E`, `ROOMS`…, switched with `useModel`); change `FAHR` / `SHARED` / `SMART` only
  through `setFahr` / `setShared` / `setSmart`.
- `src/zigbee.js`: Zigbee2MQTT / ZHA devices → one list (pure, unit-tested); `src/panels/zigbee.js` draws it.
- `src/model.js`: config + Home Assistant → model (pure, unit-tested). `src/editor.js`: the card editor. `src/i18n.js`:
  translations (`t()`).
- Tests: `test/model.test.mjs` (model), `test/e2e.mjs` (card and editor in a browser, fake WebGL), `test/visual.mjs`
  (real WebGL screenshots, pixel checks).
