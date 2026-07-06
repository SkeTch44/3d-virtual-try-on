/**
 * Garment template loader — parses the GLB garment templates authored by
 * scripts/generate-garment-templates.mjs (positions + indices + pin/seam
 * metadata in glTF root extras).
 *
 * Templates live in public/garments/*.glb and are cached per session.
 */

export type PinKind = 'torso' | 'armL' | 'armR'

export type TemplatePin = {
  /** vertex index */
  i: number
  kind: PinKind
  /** angle around the torso ellipse / limb axis */
  theta: number
  /** height as a fraction of canonical body height (torso pins) */
  y: number
  /** param along the limb axis 0..1 (arm pins) */
  t: number
}

export type GarmentTemplate = {
  id: string
  /** which size-chart measurement drives the radial scale */
  scaleBy: 'chest' | 'hips'
  canonical: { height: number; chest: number; waist: number; hips: number }
  positions: Float32Array
  indices: Uint32Array
  pins: TemplatePin[]
  /** flat [a, b, a, b, ...] extra seam constraint pairs */
  seams: Uint32Array
}

type GltfJson = {
  extras: {
    template: string
    scaleBy: 'chest' | 'hips'
    canonical: GarmentTemplate['canonical']
    pins: TemplatePin[]
    seams: number[]
  }
  bufferViews: { byteOffset?: number; byteLength: number }[]
  accessors: { bufferView: number; componentType: number; count: number; type: string }[]
  meshes: { primitives: { attributes: { POSITION: number }; indices: number }[] }[]
}

/** Parse a GLB produced by the template generator. */
export function parseGarmentGlb(buffer: ArrayBuffer): GarmentTemplate {
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file')

  const jsonLen = view.getUint32(12, true)
  const jsonStart = 20
  const jsonText = new TextDecoder().decode(new Uint8Array(buffer, jsonStart, jsonLen))
  const json = JSON.parse(jsonText) as GltfJson

  const binStart = jsonStart + jsonLen + 8
  const prim = json.meshes[0].primitives[0]

  const readAccessor = (accessorIndex: number) => {
    const acc = json.accessors[accessorIndex]
    const bv = json.bufferViews[acc.bufferView]
    const offset = binStart + (bv.byteOffset ?? 0)
    if (acc.componentType === 5126) {
      // float32 VEC3
      return new Float32Array(buffer.slice(offset, offset + acc.count * 12))
    }
    if (acc.componentType === 5125) {
      // uint32 SCALAR
      return new Uint32Array(buffer.slice(offset, offset + acc.count * 4))
    }
    throw new Error(`Unsupported accessor componentType ${acc.componentType}`)
  }

  const positions = readAccessor(prim.attributes.POSITION) as Float32Array
  const indices = readAccessor(prim.indices) as Uint32Array
  const extras = json.extras

  return {
    id: extras.template,
    scaleBy: extras.scaleBy,
    canonical: extras.canonical,
    positions,
    indices,
    pins: extras.pins,
    seams: new Uint32Array(extras.seams),
  }
}

const cache = new Map<string, Promise<GarmentTemplate>>()

/** Fetch + parse a garment template GLB, cached for the session. */
export function loadGarmentTemplate(templateId: string): Promise<GarmentTemplate> {
  let p = cache.get(templateId)
  if (!p) {
    p = fetch(`/garments/${templateId}.glb`)
      .then((res) => {
        if (!res.ok) throw new Error(`Template ${templateId} fetch failed: ${res.status}`)
        return res.arrayBuffer()
      })
      .then(parseGarmentGlb)
    p.catch(() => cache.delete(templateId))
    cache.set(templateId, p)
  }
  return p
}
