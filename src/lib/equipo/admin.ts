export const FALLBACK_NOMBRE_ADMIN = 'el admin';

interface MiembroAdminLike {
  nombre: string;
  esAdmin: boolean;
  activo: boolean;
}

/**
 * Nombre (de pila) del/los admin(s) activo(s) del equipo para textos tipo
 * "Pedile a {admin}" (EQ-R27). Dos admins → "Julián y Fede". Sin admin → "el admin".
 */
export function nombreAdminEquipo(
  miembros: readonly MiembroAdminLike[],
  opts?: { excluirNombre?: string },
): string {
  const nombres = miembros
    .filter((m) => m.esAdmin && m.activo)
    .map((m) => m.nombre.trim().split(/\s+/)[0])
    .filter((n) => n && n.toLowerCase() !== 'usuario');
  const unicos = [...new Set(nombres)].filter((n) => n !== opts?.excluirNombre);
  if (unicos.length === 0) return FALLBACK_NOMBRE_ADMIN;
  if (unicos.length === 1) return unicos[0];
  return `${unicos.slice(0, -1).join(', ')} y ${unicos[unicos.length - 1]}`;
}
