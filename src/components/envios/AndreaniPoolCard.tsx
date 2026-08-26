import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  andreaniJobKindLabel,
  fetchAndreaniWorkerJob,
  isAndreaniJobActive,
  waitAndreaniWorkerJob,
  type AndreaniWorkerJob,
} from '@/lib/andreaniWorkerJob';
import {
  getAndreaniPoolCounts,
  insertAndreaniLinksDisponibles,
  type AndreaniLinkEstado,
} from '@/lib/supabase/services/andreani.service';
import { Loader2, RefreshCw } from 'lucide-react';

export function AndreaniPoolCard() {
  const { toast } = useToast();
  const [counts, setCounts] = useState<Record<AndreaniLinkEstado, number>>({
    disponible: 0,
    asignado: 0,
    descartado: 0,
  });
  const [loading, setLoading] = useState(true);
  const [pasteUrls, setPasteUrls] = useState('');
  const [busy, setBusy] = useState(false);
  const [workerJob, setWorkerJob] = useState<AndreaniWorkerJob | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getAndreaniPoolCounts();
      setCounts(next);
    } catch (error) {
      console.warn('Error cargando pool Andreani:', error);
      toast({
        title: 'Pool Andreani',
        description: 'No se pudo leer el pool (¿corriste la migración?)',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const job = await fetchAndreaniWorkerJob();
      if (!cancelled) setWorkerJob(job);
    };
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const jobActive = isAndreaniJobActive(workerJob);

  const handleInsertPaste = async () => {
    const urls = pasteUrls
      .split(/[\n,\s]+/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http'));
    if (!urls.length) {
      toast({
        title: 'Sin URLs',
        description: 'Pegá uno o más links (uno por línea)',
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    try {
      const n = await insertAndreaniLinksDisponibles(urls);
      setPasteUrls('');
      toast({ title: 'Links agregados', description: `${n} link(s) disponibles en el pool` });
      await refresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudieron insertar los links',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/andreani-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 10 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 202) {
        const raw =
          typeof json?.message === 'string'
            ? json.message
            : `Error ${res.status} al generar links`;
        const short = raw
          .split(/\n/)
          .map((l: string) => l.trim())
          .find((l: string) => l && !l.startsWith('Call log') && !l.startsWith('- waiting'))
          ?.slice(0, 280);
        throw new Error(short || `Error ${res.status} al generar links`);
      }

      toast({
        title: 'Generando links…',
        description: 'El progreso se ve abajo. El contador se actualiza al terminar.',
      });

      const finalJob = await waitAndreaniWorkerJob({
        pollMs: 4_000,
        maxMs: 12 * 60_000,
        onUpdate: (job) => {
          setWorkerJob(job);
          if (job.kind === 'generate' && /guardado en pool/i.test(job.detail)) {
            void refresh();
          }
        },
      });

      await refresh();

      if (finalJob?.phase === 'error' || finalJob?.lastOk === false) {
        toast({
          title: 'Generación con error',
          description: finalJob.lastMessage || finalJob.detail || 'Revisá el worker',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Links generados',
          description: finalJob?.lastMessage || 'Listo',
        });
      }
    } catch (error) {
      toast({
        title: 'Error al generar',
        description: error instanceof Error ? error.message : 'Falló el worker',
        variant: 'destructive',
      });
      await refresh();
    } finally {
      setBusy(false);
      setWorkerJob(await fetchAndreaniWorkerJob());
    }
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 space-y-3">
      {(jobActive || workerJob?.phase === 'done' || workerJob?.phase === 'error') && workerJob ? (
        <div
          className={
            workerJob.phase === 'error'
              ? 'rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs'
              : workerJob.phase === 'done'
                ? 'rounded-lg border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-xs'
                : 'rounded-lg border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-xs'
          }
        >
          <div className="flex items-center gap-2 font-medium">
            {jobActive ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : null}
            <span>
              {jobActive ? 'Worker en curso' : workerJob.phase === 'error' ? 'Worker: error' : 'Worker: listo'}
              {workerJob.kind ? ` · ${andreaniJobKindLabel(workerJob.kind)}` : ''}
              {workerJob.queueDepth > 0 ? ` · cola ${workerJob.queueDepth}` : ''}
            </span>
          </div>
          <p className="mt-0.5 text-muted-foreground">{workerJob.detail}</p>
          {workerJob.lastMessage && !jobActive ? (
            <p className="mt-0.5 text-muted-foreground">{workerJob.lastMessage}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Pool links Andreani</h2>
          <p className="text-xs text-muted-foreground">
            Links de pago listos para asignar a pedidos
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => void refresh()}
          disabled={loading || busy}
          title="Actualizar"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/50 px-2 py-2">
          <div className="text-lg font-semibold tabular-nums">{counts.disponible}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Disponibles</div>
        </div>
        <div className="rounded-lg bg-muted/50 px-2 py-2">
          <div className="text-lg font-semibold tabular-nums">{counts.asignado}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Asignados</div>
        </div>
        <div className="rounded-lg bg-muted/50 px-2 py-2">
          <div className="text-lg font-semibold tabular-nums">{counts.descartado}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Descartados</div>
        </div>
      </div>

      <Textarea
        value={pasteUrls}
        onChange={(e) => setPasteUrls(e.target.value)}
        placeholder="Pegá links acá (uno por línea)…"
        className="min-h-[72px] text-xs"
        disabled={busy || jobActive}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void handleInsertPaste()} disabled={busy || jobActive}>
          Agregar al pool
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void handleGenerate()}
          disabled={busy || jobActive}
        >
          {busy || (jobActive && workerJob?.kind === 'generate') ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Generando…
            </>
          ) : (
            'Generar más'
          )}
        </Button>
      </div>
    </div>
  );
}
