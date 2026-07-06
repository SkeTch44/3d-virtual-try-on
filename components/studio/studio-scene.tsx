'use client'

import { useMemo, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Environment } from '@react-three/drei'
import { buildBodyProfile } from '@/lib/body'
import { useStudioStore } from '@/lib/studio-store'
import { AvatarModel } from './avatar-model'
import { ClothGarmentMesh } from './cloth-garment-mesh'

type Props = {
  showCloth?: boolean
}

export function StudioScene({ showCloth = false }: Props) {
  const measurements = useStudioStore((s) => s.measurements)
  const garment = useStudioStore((s) => s.garment)
  const selectedSize = useStudioStore((s) => s.selectedSize)
  const heatmap = useStudioStore((s) => s.heatmap)
  const simKey = useStudioStore((s) => s.simKey)

  const body = useMemo(() => buildBodyProfile(measurements), [measurements])
  const size = garment?.sizes.find((s) => s.label === selectedSize) ?? garment?.sizes[1]

  return (
    <Canvas
      shadows
      camera={{ position: [0.4, 1.35, 2.6], fov: 42 }}
      gl={{ antialias: true }}
      className="touch-none"
    >
      <color attach="background" args={['#191917']} />
      <fog attach="fog" args={['#191917', 5, 12]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 5, 2]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#bcd0ff" />

      <Suspense fallback={null}>
        <Environment preset="studio" environmentIntensity={0.25} />
      </Suspense>

      <AvatarModel body={body} />
      {showCloth && garment && size && (
        <ClothGarment
          body={body}
          garment={garment}
          size={size}
          heatmap={heatmap}
          simKey={simKey}
        />
      )}

      <ContactShadows position={[0, 0.001, 0]} opacity={0.55} scale={4} blur={2.4} far={2} />
      <gridHelper args={[14, 40, '#2e2e2b', '#232320']} position={[0, 0, 0]} />

      <OrbitControls
        target={[0, body.heightM * 0.55, 0]}
        minDistance={1.2}
        maxDistance={5}
        maxPolarAngle={Math.PI / 1.9}
        enablePan={false}
      />
    </Canvas>
  )
}
