import { useNombreAdmin } from '@/lib/hooks/useNombreAdmin';
import type { PerfilEquipo } from '@/lib/supabase/services/equipo.service';

interface PerfilNoActivoMensajeProps {
  /** null = sin perfil; con perfil pero `activo=false` = desactivado (EQ-R26). */
  perfil: PerfilEquipo | null;
  /** 'corcho' cambia el texto para explicar que el corcho es del equipo (EQ-R13). */
  contexto?: 'perfil' | 'corcho';
}

export function PerfilNoActivoMensaje({
  perfil,
  contexto = 'perfil',
}: PerfilNoActivoMensajeProps) {
  const admin = useNombreAdmin();
  const desactivado = Boolean(perfil && !perfil.activo);

  const titulo = desactivado
    ? 'Tu perfil está desactivado'
    : contexto === 'corcho'
      ? 'El corcho es para el equipo'
      : 'Tu perfil todavía no está armado';

  const detalle = desactivado
    ? `Ya no tenés acceso a esta sección. Si es un error, pedile a ${admin} que lo reactive.`
    : contexto === 'corcho'
      ? `Pedile a ${admin} que arme tu perfil.`
      : `Pedile a ${admin} que lo complete.`;

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-3xl bg-white/[0.035] px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{detalle}</p>
    </div>
  );
}
