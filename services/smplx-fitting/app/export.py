"""GLB export of the fitted SMPL-X mesh via trimesh."""

import numpy as np
import trimesh


def to_glb(vertices: np.ndarray, faces: np.ndarray) -> bytes:
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    mesh.visual = trimesh.visual.ColorVisuals(
        mesh, vertex_colors=np.tile([200, 180, 160, 255], (len(vertices), 1))
    )
    scene = trimesh.Scene({"body": mesh})
    return scene.export(file_type="glb")
