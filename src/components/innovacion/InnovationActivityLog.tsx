import { History } from 'lucide-react';
import { InnovacionSectionHeading } from '@/components/innovacion/InnovacionHints';
import type { InnovationActivityLog } from '@/lib/supabase/services/innovation.service';

interface InnovationActivityLogProps {
  logs: InnovationActivityLog[];
  usersMap: Map<string, string>;
  title?: string;
}

export function InnovationActivityLog({ logs, usersMap, title = 'Historial de cambios' }: InnovationActivityLogProps) {
  return (
    <section className="space-y-2">
      <InnovacionSectionHeading
        icon={History}
        title={title}
        hint="Registro automático de ediciones, comentarios y adjuntos en este ítem."
      />
      {logs.length === 0 ? (
        <p className="text-xs text-zinc-500">Sin actividad registrada todavía.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-lg border border-white/10 bg-zinc-950/60 p-2.5">
              <p className="text-xs text-zinc-300">{log.summary}</p>
              <p className="text-[11px] text-zinc-500">
                {log.actorId ? usersMap.get(log.actorId) ?? 'Usuario' : 'Sistema'} ·{' '}
                {new Date(log.createdAt).toLocaleString('es-AR')}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
