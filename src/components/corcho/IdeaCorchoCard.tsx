import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Loader2, MessageCircle, ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/cn';
import {
  conteoVotos,
  fechaRelativaCorcho,
  puedeVotarIdea,
  type ValorVotoCorcho,
} from '@/lib/equipo/corcho';
import type { IdeaCorcho } from '@/lib/supabase/services/equipoCorcho.service';
import { AvatarPersona, Chinche, SelloEstado, colorPapel } from '@/components/corcho/corchoUi';

const VISTA_MS = 1000;

export interface IdeaCorchoCardProps {
  idea: IdeaCorcho;
  viewerUserId: string;
  autorNombre: string;
  autorColor: string;
  /** Mantener "Nueva" en esta sesión aunque ya se marcó vista en DB. */
  mostrarNueva: boolean;
  nombresPorUserId: Record<string, string>;
  miVoto: ValorVotoCorcho | null;
  voting?: boolean;
  onVotar: (valor: ValorVotoCorcho) => void;
  onMarcarVista: () => void;
  /** Abre la idea en grande (texto completo, votantes, comentarios, acciones). */
  onAbrir: () => void;
  /** Posición en el tablero: escalona la animación de entrada. */
  indice?: number;
}

export function IdeaCorchoCard({
  idea,
  viewerUserId,
  autorNombre,
  autorColor,
  mostrarNueva,
  nombresPorUserId,
  miVoto,
  voting,
  onVotar,
  onMarcarVista,
  onAbrir,
  indice = 0,
}: IdeaCorchoCardProps) {
  const ref = useRef<HTMLElement | null>(null);
  const markedRef = useRef(false);
  const [visibleSince, setVisibleSince] = useState<number | null>(null);

  const descartada = idea.estado === 'descartada';
  const puedeVotar = puedeVotarIdea(idea, viewerUserId);
  const { up, down } = conteoVotos(idea.votos);
  const cantComentarios = idea.comentarios.length;

  useEffect(() => {
    const el = ref.current;
    if (!el || !mostrarNueva || markedRef.current) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
          setVisibleSince((prev) => prev ?? Date.now());
        } else {
          setVisibleSince(null);
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [mostrarNueva, idea.id]);

  useEffect(() => {
    if (!mostrarNueva || markedRef.current || visibleSince == null) return;
    const left = VISTA_MS - (Date.now() - visibleSince);
    const t = window.setTimeout(() => {
      if (markedRef.current) return;
      markedRef.current = true;
      onMarcarVista();
    }, Math.max(0, left));
    return () => window.clearTimeout(t);
  }, [visibleSince, mostrarNueva, onMarcarVista]);

  const upVoters = idea.votos
    .filter((v) => v.valor === 1)
    .map((v) => nombresPorUserId[v.userId] || 'Alguien');
  const downVoters = idea.votos
    .filter((v) => v.valor === -1)
    .map((v) => nombresPorUserId[v.userId] || 'Alguien');

  const giro = giroPorId(idea.id);
  const papel = colorPapel(autorColor, 20);
  const papelSombra = colorPapel(autorColor, 30);

  const abrir = () => {
    onAbrir();
    if (mostrarNueva && !markedRef.current) {
      markedRef.current = true;
      onMarcarVista();
    }
  };

  return (
    <article
      ref={ref}
      className={cn(
        'corcho-nota group relative flex flex-col gap-3 rounded-[6px] px-4 pb-3 pt-5 text-zinc-900',
        // Papel apoyado: sombra corta de contacto + sombra larga suave.
        'shadow-[0_1px_1px_rgba(40,20,5,0.18),0_8px_16px_-6px_rgba(40,20,5,0.4),0_22px_34px_-14px_rgba(40,20,5,0.4)]',
        'hover:shadow-[0_1px_1px_rgba(40,20,5,0.14),0_16px_26px_-8px_rgba(40,20,5,0.45),0_34px_50px_-18px_rgba(40,20,5,0.45)]',
        descartada && 'opacity-[0.85] saturate-[0.25]',
      )}
      style={
        {
          '--giro': `${giro}deg`,
          animationDelay: `${Math.min(indice, 16) * 45}ms`,
          background: `linear-gradient(172deg, ${papel} 0%, ${papel} 65%, ${papelSombra} 100%)`,
        } as CSSProperties
      }
    >
      <Chinche />

      <div className="flex items-center gap-2.5">
        <AvatarPersona nombre={autorNombre} color={autorColor} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs font-semibold text-zinc-800">{autorNombre}</p>
          <p className="truncate text-[11px] text-zinc-500">{fechaRelativaCorcho(idea.createdAt)}</p>
        </div>
        {mostrarNueva ? (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-950 px-2.5 py-1 text-[11px] font-semibold leading-none text-white shadow-sm"
            title="Todavía no la habías visto"
          >
            <span className="size-1.5 rounded-full bg-amber-400" />
            Nueva
          </span>
        ) : null}
      </div>

      <button
        type="button"
        className="-mx-1 rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
        onClick={abrir}
        aria-label={`Abrir la idea “${idea.titulo}”`}
      >
        <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-zinc-950">
          {idea.titulo}
        </h3>
        {idea.descripcion ? (
          <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700">
            {idea.descripcion}
          </p>
        ) : null}
      </button>

      {idea.estado !== 'propuesta' ? (
        <div className="space-y-2">
          <SelloEstado estado={idea.estado} className="my-1 ml-1" />
          {idea.comentarioEstado ? (
            <p className="line-clamp-2 border-l-2 border-zinc-900/15 pl-2.5 text-xs italic leading-relaxed text-zinc-600">
              {idea.comentarioEstado}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="-mx-1.5 mt-auto flex items-center gap-0.5 border-t border-zinc-900/[0.08] pt-2">
        <TooltipProvider delayDuration={200}>
          <BotonVoto
            activo={miVoto === 1}
            puedeVotar={puedeVotar}
            voting={voting}
            cantidad={up}
            tono="up"
            onClick={() => onVotar(1)}
            tooltip={upVoters.length ? `👍 ${upVoters.join(', ')}` : 'Todavía nadie votó a favor'}
          />
          <BotonVoto
            activo={miVoto === -1}
            puedeVotar={puedeVotar}
            voting={false}
            cantidad={down}
            tono="down"
            onClick={() => onVotar(-1)}
            tooltip={
              downVoters.length ? `👎 ${downVoters.join(', ')}` : 'Todavía nadie votó en contra'
            }
          />
        </TooltipProvider>

        <button
          type="button"
          onClick={abrir}
          className={cn(
            'ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium tabular-nums transition-colors hover:bg-zinc-900/[0.06]',
            cantComentarios ? 'text-zinc-800' : 'text-zinc-500',
          )}
          aria-label={
            cantComentarios
              ? `${cantComentarios} ${cantComentarios === 1 ? 'comentario' : 'comentarios'}`
              : 'Comentar'
          }
          title={cantComentarios ? 'Ver comentarios' : 'Comentar'}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {cantComentarios || null}
        </button>
      </div>
    </article>
  );
}

/**
 * Si no podés votar (idea propia o descartada) se muestra el conteo como texto,
 * no como botón deshabilitado: así el tooltip con los nombres sigue funcionando.
 */
function BotonVoto({
  activo,
  puedeVotar,
  voting,
  cantidad,
  tono,
  onClick,
  tooltip,
}: {
  activo: boolean;
  puedeVotar: boolean;
  voting?: boolean;
  cantidad: number;
  tono: 'up' | 'down';
  onClick: () => void;
  tooltip: string;
}) {
  const Icono = tono === 'up' ? ThumbsUp : ThumbsDown;
  const icono = voting ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
  ) : (
    <Icono className="h-3.5 w-3.5" />
  );
  const colorActivo = tono === 'up' ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {puedeVotar ? (
          <button
            type="button"
            disabled={voting}
            className={cn(
              BOTON_VOTO,
              activo ? colorActivo : 'text-zinc-700 hover:bg-zinc-900/[0.06] hover:text-zinc-950',
            )}
            onClick={onClick}
            aria-label={tono === 'up' ? 'Me gusta' : 'No me gusta'}
            aria-pressed={activo}
          >
            {icono}
            {cantidad}
          </button>
        ) : (
          <span
            tabIndex={0}
            className={cn(BOTON_VOTO, 'cursor-default text-zinc-500')}
            aria-label={`${cantidad} ${tono === 'up' ? 'a favor' : 'en contra'}`}
          >
            <Icono className="h-3.5 w-3.5" />
            {cantidad}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

const BOTON_VOTO =
  'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-50';

/** Giro leve y estable por idea (entre -1.6° y 1.6°) para que parezca pegada a mano. */
function giroPorId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 33) - 16) / 10;
}
