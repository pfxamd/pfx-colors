# Rust Color Core — isolated application experiment

This document describes the **branch-only** experiment
`experiment/rust-color-core`. It is not the production PFx Colors engine
migration and does not deploy to GitHub Pages.

## Scope and provenance

- Website repository: `pfxamd/pfx-colors`; production branch `main` untouched.
- Rust source: `pfxamd/pfx-color-core`, pinned **exactly** to commit
  `901a2e53b9fba8aac1c762183172d0642b2e84e5`.
- The branch CI builds this Rust source for
  `wasm32-unknown-unknown` and stages the actual compiled
  `pfx_color_ffi.wasm` plus the independent first-party
  `pfx-color-core.mjs`, `pfx-color-tools.mjs` and
  `pfx-color-workspace.mjs` into `public/rust/`. These files
  appear in the app's `dist/rust/` but are **not** committed to the
  website repository and are not loaded on the default application path.
- The pinned TypeScript engine stays in `vendor/PFx-Color-Core`.
  Normal Vite aliasing and default workspace are unchanged.

## Integration gate

In a built experimental preview, open:

- `/`: normal TypeScript workspace, no WebAssembly fetch
- `/?engine=rust`: Rust-backed first-party workspace, initialized
  asynchronously before rendering the app

The experimental mode does not silently fall back to TypeScript if
Rust fails to load; a clear error is shown. The UI identifies the mode
with a `RUST / EXPERIMENT` label. Opt-in mode is not permanent and
does not modify the stored production engine selection.

This experiment replaces the **workspace controller** only. Color
selection in the workspace, conversions/readouts, state history,
creating gradients, palette/harmony-to-gradient actions and undo/redo
are backed by the first-party Rust WASM workspace. The React view's
separately imported Home Color Study, standalone palette/harmony
preview generators, gradient CSS preview and gradient local sampling
**still use the pinned TypeScript tools**. This mixed-mode result
must not be described as a complete Rust UI migration.

## Verification

The branch-only GitHub Actions workflow
`.github/workflows/rust-experiment.yml`:

1. Checks out exactly the pinned Rust source and builds actual WASM.
2. Copies source-pinned bindings into the static asset folder.
3. Runs the app's existing tests and TypeScript + Vite build.
4. Checks that the final build includes nonempty WASM + runtime files.
5. Serves the actual built React app locally without deployment.
6. Runs Chromium and Firefox with desktop and mobile viewports.
7. Exercises picker selection, keyboard slider, palette click,
   undo/redo, harmony preset, harmony-to-gradient action,
   gradient-stop addition and preview states.
8. Compares selected colors and counts against the original workspace
   with an explicit 8-bit-channel tolerance, stores screenshots, and
   reports approximate per-scenario startup durations.

The test is a feature-gate **compatibility smoke**, not a benchmark
for production service-level performance. Actual physical mobile
devices, all possible inputs, accessibility audits, off-main-thread
WASM scheduling, future color-space support and application-wide
Rust parity remain future acceptance gates.

## Promotion rule

Do not merge this branch or deploy the Rust mode based solely on
standalone Rust tests. Require successful branch-only browser tests,
resolved compatibility differences, all runtime fallbacks explicitly
specified and approval of a separately reviewed production migration.
