"""Body measurements extracted directly from the fitted SMPL-X mesh.

Unlike the web app's heuristic (ellipse approximation from silhouette widths),
these are true cross-section perimeters of the 3D mesh, sliced at the same
stature fractions the app uses (lib/pose/measurements.ts FRAC).
"""

import numpy as np
import trimesh

# Stature fractions — keep in sync with the web app
FRAC = {"chest": 0.72, "waist": 0.63, "hip": 0.52}


def slice_perimeter(mesh: trimesh.Trimesh, y: float) -> float | None:
    """Perimeter (meters) of the torso cross-section at height y.

    Takes the largest closed loop of the plane section, which is the torso
    (arms in A-pose can produce small extra loops at chest height).
    """
    section = mesh.section(plane_origin=[0, y, 0], plane_normal=[0, 1, 0])
    if section is None:
        return None
    planar, _ = section.to_2D()
    best = 0.0
    for poly in planar.polygons_closed:
        if poly is not None and poly.length > best:
            best = poly.length
    return best if best > 0 else None


def measure(vertices: np.ndarray, faces: np.ndarray, height_cm: float) -> dict:
    """Chest / waist / hips circumferences (cm) from the fitted mesh."""
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    y_min = float(vertices[:, 1].min())
    stature = float(vertices[:, 1].max()) - y_min

    out = {"height": round(height_cm)}
    for name, frac in (("chest", FRAC["chest"]), ("waist", FRAC["waist"]), ("hips", FRAC["hip"])):
        p = slice_perimeter(mesh, y_min + stature * frac)
        out[name] = round(p * 100) if p else 0
    return out
