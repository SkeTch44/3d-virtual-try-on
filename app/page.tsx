'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowRight, Box, Ruler, Scan, Shirt, Sparkles, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'

const HeroVisual = dynamic(
  () => import('@/components/landing/hero-visual').then((m) => m.HeroVisual),
  { ssr: false },
)

const PIPELINE = [
  {
    icon: Scan,
    step: '01',
    title: 'Photo to avatar',
    body: 'Two photos become a measurement-accurate parametric 3D body model in under 60 seconds. MediaPipe landmarks, SMPL-X fitting, ±1.5cm accuracy.',
  },
  {
    icon: Shirt,
    step: '02',
    title: 'Physics-true drape',
    body: 'Every garment is simulated with a GPU XPBD cloth solver using measured fabric properties — density, stretch, bending stiffness. Denim behaves like denim.',
  },
  {
    icon: Sparkles,
    step: '03',
    title: 'Size AI that explains itself',
    body: 'Zone-by-zone fit analysis with strain heatmaps and a size prediction backed by a confidence score. Not a guess — a simulation.',
  },
]

const METRICS = [
  { value: '30-40%', label: 'of online fashion is returned, mostly for fit' },
  { value: '$550B+', label: 'global fashion e-commerce market' },
  { value: '<30s', label: 'from garment selection to physically-draped result' },
  { value: '10x', label: 'lower infra cost via open-source-first stack' },
]

const MOAT = [
  {
    icon: Box,
    title: 'Fabric intelligence database',
    body: 'Measured physical parameters for real fabrics feed the solver. Competitors overlay images; we simulate matter.',
  },
  {
    icon: Ruler,
    title: 'Measurement-grade avatars',
    body: 'Parametric body fitting produces avatars accurate enough to drive sizing decisions, not just visualization.',
  },
  {
    icon: Store,
    title: 'Distribution built in',
    body: 'Shopify widget, brand dashboard, and public API. Brands integrate in an afternoon and pay per try-on.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* nav */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="font-semibold tracking-tight">
            Drape<span className="text-primary">AI</span>
          </span>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#moat" className="transition-colors hover:text-foreground">
              Technology
            </a>
            <a href="#market" className="transition-colors hover:text-foreground">
              Market
            </a>
          </nav>
          <Button render={<Link href="/studio" />} nativeButton={false} size="sm">
            Launch demo
          </Button>
        </div>
      </header>

      <main>
        {/* hero */}
        <section className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 overflow-hidden px-4 pb-16 pt-32 text-center md:pt-40">
          <div className="pointer-events-none absolute inset-0 opacity-30 md:opacity-40">
            <HeroVisual />
          </div>
          <div className="relative z-10 flex flex-col items-center gap-6">
            <span className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 font-mono text-xs text-primary">
              PHYSICS-BASED VIRTUAL TRY-ON
            </span>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-balance md:text-6xl">
              See exactly how it fits. Before you buy.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground leading-relaxed text-pretty">
              DrapeAI turns two photos into a measurement-accurate 3D avatar, then drapes real
              garments on it with true cloth physics. Fit returns drop. Conversion climbs.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button render={<Link href="/studio" />} nativeButton={false} size="lg" className="gap-2">
                Try the live demo
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <Button render={<a href="#how" />} nativeButton={false} variant="secondary" size="lg">
                How it works
              </Button>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              REAL-TIME CLOTH SIMULATION RUNNING IN YOUR BROWSER — NO INSTALL
            </p>
          </div>
        </section>

        {/* metrics */}
        <section id="market" className="border-y border-border bg-card/40">
          <div className="mx-auto grid max-w-6xl grid-cols-2 lg:grid-cols-4">
            {METRICS.map((m) => (
              <div key={m.label} className="flex flex-col gap-1.5 border-border p-8 [&:nth-child(even)]:border-l lg:[&:not(:first-child)]:border-l">
                <span className="font-mono text-3xl font-semibold text-primary">{m.value}</span>
                <span className="text-sm text-muted-foreground leading-relaxed">{m.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* pipeline */}
        <section id="how" className="mx-auto max-w-6xl px-4 py-24">
          <div className="mb-14 flex flex-col gap-3">
            <span className="font-mono text-xs text-primary">THE PIPELINE</span>
            <h2 className="max-w-lg text-3xl font-semibold text-balance md:text-4xl">
              From photo to physically-draped garment in three steps
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {PIPELINE.map((p) => (
              <div key={p.step} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <p.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{p.step}</span>
                </div>
                <h3 className="text-lg font-medium">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* moat */}
        <section id="moat" className="border-t border-border bg-card/40">
          <div className="mx-auto max-w-6xl px-4 py-24">
            <div className="mb-14 flex flex-col gap-3">
              <span className="font-mono text-xs text-primary">WHY WE WIN</span>
              <h2 className="max-w-lg text-3xl font-semibold text-balance md:text-4xl">
                Image overlays fake it. Physics doesn&apos;t.
              </h2>
              <p className="max-w-xl text-muted-foreground leading-relaxed">
                Existing try-on tools warp 2D images. They can&apos;t answer the only question
                that matters: {'"will this actually fit me?"'} Simulation can.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {MOAT.map((m) => (
                <div key={m.title} className="flex flex-col gap-3">
                  <m.icon className="size-5 text-primary" aria-hidden="true" />
                  <h3 className="font-medium">{m.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center">
          <h2 className="max-w-xl text-3xl font-semibold text-balance md:text-4xl">
            The demo is live. Drape something.
          </h2>
          <p className="max-w-md text-muted-foreground leading-relaxed">
            Create an avatar, pick a garment, watch real cloth physics settle on your body —
            all in the browser.
          </p>
          <Button render={<Link href="/studio" />} nativeButton={false} size="lg" className="gap-2">
            Launch the try-on studio
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 sm:flex-row">
          <span className="text-sm text-muted-foreground">
            Drape<span className="text-primary">AI</span> — investor demo build
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            OPEN-SOURCE-FIRST STACK · SMPL-X · XPBD · vLLM
          </span>
        </div>
      </footer>
    </div>
  )
}
