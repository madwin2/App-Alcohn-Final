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
import { precioLinkDesdeTransferencia } from '@/lib/precios/precioLink';
import { etiquetaMedidaFila } from '@/lib/precios/preciosDims';
import type { SelloGrupoCodigo } from '@/lib/precios/resolverPrecioSello';
import {
  fetchPreciosFormState,
  persistPreciosFormState,
  type PreciosFormState,
} from '@/lib/supabase/services/preciosPro.service';

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
  const [state, setState] = useState<PreciosFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const stateRef = useRef<PreciosFormState | null>(null);
  stateRef.current = state;

  const isAllowed = user?.email?.toLowerCase() === ALLOWED_EMAIL;

  useEffect(() => {
    if (authLoading || !isAllowed || !user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchPreciosFormState(user.id);
        if (cancelled) return;
        setState(data);
        setDirty(false);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        toast({
          title: 'No se pudieron cargar los precios',
          description: msg,
          variant: 'destructive',
        });
        setState(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAllowed, user?.id, toast]);

  const persist = useCallback(async () => {
    if (!isAllowed || !user?.id || !stateRef.current) return;
    setSaving(true);
    try {
      await persistPreciosFormState(user.id, stateRef.current);
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
    if (!dirty || !isAllowed || !user?.id || loading || !state) return;
    const t = window.setTimeout(() => {
      void persist();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [state, dirty, isAllowed, user?.id, loading, persist]);

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

  const patchGrupo = (codigo: SelloGrupoCodigo, precioTransferencia: number) => {
    setState((s) => {
      if (!s) return s;
      return {
        ...s,
        sellosGrupos: s.sellosGrupos.map((g) =>
          g.codigo === codigo ? { ...g, precioTransferencia: Math.max(0, Math.round(precioTransferencia)) } : g,
        ),
      };
    });
    setDirty(true);
  };

  const patchAccesorio = (key: keyof PreciosFormState['accesorios'], value: number) => {
    setState((s) => {
      if (!s) return s;
      return {
        ...s,
        accesorios: { ...s.accesorios, [key]: Math.max(0, Math.round(value)) },
      };
    });
    setDirty(true);
  };

  const patchAbc = (index: number, precioTransferencia: number) => {
    setState((s) => {
      if (!s) return s;
      return {
        ...s,
        abecedarios: s.abecedarios.map((row, i) =>
          i === index ? { ...row, precioTransferencia: Math.max(0, Math.round(precioTransferencia)) } : row,
        ),
      };
    });
    setDirty(true);
  };

  const patchRedondo = (
    index: number,
    field: 'simple' | 'intermedio' | 'complejo',
    value: number,
  ) => {
    setState((s) => {
      if (!s) return s;
      return {
        ...s,
        sellosRedondos: s.sellosRedondos.map((row, i) =>
          i === index ? { ...row, [field]: Math.max(0, Math.round(value)) } : row,
        ),
      };
    });
    setDirty(true);
  };

  const patchOtra = (index: number, precioTransferencia: number) => {
    setState((s) => {
      if (!s) return s;
      return {
        ...s,
        otrasMedidas: s.otrasMedidas.map((row, i) =>
          i === index ? { ...row, precioTransferencia: Math.max(0, Math.round(precioTransferencia)) } : row,
        ),
      };
    });
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

  if (loading || !state) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar />
        <div className="ml-20 flex min-h-screen flex-1 flex-col p-8">
          <p className="text-muted-foreground">Cargando datos…</p>
        </div>
      </div>
    );
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
                Tablas en Supabase: grupos con precio, mapa medida→grupo, medidas con precio fijo, accesorios,
                abecedarios y redondos. Transferencia editable; link = +15 % redondeado. Para calcular precio por
                ancho/largo en pedidos o mockups usá en código{' '}
                <code className="text-xs">fetchPreciosResolverInput</code> y{' '}
                <code className="text-xs">resolverPrecioSelloRectangular</code>.
              </p>
              {state.notaPresupuesto && (
                <p className="text-xs text-muted-foreground mt-2 italic max-w-2xl">{state.notaPresupuesto}</p>
              )}
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void persist()}>
                {saving ? 'Guardando…' : 'Guardar ahora'}
              </Button>
              {savedLabel && (
                <span className="text-xs text-muted-foreground">Último guardado: {savedLabel}</span>
              )}
            </div>
          </header>

          <div className="space-y-8 pb-16">
            <Card>
              <CardHeader>
                <CardTitle>Sellos por medida — 4 grupos</CardTitle>
                <CardDescription>
                  Precio por transferencia por grupo. Las medidas de cada grupo viven en la tabla{' '}
                  <code className="text-xs">precios_sello_medida_grupo</code> para lookup automático.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {state.sellosGrupos.map((g) => {
                  const link = precioLinkDesdeTransferencia(g.precioTransferencia);
                  return (
                    <div
                      key={g.codigo}
                      className="grid gap-4 rounded-lg border bg-muted/15 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="font-medium">{g.titulo}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{g.medidas}</p>
                      </div>
                      <div className="space-y-1 w-full sm:w-40">
                        <Label htmlFor={`grupo-${g.codigo}-transf`}>Transferencia</Label>
                        <Input
                          id={`grupo-${g.codigo}-transf`}
                          inputMode="numeric"
                          value={String(g.precioTransferencia)}
                          onChange={(e) => patchGrupo(g.codigo, parseMoneyInput(e.target.value))}
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
                  const v = state.accesorios[key];
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
                <CardDescription>Tabla <code className="text-xs">precios_abecedario</code>.</CardDescription>
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
                    {state.abecedarios.map((row, i) => {
                      const link = precioLinkDesdeTransferencia(row.precioTransferencia);
                      return (
                        <tr key={row.id} className="border-b border-border/60">
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
                <CardDescription>Tabla <code className="text-xs">precios_sello_redondo</code>.</CardDescription>
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
                    {state.sellosRedondos.map((row, ri) => (
                      <tr key={row.id} className="border-b border-border/60 align-middle">
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
                <CardDescription>
                  Tabla <code className="text-xs">precios_sello_medida_fija</code> (precio propio; pisa el precio por
                  grupo).
                </CardDescription>
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
                    {state.otrasMedidas.map((row, i) => {
                      const link = precioLinkDesdeTransferencia(row.precioTransferencia);
                      const label = etiquetaMedidaFila(row.ancho, row.largo, row.etiqueta);
                      return (
                        <tr key={`${row.ancho}-${row.largo}-${row.etiqueta ?? ''}`} className="border-b border-border/60">
                          <td className="py-2 pr-3 font-mono">{label}</td>
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
        </div>
      </div>
      <Toaster />
    </div>
  );
}
