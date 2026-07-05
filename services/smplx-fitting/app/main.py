"""SMPL-X fitting service — FastAPI entrypoint.

POST /fit      -> betas + measurements (optionally base64 GLB)
POST /fit/glb  -> raw GLB bytes of the fitted mesh
GET  /health   -> readiness + device info
"""

import base64
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response

from . import fitting
from .export import to_glb
from .measurements import measure
from .schemas import FitRequest, FitResponse, Measurements


@asynccontextmanager
async def lifespan(app: FastAPI):
    genders = fitting.available_genders()
    if not genders:
        raise RuntimeError(
            "No SMPL-X model files found. Download SMPLX_NEUTRAL.npz from "
            "https://smpl-x.is.tue.mpg.de/ (license required) and place it in "
            f"{fitting.MODEL_DIR}"
        )
    # warm the neutral model so the first request isn't slow
    fitting.load_model("neutral" if "neutral" in genders else genders[0])
    yield


app = FastAPI(title="smplx-fitting", lifespan=lifespan)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": str(fitting.device()),
        "genders": fitting.available_genders(),
    }


def run_fit(req: FitRequest) -> fitting.FitResult:
    if req.gender not in fitting.available_genders():
        raise HTTPException(400, f"gender '{req.gender}' model not installed")
    try:
        return fitting.fit(req)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/fit", response_model=FitResponse)
def fit_endpoint(req: FitRequest):
    result = run_fit(req)
    m = measure(result.vertices, result.faces, req.height_cm)
    return FitResponse(
        betas=[float(b) for b in result.betas],
        measurements=Measurements(**m),
        confidence=result.confidence,
        vertices_count=len(result.vertices),
        glb_base64=base64.b64encode(to_glb(result.vertices, result.faces)).decode()
        if req.return_mesh
        else None,
    )


@app.post("/fit/glb")
def fit_glb_endpoint(req: FitRequest):
    result = run_fit(req)
    return Response(
        content=to_glb(result.vertices, result.faces),
        media_type="model/gltf-binary",
        headers={"Content-Disposition": 'attachment; filename="avatar.glb"'},
    )
