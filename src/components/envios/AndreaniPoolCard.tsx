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
  const [showPaste, setShowPaste] = useState(false);

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
      setShowPaste(false);
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
    <div className="rounded-lg border bg-card px-3 py-2 space-y-1.5">
      {(jobActive || workerJob?.phase === 'done' || workerJob?.phase === 'error') && workerJob ? (
        <div
          className={
            workerJob.phase === 'error'
              ? 'rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px]'
              : workerJob.phase === 'done'
                ? 'rounded border border-emerald-600/30 bg-emerald-500/10 px-2 py-1 text-[11px]'
                : 'rounded border border-amber-600/30 bg-amber-500/10 px-2 py-1 text-[11px]'
          }
        >
          <div className="flex items-center gap-1.5 font-medium">
            {jobActive ? <Loader2 className="h-3 w-3 animate-spin shrink-0" /> : null}
            <span className="truncate">
              {jobActive ? 'Worker' : workerJob.phase === 'error' ? 'Error' : 'Listo'}
              {workerJob.kind ? ` · ${andreaniJobKindLabel(workerJob.kind)}` : ''}
              {workerJob.queueDepth > 0 ? ` · cola ${workerJob.queueDepth}` : ''}
              {workerJob.detail ? ` · ${workerJob.detail}` : ''}
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-xs font-semibold shrink-0">Pool Andreani</span>
        <div className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{counts.disponible}</span> disp.
          </span>
          <span>
            <span className="font-semibold text-foreground">{counts.asignado}</span> asig.
          </span>
          <span>
            <span className="font-semibold text-foreground">{counts.descartado}</span> desc.
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => void refresh()}
            disabled={loading || busy}
            title="Actualizar"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setShowPaste((prev) => !prev)}
            disabled={busy || jobActive}
          >
            {showPaste ? 'Cerrar' : 'Pegar links'}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void handleGenerate()}
            disabled={busy || jobActive}
          >
            {busy || (jobActive && workerJob?.kind === 'generate') ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Generando…
              </>
            ) : (
              'Generar más'
            )}
          </Button>
        </div>
      </div>

      {showPaste ? (
        <div className="flex flex-wrap items-end gap-2 pt-0.5">
          <Textarea
            value={pasteUrls}
            onChange={(e) => setPasteUrls(e.target.value)}
            placeholder="Pegá links (uno por línea)…"
            className="min-h-[40px] h-10 flex-1 text-xs py-1.5"
            disabled={busy || jobActive}
          />
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs shrink-0"
            onClick={() => void handleInsertPaste()}
            disabled={busy || jobActive || !pasteUrls.trim()}
          >
            Agregar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
