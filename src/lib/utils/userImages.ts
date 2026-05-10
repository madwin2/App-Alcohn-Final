/**
 * Mapeo de usuarios a sus imágenes de perfil ("Perfil") y de bienvenida ("Inicio").
 *
 * Las imágenes viven en `public/usuarios/` y se sirven como assets estáticos.
 * Usamos un matcher por nombre normalizado (sin acentos, en minúsculas) para
 * tolerar distintas variantes con/sin tilde, mayúsculas, etc.
 */

interface UserImageEntry {
  /** Substrings (ya normalizados) que deben aparecer en el nombre completo. */
  match: string[];
  perfil: string;
  inicio: string;
}

const USER_IMAGES: UserImageEntry[] = [
  {
    match: ['julian', 'moreno'],
    perfil: '/usuarios/julian-moreno-perfil.png',
    inicio: '/usuarios/julian-moreno-inicio.png',
  },
  {
    match: ['julian', 'bobasso'],
    perfil: '/usuarios/julian-bobasso-perfil.png',
    inicio: '/usuarios/julian-bobasso-inicio.png',
  },
  {
    match: ['federico', 'minuto'],
    perfil: '/usuarios/federico-minuto-perfil.png',
    inicio: '/usuarios/federico-minuto-inicio.png',
  },
  {
    // Lautaro "Cachi" Albornoz: matcheamos por el apellido "Albornoz"
    match: ['albornoz'],
    perfil: '/usuarios/cachi-albornoz-perfil.png',
    inicio: '/usuarios/cachi-albornoz-inicio.png',
  },
];

function normalize(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function findEntry(name: string | null | undefined): UserImageEntry | null {
  const normalized = normalize(name);
  if (!normalized) return null;
  for (const entry of USER_IMAGES) {
    const allMatch = entry.match.every((token) => normalized.includes(token));
    if (allMatch) return entry;
  }
  return null;
}

/** URL de la foto de perfil del usuario, o `null` si no tiene foto asignada. */
export function getUserProfileImage(name: string | null | undefined): string | null {
  return findEntry(name)?.perfil ?? null;
}

/** URL de la foto "Inicio" (cuerpo entero) del usuario, o `null` si no tiene foto. */
export function getUserInicioImage(name: string | null | undefined): string | null {
  return findEntry(name)?.inicio ?? null;
}

/** Iniciales tomadas del nombre completo (máx. 2). */
export function getUserInitials(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}
