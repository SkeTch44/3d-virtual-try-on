'use client'

import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { buildBodyProfile } from '@/lib/body'
import { DEFAULT_MEASUREMENTS } from '@/lib/size-ai'
import { AvatarModel } from '@/components/studio/avatar-model'

function SpinningAvatar() {
  const group = useRef<Group>(null)
  const body = useMemo(() => buildBodyProfile(DEFAULT_MEASUREMENTS), [])

  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = state.clock.elapsedTime * 0.35
    }
  })

  return (
    <group ref={group} position={[0, -0.88, 0]}>
      <AvatarModel body={body} wireframe />
    </group>
  )
}

export function HeroVisual() {
  return (
    <div className="h-full w-full" aria-hidden="true">
      <Canvas camera={{ position: [0, 0.15, 2.1], fov: 40 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 3, 2]} intensity={1.2} />
        <SpinningAvatar />
      </Canvas>
    </div>
  )
}
