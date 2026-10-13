import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Check,
  Loader2,
  Pencil,
  RotateCcw,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/cn';
import {
  conteoVotos,
  fechaCortaCorcho,
  fechaRelativaCorcho,
  puedeBorrarIdea,
  puedeEditarIdea,
  puedeVotarIdea,
  type EstadoIdeaCorcho,
  type ValorVotoCorcho,
} from '@/lib/equipo/corcho';
import {
  MAX_COMENTARIO_CORCHO,
  type IdeaCorcho,
} from '@/lib/supabase/services/equipoCorcho.service';
import {
  AvatarPersona,
  BOTON_PAPEL,
  BOTON_TINTA,
  CAMPO_PAPEL,
  Chinche,
  DIALOGO_PAPEL,
  SelloEstado,
  colorPapel,
} from '@/components/corcho/corchoUi';

export interface IdeaCorchoDialogProps {
  idea: IdeaCorcho | null;
  onClose: () => void;
  viewerUserId: string;
  esAdmin: boolean;
  nombresPorUserId: Record<string, string>;
  colorPorUserId: Record<string, string>;
  miVoto: ValorVotoCorcho | null;
  voting: boolean;
  onVotar: (valor: ValorVotoCorcho) => void;
  onEditar: () => void;
  onBorrar: () => void;
  onCambiarEstado: (estado: EstadoIdeaCorcho, comentario: string) => Promise<boolean>;
  onComentar: (texto: string) => Promise<boolean>;
  onBorrarComentario: (comentarioId: string) => void;
}

const TEXTO_ESTADO: Record<
  EstadoIdeaCorcho,
  { titulo: string; boton: string; placeholder: string }
> = {
  aprobada: {
    titulo: 'Aprobar idea',
    boton: 'Aprobar',
    placeholder: 'Por qué se aprueba, cuándo arranca, quién la lleva…',
  },
  descartada: {
    titulo: 'Descartar idea',
    boton: 'Descartar',
    placeholder: 'Por qué se descarta (le llega al autor)…',
  },
  propuesta: {
    titulo: 'Volver a propuesta',
    boton: 'Volver a propuesta',
    placeholder: 'Por qué vuelve a estar en discusión…',
  },
};

/** La idea en grande: una nota de papel con texto completo, votos, comentarios y acciones. */
export function IdeaCorchoDialog({
  idea,
  onClose,
  viewerUserId,
  esAdmin,
  nombresPorUserId,
  colorPorUserId,
  miVoto,
  voting,
  onVotar,
  onEditar,
  onBorrar,
  onCambiarEstado,
  onComentar,
  onBorrarComentario,
}: IdeaCorchoDialogProps) {
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [estadoPendiente, setEstadoPendiente] = useState<EstadoIdeaCorcho | null>(null);
  const [comentarioEstado, setComentarioEstado] = useState('');
  const [guardandoEstado, setGuardandoEstado] = useState(false);

  const ideaId = idea?.id;
  useEffect(() => {
    setComentario('');
    setEstadoPendiente(null);
  }, [ideaId]);

  if (!idea) return null;

  const nombre = (userId: string | null) =>
    (userId && nombresPorUserId[userId]) || 'Alguien';
  const color = (userId: string) => colorPorUserId[userId] || '#9CA3AF';

  const autorColor = color(idea.autorUserId);
  const autorNombre = nombre(idea.autorUserId);
  const { up, down } = conteoVotos(idea.votos);
  const puedeVotar = puedeVotarIdea(idea, viewerUserId);
  const esPropia = idea.autorUserId === viewerUserId;
  const puedeEditar = puedeEditarIdea(idea, viewerUserId);
  const puedeBorrar = puedeBorrarIdea(idea, viewerUserId);
  const upVoters = idea.votos.filter((v) => v.valor === 1).map((v) => nombre(v.userId));
  const downVoters = idea.votos.filter((v) => v.valor === -1).map((v) => nombre(v.userId));

  const abrirCambioEstado = (estado: EstadoIdeaCorcho) => {
    // Se precarga el comentario actual: así no se pierde sin querer el "por qué".
    setComentarioEstado(idea.comentarioEstado ?? '');
    setEstadoPendiente(estado);
  };

  const confirmarEstado = async () => {
    if (!estadoPendiente) return;
    setGuardandoEstado(true);
    const ok = await onCambiarEstado(estadoPendiente, comentarioEstado);
    setGuardandoEstado(false);
    if (ok) setEstadoPendiente(null);
  };

  const enviarComentario = async (e?: FormEvent) => {
    e?.preventDefault();
    const texto = comentario.trim();
    if (!texto || enviando) return;
    setEnviando(true);
    const ok = await onComentar(texto);
    setEnviando(false);
    if (ok) setComentario('');
  };

  const accionesAutor = esPropia && idea.estado === 'propuesta';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !enviando && !guardandoEstado) onClose();
      }}
    >
      <DialogContent
        className={cn(DIALOGO_PAPEL, 'gap-0 overflow-visible p-0 sm:max-w-xl')}
        style={{ background: colorPapel(autorColor, 14) }}
      >
        <Chinche className="!-top-2 scale-125" />

        <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          {/* Encabezado + texto */}
          <div className="space-y-4 px-6 pb-5 pt-7 sm:px-8">
            <div className="flex items-start gap-3 pr-6">
              <AvatarPersona nombre={autorNombre} color={autorColor} size="lg" />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold text-zinc-800">{autorNombre}</p>
                <p
                  className="text-xs text-zinc-500"
                  title={new Date(idea.createdAt).toLocaleString('es-AR')}
                >
                  {fechaCortaCorcho(idea.createdAt)} · {fechaRelativaCorcho(idea.createdAt)}
                </p>
              </div>
              <SelloEstado estado={idea.estado} grande className="mr-2 mt-1 shrink-0" />
            </div>

            <div className="space-y-2.5">
              <DialogTitle className="text-2xl font-semibold leading-tight tracking-tight text-zinc-950">
                {idea.titulo}
              </DialogTitle>
              {idea.descripcion ? (
                <DialogDescription className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">
                  {idea.descripcion}
                </DialogDescription>
              ) : (
                <DialogDescription className="text-sm italic text-zinc-500">
                  Sin descripción.
                </DialogDescription>
              )}
            </div>

            {idea.estado !== 'propuesta' || idea.comentarioEstado ? (
              <div className="border-l-2 border-zinc-900/15 pl-3.5 text-sm">
                {idea.estado !== 'propuesta' ? (
                  <p className="font-medium text-zinc-800">
                    {idea.estado === 'aprobada' ? 'La vamos a hacer' : 'Descartada'}
                    {idea.estadoCambiadoAt ? (
                      <span className="font-normal text-zinc-500">
                        {' '}· {nombre(idea.estadoCambiadoPor)}, {fechaCortaCorcho(idea.estadoCambiadoAt)}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {idea.comentarioEstado ? (
                  <p className="mt-0.5 whitespace-pre-wrap italic leading-relaxed text-zinc-600">
                    {idea.comentarioEstado}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Votos con nombres (en celular no hay tooltip: acá se ve todo). */}
          <Seccion>
            <div className="flex flex-wrap items-center gap-2">
              <BotonVotoGrande
                tono="up"
                activo={miVoto === 1}
                cantidad={up}
                puedeVotar={puedeVotar}
                voting={voting}
                onClick={() => onVotar(1)}
              />
              <BotonVotoGrande
                tono="down"
                activo={miVoto === -1}
                cantidad={down}
                puedeVotar={puedeVotar}
                voting={voting}
                onClick={() => onVotar(-1)}
              />
              {!puedeVotar ? (
                <span className="ml-1 text-xs text-zinc-500">
                  {esPropia ? 'Tu propia idea no se vota.' : 'Las descartadas no se votan.'}
                </span>
              ) : null}
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-zinc-500">A favor</dt>
              <dd className="text-zinc-800">{upVoters.length ? upVoters.join(', ') : '—'}</dd>
              <dt className="text-zinc-500">En contra</dt>
              <dd className="text-zinc-800">{downVoters.length ? downVoters.join(', ') : '—'}</dd>
            </dl>
          </Seccion>

          {/* Comentarios: opcionales, se puede comentar o solo votar. */}
          <Seccion>
            <h4 className="text-sm font-semibold text-zinc-900">
              Comentarios
              {idea.comentarios.length ? (
                <span className="ml-1.5 font-normal text-zinc-500">{idea.comentarios.length}</span>
              ) : null}
            </h4>
            {idea.comentarios.length ? (
              <ul className="mt-3 space-y-4">
                {idea.comentarios.map((c) => {
                  const puedeBorrarC = c.autorUserId === viewerUserId || esAdmin;
                  return (
                    <li key={c.id} className="group flex gap-2.5">
                      <AvatarPersona nombre={nombre(c.autorUserId)} color={color(c.autorUserId)} size="sm" className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-tight">
                          <span className="font-semibold text-zinc-800">{nombre(c.autorUserId)}</span>{' '}
                          <span className="text-zinc-500">{fechaRelativaCorcho(c.createdAt)}</span>
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">
                          {c.texto}
                        </p>
                      </div>
                      {puedeBorrarC ? (
                        <button
                          type="button"
                          className="size-7 shrink-0 rounded-full text-zinc-400 opacity-0 transition hover:bg-zinc-900/[0.06] hover:text-rose-700 focus-visible:opacity-100 group-hover:opacity-100"
                          onClick={() => onBorrarComentario(c.id)}
                          aria-label="Borrar comentario"
                          title="Borrar comentario"
                        >
                          <X className="mx-auto h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-zinc-500">Nadie comentó todavía.</p>
            )}

            <form onSubmit={(e) => void enviarComentario(e)} className="mt-4 flex items-end gap-2">
              <Textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void enviarComentario();
                }}
                rows={1}
                maxLength={MAX_COMENTARIO_CORCHO}
                placeholder="Sumá un comentario (opcional)…"
                className={cn(CAMPO_PAPEL, 'min-h-10 resize-none rounded-2xl py-2.5 text-sm')}
                title="Ctrl + Enter para enviar"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!comentario.trim() || enviando}
                className={cn(BOTON_TINTA, 'size-10 shrink-0')}
                aria-label="Comentar"
                title="Comentar (Ctrl + Enter)"
              >
                {enviando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </Seccion>

          {/* Acciones: autor (editar/borrar) y admin (estado). */}
          {accionesAutor || esAdmin ? (
            <Seccion className="space-y-3 bg-zinc-900/[0.03] pb-6">
              {accionesAutor ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!puedeEditar}
                    onClick={onEditar}
                    className={cn(BOTON_PAPEL, 'gap-1.5')}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  {puedeBorrar ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onBorrar}
                      className={cn(BOTON_PAPEL, 'gap-1.5 text-rose-700 hover:bg-rose-600/10 hover:text-rose-800')}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Borrar
                    </Button>
                  ) : null}
                  {!puedeEditar ? (
                    <span className="text-xs text-zinc-500">Ya tiene votos: no se puede editar.</span>
                  ) : null}
                </div>
              ) : null}

              {esAdmin ? (
                estadoPendiente ? (
                  <div className="space-y-2.5">
                    <p className="text-sm font-semibold text-zinc-900">
                      {TEXTO_ESTADO[estadoPendiente].titulo}
                    </p>
                    <Textarea
                      value={comentarioEstado}
                      onChange={(e) => setComentarioEstado(e.target.value)}
                      rows={3}
                      placeholder={TEXTO_ESTADO[estadoPendiente].placeholder}
                      className={cn(CAMPO_PAPEL, 'resize-none')}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-zinc-500">Opcional · se ve en la nota.</span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={guardandoEstado}
                          onClick={() => setEstadoPendiente(null)}
                          className="rounded-full text-zinc-700 hover:bg-zinc-900/[0.06] hover:text-zinc-950"
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={guardandoEstado}
                          onClick={() => void confirmarEstado()}
                          className={cn(BOTON_TINTA, 'gap-1.5')}
                        >
                          {guardandoEstado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          {TEXTO_ESTADO[estadoPendiente].boton}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {idea.estado !== 'aprobada' ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => abrirCambioEstado('aprobada')}
                        className="gap-1.5 rounded-full bg-emerald-700 text-white hover:bg-emerald-800"
                      >
                        <Check className="h-3.5 w-3.5" /> Aprobar
                      </Button>
                    ) : null}
                    {idea.estado !== 'descartada' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => abrirCambioEstado('descartada')}
                        className={BOTON_PAPEL}
                      >
                        Descartar
                      </Button>
                    ) : null}
                    {idea.estado !== 'propuesta' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => abrirCambioEstado('propuesta')}
                        className={cn(BOTON_PAPEL, 'gap-1.5')}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Volver a propuesta
                      </Button>
                    ) : null}
                  </div>
                )
              ) : null}
            </Seccion>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Sección de la nota separada por una línea fina (sin recuadros). */
function Seccion({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('border-t border-zinc-900/[0.08] px-6 py-5 sm:px-8', className)}>
      {children}
    </div>
  );
}

function BotonVotoGrande({
  tono,
  activo,
  cantidad,
  puedeVotar,
  voting,
  onClick,
}: {
  tono: 'up' | 'down';
  activo: boolean;
  cantidad: number;
  puedeVotar: boolean;
  voting: boolean;
  onClick: () => void;
}) {
  const Icono = tono === 'up' ? ThumbsUp : ThumbsDown;
  return (
    <button
      type="button"
      disabled={!puedeVotar || voting}
      onClick={onClick}
      aria-pressed={activo}
      aria-label={tono === 'up' ? 'Me gusta' : 'No me gusta'}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold tabular-nums transition-colors disabled:cursor-default',
        activo
          ? tono === 'up'
            ? 'bg-emerald-700 text-white'
            : 'bg-rose-700 text-white'
          : 'bg-zinc-900/[0.06] text-zinc-800 enabled:hover:bg-zinc-900/[0.1] disabled:text-zinc-500',
      )}
    >
      {voting && activo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icono className="h-4 w-4" />}
      {cantidad}
    </button>
  );
}
