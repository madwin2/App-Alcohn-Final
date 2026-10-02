import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppMain } from '@/components/layout/AppMain';
import { Toaster } from '@/components/ui/toaster';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PerfilHeader } from '@/components/perfil/PerfilHeader';
import { EquipoTab } from '@/components/perfil/EquipoTab';
import { CalendarioTab } from '@/components/perfil/CalendarioTab';
import { TareasTab } from '@/components/perfil/TareasTab';
import { AnotacionesTab } from '@/components/perfil/AnotacionesTab';
import { NecesidadesTab } from '@/components/perfil/NecesidadesTab';
import { CrecimientoTab } from '@/components/perfil/CrecimientoTab';
import { FeedbackTab } from '@/components/perfil/FeedbackTab';
import { MisIdeasTab } from '@/components/perfil/MisIdeasTab';
import { MisNumerosTab } from '@/components/perfil/MisNumerosTab';
import { useAuth } from '@/lib/hooks/useAuth';
import { useEquipoRol } from '@/lib/hooks/useEquipoRol';
import {
  getMiembrosEquipo,
  getMiPerfil,
  type PerfilEquipo,
} from '@/lib/supabase/services/equipo.service';
import {
  getAusenciasDeUsuario,
  getFeriados,
} from '@/lib/supabase/services/equipoCalendario.service';
import { contarMiFeedbackNoLeido } from '@/lib/supabase/services/equipoFeedback.service';
import { saldoVacaciones } from '@/lib/equipo/vacaciones';
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate';

const TAB_STORAGE_KEY = 'perfil_tab';

function readStoredTab(): string {
  try {
    return localStorage.getItem(TAB_STORAGE_KEY) || 'inicio';
  } catch {
    return 'inicio';
  }
}

function writeStoredTab(tab: string): void {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // ignore quota / private mode
  }
}

export default function PerfilPage() {
  const { user } = useAuth();
  const { esAdmin, loading: rolLoading, refresh } = useEquipoRol();
  const [searchParams, setSearchParams] = useSearchParams();
  const [perfil, setPerfil] = useState<PerfilEquipo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saldo, setSaldo] = useState<{
    disponiblesHoy: number;
    planificados: number;
  } | null>(null);
  const [nombresPorUserId, setNombresPorUserId] = useState<Record<string, string>>({});
  const [feedbackNoLeido, setFeedbackNoLeido] = useState(0);

  const tabFromUrl = searchParams.get('tab');
  const [tab, setTab] = useState(() => tabFromUrl || readStoredTab());

  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== tab) {
      setTab(tabFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);

  const loadSaldo = useCallback(async (p: PerfilEquipo) => {
    if (p.vacacionesSinLimite) {
      setSaldo(null);
      return;
    }
    try {
      const hoy = todayArgentinaDateKey();
      const anio = Number(hoy.slice(0, 4));
      const [ausencias, feriados] = await Promise.all([
        getAusenciasDeUsuario(p.userId),
        getFeriados({ desde: `${anio - 1}-01-01`, hasta: `${anio + 1}-12-31` }),
      ]);
      const s = saldoVacaciones({
        saldoBase: p.vacacionesSaldoBase,
        saldoBaseFecha: p.vacacionesSaldoBaseFecha,
        diasAnuales: p.diasVacacionesAnuales,
        ausencias: ausencias.map((a) => ({
          tipo: a.tipo,
          fechaDesde: a.fechaDesde,
          fechaHasta: a.fechaHasta,
          fechaRecupero: a.fechaRecupero,
        })),
        feriados: feriados.map((f) => f.fecha),
        hoy,
      });
      setSaldo({
        disponiblesHoy: s.disponiblesHoy,
        planificados: s.planificados,
      });
    } catch {
      setSaldo(null);
    }
  }, []);

  const loadPerfil = useCallback(async () => {
    if (!user?.id) {
      setPerfil(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const p = await getMiPerfil(user.id);
      setPerfil(p);
      if (p) void loadSaldo(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el perfil');
      setPerfil(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id, loadSaldo]);

  useEffect(() => {
    void loadPerfil();
  }, [loadPerfil]);

  useEffect(() => {
    void getMiembrosEquipo({ incluirInactivos: true })
      .then((m) => {
        const map: Record<string, string> = {};
        m.forEach((x) => {
          map[x.userId] = x.nombre;
        });
        setNombresPorUserId(map);
      })
      .catch(() => {
        /* nombres opcionales para badge "Sumada por…" */
      });
  }, []);

  useEffect(() => {
    if (!perfil?.activo) {
      setFeedbackNoLeido(0);
      return;
    }
    void contarMiFeedbackNoLeido()
      .then(setFeedbackNoLeido)
      .catch(() => setFeedbackNoLeido(0));
  }, [perfil?.activo, perfil?.userId]);

  const handleTabChange = (value: string) => {
    if (value === 'equipo' && !esAdmin) return;
    setTab(value);
    writeStoredTab(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'inicio') next.delete('tab');
    else next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!rolLoading && !esAdmin && tab === 'equipo') {
      handleTabChange('inicio');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAdmin, rolLoading, tab]);

  const busy = loading || rolLoading;

  const saldoHeader = useMemo(() => {
    if (!perfil || perfil.vacacionesSinLimite) return null;
    return saldo;
  }, [perfil, saldo]);

  return (
    <AppMain>
      <Toaster />
      <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
        {busy ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando tu perfil…
          </div>
        ) : error ? (
          <div className="rounded-[20px] border border-destructive/40 bg-destructive/10 px-5 py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              className="mt-3 text-xs underline text-muted-foreground"
              onClick={() => void loadPerfil()}
            >
              Reintentar
            </button>
          </div>
        ) : !perfil || !perfil.activo ? (
          <div className="rounded-[20px] border border-white/10 bg-zinc-900/80 px-5 py-12 text-center">
            <h1 className="text-lg font-semibold text-white">Tu perfil todavía no está armado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pedile a Julián que lo complete.
            </p>
          </div>
        ) : (
          <>
            <PerfilHeader perfil={perfil} saldoVacaciones={saldoHeader} />

            <Tabs value={tab} onValueChange={handleTabChange}>
              <TabsList>
                <TabsTrigger value="inicio">Inicio del perfil</TabsTrigger>
                <TabsTrigger value="calendario">Calendario</TabsTrigger>
                <TabsTrigger value="tareas">Mis tareas</TabsTrigger>
                <TabsTrigger value="anotaciones">Anotaciones</TabsTrigger>
                <TabsTrigger value="necesidades">Lo que necesito</TabsTrigger>
                <TabsTrigger value="crecimiento">Crecimiento</TabsTrigger>
                <TabsTrigger value="feedback" className="gap-1.5">
                  Feedback
                  {feedbackNoLeido > 0 ? (
                    <span className="rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-950">
                      {feedbackNoLeido}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="ideas">Mis ideas</TabsTrigger>
                <TabsTrigger value="numeros">Mis números</TabsTrigger>
                {esAdmin ? <TabsTrigger value="equipo">Equipo</TabsTrigger> : null}
              </TabsList>

              <TabsContent value="inicio" className="mt-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-8 text-sm text-muted-foreground">
                  <p>
                    Resumen personal. Usá <strong className="text-white">Calendario</strong> para
                    vacaciones, <strong className="text-white">Mis tareas</strong> para anotar lo
                    de cada semana, <strong className="text-white">Anotaciones</strong> privadas,{' '}
                    <strong className="text-white">Lo que necesito</strong> para pedir algo puntual,{' '}
                    <strong className="text-white">Crecimiento</strong> para objetivos,{' '}
                    <strong className="text-white">Feedback</strong> para lo que te deja Julián,{' '}
                    <strong className="text-white">Mis ideas</strong> / el corcho para mejorar la
                    empresa, y <strong className="text-white">Mis números</strong> para ver lo que
                    fuiste haciendo.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="calendario" className="mt-4">
                <CalendarioTab
                  perfil={perfil}
                  esAdmin={esAdmin}
                  onAusenciasChanged={() => {
                    void loadSaldo(perfil);
                  }}
                />
              </TabsContent>

              <TabsContent value="tareas" className="mt-4">
                {user?.id ? (
                  <TareasTab
                    userId={perfil.userId}
                    personaNombre={perfil.nombre}
                    viewerUserId={user.id}
                    esAdmin={esAdmin}
                    nombresPorUserId={nombresPorUserId}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="anotaciones" className="mt-4">
                <AnotacionesTab />
              </TabsContent>

              <TabsContent value="necesidades" className="mt-4">
                <NecesidadesTab personaNombre={perfil.nombre} />
              </TabsContent>

              <TabsContent value="crecimiento" className="mt-4">
                <CrecimientoTab />
              </TabsContent>

              <TabsContent value="feedback" className="mt-4">
                <FeedbackTab onUnreadChange={setFeedbackNoLeido} />
              </TabsContent>

              <TabsContent value="ideas" className="mt-4">
                <MisIdeasTab color={perfil.color} />
              </TabsContent>

              <TabsContent value="numeros" className="mt-4">
                <MisNumerosTab userId={perfil.userId} areaPrincipal={perfil.areaPrincipal} />
              </TabsContent>

              {esAdmin ? (
                <TabsContent value="equipo" className="mt-4">
                  <EquipoTab
                    onChanged={() => {
                      void loadPerfil();
                      void refresh();
                    }}
                  />
                </TabsContent>
              ) : null}
            </Tabs>
          </>
        )}
      </div>
    </AppMain>
  );
}
