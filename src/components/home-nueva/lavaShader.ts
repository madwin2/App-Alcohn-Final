/**
 * Shader del fondo de lava de la Home nueva, compartido entre el fondo (`FondoFluido`) y el
 * vidrio líquido (`VidrioLiquido`). El vidrio vuelve a calcular el MISMO fondo en coordenadas
 * desviadas, así la refracción es real (no una copia de pantalla) y siempre está sincronizada.
 *
 * `lava(frag, res, time)`: color del fondo en el punto `frag` (px CSS desde abajo a la izquierda
 * de la ventana), para una ventana de tamaño `res` y el tiempo `time` (segundos).
 */

/** Reloj común: los dos shaders usan el mismo instante (arranca en un momento al azar). */
const OFFSET = Math.random() * 1000
const T0 = performance.now()
export const tiempoLava = (now: number = performance.now()) =>
  OFFSET + (now - T0) / 1000

export const LAVA_GLSL = /* glsl */ `
// Escala de calor (como fuego o metal fundido): de negro a crema pasando por los naranjas.
const vec3 C0 = vec3(0.035, 0.024, 0.020); // #090605 negro cálido
const vec3 C1 = vec3(0.200, 0.055, 0.020); // #330e05 marrón rojizo muy oscuro
const vec3 C2 = vec3(0.580, 0.190, 0.040); // #94300a naranja quemado profundo
const vec3 C3 = vec3(0.878, 0.420, 0.090); // #e06b17 naranja intenso
const vec3 C4 = vec3(0.965, 0.640, 0.240); // #f6a33d ámbar
const vec3 C5 = vec3(1.000, 0.900, 0.700); // #ffe6b3 crema (núcleo)

vec3 calor(float h) {
  vec3 c = C0;
  c = mix(c, C1, smoothstep(0.00, 0.18, h));
  c = mix(c, C2, smoothstep(0.15, 0.40, h));
  c = mix(c, C3, smoothstep(0.35, 0.62, h));
  c = mix(c, C4, smoothstep(0.58, 0.82, h));
  c = mix(c, C5, smoothstep(0.80, 1.00, h));
  return c;
}

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash(i), f), dot(hash(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
             mix(dot(hash(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}

// Manchas: cada una con su zona, su tamaño y su recorrido lento.
const int N_MANCHAS = 4;

vec3 lava(vec2 frag, vec2 res, float time) {
  vec2 uv = frag / res;
  float ratio = res.x / res.y;
  vec2 p = (frag - 0.5 * res) / res.y;
  float t = time * 0.05;

  // Deformación orgánica en dos pasos: el ruido empuja al ruido, y cambia con el tiempo.
  vec2 w1 = vec2(noise(p * 1.1 + vec2(0.0, t * 0.5)), noise(p * 1.1 + vec2(4.1, 7.3) - t * 0.45));
  vec2 w2 = vec2(noise(p * 1.7 + w1 * 1.5 + vec2(1.7, 9.2) + t * 0.3),
                 noise(p * 1.7 + w1 * 1.5 + vec2(8.3, 2.8) - t * 0.35));
  vec2 q = p + 0.42 * w1 + 0.3 * w2;

  float campo = 0.0;
  for (int i = 0; i < N_MANCHAS; i++) {
    float fi = float(i);
    // Cada mancha tiene su zona, repartidas a lo ancho de la pantalla, y orbita alrededor.
    vec2 zona = vec2(ratio * (fi / float(N_MANCHAS - 1) - 0.5) * 0.8, (mod(fi, 2.0) - 0.5) * 0.3);
    vec2 c = zona + vec2(
      0.13 * ratio * sin(t * (0.31 + 0.07 * fi) + fi * 1.7),
      0.22 * sin(t * (0.23 + 0.05 * fi) + fi * 2.9 + 0.8)
    );
    // Cada mancha es un óvalo que se estira, se encoge y gira de a poco.
    float ang = t * (0.25 + 0.06 * fi) + fi * 1.1;
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    float estira = 1.0 + 0.6 * sin(t * (0.5 + 0.1 * fi) + fi * 2.3);
    vec2 d = rot * (q - c);
    d *= vec2(1.0 / estira, estira);
    float r = 0.42 + 0.07 * sin(t * 0.4 + fi * 1.3);
    campo += exp(-dot(d, d) / (r * r));
  }

  // Escala de calor; donde dos manchas se superponen, el núcleo se calienta más.
  float h = smoothstep(0.1, 1.7, campo) + 0.1 * noise(q * 1.6 - vec2(t * 0.3, t * 0.2) + 11.0);
  vec3 col = calor(clamp(h, 0.0, 1.0));

  // Leve caída hacia abajo para que el contenido se lea.
  col *= mix(0.75, 1.0, smoothstep(0.0, 0.5, uv.y));
  return col;
}
`
