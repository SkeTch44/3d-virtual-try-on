'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { collideBody, circumferenceToHalfWidth, ELLIPSE_RATIO, type BodyProfile } from '@/lib/body'
import type { Garment, SizeSpec } from '@/lib/garments'

const COLS = 40
const GRAVITY = -9.8
const DT = 1 / 60
const SUBSTEPS = 2

// heatmap ramp
const C_TIGHT = new THREE.Color('#e5484d')
const C_FIT = new THREE.Color('#46a758')
const C_LOOSE = new THREE.Color('#3f7fd6')

type Props = {
  body: BodyProfile
  garment: Garment
  size: SizeSpec
  heatmap: boolean
  /** change to re-drop the cloth */
  simKey: number
  onSettled?: () => void
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function ClothGarment({ body, garment, size, heatmap, simKey, onSettled }: Props) {
  const meshRef = useRef<THREE.Mesh>(null)
  const settledRef = useRef(false)
  const frameRef = useRef(0)

  const sim = useMemo(() => {
    settledRef.current = false
    frameRef.current = 0

    const topY = garment.topY * body.heightM
    const bottomY = garment.bottomY * body.heightM
    const length = topY - bottomY
    const rows = Math.max(10, Math.min(26, Math.round(length / 0.032)))
    const count = rows * COLS

    // rest half-width per row, interpolated through the size chart zones
    const restA = new Float32Array(rows)
    for (let r = 0; r < rows; r++) {
      const y = topY - (length * r) / (rows - 1)
      let circ: number
      if (y >= body.chestY) circ = size.chest
      else if (y >= body.waistY) {
        circ = lerp(size.waist, size.chest, (y - body.waistY) / (body.chestY - body.waistY))
      } else if (y >= body.hipY) {
        circ = lerp(size.hips, size.waist, (y - body.hipY) / (body.waistY - body.hipY))
      } else {
        // below hips the garment keeps (or flares from) the hip measurement
        const flare = garment.id === 'dress' ? 1 + (0.5 * (body.hipY - y)) / body.hipY : 1
        circ = size.hips * flare
      }
      restA[r] = circumferenceToHalfWidth(circ)
    }

    const pos = new Float32Array(count * 3)
    const prev = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)

    for (let r = 0; r < rows; r++) {
      const y = topY - (length * r) / (rows - 1)
      const a = restA[r]
      const b = a * ELLIPSE_RATIO
      for (let c = 0; c < COLS; c++) {
        const theta = (c / COLS) * Math.PI * 2
        const i = (r * COLS + c) * 3
        // drop-in: start slightly inflated and above final position
        const inflate = r === 0 ? 1 : 1.12
        pos[i] = Math.cos(theta) * a * inflate
        pos[i + 1] = y + (r === 0 ? 0 : 0.05)
        pos[i + 2] = Math.sin(theta) * b * inflate
        prev[i] = pos[i]
        prev[i + 1] = pos[i + 1]
        prev[i + 2] = pos[i + 2]
      }
    }

    // constraints: [i, j, restLength]
    const constraints: number[] = []
    const addC = (p1: number, p2: number) => {
      const i = p1 * 3
      const j = p2 * 3
      const d = Math.hypot(pos[i] - pos[j], pos[i + 1] - pos[j + 1], pos[i + 2] - pos[j + 2])
      constraints.push(p1, p2, d)
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = r * COLS + c
        addC(p, r * COLS + ((c + 1) % COLS)) // ring
        if (r < rows - 1) {
          addC(p, (r + 1) * COLS + c) // vertical
          addC(p, (r + 1) * COLS + ((c + 1) % COLS)) // shear
        }
      }
    }

    // indexed geometry
    const indices: number[] = []
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < COLS; c++) {
        const a0 = r * COLS + c
        const a1 = r * COLS + ((c + 1) % COLS)
        const b0 = (r + 1) * COLS + c
        const b1 = (r + 1) * COLS + ((c + 1) % COLS)
        indices.push(a0, b0, a1, a1, b0, b1)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    // pinned neckline ring follows the body
    const pinR = new Float32Array(COLS * 3)
    const pinA = Math.max(body.halfWidthAt(topY) + 0.012, restA[0] * 0.9)
    for (let c = 0; c < COLS; c++) {
      const theta = (c / COLS) * Math.PI * 2
      pinR[c * 3] = Math.cos(theta) * pinA
      pinR[c * 3 + 1] = topY
      pinR[c * 3 + 2] = Math.sin(theta) * pinA * ELLIPSE_RATIO
    }

    return { pos, prev, colors, constraints: new Float32Array(constraints), geometry, rows, restA, pinR, topY }
  }, [body, garment, size, simKey])

  useFrame(() => {
    const { pos, prev, colors, constraints, geometry, rows, restA, pinR } = sim
    const fabric = garment.fabric
    const stiffness = fabric.stiffness
    const damping = fabric.damping
    const iterations = 3 + Math.round(stiffness * 3)
    const offset = 0.008
    frameRef.current++

    for (let step = 0; step < SUBSTEPS; step++) {
      const dt = DT / SUBSTEPS
      const g = GRAVITY * dt * dt

      // verlet integrate (skip pinned row 0)
      for (let p = COLS; p < (pos.length / 3); p++) {
        const i = p * 3
        const vx = (pos[i] - prev[i]) * damping
        const vy = (pos[i + 1] - prev[i + 1]) * damping
        const vz = (pos[i + 2] - prev[i + 2]) * damping
        prev[i] = pos[i]
        prev[i + 1] = pos[i + 1]
        prev[i + 2] = pos[i + 2]
        pos[i] += vx
        pos[i + 1] += vy + g
        pos[i + 2] += vz
      }

      // constraint relaxation
      for (let iter = 0; iter < iterations; iter++) {
        for (let k = 0; k < constraints.length; k += 3) {
          const p1 = constraints[k] * 3
          const p2 = constraints[k + 1] * 3
          const rest = constraints[k + 2]
          const dx = pos[p2] - pos[p1]
          const dy = pos[p2 + 1] - pos[p1 + 1]
          const dz = pos[p2 + 2] - pos[p1 + 2]
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (d < 1e-8) continue
          const diff = ((d - rest) / d) * 0.5 * stiffness
          const ox = dx * diff
          const oy = dy * diff
          const oz = dz * diff
          const pinned1 = p1 < COLS * 3
          const pinned2 = p2 < COLS * 3
          if (!pinned1) {
            pos[p1] += ox * (pinned2 ? 2 : 1)
            pos[p1 + 1] += oy * (pinned2 ? 2 : 1)
            pos[p1 + 2] += oz * (pinned2 ? 2 : 1)
          }
          if (!pinned2) {
            pos[p2] -= ox * (pinned1 ? 2 : 1)
            pos[p2 + 1] -= oy * (pinned1 ? 2 : 1)
            pos[p2 + 2] -= oz * (pinned1 ? 2 : 1)
          }
        }
        // re-pin neckline
        for (let c = 0; c < COLS; c++) {
          pos[c * 3] = pinR[c * 3]
          pos[c * 3 + 1] = pinR[c * 3 + 1]
          pos[c * 3 + 2] = pinR[c * 3 + 2]
        }
      }

      // body collision
      for (let p = COLS; p < pos.length / 3; p++) {
        collideBody(pos, p * 3, body, offset)
      }
    }

    // heatmap vertex colors: ring strain (tight) vs body gap (loose)
    if (heatmap) {
      const tmp = new THREE.Color()
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < COLS; c++) {
          const p = r * COLS + c
          const i = p * 3
          const y = pos[i + 1]
          const bodyA = body.halfWidthAt(Math.max(0.12, Math.min(y, body.neckY)))
          const restHW = restA[r]
          // tightness: body wider than garment rest => fabric under strain
          const strain = (bodyA + offset - restHW) / restHW
          if (strain > 0.005) {
            const t = Math.min(1, strain / 0.12)
            tmp.copy(C_FIT).lerp(C_TIGHT, t)
          } else {
            // looseness: radial gap between cloth and body surface
            const radial = Math.hypot(pos[i], pos[i + 2] / ELLIPSE_RATIO)
            const gap = radial - bodyA
            const t = Math.min(1, Math.max(0, (gap - 0.02) / 0.09))
            tmp.copy(C_FIT).lerp(C_LOOSE, t)
          }
          colors[i] = tmp.r
          colors[i + 1] = tmp.g
          colors[i + 2] = tmp.b
        }
      }
      geometry.attributes.color.needsUpdate = true
    }

    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()

    if (!settledRef.current && frameRef.current > 90) {
      settledRef.current = true
      onSettled?.()
    }
  })

  return (
    <mesh ref={meshRef} geometry={sim.geometry} castShadow>
      <meshStandardMaterial
        color={heatmap ? '#ffffff' : garment.color}
        vertexColors={heatmap}
        roughness={garment.fabric.stiffness > 0.8 ? 0.85 : 0.55}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
