import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { useAuth } from '@/lib/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import {
  DEFAULT_PRECIOS_PAYLOAD,
  mergePreciosPayload,
  precioLinkDesdeTransferencia,
  type PreciosPayload,
} from '@/lib/precios/preciosPayload';
import { fetchPreciosLista, upsertPreciosLista } from '@/lib/supabase/services/preciosLista.service';

const ALLOWED_EMAIL = 'julian.475@hotmail.com';

const formatArs = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(
    value,
  );

function parseMoneyInput(raw: string): number {
  const cleaned = raw.replace(/\./g, '').replace(',', '.').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export default function PreciosPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [payload, setPayload] = useState<PreciosPayload>(() => structuredClone(DEFAULT_PRECIOS_PAYLOAD));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const isAllowed = user?.email?.toLowerCase() === ALLOWED_EMAIL;

  useEffect(() => {
    if (authLoading || !isAllowed || !user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const fromDb = await fetchPreciosLista(user.id);
        if (cancelled) return;
        setPayload(fromDb ?? structuredClone(DEFAULT_PRECIOS_PAYLOAD));
        setDirty(false);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        toast({
          title: 'No se pudieron cargar los precios',
          description: msg,
          variant: 'destructive',
        });
        setPayload(structuredClone(DEFAULT_PRECIOS_PAYLOAD));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAllowed, user?.id, toast]);

  const persist = useCallback(async () => {
    if (!isAllowed || !user?.id) return;
    setSaving(true);
    try {
      await upsertPreciosLista(user.id, payloadRef.current);
      setDirty(false);
      setLastSavedAt(new Date().toISOString());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: 'Error al guardar',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [isAllowed, user?.id, toast]);

  useEffect(() => {
    if (!dirty || !isAllowed || !user?.id || loading) return;
    const t = window.setTimeout(() => {
      void persist();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [payload, dirty, isAllowed, user?.id, loading, persist]);

  useEffect(() => {
    if (!dirty || !isAllowed || !user?.id) return;
    const flush = () => {
      void persist();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
    };
  }, [dirty, isAllowed, user?.id, persist]);

  const patchGrupo = (id: string, precioTransferencia: number) => {
    setPayload((p) => ({
      ...p,
      sellosGrupos: p.sellosGrupos.map((g) =>
        g.id === id ? { ...g, precioTransferencia: Math.max(0, Math.round(precioTransferencia)) } : g,
      ),
    }));
    setDirty(true);
  };

  const patchAccesorio = (key: keyof PreciosPayload['accesorios'], value: number) => {
    setPayload((p) => ({
      ...p,
      accesorios: { ...p.accesorios, [key]: Math.max(0, Math.round(value)) },
    }));
    setDirty(true);
  };

  const patchAbc = (index: number, precioTransferencia: number) => {
    setPayload((p) => ({
      ...p,
      abecedarios: p.abecedarios.map((row, i) =>
        i === index ? { ...row, precioTransferencia: Math.max(0, Math.round(precioTransferencia)) } : row,
      ),
    }));
    setDirty(true);
  };

  const patchRedondo = (
    index: number,
    field: 'simple' | 'intermedio' | 'complejo',
    value: number,
  ) => {
    setPayload((p) => ({
      ...p,
      sellosRedondos: p.sellosRedondos.map((row, i) =>
        i === index ? { ...row, [field]: Math.max(0, Math.round(value)) } : row,
      ),
    }));
    setDirty(true);
  };

  const patchOtra = (index: number, precioTransferencia: number) => {
    setPayload((p) => ({
      ...p,
      otrasMedidas: p.otrasMedidas.map((row, i) =>
        i === index ? { ...row, precioTransferencia: Math.max(0, Math.round(precioTransferencia)) } : row,
      ),
    }));
    setDirty(true);
  };

  const savedLabel = useMemo(() => {
    if (!lastSavedAt) return null;
    try {
      return new Date(lastSavedAt).toLocaleString('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return lastSavedAt;
    }
  }, [lastSavedAt]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  }

  if (!isAllowed) {
    return <Navigate to="/pedidos" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-20 flex min-h-screen flex-1 flex-col">
        <div className="w-full max-w-6xl flex-1 space-y-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Precios</h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Valores por transferencia. El costo por link de pago se calcula como transferencia + 15 % (redondeado
                a pesos enteros). Los cambios se guardan en Supabase automáticamente.
              </p>
              {payload.notaRespetoPresupuesto && (
                <p className="text-xs text-muted-foreground mt-2 italic max-w-2xl">{payload.notaRespetoPresupuesto}</p>
              )}
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <Button type="button" variant="secondary" disabled={saving || loading} onClick={() => void persist()}>
                {saving ? 'Guardando…' : 'Guardar ahora'}
              </Button>
              {savedLabel && (
                <span className="text-xs text-muted-foreground">Último guardado: {savedLabel}</span>
              )}
            </div>
          </header>

          {loading ? (
            <p className="text-muted-foreground">Cargando datos…</p>
          ) : (
            <div className="space-y-8 pb-16">
              <Card>
                <CardHeader>
                  <CardTitle>Sellos por medida — 4 grupos</CardTitle>
                  <CardDescription>
                    Una fila por grupo. Editá solo transferencia; el link se muestra al costado.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {payload.sellosGrupos.map((g) => {
                    const link = precioLinkDesdeTransferencia(g.precioTransferencia);
                    return (
                      <div
                        key={g.id}
                        className="grid gap-4 rounded-lg border bg-muted/15 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
                      >
                        <div className="space-y-1 min-w-0">
                          <p className="font-medium">{g.titulo}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">{g.medidas}</p>
                        </div>
                        <div className="space-y-1 w-full sm:w-40">
                          <Label htmlFor={`grupo-${g.id}-transf`}>Transferencia</Label>
                          <Input
                            id={`grupo-${g.id}-transf`}
                            inputMode="numeric"
                            value={String(g.precioTransferencia)}
                            onChange={(e) => patchGrupo(g.id, parseMoneyInput(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1 w-full sm:w-40">
                          <Label>Link (+15 %)</Label>
                          <div className="h-10 flex items-center rounded-md border bg-background px-3 text-sm font-mono tabular-nums">
                            {formatArs(link)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Accesorios</CardTitle>
                  <CardDescription>Soldador, base remachadora y mango de golpe (transferencia).</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  {(
                    [
                      ['soldador', 'Soldador'],
                      ['baseRemachadora', 'Base remachadora'],
                      ['mangoGolpe', 'Mango de golpe'],
                    ] as const
                  ).map(([key, label]) => {
                    const v = payload.accesorios[key];
                    const link = precioLinkDesdeTransferencia(v);
                    return (
                      <div key={key} className="space-y-2 rounded-lg border p-3">
                        <Label htmlFor={`acc-${key}`}>{label}</Label>
                        <Input
                          id={`acc-${key}`}
                          inputMode="numeric"
                          value={String(v)}
                          onChange={(e) => patchAccesorio(key, parseMoneyInput(e.target.value))}
                        />
                        <p className="text-xs text-muted-foreground">Link: {formatArs(link)}</p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Abecedarios</CardTitle>
                  <CardDescription>Listado fijo según tabla interna; editable por transferencia.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Categoría</th>
                        <th className="py-2 pr-3 font-medium">Detalle</th>
                        <th className="py-2 pr-3 font-medium w-36">Transferencia</th>
                        <th className="py-2 font-medium w-36">Link (+15 %)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.abecedarios.map((row, i) => {
                        const link = precioLinkDesdeTransferencia(row.precioTransferencia);
                        return (
                          <tr key={`${row.categoria}-${row.detalle}`} className="border-b border-border/60">
                            <td className="py-2 pr-3 align-middle">{row.categoria}</td>
                            <td className="py-2 pr-3 align-middle text-muted-foreground">{row.detalle}</td>
                            <td className="py-2 pr-3 align-middle">
                              <Input
                                className="h-9"
                                inputMode="numeric"
                                value={String(row.precioTransferencia)}
                                onChange={(e) => patchAbc(i, parseMoneyInput(e.target.value))}
                              />
                            </td>
                            <td className="py-2 align-middle font-mono tabular-nums text-muted-foreground">
                              {formatArs(link)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sellos redondos</CardTitle>
                  <CardDescription>Precios por transferencia según tamaño y complejidad del diseño.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Tamaño</th>
                        <th className="py-2 pr-2 font-medium">Simple</th>
                        <th className="py-2 pr-2 font-medium">Intermedio</th>
                        <th className="py-2 pr-2 font-medium">Complejo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.sellosRedondos.map((row, ri) => (
                        <tr key={row.rango} className="border-b border-border/60 align-middle">
                          <td className="py-2 pr-3 font-medium">{row.rango}</td>
                          {(['simple', 'intermedio', 'complejo'] as const).map((field) => (
                            <td key={field} className="py-2 pr-2">
                              <div className="flex flex-col gap-1">
                                <Input
                                  className="h-9 w-32"
                                  inputMode="numeric"
                                  value={String(row[field])}
                                  onChange={(e) => patchRedondo(ri, field, parseMoneyInput(e.target.value))}
                                />
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  Link {formatArs(precioLinkDesdeTransferencia(row[field]))}
                                </span>
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Otras medidas de sellos</CardTitle>
                  <CardDescription>Medidas que no entran en los cuatro grupos anteriores.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Medida</th>
                        <th className="py-2 pr-3 font-medium w-36">Transferencia</th>
                        <th className="py-2 font-medium w-36">Link (+15 %)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.otrasMedidas.map((row, i) => {
                        const link = precioLinkDesdeTransferencia(row.precioTransferencia);
                        return (
                          <tr key={row.medida} className="border-b border-border/60">
                            <td className="py-2 pr-3 font-mono">{row.medida}</td>
                            <td className="py-2 pr-3">
                              <Input
                                className="h-9"
                                inputMode="numeric"
                                value={String(row.precioTransferencia)}
                                onChange={(e) => patchOtra(i, parseMoneyInput(e.target.value))}
                              />
                            </td>
                            <td className="py-2 font-mono tabular-nums text-muted-foreground">{formatArs(link)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
      <Toaster />
    </div>
  );
}
