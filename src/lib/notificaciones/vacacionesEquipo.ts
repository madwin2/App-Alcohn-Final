import {
  notifyVacacionesCambiadas,
  notifyVacacionesCanceladas,
} from '@/lib/notificaciones/events';

interface PersonaLike {
  userId: string;
  nombre: string;
}

interface MiembroLike {
  userId: string;
  activo: boolean;
}

function destinatarios(miembros: readonly MiembroLike[], personaUserId: string): string[] {
  return miembros.filter((m) => m.activo && m.userId !== personaUserId).map((m) => m.userId);
}

function primerNombre(p: PersonaLike): string {
  return p.nombre.split(' ')[0] || p.nombre;
}

/** EQ-R14: avisa al equipo activo (menos la persona) que unas vacaciones cambiaron de fechas. */
export function avisarVacacionesCambiadas(params: {
  persona: PersonaLike;
  miembros: readonly MiembroLike[];
  ausenciaId: string;
  fechaDesde: string;
  fechaHasta: string;
}): void {
  notifyVacacionesCambiadas({
    nombre: primerNombre(params.persona),
    fechaDesde: params.fechaDesde,
    fechaHasta: params.fechaHasta,
    destinatarioUserIds: destinatarios(params.miembros, params.persona.userId),
    ausenciaId: params.ausenciaId,
  });
}

/** EQ-R14: avisa al equipo activo (menos la persona) que unas vacaciones se cancelaron. */
export function avisarVacacionesCanceladas(params: {
  persona: PersonaLike;
  miembros: readonly MiembroLike[];
  ausenciaId: string;
  fechaDesde: string;
  fechaHasta: string;
}): void {
  notifyVacacionesCanceladas({
    nombre: primerNombre(params.persona),
    fechaDesde: params.fechaDesde,
    fechaHasta: params.fechaHasta,
    destinatarioUserIds: destinatarios(params.miembros, params.persona.userId),
    ausenciaId: params.ausenciaId,
  });
}
