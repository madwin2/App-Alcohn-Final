import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Pencil, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/cn';
import {
  conteoVotos,
  puedeVotarIdea,
  puntajeIdea,
  type ValorVotoCorcho,
} from '@/lib/equipo/corcho';
import type { IdeaCorcho } from '@/lib/supabase/services/equipoCorcho.service';

const VISTA_MS = 1000;

export interface IdeaCorchoCardProps {
  idea: IdeaCorcho;
  viewerUserId: string;
  autorNombre: string;
  autorColor: string;
  /** Mantener "Nueva" en esta sesión aunque ya se marcó vista en DB. */
  mostrarNueva: boolean;
  nombresPorUserId: Record<string, string>;
  esAdmin: boolean;
  miVoto: ValorVotoCorcho | null;
  voting?: boolean;
  onVotar: (valor: ValorVotoCorcho) => void;
  onMarcarVista: () => void;
  onEditar?: () => void;
  onBorrar?: () => void;
  onAprobar?: () => void;
  onDescartar?: () => void;
  onVolverPropuesta?: () => void;
  onAbrir?: () => void;
}

export function IdeaCorchoCard({
  idea,
  viewerUserId,
  autorNombre,
  autorColor,
  mostrarNueva,
  nombresPorUserId,
  esAdmin,
  miVoto,
  voting,
  onVotar,
  onMarcarVista,
  onEditar,
  onBorrar,
  onAprobar,
  onDescartar,
  onVolverPropuesta,
  onAbrir,
}: IdeaCorchoCardProps) {
  const ref = useRef<HTMLElement | null>(null);
  const markedRef = useRef(false);
  const [visibleSince, setVisibleSince] = useState<number | null>(null);

  const descartada = idea.estado === 'descartada';
  const aprobada = idea.estado === 'aprobada';
  const puedeVotar = puedeVotarIdea(idea, viewerUserId);
  const { up, down } = conteoVotos(idea.votos);
  const puntaje = puntajeIdea(idea.votos);
  const esPropia = idea.autorUserId === viewerUserId;
  const puedeEditar = esPropia && idea.estado === 'propuesta';

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

  return (
    <article
      ref={ref}
      className={cn(
        'relative flex flex-col gap-2 rounded-sm border-2 bg-[#fff8e7] p-4 pt-5 text-zinc-900 shadow-md transition',
        descartada && 'opacity-50 grayscale',
        aprobada && 'ring-2 ring-emerald-500/50',
      )}
      style={{ borderColor: autorColor }}
    >
      {/* Chinche */}
      <span
        className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full shadow-md ring-2 ring-black/10"
        style={{ backgroundColor: autorColor }}
        title={autorNombre}
        aria-hidden
      />

      {mostrarNueva ? (
        <span className="absolute -right-2 -top-2 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-900 shadow">
          Nueva
        </span>
      ) : null}

      {aprobada ? (
        <span className="inline-flex w-fit items-center gap-1 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          <Check className="h-3 w-3" /> La vamos a hacer
        </span>
      ) : null}

      {descartada ? (
        <span className="inline-flex w-fit rounded bg-zinc-500/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          Descartada
        </span>
      ) : null}

      <button
        type="button"
        className="text-left"
        onClick={() => {
          onAbrir?.();
          if (mostrarNueva && !markedRef.current) {
            markedRef.current = true;
            onMarcarVista();
          }
        }}
      >
        <h3 className="text-sm font-semibold leading-snug">{idea.titulo}</h3>
        {idea.descripcion ? (
          <p className="mt-1 line-clamp-4 text-xs text-zinc-700 whitespace-pre-wrap">
            {idea.descripcion}
          </p>
        ) : null}
      </button>

      <p className="text-[11px] text-zinc-500">{autorNombre}</p>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-zinc-900/10 pt-2">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!puedeVotar || voting || !!descartada}
                className={cn(
                  'h-7 gap-1 px-2 text-xs text-zinc-800',
                  miVoto === 1 && 'bg-emerald-500/20 text-emerald-800',
                )}
                onClick={() => onVotar(1)}
                aria-label="Me gusta"
              >
                {voting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ThumbsUp className="h-3.5 w-3.5" />
                )}
                {up}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {upVoters.length
                ? `👍 ${upVoters.join(', ')}`
                : 'Todavía nadie votó a favor'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!puedeVotar || voting || !!descartada}
                className={cn(
                  'h-7 gap-1 px-2 text-xs text-zinc-800',
                  miVoto === -1 && 'bg-rose-500/20 text-rose-800',
                )}
                onClick={() => onVotar(-1)}
                aria-label="No me gusta"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
                {down}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {downVoters.length
                ? `👎 ${downVoters.join(', ')}`
                : 'Todavía nadie votó en contra'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="ml-auto text-[11px] tabular-nums text-zinc-500">
          {puntaje > 0 ? `+${puntaje}` : puntaje}
        </span>
      </div>

      {(puedeEditar || esAdmin) && (
        <div className="flex flex-wrap gap-1">
          {puedeEditar ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-zinc-700"
                onClick={onEditar}
              >
                <Pencil className="mr-1 h-3 w-3" /> Editar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-rose-700"
                onClick={onBorrar}
              >
                <Trash2 className="mr-1 h-3 w-3" /> Borrar
              </Button>
            </>
          ) : null}
          {esAdmin ? (
            <>
              {idea.estado !== 'aprobada' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-emerald-800"
                  onClick={onAprobar}
                >
                  Aprobar
                </Button>
              ) : null}
              {idea.estado !== 'descartada' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-zinc-600"
                  onClick={onDescartar}
                >
                  Descartar
                </Button>
              ) : null}
              {idea.estado !== 'propuesta' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-zinc-600"
                  onClick={onVolverPropuesta}
                >
                  Volver a propuesta
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      )}

      {idea.comentarioEstado ? (
        <p className="text-[11px] italic text-zinc-600">“{idea.comentarioEstado}”</p>
      ) : null}
    </article>
  );
}
