# ADR 0008 — Deployment: static `dist/` served by nginx, deployed with Coolify

- **Status**: Accepted (Gate 1, user decision: self-hosted Coolify at `coolify.fs0ciety.org`)
- **Date**: 2026-10-18
- **Owner**: systems-architect
- **Related**: ADR 0001, ADR 0003 (worker option)

## Context
Client-only game (ADR 0001): `vite build` produces static HTML/JS/CSS + GLB + fonts. Needs:
correct MIME types (`.glb` → `model/gltf-binary`), long-lived immutable caching for hashed assets,
short caching for HTML, HTTPS, optional custom headers (COOP/COEP only if we ever use
`SharedArrayBuffer`, which ADR 0003 avoids). The user runs a self-hosted **Coolify** instance
(`coolify.fs0ciety.org`) and wants the game deployed there.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| **Coolify, Dockerfile build pack (node build → nginx)** | Full control of headers/MIME/caching in a committed `nginx.conf`; reproducible image; auto-deploy on push; Coolify handles TLS (Traefik + Let's Encrypt) | We maintain a tiny Dockerfile + nginx config |
| Coolify, Nixpacks/static build pack | Zero files | Less control over cache headers and `.glb` MIME; build pack behaviour can change between Coolify versions |
| Cloudflare Pages / GitHub Pages | Managed CDN | Not the user's choice |

## Decision
- The build stays **host-agnostic**: `dist/` only, base path from `VITE_BASE` (default `/`), asset URLs via `import.meta.env.BASE_URL`. No server functions, no SSR, no SharedArrayBuffer.
- **Deploy with Coolify using the Dockerfile build pack**:
  - `Dockerfile` (multi-stage): `node:22-alpine` runs `npm ci && npm run build` → `nginx:1.27-alpine` serves `/usr/share/nginx/html` on port 80.
  - `deploy/nginx.conf`: `/assets/*` and `/models/*` → `Cache-Control: public, max-age=31536000, immutable`; `*.html` → `no-cache`; `types { model/gltf-binary glb; }`; gzip for js/css/json/svg; `play.html` and `design.html` served as-is; 404 → `index.html` (the showcase) is acceptable.
  - Healthcheck: `GET /` returns 200 (Coolify healthcheck on port 80).
  - The Blender step is **not** run in the image: GLBs and generated tokens/wrappers are committed (ADR 0007), so the image only needs Node.
- Coolify app: source = GitHub repo `fs0ciety7000/Fuel-X`, branch to be chosen by the user (default the repo default branch), auto-deploy on push, domain **`fuel.fs0ciety.org`** (user decision, 2026-10-18; replaces the earlier `fuelx` name) configured in Coolify; `coolify.fs0ciety.org` is the Coolify dashboard. DNS: explicit record on `fs0ciety.org` pointing at the same origin as the other Coolify apps (`152.53.176.13`). Traefik issues the origin certificate; Cloudflare proxy is optional once that certificate exists (zone SSL is Full strict).
- Release check before deploy: `npm run build && npm run preview` locally, and `docker build .` must succeed (added to Phase 8.4).

## Consequences
- Positive: user-owned infrastructure; headers and caching are code-reviewed; image is small (nginx + static files).
- Negative: no global CDN by default (can put Cloudflare proxy in front later without changing the build); GLB cache-busting still needs content-hashed names (codegen writes hashed URLs into manifests).
- No secrets in the repo: Coolify webhooks/tokens stay in Coolify.

## Dependencies introduced
None in `package.json`. Container base images pinned by tag: `node:22-alpine`, `nginx:1.27-alpine`.

> Update 2026-10-19 (ADR 0009, user decision): the same Coolify app also serves `https://fuelx.fs0ciety.org` (showcase at
> `/`, game at `/play`); `fuel.fs0ciety.org` stays as an alias. Healthcheck path `/healthz`. Live setup: `docs/DEPLOY.md`.
