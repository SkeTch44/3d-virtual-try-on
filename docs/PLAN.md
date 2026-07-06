# PLAN.md — Physics-Based AI 3D Virtual Try-On Platform

Full phased roadmap with per-task status. Legend:

- [x] Done
- [~] Partially done / MVP variant shipped
- [ ] Not started

> **Golden rule:** Ship the vertical slice (photo → avatar → draped garment → browser
> view) before touching Kubernetes, Kafka, or multi-region anything. The vertical
> slice **is shipped** — everything below builds on it.

---

## Phase 0 — Foundation

Goal: a working authenticated shell where the app can be developed and deployed.

- [x] Next.js 16 + React 19 + TypeScript app (App Router)
- [x] Tailwind v4 + shadcn/ui design system, landing page
- [x] Postgres via Drizzle ORM (`avatars` table)
- [x] Vercel Blob object storage for photo uploads
- [x] Anonymous device-id identity (cookie) for session continuity
- [x] Deployed on Vercel with auto-deploy from `main`
- [~] Monorepo structure — single Next.js app + `services/` dir instead of Turborepo
  (revisit only when mobile/dashboard apps exist)
- [ ] Real auth (email + password) replacing device-id-only identity
- [ ] CI pipeline (lint, type-check, build) on PRs
- [ ] Docker Compose for the Python service(s) local dev

**Exit criteria: met** — deployable app with persistence and a working studio shell.

---

## Phase 1 — Avatar Pipeline MVP

Goal: photo in → 3D avatar with measurements rendered in browser in < 60s.

- [x] Photo upload flow (front + side) → Blob via `/api/avatars/photos`
- [x] MediaPipe BlazePose 33-keypoint extraction (in-browser, zero GPU cost)
- [x] Heuristic keypoint → cm measurement estimator with height calibration
      and confidence score (`lib/pose/measurements.ts`)
- [x] Avatar persistence (photos, landmarks, measurements, status) in Postgres
- [x] Session restore — returning device reloads its latest avatar
- [x] Parametric 3D avatar in R3F with orbit controls
- [x] Landmark debug overlay on uploaded photos
- [x] Manual measurement sliders (fallback + override, source tracked)
- [x] SMPL-X fitting microservice built (`services/smplx-fitting/`):
      2-view SMPLify-X optimization, mesh-slice measurements, GLB export, Dockerfile
- [x] Wire SMPL-X into processing step via a Next.js route handler proxy
      (`/api/smplx/fit` + `SMPLX_SERVICE_URL`), heuristic estimator as fallback
- [ ] Deploy SMPL-X service (needs license-gated model files — see its README)
      and set `SMPLX_SERVICE_URL` in the project env
- [ ] Store `betas` + fitted GLB in Blob for the physics pipeline
- [ ] Verify SMPL-X commercial licensing (Meshcapade) or evaluate SKEL/STAR

**Exit criteria: met** (heuristic path) — photo → avatar in browser well under 60s.

---

## Phase 2 — Garment Digitization

Goal: brand uploads a product → textured 3D garment asset.

- [x] Template-based garment catalog (tee, slip dress, denim jacket, …) with size charts
- [x] Fabric Intelligence DB v0 — 4 measured presets (cotton, denim, silk, wool:
      stiffness, damping, gsm, stretch) in `lib/garments.ts`
- [x] Procedural garment geometry generated from size-chart circumferences
- [ ] Blender-authored GLB garment templates for 5 types (tee, jeans, dress, jacket, skirt)
- [ ] Garment image upload → SAM-2 segmentation service
- [ ] Texture projection from product photos onto garment templates
- [ ] Move fabric presets + garment catalog into Postgres (admin-editable)
- [ ] Brand dashboard v0: garment upload + catalog management flow
- [ ] gltf-transform optimization pipeline (Draco/meshopt) for garment assets

**Exit criteria: partially met** — garments exist and simulate, but no brand upload path yet.

---

## Phase 3 — Physics Try-On Core (the moat)

Goal: select garment → physically-draped result on your avatar in < 30s.

- [x] Cloth solver: custom XPBD-style sim in TypeScript, real-time in-browser
      (grid cloth, distance constraints, gravity, damping, substeps)
- [x] Avatar-garment collision via analytic body profile (`lib/body.ts`)
- [x] Fit heatmap from constraint strain (tight/fit/loose zones)
- [x] Re-simulation on any body/garment/size change (`simKey`)
- [ ] NVIDIA Warp XPBD cloth solver service (GPU, server-side) for high-fidelity drape
- [ ] SDF collision from the actual SMPL-X body mesh (replaces analytic profile)
- [ ] Server-side drape: fit garment, settle, export draped GLB
- [ ] Simulation cache (dedupe identical body+garment+size pairs) — Redis/Blob
- [ ] Try-on session progress streaming (WebSocket or SSE) for server-side sims
- [ ] GPU render queue (Celery or serverless GPU: Modal/RunPod) with autoscaling
- [ ] Self-collision + layering (jacket over tee)

**Exit criteria: met for MVP** — instant in-browser drape; server-grade fidelity remaining.

---

## Phase 4 — AI Intelligence Layer

Goal: "Will size M fit me?" answered with a confidence score.

- [x] Size recommendation from measurements vs. garment size chart (`lib/size-ai.ts`)
- [ ] Size prediction model (XGBoost on measurements + brand size charts + returns data)
- [ ] Style embeddings (CLIP) → pgvector/Qdrant → "similar items" + outfit matching
- [ ] LLM stylist chat (AI SDK + AI Gateway for MVP; self-hosted vLLM at scale)
      with RAG over the catalog
- [ ] Analytics event ingestion (try-on events, conversions) + dashboards
- [ ] Fit-confidence scoring combining strain data from the physics sim

**Exit criteria: partially met** — rule-based size rec works; ML/LLM layers remaining.

---

## Phase 5 — Distribution & Monetization

Goal: first external brand live.

- [ ] Shopify app: embedded try-on widget, OAuth, product/webhook sync
- [ ] Brand dashboard v1: catalog mgmt, try-on analytics, billing
- [ ] Stripe billing (per-try-on metering or SaaS tiers)
- [ ] Public REST API + docs for headless integrations
- [ ] Embeddable widget script (iframe/web component) for non-Shopify stores
- [ ] React Native mobile app (camera capture + viewer)

---

## Phase 6 — Scale & Hardening

Goal: production-grade reliability and reach.

- [ ] WebXR AR try-on (Quest browser / mobile AR)
- [ ] Auth hardening: roles (shopper / brand admin), GDPR data deletion flows
- [ ] Load testing (k6), SLOs, alerting
- [ ] DR: backup/restore drills, PITR
- [ ] Cost-optimized self-hosted migration **only if unit economics demand it**
      (k3s on Hetzner, MinIO, self-hosted Postgres — per original cost plan)
- [ ] Auto garment 3D reconstruction research (DiffAvatar / NeuralTailor)

---

## What's Remaining (prioritized)

The next-up list, in order:

1. **Deploy SMPL-X service** — the `/api/smplx/fit` proxy is wired with heuristic
   fallback; deploy `services/smplx-fitting` (GPU host + licensed model files) and
   set `SMPLX_SERVICE_URL`. (Phase 1)
2. **Real garment templates** — authored GLBs for the 5 core garment types,
   replacing procedural geometry. (Phase 2)
3. **Auth** — email + password (Better Auth on Neon), migrate device-id avatars to
   user accounts on sign-up. (Phase 0)
4. **Brand dashboard v0** — garment upload + catalog CRUD, fabric presets in DB. (Phase 2)
5. **Server-side high-fidelity drape** — Warp XPBD on GPU with SMPL-X mesh SDF
   collision, cached per body+garment+size. (Phase 3)
6. **Texture projection + SAM-2 segmentation** — product photo → textured garment. (Phase 2)
7. **ML size prediction + style embeddings** — XGBoost sizing, CLIP similar items. (Phase 4)
8. **LLM stylist chat** — RAG over catalog. (Phase 4)
9. **Shopify app + Stripe billing** — first external brand. (Phase 5)
10. **Mobile + AR** — React Native capture app, WebXR try-on. (Phases 5–6)

---

## Status Summary

| Phase | Status |
|---|---|
| 0 — Foundation | Done (MVP variant; auth + CI remaining) |
| 1 — Avatar Pipeline | Done (heuristic path); SMPL-X wiring remaining |
| 2 — Garment Digitization | ~40% (templates + fabrics done; brand upload remaining) |
| 3 — Physics Try-On | MVP done (client-side); server-grade fidelity remaining |
| 4 — AI Intelligence | ~15% (rule-based sizing done) |
| 5 — Distribution | Not started |
| 6 — Scale & Hardening | Not started |
