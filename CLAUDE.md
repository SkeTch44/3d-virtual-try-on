# CLAUDE.md — Physics-Based AI 3D Virtual Try-On Platform

Context file for AI assistants (Claude, v0, etc.) working on this repository.
Read this before making changes. The full phased roadmap lives in `docs/PLAN.md`.

---

## 1. What This Project Is

A physics-based AI 3D virtual try-on platform:

1. User uploads front + side photos → 3D avatar with real body measurements
2. User selects a garment → 3D clothing with real fabric physics presets
3. Cloth simulation drapes the garment on the avatar (fit heatmap: tight / fit / loose)
4. AI size recommendation ("Will size M fit me?") from measurements vs. size charts
5. Later: Shopify plugin, brand dashboard, mobile, AR/VR

**Strategy:** open-source first, cost-optimized. Vertical slice before infrastructure
(no Kubernetes / Kafka / multi-region until forced).

---

## 2. Current Tech Stack (as built)

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| 3D | React Three Fiber (`@react-three/fiber` v9) + drei + three.js |
| State | Zustand (`lib/studio-store.ts` — single studio store) |
| Styling | Tailwind CSS v4 + shadcn/ui (Base UI variant) |
| Pose estimation | MediaPipe Tasks Vision (BlazePose, 33 keypoints, **runs in-browser**) |
| Database | Postgres via Drizzle ORM (`lib/db/`), `pg` driver |
| File storage | Vercel Blob (`@vercel/blob`) for uploaded photos |
| Identity | Anonymous device id cookie (`lib/device-id.ts`) — **no auth yet** |
| Cloth physics | Custom XPBD-style cloth solver in TypeScript, runs client-side in R3F (`components/studio/cloth-garment.tsx`) |
| SMPL-X service | Python FastAPI microservice (`services/smplx-fitting/`) — **built but NOT wired in** |

## 3. Repository Layout

```
app/
  page.tsx                    # Landing page
  studio/page.tsx             # The try-on studio (main app flow)
  api/avatars/photos/route.ts # POST photos -> Blob upload + avatar row
  api/avatars/[id]/route.ts   # PATCH avatar (landmarks/measurements/status)
  api/avatars/latest/route.ts # GET latest avatar for device (session restore)
components/
  landing/hero-visual.tsx     # Landing 3D hero
  studio/
    upload-step.tsx           # Photo capture/upload + height hint
    processing-step.tsx       # MediaPipe extraction -> measurements pipeline
    studio-scene.tsx          # R3F canvas: avatar + cloth + lighting
    avatar-model.tsx          # Parametric avatar mesh from measurements
    cloth-garment.tsx         # XPBD cloth sim + fit heatmap (strain-based)
    landmark-overlay.tsx      # 33-keypoint debug overlay on photos
    measurement-panel.tsx     # Manual measurement sliders
    garment-panel.tsx         # Garment/size/fabric selection
    fit-panel.tsx             # Size recommendation UI
lib/
  studio-store.ts             # Zustand store: step flow, photos, avatar, sim
  garments.ts                 # Garment catalog + 4 fabric presets (cotton/denim/silk/wool)
  body.ts                     # BodyProfile, collision (SDF-ish capsule/ellipse body)
  size-ai.ts                  # Measurements type + size recommendation logic
  device-id.ts                # Anonymous device cookie
  pose/
    landmarker.ts             # MediaPipe BlazePose loader (browser)
    measurements.ts           # Keypoints -> cm measurements (heuristic, height-calibrated)
    types.ts                  # AvatarLandmarks (33 keypoints x front/side views)
  db/
    schema.ts                 # Drizzle: `avatars` table
    index.ts                  # DB client
services/
  smplx-fitting/              # Python FastAPI SMPL-X fitting service (standalone)
    app/main.py               # /health, /fit, /fit/glb endpoints
    app/fitting.py            # SMPLify-X-style 2-stage optimization
    app/measurements.py       # Mesh cross-section perimeter measurement
    app/export.py             # GLB export via trimesh
docs/
  PLAN.md                     # Full phased roadmap + remaining work (keep updated!)
```

## 4. What We Built So Far

### Phase 0 — Foundation (done, simplified from original plan)
- Next.js 16 monolith on Vercel instead of monorepo + Docker Compose + k3s
  (deliberate: ship the vertical slice first, per the plan's golden rule)
- Postgres (Drizzle ORM) + Vercel Blob instead of self-hosted Postgres + MinIO
- Anonymous device-id sessions instead of Keycloak (auth deferred)
- Landing page + studio shell with step-based flow (upload → processing → avatar → try-on)

### Phase 1 — Avatar Pipeline MVP (done, browser-first variant)
- Photo upload (front + side) → Vercel Blob via `/api/avatars/photos`
- MediaPipe BlazePose 33-keypoint extraction — runs **in the browser** (zero GPU cost)
- Heuristic keypoint → measurement estimator, calibrated by user height hint
  (`lib/pose/measurements.ts`) with a confidence score
- Avatar persistence in Postgres (`avatars` table: photos, landmarks, measurements)
- Session restore: returning device gets its latest avatar back (`/api/avatars/latest`)
- Parametric 3D avatar rendered from measurements in R3F, with landmark debug overlay
- Manual measurement sliders as fallback/override (source tracked: photo vs manual)
- **SMPL-X fitting service** (`services/smplx-fitting/`): full SMPLify-X-style
  2-view fitting, mesh-slice measurements, GLB export. Standalone, tested,
  documented — awaiting deployment + wiring (needs license-gated SMPL-X model files).

### Phase 2 — Garment Digitization (partially done, template-first)
- Garment catalog with 4 garments (tee, slip dress, denim jacket, +) and size charts (S–XL)
- 4 measured fabric presets: cotton jersey, denim 12oz, silk charmeuse, wool twill
  (stiffness, damping, gsm, stretch) — the "Fabric Intelligence DB" v0, in code
- Procedural garment geometry from size-chart circumferences (no Blender assets yet)

### Phase 3 — Physics Try-On Core (MVP done, client-side variant)
- Custom XPBD-style cloth solver in TypeScript running in the browser at 60fps
  (grid cloth, distance constraints, gravity, damping, substeps)
- Avatar-body collision via analytic body profile (`lib/body.ts`)
- Fit heatmap from constraint strain: tight (red) / fit (green) / loose (blue)
- Re-simulation on any change (size, garment, measurements) via `simKey`
- Size recommendation from measurements vs. garment size chart (`lib/size-ai.ts`)

### Not started
- Phases 4–6 beyond what's listed above (LLM stylist, embeddings, Shopify app,
  brand dashboard, billing, mobile, AR/VR, infra hardening). See `docs/PLAN.md`.

## 5. Key Architectural Decisions (don't undo casually)

1. **Browser-first ML & physics.** MediaPipe and the cloth sim run client-side.
   $0 GPU cost for the MVP. Server-side GPU (SMPL-X, Warp) is additive, not a rewrite.
2. **Graceful degradation.** Every "smart" path has a fallback: photo pipeline falls
   back to manual sliders; SMPL-X service (when wired) falls back to the heuristic
   estimator. Keep this pattern.
3. **`AvatarLandmarks` is the contract.** The 33-keypoint two-view format in
   `lib/pose/types.ts` is shared verbatim with the Python service. Don't change one
   without the other.
4. **Vertical slice over infrastructure.** No k8s/Kafka/microservices until user
   traction demands it. The original PLAN's infra layers are Phase 6+ concerns.
5. **`simKey` bump = re-drop cloth.** Any state change that should re-simulate must
   increment `simKey` in the store.

## 6. Conventions

- Package manager: **pnpm** (lockfile: `pnpm-lock.yaml`)
- Path alias: `@/*` → repo root
- All measurements in **cm**; 3D scene units in **meters** (`body.heightM`)
- Design tokens via Tailwind v4 `@theme` in `app/globals.css` — no raw hex in components
- New DB tables go in `lib/db/schema.ts` (Drizzle); avatar-scoped data keys on `deviceId`
- Python service uses FastAPI + Pydantic schemas mirroring the TS types

## 7. Environment Variables

| Var | Purpose | Status |
|---|---|---|
| `DATABASE_URL` / Postgres vars | Drizzle/pg connection | required |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob photo uploads | required |
| `SMPLX_SERVICE_URL` | SMPL-X fitting service base URL | planned (not wired) |

## 8. What's Next

See `docs/PLAN.md` → "What's Remaining" for the prioritized list. Top of the stack:

1. Wire the SMPL-X service into the processing step (server route proxy + fallback)
2. Real GLB garment templates (Blender-authored) replacing procedural geometry
3. Auth (Better Auth on Neon per platform default) replacing device-id-only identity
4. Brand dashboard v0 + garment upload flow
5. Server-side simulation cache for identical body+garment pairs
