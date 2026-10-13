import { useEffect, useRef } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'
import { LAVA_GLSL, tiempoLava } from '../lavaShader'

/**
 * Capa de vidrio de los íconos del escritorio: un solo canvas detrás de los íconos dibuja TODOS,
 * como el vidrio líquido de iOS: transparente (la lava se ve a través, apenas magnificada y
 * esmerilada, sin tinte), el borde dobla fuerte el fondo y separa los colores, el contorno se
 * enciende con lo que tiene detrás y lleva un filete de luz brillante en las dos esquinas opuestas.
 * Para que el símbolo blanco se lea, el vidrio baja apenas lo muy claro y levanta apenas lo oscuro.
 * Con `data-brillo="1"` (hover / seleccionado) se aclara un poco y la sombra crece.
 *
 * Rendimiento: mide los `[data-vidrio]` del contenedor en cada cuadro, pero dibuja solo la zona que
 * ocupan (scissor) y no dibuja nada mientras haya una ventana maximizada encima (`[data-tapa]`).
 */

const MAX = 12

const vertex = /* glsl */ `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform float uDpr;
uniform vec2 uOrigen;   // esquina inferior izquierda del canvas en la ventana (px CSS, desde abajo)
uniform vec2 uVentana;  // tamaño de la ventana (px CSS)
uniform float uTime;
uniform int uN;
uniform vec4 uTiles[${MAX}];   // centro (x, y) y medio lado (w, h), px CSS desde abajo a la izquierda
uniform float uBrillo[${MAX}]; // 0..1 (hover / seleccionado)
out vec4 fragColor;
${LAVA_GLSL}

// Radio de las esquinas (proporción del lado), como los íconos de Apple.
#define RADIO 0.3

float sdCaja(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 pc = gl_FragCoord.xy / uDpr;

  // Ícono más cercano y sombra acumulada de todos.
  float dMin = 1e9;
  int iMin = -1;
  float sombra = 0.0;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uN) break;
    vec4 t = uTiles[i];
    float lado = 2.0 * min(t.z, t.w);
    float r = RADIO * lado;
    float br = uBrillo[i];
    float d = sdCaja(pc - t.xy, t.zw, r);
    // Sin sombra paralela: solo un contorno oscuro muy tenue y pegado, centrado, para que el
    // vidrio se despegue del fondo claro.
    sombra = max(sombra, (0.12 + 0.04 * br) * (1.0 - smoothstep(0.0, 0.07 * lado, d)));
    if (d < dMin) { dMin = d; iMin = i; }
  }
  if (iMin < 0) { fragColor = vec4(0.0); return; }

  vec4 t = uTiles[iMin];
  vec2 c = pc - t.xy;
  vec2 b = t.zw;
  float lado = 2.0 * min(b.x, b.y);
  float radio = RADIO * lado;
  float d = dMin;
  float cobertura = clamp(0.5 - d * uDpr, 0.0, 1.0);
  if (cobertura <= 0.0) {
    fragColor = vec4(0.0, 0.0, 0.0, sombra);
    return;
  }
  float brillo = uBrillo[iMin];

  // ---------- Normal y bisel ----------
  float e = 0.75;
  vec2 n = normalize(vec2(
    sdCaja(c + vec2(e, 0.0), b, radio) - sdCaja(c - vec2(e, 0.0), b, radio),
    sdCaja(c + vec2(0.0, e), b, radio) - sdCaja(c - vec2(0.0, e), b, radio)
  ) + 1e-5);
  // Bisel ancho y curvo (más abombado): la lente ocupa casi un tercio del lado.
  float bisel = 0.32 * lado;
  float k = clamp(-d / bisel, 0.0, 1.0);     // 0 en el borde, 1 adentro
  float borde = 1.0 - k;
  float pendiente = pow(borde, 1.9);

  // ---------- Vidrio líquido: lente transparente ----------
  // El borde dobla fuerte la lava de alrededor (la comprime) y separa los colores; el centro la
  // magnifica apenas. Adentro, un esmerilado muy leve (no un tinte): se sigue viendo el fondo.
  float fuerza = (0.4 + 0.06 * brillo) * lado;
  vec2 desvio = n * fuerza * pendiente;
  vec2 lupa = -c * (0.09 + 0.03 * brillo);
  vec2 P = uOrigen + pc + lupa;
  vec3 col;
  col.r = lava(P + desvio * 1.00, uVentana, uTime).r;
  col.g = lava(P + desvio * 1.08, uVentana, uTime).g;
  col.b = lava(P + desvio * 1.18, uVentana, uTime).b;
  float s = 0.05 * lado;
  vec3 esmerilado = (
    lava(P + desvio + vec2(s, s), uVentana, uTime) +
    lava(P + desvio + vec2(-s, s), uVentana, uTime) +
    lava(P + desvio + vec2(s, -s), uVentana, uTime) +
    lava(P + desvio + vec2(-s, -s), uVentana, uTime)
  ) * 0.25;
  col = mix(col, esmerilado, 0.55 * k);

  // El vidrio levanta apenas lo oscuro y baja apenas lo muy claro (así el símbolo blanco se lee
  // sobre cualquier parte de la lava, sin teñirlo).
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = col * mix(1.0, 0.7, smoothstep(0.45, 0.95, lum) * k) + 0.045 * k;
  col += vec3(1.0, 0.98, 0.95) * (0.025 + 0.035 * brillo) * k;

  // El borde se enciende con lo que tiene detrás (la luz concentrada por la curva).
  col += col * (0.55 + 0.25 * brillo) * pow(borde, 3.0);

  // ---------- Luz ----------
  // Filete brillante en el contorno: fuerte arriba a la izquierda y abajo a la derecha (las dos
  // esquinas opuestas, como el vidrio de iOS), tenue en el resto.
  vec3 blanco = vec3(1.0, 0.985, 0.96);
  vec2 L = normalize(vec2(-0.7, 0.7));
  // Volumen: la curva que mira a la luz (arriba a la izquierda) se aclara y la opuesta se
  // oscurece un poco, en todo el ancho del bisel; eso da el 3D redondeado.
  float cara = dot(n, L);
  float curva = pow(borde, 1.4);
  col += blanco * max(cara, 0.0) * curva * (0.16 + 0.06 * brillo);
  col *= 1.0 - 0.2 * max(-cara, 0.0) * curva;
  float a1 = pow(max(dot(n, L), 0.0), 3.0);
  float a2 = pow(max(dot(n, -L), 0.0), 3.0);
  float linea = smoothstep(1.3, 0.0, abs(d + 0.65));
  float linea2 = smoothstep(0.06 * lado, 0.0, abs(d + 0.03 * lado));
  col += blanco * linea * (0.12 + (0.75 + 0.15 * brillo) * a1 + 0.45 * a2);
  col += blanco * linea2 * (0.1 * a1 + 0.05 * a2);
  // Brillo de arriba sobre la cara (muy suave, ancho).
  float arriba = smoothstep(0.0, 1.0, c.y / b.y) * smoothstep(0.2, 0.9, k);
  col += blanco * 0.035 * arriba;

  float grano = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grano - 0.5) * 0.018;

  col = clamp(col, 0.0, 1.0);
  fragColor = vec4(col * cobertura, cobertura) + (1.0 - cobertura) * vec4(0.0, 0.0, 0.0, sombra);
}
`

export function IconosVidrio({
  contenedor,
}: {
  contenedor: React.RefObject<HTMLElement>
}) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
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
    el.appendChild(canvas)

    const tiles = new Float32Array(MAX * 4)
    // ogl toma un uniform como arreglo solo si el valor es un Array de JS (de vec4 o de números).
    const tilesUniform = Array.from({ length: MAX }, (_, i) =>
      tiles.subarray(i * 4, i * 4 + 4)
    )
    const brillos: number[] = new Array(MAX).fill(0)
    const program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      uniforms: {
        uDpr: { value: dpr },
        uOrigen: { value: new Float32Array([0, 0]) },
        uVentana: {
          value: new Float32Array([window.innerWidth, window.innerHeight]),
        },
        uTime: { value: tiempoLava() },
        uN: { value: 0 },
        uTiles: { value: tilesUniform },
        uBrillo: { value: brillos },
      },
    })
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

    // Solo se dibuja la zona de los íconos (más su sombra): el resto del canvas queda vacío y la
    // placa no calcula píxeles de más. Si la zona cambia, se limpia todo una vez.
    let zonaAnterior = ''
    const tam = () => {
      const r = el.getBoundingClientRect()
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height))
      zonaAnterior = ''
    }
    tam()

    // El brillo entra y sale suave por ícono.
    const brilloSuave = new Float32Array(MAX)
    let raf = 0
    const dibujar = (now: number) => {
      const cont = contenedor.current
      // Con una ventana maximizada encima no se ve el escritorio: no hace falta dibujar.
      if (cont?.querySelector('[data-tapa]')) return
      const rc = el.getBoundingClientRect()
      const nodos = cont
        ? [...cont.querySelectorAll<HTMLElement>('[data-vidrio]')]
        : []
      const n = Math.min(MAX, nodos.length)
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (let i = 0; i < n; i++) {
        const r = nodos[i].getBoundingClientRect()
        tiles[i * 4] = r.left + r.width / 2 - rc.left
        tiles[i * 4 + 1] = rc.bottom - (r.top + r.height / 2)
        tiles[i * 4 + 2] = r.width / 2
        tiles[i * 4 + 3] = r.height / 2
        const m = r.width * 0.45
        x0 = Math.min(x0, r.left - rc.left - m)
        x1 = Math.max(x1, r.right - rc.left + m)
        y0 = Math.min(y0, rc.bottom - r.bottom - m)
        y1 = Math.max(y1, rc.bottom - r.top + m)
        const objetivo = nodos[i].dataset.brillo === '1' ? 1 : 0
        brilloSuave[i] += (objetivo - brilloSuave[i]) * 0.15
        brillos[i] = brilloSuave[i]
      }
      const u = program.uniforms
      ;(u.uOrigen.value as Float32Array)[0] = rc.left
      ;(u.uOrigen.value as Float32Array)[1] = window.innerHeight - rc.bottom
      ;(u.uVentana.value as Float32Array)[0] = window.innerWidth
      ;(u.uVentana.value as Float32Array)[1] = window.innerHeight
      u.uN.value = n
      u.uTime.value = tiempoLava(now)
      if (n === 0) return
      const sx = Math.max(0, Math.floor(x0 * dpr))
      const sy = Math.max(0, Math.floor(y0 * dpr))
      const sw = Math.ceil((x1 - x0) * dpr)
      const sh = Math.ceil((y1 - y0) * dpr)
      const zona = `${sx},${sy},${sw},${sh}`
      if (zona !== zonaAnterior) {
        gl.disable(gl.SCISSOR_TEST)
        gl.clear(gl.COLOR_BUFFER_BIT)
        zonaAnterior = zona
      }
      gl.enable(gl.SCISSOR_TEST)
      gl.scissor(sx, sy, sw, sh)
      renderer.render({ scene: mesh })
      gl.disable(gl.SCISSOR_TEST)
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
    // Un cuadro de entrada aunque la pestaña no esté visible (después sigue el bucle).
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
      className="pointer-events-none absolute inset-0"
    />
  )
}
