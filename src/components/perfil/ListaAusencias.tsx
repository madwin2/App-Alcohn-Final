import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { puedeEditarAusencia } from '@/lib/equipo/ausencias';
import type { AusenciaEquipo } from '@/lib/supabase/services/equipoCalendario.service';

function fmtCorto(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

interface ListaAusenciasProps {
  ausencias: AusenciaEquipo[];
  /** Usuario que está mirando (define qué puede editar un no admin). */
  viewerUserId: string;
  esAdmin: boolean;
  hoy: string;
  vacioTexto?: string;
  onEditar: (a: AusenciaEquipo) => void;
  onBorrar: (a: AusenciaEquipo) => void;
}

/** Lista "Próximos / Pasados" de vacaciones y cambios de día, con editar/borrar según permisos. */
export function ListaAusencias({
  ausencias,
  viewerUserId,
  esAdmin,
  hoy,
  vacioTexto = 'Todavía no hay nada cargado.',
  onEditar,
  onBorrar,
}: ListaAusenciasProps) {
  if (ausencias.length === 0) {
    return <p className="text-xs text-muted-foreground">{vacioTexto}</p>;
  }

  const proximas = ausencias.filter((a) => a.fechaHasta >= hoy);
  const pasadas = ausencias.filter((a) => a.fechaHasta < hoy);

  return (
    <div className="space-y-4">
      {[
        { title: 'Próximos', items: proximas },
        { title: 'Pasados', items: pasadas },
      ].map((grupo) =>
        grupo.items.length === 0 ? null : (
          <div key={grupo.title}>
            <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {grupo.title}
            </p>
            <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/10">
              {grupo.items.map((a) => {
                const editable = puedeEditarAusencia(a, viewerUserId, esAdmin, hoy);
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"
                  >
                    <div>
                      <span className="font-medium text-white">
                        {a.tipo === 'vacaciones' ? 'Vacaciones' : 'Cambio de día'}
                      </span>
                      <span className="text-muted-foreground">
                        {' '}
                        ·{' '}
                        {a.tipo === 'vacaciones'
                          ? `${fmtCorto(a.fechaDesde)} – ${fmtCorto(a.fechaHasta)}`
                          : `${fmtCorto(a.fechaDesde)}${
                              a.fechaRecupero
                                ? ` (recupera ${fmtCorto(a.fechaRecupero)})`
                                : ' (sin recupero)'
                            }`}
                      </span>
                      {a.nota ? (
                        <span className="block text-[11px] text-muted-foreground">{a.nota}</span>
                      ) : null}
                    </div>
                    {editable ? (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onEditar(a)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => onBorrar(a)}
                          aria-label="Borrar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}
