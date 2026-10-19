# Fuel-X — Deploy (Coolify)

> Decisions: [ADR 0008](adr/0008-deployment-target.md) (static `dist/` + nginx, Coolify Dockerfile build pack) and
> [ADR 0009](adr/0009-showcase-site.md) (showcase at `/`, game at `/play`, one app). Config in the repo:
> [`Dockerfile`](../Dockerfile), [`deploy/nginx.conf`](../deploy/nginx.conf). No secrets in the repo.

## Target

| URL | Serves |
|---|---|
| `https://fuelx.fs0ciety.org/` | showcase (prerendered `index.html`) |
| `https://fuelx.fs0ciety.org/play` | the game (`play.html`; `/play.html` also works, `/play/` → 301 `/play`) |
| `https://fuelx.fs0ciety.org/design.html` | design-system gallery (not indexed: `robots.txt`) |
| `https://fuelx.fs0ciety.org/healthz` | `200 ok` for the container healthcheck |

One Coolify application (user decision 2026-10-19). `fuel.fs0ciety.org` (ADR 0008's game domain) can stay attached to
the same app as a second domain, or redirect to `fuelx` — see step 4.

## What the image does

1. `node:22-alpine`: `npm ci` → `npm run build` = tokens → `vite build` (index, play, design) → `vite build --ssr`
   (showcase server bundle) → `scripts/showcase/prerender.ts` (writes the page markup + font preloads into
   `dist/index.html`). Blender is **not** run: GLBs, plates and the OG image are committed.
2. `nginx:1.27-alpine` serves `dist/` on port 80 with `deploy/nginx.conf`:
   `/assets/*` and `/models/*` immutable for a year (hashed names / `?v=` hashes), `/showcase/*` and `/brand/*` one day,
   HTML `no-cache`, `.glb` as `model/gltf-binary`, gzip, `nosniff`, `Referrer-Policy`, `X-Frame-Options`,
   relative redirects (`absolute_redirect off`, so nothing downgrades to `http://` behind the TLS proxy).
3. `HEALTHCHECK` = `wget http://127.0.0.1/healthz`.

## Step by step (Coolify dashboard, `https://coolify.fs0ciety.org`)

1. **Project / environment**: open the project that holds the existing `fuel-x` application (TASKS 8.4), or create one
   (`Projects → + Add`).
2. **Application** (reuse `fuel-x`, or `+ New → Application → Public/Private GitHub repository`):
   - Repository: `fs0ciety7000/fuel-x`.
   - **Branch**: the branch to publish. Until this work is merged, `claude/vitrine-site`; after the merge, the default
     branch. Auto-deploy on push: on.
   - **Build pack**: `Dockerfile` (location `/Dockerfile`, base directory `/`).
   - **Ports exposes**: `80`.
3. **Healthcheck** (Configuration → Healthcheck): enabled, path `/healthz`, port `80`, scheme `http`, expected `200`.
4. **Domains** (Configuration → General → Domains): `https://fuelx.fs0ciety.org`.
   - To keep the game's old address working, add it to the same field, comma-separated:
     `https://fuelx.fs0ciety.org,https://fuel.fs0ciety.org`. Coolify issues a certificate for each.
5. **DNS** (registrar / Cloudflare for `fs0ciety.org`): an `A` record `fuelx` → `152.53.176.13` (the same origin as the
   other Coolify apps). With Cloudflare: start **DNS only** (grey cloud) so Traefik can complete the Let's Encrypt
   HTTP challenge; switch the proxy on afterwards if wanted (zone SSL mode **Full (strict)**).
6. **Deploy** (`Deploy` button, or push to the branch). Watch the build log: it must end with
   `prerender: dist/index.html (… KB markup, 3 font preloads)` in the build stage.
7. **Verify** (from any machine):
   ```bash
   curl -sI https://fuelx.fs0ciety.org/ | grep -iE "^(HTTP|cache-control|content-type)"
   curl -s  https://fuelx.fs0ciety.org/ | grep -c "You never fly the rocket"      # ≥ 1: prerender shipped
   curl -sI https://fuelx.fs0ciety.org/play | head -1                              # 200
   curl -sI "https://fuelx.fs0ciety.org/models/tower.glb" | grep -i content-type   # model/gltf-binary
   curl -s  https://fuelx.fs0ciety.org/healthz                                     # ok
   ```
   Then open the page on a phone and with "reduce motion" on, and paste the URL in a social card validator to check
   the OG image (`/showcase/og.png`, 1200×630).

## Local checks before a deploy

```bash
npm run typecheck && npm run lint && npm run test && npm run e2e   # all green
npx tsx scripts/perf/budgets.ts                                     # showcase rows within ADR 0009
docker build -t fuel-x . && docker run --rm -p 8080:80 fuel-x       # http://localhost:8080/ and /play
```

In the cloud dev container the full `docker build` cannot fetch npm packages (sandboxed network), so the runtime half
was verified with a nginx image built from a local `dist/` (routes, MIME, cache headers, healthcheck `healthy`); the
build half is the same `npm run build` the e2e suite runs.

## Rollback

Coolify keeps previous images: `Deployments → (previous) → Redeploy`. Or revert the commit on the deployed branch and
push.
