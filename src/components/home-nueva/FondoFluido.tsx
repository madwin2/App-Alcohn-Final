import { useEffect, useRef } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'
import { LAVA_GLSL, tiempoLava } from './lavaShader'

/**
 * Fondo de la Home nueva, tipo lámpara de lava / metal fundido: cuatro manchas grandes que
 * flotan despacio, se deforman y se unen entre sí (con negro entre medio cuando están
 * separadas). El color es una escala de calor: borde negro → marrón rojizo → naranja quemado
 * → naranja → ámbar → núcleo crema. No hay ningún punto fijo. Lleva el grano de Grainient.
 * El shader y el reloj están en `lavaShader.ts` (los comparte el vidrio líquido).
 */

const vertex = /* glsl */ `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uGrain;
out vec4 fragColor;
${LAVA_GLSL}
void main() {
  vec3 col = lava(gl_FragCoord.xy, uRes, uTime);
  // Grano, igual que Grainient (por píxel, fijo).
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * uGrain;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export function FondoFluido({
  grano = 0.07,
  className,
}: {
  grano?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    // dpr 1: el grano necesita resolución completa; el cálculo es liviano (4 manchas).
    const renderer = new Renderer({
      webgl: 2,
      alpha: false,
      antialias: false,
      dpr: 1,
    })
    const gl = renderer.gl
    const canvas = gl.canvas as HTMLCanvasElement
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    container.appendChild(canvas)

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: new Float32Array([1, 1]) },
        uGrain: { value: grano },
      },
    })
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

    const setSize = () => {
      const rect = container.getBoundingClientRect()
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height))
      const res = program.uniforms.uRes.value as Float32Array
      res[0] = gl.drawingBufferWidth
      res[1] = gl.drawingBufferHeight
      renderer.render({ scene: mesh })
    }
    const ro = new ResizeObserver(setSize)
    ro.observe(container)
    setSize()

    // Reloj compartido con el vidrio líquido (arranca en un momento al azar).
    let raf = 0
    const loop = (now: number) => {
      program.uniforms.uTime.value = tiempoLava(now)
      renderer.render({ scene: mesh })
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (raf === 0 && !document.hidden) raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      raf = 0
    }
    const onVisibility = () => (document.hidden ? stop() : start())

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    program.uniforms.uTime.value = tiempoLava()
    if (reduceMotion) {
      renderer.render({ scene: mesh })
    } else {
      start()
      document.addEventListener('visibilitychange', onVisibility)
    }

    return () => {
      stop()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    }
  }, [grano])

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 overflow-hidden bg-[#0a0908] ${className ?? ''}`}
    >
      <div ref={ref} className="absolute inset-0" />
    </div>
  )
}
