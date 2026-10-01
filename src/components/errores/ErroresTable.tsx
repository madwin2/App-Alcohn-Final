import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatDateTime } from '@/lib/utils/format';
import {
  updateErrorMotivo,
  type ErrorEventoRow,
} from '@/lib/supabase/services/errores.service';
import {
  REHACER_MOTIVO_LABELS,
  REHACER_MOTIVOS,
  labelRehacerMotivo,
  type RehacerMotivo,
} from '@/lib/supabase/services/rehacer.service';
import { SnapshotFlags } from './ErroresMetricCards';
import {
  enviosTable,
  enviosTd,
  enviosTh,
  enviosThead,
  enviosTr,
} from '@/components/envios/enviosTableStyles';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';

function isSelectableMotivo(motivo: string): motivo is RehacerMotivo {
  return (REHACER_MOTIVOS as readonly string[]).includes(motivo);
}

function MotivoCell({
  row,
  onUpdated,
}: {
  row: ErrorEventoRow;
  onUpdated: (next: ErrorEventoRow) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const selectable = isSelectableMotivo(row.motivo);
  const value = selectable ? row.motivo : undefined;

  const handleChange = async (nextMotivo: RehacerMotivo) => {
    if (nextMotivo === row.motivo) return;
    setSaving(true);
    try {
      await updateErrorMotivo(row.id, nextMotivo);
      onUpdated({
        ...row,
        motivo: nextMotivo,
        motivoLabel: labelRehacerMotivo(nextMotivo),
      });
    } catch (err) {
      toast({
        title: 'No se pudo cambiar el motivo',
        description: err instanceof Error ? err.message : 'Error al actualizar',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="min-w-[200px] max-w-[260px]"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Select
        value={value}
        onValueChange={(v) => void handleChange(v as RehacerMotivo)}
        disabled={saving}
      >
        <SelectTrigger
          className={cn(
            'h-8 border-white/10 bg-transparent px-2 text-left text-[12px] shadow-none',
            'hover:bg-white/[0.04] focus:ring-1 focus:ring-white/20',
            !selectable && 'border-amber-500/35 text-amber-100/90',
          )}
        >
          {saving ? (
            <span className="inline-flex items-center gap-1.5 text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Guardando…
            </span>
          ) : (
            <SelectValue
              placeholder={
                selectable ? 'Motivo…' : `${row.motivoLabel} — elegir`
              }
            />
          )}
        </SelectTrigger>
        <SelectContent>
          {REHACER_MOTIVOS.map((m) => (
            <SelectItem key={m} value={m}>
              {REHACER_MOTIVO_LABELS[m]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ErroresTable({
  rows,
  loading,
  onSelect,
  onUpdated,
}: {
  rows: ErrorEventoRow[];
  loading?: boolean;
  onSelect: (row: ErrorEventoRow) => void;
  onUpdated: (next: ErrorEventoRow) => void;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-white/10 bg-card/30 text-sm text-muted-foreground">
        Cargando errores…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-card/20 text-sm text-muted-foreground">
        No hay rehaceres con estos filtros.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-2xl border border-white/10 bg-card/30">
      <table className={enviosTable}>
        <thead className={enviosThead}>
          <tr>
            <th className={enviosTh}>Fecha</th>
            <th className={enviosTh}>Cliente</th>
            <th className={enviosTh}>Diseño</th>
            <th className={enviosTh}>Motivo</th>
            <th className={enviosTh}>Descripción</th>
            <th className={enviosTh}>Quién</th>
            <th className={enviosTh}>Archivos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const sinDesc = !row.descripcion?.trim();
            return (
              <tr
                key={row.id}
                className={cn(enviosTr, 'cursor-pointer', sinDesc && 'bg-amber-500/[0.03]')}
                onClick={() => onSelect(row)}
              >
                <td className={`${enviosTd} whitespace-nowrap tabular-nums text-zinc-500`}>
                  {formatDateTime(row.createdAt)}
                </td>
                <td className={`${enviosTd} text-zinc-200`}>{row.clienteNombre || '—'}</td>
                <td
                  className={`${enviosTd} max-w-[180px] truncate text-zinc-200`}
                  title={row.disenoNombre}
                >
                  {row.disenoNombre}
                </td>
                <td className={enviosTd}>
                  <MotivoCell row={row} onUpdated={onUpdated} />
                </td>
                <td className={`${enviosTd} max-w-[240px]`} title={row.descripcion ?? undefined}>
                  {sinDesc ? (
                    <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200/90">
                      Completar
                    </span>
                  ) : (
                    <span className="line-clamp-2 text-zinc-500">{row.descripcion}</span>
                  )}
                </td>
                <td className={`${enviosTd} text-zinc-500`}>{row.createdByNombre || '—'}</td>
                <td className={enviosTd}>
                  <SnapshotFlags
                    hasBase={row.hasBaseSnapshot}
                    hasVector={row.hasVectorSnapshot}
                    hasFoto={row.hasFotoPrevia}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
