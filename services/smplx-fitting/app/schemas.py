"""Request/response schemas. The request format mirrors the web app's
`AvatarLandmarks` type (lib/pose/types.ts): 33 normalized BlazePose keypoints."""

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class Keypoint(BaseModel):
    x: float
    y: float
    z: float = 0.0
    visibility: float = Field(1.0, ge=0.0, le=1.0)


class FitRequest(BaseModel):
    height_cm: float = Field(..., ge=120, le=230)
    gender: Literal["neutral", "male", "female"] = "neutral"
    front: list[Keypoint]
    side: Optional[list[Keypoint]] = None
    return_mesh: bool = False

    @field_validator("front", "side")
    @classmethod
    def must_be_33(cls, v):
        if v is not None and len(v) != 33:
            raise ValueError("expected 33 BlazePose keypoints")
        return v


class Measurements(BaseModel):
    height: float
    chest: float
    waist: float
    hips: float


class FitResponse(BaseModel):
    betas: list[float]
    measurements: Measurements
    confidence: float = Field(..., ge=0.0, le=1.0)
    vertices_count: int
    glb_base64: Optional[str] = None
