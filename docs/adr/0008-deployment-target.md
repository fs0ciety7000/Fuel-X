# ADR 0008 — Deployment: host-agnostic static `dist/`, primary target Cloudflare Pages

- **Status**: Proposed (Gate 1)
- **Date**: 2026-10-18
- **Owner**: systems-architect
- **Related**: ADR 0001, ADR 0003 (worker option)

## Context
Client-only game (ADR 0001): `vite build` produces static HTML/JS/CSS + GLB + fonts. Needs:
correct MIME types (`.glb` → `model/gltf-binary`, `.wasm` if ever), long-lived immutable caching
for hashed assets, short caching for HTML, HTTPS, optional custom headers (COOP/COEP would be
required only if we ever use `SharedArrayBuffer`, which ADR 0003 avoids), preview deploys per branch.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| **Cloudflare Pages** | Free, global CDN, `_headers` file for cache/MIME/COOP-COEP, branch previews, no server code | Needs a Cloudflare account |
| GitHub Pages | Zero setup next to the repo | No custom headers (no COOP/COEP, no cache control), sub-path base URL |
| Netlify / Vercel | Headers, previews | Vercel is Next-centric; similar to Cloudflare otherwise |
| Self-hosted (nginx) | Full control | Ops burden for a static site |

## Decision
- The build is **host-agnostic**: `dist/` only, base path from `VITE_BASE` (default `/`), all asset URLs resolved through `import.meta.env.BASE_URL`. No server functions, no SSR, no SharedArrayBuffer.
- **Primary target: Cloudflare Pages** with `public/_headers`:
  `/assets/*` and `/models/*` → `Cache-Control: public, max-age=31536000, immutable` (models get a content hash query/filename at build); `/*.html` → `no-cache`; `*.glb` → `Content-Type: model/gltf-binary`.
- **Fallback: GitHub Pages** works unchanged (set `VITE_BASE=/Fuel-X/`), at the cost of caching control.
- Deployment automation (CI workflow, `wrangler`) is added only when the user approves an account — not in Phase 2. Until then, `npm run build && npm run preview` is the release check.

## Consequences
- Positive: no lock-in; previews are just static uploads.
- Negative: GLB cache-busting needs content-hashed names (codegen writes the hashed URL into the manifest).
- Open question for the user: is a Cloudflare account OK, or prefer GitHub Pages?

## Dependencies introduced
None now (`wrangler` would be added by a later ADR if CI deploys).
