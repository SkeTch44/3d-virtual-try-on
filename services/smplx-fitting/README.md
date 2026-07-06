# SMPL-X Fitting Service

Standalone Python microservice that fits an [SMPL-X](https://smpl-x.is.tue.mpg.de/) body model
to the MediaPipe BlazePose keypoints produced by the web app, and returns:

- SMPL-X shape parameters (`betas`)
- Body measurements extracted from the fitted 3D mesh (chest / waist / hips / height, cm)
- A rigged-ready `.glb` export of the fitted mesh

This is the Phase 1 "SMPL-X fitting worker" from PLAN.md, packaged as a FastAPI service
instead of a Celery worker so it can be deployed anywhere (Modal, RunPod, Fly GPU, or any
box with a GPU — CPU works too, just slower).

> **This service is NOT wired into the web app yet.** The app currently uses its in-browser
> heuristic estimator. See "Wiring into the web app" below for the planned integration.

## License requirement (important)

The SMPL-X model files are **license-gated and cannot be redistributed**. You must:

1. Register at https://smpl-x.is.tue.mpg.de/ and accept the license.
2. Download `SMPLX_NEUTRAL.npz` (and optionally `SMPLX_MALE.npz` / `SMPLX_FEMALE.npz`).
3. Place them in `models/smplx/` (or set `SMPLX_MODEL_DIR`).

```
services/smplx-fitting/
  models/
    smplx/
      SMPLX_NEUTRAL.npz
```

The service refuses to start without at least the neutral model.

## Quick start

```bash
cd services/smplx-fitting
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# put SMPLX_NEUTRAL.npz in models/smplx/ first
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Or with Docker:

```bash
docker build -t smplx-fitting .
docker run -p 8000:8000 -v $(pwd)/models:/app/models smplx-fitting
```

## API

### `GET /health`

Returns `{"status": "ok", "device": "cuda"|"cpu", "genders": ["neutral", ...]}`.

### `POST /fit`

Fits SMPL-X to two-view BlazePose keypoints. The request body matches the web app's
`AvatarLandmarks` format exactly (33 normalized keypoints per view).

```json
{
  "height_cm": 172,
  "gender": "neutral",
  "front": [ { "x": 0.51, "y": 0.11, "z": -0.3, "visibility": 0.99 }, ... 33 total ],
  "side":  [ ... 33 keypoints, or null ],
  "return_mesh": false
}
```

Response:

```json
{
  "betas": [0.42, -1.1, ...],            // 10 shape coefficients
  "measurements": {
    "height": 172, "chest": 96, "waist": 82, "hips": 100
  },
  "confidence": 0.91,                     // mean keypoint reprojection quality
  "vertices_count": 10475,
  "glb_url": null                         // set when return_mesh=true (see below)
}
```

With `"return_mesh": true` the response is `multipart/mixed`-free and instead the fitted
mesh is returned as base64 GLB in `glb_base64`. For production, prefer `POST /fit/glb`
which streams the binary GLB directly (`model/gltf-binary`).

### `POST /fit/glb`

Same request body; responds with the raw `.glb` bytes of the fitted mesh
(`Content-Type: model/gltf-binary`). Upload this to Blob storage from your backend.

## How the fitting works

Standard SMPLify-X-style optimization, adapted for the two-photo A-pose capture:

1. **Camera init** — per-view weak-perspective camera (scale + translation) initialized
   from the torso keypoints; the side view is treated as a 90° yaw of the same body.
2. **Stage 1: camera + global orientation** — optimize the camera and `global_orient`
   with shape and pose frozen (Adam, ~100 steps).
3. **Stage 2: shape + pose** — optimize `betas` (10 coefficients) and a restricted body
   pose (shoulders/elbows/hips only, everything else prior-locked to A-pose) against the
   2D reprojection loss of both views, with:
   - L2 shape regularization (`betas` → 0)
   - A-pose prior on body pose
   - Height constraint: fitted mesh stature must match `height_cm`
4. **Measurements** — the fitted mesh is sliced at chest/waist/hip heights (same stature
   fractions the web app uses) and each slice's perimeter is measured directly on the
   mesh cross-section, not an ellipse approximation.
5. **Export** — vertices + faces exported as GLB via trimesh.

Only keypoints with `visibility >= 0.5` contribute to the loss, weighted by visibility.

## Deployment notes

- **GPU**: ~2-4 s per fit on a T4. **CPU**: ~30-60 s. Both produce identical output.
- The service is stateless — scale horizontally behind any load balancer.
- Set `SMPLX_MODEL_DIR` if the models live outside `./models/smplx`.
- `PORT` is respected by the Dockerfile entrypoint (default 8000).

## Wiring into the web app (later)

The planned integration (not yet implemented):

1. Deploy this service, set `SMPLX_SERVICE_URL` in the Vercel project env vars.
2. In `components/studio/processing-step.tsx`, after landmark extraction, POST the
   existing `AvatarLandmarks` + height to `${SMPLX_SERVICE_URL}/fit` via a Next.js
   route handler (keeps the service URL server-side).
3. Use the returned measurements instead of the heuristic estimate, store `betas` in
   the `avatars.landmarks` jsonb (or a new column), and optionally fetch `/fit/glb`
   and upload it to Blob for the Phase 3 physics pipeline.
4. Keep the in-browser estimator as the fallback when `SMPLX_SERVICE_URL` is unset or
   the service errors — the current UX continues to work unchanged.
