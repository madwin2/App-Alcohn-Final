/**
 * Archivos en `public/mockup-textures/` (Vite sirve desde la raíz del sitio).
 * Respeta `import.meta.env.BASE_URL` si el build no está en `/`.
 */
const MOCKUP_TEXTURE_DIR = 'mockup-textures';

export function mockupTextureUrl(filename: string): string {
  const file = filename.replace(/^\/+/, '');
  const rawBase = import.meta.env.BASE_URL ?? '/';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return `${base}${MOCKUP_TEXTURE_DIR}/${file}`;
}

/** Nombres reales en el repo (ver `public/mockup-textures/`). */
export const MOCKUP_TEXTURE_FILES = {
  cuero: ['cuero.jpg.jpeg'] as const,
  madera: ['madera.jpg.jpeg'] as const,
  maderaBurnOverlay: 'madera-quemada.png' as const,
};
