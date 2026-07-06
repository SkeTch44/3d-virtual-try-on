'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { collideBody, ELLIPSE_RATIO, type BodyProfile } from '@/lib/body'
import { loadGarmentTemplate, type GarmentTemplate } from '@/lib/garment-template'
import type { Garment, SizeSpec } from '@/lib/garments'
import { ClothGarment } from './cloth-garment'

const GRAVITY = -9.8
const DT = 1 / 60
const SUBSTEPS = 2

const C_TIGHT = new THREE.Color('#e5484d')
const C_FIT = new THREE.Color('#46a758')
const C_LOOSE = new THREE.Color('#3f7fd6')

// canonical landmark fractions (must match the generator)
const LM = { hip: 0.52, waist: 0.63, chest: 0.72 }

type Props = {
  body: BodyProfile
  garment: Garment
  size: SizeSpec
  heatmap: boolean
  simKey: number
  onSettled?: () => void
}

/**
 * Template-backed cloth simulation. Loads the authored GLB garment template
 * (real topology: sleeves, split legs, flared hems), scales it to the avatar
 * and selected size, then drapes it with a Verlet/XPBD-style solver.
 * Falls back to the procedural ClothGarment while loading or on failure.
 */
export function ClothGarmentMesh(props: Props) {
  const { garment } = props
  const [template, setTemplate] = useState<GarmentTemplate | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setTemplate(null)
    setFailed(false)
    loadGarmentTemplate(garment.templateId)
      .then((t) => {
        if (alive) setTemplate(t)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [garment.templateId])

  if (failed) return <ClothGarment {...props} />
  if (!template) return null
  return <TemplateCloth {...props} template={template} />
}

function TemplateCloth({
  body,
  garment,
  size,
  heatmap,
  simKey,
  onSettled,
  template,
}: Props & { template: GarmentTemplate }) {
  const settledRef = useRef(false)
  const frameRef = useRef(0)

  const sim = useMemo(() => {
    settledRef.current = false
    frameRef.current = 0

    const { canonical, pins, seams } = template
    const count = template.positions.length / 3
    const yScale = body.heightM / canonical.height

    // radial size ratio by height band (chest / waist / hips zones)
    const rChest = size.chest / canonical.chest
    const rWaist = size.waist / canonical.waist
    const rHips = size.hips / canonical.hips
    const ratioAt = (yF: number) => {
      if (yF >= LM.chest) return rChest
      if (yF >= LM.waist) return rWaist + ((rChest - rWaist) * (yF - LM.waist)) / (LM.chest - LM.waist)
      if (yF >= LM.hip) return rHips + ((rWaist - rHips) * (yF - LM.hip)) / (LM.waist - LM.hip)
      return rHips
    }

    // scale template into avatar space
    const pos = new Float32Array(count * 3)
    const prev = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    for (let p = 0; p < count; p++) {
      const i = p * 3
      const yF = template.positions[i + 1] / canonical.height
      const r = ratioAt(yF)
      pos[i] = template.positions[i] * r
      pos[i + 1] = template.positions[i + 1] * yScale
      pos[i + 2] = template.positions[i + 2] * r
      prev[i] = pos[i]
      prev[i + 1] = pos[i + 1]
      prev[i + 2] = pos[i + 2]
    }

    // constraints: unique mesh edges + authored seams
    const edgeSet = new Set<number>()
    const constraints: number[] = []
    const addEdge = (p1: number, p2: number) => {
      const key = p1 < p2 ? p1 * count + p2 : p2 * count + p1
      if (edgeSet.has(key)) return
      edgeSet.add(key)
      const i = p1 * 3
      const j = p2 * 3
      const d = Math.hypot(pos[i] - pos[j], pos[i + 1] - pos[j + 1], pos[i + 2] - pos[j + 2])
      constraints.push(p1, p2, d)
    }
    const idx = template.indices
    for (let k = 0; k < idx.length; k += 3) {
      addEdge(idx[k], idx[k + 1])
      addEdge(idx[k + 1], idx[k + 2])
      addEdge(idx[k + 2], idx[k])
    }
    for (let k = 0; k < seams.length; k += 2) addEdge(seams[k], seams[k + 1])

    // per-vertex incident constraint counts (for strain heatmap)
    const incident = new Uint8Array(count)
    for (let k = 0; k < constraints.length; k += 3) {
      incident[constraints[k]]++
      incident[constraints[k + 1]]++
    }

    // pin targets in avatar space
    const pinned = new Uint8Array(count)
    const pinTargets: { i: number; x: number; y: number; z: number }[] = []
    const off = 0.008
    for (const pin of pins) {
      pinned[pin.i] = 1
      if (pin.kind === 'torso') {
        const yW = pin.y * body.heightM
        const a = body.halfWidthAt(yW) + off * 1.5
        pinTargets.push({
          i: pin.i,
          x: Math.cos(pin.theta) * a,
          y: yW,
          z: Math.sin(pin.theta) * a * ELLIPSE_RATIO,
        })
      } else {
        const arm = body.arms[pin.kind === 'armL' ? 0 : 1]
        const ax = arm.end[0] - arm.start[0]
        const ay = arm.end[1] - arm.start[1]
        const alen = Math.hypot(ax, ay)
        const nx = ax / alen
        const ny = ay / alen
        // u ⊥ axis in XY, v = world Z (matches generator basis)
        const ux = -ny
        const uy = nx
        const rad = arm.r + 0.014
        const cx = arm.start[0] + ax * pin.t
        const cy = arm.start[1] + ay * pin.t
        pinTargets.push({
          i: pin.i,
          x: cx + ux * Math.cos(pin.theta) * rad,
          y: cy + uy * Math.cos(pin.theta) * rad,
          z: Math.sin(pin.theta) * rad,
        })
      }
    }

    // move pinned verts to their targets immediately
    for (const t of pinTargets) {
      pos[t.i * 3] = t.x
      pos[t.i * 3 + 1] = t.y
      pos[t.i * 3 + 2] = t.z
      prev[t.i * 3] = t.x
      prev[t.i * 3 + 1] = t.y
      prev[t.i * 3 + 2] = t.z
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setIndex(new THREE.BufferAttribute(idx, 1))
    geometry.computeVertexNormals()

    return {
      pos,
      prev,
      colors,
      constraints: new Float32Array(constraints),
      incident,
      pinned,
      pinTargets,
      geometry,
      count,
    }
  }, [body, garment, size, simKey, template])

  useFrame(() => {
    const { pos, prev, colors, constraints, incident, pinned, pinTargets, geometry, count } = sim
    const fabric = garment.fabric
    const stiffness = fabric.stiffness
    const damping = fabric.damping
    const iterations = 3 + Math.round(stiffness * 3)
    const offset = 0.008
    frameRef.current++

    for (let step = 0; step < SUBSTEPS; step++) {
      const dt = DT / SUBSTEPS
      const g = GRAVITY * dt * dt

      for (let p = 0; p < count; p++) {
        if (pinned[p]) continue
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

      for (let iter = 0; iter < iterations; iter++) {
        for (let k = 0; k < constraints.length; k += 3) {
          const v1 = constraints[k]
          const v2 = constraints[k + 1]
          const rest = constraints[k + 2]
          const p1 = v1 * 3
          const p2 = v2 * 3
          const dx = pos[p2] - pos[p1]
          const dy = pos[p2 + 1] - pos[p1 + 1]
          const dz = pos[p2 + 2] - pos[p1 + 2]
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (d < 1e-8) continue
          const diff = ((d - rest) / d) * 0.5 * stiffness
          const ox = dx * diff
          const oy = dy * diff
          const oz = dz * diff
          const pin1 = pinned[v1]
          const pin2 = pinned[v2]
          if (!pin1) {
            const w = pin2 ? 2 : 1
            pos[p1] += ox * w
            pos[p1 + 1] += oy * w
            pos[p1 + 2] += oz * w
          }
          if (!pin2) {
            const w = pin1 ? 2 : 1
            pos[p2] -= ox * w
            pos[p2 + 1] -= oy * w
            pos[p2 + 2] -= oz * w
          }
        }
        for (const t of pinTargets) {
          pos[t.i * 3] = t.x
          pos[t.i * 3 + 1] = t.y
          pos[t.i * 3 + 2] = t.z
        }
      }

      for (let p = 0; p < count; p++) {
        if (pinned[p]) continue
        collideBody(pos, p * 3, body, offset)
      }
    }

    // strain-based heatmap: edge elongation (tight) / radial gap (loose)
    if (heatmap) {
      const tmp = new THREE.Color()
      const strain = new Float32Array(count)
      for (let k = 0; k < constraints.length; k += 3) {
        const v1 = constraints[k]
        const v2 = constraints[k + 1]
        const rest = constraints[k + 2]
        const p1 = v1 * 3
        const p2 = v2 * 3
        const d = Math.hypot(pos[p2] - pos[p1], pos[p2 + 1] - pos[p1 + 1], pos[p2 + 2] - pos[p1 + 2])
        const e = (d - rest) / rest
        strain[v1] += e
        strain[v2] += e
      }
      for (let p = 0; p < count; p++) {
        const i = p * 3
        const e = incident[p] > 0 ? strain[p] / incident[p] : 0
        if (e > 0.008) {
          const t = Math.min(1, e / 0.1)
          tmp.copy(C_FIT).lerp(C_TIGHT, t)
        } else {
          const y = pos[i + 1]
          const bodyA = body.halfWidthAt(Math.max(0.12, Math.min(y, body.neckY)))
          const radial = Math.hypot(pos[i], pos[i + 2] / ELLIPSE_RATIO)
          const gap = radial - bodyA
          const t = Math.min(1, Math.max(0, (gap - 0.025) / 0.1))
          tmp.copy(C_FIT).lerp(C_LOOSE, t)
        }
        colors[i] = tmp.r
        colors[i + 1] = tmp.g
        colors[i + 2] = tmp.b
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
    <mesh geometry={sim.geometry} castShadow>
      <meshStandardMaterial
        key={heatmap ? 'heatmap' : 'plain'}
        color={heatmap ? '#ffffff' : garment.color}
        vertexColors={heatmap}
        roughness={garment.fabric.stiffness > 0.8 ? 0.85 : 0.55}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
