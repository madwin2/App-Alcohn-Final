import { useEffect, useRef, useState } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'
import { cn } from '@/lib/utils/cn'
import { LAVA_GLSL, tiempoLava } from './lavaShader'

/**
 * Vidrio líquido (prueba de la Home nueva). Un cuadrado de vidrio que refracta el fondo de lava
 * de forma realista: el shader vuelve a calcular el MISMO fondo (`lavaShader`, mismo reloj) en
 * coordenadas desviadas por la forma del vidrio, así lo que pasa por detrás se curva en el borde.
 *
 * - Forma: rectángulo de esquinas muy redondeadas (SDF), con antialias a la resolución real.
 * - Refracción: en el borde (bisel) el vidrio "mira" hacia afuera según la normal, como un lente
 *   que comprime; el centro magnifica apenas.
 * - Dispersión: rojo, verde y azul se desvían distinto (flecos de color reales en el borde).
 * - Luz: borde que se enciende con lo que hay detrás, reflejo especular arriba a la izquierda y
 *   uno más tenue abajo a la derecha, brillo superior suave y sombra proyectada.
 *
 * Se arrastra con el mouse; la rueda cambia el mes del selector de adentro.
 */

const TAM = 210 // lado del vidrio (px)
const RADIO = 52 // radio de las esquinas (px)
const MARGEN = 44 // lugar alrededor para la sombra (px)

const vertex = /* glsl */ `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform float uDpr;
uniform vec2 uCanvas;   // tamaño del canvas (px CSS, con margen)
uniform vec2 uSize;     // tamaño del vidrio (px CSS)
uniform float uRadio;
uniform vec2 uOrigen;   // esquina inferior izquierda del canvas en la ventana (px CSS, desde abajo)
uniform vec2 uVentana;  // tamaño de la ventana (px CSS)
uniform float uTime;
uniform float uPresion; // 0..1 mientras se arrastra (el vidrio "se hunde" un poco más)
out vec4 fragColor;
${LAVA_GLSL}

float sdCaja(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 pc = gl_FragCoord.xy / uDpr;          // px CSS dentro del canvas
  vec2 c = pc - 0.5 * uCanvas;               // centrado
  vec2 b = 0.5 * uSize;
  float d = sdCaja(c, b, uRadio);

  // ---------- Sombra proyectada (afuera) ----------
  float ds = sdCaja(c - vec2(0.0, -12.0), b - 4.0, uRadio);
  float sombra = 0.55 * pow(1.0 - smoothstep(-6.0, 34.0, ds), 2.0);
  float cobertura = clamp(0.5 - d * uDpr, 0.0, 1.0);
  if (cobertura <= 0.0) {
    fragColor = vec4(0.0, 0.0, 0.0, sombra);
    return;
  }

  // ---------- Normal y bisel ----------
  float e = 0.75;
  vec2 n = normalize(vec2(
    sdCaja(c + vec2(e, 0.0), b, uRadio) - sdCaja(c - vec2(e, 0.0), b, uRadio),
    sdCaja(c + vec2(0.0, e), b, uRadio) - sdCaja(c - vec2(0.0, e), b, uRadio)
  ) + 1e-5);
  float bisel = 34.0;
  float k = clamp(-d / bisel, 0.0, 1.0);     // 0 en el borde, 1 adentro
  float borde = 1.0 - k;
  // Perfil de lente: la pendiente crece rápido al llegar al borde.
  float pendiente = pow(borde, 2.2);

  // ---------- Refracción + dispersión ----------
  float fuerza = 62.0 + 14.0 * uPresion;
  vec2 desvio = n * fuerza * pendiente;       // el borde mira hacia afuera (comprime)
  vec2 lupa = -c * (0.07 + 0.02 * uPresion);  // el centro magnifica apenas
  vec2 P = uOrigen + pc;
  vec3 col;
  col.r = lava(P + desvio * 1.00 + lupa, uVentana, uTime).r;
  col.g = lava(P + desvio * 1.10 + lupa, uVentana, uTime).g;
  col.b = lava(P + desvio * 1.22 + lupa, uVentana, uTime).b;

  // ---------- Material ----------
  // Vidrio oscuro y limpio por dentro (como la referencia); el bisel deja pasar toda la luz.
  // Se oscurece con una curva (no parejo) para que el crema no se vuelva oliva: mantiene lo cálido.
  float adentro = 1.0 - pow(borde, 1.4);
  col = pow(col, vec3(1.0 + 0.45 * adentro)) * mix(1.0, 0.74, adentro) + 0.006;

  // El borde se enciende con lo que tiene detrás (cáustica).
  col += col * 1.35 * pow(borde, 2.6);

  // Reflejos especulares: arriba a la izquierda fuerte, abajo a la derecha tenue.
  vec2 L = normalize(vec2(-0.65, 0.76));
  float linea = smoothstep(2.4, 0.0, abs(d + 1.1));
  float halo = smoothstep(9.0, 0.0, abs(d + 3.5));
  float spec1 = pow(max(dot(n, L), 0.0), 4.0);
  float spec2 = pow(max(dot(n, -L), 0.0), 4.0);
  vec3 blanco = vec3(1.0, 0.975, 0.94);
  col += blanco * (linea * (0.7 * spec1 + 0.3 * spec2 + 0.02) + halo * 0.12 * spec1);

  // Brillo superior suave (luz de arriba sobre la cara del vidrio).
  float arriba = smoothstep(-b.y * 0.2, b.y, c.y) * smoothstep(0.0, 0.6, k);
  col += blanco * 0.03 * arriba;

  // Grano finito, como el fondo.
  float grano = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grano - 0.5) * 0.025;

  col = clamp(col, 0.0, 1.0);
  // Premultiplicado: vidrio encima, sombra en el borde suavizado.
  fragColor = vec4(col * cobertura, cobertura) + (1.0 - cobertura) * vec4(0.0, 0.0, 0.0, sombra);
}
`

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]
const ALTO_FILA = 30

export function VidrioLiquido({ className }: { className?: string }) {
  const contenedor = useRef<HTMLDivElement | null>(null)
  const lienzo = useRef<HTMLDivElement | null>(null)
  // Posición relativa a la esquina inferior derecha, así se acomoda sola si cambia la ventana.
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [listo, setListo] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [mes, setMes] = useState(() => new Date().getMonth())
  const presion = useRef(0)
  const arrastre = useRef<{ dx: number; dy: number } | null>(null)

  // Posición inicial abajo a la derecha; al cambiar el tamaño de la ventana, se mantiene adentro.
  useEffect(() => {
    const acomodar = (inicial: boolean) => {
      const w = window.innerWidth
      const h = window.innerHeight
      if (w < TAM || h < TAM) return
      setPos(p =>
        inicial
          ? { x: w - TAM - 120, y: h - TAM - 110 }
          : {
              x: Math.min(w - TAM - 8, Math.max(8, p.x)),
              y: Math.min(h - TAM - 8, Math.max(8, p.y)),
            }
      )
      setListo(true)
    }
    acomodar(true)
    const onResize = () => acomodar(!listoRef.current)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const listoRef = useRef(false)
  listoRef.current = listo

  // ---------- WebGL ----------
  useEffect(() => {
    const host = lienzo.current
    if (!host) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const renderer = new Renderer({
      webgl: 2,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      dpr,
    })
    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    const canvas = gl.canvas as HTMLCanvasElement
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    host.appendChild(canvas)

    const lado = TAM + 2 * MARGEN
    renderer.setSize(lado, lado)

    const program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      uniforms: {
        uDpr: { value: dpr },
        uCanvas: { value: new Float32Array([lado, lado]) },
        uSize: { value: new Float32Array([TAM, TAM]) },
        uRadio: { value: RADIO },
        uOrigen: { value: new Float32Array([0, 0]) },
        uVentana: {
          value: new Float32Array([window.innerWidth, window.innerHeight]),
        },
        uTime: { value: tiempoLava() },
        uPresion: { value: 0 },
      },
    })
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

    let raf = 0
    const loop = (now: number) => {
      const r = host.getBoundingClientRect()
      const u = program.uniforms
      const origen = u.uOrigen.value as Float32Array
      origen[0] = r.left
      origen[1] = window.innerHeight - r.bottom
      const ventana = u.uVentana.value as Float32Array
      ventana[0] = window.innerWidth
      ventana[1] = window.innerHeight
      u.uTime.value = tiempoLava(now)
      // La presión entra y sale suave.
      u.uPresion.value +=
        (presion.current - (u.uPresion.value as number)) * 0.18
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
    const onVis = () => (document.hidden ? stop() : start())
    start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    }
  }, [])

  // ---------- Arrastre ----------
  useEffect(() => {
    if (!arrastrando) return
    const mover = (e: PointerEvent) => {
      if (!arrastre.current) return
      const x = Math.min(
        window.innerWidth - TAM - 8,
        Math.max(8, e.clientX - arrastre.current.dx)
      )
      const y = Math.min(
        window.innerHeight - TAM - 8,
        Math.max(8, e.clientY - arrastre.current.dy)
      )
      setPos({ x, y })
    }
    const soltar = () => {
      arrastre.current = null
      presion.current = 0
      setArrastrando(false)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
  }, [arrastrando])

  return (
    <div
      ref={contenedor}
      className={cn(
        'fixed z-30 touch-none select-none',
        arrastrando ? 'cursor-grabbing' : 'cursor-grab',
        className
      )}
      style={{
        left: pos.x,
        top: pos.y,
        width: TAM,
        height: TAM,
        visibility: listo ? 'visible' : 'hidden',
      }}
      onPointerDown={e => {
        if (e.button !== 0) return
        arrastre.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
        presion.current = 1
        setArrastrando(true)
      }}
      onWheel={e => {
        const dir = e.deltaY > 0 ? 1 : -1
        setMes(m => Math.min(11, Math.max(0, m + dir)))
      }}
    >
      {/* Vidrio (WebGL), con margen para la sombra */}
      <div
        ref={lienzo}
        aria-hidden
        className={cn(
          'pointer-events-none absolute transition-transform duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)]',
          arrastrando ? 'scale-[1.035]' : 'scale-100'
        )}
        style={{
          left: -MARGEN,
          top: -MARGEN,
          width: TAM + 2 * MARGEN,
          height: TAM + 2 * MARGEN,
        }}
      />

      {/* Selector de adentro (como el de la referencia) */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)]',
          arrastrando ? 'scale-[1.035]' : 'scale-100'
        )}
        style={{ borderRadius: RADIO }}
      >
        <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent_6%,black_34%,black_66%,transparent_94%)]">
          <div
            className="absolute inset-x-0 top-1/2 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateY(${-(mes + 0.5) * ALTO_FILA}px)` }}
          >
            {MESES.map((m, i) => {
              const dist = Math.abs(i - mes)
              return (
                <div
                  key={m}
                  className="flex items-center justify-center text-[17px] tracking-tight transition-[color,opacity,transform] duration-500"
                  style={{
                    height: ALTO_FILA,
                    color:
                      i === mes
                        ? 'rgba(255,255,255,0.97)'
                        : 'rgba(255,240,225,0.5)',
                    opacity: dist > 3 ? 0 : 1,
                    transform: `scale(${i === mes ? 1 : 0.92})`,
                    textShadow: '0 1px 12px rgba(0,0,0,0.35)',
                    fontWeight: i === mes ? 600 : 400,
                  }}
                >
                  {m}
                </div>
              )
            })}
          </div>
        </div>
        {/* Marca del seleccionado (aro chico a la izquierda, como en la referencia) */}
        <span className="absolute left-7 top-1/2 size-[9px] -translate-y-1/2 rounded-full border-[1.5px] border-white/85 shadow-[0_0_10px_rgba(255,255,255,0.35)]" />
      </div>
    </div>
  )
}
