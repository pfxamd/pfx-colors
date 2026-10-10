# PFx Colors

A browser-based color workspace with color discovery, precise picking, tonal palettes, harmonies, editable gradients, image palette extraction, WCAG text contrast checking, and saved collections.

**Live app:** https://pfxamd.github.io/pfx-colors/  
**Independent Rust preview:** https://pfxamd.github.io/pfx-colors/preview/

## Engines and rollback

- **Default:** pinned Rust Color Core compiled to WebAssembly.
- **Rollback:** open [`?engine=legacy`](https://pfxamd.github.io/pfx-colors/?engine=legacy) to use the original TypeScript Color Core **without downloading Rust WASM**.
- If Rust initialization fails, the entry point falls back to TypeScript rather than showing an empty application.
- Gradient pixels render in a dedicated Web Worker; if that worker fails, the gradient retains a CSS preview.
- The standalone `/preview/` build is intentionally separate and keeps its own revision and comparison controls. It is not the source of the main app.

**Do not remove `vendor/PFx-Color-Core/`, the legacy operations or the `?engine=legacy` path.** They are required for rollback and for parity checks.

## Source layout

| Location | Responsibility |
| --- | --- |
| `src/app/` | UI, tool views and default/rollback bootstrapping |
| `src/rust/` | WASM loader, Rust/TypeScript operation routing and off-thread gradient raster |
| `src/interaction/` | Interaction hooks used by the color tools |
| `vendor/PFx-Color-Core/` | Pinned TypeScript fallback, **not** obsolete |
| `vendor/PFx-Interaction-Core/` | Pinned interaction primitives |
| `tests/` | Unit and integration tests |
| `scripts/browser-smoke.mjs` | Main site's UI smoke check |
| `scripts/rust-production.browser.mjs` | Rust default, legacy rollback and simulated WASM failure |
| `scripts/rust-integration.browser.mjs` | Rust/TypeScript parity in real browsers |
| `scripts/rust-drag-perf.browser.mjs` | Real pointer-drag responsiveness |
| `scripts/rust-staging.browser.mjs` | Isolated `/preview/` regression |

## Development

Use Node.js 22.

```bash
npm install
npm run dev
npm run check
```

The production Rust WASM binary is **built by CI**, not committed to Git. To run the Rust engine locally, build `pfx-color-ffi` from the pinned Rust core with target `wasm32-unknown-unknown`, and put the compiled `pfx_color_ffi.wasm` and first-party JavaScript bindings in `public/rust/`. The normal TypeScript mode works without these binaries via `?engine=legacy`.

- Rust core source: [pfxamd/pfx-color-core](https://github.com/pfxamd/pfx-color-core), pinned to `28aff99941787ee30f52742c36110bc4e03a8b7c`.
- Legacy source: [pfxamd/pfx-color-core](https://github.com/pfxamd/pfx-color-core), vendored at `d07951fd1a9cf80c39ee17de8d9313cdda4e1cbe`.

## Quality gates and release

- [`verify-color-engine.yml`](.github/workflows/verify-color-engine.yml) verifies the Rust build, 41 existing application tests, TypeScript, production-path Vite build, both browsers at desktop/mobile sizes, rollback, color parity and pointer dragging **without deployment**.
- [`deploy-pages.yml`](.github/workflows/deploy-pages.yml) builds and deploys the main app and its pinned standalone `/preview/` subdirectory using GitHub Pages. The **same Rust WASM build** is reused for both, rather than compiled twice.
- [`browser-smoke.yml`](.github/workflows/browser-smoke.yml) checks the **live** deployment, including rollback and Rust responsiveness.

Any change to the pinned Rust revision, fallback behavior or the `/preview/` pin requires its own tests and review. Do not treat a green build as proof of universal color-space or device compatibility.
