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
    <div className="rounded-[20px] border border-white/10 bg-zinc-900/80 px-5 py-12 text-center">
      <h1 className="text-lg font-semibold text-white">{titulo}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{detalle}</p>
    </div>
  );
}
