export type FabricPreset = {
  name: string
  /** constraint stiffness 0-1, higher = stiffer fabric */
  stiffness: number
  /** velocity damping per frame */
  damping: number
  /** grams per square meter, display only */
  gsm: number
  /** stretch allowance as fraction of rest length */
  stretch: number
}

export const FABRICS: Record<string, FabricPreset> = {
  cotton: { name: 'Cotton Jersey', stiffness: 0.55, damping: 0.985, gsm: 180, stretch: 0.12 },
  denim: { name: 'Denim 12oz', stiffness: 0.92, damping: 0.97, gsm: 400, stretch: 0.03 },
  silk: { name: 'Silk Charmeuse', stiffness: 0.3, damping: 0.992, gsm: 80, stretch: 0.08 },
  wool: { name: 'Wool Twill', stiffness: 0.78, damping: 0.975, gsm: 320, stretch: 0.05 },
}

export type SizeSpec = {
  label: string
  /** garment chest circumference in cm */
  chest: number
  waist: number
  hips: number
}

export type Garment = {
  id: string
  /** GLB template in public/garments/ (authored by scripts/generate-garment-templates.mjs) */
  templateId: 'tee' | 'jacket' | 'coat' | 'dress' | 'skirt' | 'jeans'
  name: string
  brand: string
  price: number
  fabric: FabricPreset
  color: string
  /** top of garment as fraction of avatar height */
  topY: number
  /** bottom of garment as fraction of avatar height */
  bottomY: number
  sizes: SizeSpec[]
  description: string
}

export const GARMENTS: Garment[] = [
  {
    id: 'tee',
    templateId: 'tee',
    name: 'Classic Crew Tee',
    brand: 'Atelier North',
    price: 45,
    fabric: FABRICS.cotton,
    color: '#d8d4cc',
    topY: 0.825,
    bottomY: 0.56,
    sizes: [
      { label: 'S', chest: 92, waist: 88, hips: 94 },
      { label: 'M', chest: 100, waist: 96, hips: 102 },
      { label: 'L', chest: 108, waist: 104, hips: 110 },
      { label: 'XL', chest: 116, waist: 112, hips: 118 },
    ],
    description: '180gsm cotton jersey, relaxed drape with natural stretch recovery.',
  },
  {
    id: 'dress',
    templateId: 'dress',
    name: 'Bias-Cut Slip Dress',
    brand: 'Maison Vela',
    price: 210,
    fabric: FABRICS.silk,
    color: '#8a2f2a',
    topY: 0.8,
    bottomY: 0.22,
    sizes: [
      { label: 'S', chest: 88, waist: 84, hips: 96 },
      { label: 'M', chest: 96, waist: 92, hips: 104 },
      { label: 'L', chest: 104, waist: 100, hips: 112 },
      { label: 'XL', chest: 112, waist: 108, hips: 120 },
    ],
    description: 'Fluid silk charmeuse cut on the bias — the hardest drape to fake, easy to simulate.',
  },
  {
    id: 'jacket',
    templateId: 'jacket',
    name: 'Denim Trucker Jacket',
    brand: 'Foundry Denim',
    price: 128,
    fabric: FABRICS.denim,
    color: '#3a506b',
    topY: 0.83,
    bottomY: 0.52,
    sizes: [
      { label: 'S', chest: 100, waist: 96, hips: 100 },
      { label: 'M', chest: 108, waist: 104, hips: 108 },
      { label: 'L', chest: 116, waist: 112, hips: 116 },
      { label: 'XL', chest: 124, waist: 120, hips: 124 },
    ],
    description: '12oz rigid denim. High bending stiffness, near-zero stretch — structure over drape.',
  },
  {
    id: 'coat',
    templateId: 'coat',
    name: 'Tailored Wool Coat',
    brand: 'Atelier North',
    price: 340,
    fabric: FABRICS.wool,
    color: '#5c5348',
    topY: 0.835,
    bottomY: 0.3,
    sizes: [
      { label: 'S', chest: 104, waist: 100, hips: 106 },
      { label: 'M', chest: 112, waist: 108, hips: 114 },
      { label: 'L', chest: 120, waist: 116, hips: 122 },
      { label: 'XL', chest: 128, waist: 124, hips: 130 },
    ],
    description: '320gsm wool twill with structured shoulders and a clean, weighted fall.',
  },
  {
    id: 'jeans',
    templateId: 'jeans',
    name: 'Straight-Leg Jeans',
    brand: 'Foundry Denim',
    price: 96,
    fabric: FABRICS.denim,
    color: '#2f4358',
    topY: 0.62,
    bottomY: 0.07,
    sizes: [
      { label: 'S', chest: 96, waist: 78, hips: 96 },
      { label: 'M', chest: 104, waist: 84, hips: 102 },
      { label: 'L', chest: 112, waist: 92, hips: 110 },
      { label: 'XL', chest: 120, waist: 100, hips: 118 },
    ],
    description: 'Rigid 12oz denim, split-leg construction seamed at the yoke — real trouser topology.',
  },
  {
    id: 'skirt',
    templateId: 'skirt',
    name: 'A-Line Midi Skirt',
    brand: 'Maison Vela',
    price: 145,
    fabric: FABRICS.wool,
    color: '#7a6a52',
    topY: 0.62,
    bottomY: 0.32,
    sizes: [
      { label: 'S', chest: 92, waist: 74, hips: 94 },
      { label: 'M', chest: 100, waist: 80, hips: 100 },
      { label: 'L', chest: 108, waist: 88, hips: 108 },
      { label: 'XL', chest: 116, waist: 96, hips: 116 },
    ],
    description: 'Wool twill A-line with a flared hem — waistband pinned, free-falling drape below.',
  },
]
