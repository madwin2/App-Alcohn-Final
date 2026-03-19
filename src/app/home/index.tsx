import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { useOrders } from '@/lib/hooks/useOrders';
import { useAuth } from '@/lib/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils/cn';
import type { Order, OrderItem } from '@/lib/types';
import { getApprovedUsers } from '@/lib/supabase/services/auth.service';
import { supabase } from '@/lib/supabase/client';
import {
  getDashboardTasksForUser,
  deleteDashboardTask,
  type DashboardTask,
} from '@/lib/supabase/services/dashboard-tasks.service';
import { AddTaskToColleagueDialog } from '@/components/home/AddTaskToColleagueDialog';
import {
  updateDashboardTaskPosition,
} from '@/lib/supabase/services/dashboard-tasks.service';
import stickyNoteAddSvg from '@/assets/sticky-notes/sticky-note-add.svg';
import stickyNoteTaskSvg from '@/assets/sticky-notes/sticky-note-task.svg';
import stickyNoteAddWorkmateSvg from '@/assets/sticky-notes/sticky-note-add-workmate.svg';
import stickyNoteTaskWorkmateSvg from '@/assets/sticky-notes/sticky-note-task-workmate.svg';

const NOTE_SIZE = 82;

interface StickyNote {
  id: string;
  text: string;
  x: number;
  y: number;
}

function useStickyNotes(userId?: string | null) {
  const [notes, setNotes] = useState<StickyNote[]>([]);

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(`dashboard_notes_${userId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as (StickyNote | { id: string; text: string })[];
        setNotes(
          parsed.map((n) =>
            'x' in n && typeof n.x === 'number'
              ? n
              : { ...n, x: 0, y: 0 }
          )
        );
      }
    } catch {
      // ignore
    }
  }, [userId]);

  const persist = (next: StickyNote[]) => {
    setNotes(next);
    if (!userId) return;
    try {
      localStorage.setItem(`dashboard_notes_${userId}`, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const addNote = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next: StickyNote[] = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text: trimmed,
        x: 0,
        y: 0,
      },
      ...notes,
    ];
    persist(next);
  };

  const removeNote = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    persist(next);
  };

  const updateNotePosition = (id: string, x: number, y: number) => {
    const next = notes.map((n) => (n.id === id ? { ...n, x, y } : n));
    persist(next);
  };

  return { notes, addNote, removeNote, updateNotePosition };
}

interface StampWithOrder {
  order: Order;
  item: OrderItem;
}

interface OrderWithItems {
  order: Order;
  items: OrderItem[];
}

function groupStampsByOrder(stamps: StampWithOrder[]): OrderWithItems[] {
  const byOrder = new Map<string, OrderWithItems>();
  for (const { order, item } of stamps) {
    const existing = byOrder.get(order.id);
    if (existing) {
      existing.items.push(item);
    } else {
      byOrder.set(order.id, { order, items: [item] });
    }
  }
  return Array.from(byOrder.values());
}

export default function HomePage() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const { orders, loading, error } = useOrders();

  const userName =
    user?.user_metadata?.nombre
      ? `${user.user_metadata.nombre} ${user.user_metadata.apellido || ''}`.trim()
      : 'Usuario';

  const { notes, addNote, removeNote, updateNotePosition } = useStickyNotes(user?.id);
  const [isAdding, setIsAdding] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removingColleagueId, setRemovingColleagueId] = useState<string | null>(null);
  const [approvedUsers, setApprovedUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [colleagueTasks, setColleagueTasks] = useState<DashboardTask[]>([]);
  const [isAddToColleagueOpen, setIsAddToColleagueOpen] = useState(false);

  const fetchColleagueTasks = useCallback(async () => {
    if (!user?.id || !isAuthenticated) return;
    const tasks = await getDashboardTasksForUser(user.id);
    setColleagueTasks(tasks);
  }, [user?.id, isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    fetchColleagueTasks();
  }, [fetchColleagueTasks]);

  // Fallback + realtime para que las tareas de compañeros se actualicen sin refresh
  useEffect(() => {
    if (authLoading || !user?.id || !isAuthenticated) return;

    const interval = window.setInterval(() => {
      fetchColleagueTasks();
    }, 12000);

    const channel = supabase
      .channel('tasks-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tareas_dashboard' },
        () => {
          fetchColleagueTasks();
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchColleagueTasks, authLoading, isAuthenticated]);

  const handleMarkDone = useCallback((id: string) => {
    setRemovingId(id);
    setTimeout(() => {
      removeNote(id);
      setRemovingId(null);
    }, 300);
  }, [removeNote]);

  const handleColleagueTaskDone = useCallback(
    async (id: string) => {
      setRemovingColleagueId(id);
      try {
        await deleteDashboardTask(id);
        setTimeout(() => {
          setColleagueTasks((prev) => prev.filter((t) => t.id !== id));
          setRemovingColleagueId(null);
        }, 300);
      } catch {
        setRemovingColleagueId(null);
      }
    },
    []
  );

  const handleColleagueTaskMove = useCallback(
    async (id: string, x: number, y: number) => {
      setColleagueTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, posX: x, posY: y } : t))
      );
      try {
        await updateDashboardTaskPosition(id, x, y);
      } catch {
        // revert on error
        fetchColleagueTasks();
      }
    },
    [fetchColleagueTasks]
  );

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPersonalNote, setIsPersonalNote] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, id: string, currentX: number, currentY: number, personal: boolean) => {
      e.preventDefault();
      setDraggingId(id);
      setIsPersonalNote(personal);
      setDragOffset({
        x: e.clientX - currentX,
        y: e.clientY - currentY,
      });
      lastPosRef.current = { x: currentX, y: currentY };
    },
    []
  );

  useEffect(() => {
    if (!draggingId || !containerRef.current) return;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width - NOTE_SIZE, e.clientX - rect.left - dragOffset.x));
      const y = Math.max(0, Math.min(rect.height - NOTE_SIZE, e.clientY - rect.top - dragOffset.y));
      const rounded = { x: Math.round(x), y: Math.round(y) };
      lastPosRef.current = rounded;

      if (isPersonalNote) {
        updateNotePosition(draggingId, rounded.x, rounded.y);
      } else {
        setColleagueTasks((prev) =>
          prev.map((t) =>
            t.id === draggingId ? { ...t, posX: rounded.x, posY: rounded.y } : t
          )
        );
      }
    };

    const handlePointerUp = () => {
      if (!isPersonalNote && draggingId) {
        const { x, y } = lastPosRef.current;
        handleColleagueTaskMove(draggingId, x, y);
      }
      setDraggingId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingId, dragOffset, isPersonalNote, updateNotePosition, handleColleagueTaskMove]);

  useEffect(() => {
    let mounted = true;
    getApprovedUsers()
      .then((users) => {
        if (mounted) setApprovedUsers(users);
      })
      .catch(() => {
        if (mounted) setApprovedUsers([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const { monthlyItems, dailyItems, stampsEnviarFoto, stampsEsperandoPago, stampsParaEnviar, stampsDeudores, priorityStamps } =
    useMemo(() => {
      let monthly = 0;
      let daily = 0;

      const allStamps: StampWithOrder[] = [];

      for (const order of orders) {
        // Usar fecha de creación real de la orden (created_at) para "cargados en el sistema"
        const createdAt = order.createdAt ? new Date(order.createdAt) : null;
        const orderDateStr = order.orderDate?.split('T')[0];
        const refDate = createdAt ?? (orderDateStr ? new Date(orderDateStr + 'T12:00:00') : null);
        if (!refDate) continue;
        const refYear = refDate.getFullYear();
        const refMonth = refDate.getMonth() + 1;
        const refDay = refDate.getDate();
        const refDateStr = `${refYear}-${String(refMonth).padStart(2, '0')}-${String(refDay).padStart(2, '0')}`;
        const orderInCurrentMonth = refYear === currentYear && refMonth === currentMonth + 1;
        const orderIsToday = refDateStr === todayKey;

        for (const item of order.items) {
          if (orderInCurrentMonth) monthly += 1;
          if (orderIsToday) daily += 1;
          allStamps.push({ order, item });
        }
      }

      const stampsEnviarFoto = allStamps.filter(
        ({ item }) => item.fabricationState === 'HECHO' && item.saleState === 'SEÑADO',
      );
      const stampsEsperandoPago = allStamps.filter(
        ({ item }) => item.fabricationState === 'HECHO' && item.saleState === 'FOTO_ENVIADA',
      );
      const stampsParaEnviar = allStamps.filter(
        ({ item }) =>
          item.fabricationState === 'HECHO' &&
          item.saleState === 'TRANSFERIDO' &&
          item.shippingState === 'SIN_ENVIO',
      );
      const stampsDeudores = allStamps.filter(
        ({ item }) => item.saleState === 'DEUDOR',
      );

      const priorityStamps = allStamps.filter(({ order, item }) => {
        const isPriority = item.isPriority;
        const hasDeadline = !!order.deadlineAt;
        const shipping = item.shippingState;
        const shipped =
          shipping === 'DESPACHADO' || shipping === 'SEGUIMIENTO_ENVIADO';
        return (isPriority || hasDeadline) && !shipped;
      });

      return {
        monthlyItems: monthly,
        dailyItems: daily,
        stampsEnviarFoto,
        stampsEsperandoPago,
        stampsParaEnviar,
        stampsDeudores,
        priorityStamps,
      };
    }, [orders, currentMonth, currentYear, todayKey]);

  // Objetivos fijos (por ahora definidos en código; más adelante pueden venir de BD)
  const MONTHLY_GOAL = 200;
  const DAILY_GOAL = 10;

  const monthlyProgress = MONTHLY_GOAL > 0 ? Math.min((monthlyItems / MONTHLY_GOAL) * 100, 100) : 0;
  const dailyProgress = DAILY_GOAL > 0 ? Math.min((dailyItems / DAILY_GOAL) * 100, 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      <div className="relative flex-1 flex flex-col ml-20 px-8 py-8 space-y-4">
        {/* Primera fila: diseño simple al estilo referencia */}
        <div className="flex flex-col md:flex-row items-center md:items-center justify-between gap-10">
          {/* Objetivos */}
          <div className="flex flex-col justify-center gap-3 text-xs min-w-[220px] h-[120px]">
            <h2 className="text-lg font-semibold tracking-tight">Objetivos</h2>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Ventas totales del mes</span>
                <span className="text-[11px] text-muted-foreground">
                  {monthlyItems.toLocaleString('es-AR')} / {MONTHLY_GOAL.toLocaleString('es-AR')}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-zinc-800 overflow-hidden w-[180px]">
                <div
                  className="absolute inset-y-0 left-0 bg-zinc-300 transition-all"
                  style={{ width: `${monthlyProgress}%` }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Ventas del día</span>
                <span className="text-[11px] text-muted-foreground">
                  {dailyItems.toLocaleString('es-AR')} / {DAILY_GOAL.toLocaleString('es-AR')}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-zinc-800 overflow-hidden w-[180px]">
                <div
                  className="absolute inset-y-0 left-0 bg-red-500 transition-all"
                  style={{ width: `${dailyProgress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Usuarios - cápsula con borde */}
          <div className="flex-1 flex justify-center h-[120px]">
            <div className="flex items-center gap-6 px-6 py-3 rounded-full border border-white/10 bg-black/40 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-sm max-w-full overflow-x-auto">
              {(approvedUsers.length ? approvedUsers : [{ id: user?.id || 'me', name: userName }]).map(
                (u) => (
                  <div
                    key={u.id}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="h-10 w-10 rounded-full border border-white bg-transparent flex items-center justify-center text-sm font-semibold text-white">
                      {u.name
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((n) => n[0]?.toUpperCase())
                        .join('')}
                    </div>
                    <span className="text-[10px] text-muted-foreground max-w-[80px] truncate">
                      {u.name}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Botones add - al mismo nivel que Objetivos y usuarios */}
          <div className="flex items-center gap-2 h-[120px] shrink-0">
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="w-[82px] h-[82px] flex-shrink-0 p-0 border-0 bg-transparent cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-background rounded-lg"
              aria-label="Agregar nota"
            >
              <img
                src={stickyNoteAddSvg}
                alt="Agregar nota"
                className="w-full h-full object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
              />
            </button>
            <button
              type="button"
              onClick={() => setIsAddToColleagueOpen(true)}
              className="w-[82px] h-[82px] flex-shrink-0 p-0 border-0 bg-transparent cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-background rounded-lg"
              aria-label="Asignar tarea a compañero"
            >
              <img
                src={stickyNoteAddWorkmateSvg}
                alt="Asignar tarea a compañero"
                className="w-full h-full object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
              />
            </button>
          </div>
        </div>

        {/* Sticky notes - posición absoluta, flotan sobre el contenido sin generar separación */}
        <div
          ref={containerRef}
          className="absolute left-8 right-8 top-[136px] bottom-0 pointer-events-none z-20"
          style={{ minHeight: 200 }}
        >
            {/* Notas propias (grises) - arrastrables */}
            {notes.map((note) => (
              <div
                key={note.id}
                className={cn(
                  'group absolute w-[82px] h-[82px] transition-all duration-300 ease-out cursor-grab active:cursor-grabbing pointer-events-auto',
                  removingId === note.id && 'scale-0 opacity-0 pointer-events-none',
                  draggingId === note.id && 'z-50 cursor-grabbing',
                )}
                style={{ left: note.x, top: note.y }}
                onPointerDown={(e) => handlePointerDown(e, note.id, note.x, note.y, true)}
              >
                <img
                  src={stickyNoteTaskSvg}
                  alt=""
                  className="w-full h-full object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.4)] pointer-events-none"
                />
                <div className="absolute inset-0 flex items-center justify-center p-2 text-[10px] text-foreground text-center leading-tight overflow-hidden pointer-events-none">
                  <span className="whitespace-pre-wrap line-clamp-3">{note.text}</span>
                </div>
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkDone(note.id);
                    }}
                    className="text-[11px] text-white/90 hover:text-white font-medium tracking-wide"
                  >
                    Hecho
                  </button>
                </div>
              </div>
            ))}
            {/* Tareas de compañeros (amarillas) - arrastrables */}
            {colleagueTasks.map((task, idx) => {
              const rawLeft = task.posX ?? 0;
              const rawTop = task.posY ?? 0;
              // Si una tarea nueva todavía no tiene posición guardada, (0,0) puede quedar tapada.
              // Usamos un fallback para que sea visible y desplazable.
              const isDefaultPos = rawLeft === 0 && rawTop === 0;
              const left = isDefaultPos ? 60 : rawLeft;
              const top = isDefaultPos ? 60 + idx * 95 : rawTop;

              return (
              <div
                key={task.id}
                className={cn(
                  'group absolute w-[82px] h-[82px] transition-all duration-300 ease-out cursor-grab active:cursor-grabbing pointer-events-auto z-20',
                  removingColleagueId === task.id && 'scale-0 opacity-0 pointer-events-none',
                  draggingId === task.id && 'z-50 cursor-grabbing',
                )}
                style={{ left, top }}
                onPointerDown={(e) =>
                  handlePointerDown(e, task.id, left, top, false)
                }
              >
                <img
                  src={stickyNoteTaskWorkmateSvg}
                  alt=""
                  className="w-full h-full object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.4)] pointer-events-none"
                />
                <div className="absolute inset-0 flex items-center justify-center p-2 text-[10px] text-foreground text-center leading-tight overflow-hidden pointer-events-none">
                  <span
                    className="whitespace-pre-wrap line-clamp-3"
                    title={task.creadoPorNombre ? `De ${task.creadoPorNombre}` : undefined}
                  >
                    {task.texto}
                  </span>
                </div>
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleColleagueTaskDone(task.id);
                    }}
                    className="text-[11px] text-white/90 hover:text-white font-medium tracking-wide"
                  >
                    Hecho
                  </button>
                </div>
              </div>
              );
            })}
            {/* Formulario agregar nota propia (cuando está activo) */}
            {isAdding ? (
              <div
                className="absolute left-0 top-0 w-[140px] h-[140px] animate-in fade-in zoom-in-95 duration-300 overflow-hidden z-40 pointer-events-auto"
                style={{ animationDuration: '300ms' }}
              >
                <img
                  src={stickyNoteTaskSvg}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
                <div className="absolute inset-[10%] flex flex-col min-w-0 overflow-hidden">
                  <textarea
                    autoFocus
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    placeholder="Escribí acá..."
                    className="flex-1 min-h-0 w-full min-w-0 resize-none bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/80 border-0 outline-none focus:ring-0"
                    rows={4}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsAdding(false);
                        setDraftText('');
                      }
                    }}
                  />
                  <div className="flex gap-3 justify-end pt-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdding(false);
                        setDraftText('');
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (draftText.trim()) {
                          addNote(draftText.trim());
                          setDraftText('');
                          setIsAdding(false);
                        }
                      }}
                      className="text-[10px] text-foreground hover:text-white transition-colors font-medium"
                    >
                      Listo
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
        </div>

        <AddTaskToColleagueDialog
          open={isAddToColleagueOpen}
          onOpenChange={setIsAddToColleagueOpen}
          colleagues={approvedUsers.length ? approvedUsers : [{ id: user?.id || 'me', name: userName }]}
          currentUserId={user?.id || ''}
          onTaskCreated={fetchColleagueTasks}
        />

        {/* Mensaje de bienvenida */}
        <div className="text-center py-6 space-y-2">
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Visualizador del día
          </p>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            Hola {userName.split(' ')[0]}!
          </h1>
          <p className="text-2xl md:text-3xl text-muted-foreground">
            Bienvenido a Alcohn.
          </p>
        </div>

        {/* Sellos listos */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Sellos Listos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <SellosColumn
              title="Enviar foto"
              subtitle="Hecho · Venta: Señado"
              orders={groupStampsByOrder(stampsEnviarFoto)}
            />
            <SellosColumn
              title="Esperando pago"
              subtitle="Hecho · Venta: Foto enviada"
              orders={groupStampsByOrder(stampsEsperandoPago)}
            />
            <SellosColumn
              title="Para enviar"
              subtitle="Hecho · Venta: Transferido · Envío: Sin Envío"
              orders={groupStampsByOrder(stampsParaEnviar)}
            />
            <SellosColumn
              title="Deudores"
              subtitle="Venta: Deudor"
              orders={groupStampsByOrder(stampsDeudores)}
            />
          </div>
        </section>

        {/* Prioritarios y con fecha límite */}
        <section className="space-y-3 pb-4">
          <h2 className="text-lg font-semibold tracking-tight">Pedidos prioritarios y con fecha límite</h2>
          <Card className="border border-white/10 bg-card/50">
            <CardContent className="p-4 pt-2">
              {groupStampsByOrder(priorityStamps).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay pedidos prioritarios ni con fecha límite pendientes de envío.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {groupStampsByOrder(priorityStamps).map(({ order, items }) => {
                    const firstItem = items[0];
                    const thumb = firstItem.files?.vectorPreviewUrl || firstItem.files?.baseUrl;
                    return (
                      <div
                        key={order.id}
                        className="rounded-lg border border-white/10 bg-background/80 px-3 py-2 text-xs"
                      >
                        <div className="flex flex-col gap-2">
                          <div
                            className={cn(
                              'w-14 h-14 rounded border border-white/10 overflow-hidden flex-shrink-0 bg-muted',
                            )}
                          >
                            {thumb ? (
                              <img src={thumb} alt="" className="w-full h-full object-contain" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                                —
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{firstItem.designName}</p>
                            {order.deadlineAt && (
                              <p className="text-[11px] text-muted-foreground">
                                Límite:{' '}
                                {new Date(order.deadlineAt).toLocaleDateString('es-AR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <Toaster />
    </div>
  );
}

interface SellosColumnProps {
  title: string;
  subtitle: string;
  orders: OrderWithItems[];
}

function SellosColumn({ title, subtitle, orders }: SellosColumnProps) {
  return (
    <Card className="border border-white/10 bg-card/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{title}</span>
          <Badge variant="outline" className="text-[11px] border-white/20 text-muted-foreground">
            {orders.length}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="pt-0">
        {orders.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4">
            No hay pedidos en este estado.
          </p>
        ) : (
          <div className="h-40 pr-2 overflow-y-auto">
            <div className="space-y-2 text-xs">
              {orders.map(({ order, items }) => {
                const firstItem = items[0];
                return (
                  <div
                    key={order.id}
                    className="rounded-md border border-white/10 bg-background/80 px-3 py-2 space-y-2"
                  >
                    <div className="flex gap-2 items-start">
                      <div className="flex gap-0.5 shrink-0">
                        {items.map((item) => {
                          const thumb = item.files?.vectorPreviewUrl || item.files?.baseUrl;
                          const isVectorPreview = !!item.files?.vectorPreviewUrl;
                          return (
                            <div
                              key={item.id}
                              className={cn(
                                'w-8 h-8 rounded border border-white/10 overflow-hidden flex-shrink-0',
                                isVectorPreview ? 'bg-white' : 'bg-muted',
                              )}
                            >
                              {thumb ? (
                                <img src={thumb} alt="" className="w-full h-full object-contain" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">—</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{firstItem.designName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {order.customer.firstName} {order.customer.lastName}
                        </p>
                        {order.deadlineAt && (
                          <p className="text-[11px] text-muted-foreground">
                            Límite: {new Date(order.deadlineAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

