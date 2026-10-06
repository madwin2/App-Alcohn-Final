import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';
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
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Pedí algo puntual (herramienta, insumo, lo que sea). Lo ves vos y {adminNombre}; cuando lo resuelva te
        avisa acá.
      </p>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Nuevo pedido</h3>
        <Textarea
          value={nuevoTexto}
          onChange={(e) => setNuevoTexto(e.target.value)}
          placeholder="Ej.: Repuesto para la CNC, guantes talla M…"
          className="min-h-[80px] text-sm"
        />
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={saving || !nuevoTexto.trim()}
          onClick={() => void handleCrear()}
        >
          <Plus className="h-4 w-4" />
          Enviar pedido
        </Button>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Pendientes</h3>
        {pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tenés pedidos pendientes.</p>
        ) : (
          <ul className="space-y-2">
            {pendientes.map((n) => (
              <li
                key={n.id}
                className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm"
              >
                {editId === n.id ? (
                  <div className="space-y-2">
                    <Textarea value={editTexto} onChange={(e) => setEditTexto(e.target.value)} />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={saving}
                        onClick={() => void handleGuardarEdicion(n.id)}
                      >
                        Guardar
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-white">{n.texto}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{fmtFecha(n.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditId(n.id);
                          setEditTexto(n.texto);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => void handleBorrar(n)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Resueltos</h3>
        {resueltas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay pedidos resueltos.</p>
        ) : (
          <ul className="space-y-2">
            {resueltas.map((n) => (
              <li
                key={n.id}
                className={cn(
                  'rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm',
                )}
              >
                {/* EQ-R16: con respuesta no se tacha (puede ser un "no se puede"). */}
                <p
                  className={cn(
                    n.respuestaAdmin ? 'text-white' : 'text-muted-foreground line-through',
                  )}
                >
                  {n.texto}
                </p>
                {n.respuestaAdmin ? (
                  <p className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2 text-white">
                    <span className="text-xs font-medium text-emerald-300">Respuesta: </span>
                    {n.respuestaAdmin}
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Resuelto {n.resueltaAt ? fmtFecha(n.resueltaAt) : fmtFecha(n.updatedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
