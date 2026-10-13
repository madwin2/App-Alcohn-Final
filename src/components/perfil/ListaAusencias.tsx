import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { puedeEditarAusencia } from '@/lib/equipo/ausencias';
import type { AusenciaEquipo } from '@/lib/supabase/services/equipoCalendario.service';
import { BotonIcono, Etiqueta } from '@/components/perfil/perfilUi';

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fmtCorto(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${MESES_CORTOS[Number(m) - 1] ?? m}`;
}

/** Cuántos pasados se ven antes de "Ver todos". */
const PASADOS_VISIBLES = 4;

interface ListaAusenciasProps {
  ausencias: AusenciaEquipo[];
  /** Usuario que está mirando (define qué puede editar un no admin). */
  viewerUserId: string;
  esAdmin: boolean;
  hoy: string;
  vacioTexto?: string;
  /** En fila ancha: los ítems se reparten en columnas. */
  horizontal?: boolean;
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
  horizontal = false,
  onEditar,
  onBorrar,
}: ListaAusenciasProps) {
  const [verPasados, setVerPasados] = useState(false);

  if (ausencias.length === 0) {
    return <p className="text-sm text-muted-foreground">{vacioTexto}</p>;
  }

  // Lo más cercano primero; los pasados quedan del más reciente al más viejo.
  const proximas = ausencias
    .filter((a) => a.fechaHasta >= hoy)
    .sort((a, b) => a.fechaDesde.localeCompare(b.fechaDesde));
  const pasadas = ausencias.filter((a) => a.fechaHasta < hoy);
  const visiblesPasados = horizontal ? PASADOS_VISIBLES * 2 : PASADOS_VISIBLES;
  const pasadasVisibles = verPasados ? pasadas : pasadas.slice(0, visiblesPasados);
  const lista = horizontal
    ? 'grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
    : 'space-y-1.5';

  const fila = (a: AusenciaEquipo) => {
    const editable = puedeEditarAusencia(a, viewerUserId, esAdmin, hoy);
    return (
      <li key={a.id} className="group flex items-start justify-between gap-2 rounded-2xl bg-white/[0.03] px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-sm">
            {a.tipo === 'vacaciones'
              ? a.fechaDesde === a.fechaHasta
                ? fmtCorto(a.fechaDesde)
                : `${fmtCorto(a.fechaDesde)} – ${fmtCorto(a.fechaHasta)}`
              : fmtCorto(a.fechaDesde)}
          </p>
          <p className="text-xs text-muted-foreground">
            {a.tipo === 'vacaciones'
              ? 'Vacaciones'
              : a.fechaRecupero
                ? `Cambio de día · recupera ${fmtCorto(a.fechaRecupero)}`
                : 'Cambio de día · sin recupero'}
          </p>
          {a.nota ? <p className="mt-0.5 text-xs text-muted-foreground/80">{a.nota}</p> : null}
        </div>
        {editable ? (
          <div className="flex shrink-0 opacity-60 transition-opacity group-hover:opacity-100">
            <BotonIcono label="Editar" onClick={() => onEditar(a)}>
              <Pencil />
            </BotonIcono>
            <BotonIcono label="Borrar" peligro onClick={() => onBorrar(a)}>
              <Trash2 />
            </BotonIcono>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      {proximas.length > 0 ? (
        <div>
          <Etiqueta>Próximos</Etiqueta>
          <ul className={lista}>{proximas.map(fila)}</ul>
        </div>
      ) : null}
      {pasadas.length > 0 ? (
        <div>
          <Etiqueta
            right={
              pasadas.length > visiblesPasados ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setVerPasados((v) => !v)}
                >
                  {verPasados ? 'Ver menos' : `Ver todos (${pasadas.length})`}
                </button>
              ) : null
            }
          >
            Pasados
          </Etiqueta>
          <ul className={lista}>{pasadasVisibles.map(fila)}</ul>
        </div>
      ) : null}
    </div>
  );
}
