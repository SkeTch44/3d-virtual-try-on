'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import { ELLIPSE_RATIO, type BodyProfile } from '@/lib/body'

const MANNEQUIN = '#b9b3a8'

type Props = {
  body: BodyProfile
  wireframe?: boolean
  opacity?: number
}

export function AvatarModel({ body, wireframe = false, opacity = 1 }: Props) {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: MANNEQUIN,
        roughness: 0.72,
        metalness: 0.05,
        wireframe,
        transparent: opacity < 1,
        opacity,
      }),
    [wireframe, opacity],
  )

  const torso = useMemo(() => {
    const points: THREE.Vector2[] = []
    const yStart = body.hipY * 0.6
    const yEnd = body.neckY
    const steps = 36
    for (let s = 0; s <= steps; s++) {
      const y = yStart + ((yEnd - yStart) * s) / steps
      points.push(new THREE.Vector2(Math.max(0.015, body.halfWidthAt(y)), y))
    }
    const geo = new THREE.LatheGeometry(points, 40)
    geo.scale(1, 1, ELLIPSE_RATIO)
    geo.computeVertexNormals()
    return geo
  }, [body])

  const legLen = body.hipY * 0.98
  const armGeos = useMemo(
    () =>
      body.arms.map((arm) => {
        const start = new THREE.Vector3(...arm.start)
        const end = new THREE.Vector3(...arm.end)
        const dir = end.clone().sub(start)
        const len = dir.length()
        const mid = start.clone().add(end).multiplyScalar(0.5)
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize().negate(),
        )
        return { len, mid, quat, r: arm.r }
      }),
    [body],
  )

  return (
    <group>
      {/* head */}
      <mesh position={[0, body.headCenterY, 0]} material={material}>
        <sphereGeometry args={[body.headR, 32, 24]} />
      </mesh>
      {/* neck */}
      <mesh position={[0, (body.neckY + body.headCenterY - body.headR * 0.6) / 2, 0]} material={material}>
        <cylinderGeometry args={[body.neckA * 0.9, body.neckA, body.headCenterY - body.neckY, 20]} />
      </mesh>
      {/* torso */}
      <mesh geometry={torso} material={material} />
      {/* shoulders */}
      {[-1, 1].map((side) => (
        <mesh
          key={`sh${side}`}
          position={[side * body.shoulderA * 0.86, body.shoulderY - 0.01, 0]}
          material={material}
        >
          <sphereGeometry args={[body.arms[0].r * 1.15, 20, 16]} />
        </mesh>
      ))}
      {/* arms */}
      {armGeos.map((arm, idx) => (
        <mesh key={`arm${idx}`} position={arm.mid} quaternion={arm.quat} material={material}>
          <capsuleGeometry args={[arm.r, arm.len - arm.r * 2, 6, 16]} />
        </mesh>
      ))}
      {/* legs */}
      {[-1, 1].map((side) => (
        <mesh key={`leg${side}`} position={[side * body.legOffsetX, legLen / 2 + 0.02, 0]} material={material}>
          <capsuleGeometry args={[body.legR, legLen - body.legR * 2, 6, 16]} />
        </mesh>
      ))}
      {/* feet */}
      {[-1, 1].map((side) => (
        <mesh
          key={`foot${side}`}
          position={[side * body.legOffsetX, 0.03, 0.035]}
          rotation={[Math.PI / 2, 0, 0]}
          material={material}
        >
          <capsuleGeometry args={[0.038, 0.09, 4, 12]} />
        </mesh>
      ))}
    </group>
  )
}
