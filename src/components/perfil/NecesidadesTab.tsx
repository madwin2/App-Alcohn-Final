import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';
import { BotonIcono, Estado, Panel, PanelTitle } from '@/components/perfil/perfilUi';
import { getMiembrosEquipo } from '@/lib/supabase/services/equipo.service';
import {
  actualizarNecesidadPendiente,
  borrarNecesidadPendiente,
  crearNecesidad,
  getMisNecesidades,
  type NecesidadEquipo,
} from '@/lib/supabase/services/equipoNecesidades.service';
import { notifyNecesidadNueva } from '@/lib/notificaciones/events';
import { useAuth } from '@/lib/hooks/useAuth';
import { useNombreAdmin } from '@/lib/hooks/useNombreAdmin';

function fmtFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
  } catch {
    return iso;
  }
}

export function NecesidadesTab({
  personaNombre,
  refreshKey = 0,
}: {
  personaNombre: string;
  /** Cambia al llegar desde una notificación estando ya en la pestaña (EQ-R21). */
  refreshKey?: number;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const adminNombre = useNombreAdmin();
  const [items, setItems] = useState<NecesidadEquipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevoTexto, setNuevoTexto] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getMisNecesidades());
    } catch (err) {
      toast({
        title: 'No se pudieron cargar los pedidos',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const pendientes = useMemo(() => items.filter((n) => n.estado === 'pendiente'), [items]);
  const resueltas = useMemo(() => items.filter((n) => n.estado === 'resuelta'), [items]);

  const handleCrear = async () => {
    const texto = nuevoTexto.trim();
    if (!texto) return;
    setSaving(true);
    try {
      const creada = await crearNecesidad(texto);
      setNuevoTexto('');
      setItems((prev) => [creada, ...prev]);

      const miembros = await getMiembrosEquipo();
      const adminIds = miembros.filter((m) => m.esAdmin && m.activo).map((m) => m.userId);
      const nombreCorto = personaNombre.split(/\s+/)[0] || personaNombre;
      notifyNecesidadNueva({
        nombre: nombreCorto,
        texto,
        adminUserIds: adminIds.filter((id) => id !== user?.id),
        necesidadId: creada.id,
      });

      toast({ title: 'Pedido enviado', description: `Le llega un aviso a ${adminNombre}.` });
    } catch (err) {
      toast({
        title: 'No se pudo enviar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGuardarEdicion = async (id: string) => {
    const texto = editTexto.trim();
    if (!texto) return;
    setSaving(true);
    try {
      const updated = await actualizarNecesidadPendiente({ id, texto });
      setItems((prev) => prev.map((n) => (n.id === id ? updated : n)));
      setEditId(null);
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleBorrar = async (n: NecesidadEquipo) => {
    if (!window.confirm(`¿Borrar el pedido “${n.texto.slice(0, 60)}”?`)) return;
    try {
      await borrarNecesidadPendiente(n.id);
      setItems((prev) => prev.filter((x) => x.id !== n.id));
    } catch (err) {
      toast({
        title: 'No se pudo borrar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando…
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <Panel className="xl:col-span-4">
        <PanelTitle
          title="Pedir algo"
          sub={`Herramienta, insumo o lo que haga falta. Lo ven vos y ${adminNombre}; cuando lo resuelva te avisa.`}
        />
        <Textarea
          value={nuevoTexto}
          onChange={(e) => setNuevoTexto(e.target.value)}
          placeholder="Ej.: Repuesto para la CNC, guantes talla M…"
          className="min-h-[120px] resize-none rounded-2xl border-0 bg-black/20 p-4 text-sm focus-visible:ring-1 focus-visible:ring-white/15 focus-visible:ring-offset-0"
        />
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 gap-1.5 rounded-full bg-white/[0.08] px-4 hover:bg-white/[0.14]"
            disabled={saving || !nuevoTexto.trim()}
            onClick={() => void handleCrear()}
          >
            <Send className="h-3.5 w-3.5" />
            Enviar pedido
          </Button>
        </div>
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2 xl:col-span-8">
        <Panel>
          <PanelTitle
            title="Pendientes"
            sub={pendientes.length ? `${pendientes.length} esperando respuesta` : undefined}
          />
          {pendientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tenés pedidos pendientes.</p>
          ) : (
            <ul className="space-y-1.5">
              {pendientes.map((n) => (
                <li key={n.id} className="group rounded-2xl bg-white/[0.03] px-4 py-3 text-sm">
                  {editId === n.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editTexto}
                        onChange={(e) => setEditTexto(e.target.value)}
                        className="resize-none rounded-xl border-0 bg-black/20 focus-visible:ring-1 focus-visible:ring-white/15 focus-visible:ring-offset-0"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="rounded-full"
                          onClick={() => setEditId(null)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-full"
                          disabled={saving}
                          onClick={() => void handleGuardarEdicion(n.id)}
                        >
                          Guardar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-foreground">{n.texto}</p>
                        <Estado tono="aviso" className="mt-1 text-xs text-muted-foreground">
                          Pendiente · {fmtFecha(n.createdAt)}
                        </Estado>
                      </div>
                      <div className="flex shrink-0 opacity-60 transition-opacity group-hover:opacity-100">
                        <BotonIcono
                          label="Editar"
                          onClick={() => {
                            setEditId(n.id);
                            setEditTexto(n.texto);
                          }}
                        >
                          <Pencil />
                        </BotonIcono>
                        <BotonIcono label="Borrar" peligro onClick={() => void handleBorrar(n)}>
                          <Trash2 />
                        </BotonIcono>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelTitle title="Resueltos" />
          {resueltas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay pedidos resueltos.</p>
          ) : (
            <ul className="space-y-1.5">
              {resueltas.map((n) => (
                <li key={n.id} className="rounded-2xl bg-white/[0.03] px-4 py-3 text-sm">
                  {/* EQ-R16: con respuesta no se tacha (puede ser un "no se puede"). */}
                  <p
                    className={cn(
                      n.respuestaAdmin ? 'text-foreground' : 'text-muted-foreground line-through',
                    )}
                  >
                    {n.texto}
                  </p>
                  {n.respuestaAdmin ? (
                    <p className="mt-2 border-l-2 border-emerald-400/60 pl-3 text-sm text-foreground/90">
                      {n.respuestaAdmin}
                    </p>
                  ) : null}
                  <Estado tono="ok" className="mt-1.5 text-xs text-muted-foreground">
                    Resuelto {n.resueltaAt ? fmtFecha(n.resueltaAt) : fmtFecha(n.updatedAt)}
                  </Estado>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
