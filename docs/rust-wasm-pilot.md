# PFx Colors — Rust/WASM experimental integration

Branch: integration/rust-wasm-pilot. This is NOT a production deployment.
The main branch and the public website remain unchanged.

## How to run

    npm install
    rustup target add wasm32-unknown-unknown
    node scripts/prepare-rust-pilot.mjs
    npm run dev

Open the app with \`?engine=rust\` for the pilot or without it for the
unchanged TypeScript engine. The pilot loads its .wasm and the JS bridge
from local, **copied** public/pfx-rust/ files. There is no remote request
to the Rust repository at runtime, and its source is compiled from a
pinned immutable commit (see prepare-rust-pilot.mjs).

The global \`window.__pfxRustPilot\` is test-only diagnostics. A successful
opt-in shows status \`rust\` and per-operation routing counters. Unsupported
operations and significant deviations use the existing Color.js path.
Input parsing, CSS serialization and HEX are still normalized through the
legacy engine; this integration is **not** a complete Rust-only migration.

The experimental interface now also runs the actual Rust Color Study generator, tonal palette, geometric harmony and gradient sampling; the installed legacy implementation remains the fallback for input and parity edge cases. The colors produced by the Rust Color Study may differ from the historical algorithm because its deterministic generator is distinct. This intentionally changes generated color values in the opt-in mode, never page structure or styling.

The experiment operates on the existing ColorEngine singleton before
React startup. It does not modify the UI, CSS, HTML, workspace history,
or the upstream vendored TypeScript core. Defaults always use the stable
engine, including if the optional pilot cannot initialize.

GitHub Actions additionally verifies non-zero Rust routes for conversion, gamut, gamut mapping, Color Study, tonal palette, harmony, interpolation and gradient sampling, and simulates a failed WASM fetch to verify safe fallback.

GitHub Actions runs TypeScript tests, the compiled Rust WASM, TypeScript
typecheck/build and real Chromium/Firefox desktop/mobile interaction.
Artifacts are attached to workflow runs, not deployed to GitHub Pages.

Promotion requirements: expand the route parity gate for missing CSS
channels, wide-gamut boundaries, alpha handling, custom palette results
and all visual modes. Do not merge this experiment directly into main
until those are verified.
