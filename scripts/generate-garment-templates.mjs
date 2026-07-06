#!/usr/bin/env node
/**
 * Garment template generator — authors real 3D garment meshes with proper
 * garment topology (sleeves, split legs, flared hems, necklines) and writes
 * them as valid glTF 2.0 binary (.glb) files into public/garments/.
 *
 * Templates are authored in canonical space: a 175cm body with M-size
 * measurements (chest 100 / waist 96 / hips 102). The runtime loader scales
 * them to the user's avatar and the selected size-chart entry.
 *
 * Metadata (pins, seams, canonical dims) is stored in the glTF root `extras`.
 *
 * Usage: node scripts/generate-garment-templates.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'garments')

// ---------------------------------------------------------------------------
// Canonical body (mirrors lib/body.ts with M-size measurements)
// ---------------------------------------------------------------------------

const CANON = { height: 1.75, chest: 100, waist: 96, hips: 102 }
const ELLIPSE_RATIO = 0.62
const LM = { hip: 0.52, waist: 0.63, chest: 0.72, shoulder: 0.805, neck: 0.85 }

const circToHalfWidth = (cm) => cm / 100 / 5.16
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (t) => t * t * (3 - 2 * t)

const H = CANON.height
const hipY = LM.hip * H
const waistY = LM.waist * H
const chestY = LM.chest * H
const shoulderY = LM.shoulder * H
const neckY = LM.neck * H

const hipA = circToHalfWidth(CANON.hips)
const waistA = circToHalfWidth(CANON.waist)
const chestA = circToHalfWidth(CANON.chest)
const shoulderA = chestA * 1.12
const neckA = 0.055 * H

function bodyHalfWidthAt(y) {
  if (y <= hipY) {
    const t = Math.min(1, (hipY - y) / (hipY * 0.35))
    return lerp(hipA, hipA * 0.72, smooth(t))
  }
  if (y <= waistY) return lerp(hipA, waistA, smooth((y - hipY) / (waistY - hipY)))
  if (y <= chestY) return lerp(waistA, chestA, smooth((y - waistY) / (chestY - waistY)))
  if (y <= shoulderY) return lerp(chestA, shoulderA, smooth((y - chestY) / (shoulderY - chestY)))
  if (y <= neckY) return lerp(shoulderA, neckA, smooth((y - shoulderY) / (neckY - shoulderY)))
  return neckA
}

// arm capsules (A-pose, mirrors lib/body.ts)
const armR = 0.042 * H
const armLen = 0.34 * H
const SPREAD = 0.32
const ARMS = [-1, 1].map((side) => {
  const sx = side * (shoulderA * 0.92)
  const sy = shoulderY - armR * 0.4
  return {
    side,
    start: [sx, sy, 0],
    end: [sx + side * armLen * SPREAD, sy - armLen * 0.94, 0],
    r: armR,
  }
})

const legR = 0.055 * H
const legOffsetX = hipA * 0.48

// ---------------------------------------------------------------------------
// Mesh builder
// ---------------------------------------------------------------------------

class MeshBuilder {
  constructor() {
    this.positions = [] // flat xyz
    this.indices = []
    this.pins = [] // { i, kind, theta, y, t }
    this.seams = [] // flat vertex-index pairs
  }

  get vertexCount() {
    return this.positions.length / 3
  }

  addVertex(x, y, z) {
    this.positions.push(x, y, z)
    return this.vertexCount - 1
  }

  /**
   * Add a tube of `rows` rings x `cols` columns around the Y axis.
   * profile(rowT) -> { y, a, b, cx } — ellipse half-widths + center x offset.
   * Returns array of ring vertex-index arrays.
   */
  addTube(rows, cols, profile) {
    const rings = []
    for (let r = 0; r < rows; r++) {
      const t = rows === 1 ? 0 : r / (rows - 1)
      const { y, a, b, cx = 0 } = profile(t)
      const ring = []
      for (let c = 0; c < cols; c++) {
        const theta = (c / cols) * Math.PI * 2
        ring.push(this.addVertex(cx + Math.cos(theta) * a, y, Math.sin(theta) * b))
      }
      rings.push(ring)
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const a0 = rings[r][c]
        const a1 = rings[r][(c + 1) % cols]
        const b0 = rings[r + 1][c]
        const b1 = rings[r + 1][(c + 1) % cols]
        this.indices.push(a0, b0, a1, a1, b0, b1)
      }
    }
    return rings
  }

  /**
   * Add a sleeve tube along an arm capsule axis.
   * Returns ring index arrays (ring 0 = root, at the shoulder).
   */
  addLimbTube(arm, rows, cols, t0, t1, r0, r1) {
    const ax = [arm.end[0] - arm.start[0], arm.end[1] - arm.start[1], 0]
    const alen = Math.hypot(ax[0], ax[1])
    const axis = [ax[0] / alen, ax[1] / alen, 0]
    // u ⊥ axis in the XY plane, v = world Z
    const u = [-axis[1], axis[0], 0]
    const rings = []
    for (let r = 0; r < rows; r++) {
      const rt = rows === 1 ? 0 : r / (rows - 1)
      const t = lerp(t0, t1, rt)
      const rad = lerp(r0, r1, rt)
      const cx = arm.start[0] + ax[0] * t
      const cy = arm.start[1] + ax[1] * t
      const ring = []
      for (let c = 0; c < cols; c++) {
        const theta = (c / cols) * Math.PI * 2
        const ox = u[0] * Math.cos(theta) * rad
        const oy = u[1] * Math.cos(theta) * rad
        const oz = Math.sin(theta) * rad
        ring.push(this.addVertex(cx + ox, cy + oy, oz))
      }
      rings.push(ring)
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const a0 = rings[r][c]
        const a1 = rings[r][(c + 1) % cols]
        const b0 = rings[r + 1][c]
        const b1 = rings[r + 1][(c + 1) % cols]
        this.indices.push(a0, b0, a1, a1, b0, b1)
      }
    }
    return rings
  }

  pinRing(ring, kind, extra = {}) {
    const n = ring.length
    for (let c = 0; c < n; c++) {
      const theta = (c / n) * Math.PI * 2
      const i = ring[c]
      const y = this.positions[i * 3 + 1] / H
      this.pins.push({ i, kind, theta, y, t: extra.t ?? 0 })
    }
  }

  /** Connect each vertex in ringA to the nearest vertex in ringB (seam constraints). */
  seamRings(ringA, ringB) {
    for (const ia of ringA) {
      const ax = this.positions[ia * 3]
      const ay = this.positions[ia * 3 + 1]
      const az = this.positions[ia * 3 + 2]
      let best = ringB[0]
      let bestD = Infinity
      for (const ib of ringB) {
        const d = Math.hypot(
          this.positions[ib * 3] - ax,
          this.positions[ib * 3 + 1] - ay,
          this.positions[ib * 3 + 2] - az,
        )
        if (d < bestD) {
          bestD = d
          best = ib
        }
      }
      this.seams.push(ia, best)
    }
  }
}

// ---------------------------------------------------------------------------
// Garment authors
// ---------------------------------------------------------------------------

/** Ellipse profile at body height y with `easeCm` extra circumference. */
function garmentAB(y, easeCm, widen = 1) {
  const bodyCirc = bodyHalfWidthAt(y) * 5.16 * 100
  const a = circToHalfWidth((bodyCirc + easeCm) * widen)
  return { a, b: a * ELLIPSE_RATIO }
}

function buildTop({ topF, bottomF, rows, cols, easeCm, sleeveRows, sleeveT1, sleeveEase, flare = 0 }) {
  const m = new MeshBuilder()
  const topYw = topF * H
  const bottomYw = bottomF * H

  const torso = m.addTube(rows, cols, (t) => {
    const y = lerp(topYw, bottomYw, t)
    const widen = flare > 0 ? 1 + flare * smooth(t) : 1
    const { a, b } = garmentAB(y, easeCm, widen)
    return { y, a, b }
  })
  m.pinRing(torso[0], 'torso')

  if (sleeveRows > 0) {
    for (let s = 0; s < 2; s++) {
      const arm = ARMS[s]
      const kind = s === 0 ? 'armL' : 'armR'
      const rings = m.addLimbTube(arm, sleeveRows, 12, 0.04, sleeveT1, armR + sleeveEase, armR + sleeveEase * 0.75)
      // pin sleeve root ring onto the arm capsule
      const n = rings[0].length
      for (let c = 0; c < n; c++) {
        const theta = (c / n) * Math.PI * 2
        m.pins.push({ i: rings[0][c], kind, theta, y: 0, t: 0.04 })
      }
      // seam the sleeve root to the torso shoulder area for cohesion
      m.seamRings(rings[0], torso[0].concat(torso[Math.min(1, torso.length - 1)]))
    }
  }
  return m
}

function buildSkirtLike({ topF, bottomF, rows, cols, easeCm, flare }) {
  const m = new MeshBuilder()
  const topYw = topF * H
  const bottomYw = bottomF * H
  const rings = m.addTube(rows, cols, (t) => {
    const y = lerp(topYw, bottomYw, t)
    const widen = 1 + flare * smooth(t)
    const { a, b } = garmentAB(Math.max(y, bottomYw), easeCm, widen)
    // below the hip the body tapers; keep the garment falling straight-to-flared
    const aMin = garmentAB(hipY, easeCm, 1).a
    return { y, a: Math.max(a, aMin * widen), b: Math.max(b, aMin * widen * ELLIPSE_RATIO) }
  })
  m.pinRing(rings[0], 'torso')
  return m
}

function buildJeans({ waistF, crotchF, ankleF, cols, legCols, easeCm }) {
  const m = new MeshBuilder()
  const waistYw = waistF * H
  const crotchYw = crotchF * H
  const ankleYw = ankleF * H

  // hip/yoke section: full ellipse from waistband to crotch
  const hip = m.addTube(5, cols, (t) => {
    const y = lerp(waistYw, crotchYw, t)
    const { a, b } = garmentAB(y, easeCm)
    return { y, a, b }
  })
  m.pinRing(hip[0], 'torso')

  // two legs: circular tubes from crotch to ankle
  const thighR = legR + 0.028
  const ankleR = legR + 0.012
  const legTops = []
  for (const side of [-1, 1]) {
    const rings = m.addTube(12, legCols, (t) => {
      const y = lerp(crotchYw - 0.01, ankleYw, t)
      const rad = lerp(thighR, ankleR, smooth(t))
      return { y, a: rad, b: rad, cx: side * legOffsetX }
    })
    legTops.push(rings[0])
  }
  // seam leg tops to the hip section bottom ring
  for (const top of legTops) m.seamRings(top, hip[hip.length - 1])
  return m
}

// ---------------------------------------------------------------------------
// GLB writer (minimal, valid glTF 2.0)
// ---------------------------------------------------------------------------

function writeGlb(path, mesh, extras) {
  const posArr = new Float32Array(mesh.positions)
  const idxArr = new Uint32Array(mesh.indices)

  const posBytes = Buffer.from(posArr.buffer)
  const idxBytes = Buffer.from(idxArr.buffer)
  const pad4 = (n) => (4 - (n % 4)) % 4
  const idxPad = pad4(idxBytes.length)
  const bin = Buffer.concat([posBytes, idxBytes, Buffer.alloc(idxPad)])

  const mins = [Infinity, Infinity, Infinity]
  const maxs = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < posArr.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      mins[k] = Math.min(mins[k], posArr[i + k])
      maxs[k] = Math.max(maxs[k], posArr[i + k])
    }
  }

  const json = {
    asset: { version: '2.0', generator: 'tryon-garment-template-generator' },
    extras,
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: extras.template }],
    meshes: [
      {
        name: extras.template,
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }],
      },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length, byteLength: idxBytes.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: posArr.length / 3, type: 'VEC3', min: mins, max: maxs },
      { bufferView: 1, componentType: 5125, count: idxArr.length, type: 'SCALAR' },
    ],
  }

  let jsonStr = JSON.stringify(json)
  const jsonPad = pad4(jsonStr.length)
  jsonStr += ' '.repeat(jsonPad)
  const jsonBuf = Buffer.from(jsonStr, 'utf8')

  const total = 12 + 8 + jsonBuf.length + 8 + bin.length
  const out = Buffer.alloc(total)
  let o = 0
  out.writeUInt32LE(0x46546c67, o) // magic 'glTF'
  out.writeUInt32LE(2, (o += 4))
  out.writeUInt32LE(total, (o += 4))
  out.writeUInt32LE(jsonBuf.length, (o += 4))
  out.writeUInt32LE(0x4e4f534a, (o += 4)) // 'JSON'
  jsonBuf.copy(out, (o += 4))
  o += jsonBuf.length
  out.writeUInt32LE(bin.length, o)
  out.writeUInt32LE(0x004e4942, (o += 4)) // 'BIN'
  bin.copy(out, (o += 4))

  writeFileSync(path, out)
  console.log(
    `${path.split('/').pop()}  verts=${posArr.length / 3}  tris=${idxArr.length / 3}  pins=${extras.pins.length}  seams=${extras.seams.length / 2}  ${(total / 1024).toFixed(1)}kb`,
  )
}

// ---------------------------------------------------------------------------
// Author the 6 templates
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true })

const TEMPLATES = [
  {
    id: 'tee',
    scaleBy: 'chest',
    mesh: buildTop({ topF: 0.825, bottomF: 0.56, rows: 14, cols: 32, easeCm: 6, sleeveRows: 4, sleeveT1: 0.34, sleeveEase: 0.03 }),
  },
  {
    id: 'jacket',
    scaleBy: 'chest',
    mesh: buildTop({ topF: 0.83, bottomF: 0.52, rows: 15, cols: 32, easeCm: 12, sleeveRows: 10, sleeveT1: 0.96, sleeveEase: 0.035 }),
  },
  {
    id: 'coat',
    scaleBy: 'chest',
    mesh: buildTop({ topF: 0.835, bottomF: 0.3, rows: 22, cols: 32, easeCm: 14, sleeveRows: 10, sleeveT1: 0.97, sleeveEase: 0.04, flare: 0.18 }),
  },
  {
    id: 'dress',
    scaleBy: 'chest',
    mesh: buildTop({ topF: 0.8, bottomF: 0.22, rows: 26, cols: 32, easeCm: 4, sleeveRows: 0, sleeveT1: 0, sleeveEase: 0, flare: 0.55 }),
  },
  {
    id: 'skirt',
    scaleBy: 'hips',
    mesh: buildSkirtLike({ topF: 0.62, bottomF: 0.32, rows: 13, cols: 32, easeCm: 3, flare: 0.45 }),
  },
  {
    id: 'jeans',
    scaleBy: 'hips',
    mesh: buildJeans({ waistF: 0.62, crotchF: 0.49, ankleF: 0.07, cols: 32, legCols: 14, easeCm: 4 }),
  },
]

for (const t of TEMPLATES) {
  writeGlb(join(OUT_DIR, `${t.id}.glb`), t.mesh, {
    template: t.id,
    scaleBy: t.scaleBy,
    canonical: CANON,
    pins: t.mesh.pins,
    seams: t.mesh.seams,
  })
}

console.log(`\nWrote ${TEMPLATES.length} garment templates to public/garments/`)
