"""SMPLify-X-style two-view fitting of SMPL-X to BlazePose keypoints.

Pipeline (see README):
  Stage 1: optimize per-view weak-perspective cameras + global orientation.
  Stage 2: optimize betas + restricted body pose against both views' 2D
           reprojection loss, with shape/pose priors and a height constraint.
"""

import os
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
import torch

from .keypoints import extract_targets
from .schemas import FitRequest

MODEL_DIR = os.environ.get("SMPLX_MODEL_DIR", os.path.join(os.path.dirname(__file__), "..", "models", "smplx"))
NUM_BETAS = 10

# Restricted pose: only these body-pose joints may move during fitting
# (shoulders, elbows, hips). Indices into the 21-joint body_pose vector
# (SMPL-X body_pose excludes pelvis, so joint j maps to body_pose index j-1).
FREE_POSE_JOINTS = [0, 1, 15, 16, 17, 18]  # l/r hip, l/r shoulder, l/r elbow

# A-pose prior: arms lowered ~60 deg from T-pose (rotation about z for shoulders)
A_POSE_SHOULDER_Z = 1.0  # radians, sign per side

STAGE1_STEPS = int(os.environ.get("FIT_STAGE1_STEPS", 100))
STAGE2_STEPS = int(os.environ.get("FIT_STAGE2_STEPS", 300))

W_REPROJ = 1.0
W_SHAPE = 0.02
W_POSE = 0.1
W_HEIGHT = 10.0


def device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


@lru_cache(maxsize=3)
def load_model(gender: str):
    """Load the SMPL-X body model once per gender (license-gated files)."""
    import smplx

    return smplx.create(
        model_path=os.path.dirname(MODEL_DIR),
        model_type="smplx",
        gender=gender,
        num_betas=NUM_BETAS,
        use_pca=False,
        batch_size=1,
    ).to(device())


def available_genders() -> list[str]:
    out = []
    for g, fname in (("neutral", "SMPLX_NEUTRAL.npz"), ("male", "SMPLX_MALE.npz"), ("female", "SMPLX_FEMALE.npz")):
        if os.path.exists(os.path.join(MODEL_DIR, fname)):
            out.append(g)
    return out


def a_pose(dev: torch.device) -> torch.Tensor:
    """Body pose prior: A-pose (arms lowered), everything else zero."""
    pose = torch.zeros(1, 21 * 3, device=dev)
    # left shoulder (joint 16 -> body_pose idx 15), rotate about z
    pose[0, 15 * 3 + 2] = -A_POSE_SHOULDER_Z
    # right shoulder (joint 17 -> body_pose idx 16)
    pose[0, 16 * 3 + 2] = A_POSE_SHOULDER_Z
    return pose


@dataclass
class ViewTargets:
    target: torch.Tensor   # [N,2] normalized image coords (y down)
    weight: torch.Tensor   # [N]
    joints: torch.Tensor   # [N] smplx joint indices
    yaw: float             # radians, model rotation for this view


def build_views(req: FitRequest, dev: torch.device) -> list[ViewTargets]:
    views = []
    for kps, yaw in ((req.front, 0.0), (req.side, np.pi / 2)):
        if kps is None:
            continue
        pts, w, idx = extract_targets(kps)
        if len(pts) < 6:
            continue
        views.append(
            ViewTargets(
                target=torch.from_numpy(pts).to(dev),
                weight=torch.from_numpy(w).to(dev),
                joints=torch.from_numpy(idx).to(dev),
                yaw=yaw,
            )
        )
    if not views:
        raise ValueError("not enough visible keypoints in any view")
    return views


def yaw_matrix(yaw: float, dev: torch.device) -> torch.Tensor:
    c, s = np.cos(yaw), np.sin(yaw)
    return torch.tensor([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=torch.float32, device=dev)


def project(joints3d: torch.Tensor, cam: torch.Tensor, yaw: float, dev: torch.device) -> torch.Tensor:
    """Weak-perspective projection into normalized image coords (y down).

    cam = [log_scale, tx, ty]; the view is a yaw rotation of the model.
    """
    rot = yaw_matrix(yaw, dev)
    j = joints3d @ rot.T
    scale = cam[0].exp()
    u = scale * j[:, 0] + cam[1]
    v = -scale * j[:, 1] + cam[2]  # flip: SMPL-X y-up -> image y-down
    return torch.stack([u, v], dim=1)


def mesh_height(vertices: torch.Tensor) -> torch.Tensor:
    return vertices[:, 1].max() - vertices[:, 1].min()


@dataclass
class FitResult:
    betas: np.ndarray          # [10]
    vertices: np.ndarray       # [V,3] meters
    faces: np.ndarray          # [F,3]
    confidence: float          # mean weighted reprojection quality 0-1


def fit(req: FitRequest) -> FitResult:
    dev = device()
    model = load_model(req.gender)
    views = build_views(req, dev)
    target_height = req.height_cm / 100.0

    betas = torch.zeros(1, NUM_BETAS, device=dev, requires_grad=True)
    global_orient = torch.zeros(1, 3, device=dev, requires_grad=True)
    pose_prior = a_pose(dev)
    # free pose params only for the allowed joints
    pose_free = torch.zeros(1, len(FREE_POSE_JOINTS) * 3, device=dev, requires_grad=True)
    cams = [torch.tensor([0.0, 0.5, 0.5], device=dev, requires_grad=True) for _ in views]

    def body_pose() -> torch.Tensor:
        pose = pose_prior.clone()
        for k, j in enumerate(FREE_POSE_JOINTS):
            pose[0, j * 3 : j * 3 + 3] = pose_prior[0, j * 3 : j * 3 + 3] + pose_free[0, k * 3 : k * 3 + 3]
        return pose

    def forward():
        out = model(betas=betas, global_orient=global_orient, body_pose=body_pose())
        return out.joints[0], out.vertices[0]

    def reproj_loss(joints3d):
        total, wsum = torch.zeros((), device=dev), 0.0
        for view, cam in zip(views, cams):
            pred = project(joints3d[view.joints], cam, view.yaw, dev)
            err = ((pred - view.target) ** 2).sum(dim=1)
            total = total + (view.weight * err).sum()
            wsum += float(view.weight.sum())
        return total / max(wsum, 1e-6)

    # ---- Stage 1: cameras + global orientation ----
    opt1 = torch.optim.Adam(cams + [global_orient], lr=0.05)
    for _ in range(STAGE1_STEPS):
        opt1.zero_grad()
        joints3d, _ = forward()
        loss = reproj_loss(joints3d)
        loss.backward()
        opt1.step()

    # ---- Stage 2: shape + restricted pose (+ cameras refined) ----
    opt2 = torch.optim.Adam([betas, pose_free, global_orient] + cams, lr=0.02)
    for _ in range(STAGE2_STEPS):
        opt2.zero_grad()
        joints3d, vertices = forward()
        loss = (
            W_REPROJ * reproj_loss(joints3d)
            + W_SHAPE * (betas**2).sum()
            + W_POSE * (pose_free**2).sum()
            + W_HEIGHT * (mesh_height(vertices) - target_height) ** 2
        )
        loss.backward()
        opt2.step()

    with torch.no_grad():
        joints3d, vertices = forward()
        # confidence: map final mean reprojection error to 0-1
        err = float(reproj_loss(joints3d))
        confidence = float(np.clip(1.0 - np.sqrt(err) / 0.1, 0.0, 1.0))
        # scale vertices so stature exactly matches the stated height
        v = vertices.cpu().numpy()
        h = v[:, 1].max() - v[:, 1].min()
        if h > 1e-6:
            v = v * (target_height / h)

    return FitResult(
        betas=betas.detach().cpu().numpy()[0],
        vertices=v,
        faces=model.faces.astype(np.int64),
        confidence=confidence,
    )
