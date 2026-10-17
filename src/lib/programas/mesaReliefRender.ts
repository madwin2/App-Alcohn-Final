/** Render de la misma superficie con líneas o bronce; un contexto reutilizado para toda la mesa. */
import { MESA_CAMERA, projectRelief, type ReliefMesh } from './mesaRelief';

/** Colores planos del Mecanizado: cara planeada/bruto, rebaje de 3 mm y fondo del corte. */
export const MACHINED_COLORS = { top: '#c2a375', lowered: '#8c704d', cut: '#5e4a33' } as const;

export interface ReliefRender {
  lineHref: string; bronzeHref: string;
  leftMm: number; topMm: number; widthMm: number; heightMm: number;
}

const VERTEX = `
attribute vec3 position;
attribute vec3 normal;
uniform vec4 bounds;
uniform vec4 camera;
uniform float range;
uniform float lineMode;
varying vec3 surfaceNormal;
varying float depth;
void main() {
  float d = -position.z;
  vec2 uv = position.xy + camera.xy * d;
  vec2 screen = (uv - bounds.xy) / bounds.zw;
  float viewZ = camera.z * position.x + camera.w * position.y + position.z;
  gl_Position = vec4(screen.x * 2.0 - 1.0, 1.0 - screen.y * 2.0, -viewZ / range - lineMode * 0.0002, 1.0);
  surfaceNormal = normal;
  depth = d;
}`;
const FRAGMENT = `
precision highp float;
uniform float mode;
uniform float maxDepth;
varying vec3 surfaceNormal;
varying float depth;
void main() {
  if (mode > 1.5) { gl_FragColor = vec4(0.6, 0.6, 0.6, 1.0); return; }
  // Lineal: el diseño (lo que queda arriba, sin tallar) en blanco sólido; lo tallado, negro.
  if (mode < 0.5) { gl_FragColor = depth < 0.012 ? vec4(0.93, 0.93, 0.92, 1.0) : vec4(0.035, 0.035, 0.035, 1.0); return; }
  // Una cara plana (normal hacia arriba) da exactamente el color de la tabla: así
  // empalma sin costura con las cajas CSS de la planchuela (MACHINED_COLORS).
  vec3 n = normalize(surfaceNormal);
  vec3 light = normalize(vec3(-0.45, -0.6, 1.0));
  float shade = clamp(max(0.0, dot(n, light)) / 0.8, 0.35, 1.25);
  vec3 bronze = mix(vec3(0.761, 0.639, 0.459), vec3(0.549, 0.439, 0.302), clamp(depth / maxDepth, 0.0, 1.0));
  gl_FragColor = vec4(bronze * shade, 1.0);
}`;

let renderer: { canvas: HTMLCanvasElement; gl: WebGLRenderingContext; program: WebGLProgram } | null = null;
function getRenderer() {
  if (renderer && !renderer.gl.isContextLost()) return renderer;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('No se pudo iniciar la vista de relieve.');
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message ?? 'Shader inválido'); }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, VERTEX), fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  gl.deleteShader(vertex); gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('No se pudo preparar la vista de relieve.');
  renderer = { canvas, gl, program };
  return renderer;
}

export function renderMachiningMesh(mesh: ReliefMesh): ReliefRender {
  const { canvas, gl, program } = getRenderer();
  const [sx, sy] = projectRelief(0, 0, 1);
  const leftMm = Math.min(0, sx * mesh.maxDepthMm) - 0.12;
  const topMm = Math.min(0, sy * mesh.maxDepthMm) - 0.12;
  const widthMm = mesh.widthMm + Math.abs(sx * mesh.maxDepthMm) + 0.24;
  const heightMm = mesh.heightMm + Math.abs(sy * mesh.maxDepthMm) + 0.24;
  const k = 960 / Math.max(widthMm, heightMm);
  canvas.width = Math.ceil(widthMm * k); canvas.height = Math.ceil(heightMm * k);
  gl.viewport(0, 0, canvas.width, canvas.height); gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  gl.uniform4f(uniform('bounds'), leftMm, topMm, widthMm, heightMm);
  const tilt = MESA_CAMERA.tiltDeg * Math.PI / 180, turn = MESA_CAMERA.turnDeg * Math.PI / 180;
  gl.uniform4f(uniform('camera'), sx, sy, Math.tan(tilt) * Math.sin(turn), Math.tan(tilt) * Math.cos(turn));
  gl.uniform1f(uniform('range'), 3 * (mesh.widthMm + mesh.heightMm + mesh.maxDepthMm));
  gl.uniform1f(uniform('maxDepth'), mesh.maxDepthMm);
  const position = gl.getAttribLocation(program, 'position'), normal = gl.getAttribLocation(program, 'normal');
  // GL.LINES suele quedar limitado a 1 píxel: al reducir la imagen desaparece.
  // Cintas de ancho físico estable conservan el trazo fino al acercar/alejar.
  const ribbons = new Float32Array(mesh.lines.length * 3);
  for (let i = 0, out = 0; i < mesh.lines.length; i += 6) {
    const a = mesh.lines.subarray(i, i + 3), b = mesh.lines.subarray(i + 3, i + 6);
    const dx = b[0] - a[0] - sx * (b[2] - a[2]), dy = b[1] - a[1] - sy * (b[2] - a[2]);
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length * 0.083, ny = dx / length * 0.083;
    for (const [p, sign] of [[a, 1], [a, -1], [b, 1], [b, 1], [a, -1], [b, -1]] as const) {
      ribbons.set([p[0] + nx * sign, p[1] + ny * sign, p[2]], out); out += 3;
    }
  }
  const surfaceBuffer = gl.createBuffer()!, linesBuffer = gl.createBuffer()!;
  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, surfaceBuffer); gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, linesBuffer); gl.bufferData(gl.ARRAY_BUFFER, ribbons, gl.STATIC_DRAW);
    const draw = (bronze: boolean) => {
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(uniform('mode'), bronze ? 1 : 0); gl.uniform1f(uniform('lineMode'), 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, surfaceBuffer);
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(normal); gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / 6);
      if (!bronze) {
        gl.uniform1f(uniform('mode'), 2); gl.uniform1f(uniform('lineMode'), 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, linesBuffer);
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 12, 0);
        gl.disableVertexAttribArray(normal); gl.vertexAttrib3f(normal, 0, 0, 1);
        gl.drawArrays(gl.TRIANGLES, 0, ribbons.length / 3);
      }
      return canvas.toDataURL('image/png');
    };
    return { lineHref: draw(false), bronzeHref: draw(true), leftMm, topMm, widthMm, heightMm };
  } finally { gl.deleteBuffer(surfaceBuffer); gl.deleteBuffer(linesBuffer); }
}
