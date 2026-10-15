import { useEffect, useRef } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'
import { LAVA_GLSL, tiempoLava } from './lavaShader'

/**
 * Vidrio líquido para la tarjeta de perfil (versión "vidrio", para comparar): el mismo material del
 * vidrio de prueba (`VidrioLiquido`) pero para placas grandes con texto. Un canvas detrás de la
 * tarjeta dibuja cada elemento con `data-placa` dentro del contenedor: bisel que comprime la lava
 * y separa los colores, borde que se enciende, línea de luz arriba a la izquierda y sombra suave.
 * Por dentro se oscurece más que el de prueba para que el texto se lea.
 *
 * Rendimiento: canvas a resolución 1 (adentro todo es difuso) y la lava se evalúa una vez por píxel
 * salvo en el bisel, donde se separan los colores.
 */

const MAX = 3
const RADIO = 28
const MARGEN = 48 // lugar alrededor para la sombra (px)

const vertex = /* glsl */ `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uOrigen;   // esquina inferior izquierda del canvas en la ventana (px CSS, desde abajo)
uniform vec2 uVentana;
uniform float uTime;
uniform int uN;
uniform vec4 uPlacas[${MAX}]; // centro (x, y) y medio tamaño (w, h), px CSS dentro del canvas
out vec4 fragColor;
${LAVA_GLSL}

float sdCaja(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 pc = gl_FragCoord.xy;
  float dMin = 1e9;
  int iMin = -1;
  float sombra = 0.0;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uN) break;
    vec4 t = uPlacas[i];
    float d = sdCaja(pc - t.xy, t.zw, ${RADIO.toFixed(1)});
    float ds = sdCaja(pc - t.xy - vec2(0.0, -14.0), t.zw - 6.0, ${RADIO.toFixed(1)});
    sombra = max(sombra, 0.45 * pow(1.0 - smoothstep(-8.0, 40.0, ds), 2.0));
    if (d < dMin) { dMin = d; iMin = i; }
  }
  if (iMin < 0) { fragColor = vec4(0.0); return; }
  vec4 t = uPlacas[iMin];
  vec2 c = pc - t.xy;
  vec2 b = t.zw;
  float d = dMin;
  float cobertura = clamp(0.5 - d, 0.0, 1.0);
  if (cobertura <= 0.0) { fragColor = vec4(0.0, 0.0, 0.0, sombra); return; }

  float e = 0.75;
  vec2 n = normalize(vec2(
    sdCaja(c + vec2(e, 0.0), b, ${RADIO.toFixed(1)}) - sdCaja(c - vec2(e, 0.0), b, ${RADIO.toFixed(1)}),
    sdCaja(c + vec2(0.0, e), b, ${RADIO.toFixed(1)}) - sdCaja(c - vec2(0.0, e), b, ${RADIO.toFixed(1)})
  ) + 1e-5);
  float bisel = 34.0;
  float k = clamp(-d / bisel, 0.0, 1.0);
  float borde = 1.0 - k;
  float pendiente = pow(borde, 2.2);

  // Refracción + dispersión (solo en el bisel; adentro una sola muestra).
  vec2 desvio = n * 62.0 * pendiente;
  vec2 P = uOrigen + pc;
  vec3 col;
  if (borde > 0.001) {
    col.r = lava(P + desvio * 1.00, uVentana, uTime).r;
    col.g = lava(P + desvio * 1.10, uVentana, uTime).g;
    col.b = lava(P + desvio * 1.22, uVentana, uTime).b;
  } else {
    col = lava(P, uVentana, uTime);
  }

  // Material: oscuro y limpio por dentro (más que el de prueba, para leer el texto).
  float adentro = 1.0 - pow(borde, 1.4);
  col = pow(col, vec3(1.0 + 0.6 * adentro)) * mix(1.0, 0.5, adentro) + 0.006;
  // Sobre la lava clara se oscurece más (el texto blanco se tiene que leer igual).
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col *= mix(1.0, 0.45, smoothstep(0.12, 0.5, lum) * adentro);
  col += col * 1.1 * pow(borde, 2.6);

  // Reflejos: arriba a la izquierda fuerte, abajo a la derecha tenue.
  vec2 L = normalize(vec2(-0.65, 0.76));
  float linea = smoothstep(2.4, 0.0, abs(d + 1.1));
  float halo = smoothstep(9.0, 0.0, abs(d + 3.5));
  float spec1 = pow(max(dot(n, L), 0.0), 4.0);
  float spec2 = pow(max(dot(n, -L), 0.0), 4.0);
  vec3 blanco = vec3(1.0, 0.975, 0.94);
  col += blanco * (linea * (0.7 * spec1 + 0.3 * spec2 + 0.02) + halo * 0.12 * spec1);
  float arriba = smoothstep(-b.y * 0.2, b.y, c.y) * smoothstep(0.0, 0.6, k);
  col += blanco * 0.025 * arriba;

  float grano = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grano - 0.5) * 0.025;
  col = clamp(col, 0.0, 1.0);
  fragColor = vec4(col * cobertura, cobertura) + (1.0 - cobertura) * vec4(0.0, 0.0, 0.0, sombra);
}
`

export function VidrioTarjeta({
  contenedor,
}: {
  contenedor: React.RefObject<HTMLElement>
}) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const renderer = new Renderer({
      webgl: 2,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      dpr: 1,
    })
    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    const canvas = gl.canvas as HTMLCanvasElement
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    el.appendChild(canvas)

    const placas = new Float32Array(MAX * 4)
    const placasUniform = Array.from({ length: MAX }, (_, i) =>
      placas.subarray(i * 4, i * 4 + 4)
    )
    const program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      uniforms: {
        uOrigen: { value: new Float32Array([0, 0]) },
        uVentana: {
          value: new Float32Array([window.innerWidth, window.innerHeight]),
        },
        uTime: { value: tiempoLava() },
        uN: { value: 0 },
        uPlacas: { value: placasUniform },
      },
    })
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

    const tam = () => {
      const r = el.getBoundingClientRect()
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height))
    }
    tam()

    let raf = 0
    const dibujar = (now: number) => {
      const rc = el.getBoundingClientRect()
      // El contenedor mismo puede ser la placa (tarjeta unida) o tenerlas adentro (despegada).
      const cont = contenedor.current
      const nodos = cont
        ? cont.hasAttribute('data-placa')
          ? [cont]
          : [...cont.querySelectorAll<HTMLElement>('[data-placa]')]
        : []
      const n = Math.min(MAX, nodos.length)
      for (let i = 0; i < n; i++) {
        const r = nodos[i].getBoundingClientRect()
        placas[i * 4] = r.left + r.width / 2 - rc.left
        placas[i * 4 + 1] = rc.bottom - (r.top + r.height / 2)
        placas[i * 4 + 2] = r.width / 2
        placas[i * 4 + 3] = r.height / 2
      }
      const u = program.uniforms
      ;(u.uOrigen.value as Float32Array)[0] = rc.left
      ;(u.uOrigen.value as Float32Array)[1] = window.innerHeight - rc.bottom
      ;(u.uVentana.value as Float32Array)[0] = window.innerWidth
      ;(u.uVentana.value as Float32Array)[1] = window.innerHeight
      u.uN.value = n
      u.uTime.value = tiempoLava(now)
      renderer.render({ scene: mesh })
    }
    const loop = (now: number) => {
      dibujar(now)
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (raf === 0 && !document.hidden) raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      raf = 0
    }
    const onVis = () => (document.hidden ? stop() : start())
    const ro = new ResizeObserver(() => {
      tam()
      if (raf === 0) dibujar(performance.now())
    })
    ro.observe(el)
    dibujar(performance.now())
    start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    }
  }, [contenedor])

  return (
    <div
      ref={host}
      aria-hidden
      className="pointer-events-none absolute"
      style={{ inset: -MARGEN }}
    />
  )
}
