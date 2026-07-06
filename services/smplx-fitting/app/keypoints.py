"""BlazePose (MediaPipe, 33 keypoints) -> SMPL-X joint correspondence.

SMPL-X body joint order (first 22):
  0 pelvis, 1 l_hip, 2 r_hip, 3 spine1, 4 l_knee, 5 r_knee, 6 spine2,
  7 l_ankle, 8 r_ankle, 9 spine3, 10 l_foot, 11 r_foot, 12 neck,
  13 l_collar, 14 r_collar, 15 head, 16 l_shoulder, 17 r_shoulder,
  18 l_elbow, 19 r_elbow, 20 l_wrist, 21 r_wrist
"""

import numpy as np

# (blazepose_index, smplx_joint_index)
BLAZE_TO_SMPLX: list[tuple[int, int]] = [
    (11, 16),  # left shoulder
    (12, 17),  # right shoulder
    (13, 18),  # left elbow
    (14, 19),  # right elbow
    (15, 20),  # left wrist
    (16, 21),  # right wrist
    (23, 1),   # left hip
    (24, 2),   # right hip
    (25, 4),   # left knee
    (26, 5),   # right knee
    (27, 7),   # left ankle
    (28, 8),   # right ankle
    (0, 15),   # nose ~ head
]

MIN_VISIBILITY = 0.5


def extract_targets(keypoints: list) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Build (target_2d[N,2], weights[N], smplx_indices[N]) from 33 keypoints.

    Only correspondences with visibility >= MIN_VISIBILITY are kept; each is
    weighted by its visibility so borderline detections pull less.
    Input keypoints are normalized [0,1] image coords (y down).
    """
    pts, weights, idx = [], [], []
    for blaze_i, smplx_i in BLAZE_TO_SMPLX:
        kp = keypoints[blaze_i]
        if kp.visibility < MIN_VISIBILITY:
            continue
        pts.append([kp.x, kp.y])
        weights.append(kp.visibility)
        idx.append(smplx_i)
    return (
        np.asarray(pts, dtype=np.float32),
        np.asarray(weights, dtype=np.float32),
        np.asarray(idx, dtype=np.int64),
    )
